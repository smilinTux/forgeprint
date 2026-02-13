# Relational Database Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing a production-grade relational database management system. It covers the query execution pipeline, storage engine internals, buffer pool management, WAL implementation, lock manager, connection handling, and catalog management — the foundational subsystems that determine correctness, performance, and reliability.

## Architectural Foundations

### 1. System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CLIENT CONNECTIONS                                │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                               │
│  │Client│  │Client│  │Client│  │Client│                               │
│  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘                               │
│     │         │         │         │                                     │
│     └─────────┴─────────┴─────────┘                                     │
│                     │                                                    │
│  ┌──────────────────▼──────────────────┐                                │
│  │       CONNECTION MANAGER            │  Protocol parsing, auth,       │
│  │  (accept, authenticate, dispatch)   │  session state, pooling        │
│  └──────────────────┬──────────────────┘                                │
│                     │                                                    │
│  ┌──────────────────▼──────────────────┐                                │
│  │          SQL FRONTEND               │                                │
│  │  ┌────────┐ ┌────────┐ ┌────────┐  │                                │
│  │  │ Lexer  │→│ Parser │→│Semantic│  │  SQL text → validated AST       │
│  │  │        │ │        │ │Analyzer│  │                                │
│  │  └────────┘ └────────┘ └────────┘  │                                │
│  └──────────────────┬──────────────────┘                                │
│                     │                                                    │
│  ┌──────────────────▼──────────────────┐                                │
│  │        QUERY OPTIMIZER              │                                │
│  │  ┌──────────┐  ┌───────────────┐   │  Logical plan → physical plan  │
│  │  │ Rewriter │→ │ Cost-Based    │   │                                │
│  │  │          │  │ Optimizer     │   │                                │
│  │  └──────────┘  └───────┬───────┘   │                                │
│  │                        │            │                                │
│  │                 ┌──────▼──────┐     │                                │
│  │                 │ Statistics  │     │                                │
│  │                 │ & Catalog   │     │                                │
│  │                 └─────────────┘     │                                │
│  └──────────────────┬──────────────────┘                                │
│                     │                                                    │
│  ┌──────────────────▼──────────────────┐                                │
│  │         QUERY EXECUTOR              │                                │
│  │  Volcano iterator / vectorized      │  Execute physical plan         │
│  │  ┌────┐┌────┐┌──────┐┌─────┐       │                                │
│  │  │Scan││Join││Agg   ││Sort │ ...   │                                │
│  │  └────┘└────┘└──────┘└─────┘       │                                │
│  └──────────┬──────────────────────────┘                                │
│             │                                                            │
│  ┌──────────▼──────────────────────────────────────────────────┐        │
│  │                   STORAGE SUBSYSTEM                          │        │
│  │  ┌────────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐ │        │
│  │  │Buffer Pool │  │ WAL      │  │ Lock      │  │ Tx       │ │        │
│  │  │ Manager    │  │ Manager  │  │ Manager   │  │ Manager  │ │        │
│  │  └─────┬──────┘  └────┬─────┘  └───────────┘  └──────────┘ │        │
│  │        │               │                                     │        │
│  │  ┌─────▼──────┐  ┌────▼─────┐                               │        │
│  │  │ Disk I/O   │  │ WAL Files│                               │        │
│  │  │ (data files│  │          │                               │        │
│  │  │  indexes)  │  │          │                               │        │
│  │  └────────────┘  └──────────┘                               │        │
│  └─────────────────────────────────────────────────────────────┘        │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │               BACKGROUND WORKERS                             │        │
│  │  ┌───────────┐ ┌────────────┐ ┌──────────┐ ┌────────────┐  │        │
│  │  │Checkpointer│ │Autovacuum  │ │Stats     │ │WAL Sender  │  │        │
│  │  │           │ │            │ │Collector │ │(replication)│  │        │
│  │  └───────────┘ └────────────┘ └──────────┘ └────────────┘  │        │
│  └─────────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2. Process/Thread Model Options

#### Option A: Process-Per-Connection (PostgreSQL Model)
```rust
struct DatabaseServer {
    listener: TcpListener,
    shared_memory: SharedMemorySegment,  // Buffer pool, WAL buffers, lock table
    postmaster_pid: Pid,
}

impl DatabaseServer {
    fn accept_loop(&self) {
        loop {
            let (stream, addr) = self.listener.accept().unwrap();
            
            // Fork a new process for each connection
            match unsafe { fork() } {
                ForkResult::Parent { child_pid } => {
                    // Postmaster tracks child processes
                    self.register_backend(child_pid, addr);
                }
                ForkResult::Child => {
                    // Backend process: handles one client connection
                    let mut backend = BackendProcess::new(
                        stream,
                        self.shared_memory.clone(),
                    );
                    backend.run();  // Runs until client disconnects
                    std::process::exit(0);
                }
            }
        }
    }
}

struct BackendProcess {
    client_stream: TcpStream,
    shared_memory: SharedMemorySegment,
    session_state: SessionState,
    transaction_state: Option<TransactionState>,
}

impl BackendProcess {
    fn run(&mut self) {
        self.authenticate().unwrap();
        
        loop {
            // Read and process one SQL command at a time
            let message = self.read_protocol_message();
            
            match message {
                Message::Query(sql) => {
                    let result = self.process_query(&sql);
                    self.send_result(result);
                }
                Message::Parse(stmt) => self.handle_extended_query_parse(stmt),
                Message::Bind(params) => self.handle_extended_query_bind(params),
                Message::Execute => self.handle_extended_query_execute(),
                Message::Terminate => break,
                _ => self.handle_protocol_message(message),
            }
        }
    }
}
```

**Shared Memory Layout**:
```
┌──────────────────────────────────────────────────────────┐
│                   SHARED MEMORY SEGMENT                   │
│                                                           │
│  ┌─────────────────────────────────────┐                 │
│  │         Buffer Pool                  │  ~75% of shared │
│  │   [Page][Page][Page]...[Page]        │  memory          │
│  │   Buffer descriptors + hash table    │                 │
│  └─────────────────────────────────────┘                 │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐                      │
│  │ WAL Buffers  │  │ Lock Table   │                      │
│  │ (ring buffer)│  │ (hash table) │                      │
│  └──────────────┘  └──────────────┘                      │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Proc Array   │  │ CLOG/Commit  │  │ Subtransaction│   │
│  │ (per-backend │  │ Log          │  │ Log           │   │
│  │  status)     │  │              │  │               │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘
```

#### Option B: Thread Pool (MySQL Model)
```rust
struct DatabaseServer {
    listener: TcpListener,
    thread_pool: ThreadPool,
    global_state: Arc<GlobalState>,
}

struct GlobalState {
    buffer_pool: BufferPool,
    wal_manager: WalManager,
    lock_manager: LockManager,
    catalog: Catalog,
    connection_manager: ConnectionManager,
}

impl DatabaseServer {
    fn run(&self) {
        loop {
            let (stream, addr) = self.listener.accept().unwrap();
            let state = self.global_state.clone();
            
            self.thread_pool.execute(move || {
                let mut session = Session::new(stream, state);
                session.authenticate().unwrap();
                
                loop {
                    match session.read_command() {
                        Ok(Command::Query(sql)) => {
                            let result = session.execute_query(&sql);
                            session.send_result(result);
                        }
                        Ok(Command::Quit) | Err(_) => break,
                    }
                }
            });
        }
    }
}
```

### 3. Query Execution Pipeline — Deep Dive

