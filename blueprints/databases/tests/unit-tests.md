# Relational Database Unit Tests Specification

## Overview
This document defines comprehensive unit test requirements for any relational database implementation. Every test MUST pass for the implementation to be considered complete and production-ready. These tests cover SQL parsing, query execution, transaction isolation, constraint enforcement, index operations, and replication correctness.

## Test Categories

### 1. SQL Parser Tests

#### 1.1 Lexer Tests
**Test: `test_tokenize_basic_sql`**
- **Purpose**: Verify lexer correctly tokenizes basic SQL statements
- **Input**: `"SELECT name, age FROM users WHERE id = 42;"`
- **Expected tokens**: 
  ```
  [SELECT, IDENTIFIER("name"), COMMA, IDENTIFIER("age"), FROM, 
   IDENTIFIER("users"), WHERE, IDENTIFIER("id"), EQ, INTEGER(42), SEMICOLON]
  ```
- **Assert**: Token sequence matches expected output exactly

**Test: `test_tokenize_string_literals`**
- **Purpose**: Verify string literal parsing with escape sequences
- **Input**: `"INSERT INTO table VALUES ('Bob''s data', 'Line1\nLine2');"`
- **Assert**: String literals correctly handle single quote escaping and escape sequences

**Test: `test_tokenize_numeric_literals`**
- **Purpose**: Verify numeric literal parsing
- **Input**: `"SELECT 42, 3.14159, 1.23e-4, 0xFF, 0b1010;"`
- **Assert**: All numeric formats parsed correctly (integer, float, scientific, hex, binary)

**Test: `test_tokenize_keywords_case_insensitive`**
- **Purpose**: Verify SQL keywords are case-insensitive
- **Input**: `"select * from TABLE where Name = 'test';"`
- **Assert**: Keywords recognized regardless of case

**Test: `test_tokenize_quoted_identifiers`**
- **Purpose**: Verify quoted identifier handling
- **Input**: `"SELECT \"Column Name\", \"table\".\"field\" FROM \"My Table\";"`
- **Assert**: Quoted identifiers preserved with exact case and special characters

#### 1.2 Parser Tests
**Test: `test_parse_simple_select`**
- **Purpose**: Verify basic SELECT statement parsing
- **Input**: `"SELECT name, age FROM users WHERE active = true ORDER BY name;"`
- **Expected AST**:
  ```
  SelectStatement {
    columns: [Column("name"), Column("age")],
    from: [Table("users")],
    where: Some(BinaryOp(Column("active"), Eq, Literal(Boolean(true)))),
    order_by: [OrderBy(Column("name"), Asc)],
    ...
  }
  ```
- **Assert**: AST structure matches expected

**Test: `test_parse_complex_joins`**
- **Purpose**: Verify complex JOIN parsing
- **Input**: 
  ```sql
  SELECT u.name, p.title, c.name as company
  FROM users u
  LEFT JOIN posts p ON u.id = p.author_id
  INNER JOIN companies c ON u.company_id = c.id
  WHERE u.active = true;
  ```
- **Assert**: Join types, conditions, and aliases correctly parsed

**Test: `test_parse_subqueries`**
- **Purpose**: Verify subquery parsing in various contexts
- **Input**: 
  ```sql
  SELECT name FROM users 
  WHERE id IN (SELECT author_id FROM posts WHERE published = true)
    AND age > (SELECT AVG(age) FROM users WHERE active = true);
  ```
- **Assert**: Nested subqueries parsed correctly in WHERE clause

**Test: `test_parse_window_functions`**
- **Purpose**: Verify window function parsing
- **Input**: 
  ```sql
  SELECT name, salary, 
         ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) as rank,
         AVG(salary) OVER (PARTITION BY dept) as avg_dept_salary
  FROM employees;
  ```
- **Assert**: OVER clauses with PARTITION BY and ORDER BY parsed correctly

