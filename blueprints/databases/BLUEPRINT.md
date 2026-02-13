# Relational Database Blueprint

## Overview & Purpose

A relational database management system (RDBMS) is a software system that stores, retrieves, and manages data organized into tables with rows and columns, enforcing relationships between tables through constraints. It provides ACID-compliant transaction processing, a declarative query language (SQL), and sophisticated query optimization to enable concurrent multi-user access to structured data.

### Core Responsibilities
- **Data Storage & Retrieval**: Persist structured data in tables and retrieve it efficiently via SQL
- **Transaction Management**: Ensure ACID properties (Atomicity, Consistency, Isolation, Durability)
- **Query Processing**: Parse, optimize, and execute SQL queries against stored data
- **Concurrency Control**: Allow multiple users to read/write data simultaneously without conflicts
- **Data Integrity**: Enforce constraints (PRIMARY KEY, FOREIGN KEY, CHECK, UNIQUE, NOT NULL)
- **Crash Recovery**: Recover to a consistent state after hardware or software failures
- **Security**: Authenticate users and enforce access control on data objects
- **Replication & High Availability**: Replicate data across nodes for fault tolerance and read scaling

## Core Concepts

### 1. SQL Parser & Lexer
**Definition**: The front-end component that transforms SQL text into an abstract syntax tree (AST).

```
SQL Text → Lexer → Token Stream → Parser → AST → Semantic Analyzer → Logical Plan
```

**Stages**:
- **Lexical Analysis**: Tokenize raw SQL into keywords, identifiers, literals, operators
- **Syntactic Analysis**: Build a parse tree according to SQL grammar rules
- **Semantic Analysis**: Resolve table/column names, check types, validate permissions
- **Logical Plan Generation**: Convert AST to a relational algebra expression tree

```
Example: SELECT name, age FROM users WHERE age > 25 ORDER BY name;

Tokens: [SELECT, IDENT("name"), COMMA, IDENT("age"), FROM, IDENT("users"),
         WHERE, IDENT("age"), GT, INT(25), ORDER, BY, IDENT("name"), SEMICOLON]

AST:
  SelectStatement {
    columns: [Column("name"), Column("age")]
    from: Table("users")
    where: BinaryExpr(Column("age"), Gt, Literal(25))
    order_by: [OrderBy(Column("name"), Asc)]
  }
```

### 2. Query Planner & Optimizer
**Definition**: Transforms a logical query plan into an optimized physical execution plan.

```
Query Optimizer Pipeline:
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Logical Plan│───▶│  Rewrite     │───▶│  Cost-Based  │───▶│ Physical Plan│
│  (from AST)  │    │  Rules       │    │  Optimizer   │    │  (executable)│
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                          │                    │
                          ▼                    ▼
                    ┌──────────────┐    ┌──────────────┐
                    │ Predicate    │    │  Statistics  │
                    │ Pushdown,    │    │  (histograms,│
                    │ Join Reorder │    │   cardinality│
                    └──────────────┘    │   estimates) │
                                        └──────────────┘
```

**Optimization Strategies**:
- **Predicate Pushdown**: Move WHERE filters closer to table scans
- **Projection Pushdown**: Only read columns actually needed
- **Join Reordering**: Choose optimal join order based on table sizes and selectivity
- **Subquery Decorrelation**: Transform correlated subqueries into joins
- **Common Subexpression Elimination**: Share computation across query branches
- **Constant Folding**: Evaluate constant expressions at compile time
- **Index Selection**: Choose appropriate indexes for scans and joins
- **Aggregation Pushdown**: Push aggregation below joins when possible

**Cost Model**:
```
Cost(Plan) = Σ (CPU_cost + IO_cost + Network_cost) for each operator

CPU_cost = rows_processed × per_row_cost
IO_cost  = pages_read × sequential_page_cost + random_pages × random_page_cost
Network_cost = bytes_transferred × network_cost_factor  (distributed only)
```

### 3. Storage Engines

#### B-Tree Storage (OLTP — Default)
**Definition**: Balanced tree structure where data is stored in sorted order in leaf pages.