#### Stage 1: Lexical Analysis (Tokenizer)
```rust
struct Lexer<'a> {
    input: &'a str,
    position: usize,
    line: u32,
    column: u32,
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    // Keywords
    Select, From, Where, Insert, Update, Delete, Create, Drop, Alter,
    Join, Inner, Left, Right, Full, Outer, Cross, On, Using,
    Group, By, Having, Order, Asc, Desc, Limit, Offset,
    And, Or, Not, In, Between, Like, Is, Null, As, Distinct,
    Begin, Commit, Rollback, Savepoint,
    
    // Literals
    Integer(i64),
    Float(f64),
    String(String),
    Boolean(bool),
    
    // Identifiers
    Identifier(String),
    QuotedIdentifier(String),
    
    // Operators
    Eq, NotEq, Lt, Gt, LtEq, GtEq,
    Plus, Minus, Star, Slash, Percent,
    DoubleColon,  // :: cast operator
    
    // Punctuation
    LeftParen, RightParen, Comma, Semicolon, Dot,
    
    // Special
    Parameter(u32),  // $1, $2, ...
    Eof,
}

impl<'a> Lexer<'a> {
    fn next_token(&mut self) -> Result<Token, LexError> {
        self.skip_whitespace_and_comments();
        
        if self.position >= self.input.len() {
            return Ok(Token::Eof);
        }
        
        let ch = self.current_char();
        
        match ch {
            'a'..='z' | 'A'..='Z' | '_' => self.lex_identifier_or_keyword(),
            '0'..='9' => self.lex_number(),
            '\'' => self.lex_string_literal(),
            '"' => self.lex_quoted_identifier(),
            '$' => self.lex_parameter(),
            '(' => { self.advance(); Ok(Token::LeftParen) }
            ')' => { self.advance(); Ok(Token::RightParen) }
            ',' => { self.advance(); Ok(Token::Comma) }
            ';' => { self.advance(); Ok(Token::Semicolon) }
            '.' => { self.advance(); Ok(Token::Dot) }
            '+' => { self.advance(); Ok(Token::Plus) }
            '-' => self.lex_minus_or_comment(),
            '*' => { self.advance(); Ok(Token::Star) }
            '/' => self.lex_slash_or_comment(),
            '=' => { self.advance(); Ok(Token::Eq) }
            '<' => self.lex_less_than(),
            '>' => self.lex_greater_than(),
            '!' => self.lex_not_equal(),
            ':' => self.lex_double_colon(),
            _ => Err(LexError::UnexpectedChar(ch, self.line, self.column)),
        }
    }
    
    fn lex_identifier_or_keyword(&mut self) -> Result<Token, LexError> {
        let start = self.position;
        while self.position < self.input.len() && 
              (self.current_char().is_alphanumeric() || self.current_char() == '_') {
            self.advance();
        }
        
        let word = &self.input[start..self.position];
        
        // Check if it's a keyword (case-insensitive)
        match word.to_uppercase().as_str() {
            "SELECT" => Ok(Token::Select),
            "FROM" => Ok(Token::From),
            "WHERE" => Ok(Token::Where),
            "INSERT" => Ok(Token::Insert),
            "UPDATE" => Ok(Token::Update),
            "DELETE" => Ok(Token::Delete),
            "JOIN" => Ok(Token::Join),
            "TRUE" => Ok(Token::Boolean(true)),
            "FALSE" => Ok(Token::Boolean(false)),
            "NULL" => Ok(Token::Null),
            // ... all other keywords
            _ => Ok(Token::Identifier(word.to_string())),
        }
    }
}
```

#### Stage 2: Parser (AST Construction)
```rust
struct Parser {
    tokens: Vec<Token>,
    position: usize,
}

#[derive(Debug, Clone)]
enum Statement {
    Select(SelectStatement),
    Insert(InsertStatement),
    Update(UpdateStatement),
    Delete(DeleteStatement),
    CreateTable(CreateTableStatement),
    CreateIndex(CreateIndexStatement),
    Begin(BeginStatement),
    Commit,
    Rollback(Option<String>),  // Optional savepoint name
    Explain(Box<Statement>, bool),  // (statement, analyze?)
}

#[derive(Debug, Clone)]
struct SelectStatement {
    distinct: bool,
    columns: Vec<SelectItem>,
    from: Vec<TableRef>,
    joins: Vec<JoinClause>,
    where_clause: Option<Expr>,
    group_by: Vec<Expr>,
    having: Option<Expr>,
    order_by: Vec<OrderByItem>,
    limit: Option<Expr>,
    offset: Option<Expr>,
    ctes: Vec<CteDefinition>,
    set_op: Option<(SetOp, Box<SelectStatement>)>,
    for_update: bool,
}

#[derive(Debug, Clone)]
enum Expr {
    Column(ColumnRef),                          // table.column
    Literal(Value),                             // 42, 'hello', TRUE
    BinaryOp(Box<Expr>, BinOp, Box<Expr>),     // a + b, x > 5
    UnaryOp(UnaryOp, Box<Expr>),                // NOT x, -5
    Function(String, Vec<Expr>),                // COUNT(*), LOWER(name)
    Subquery(Box<SelectStatement>),             // (SELECT ...)
    Exists(Box<SelectStatement>),               // EXISTS (SELECT ...)
    InList(Box<Expr>, Vec<Expr>),               // x IN (1, 2, 3)
    InSubquery(Box<Expr>, Box<SelectStatement>),// x IN (SELECT ...)
    Between(Box<Expr>, Box<Expr>, Box<Expr>),   // x BETWEEN a AND b
    Case(Vec<WhenClause>, Option<Box<Expr>>),   // CASE WHEN ... THEN ... ELSE ...
    Cast(Box<Expr>, DataType),                  // CAST(x AS int)
    IsNull(Box<Expr>, bool),                    // x IS [NOT] NULL
    Like(Box<Expr>, Box<Expr>),                 // x LIKE '%pattern%'
    Aggregate(AggFunc, Box<Expr>, bool),        // COUNT(DISTINCT x)
    WindowFunction(WindowFunc),                 // ROW_NUMBER() OVER (...)
    Parameter(u32),                             // $1
}

impl Parser {
    fn parse_select(&mut self) -> Result<SelectStatement, ParseError> {
        // Parse optional CTEs
        let ctes = if self.peek() == &Token::With {
            self.parse_cte_list()?
        } else {
            vec![]
        };
        
        self.expect(Token::Select)?;
        
        let distinct = self.consume_if(Token::Distinct);
        
        // Parse select list
        let columns = self.parse_select_list()?;
        
        // Parse FROM clause
        self.expect(Token::From)?;
        let from = self.parse_table_refs()?;
        
        // Parse optional JOIN clauses
        let joins = self.parse_joins()?;
        
        // Parse optional WHERE
        let where_clause = if self.consume_if(Token::Where) {
            Some(self.parse_expr()?)
        } else {
            None
        };
        
        // Parse optional GROUP BY
        let group_by = if self.consume_if(Token::Group) {
            self.expect(Token::By)?;
            self.parse_expr_list()?
        } else {
            vec![]
        };
        
        // Parse optional HAVING
        let having = if self.consume_if(Token::Having) {
            Some(self.parse_expr()?)
        } else {
            None
        };
        
        // Parse optional ORDER BY
        let order_by = if self.consume_if(Token::Order) {
            self.expect(Token::By)?;
            self.parse_order_by_list()?
        } else {
            vec![]
        };
        
        // Parse optional LIMIT/OFFSET
        let limit = if self.consume_if(Token::Limit) {
            Some(self.parse_expr()?)
        } else {
            None
        };
        
        let offset = if self.consume_if(Token::Offset) {
            Some(self.parse_expr()?)
        } else {
            None
        };
        
        Ok(SelectStatement {
            distinct, columns, from, joins, where_clause,
            group_by, having, order_by, limit, offset, ctes,
            set_op: None, for_update: false,
        })
    }
    
    /// Expression parser using Pratt parsing (precedence climbing)
    fn parse_expr(&mut self) -> Result<Expr, ParseError> {
        self.parse_expr_bp(0)  // Start at lowest binding power
    }
    
    fn parse_expr_bp(&mut self, min_bp: u8) -> Result<Expr, ParseError> {
        // Parse prefix/atom
        let mut lhs = self.parse_prefix()?;
        
        loop {
            // Check for infix operator
            let (op, left_bp, right_bp) = match self.peek_infix_op() {
                Some(op_info) => op_info,
                None => break,
            };
            
            if left_bp < min_bp {
                break;
            }
            
            self.advance(); // consume operator
            let rhs = self.parse_expr_bp(right_bp)?;
            lhs = Expr::BinaryOp(Box::new(lhs), op, Box::new(rhs));
        }
        
        Ok(lhs)
    }
}
```

#### Stage 3: Semantic Analysis
```rust
struct SemanticAnalyzer<'a> {
    catalog: &'a Catalog,
    current_schema: String,
    scope_stack: Vec<NameScope>,
}

struct NameScope {
    tables: HashMap<String, ResolvedTable>,  // alias → table info
    columns: HashMap<String, ResolvedColumn>,
}

impl<'a> SemanticAnalyzer<'a> {
    fn analyze_select(&mut self, stmt: &mut SelectStatement) -> Result<ResolvedSelect, SemanticError> {
        // 1. Resolve FROM clause — register table names in scope
        let resolved_tables = self.resolve_from_clause(&stmt.from)?;
        self.push_scope_with_tables(&resolved_tables);
        
        // 2. Resolve JOIN clauses
        for join in &mut stmt.joins {
            let resolved_join_table = self.resolve_table_ref(&join.table)?;
            self.add_table_to_scope(&resolved_join_table);
            if let Some(ref mut on_expr) = join.on_condition {
                self.resolve_expr(on_expr)?;
            }
        }
        
        // 3. Resolve WHERE clause — check column names exist, resolve types
        if let Some(ref mut where_expr) = stmt.where_clause {
            self.resolve_expr(where_expr)?;
            self.check_type_is_boolean(where_expr)?;
        }
        
        // 4. Resolve SELECT list
        let resolved_columns = self.resolve_select_list(&mut stmt.columns)?;
        
        // 5. Resolve GROUP BY — check that non-aggregated select columns
        //    appear in GROUP BY
        if !stmt.group_by.is_empty() {
            self.validate_group_by(&resolved_columns, &stmt.group_by)?;
        }
        
        // 6. Check permissions
        for table in &resolved_tables {
            self.check_permission(table.oid, Permission::Select)?;
        }
        
        self.pop_scope();
        
        Ok(ResolvedSelect {
            columns: resolved_columns,
            tables: resolved_tables,
            // ...
        })
    }
    
    fn resolve_expr(&mut self, expr: &mut Expr) -> Result<DataType, SemanticError> {
        match expr {
            Expr::Column(ref mut col_ref) => {
                // Look up column in current scope
                let resolved = self.resolve_column_name(&col_ref.table, &col_ref.column)?;
                col_ref.resolved_oid = Some(resolved.table_oid);
                col_ref.resolved_attnum = Some(resolved.attnum);
                Ok(resolved.data_type)
            }
            Expr::Literal(val) => Ok(val.data_type()),
            Expr::BinaryOp(lhs, op, rhs) => {
                let lhs_type = self.resolve_expr(lhs)?;
                let rhs_type = self.resolve_expr(rhs)?;
                self.resolve_binary_op_type(*op, lhs_type, rhs_type)
            }
            Expr::Function(name, args) => {
                let arg_types: Vec<DataType> = args.iter_mut()
                    .map(|a| self.resolve_expr(a))
                    .collect::<Result<_, _>>()?;
                self.resolve_function(name, &arg_types)
            }
            // ... handle all expression types
            _ => todo!(),
        }
    }
}
```