**Test: `test_parse_cte_recursive`**
- **Purpose**: Verify Common Table Expression parsing including recursive CTEs
- **Input**:
  ```sql
  WITH RECURSIVE employee_hierarchy AS (
    SELECT id, name, manager_id, 0 as level
    FROM employees WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.name, e.manager_id, eh.level + 1
    FROM employees e
    JOIN employee_hierarchy eh ON e.manager_id = eh.id
  )
  SELECT * FROM employee_hierarchy ORDER BY level, name;
  ```
- **Assert**: Recursive CTE structure correctly parsed

#### 1.3 Semantic Analysis Tests
**Test: `test_semantic_column_resolution`**
- **Purpose**: Verify column name resolution across tables
- **Setup**: Tables `users(id, name, email)` and `posts(id, title, author_id)`
- **Input**: `"SELECT name, title FROM users JOIN posts ON users.id = posts.author_id;"`
- **Assert**: Column references resolved to correct table.column

**Test: `test_semantic_ambiguous_column_error`**
- **Purpose**: Verify ambiguous column name detection
- **Setup**: Tables `users(id, name)` and `companies(id, name)`
- **Input**: `"SELECT name FROM users JOIN companies ON users.company_id = companies.id;"`
- **Assert**: SemanticError raised for ambiguous "name" column

**Test: `test_semantic_type_checking`**
- **Purpose**: Verify type compatibility in expressions
- **Input**: `"SELECT name + 42 FROM users;"`  (string + integer)
- **Assert**: Type error raised or implicit cast applied based on SQL standard

**Test: `test_semantic_aggregate_grouping_validation`**
- **Purpose**: Verify GROUP BY validation for non-aggregated columns
- **Input**: `"SELECT name, COUNT(*) FROM users;"`  (name not in GROUP BY)
- **Assert**: Error raised for non-aggregated column in SELECT without GROUP BY

### 2. Query Execution Tests

#### 2.1 Scan Operators
**Test: `test_sequential_scan`**
- **Purpose**: Verify sequential table scan functionality
- **Setup**: Table with 1000 rows, 10 columns
- **Action**: Execute `"SELECT * FROM table;"`
- **Assert**: All 1000 rows returned in storage order

**Test: `test_sequential_scan_with_filter`**
- **Purpose**: Verify filter predicate application during scan
- **Setup**: Table with rows where id = 1..1000
- **Action**: Execute `"SELECT * FROM table WHERE id % 10 = 0;"`
- **Assert**: Exactly 100 rows returned (id = 10, 20, 30, ..., 1000)

**Test: `test_index_scan`**
- **Purpose**: Verify index scan with equality predicate
- **Setup**: Table with B-tree index on `id` column
- **Action**: Execute `"SELECT * FROM table WHERE id = 42;"`
- **Assert**: 
  - Index scan plan chosen by optimizer
  - Correct row returned
  - Only relevant index pages accessed

**Test: `test_index_range_scan`**
- **Purpose**: Verify index range scan
- **Setup**: Table with 10000 rows, B-tree index on `created_date`
- **Action**: Execute `"SELECT * FROM table WHERE created_date BETWEEN '2024-01-01' AND '2024-01-31';"`
- **Assert**: Only rows in date range returned, index range scan used

#### 2.2 Join Operators
**Test: `test_nested_loop_join`**
- **Purpose**: Verify nested loop join implementation
- **Setup**: 
  - Table A: 100 rows
  - Table B: 50 rows  
  - No indexes on join columns
- **Action**: Execute `"SELECT * FROM A JOIN B ON A.key = B.key;"`
- **Assert**: 
  - Nested loop join plan chosen
  - Correct join results produced
  - Inner table scanned once per outer row

**Test: `test_hash_join`**
- **Purpose**: Verify hash join implementation
- **Setup**: 
  - Table A: 10000 rows
  - Table B: 5000 rows
  - Equi-join condition