```
B+ Tree Structure:
                    ┌─────────────┐
                    │  Root Node  │
                    │ [30 | 60]   │
                    └──────┬──────┘
               ┌───────────┼───────────┐
               ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ [10|20]  │ │ [40|50]  │ │ [70|80]  │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
        ┌──┬─┴─┐    ┌──┬─┴─┐    ┌──┬─┴─┐
        ▼  ▼   ▼    ▼  ▼   ▼    ▼  ▼   ▼
       [Leaf Pages with actual row data, linked in sorted order]
       ◄──────────────────────────────────────────────────────►
       Doubly-linked leaf page chain for range scans
```

**Properties**:
- O(log N) lookups, inserts, deletes
- Good for both point lookups and range scans
- Pages typically 4KB-16KB
- Fill factor controls space vs performance trade-off
- Used by: PostgreSQL, MySQL/InnoDB, Oracle, SQL Server

#### LSM-Tree Storage (Write-Optimized)
**Definition**: Log-Structured Merge Tree that buffers writes in memory and periodically flushes sorted runs to disk.

```
LSM-Tree Architecture:
┌─────────────────┐
│   MemTable      │  ◄── All writes go here first (in-memory, sorted)
│  (Red-Black     │
│   Tree / SkipList)│
└────────┬────────┘
         │ Flush when full
         ▼
┌─────────────────┐
│  Level 0 (L0)   │  ◄── Immutable sorted runs (SSTables)
│  [SST][SST][SST]│      May have overlapping key ranges
└────────┬────────┘
         │ Compaction
         ▼
┌─────────────────┐
│  Level 1 (L1)   │  ◄── Non-overlapping sorted runs
│  [SST][SST][SST]│      10x larger than L0
└────────┬────────┘
         │ Compaction
         ▼
┌─────────────────┐
│  Level 2 (L2)   │  ◄── 10x larger than L1
│  [SST]...[SST]  │
└─────────────────┘
```

**Properties**:
- Excellent write throughput (sequential I/O only)
- Read amplification (must check multiple levels)
- Space amplification from duplicate keys across levels
- Bloom filters reduce unnecessary reads
- Used by: CockroachDB (RocksDB), TiDB (TiKV/RocksDB), YugabyteDB (DocDB)

#### Heap Storage
**Definition**: Unordered collection of pages where rows are stored in insertion order.

**Properties**:
- Fast inserts (append to end)
- Sequential scans efficient
- Random access requires index
- Used by: PostgreSQL (heap tables), MySQL/MyISAM
- Good for append-heavy workloads

#### Column-Oriented Storage (OLAP)
**Definition**: Stores data by column rather than by row for analytical workloads.

```
Row-Oriented:        Column-Oriented:
┌─────┬────┬────┐    ┌─────┐ ┌────┐ ┌────┐
│id=1 │Joe │ 25 │    │  1  │ │Joe │ │ 25 │
│id=2 │Ann │ 30 │    │  2  │ │Ann │ │ 30 │
│id=3 │Bob │ 28 │    │  3  │ │Bob │ │ 28 │
└─────┴────┴────┘    └─────┘ └────┘ └────┘
 (entire rows         id col  name   age
  stored together)    (each column stored separately)
```

**Properties**:
- Excellent compression (similar values together)
- Efficient aggregations (read only needed columns)
- Vectorized execution friendly
- Poor for point lookups and row-level updates
- Used by: DuckDB, ClickHouse, Snowflake, BigQuery

### 4. ACID Transactions

#### Atomicity
All operations in a transaction succeed or all are rolled back. Implemented via:
- **Undo Log**: Records previous values before modification; used to roll back
- **Write-Ahead Log (WAL)**: Records intended changes before applying to data pages

#### Consistency
Database moves from one valid state to another. Enforced by:
- Constraint checking (PK, FK, CHECK, UNIQUE, NOT NULL)
- Trigger execution
- Cascading actions (ON DELETE CASCADE, ON UPDATE CASCADE)

#### Isolation
Concurrent transactions don't interfere. Isolation levels:

| Level | Dirty Read | Non-Repeatable Read | Phantom Read | Performance |
|-------|-----------|-------------------|-------------|-------------|
| READ UNCOMMITTED | Possible | Possible | Possible | Fastest |
| READ COMMITTED | No | Possible | Possible | Fast |
| REPEATABLE READ | No | No | Possible | Moderate |
| SERIALIZABLE | No | No | No | Slowest |