#### Stage 4: Query Optimization
```rust
struct QueryOptimizer {
    catalog: Arc<Catalog>,
    cost_model: CostModel,
}

#[derive(Debug, Clone)]
enum LogicalPlan {
    Scan { table: TableRef, filter: Option<Expr> },
    Projection { input: Box<LogicalPlan>, columns: Vec<Expr> },
    Filter { input: Box<LogicalPlan>, predicate: Expr },
    Join { left: Box<LogicalPlan>, right: Box<LogicalPlan>, 
           join_type: JoinType, condition: Expr },
    Aggregate { input: Box<LogicalPlan>, group_by: Vec<Expr>, 
                aggregates: Vec<AggExpr> },
    Sort { input: Box<LogicalPlan>, order_by: Vec<OrderByItem> },
    Limit { input: Box<LogicalPlan>, count: u64, offset: u64 },
}

#[derive(Debug, Clone)]
enum PhysicalPlan {
    SeqScan { table: TableRef, filter: Option<Expr> },
    IndexScan { table: TableRef, index: IndexRef, 
                scan_key: Vec<ScanKeyEntry>, filter: Option<Expr> },
    IndexOnlyScan { index: IndexRef, scan_key: Vec<ScanKeyEntry> },
    BitmapScan { table: TableRef, bitmap_plans: Vec<Box<PhysicalPlan>> },
    NestedLoopJoin { outer: Box<PhysicalPlan>, inner: Box<PhysicalPlan>,
                     condition: Expr },
    HashJoin { build: Box<PhysicalPlan>, probe: Box<PhysicalPlan>,
               hash_keys: Vec<(Expr, Expr)> },
    MergeJoin { left: Box<PhysicalPlan>, right: Box<PhysicalPlan>,
                merge_keys: Vec<(Expr, Expr)> },
    HashAggregate { input: Box<PhysicalPlan>, group_by: Vec<Expr>,
                    aggregates: Vec<AggExpr> },
    SortAggregate { input: Box<PhysicalPlan>, group_by: Vec<Expr>,
                    aggregates: Vec<AggExpr> },
    Sort { input: Box<PhysicalPlan>, order_by: Vec<OrderByItem> },
    Materialize { input: Box<PhysicalPlan> },
    Limit { input: Box<PhysicalPlan>, count: u64, offset: u64 },
}

impl QueryOptimizer {
    fn optimize(&self, logical: LogicalPlan) -> PhysicalPlan {
        // Phase 1: Logical rewriting
        let rewritten = self.apply_rewrite_rules(logical);
        
        // Phase 2: Generate candidate physical plans
        let candidates = self.generate_physical_plans(&rewritten);
        
        // Phase 3: Cost each candidate and select cheapest
        let best = candidates.into_iter()
            .min_by(|a, b| {
                let cost_a = self.cost_model.estimate_cost(a);
                let cost_b = self.cost_model.estimate_cost(b);
                cost_a.total().partial_cmp(&cost_b.total()).unwrap()
            })
            .unwrap();
        
        best
    }
    
    fn apply_rewrite_rules(&self, plan: LogicalPlan) -> LogicalPlan {
        let mut plan = plan;
        
        // Rule 1: Predicate pushdown
        plan = self.push_predicates_down(plan);
        
        // Rule 2: Projection pushdown
        plan = self.push_projections_down(plan);
        
        // Rule 3: Subquery decorrelation
        plan = self.decorrelate_subqueries(plan);
        
        // Rule 4: Constant folding
        plan = self.fold_constants(plan);
        
        // Rule 5: Simplify expressions (x AND TRUE → x)
        plan = self.simplify_expressions(plan);
        
        plan
    }
    
    fn generate_join_plans(&self, left: &LogicalPlan, right: &LogicalPlan,
                           condition: &Expr) -> Vec<PhysicalPlan> {
        let mut plans = Vec::new();
        
        let left_plan = self.optimize_subtree(left);
        let right_plan = self.optimize_subtree(right);
        
        let left_rows = self.estimate_cardinality(left);
        let right_rows = self.estimate_cardinality(right);
        
        // Candidate 1: Nested Loop Join
        plans.push(PhysicalPlan::NestedLoopJoin {
            outer: Box::new(left_plan.clone()),
            inner: Box::new(right_plan.clone()),
            condition: condition.clone(),
        });
        
        // Candidate 2: Hash Join (only for equi-joins)
        if let Some(hash_keys) = self.extract_equi_join_keys(condition) {
            // Build on smaller side
            let (build, probe) = if left_rows < right_rows {
                (left_plan.clone(), right_plan.clone())
            } else {
                (right_plan.clone(), left_plan.clone())
            };
            
            plans.push(PhysicalPlan::HashJoin {
                build: Box::new(build),
                probe: Box::new(probe),
                hash_keys,
            });
        }
        
        // Candidate 3: Merge Join (if inputs can be sorted efficiently)
        if let Some(merge_keys) = self.extract_equi_join_keys(condition) {
            plans.push(PhysicalPlan::MergeJoin {
                left: Box::new(PhysicalPlan::Sort {
                    input: Box::new(left_plan.clone()),
                    order_by: merge_keys.iter().map(|(k, _)| k.clone().into()).collect(),
                }),
                right: Box::new(PhysicalPlan::Sort {
                    input: Box::new(right_plan.clone()),
                    order_by: merge_keys.iter().map(|(_, k)| k.clone().into()).collect(),
                }),
                merge_keys,
            });
        }
        
        plans
    }
}

struct CostModel {
    seq_page_cost: f64,       // 1.0 (baseline)
    random_page_cost: f64,    // 4.0 (random I/O is 4x slower)
    cpu_tuple_cost: f64,      // 0.01
    cpu_index_tuple_cost: f64,// 0.005
    cpu_operator_cost: f64,   // 0.0025
    effective_cache_size: u64,// Pages likely in OS cache
}

impl CostModel {
    fn estimate_cost(&self, plan: &PhysicalPlan) -> Cost {
        match plan {
            PhysicalPlan::SeqScan { table, filter } => {
                let stats = self.catalog.get_table_stats(table);
                let pages = stats.relpages as f64;
                let tuples = stats.reltuples;
                
                let io_cost = pages * self.seq_page_cost;
                let cpu_cost = tuples * self.cpu_tuple_cost;
                let filter_cost = if filter.is_some() {
                    tuples * self.cpu_operator_cost
                } else { 0.0 };
                
                Cost {
                    startup: 0.0,
                    total: io_cost + cpu_cost + filter_cost,
                    rows: if filter.is_some() {
                        tuples * self.estimate_selectivity(filter.as_ref().unwrap(), table)
                    } else {
                        tuples
                    },
                }
            }
            
            PhysicalPlan::IndexScan { table, index, scan_key, filter } => {
                let stats = self.catalog.get_table_stats(table);
                let index_stats = self.catalog.get_index_stats(index);
                let selectivity = self.estimate_scan_key_selectivity(scan_key, &stats);
                let matched_tuples = stats.reltuples * selectivity;
                
                // Index traversal cost
                let tree_height = (index_stats.relpages as f64).log(200.0).ceil();
                let index_io = tree_height + (matched_tuples / 200.0); // leaf pages
                
                // Heap fetches (random I/O)
                let heap_fetches = matched_tuples;
                let correlation = stats.correlation.abs(); // How sorted is data?
                let heap_io = heap_fetches * (
                    correlation * self.seq_page_cost +
                    (1.0 - correlation) * self.random_page_cost
                );
                
                Cost {
                    startup: index_io * self.random_page_cost,
                    total: index_io * self.random_page_cost + heap_io +
                           matched_tuples * self.cpu_tuple_cost,
                    rows: matched_tuples,
                }
            }
            
            PhysicalPlan::HashJoin { build, probe, .. } => {
                let build_cost = self.estimate_cost(build);
                let probe_cost = self.estimate_cost(probe);
                
                // Build hash table cost
                let hash_build = build_cost.rows * self.cpu_operator_cost;
                // Probe cost
                let hash_probe = probe_cost.rows * self.cpu_operator_cost;
                
                Cost {
                    startup: build_cost.total + hash_build,
                    total: build_cost.total + probe_cost.total + hash_build + hash_probe,
                    rows: build_cost.rows * probe_cost.rows * 0.1, // Default join selectivity
                }
            }
            
            _ => Cost::default(),
        }
    }
    
    fn estimate_selectivity(&self, expr: &Expr, table: &TableRef) -> f64 {
        match expr {
            Expr::BinaryOp(col, BinOp::Eq, Expr::Literal(val)) => {
                // Use MCV (Most Common Values) or histogram
                let stats = self.catalog.get_column_stats(table, col);
                if let Some(mcv_freq) = stats.mcv_frequency(val) {
                    mcv_freq
                } else {
                    1.0 / stats.n_distinct as f64
                }
            }
            Expr::BinaryOp(_, BinOp::Lt, _) => 0.3333,  // Default range selectivity
            Expr::BinaryOp(left, BinOp::And, right) => {
                // Assume independence
                self.estimate_selectivity(left, table) *
                self.estimate_selectivity(right, table)
            }
            _ => 0.5, // Default selectivity
        }
    }
}
```