- **Action**: Execute `"SELECT * FROM A JOIN B ON A.key = B.key;"`
- **Assert**: 
  - Hash join plan chosen (smaller table as build side)
  - All matching rows returned
  - Hash table built correctly

**Test: `test_sort_merge_join`**
- **Purpose**: Verify sort-merge join implementation
- **Setup**: 
  - Pre-sorted tables on join key
  - Large tables (100K+ rows each)
- **Action**: Execute `"SELECT * FROM A JOIN B ON A.sorted_key = B.sorted_key;"`
- **Assert**: 
  - Sort-merge join plan chosen
  - Merge phase works correctly
  - No unnecessary sorting performed

**Test: `test_outer_joins`**
- **Purpose**: Verify LEFT, RIGHT, FULL OUTER join semantics
- **Setup**: 
  - Table A: [1,2,3,4]
  - Table B: [2,3,4,5]
- **Action**: Execute LEFT/RIGHT/FULL OUTER JOINs
- **Assert**: 
  - LEFT JOIN: Returns all A rows, NULL for unmatched B
  - RIGHT JOIN: Returns all B rows, NULL for unmatched A  
  - FULL OUTER: Returns all rows from both, NULL for unmatched

#### 2.3 Aggregation Operators  
**Test: `test_hash_aggregation`**
- **Purpose**: Verify hash-based GROUP BY aggregation
- **Setup**: Table with 100000 rows, 1000 distinct group values
- **Action**: Execute `"SELECT category, COUNT(*), AVG(price) FROM products GROUP BY category;"`
- **Assert**: 
  - Hash aggregation plan chosen
  - Correct aggregate values computed
  - All groups present in result

**Test: `test_sort_based_aggregation`**
- **Purpose**: Verify sort-based GROUP BY aggregation
- **Setup**: Large table, memory limited to force sorting
- **Action**: Execute `"SELECT date_part('month', created), SUM(amount) FROM orders GROUP BY 1;"`
- **Assert**: 
  - Sort-based aggregation used
  - Grouped results correct
  - Spilling to disk handled properly

**Test: `test_window_function_execution`**
- **Purpose**: Verify window function computation
- **Setup**: Employee table with salary data
- **Action**: 
  ```sql
  SELECT name, salary, 
         RANK() OVER (ORDER BY salary DESC),
         LAG(salary, 1) OVER (ORDER BY hire_date)
  FROM employees;
  ```
- **Assert**: 
  - Window frame processing correct
  - RANK and LAG functions computed accurately
  - Partitioning and ordering respected

### 3. Transaction Management Tests

#### 3.1 ACID Properties Tests
**Test: `test_atomicity_rollback`**
- **Purpose**: Verify transaction atomicity on rollback
- **Setup**: Table with initial state
- **Action**:
  ```sql
  BEGIN;
  INSERT INTO accounts (id, balance) VALUES (1, 1000);
  UPDATE accounts SET balance = balance - 500 WHERE id = 1;
  INSERT INTO accounts (id, balance) VALUES (2, 500);
  ROLLBACK;
  ```
- **Assert**: 
  - No changes visible after ROLLBACK
  - Table returns to initial state
  - No partial modifications persist

**Test: `test_atomicity_crash_recovery`**
- **Purpose**: Verify atomicity survives system crash
- **Setup**: Begin transaction, make changes, crash before commit
- **Action**: 
  1. Start transaction with multiple DML operations
  2. Simulate crash before COMMIT
  3. Restart database
- **Assert**: 
  - Recovery undoes uncommitted transaction
  - Database returns to consistent state
  - No partial changes visible

**Test: `test_consistency_constraint_enforcement`**
- **Purpose**: Verify consistency through constraint enforcement
- **Setup**: Table with CHECK constraint: `balance >= 0`
- **Action**: 
  ```sql
  BEGIN;
  INSERT INTO accounts VALUES (1, 1000);
  UPDATE accounts SET balance = -100 WHERE id = 1;  -- Should fail
  COMMIT;
  ```