#### Durability
Committed transactions survive crashes. Implemented via:
- WAL fsync before commit acknowledgment
- Checkpoint mechanism to flush dirty pages
- Recovery replay of WAL after crash

### 5. Multi-Version Concurrency Control (MVCC)
**Definition**: Maintain multiple versions of each row to allow readers and writers to operate concurrently without blocking.

```
MVCC Version Chain:
┌─────────────────────────────────────────┐
│ Row "id=42"                             │
│                                          │
│  Version 3 (TxID=150, active)           │
│  ┌─────────────────────────────┐        │
│  │ name="Charlie", age=31      │        │
│  │ xmin=150, xmax=∞            │────┐   │
│  └─────────────────────────────┘    │   │
│                                      ▼   │
│  Version 2 (TxID=120, committed)    │   │
│  ┌─────────────────────────────┐    │   │
│  │ name="Charles", age=30      │    │   │
│  │ xmin=120, xmax=150          │────┘   │
│  └─────────────────────────────┘        │
│                    │                     │
│                    ▼                     │
│  Version 1 (TxID=100, committed)        │
│  ┌─────────────────────────────┐        │
│  │ name="Charles", age=29      │        │
│  │ xmin=100, xmax=120          │        │
│  └─────────────────────────────┘        │
└─────────────────────────────────────────┘

Visibility Rule:
  A version is visible to TxID T if:
    xmin is committed AND xmin < T
    AND (xmax is not set OR xmax > T OR xmax is aborted)
```

**Approaches**:
- **Append-Only (PostgreSQL)**: New versions stored in main heap; old versions cleaned by VACUUM
- **In-Place Update (MySQL/InnoDB)**: Current version in-place; old versions in undo log/rollback segment
- **Delta Storage**: Store base version + deltas

### 6. Write-Ahead Log (WAL)
**Definition**: Sequential log of all modifications written to stable storage before the actual data pages are modified.

```
WAL Architecture:
┌──────────────────────────────────────────────┐
│                  WAL Buffer                   │
│  [Record1][Record2][Record3][Record4]...      │
└──────────────────┬───────────────────────────┘
                   │ fsync on commit
                   ▼
┌──────────────────────────────────────────────┐
│              WAL Segment Files                │
│  wal_000001 → wal_000002 → wal_000003 → ...  │
│  (sequential writes, append-only)             │
└──────────────────────────────────────────────┘

WAL Record Format:
┌────────┬────────┬──────┬────────┬──────────┬──────┐
│ LSN    │ TxID   │ Type │ PageID │ Offset   │ Data │
│ (8B)   │ (8B)   │ (1B) │ (4B)  │ (2B)     │(var) │
└────────┴────────┴──────┴────────┴──────────┴──────┘

Recovery Process:
  1. Find last checkpoint LSN
  2. REDO: Replay all WAL records from checkpoint forward
  3. UNDO: Roll back any uncommitted transactions
  → ARIES (Algorithm for Recovery and Isolation Exploiting Semantics)
```

### 7. Indexing

#### B-Tree Index
- Default index type for most RDBMS
- Supports equality and range queries
- O(log N) lookup, insert, delete
- Ordered traversal for ORDER BY optimization

#### Hash Index
- O(1) average-case equality lookups
- No range query support
- Good for join hash tables and equality-only workloads
- Used by: PostgreSQL (hash index), MySQL MEMORY engine

#### GIN (Generalized Inverted Index)
- Maps values to sets of rows containing that value
- Ideal for full-text search, array containment, JSONB queries
- Multiple keys per row
- Used by: PostgreSQL for tsvector, jsonb, arrays

#### GiST (Generalized Search Tree)
- Balanced tree supporting arbitrary data types
- Used for geometric data, range types, full-text search
- Supports nearest-neighbor queries
- Used by: PostgreSQL for PostGIS, range types

#### BRIN (Block Range Index)
- Stores min/max values per block range
- Very small index size
- Ideal for naturally ordered data (timestamps, sequential IDs)
- Used by: PostgreSQL