#### Stage 5: Query Execution (Volcano Iterator Model)
```rust
trait ExecutorNode: Send {
    fn open(&mut self) -> Result<(), ExecError>;
    fn next(&mut self) -> Result<Option<Row>, ExecError>;
    fn close(&mut self) -> Result<(), ExecError>;
    fn explain(&self) -> PlanNode;
}

struct SeqScanExecutor {
    table: TableHandle,
    filter: Option<CompiledExpr>,
    current_page: u32,
    current_slot: u16,
    buffer_pool: Arc<BufferPool>,
    snapshot: Snapshot,
}

impl ExecutorNode for SeqScanExecutor {
    fn open(&mut self) -> Result<(), ExecError> {
        self.current_page = 0;
        self.current_slot = 0;
        Ok(())
    }
    
    fn next(&mut self) -> Result<Option<Row>, ExecError> {
        loop {
            // Get current page from buffer pool
            let page = self.buffer_pool.fetch_page(
                self.table.relation_id(),
                self.current_page,
            )?;
            
            // Try to get next tuple from current page
            while self.current_slot < page.tuple_count() {
                let tuple = page.get_tuple(self.current_slot);
                self.current_slot += 1;
                
                // Check MVCC visibility
                if !self.snapshot.is_visible(&tuple.header) {
                    continue;
                }
                
                // Apply filter predicate
                if let Some(ref filter) = self.filter {
                    if !filter.evaluate(&tuple)?.as_bool() {
                        continue;
                    }
                }
                
                return Ok(Some(tuple.to_row()));
            }
            
            // Move to next page
            self.buffer_pool.release_page(page);
            self.current_page += 1;
            self.current_slot = 0;
            
            if self.current_page >= self.table.total_pages() {
                return Ok(None); // End of table
            }
        }
    }
    
    fn close(&mut self) -> Result<(), ExecError> {
        Ok(())
    }
}

struct HashJoinExecutor {
    build_child: Box<dyn ExecutorNode>,
    probe_child: Box<dyn ExecutorNode>,
    hash_keys: Vec<(usize, usize)>,  // (build_col, probe_col)
    hash_table: HashMap<u64, Vec<Row>>,
    current_matches: Vec<Row>,
    current_match_idx: usize,
    current_probe_row: Option<Row>,
    built: bool,
}

impl ExecutorNode for HashJoinExecutor {
    fn open(&mut self) -> Result<(), ExecError> {
        self.build_child.open()?;
        self.probe_child.open()?;
        Ok(())
    }
    
    fn next(&mut self) -> Result<Option<Row>, ExecError> {
        // Build phase: read all rows from build side into hash table
        if !self.built {
            while let Some(row) = self.build_child.next()? {
                let hash = self.compute_hash_key(&row, Side::Build);
                self.hash_table.entry(hash).or_default().push(row);
            }
            self.built = true;
        }
        
        // Return buffered matches from current probe row
        if self.current_match_idx < self.current_matches.len() {
            let build_row = &self.current_matches[self.current_match_idx];
            self.current_match_idx += 1;
            let probe_row = self.current_probe_row.as_ref().unwrap();
            return Ok(Some(self.join_rows(build_row, probe_row)));
        }
        
        // Probe phase: for each probe row, look up in hash table
        loop {
            let probe_row = match self.probe_child.next()? {
                Some(row) => row,
                None => return Ok(None),
            };
            
            let hash = self.compute_hash_key(&probe_row, Side::Probe);
            
            if let Some(matches) = self.hash_table.get(&hash) {
                self.current_matches = matches.clone();
                self.current_match_idx = 1;
                self.current_probe_row = Some(probe_row.clone());
                return Ok(Some(self.join_rows(&matches[0], &probe_row)));
            }
            // No match, continue to next probe row
        }
    }
    
    fn close(&mut self) -> Result<(), ExecError> {
        self.build_child.close()?;
        self.probe_child.close()?;
        self.hash_table.clear();
        Ok(())
    }
}

struct HashAggregateExecutor {
    child: Box<dyn ExecutorNode>,
    group_by_cols: Vec<usize>,
    aggregates: Vec<AggregateState>,
    hash_table: HashMap<Vec<Value>, Vec<AccumulatorState>>,
    result_iter: Option<std::collections::hash_map::IntoIter<Vec<Value>, Vec<AccumulatorState>>>,
    built: bool,
}

impl ExecutorNode for HashAggregateExecutor {
    fn next(&mut self) -> Result<Option<Row>, ExecError> {
        if !self.built {
            // Read all input, accumulate into hash table
            while let Some(row) = self.child.next()? {
                let group_key: Vec<Value> = self.group_by_cols.iter()
                    .map(|&col| row.get(col).clone())
                    .collect();
                
                let entry = self.hash_table
                    .entry(group_key)
                    .or_insert_with(|| self.init_accumulators());
                
                for (i, acc) in entry.iter_mut().enumerate() {
                    self.aggregates[i].accumulate(acc, &row);
                }
            }
            
            self.result_iter = Some(std::mem::take(&mut self.hash_table).into_iter());
            self.built = true;
        }
        
        // Emit results one group at a time
        if let Some(ref mut iter) = self.result_iter {
            if let Some((group_key, accumulators)) = iter.next() {
                let mut row = Row::new();
                for val in group_key {
                    row.push(val);
                }
                for (i, acc) in accumulators.iter().enumerate() {
                    row.push(self.aggregates[i].finalize(acc));
                }
                return Ok(Some(row));
            }
        }
        
        Ok(None)
    }
    
    fn open(&mut self) -> Result<(), ExecError> { self.child.open() }
    fn close(&mut self) -> Result<(), ExecError> { self.child.close() }
}
```

### 4. Storage Engine Internals

#### Page Layout (Slotted Page)
```rust
/// Page structure (default 8KB = 8192 bytes)
///
/// ┌────────────────────────────────────────────────────┐
/// │ PageHeader (24 bytes)                               │
/// │  - pd_lsn: LSN of last WAL record affecting page   │
/// │  - pd_checksum: Page checksum                       │
/// │  - pd_flags: Page flags                             │
/// │  - pd_lower: Offset to start of free space          │
/// │  - pd_upper: Offset to end of free space            │
/// │  - pd_special: Offset to special space              │
/// ├────────────────────────────────────────────────────┤
/// │ ItemId Array (4 bytes each)                         │
/// │  [ItemId_1][ItemId_2]...[ItemId_N]                 │
/// │  Each: (offset: 15 bits, flags: 2 bits, len: 15 bits) │
/// │                         pd_lower ↓                  │
/// ├────────────────────────────────────────────────────┤
/// │                                                     │
/// │              FREE SPACE                              │
/// │                                                     │
/// │                         pd_upper ↓                  │
/// ├────────────────────────────────────────────────────┤
/// │ Tuple Data (grows downward from end of page)        │
/// │  [Tuple_N]...[Tuple_2][Tuple_1]                    │
/// ├────────────────────────────────────────────────────┤
/// │ Special Space (index-specific, e.g., B-tree links)  │
/// └────────────────────────────────────────────────────┘

const PAGE_SIZE: usize = 8192;
const PAGE_HEADER_SIZE: usize = 24;
const ITEM_ID_SIZE: usize = 4;

#[repr(C)]
struct PageHeader {
    pd_lsn: u64,            // Log Sequence Number
    pd_checksum: u16,       // Page checksum
    pd_flags: u16,          // Flags (has free lines, is full, etc.)
    pd_lower: u16,          // Offset to start of free space
    pd_upper: u16,          // Offset to end of free space  
    pd_special: u16,        // Offset to start of special space
    pd_pagesize_version: u16, // Page size and layout version
}

struct Page {
    data: [u8; PAGE_SIZE],
}

impl Page {
    fn insert_tuple(&mut self, tuple_data: &[u8]) -> Result<u16, PageError> {
        let header = self.header_mut();
        
        let tuple_size = tuple_data.len();
        let needed = ITEM_ID_SIZE + tuple_size;
        
        let free_space = header.pd_upper as usize - header.pd_lower as usize;
        if free_space < needed {
            return Err(PageError::InsufficientSpace);
        }
        
        // Allocate tuple space (grows down from pd_upper)
        header.pd_upper -= tuple_size as u16;
        let tuple_offset = header.pd_upper;
        
        // Copy tuple data
        self.data[tuple_offset as usize..tuple_offset as usize + tuple_size]
            .copy_from_slice(tuple_data);
        
        // Add ItemId entry (grows up from pd_lower)
        let item_id_offset = header.pd_lower as usize;
        let item_id = ItemId::new(tuple_offset, tuple_size as u16, ItemIdFlags::Normal);
        self.write_item_id(item_id_offset, &item_id);
        header.pd_lower += ITEM_ID_SIZE as u16;
        
        // Return the slot number (0-indexed)
        let slot = (item_id_offset - PAGE_HEADER_SIZE) / ITEM_ID_SIZE;
        Ok(slot as u16)
    }
    
    fn get_tuple(&self, slot: u16) -> Option<&[u8]> {
        let item_id = self.get_item_id(slot)?;
        
        if !item_id.is_used() {
            return None;
        }
        
        let offset = item_id.offset() as usize;
        let length = item_id.length() as usize;
        
        Some(&self.data[offset..offset + length])
    }
    
    fn delete_tuple(&mut self, slot: u16) -> Result<(), PageError> {
        // Mark ItemId as dead (don't actually reclaim space yet)
        let item_id = self.get_item_id_mut(slot).ok_or(PageError::InvalidSlot)?;
        item_id.set_flags(ItemIdFlags::Dead);
        Ok(())
    }
    
    fn compact(&mut self) {
        // Defragment page: move all live tuples together
        // Rebuild ItemId array, update pd_upper
        // Called during VACUUM or when page is too fragmented
    }
}
```