- **Assert**: 
  - UPDATE fails due to CHECK constraint
  - Transaction can be rolled back cleanly
  - No invalid data persisted

**Test: `test_durability_wal_flush`**
- **Purpose**: Verify durability through WAL persistence
- **Setup**: Configure WAL flushing on commit
- **Action**: 
  1. INSERT data and COMMIT
  2. Verify WAL flushed to disk
  3. Simulate crash immediately after commit
  4. Restart and verify data present
- **Assert**: 
  - Data survives crash
  - WAL replay restores committed changes
  - No data loss occurs

#### 3.2 Isolation Level Tests
**Test: `test_read_uncommitted_dirty_reads`**
- **Purpose**: Verify READ UNCOMMITTED allows dirty reads
- **Setup**: Two concurrent transactions
- **Action**: 
  - Transaction 1: Begin, UPDATE balance = 1000
  - Transaction 2: SET ISOLATION LEVEL READ UNCOMMITTED, SELECT balance
- **Assert**: Transaction 2 sees uncommitted change from Transaction 1

**Test: `test_read_committed_no_dirty_reads`**
- **Purpose**: Verify READ COMMITTED prevents dirty reads
- **Setup**: Two concurrent transactions at READ COMMITTED
- **Action**: 
  - Transaction 1: Begin, UPDATE balance = 1000
  - Transaction 2: SELECT balance (should see old value)
  - Transaction 1: COMMIT
  - Transaction 2: SELECT balance (should see new value)
- **Assert**: 
  - Transaction 2 doesn't see uncommitted changes
  - Sees changes after Transaction 1 commits

**Test: `test_repeatable_read_phantom_prevention`**
- **Purpose**: Verify REPEATABLE READ prevents phantoms
- **Setup**: REPEATABLE READ isolation
- **Action**: 
  - Transaction 1: SELECT COUNT(*) FROM table WHERE condition
  - Transaction 2: INSERT row matching condition, COMMIT
  - Transaction 1: SELECT COUNT(*) again
- **Assert**: Transaction 1 gets same count (no phantoms)

**Test: `test_serializable_conflict_detection`**
- **Purpose**: Verify SERIALIZABLE detects read-write conflicts
- **Setup**: SERIALIZABLE isolation level
- **Action**: 
  - Transaction 1: SELECT SUM(balance) FROM accounts
  - Transaction 2: UPDATE accounts SET balance = balance + 100
  - Transaction 2: COMMIT
  - Transaction 1: INSERT based on SELECT result, COMMIT
- **Assert**: 
  - One transaction should be aborted due to serialization failure
  - Final state equivalent to some serial execution

#### 3.3 Concurrency Control Tests
**Test: `test_deadlock_detection`**
- **Purpose**: Verify deadlock detection and resolution
- **Setup**: Two transactions, two resources
- **Action**: 
  - Transaction 1: LOCK table A, wait for table B
  - Transaction 2: LOCK table B, wait for table A  
  - Create circular wait condition
- **Assert**: 
  - Deadlock detected within timeout period
  - One transaction aborted and rolled back
  - Other transaction can complete

**Test: `test_lock_escalation`**
- **Purpose**: Verify lock escalation when row locks exceed threshold
- **Setup**: Table with many rows, row-level locking enabled
- **Action**: 
  - Acquire row locks on 1000+ rows in single table
  - Verify lock escalation to table-level lock
- **Assert**: 
  - Lock memory usage remains bounded
  - Table lock acquired after threshold
  - Lock semantics remain correct

### 4. Storage Engine Tests

#### 4.1 B-Tree Index Tests
**Test: `test_btree_insert_split`**
- **Purpose**: Verify B-tree node splitting during inserts
- **Setup**: Small page size to force frequent splits
- **Action**: 
  - Insert keys in sequence: 1, 2, 3, ..., 100
  - Monitor tree structure changes
- **Assert**: 
  - Tree height increases as expected
  - Node splits maintain B-tree properties
  - All keys remain accessible