#### Bitmap Index
- Bit vector per distinct value
- Excellent for low-cardinality columns
- Efficient OR/AND operations
- Used by: Oracle, PostgreSQL (bitmap scan at runtime)

#### Covering Index (Index-Only Scan)
- Includes all columns needed by query in the index
- Avoids heap/table access entirely
- `CREATE INDEX idx ON t(a, b) INCLUDE (c, d)`

### 8. Joins

```
Join Algorithm Selection:
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  Nested Loop Join    ◄── Small outer table, indexed inner│
│  ┌───┐  ┌───┐            O(N × M) worst case            │
│  │ R │──│ S │            O(N × log M) with index         │
│  └───┘  └───┘                                            │
│                                                          │
│  Hash Join           ◄── Equality joins, no index needed │
│  ┌───┐  ┌───┐            O(N + M) average case           │
│  │ R │══│ S │            Build hash table on smaller side │
│  └───┘  └───┘                                            │
│                                                          │
│  Sort-Merge Join     ◄── Pre-sorted or range joins       │
│  ┌───┐  ┌───┐            O(N log N + M log M) sort       │
│  │ R │↕↕│ S │            O(N + M) merge phase            │
│  └───┘  └───┘                                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 9. Replication

```
Replication Topologies:
                                        
Single-Leader (Primary-Replica):        Multi-Leader:
   ┌────────┐                           ┌────────┐   ┌────────┐
   │Primary │                           │Leader 1│◄─▶│Leader 2│
   └───┬────┘                           └───┬────┘   └───┬────┘
   ┌───┴───┐                            ┌───┴───┐   ┌───┴───┐
   ▼       ▼                            ▼       ▼   ▼       ▼
┌──────┐┌──────┐                     ┌──────┐┌──────┐┌──────┐
│Replica││Replica│                    │Replica││Replica││Replica│
└──────┘└──────┘                     └──────┘└──────┘└──────┘

Leaderless (Quorum):
  ┌──────┐  ┌──────┐  ┌──────┐
  │Node 1│◄─▶│Node 2│◄─▶│Node 3│
  └──────┘  └──────┘  └──────┘
  Write to W nodes, Read from R nodes
  W + R > N guarantees consistency