#### B-Tree Index Implementation
```rust
struct BTreeIndex {
    root_page: PageId,
    height: u32,
    relation: RelationId,
    key_columns: Vec<u16>,
    unique: bool,
    buffer_pool: Arc<BufferPool>,
}

#[derive(Debug)]
enum BTreeNode {
    Internal {
        keys: Vec<IndexKey>,
        children: Vec<PageId>,   // children.len() == keys.len() + 1
    },
    Leaf {
        keys: Vec<IndexKey>,
        tids: Vec<ItemPointer>,  // Pointers to heap tuples
        right_sibling: Option<PageId>,
        left_sibling: Option<PageId>,
    },
}

impl BTreeIndex {
    fn search(&self, key: &IndexKey) -> Result<Vec<ItemPointer>, IndexError> {
        let mut current_page = self.root_page;
        
        // Traverse from root to leaf
        for _ in 0..self.height {
            let page = self.buffer_pool.fetch_page(self.relation, current_page)?;
            let node = BTreeNode::from_page(&page);
            
            match node {
                BTreeNode::Internal { keys, children } => {
                    // Binary search for the correct child
                    let idx = keys.binary_search(key).unwrap_or_else(|i| i);
                    current_page = children[idx];
                    self.buffer_pool.release_page(page);
                }
                BTreeNode::Leaf { .. } => break,
            }
        }
        
        // Now at leaf level — collect matching TIDs
        let mut results = Vec::new();
        let mut page = self.buffer_pool.fetch_page(self.relation, current_page)?;
        
        loop {
            let node = BTreeNode::from_page(&page);
            match node {
                BTreeNode::Leaf { keys, tids, right_sibling, .. } => {
                    for (i, k) in keys.iter().enumerate() {
                        if k == key {
                            results.push(tids[i]);
                        } else if k > key {
                            return Ok(results);
                        }
                    }
                    
                    // Continue to right sibling for range scans
                    match right_sibling {
                        Some(sibling) => {
                            self.buffer_pool.release_page(page);
                            page = self.buffer_pool.fetch_page(self.relation, sibling)?;
                        }
                        None => break,
                    }
                }
                _ => unreachable!("Expected leaf node"),
            }
        }
        
        self.buffer_pool.release_page(page);
        Ok(results)
    }
    
    fn insert(&mut self, key: IndexKey, tid: ItemPointer) -> Result<(), IndexError> {
        let result = self.insert_recursive(self.root_page, &key, &tid, 0)?;
        
        // Handle root split
        if let Some((split_key, new_right_page)) = result {
            let new_root = self.buffer_pool.allocate_page(self.relation)?;
            let root_node = BTreeNode::Internal {
                keys: vec![split_key],
                children: vec![self.root_page, new_right_page],
            };
            root_node.write_to_page(&mut new_root);
            self.root_page = new_root.page_id();
            self.height += 1;
        }
        
        Ok(())
    }
    
    fn insert_recursive(&mut self, page_id: PageId, key: &IndexKey, 
                        tid: &ItemPointer, depth: u32) 
        -> Result<Option<(IndexKey, PageId)>, IndexError> 
    {
        let mut page = self.buffer_pool.fetch_page_for_write(self.relation, page_id)?;
        let node = BTreeNode::from_page(&page);
        
        if depth < self.height - 1 {
            // Internal node: recurse into correct child
            let child_idx = node.find_child_index(key);
            let child_page_id = node.children()[child_idx];
            
            self.buffer_pool.release_page(page);
            
            let split = self.insert_recursive(child_page_id, key, tid, depth + 1)?;
            
            if let Some((split_key, new_child)) = split {
                // Insert split key into this internal node
                let mut page = self.buffer_pool.fetch_page_for_write(
                    self.relation, page_id)?;
                
                if page.has_space_for_key(&split_key) {
                    let mut node = BTreeNode::from_page_mut(&mut page);
                    node.insert_internal_entry(split_key, new_child);
                    self.buffer_pool.mark_dirty(page);
                    Ok(None)
                } else {
                    // Split this internal node too
                    Ok(Some(self.split_internal_node(&mut page, split_key, new_child)?))
                }
            } else {
                Ok(None)
            }
        } else {
            // Leaf node: insert here
            if page.has_space_for_key(key) {
                let mut node = BTreeNode::from_page_mut(&mut page);
                node.insert_leaf_entry(key.clone(), *tid);
                
                // WAL log the insert
                self.wal_log_index_insert(page_id, key, tid);
                
                self.buffer_pool.mark_dirty(page);
                Ok(None)
            } else {
                // Split leaf node
                Ok(Some(self.split_leaf_node(&mut page, key.clone(), *tid)?))
            }
        }
    }
}
```

### 5. Buffer Pool Management

```rust
struct BufferPool {
    pages: Vec<BufferDescriptor>,
    page_table: HashMap<(RelationId, PageId), usize>,  // Maps to buffer index
    clock_hand: AtomicUsize,
    num_buffers: usize,
    io_backend: Arc<dyn DiskIO>,
    stats: BufferPoolStats,
}

struct BufferDescriptor {
    tag: Option<(RelationId, PageId)>,
    page: Page,
    pin_count: AtomicI32,    // Number of active users
    usage_count: AtomicU32,  // Clock-sweep reference count
    is_dirty: AtomicBool,    // Page has been modified
    content_lock: RwLock<()>, // Shared/exclusive lock for reading/writing content
    io_in_progress: AtomicBool,
}

impl BufferPool {
    fn fetch_page(&self, relation: RelationId, page_id: PageId) 
        -> Result<PinnedPage, BufferError> 
    {
        // 1. Check if page is already in buffer pool
        if let Some(&buf_idx) = self.page_table.get(&(relation, page_id)) {
            let desc = &self.pages[buf_idx];
            desc.pin_count.fetch_add(1, Ordering::Acquire);
            desc.usage_count.fetch_add(1, Ordering::Relaxed);
            self.stats.hits.fetch_add(1, Ordering::Relaxed);
            return Ok(PinnedPage::new(buf_idx, self));
        }
        
        self.stats.misses.fetch_add(1, Ordering::Relaxed);
        
        // 2. Page not found — need to load from disk
        // Find a victim buffer using clock-sweep algorithm
        let victim_idx = self.clock_sweep_find_victim()?;
        
        // 3. If victim is dirty, write it back to disk first
        let victim = &self.pages[victim_idx];
        if victim.is_dirty.load(Ordering::Acquire) {
            self.flush_page(victim_idx)?;
        }
        
        // 4. Remove old page from page table
        if let Some(old_tag) = victim.tag {
            self.page_table.remove(&old_tag);
        }
        
        // 5. Read new page from disk
        let page_data = self.io_backend.read_page(relation, page_id)?;
        
        // 6. Verify checksum
        if !page_data.verify_checksum() {
            return Err(BufferError::ChecksumMismatch(relation, page_id));
        }
        
        // 7. Install in buffer pool
        let desc = &mut self.pages[victim_idx];
        desc.tag = Some((relation, page_id));
        desc.page = page_data;
        desc.pin_count.store(1, Ordering::Release);
        desc.usage_count.store(1, Ordering::Release);
        desc.is_dirty.store(false, Ordering::Release);
        
        self.page_table.insert((relation, page_id), victim_idx);
        
        Ok(PinnedPage::new(victim_idx, self))
    }
    
    /// Clock-sweep algorithm (approximation of LRU)
    fn clock_sweep_find_victim(&self) -> Result<usize, BufferError> {
        let max_iterations = self.num_buffers * 3; // Prevent infinite loop
        
        for _ in 0..max_iterations {
            let idx = self.clock_hand.fetch_add(1, Ordering::Relaxed) % self.num_buffers;
            let desc = &self.pages[idx];
            
            // Skip pinned pages
            if desc.pin_count.load(Ordering::Acquire) > 0 {
                continue;
            }
            
            // Decrement usage count; evict if zero
            let usage = desc.usage_count.load(Ordering::Acquire);
            if usage == 0 {
                // Try to pin this buffer for eviction
                if desc.pin_count.compare_exchange(
                    0, 1, Ordering::AcqRel, Ordering::Relaxed
                ).is_ok() {
                    return Ok(idx);
                }
            } else {
                // Give it another chance
                desc.usage_count.fetch_sub(1, Ordering::Relaxed);
            }
        }
        
        Err(BufferError::NoAvailableBuffers)
    }
    
    fn flush_page(&self, buf_idx: usize) -> Result<(), BufferError> {
        let desc = &self.pages[buf_idx];
        
        if !desc.is_dirty.load(Ordering::Acquire) {
            return Ok(());
        }
        
        let (relation, page_id) = desc.tag.unwrap();
        
        // Compute and set page checksum
        desc.page.compute_and_set_checksum();
        
        // WAL protocol: must flush WAL up to page LSN before writing page
        let page_lsn = desc.page.header().pd_lsn;
        self.wal_manager.flush_to_lsn(page_lsn)?;
        
        // Write page to disk
        self.io_backend.write_page(relation, page_id, &desc.page)?;
        
        desc.is_dirty.store(false, Ordering::Release);
        self.stats.writes.fetch_add(1, Ordering::Relaxed);
        
        Ok(())
    }
}
```