**Test: `test_btree_delete_merge`**
- **Purpose**: Verify B-tree node merging during deletes
- **Setup**: Populated B-tree index
- **Action**: 
  - Delete keys to cause underfull nodes
  - Verify node merging or redistribution
- **Assert**: 
  - Tree remains balanced
  - Node utilization stays above minimum
  - Remaining keys still accessible

**Test: `test_btree_concurrent_modifications`**
- **Purpose**: Verify concurrent B-tree access
- **Setup**: Multiple threads modifying same index
- **Action**: 
  - Concurrent inserts, deletes, and searches
  - Mix of overlapping and non-overlapping keys
- **Assert**: 
  - Index remains consistent
  - No lost updates or corruption
  - All operations complete successfully

**Test: `test_btree_recovery`**
- **Purpose**: Verify B-tree recovery after crash
- **Setup**: B-tree with ongoing modifications
- **Action**: 
  - Crash during index modification
  - Restart and verify index consistency
- **Assert**: 
  - Index structure is valid
  - All committed changes preserved
  - Incomplete changes rolled back

#### 4.2 Hash Index Tests
**Test: `test_hash_index_equality_lookup`**
- **Purpose**: Verify hash index equality searches
- **Setup**: Hash index on integer column
- **Action**: SELECT using equality predicate
- **Assert**: 
  - O(1) average lookup time
  - Correct results returned
  - Hash collisions handled properly

**Test: `test_hash_index_bucket_overflow`**
- **Purpose**: Verify handling of hash bucket overflow
- **Setup**: Hash index with small bucket size
- **Action**: Insert many values with same hash
- **Assert**: 
  - Overflow chains created correctly
  - All values remain accessible
  - Performance degrades gracefully

#### 4.3 Page Management Tests
**Test: `test_page_allocation_deallocation`**
- **Purpose**: Verify page allocation and free space tracking
- **Setup**: Empty table
- **Action**: 
  - Insert data until page full
  - Delete some records
  - Insert more data
- **Assert**: 
  - New pages allocated when needed
  - Free space reused efficiently
  - No page corruption occurs

**Test: `test_page_checksum_validation`**
- **Purpose**: Verify page checksum detection of corruption
- **Setup**: Valid data pages with checksums
- **Action**: 
  - Corrupt page data on disk
  - Attempt to read corrupted page
- **Assert**: 
  - Checksum mismatch detected
  - Error raised instead of returning corrupt data
  - Recovery mechanisms triggered

### 5. Constraint Enforcement Tests

#### 5.1 Primary Key Tests
**Test: `test_primary_key_uniqueness`**
- **Purpose**: Verify primary key uniqueness enforcement
- **Setup**: Table with PRIMARY KEY constraint
- **Action**: 
  - INSERT row with key = 1
  - INSERT another row with key = 1
- **Assert**: 
  - Second INSERT fails with unique constraint violation
  - First row remains in table
  - Transaction can be rolled back cleanly

**Test: `test_primary_key_not_null`**
- **Purpose**: Verify primary key NOT NULL enforcement
- **Setup**: Table with PRIMARY KEY constraint  
- **Action**: INSERT row with NULL primary key value
- **Assert**: 
  - INSERT fails with NOT NULL constraint violation
  - No row inserted into table

#### 5.2 Foreign Key Tests
**Test: `test_foreign_key_referential_integrity`**
- **Purpose**: Verify foreign key references valid primary key
- **Setup**: 
  - Parent table with PRIMARY KEY
  - Child table with FOREIGN KEY referencing parent
- **Action**: INSERT child row with non-existent parent key
- **Assert**: 
  - INSERT fails with foreign key constraint violation
  - Referential integrity maintained

**Test: `test_foreign_key_cascade_delete`**
- **Purpose**: Verify ON DELETE CASCADE functionality
- **Setup**: 
  - Parent-child tables with CASCADE constraint
  - Insert parent and multiple child rows