```

**Replication Modes**:
- **Synchronous**: Primary waits for replica acknowledgment before committing
- **Asynchronous**: Primary commits immediately, replica catches up later
- **Semi-Synchronous**: Wait for at least one replica acknowledgment
- **Physical (WAL Streaming)**: Ship WAL bytes to replicas (PostgreSQL)
- **Logical**: Ship logical changes (row-level inserts/updates/deletes)
- **Statement-Based**: Ship SQL statements (fragile, non-deterministic functions)

### 10. Partitioning

**Types**:
- **Range Partitioning**: Partition by value ranges (e.g., date ranges)
- **Hash Partitioning**: Partition by hash of partition key
- **List Partitioning**: Partition by explicit value lists
- **Composite Partitioning**: Combine methods (range-hash, range-list)

```
Range Partitioning Example (by date):
┌─────────────────────────────────────────┐
│          orders (parent table)           │
├──────────────┬──────────────┬───────────┤
│ orders_2024  │ orders_2025  │orders_2026│
│ (Jan-Dec '24)│ (Jan-Dec '25)│(Jan-  '26)│
│  10M rows    │  12M rows    │  2M rows  │
└──────────────┴──────────────┴───────────┘
Partition Pruning: WHERE date = '2025-06-15'
  → Only scans orders_2025 partition
```

### 11. Views, Stored Procedures, Triggers

#### Views
- **Regular Views**: Stored query definitions, expanded at query time
- **Materialized Views**: Pre-computed result sets stored on disk, periodically refreshed
- **Updatable Views**: Views that support INSERT/UPDATE/DELETE (with restrictions)

#### Stored Procedures
- Server-side procedural logic (PL/pgSQL, PL/SQL, T-SQL)
- Reduce client-server round trips
- Encapsulate business logic
- Support control flow (IF/ELSE, LOOP, EXCEPTION handling)

#### Triggers
- Event-driven procedures fired on INSERT, UPDATE, DELETE
- BEFORE triggers: validate/modify data before write
- AFTER triggers: audit logging, cascading updates
- INSTEAD OF triggers: custom logic for views
- Row-level vs statement-level granularity

### 12. Constraints

| Constraint | Purpose | Enforcement |
|-----------|---------|-------------|
| PRIMARY KEY | Unique row identifier | Unique index + NOT NULL |
| FOREIGN KEY | Referential integrity | Lookup in referenced table |
| UNIQUE | No duplicate values | Unique index |
| CHECK | Arbitrary boolean conditions | Expression evaluation |
| NOT NULL | Disallow NULL values | Null check on write |
| EXCLUSION | No overlapping ranges | GiST index (PostgreSQL) |

### 13. Aggregation & Window Functions

**Aggregation Pipeline**:
```
Input Rows → GROUP BY hash/sort → Aggregate Functions → HAVING filter → Output

Aggregate Functions: COUNT, SUM, AVG, MIN, MAX, ARRAY_AGG, STRING_AGG,
                     PERCENTILE_CONT, PERCENTILE_DISC, MODE, STDDEV, VARIANCE

Window Functions:
  ROW_NUMBER(), RANK(), DENSE_RANK(), NTILE(n)
  LAG(), LEAD(), FIRST_VALUE(), LAST_VALUE(), NTH_VALUE()
  SUM() OVER (PARTITION BY ... ORDER BY ... ROWS/RANGE ...)
  Running totals, moving averages, cumulative distributions
```

## Architecture Patterns

### 1. Process-Per-Connection (Traditional)
**Fork or spawn a process/thread per client connection**

```
PostgreSQL Model:
┌──────────┐
│ Postmaster│ (main process)
└─────┬────┘
  ┌───┴───┐───────┐───────┐
  ▼       ▼       ▼       ▼
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│Back-│ │Back-│ │Back-│ │Back-│  (per-connection worker processes)
│end 1│ │end 2│ │end 3│ │end N│
└─────┘ └─────┘ └─────┘ └─────┘
  ▲       ▲       ▲       ▲
  └───────┴───────┴───────┘
         Shared Memory
   (buffer pool, WAL buffers, lock table)
```

**Benefits**: Process isolation, crash safety
**Drawbacks**: High memory overhead per connection, context switching

### 2. Thread Pool
**Fixed pool of worker threads handling multiple connections**

```
MySQL Model:
┌──────────────────────────┐
│     Connection Handler    │
│  (accepts connections)    │
└───────────┬──────────────┘
            ▼
┌──────────────────────────┐
│      Thread Pool          │
│  ┌──────┐ ┌──────┐ ...   │
│  │Worker│ │Worker│        │
│  │  1   │ │  2   │        │
│  └──────┘ └──────┘        │
└──────────────────────────┘
```

**Benefits**: Better resource utilization, connection multiplexing
**Drawbacks**: More complex synchronization

### 3. Shared-Nothing Distributed
**Each node owns a subset of data; coordinate via consensus**

```
CockroachDB / TiDB Model:
┌────────┐  ┌────────┐  ┌────────┐
│ SQL    │  │ SQL    │  │ SQL    │   ◄── SQL Layer (any node)
│ Node 1 │  │ Node 2 │  │ Node 3 │
└───┬────┘  └───┬────┘  └───┬────┘
    │           │           │
    ▼           ▼           ▼
┌────────┐  ┌────────┐  ┌────────┐
│Storage │  │Storage │  │Storage │   ◄── Distributed KV Store
│ Node 1 │  │ Node 2 │  │ Node 3 │       (Raft consensus per range)
└────────┘  └────────┘  └────────┘
```

## Data Flow Diagrams

### Complete Query Execution Flow
```
┌──────────┐
│  Client  │
│  (SQL)   │
└────┬─────┘
     │  SQL query string
     ▼
┌──────────────────────────────────────────────────────────┐
│                    DATABASE SERVER                         │
│                                                           │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐        │
│  │ Parser & │───▶│ Planner/ │───▶│  Executor    │        │
│  │  Lexer   │    │Optimizer │    │              │        │
│  └──────────┘    └────┬─────┘    └──────┬───────┘        │
│                       │                  │                 │
│                       ▼                  ▼                 │
│                 ┌──────────┐    ┌──────────────┐          │
│                 │Statistics│    │ Storage      │          │
│                 │ Catalog  │    │ Engine       │          │
│                 └──────────┘    └──────┬───────┘          │
│                                        │                  │
│                    ┌───────────────────┼──────────┐       │
│                    ▼                   ▼          ▼       │
│              ┌──────────┐     ┌──────────┐ ┌─────────┐   │
│              │Buffer    │     │  WAL     │ │  Index  │   │
│              │Pool      │     │  Manager │ │  Manager│   │
│              └────┬─────┘     └────┬─────┘ └─────────┘   │
│                   │                │                      │
│                   ▼                ▼                      │
│              ┌──────────┐   ┌──────────┐                 │
│              │ Disk I/O │   │ WAL Files│                 │
│              │(data files)│  │          │                 │
│              └──────────┘   └──────────┘                 │
└──────────────────────────────────────────────────────────┘
```

### Transaction Lifecycle
```
┌─────────┐
│  BEGIN   │
└────┬────┘
     ▼
┌─────────────────────────────────┐
│  Transaction Active             │
│  ┌──────────────────────┐       │
│  │ DML Operations:      │       │
│  │  INSERT → WAL + Heap │       │
│  │  UPDATE → WAL + Heap │       │
│  │  DELETE → WAL + Mark │       │
│  └──────────────────────┘       │
│            │                     │
│     ┌──────┴──────┐             │
│     ▼             ▼             │
│ ┌────────┐   ┌──────────┐      │
│ │ COMMIT │   │ ROLLBACK │      │
│ └───┬────┘   └────┬─────┘      │
│     │              │            │
│     ▼              ▼            │
│ WAL fsync     Undo changes     │
│ Release locks Release locks    │
│ Notify client Notify client    │
└─────────────────────────────────┘
```

### Buffer Pool Operation
```
Page Request Flow:
┌───────────┐    ┌──────────────────────────────────┐
│  Executor │───▶│         Buffer Pool               │
│  needs    │    │  ┌────┬────┬────┬────┬────┐      │
│  Page 42  │    │  │ P1 │ P7 │P42 │P19 │ P3 │ HIT │
│           │    │  └────┴────┴──┬─┴────┴────┘      │
└───────────┘    │               │                   │
                 │  If not found (MISS):              │
                 │    1. Choose victim page (LRU/Clock)│
                 │    2. If dirty, flush to disk       │
                 │    3. Read page 42 from disk        │
                 │    4. Place in buffer pool           │
                 └──────────────────────────────────┘
```

## Protocol Support Matrix

| Protocol | Description | Use Cases |
|----------|-------------|-----------|
| **PostgreSQL Wire Protocol** | libpq-based binary protocol | PostgreSQL, CockroachDB, YugabyteDB, Neon |
| **MySQL Protocol** | MySQL client-server protocol | MySQL, MariaDB, TiDB, Vitess, PlanetScale |
| **TDS (Tabular Data Stream)** | Microsoft SQL Server protocol | SQL Server, Azure SQL |
| **DRDA** | Distributed Relational Database Architecture | IBM Db2 |
| **ODBC** | Open Database Connectivity (API standard) | Cross-database access |
| **JDBC** | Java Database Connectivity (API standard) | Java applications |

## Configuration Model

### Hierarchical Structure
```yaml
database:
  server:
    listen_address: "0.0.0.0"
    port: 5432
    max_connections: 200
    authentication_method: "scram-sha-256"
  
  storage:
    data_directory: "/var/lib/db/data"
    wal_directory: "/var/lib/db/wal"
    page_size: 8192
    storage_engine: "btree"       # btree | lsm | columnar
  
  memory:
    shared_buffers: "4GB"
    work_mem: "64MB"
    maintenance_work_mem: "512MB"
    wal_buffers: "64MB"
    effective_cache_size: "12GB"
  
  wal:
    wal_level: "replica"          # minimal | replica | logical
    fsync: true
    synchronous_commit: "on"
    checkpoint_interval: "5min"
    max_wal_size: "2GB"
  
  replication:
    mode: "async"                 # off | async | sync | semi-sync
    max_replicas: 5
    replication_slot_management: true
  
  query:
    default_isolation_level: "read_committed"
    statement_timeout: "30s"
    enable_hashjoin: true
    enable_mergejoin: true
    enable_nestloop: true
    jit_compilation: false
  
  security:
    ssl_enabled: true
    ssl_cert_file: "/etc/db/server.crt"
    ssl_key_file: "/etc/db/server.key"
    row_level_security: false
  
  logging:
    log_level: "warning"
    log_statement: "ddl"
    log_min_duration_statement: "1000ms"
    slow_query_log: true
```

## Extension Points

### 1. Custom Data Types
```rust
trait DataType {
    fn name(&self) -> &str;
    fn oid(&self) -> u32;
    fn input(&self, text: &str) -> Result<Datum>;
    fn output(&self, datum: &Datum) -> String;
    fn binary_input(&self, bytes: &[u8]) -> Result<Datum>;
    fn binary_output(&self, datum: &Datum) -> Vec<u8>;
    fn compare(&self, a: &Datum, b: &Datum) -> Ordering;
}
```

### 2. Custom Index Access Methods
```rust
trait IndexAccessMethod {
    fn build(&mut self, tuples: impl Iterator<Item = IndexTuple>) -> Result<()>;
    fn insert(&mut self, key: &Datum, tid: TupleId) -> Result<()>;
    fn search(&self, scan_key: &ScanKey) -> Box<dyn Iterator<Item = TupleId>>;
    fn delete(&mut self, tid: TupleId) -> Result<()>;
    fn supports_operator(&self, op: Operator) -> bool;
}
```

### 3. Custom Aggregate Functions
```rust
trait AggregateFunction {
    type State;
    fn init(&self) -> Self::State;
    fn accumulate(&self, state: &mut Self::State, input: &Datum);
    fn combine(&self, a: &Self::State, b: &Self::State) -> Self::State;
    fn finalize(&self, state: &Self::State) -> Datum;
}
```

### 4. Foreign Data Wrappers
```rust
trait ForeignDataWrapper {
    fn get_foreign_rel_size(&self, table: &ForeignTable) -> RelSize;
    fn get_foreign_paths(&self, table: &ForeignTable) -> Vec<ForeignPath>;
    fn begin_foreign_scan(&mut self, table: &ForeignTable, quals: &[Qual]);
    fn iterate_foreign_scan(&mut self) -> Option<Row>;
    fn end_foreign_scan(&mut self);
    fn insert_into_foreign_table(&mut self, row: &Row) -> Result<()>;
}
```

### 5. Storage Engine Plugin
```rust
trait StorageEngine {
    fn create_table(&mut self, schema: &TableSchema) -> Result<TableHandle>;
    fn insert_row(&mut self, table: &TableHandle, row: &Row) -> Result<RowId>;
    fn update_row(&mut self, table: &TableHandle, row_id: RowId, row: &Row) -> Result<()>;
    fn delete_row(&mut self, table: &TableHandle, row_id: RowId) -> Result<()>;
    fn scan(&self, table: &TableHandle, filter: Option<&Expr>) -> Box<dyn RowIterator>;
    fn begin_transaction(&mut self) -> Result<TxId>;
    fn commit(&mut self, tx: TxId) -> Result<()>;
    fn rollback(&mut self, tx: TxId) -> Result<()>;
}
```

## Security Considerations

### 1. Authentication
- **Password-based**: SCRAM-SHA-256 (preferred), MD5 (legacy)
- **Certificate-based**: Client SSL certificates
- **LDAP/Kerberos**: Enterprise directory integration
- **PAM/GSSAPI**: System-level authentication modules
- **Trust/Reject**: Per-network access rules (pg_hba.conf model)

### 2. Authorization
- **Role-Based Access Control (RBAC)**: GRANT/REVOKE on tables, schemas, functions
- **Row-Level Security (RLS)**: Policies restricting which rows a user can see/modify
- **Column-Level Privileges**: Grant SELECT on specific columns only
- **Schema-Level Isolation**: Multi-tenant schema separation

### 3. Data Protection
- **Encryption at Rest**: Transparent Data Encryption (TDE) for data files
- **Encryption in Transit**: TLS for client-server connections
- **Data Masking**: Dynamic masking of sensitive columns
- **Audit Logging**: Record all DDL, DML, and access events

### 4. SQL Injection Prevention
- **Prepared Statements**: Parameterized queries with bind variables
- **Input Validation**: Server-side type checking and sanitization
- **Least Privilege**: Minimal permissions per application role

## Performance Targets

### OLTP Workload (TPC-C Style)
| Metric | Target | Minimum |
|--------|--------|---------|
| Transactions/second (single node) | 10,000 TPS | 5,000 TPS |
| Point query latency P50 | < 1ms | < 5ms |
| Point query latency P99 | < 10ms | < 50ms |
| Insert latency P50 | < 2ms | < 10ms |
| Concurrent connections | 500 | 200 |

### OLAP Workload (TPC-H Style, 10GB)
| Metric | Target | Minimum |
|--------|--------|---------|
| Simple aggregation query | < 1s | < 5s |
| Complex join query | < 10s | < 30s |
| Full table scan (10M rows) | < 5s | < 15s |

### Resource Utilization
| Metric | Target | Maximum |
|--------|--------|---------|
| Memory per connection | < 10MB | 50MB |
| WAL write throughput | > 100MB/s | 50MB/s |
| Checkpoint duration | < 30s | 120s |
| Crash recovery time | < 60s | 300s |

## Implementation Architecture

### Core Components
1. **SQL Parser**: Tokenizer, grammar parser, AST builder
2. **Catalog Manager**: Schema metadata, statistics, system tables
3. **Query Optimizer**: Cost-based optimizer with statistics
4. **Query Executor**: Volcano/vectorized execution engine
5. **Storage Engine**: Page manager, heap/index access methods
6. **Buffer Pool Manager**: Shared page cache with eviction policies
7. **WAL Manager**: Write-ahead logging, recovery, replication
8. **Lock Manager**: Row/table locks, deadlock detection
9. **Transaction Manager**: MVCC, isolation levels, commit/abort
10. **Connection Handler**: Protocol parsing, authentication, session state
11. **Replication Manager**: WAL shipping, logical decoding, failover
12. **Background Workers**: Autovacuum, statistics collector, checkpointer

### Data Structures
```rust
// Page layout (8KB default)
struct Page {
    header: PageHeader,        // 24 bytes: LSN, checksum, flags, free space pointers
    line_pointers: Vec<ItemId>,// 4 bytes each: offset + length to tuple
    // ... free space ...
    tuples: Vec<HeapTuple>,    // Actual row data, growing from end of page
}

// Heap tuple (row) layout
struct HeapTuple {
    t_xmin: TransactionId,     // Creating transaction
    t_xmax: TransactionId,     // Deleting transaction (0 if alive)
    t_cid: CommandId,          // Command ID within transaction
    t_ctid: ItemPointer,       // Current tuple ID (self, or forwarding pointer)
    t_infomask: u16,           // Status bits (committed, aborted, has null, etc.)
    t_hoff: u8,                // Offset to user data
    t_bits: Option<BitVec>,    // Null bitmap
    data: Vec<u8>,             // Column values
}

// B-Tree index entry
struct IndexTuple {
    key: Vec<Datum>,           // Indexed column values
    tid: ItemPointer,          // Pointer to heap tuple (page, offset)
}

// Transaction state
struct Transaction {
    tx_id: TransactionId,
    isolation_level: IsolationLevel,
    state: TxState,            // Active, Committed, Aborted
    snapshot: Snapshot,         // Visible transaction set
    savepoints: Vec<Savepoint>,
    locks_held: Vec<LockEntry>,
    undo_log: Vec<UndoRecord>,
}

// Catalog entry
struct TableDef {
    oid: Oid,
    name: String,
    schema: String,
    columns: Vec<ColumnDef>,
    constraints: Vec<Constraint>,
    indexes: Vec<IndexDef>,
    triggers: Vec<TriggerDef>,
    stats: TableStatistics,
}
```

This blueprint provides the comprehensive foundation needed to implement a production-grade relational database management system with all essential features, ACID compliance, and performance requirements clearly defined.