### 6. WAL Implementation

```rust
struct WalManager {
    wal_buffers: Mutex<WalBuffer>,
    wal_file: Mutex<WalFileManager>,
    current_lsn: AtomicU64,
    flushed_lsn: AtomicU64,
    insert_lock: Mutex<()>,
    flush_lock: Mutex<()>,
}

struct WalBuffer {
    buffer: Vec<u8>,
    capacity: usize,
    write_position: usize,
}

#[repr(C)]
struct WalRecord {
    lsn: u64,              // Log Sequence Number
    prev_lsn: u64,         // Previous record LSN (for backward chain)
    tx_id: u64,            // Transaction ID
    record_type: WalRecordType,
    relation_id: u32,      // Affected relation
    page_id: u32,          // Affected page
    offset: u16,           // Offset within page
    data_length: u16,      // Length of payload
    // followed by: old_data (for UNDO) + new_data (for REDO)
}

#[derive(Debug, Clone, Copy)]
enum WalRecordType {
    HeapInsert,
    HeapUpdate,
    HeapDelete,
    HeapHotUpdate,
    IndexInsert,
    IndexDelete,
    Commit,
    Abort,
    Checkpoint,
    NextOid,
    CreateRelation,
    DropRelation,
    TruncateRelation,
    FPI,  // Full Page Image (after checkpoint)
}

impl WalManager {
    fn insert_record(&self, record: &WalRecord, data: &[u8]) -> Result<u64, WalError> {
        let _lock = self.insert_lock.lock().unwrap();
        
        let total_size = std::mem::size_of::<WalRecord>() + data.len();
        let lsn = self.current_lsn.fetch_add(total_size as u64, Ordering::SeqCst);
        
        let mut buffers = self.wal_buffers.lock().unwrap();
        
        // If buffer is full, flush to disk first
        if buffers.write_position + total_size > buffers.capacity {
            drop(buffers);
            self.flush_wal_buffers()?;
            buffers = self.wal_buffers.lock().unwrap();
        }
        
        // Write record header
        let record_bytes = unsafe {
            std::slice::from_raw_parts(
                record as *const WalRecord as *const u8,
                std::mem::size_of::<WalRecord>()
            )
        };
        buffers.buffer[buffers.write_position..buffers.write_position + record_bytes.len()]
            .copy_from_slice(record_bytes);
        buffers.write_position += record_bytes.len();
        
        // Write record data
        buffers.buffer[buffers.write_position..buffers.write_position + data.len()]
            .copy_from_slice(data);
        buffers.write_position += data.len();
        
        Ok(lsn)
    }
    
    /// Flush WAL to disk up to at least the given LSN
    fn flush_to_lsn(&self, target_lsn: u64) -> Result<(), WalError> {
        let current_flushed = self.flushed_lsn.load(Ordering::Acquire);
        
        if current_flushed >= target_lsn {
            return Ok(()); // Already flushed past this point
        }
        
        self.flush_wal_buffers()?;
        
        Ok(())
    }
    
    fn flush_wal_buffers(&self) -> Result<(), WalError> {
        let _flush_lock = self.flush_lock.lock().unwrap();
        let mut buffers = self.wal_buffers.lock().unwrap();
        
        if buffers.write_position == 0 {
            return Ok(());
        }
        
        // Write to WAL file
        let mut wal_file = self.wal_file.lock().unwrap();
        wal_file.write_all(&buffers.buffer[..buffers.write_position])?;
        
        // fsync to guarantee durability
        wal_file.fsync()?;
        
        // Update flushed LSN
        let new_flushed = self.current_lsn.load(Ordering::Acquire);
        self.flushed_lsn.store(new_flushed, Ordering::Release);
        
        // Reset buffer
        buffers.write_position = 0;
        
        Ok(())
    }
    
    /// Recover from crash by replaying WAL records
    fn recover(&self, last_checkpoint_lsn: u64) -> Result<(), WalError> {
        let mut wal_reader = WalReader::new(&self.wal_file)?;
        wal_reader.seek(last_checkpoint_lsn)?;
        
        // REDO pass: replay all committed changes
        while let Some(record) = wal_reader.next_record()? {
            match record.record_type {
                WalRecordType::HeapInsert => self.redo_heap_insert(&record)?,
                WalRecordType::HeapUpdate => self.redo_heap_update(&record)?,
                WalRecordType::HeapDelete => self.redo_heap_delete(&record)?,
                WalRecordType::Commit => {
                    self.transaction_manager.mark_committed(record.tx_id);
                }
                WalRecordType::Abort => {
                    self.transaction_manager.mark_aborted(record.tx_id);
                }
                _ => {}
            }
        }
        
        // UNDO pass: roll back uncommitted transactions
        let uncommitted_txns = self.transaction_manager.get_uncommitted_transactions();
        for tx_id in uncommitted_txns {
            self.undo_transaction(tx_id)?;
        }
        
        Ok(())
    }
}
```

### 7. Lock Manager