- **Action**: DELETE parent row
- **Assert**: 
  - Parent row deleted successfully
  - All related child rows automatically deleted
  - No orphaned child records remain

**Test: `test_foreign_key_cascade_update`**
- **Purpose**: Verify ON UPDATE CASCADE functionality  
- **Setup**: Parent-child tables with UPDATE CASCADE
- **Action**: UPDATE parent primary key value
- **Assert**: 
  - Parent key updated successfully
  - Child foreign key values automatically updated
  - Referential integrity maintained

#### 5.3 Check Constraints Tests
**Test: `test_check_constraint_enforcement`**
- **Purpose**: Verify CHECK constraint validation on INSERT/UPDATE
- **Setup**: Table with CHECK constraint `age >= 18`
- **Action**: 
  - INSERT row with age = 16 (should fail)
  - INSERT row with age = 25 (should succeed)
  - UPDATE age to 15 (should fail)
- **Assert**: 
  - Invalid values rejected
  - Valid values accepted
  - Constraint enforced on both INSERT and UPDATE

### 6. Index Operations Tests

#### 6.1 Index Creation Tests
**Test: `test_create_index_concurrent`**
- **Purpose**: Verify concurrent index creation
- **Setup**: Large table with ongoing DML operations
- **Action**: CREATE INDEX CONCURRENTLY on table
- **Assert**: 
  - Index builds without blocking DML
  - Index becomes available after completion
  - Index correctly reflects all data including concurrent changes

**Test: `test_unique_index_constraint`**
- **Purpose**: Verify unique index constraint enforcement
- **Setup**: Table with duplicate values
- **Action**: CREATE UNIQUE INDEX on column with duplicates
- **Assert**: 
  - Index creation fails due to duplicate values
  - Existing data remains unchanged
  - Constraint violation clearly reported

#### 6.2 Index Usage Tests
**Test: `test_index_scan_plan_selection`**
- **Purpose**: Verify optimizer chooses index scan when appropriate
- **Setup**: 
  - Table with 100,000 rows
  - Index on searchable column
- **Action**: Execute query with selective predicate
- **Assert**: 
  - Optimizer selects index scan over table scan
  - Query performance significantly improved
  - Correct results returned

**Test: `test_covering_index_optimization`**
- **Purpose**: Verify covering index (index-only scan) optimization
- **Setup**: 
  - Table with index covering all selected columns
  - Query selecting only indexed columns
- **Action**: Execute SELECT using covered columns only
- **Assert**: 
  - Index-only scan plan chosen
  - No heap access required
  - Query performance optimized

### 7. Replication Tests

#### 7.1 Physical Replication Tests  
**Test: `test_wal_streaming_replication`**
- **Purpose**: Verify WAL streaming to replica
- **Setup**: 
  - Primary database with replication enabled
  - Standby database configured for streaming
- **Action**: 
  - Make changes on primary
  - Verify replication to standby
- **Assert**: 
  - WAL records streamed to standby
  - Standby applies changes correctly
  - Minimal replication lag observed

**Test: `test_replica_failover`**
- **Purpose**: Verify replica promotion on primary failure
- **Setup**: Primary-replica pair with automatic failover
- **Action**: 
  - Simulate primary failure
  - Promote replica to primary
- **Assert**: 
  - Failover completes within SLA time
  - No data loss for committed transactions
  - Applications can reconnect to new primary

#### 7.2 Logical Replication Tests
**Test: `test_logical_replication_row_changes`**
- **Purpose**: Verify logical replication of row-level changes
- **Setup**: 
  - Source database with publication
  - Target database with subscription
- **Action**: 
  - INSERT, UPDATE, DELETE on published tables
  - Monitor replication to subscriber
- **Assert**: 
  - All row changes replicated accurately
  - Data consistency maintained
  - Conflicts handled appropriately

**Test: `test_logical_replication_schema_changes`**
- **Purpose**: Verify handling of DDL during logical replication
- **Setup**: Active logical replication
- **Action**: 
  - ADD COLUMN to replicated table
  - Continue DML operations