```rust
struct LockManager {
    lock_table: DashMap<ResourceId, LockQueue>,
    wait_graph: Mutex<WaitGraph>,
    deadlock_detector: DeadlockDetector,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum LockMode {
    AccessShare,      // SELECT
    RowShare,         // SELECT FOR UPDATE
    RowExclusive,     // INSERT, UPDATE, DELETE
    ShareUpdateExclusive, // VACUUM
    Share,            // CREATE INDEX
    ShareRowExclusive,    // CREATE TRIGGER
    Exclusive,        // DROP TABLE
    AccessExclusive,  // ALTER TABLE
}

struct LockQueue {
    granted: Vec<LockRequest>,
    waiting: VecDeque<LockRequest>,
}

struct LockRequest {
    transaction_id: TransactionId,
    lock_mode: LockMode,
    granted_time: Option<Instant>,
    waker: Option<Waker>,  // For async waiting
}

impl LockManager {
    fn acquire_lock(&self, tx_id: TransactionId, resource: ResourceId, 
                   mode: LockMode) -> Result<LockHandle, LockError> {
        let mut queue = self.lock_table.entry(resource)
            .or_insert_with(|| LockQueue::new());
        
        // Check for conflicts with granted locks
        let conflicts = queue.granted.iter()
            .any(|req| self.conflicts(req.lock_mode, mode));
        
        if !conflicts {
            // Grant immediately
            queue.granted.push(LockRequest {
                transaction_id: tx_id,
                lock_mode: mode,
                granted_time: Some(Instant::now()),
                waker: None,
            });
            return Ok(LockHandle::new(resource, mode));
        }
        
        // Must wait — check for deadlock first
        if self.would_create_deadlock(tx_id, &queue.granted)? {
            return Err(LockError::Deadlock);
        }
        
        // Add to wait queue
        let (tx, rx) = oneshot::channel();
        queue.waiting.push_back(LockRequest {
            transaction_id: tx_id,
            lock_mode: mode,
            granted_time: None,
            waker: Some(tx),
        });
        
        // Wait for lock to be granted or deadlock detection
        rx.await.map_err(|_| LockError::Aborted)?;
        
        Ok(LockHandle::new(resource, mode))
    }
    
    fn release_lock(&self, handle: LockHandle) {
        let mut queue = self.lock_table.get_mut(&handle.resource).unwrap();
        
        // Remove from granted list
        queue.granted.retain(|req| req.lock_mode != handle.mode);
        
        // Try to grant waiting requests
        self.grant_waiting_locks(&mut queue);
    }
    
    fn grant_waiting_locks(&self, queue: &mut LockQueue) {
        while let Some(waiting) = queue.waiting.front() {
            let conflicts = queue.granted.iter()
                .any(|granted| self.conflicts(granted.lock_mode, waiting.lock_mode));
                
            if conflicts {
                break; // Cannot grant this one yet
            }
            
            // Grant the lock
            let mut request = queue.waiting.pop_front().unwrap();
            request.granted_time = Some(Instant::now());
            if let Some(waker) = request.waker.take() {
                waker.send(()).ok();
            }
            queue.granted.push(request);
        }
    }
    
    fn conflicts(&self, held: LockMode, requested: LockMode) -> bool {
        use LockMode::*;
        
        match (held, requested) {
            // AccessShare conflicts with AccessExclusive only
            (AccessShare, AccessExclusive) | (AccessExclusive, AccessShare) => true,
            
            // RowShare conflicts with Exclusive and AccessExclusive
            (RowShare, Exclusive) | (RowShare, AccessExclusive) |
            (Exclusive, RowShare) | (AccessExclusive, RowShare) => true,
            
            // RowExclusive conflicts with Share and higher
            (RowExclusive, Share) | (RowExclusive, ShareRowExclusive) |
            (RowExclusive, Exclusive) | (RowExclusive, AccessExclusive) |
            (Share, RowExclusive) | (ShareRowExclusive, RowExclusive) |
            (Exclusive, RowExclusive) | (AccessExclusive, RowExclusive) => true,
            
            // ShareUpdateExclusive conflicts with ShareUpdateExclusive and higher
            (ShareUpdateExclusive, ShareUpdateExclusive) |
            (ShareUpdateExclusive, Share) | (ShareUpdateExclusive, ShareRowExclusive) |
            (ShareUpdateExclusive, Exclusive) | (ShareUpdateExclusive, AccessExclusive) => true,
            
            // Share conflicts with RowExclusive and higher (except Share)
            (Share, RowExclusive) | (Share, ShareRowExclusive) |
            (Share, Exclusive) | (Share, AccessExclusive) => true,
            
            // ShareRowExclusive conflicts with everything except AccessShare
            (ShareRowExclusive, _) if requested != AccessShare => true,
            (_, ShareRowExclusive) if held != AccessShare => true,
            
            // Exclusive and AccessExclusive conflict with everything
            (Exclusive, _) | (_, Exclusive) |
            (AccessExclusive, _) | (_, AccessExclusive) => true,
            
            _ => false,
        }
    }
}

struct DeadlockDetector {
    check_interval: Duration,
    max_wait_time: Duration,
}

impl DeadlockDetector {
    fn detect_deadlocks(&self, wait_graph: &WaitGraph) -> Vec<TransactionId> {
        // Use DFS to find cycles in wait-for graph
        let mut visited = HashSet::new();
        let mut rec_stack = HashSet::new();
        let mut deadlocked = Vec::new();
        
        for &tx in wait_graph.nodes() {
            if !visited.contains(&tx) {
                if self.has_cycle_dfs(tx, wait_graph, &mut visited, 
                                     &mut rec_stack, &mut deadlocked) {
                    // Found deadlock — choose victim (youngest transaction)
                    deadlocked.sort_by_key(|&tx| wait_graph.start_time(tx));
                    return deadlocked;
                }
            }
        }
        
        vec![]
    }
    
    fn has_cycle_dfs(&self, tx: TransactionId, graph: &WaitGraph,
                     visited: &mut HashSet<TransactionId>,
                     rec_stack: &mut HashSet<TransactionId>,
                     path: &mut Vec<TransactionId>) -> bool {
        visited.insert(tx);
        rec_stack.insert(tx);
        path.push(tx);
        
        for &neighbor in graph.edges(tx) {
            if !visited.contains(&neighbor) {
                if self.has_cycle_dfs(neighbor, graph, visited, rec_stack, path) {
                    return true;
                }
            } else if rec_stack.contains(&neighbor) {
                // Back edge found — cycle detected
                let cycle_start = path.iter().position(|&t| t == neighbor).unwrap();
                path.drain(..cycle_start); // Keep only cycle
                return true;
            }
        }
        
        rec_stack.remove(&tx);
        path.pop();
        false
    }
}
```

### 8. Transaction Manager

```rust
struct TransactionManager {
    active_transactions: DashMap<TransactionId, TransactionState>,
    next_tx_id: AtomicU64,
    snapshot_manager: SnapshotManager,
    wal_manager: Arc<WalManager>,
}

#[derive(Debug, Clone)]
struct TransactionState {
    tx_id: TransactionId,
    isolation_level: IsolationLevel,
    state: TxState,
    start_time: Instant,
    snapshot: Option<Snapshot>,
    locks_held: Vec<LockHandle>,
    savepoints: Vec<Savepoint>,
    modified_pages: HashSet<(RelationId, PageId)>,
}

#[derive(Debug, Clone, Copy)]
enum IsolationLevel {
    ReadUncommitted,
    ReadCommitted,
    RepeatableRead,
    Serializable,
}

impl TransactionManager {
    fn begin_transaction(&self, isolation: IsolationLevel) -> TransactionId {
        let tx_id = self.next_tx_id.fetch_add(1, Ordering::SeqCst);
        
        let snapshot = match isolation {
            IsolationLevel::ReadCommitted => None, // Get fresh snapshot for each statement
            _ => Some(self.snapshot_manager.get_snapshot()),
        };
        
        let tx_state = TransactionState {
            tx_id,
            isolation_level: isolation,
            state: TxState::Active,
            start_time: Instant::now(),
            snapshot,
            locks_held: Vec::new(),
            savepoints: Vec::new(),
            modified_pages: HashSet::new(),
        };
        
        self.active_transactions.insert(tx_id, tx_state);
        
        // WAL log transaction begin
        let wal_record = WalRecord {
            lsn: 0, // Will be set by WalManager
            prev_lsn: 0,
            tx_id,
            record_type: WalRecordType::Begin,
            relation_id: 0,
            page_id: 0,
            offset: 0,
            data_length: 0,
        };
        self.wal_manager.insert_record(&wal_record, &[]).unwrap();
        
        tx_id
    }
    
    fn commit_transaction(&self, tx_id: TransactionId) -> Result<(), TxError> {
        let mut tx_state = self.active_transactions.get_mut(&tx_id)
            .ok_or(TxError::TransactionNotFound)?;
        
        // Phase 1: Prepare (validate serializable isolation)
        if tx_state.isolation_level == IsolationLevel::Serializable {
            self.validate_serializable(&tx_state)?;
        }
        
        // Phase 2: WAL log commit record and force flush
        let commit_record = WalRecord {
            lsn: 0,
            prev_lsn: 0,
            tx_id,
            record_type: WalRecordType::Commit,
            relation_id: 0,
            page_id: 0,
            offset: 0,
            data_length: 0,
        };
        let commit_lsn = self.wal_manager.insert_record(&commit_record, &[])?;
        self.wal_manager.flush_to_lsn(commit_lsn)?; // Force flush for durability
        
        // Phase 3: Release all locks
        for lock in &tx_state.locks_held {
            self.lock_manager.release_lock(lock.clone());
        }
        
        // Phase 4: Mark transaction as committed
        tx_state.state = TxState::Committed;
        self.active_transactions.remove(&tx_id);
        
        Ok(())
    }
    
    fn rollback_transaction(&self, tx_id: TransactionId) -> Result<(), TxError> {
        let mut tx_state = self.active_transactions.get_mut(&tx_id)
            .ok_or(TxError::TransactionNotFound)?;
        
        // Undo all changes made by this transaction
        self.undo_transaction_changes(&tx_state)?;
        
        // WAL log abort record
        let abort_record = WalRecord {
            lsn: 0,
            prev_lsn: 0,
            tx_id,
            record_type: WalRecordType::Abort,
            relation_id: 0,
            page_id: 0,
            offset: 0,
            data_length: 0,
        };
        self.wal_manager.insert_record(&abort_record, &[])?;
        
        // Release all locks
        for lock in &tx_state.locks_held {
            self.lock_manager.release_lock(lock.clone());
        }
        
        tx_state.state = TxState::Aborted;
        self.active_transactions.remove(&tx_id);
        
        Ok(())
    }
    
    fn create_savepoint(&self, tx_id: TransactionId, name: String) -> Result<(), TxError> {
        let mut tx_state = self.active_transactions.get_mut(&tx_id)
            .ok_or(TxError::TransactionNotFound)?;
        
        let savepoint = Savepoint {
            name,
            lsn: self.wal_manager.current_lsn(),
            modified_pages: tx_state.modified_pages.clone(),
        };
        
        tx_state.savepoints.push(savepoint);
        Ok(())
    }
    
    fn rollback_to_savepoint(&self, tx_id: TransactionId, name: &str) -> Result<(), TxError> {
        let mut tx_state = self.active_transactions.get_mut(&tx_id)
            .ok_or(TxError::TransactionNotFound)?;
        
        // Find the savepoint
        let savepoint_idx = tx_state.savepoints.iter()
            .rposition(|sp| sp.name == name)
            .ok_or(TxError::SavepointNotFound)?;
        
        let savepoint = tx_state.savepoints[savepoint_idx].clone();
        
        // Undo changes since savepoint
        self.undo_to_lsn(tx_id, savepoint.lsn)?;
        
        // Remove newer savepoints
        tx_state.savepoints.truncate(savepoint_idx + 1);
        tx_state.modified_pages = savepoint.modified_pages;
        
        Ok(())
    }
}

struct SnapshotManager {
    global_snapshot: Mutex<GlobalSnapshot>,
}

struct GlobalSnapshot {
    xmin: TransactionId,     // Oldest active transaction
    xmax: TransactionId,     // First not-yet-assigned transaction ID
    active_txns: Vec<TransactionId>, // Active transactions at snapshot time
}

impl SnapshotManager {
    fn get_snapshot(&self) -> Snapshot {
        let global = self.global_snapshot.lock().unwrap();
        Snapshot {
            xmin: global.xmin,
            xmax: global.xmax,
            active_txns: global.active_txns.clone(),
        }
    }
    
    fn is_visible(&self, snapshot: &Snapshot, tuple_xmin: TransactionId, 
                  tuple_xmax: Option<TransactionId>) -> bool {
        // Transaction that created tuple must be committed and < snapshot xmax
        if tuple_xmin >= snapshot.xmax || snapshot.active_txns.contains(&tuple_xmin) {
            return false;
        }
        
        // If tuple was deleted, check if deleting transaction is visible
        if let Some(xmax) = tuple_xmax {
            if xmax < snapshot.xmax && !snapshot.active_txns.contains(&xmax) {
                return false; // Tuple was deleted by committed transaction
            }
        }
        
        true
    }
}
```

### 9. Catalog Management

```rust
struct Catalog {
    system_tables: DashMap<String, SystemTable>,
    table_cache: LruCache<RelationId, TableDefinition>,
    index_cache: LruCache<RelationId, IndexDefinition>,
    function_cache: LruCache<String, FunctionDefinition>,
    type_cache: LruCache<TypeId, TypeDefinition>,
    oid_counter: AtomicU32,
}

impl Catalog {
    fn create_table(&mut self, table_def: CreateTableStatement) -> Result<RelationId, CatalogError> {
        let relation_id = self.allocate_oid();
        
        // Validate column definitions
        for col in &table_def.columns {
            self.validate_column_definition(col)?;
        }
        
        // Create table metadata
        let table_meta = TableDefinition {
            oid: relation_id,
            name: table_def.name.clone(),
            schema: table_def.schema.unwrap_or_else(|| "public".to_string()),
            columns: table_def.columns.clone(),
            constraints: table_def.constraints.clone(),
            storage_params: table_def.storage_params.unwrap_or_default(),
            created_at: SystemTime::now(),
            stats: TableStatistics::default(),
        };
        
        // Insert into system catalogs
        self.insert_pg_class(&table_meta)?;
        self.insert_pg_attribute(&table_meta)?;
        self.insert_pg_constraint(&table_meta)?;
        
        // Create physical storage
        self.storage_manager.create_relation(relation_id, &table_meta.storage_params)?;
        
        // Cache the definition
        self.table_cache.put(relation_id, table_meta);
        
        Ok(relation_id)
    }
    
    fn create_index(&mut self, index_def: CreateIndexStatement) -> Result<RelationId, CatalogError> {
        let index_oid = self.allocate_oid();
        let table_def = self.get_table(&index_def.table_name)?;
        
        // Validate indexed columns exist
        for col in &index_def.columns {
            if !table_def.columns.iter().any(|c| c.name == col.name) {
                return Err(CatalogError::ColumnNotFound(col.name.clone()));
            }
        }
        
        let index_meta = IndexDefinition {
            oid: index_oid,
            name: index_def.name.clone(),
            table_oid: table_def.oid,
            columns: index_def.columns,
            unique: index_def.unique,
            access_method: index_def.using.unwrap_or_else(|| "btree".to_string()),
            predicate: index_def.where_clause,
            created_at: SystemTime::now(),
            stats: IndexStatistics::default(),
        };
        
        // Insert into system catalogs
        self.insert_pg_index(&index_meta)?;
        
        // Create physical index
        if index_def.concurrently {
            self.build_index_concurrently(&index_meta)?;
        } else {
            self.build_index(&index_meta)?;
        }
        
        self.index_cache.put(index_oid, index_meta);
        
        Ok(index_oid)
    }
    
    fn resolve_column(&self, table_name: &str, column_name: &str) -> Result<ResolvedColumn, CatalogError> {
        let table = self.get_table_by_name(table_name)?;
        
        let column = table.columns.iter()
            .find(|c| c.name.eq_ignore_ascii_case(column_name))
            .ok_or_else(|| CatalogError::ColumnNotFound(column_name.to_string()))?;
        
        Ok(ResolvedColumn {
            table_oid: table.oid,
            attnum: column.attnum,
            name: column.name.clone(),
            data_type: column.data_type.clone(),
            nullable: column.nullable,
            default: column.default_value.clone(),
        })
    }
    
    fn get_table_statistics(&self, relation_id: RelationId) -> Result<TableStatistics, CatalogError> {
        // First try cache
        if let Some(cached_stats) = self.stats_cache.get(&relation_id) {
            if cached_stats.last_updated.elapsed() < Duration::from_secs(300) { // 5 min
                return Ok(cached_stats.clone());
            }
        }
        
        // Query pg_statistic for fresh stats
        let stats = self.query_statistics_from_catalog(relation_id)?;
        self.stats_cache.put(relation_id, stats.clone());
        
        Ok(stats)
    }
    
    /// Update table statistics (called by ANALYZE)
    fn update_statistics(&mut self, relation_id: RelationId, 
                        sample_rows: &[Row]) -> Result<(), CatalogError> {
        let mut stats = TableStatistics::default();
        stats.reltuples = sample_rows.len() as f32;
        stats.relpages = self.storage_manager.get_relation_pages(relation_id)? as f32;
        
        // Compute column statistics
        let table_def = self.get_table(relation_id)?;
        for (col_idx, column) in table_def.columns.iter().enumerate() {
            let col_stats = self.compute_column_statistics(sample_rows, col_idx, &column.data_type);
            stats.column_stats.insert(column.attnum, col_stats);
        }
        
        // Update system catalogs
        self.update_pg_statistic(relation_id, &stats)?;
        
        Ok(())
    }
}
```

## Performance Optimization Strategies

### 1. Query Plan Caching
```rust
struct PlanCache {
    cache: LruCache<QueryFingerprint, CachedPlan>,
    max_size: usize,
    hit_count: AtomicU64,
    miss_count: AtomicU64,
}

struct CachedPlan {
    plan: PhysicalPlan,
    created_at: Instant,
    execution_count: AtomicU64,
    total_time: AtomicDuration,
    parameter_types: Vec<DataType>,
}

impl PlanCache {
    fn get_plan(&self, sql: &str, param_types: &[DataType]) -> Option<PhysicalPlan> {
        let fingerprint = self.compute_fingerprint(sql, param_types);
        
        if let Some(cached) = self.cache.get(&fingerprint) {
            self.hit_count.fetch_add(1, Ordering::Relaxed);
            cached.execution_count.fetch_add(1, Ordering::Relaxed);
            Some(cached.plan.clone())
        } else {
            self.miss_count.fetch_add(1, Ordering::Relaxed);
            None
        }
    }
}
```

### 2. Parallel Query Execution
```rust
struct ParallelExecutor {
    worker_pool: ThreadPool,
    max_workers: usize,
}

impl ParallelExecutor {
    fn execute_parallel_scan(&self, plan: &SeqScanPlan) -> BoxedRowStream {
        let table_pages = plan.table.total_pages();
        let workers = std::cmp::min(self.max_workers, (table_pages / 1000).max(1) as usize);
        let pages_per_worker = table_pages / workers as u32;
        
        let (sender, receiver) = mpsc::channel();
        
        for worker_id in 0..workers {
            let start_page = worker_id as u32 * pages_per_worker;
            let end_page = if worker_id == workers - 1 {
                table_pages
            } else {
                (worker_id + 1) as u32 * pages_per_worker
            };
            
            let plan_clone = plan.clone();
            let sender = sender.clone();
            
            self.worker_pool.execute(move || {
                let mut executor = SeqScanExecutor::new(plan_clone);
                executor.set_page_range(start_page, end_page);
                executor.open().unwrap();
                
                while let Some(row) = executor.next().unwrap() {
                    sender.send(row).unwrap();
                }
                
                executor.close().unwrap();
            });
        }
        
        Box::new(receiver.into_iter())
    }
}
```

This comprehensive architecture guide provides the foundation for implementing a production-grade relational database with all essential subsystems: query processing, storage management, transaction control, concurrency management, and crash recovery.