- **Assert**: 
  - Replication adapts to schema changes
  - No data corruption occurs
  - Backward compatibility maintained where possible

### 8. Recovery Tests

#### 8.1 Crash Recovery Tests
**Test: `test_wal_replay_after_crash`**
- **Purpose**: Verify WAL replay restores consistent state
- **Setup**: Active database with ongoing transactions
- **Action**: 
  1. Force unexpected shutdown during transactions
  2. Restart database
  3. Verify recovery process
- **Assert**: 
  - WAL replay completes successfully
  - Committed transactions preserved
  - Uncommitted transactions rolled back
  - Database reaches consistent state

**Test: `test_checkpoint_recovery`**
- **Purpose**: Verify recovery from last checkpoint
- **Setup**: Database with periodic checkpoints
- **Action**: 
  - Force crash after checkpoint
  - Restart and verify recovery time
- **Assert**: 
  - Recovery starts from last checkpoint
  - Only WAL since checkpoint replayed
  - Recovery time proportional to WAL volume

#### 8.2 Point-in-Time Recovery Tests
**Test: `test_pitr_accuracy`**
- **Purpose**: Verify point-in-time recovery precision
- **Setup**: 
  - Base backup at time T0
  - WAL archiving enabled
- **Action**: 
  - Make changes at time T1, T2, T3
  - Restore to time T2
- **Assert**: 
  - Database state exactly matches time T2
  - Changes at T3 not present
  - Changes at T1 are present

## Test Execution Framework

### Test Environment Requirements
- **Isolation**: Each test runs in isolated database instance
- **Cleanup**: All resources cleaned up after each test
- **Repeatability**: Tests produce same results on multiple runs
- **Performance**: Full test suite completes in < 30 minutes

### Test Data Management
```rust
struct TestDataManager {
    test_db: TestDatabase,
    data_generator: DataGenerator,
    cleanup_handles: Vec<CleanupHandle>,
}

impl TestDataManager {
    fn create_test_table(&mut self, name: &str, schema: TableSchema) -> TestTable {
        let table = self.test_db.create_table(name, schema);
        self.cleanup_handles.push(CleanupHandle::DropTable(name.to_string()));
        TestTable::new(table)
    }
    
    fn populate_table(&mut self, table: &TestTable, row_count: usize) {
        let rows = self.data_generator.generate_rows(table.schema(), row_count);
        table.insert_batch(rows);
    }
    
    fn cleanup(&mut self) {
        for handle in std::mem::take(&mut self.cleanup_handles) {
            handle.execute(&mut self.test_db);
        }
    }
}
```

### Performance Assertions
```rust
trait PerformanceAssert {
    fn assert_execution_time<F>(&self, f: F, max_duration: Duration)
    where F: FnOnce();
    
    fn assert_memory_usage<F>(&self, f: F, max_memory: usize)
    where F: FnOnce();
    
    fn assert_index_usage(&self, query: &str, expected_index: &str);
}
```

## Success Criteria
A relational database implementation passes unit tests if:
1. **100% test pass rate** on all applicable tests
2. **No data corruption** detected in any scenario
3. **ACID properties verified** across all transaction isolation levels
4. **Constraint enforcement** works correctly in all cases
5. **Index operations** maintain consistency and performance
6. **Replication fidelity** verified for all configured modes
7. **Recovery completeness** verified for crash and PITR scenarios
8. **Concurrency correctness** verified under load
9. **SQL standard compliance** for implemented features
10. **Performance targets met** for basic operations

### Test Coverage Requirements
- **Functional coverage**: 100% of implemented features tested
- **Error path coverage**: All error conditions tested
- **Boundary testing**: Edge cases and limits tested  
- **Stress testing**: Behavior under resource pressure tested
- **Integration testing**: Component interactions tested
- **Regression testing**: Previously fixed bugs remain fixed