# Relational Database Performance Benchmarks

## Overview
This document defines comprehensive performance benchmarks and targets for relational database implementations. These benchmarks establish minimum acceptable performance thresholds across OLTP and OLAP workloads, providing standardized testing methodology based on industry-standard benchmarks like TPC-C, TPC-H, and custom database-specific tests.

## Test Environment Specifications

### Hardware Requirements
- **CPU**: 16+ cores, 2.4+ GHz (Intel Xeon or AMD EPYC class)
- **RAM**: 128GB minimum, 256GB recommended for large-scale tests
- **Storage**: NVMe SSD with 50,000+ IOPS capability
- **Network**: 10 Gbps Ethernet for distributed tests
- **Multiple identical nodes**: For replication and sharding benchmarks

### Software Environment
- **OS**: Linux (Ubuntu 22.04+ or RHEL 9+) with performance-optimized kernel
- **Filesystem**: ext4 or XFS with optimized mount options
- **I/O Scheduler**: mq-deadline or none for NVMe SSDs
- **CPU Governor**: performance mode for consistent results
- **Kernel Parameters**: Optimized for database workloads

```bash
# System optimization for database benchmarks
echo 'vm.swappiness = 1' >> /etc/sysctl.conf
echo 'vm.dirty_ratio = 10' >> /etc/sysctl.conf
echo 'vm.dirty_background_ratio = 5' >> /etc/sysctl.conf
echo 'kernel.shmmax = 68719476736' >> /etc/sysctl.conf  # 64GB
echo 'fs.file-max = 2097152' >> /etc/sysctl.conf
sysctl -p

# I/O optimization
echo mq-deadline > /sys/block/nvme0n1/queue/scheduler
echo 256 > /sys/block/nvme0n1/queue/read_ahead_kb
```

### Database Configuration Baseline
```yaml
# Standard benchmark configuration
database_config:
  shared_buffers: "64GB"              # 50% of available RAM
  work_mem: "256MB"                   # For large sort operations
  maintenance_work_mem: "4GB"         # Index builds, VACUUM
  wal_buffers: "1GB"                  # Large WAL buffer
  checkpoint_completion_target: 0.9   # Spread checkpoint I/O
  max_wal_size: "16GB"                # Allow large checkpoints
  effective_cache_size: "96GB"        # OS cache estimate
  random_page_cost: 1.1               # SSD-optimized
  seq_page_cost: 1.0                  # Sequential baseline
  max_connections: 500                # High connection limit
  max_parallel_workers: 16            # Use all cores
  max_parallel_workers_per_gather: 8  # Parallel query workers
  
  # Performance tuning
  synchronous_commit: "on"            # For OLTP durability
  full_page_writes: "on"              # Corruption protection
  wal_compression: "on"               # Compress WAL records
  track_io_timing: "on"               # Collect I/O statistics
```

## Performance Targets by Workload Type

### 1. OLTP Workload Targets (TPC-C Style)

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Transactions per Minute (tpmC)** | 100,000 | 50,000 |
| **Point Query Latency P50** | < 1ms | < 5ms |
| **Point Query Latency P95** | < 5ms | < 15ms |
| **Point Query Latency P99** | < 10ms | < 30ms |
| **Update Transaction Latency P50** | < 2ms | < 10ms |
| **Update Transaction Latency P99** | < 20ms | < 100ms |
| **Concurrent Connections** | 500 | 200 |
| **Database Size** | 100GB - 1TB | 10GB+ |

### 2. OLAP Workload Targets (TPC-H Style)

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Complex Query Runtime (Q1)** | < 30s | < 120s |
| **Simple Aggregation (Q6)** | < 5s | < 20s |
| **Multi-table Join (Q3)** | < 45s | < 180s |
| **Throughput (QphH@Size)** | 3,000 | 1,000 |
| **Data Load Rate** | 1M rows/second | 100K rows/second |
| **Parallel Scan Rate** | 2GB/second | 500MB/second |
| **Working Set** | 100GB - 10TB | 1GB+ |

### 3. Mixed Workload Targets

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **OLTP TPS during OLAP** | 50,000 | 20,000 |
| **OLAP degradation** | < 50% | < 100% |
| **Lock contention ratio** | < 1% | < 5% |
| **Resource isolation** | Configurable | Basic |

## Detailed Benchmark Tests

### 1. TPC-C Benchmark Implementation

#### Benchmark Overview
TPC-C simulates a wholesale supplier managing orders through terminals. It includes 5 transaction types with specific frequency distributions and response time requirements.

#### Schema (Simplified)
```sql
-- Warehouse (scaling factor)
CREATE TABLE warehouse (
    w_id INTEGER PRIMARY KEY,
    w_name VARCHAR(10),
    w_street_1 VARCHAR(20),
    w_street_2 VARCHAR(20), 
    w_city VARCHAR(20),
    w_state CHAR(2),
    w_zip CHAR(9),
    w_tax DECIMAL(4,4),
    w_ytd DECIMAL(12,2)
);

-- District (10 per warehouse)  
CREATE TABLE district (
    d_id INTEGER,
    d_w_id INTEGER,
    d_name VARCHAR(10),
    d_street_1 VARCHAR(20),
    d_street_2 VARCHAR(20),
    d_city VARCHAR(20),
    d_state CHAR(2),
    d_zip CHAR(9),
    d_tax DECIMAL(4,4),
    d_ytd DECIMAL(12,2),
    d_next_o_id INTEGER,
    PRIMARY KEY (d_w_id, d_id),
    FOREIGN KEY (d_w_id) REFERENCES warehouse(w_id)
);

-- Customer (3000 per district)
CREATE TABLE customer (
    c_id INTEGER,
    c_d_id INTEGER,
    c_w_id INTEGER,
    c_first VARCHAR(16),
    c_middle CHAR(2),
    c_last VARCHAR(16),
    c_street_1 VARCHAR(20),
    c_street_2 VARCHAR(20),
    c_city VARCHAR(20),
    c_state CHAR(2),
    c_zip CHAR(9),
    c_phone CHAR(16),
    c_since TIMESTAMP,
    c_credit CHAR(2),
    c_credit_lim DECIMAL(12,2),
    c_discount DECIMAL(4,4),
    c_balance DECIMAL(12,2),
    c_ytd_payment DECIMAL(12,2),
    c_payment_cnt INTEGER,
    c_delivery_cnt INTEGER,
    c_data TEXT,
    PRIMARY KEY (c_w_id, c_d_id, c_id),
    FOREIGN KEY (c_w_id, c_d_id) REFERENCES district(d_w_id, d_id)
);

-- Additional tables: item, stock, orders, order_line, new_orders, history
```

#### Transaction Mix
- **New Order**: 45% (read-write, high contention)
- **Payment**: 43% (read-write, medium contention)  
- **Order Status**: 4% (read-only)
- **Delivery**: 4% (read-write, batch)
- **Stock Level**: 4% (read-only, analytical)

#### Test: `benchmark_tpc_c_full`
**Purpose**: Measure complete TPC-C performance with all 5 transaction types
**Configuration**:
- Scale Factor: 100 warehouses (≈10GB database)
- Concurrent Users: 10 per warehouse (1000 total)
- Test Duration: 30 minutes steady state after 10 minute ramp-up

**Execution Process**:
```bash
# Database setup
./tpcc_load --warehouses=100 --connections=20
./db_analyze_all_tables  # Update statistics

# Benchmark run
./tpcc_run \
  --warehouses=100 \
  --connections=1000 \
  --rampup=600 \
  --duration=1800 \
  --report-interval=10 \
  --detailed-stats

# Example output
# Warehouses: 100
# Connections: 1000  
# Ramp-up: 600 seconds
# Test duration: 1800 seconds
# 
# Transaction Mix:
#   New Order: 45.1% (89,234 txn, 49.6 txn/min avg)
#   Payment: 42.8% (84,672 txn, 47.0 txn/min avg)
#   Order Status: 4.0% (7,901 txn)
#   Delivery: 4.1% (8,123 txn)
#   Stock Level: 4.0% (7,890 txn)
# 
# Total: 197,820 transactions
# TpmC: 98,910 (target: 100,000+)
```

**Measurements**:
- **TpmC (Transactions per minute C)**: Primary metric
- **Response Times**: P50, P95, P99 for each transaction type  
- **Throughput Stability**: Coefficient of variation over time
- **Resource Utilization**: CPU, memory, I/O during test
- **Lock Contention**: Lock wait events per transaction
- **Checkpoint Impact**: Performance during checkpoint operations

#### Test: `benchmark_tpc_c_contention`
**Purpose**: Measure performance under high contention scenarios
**Configuration**: Reduced warehouse count to increase contention
- Scale Factor: 10 warehouses (high contention)
- Concurrent Users: 50 per warehouse (500 total)
- Focus on New Order transaction (highest contention)

**Expected Results**:
- TpmC decreases due to lock contention
- Response time P99 increases significantly  
- Database should remain stable and not deadlock excessively

### 2. TPC-H Benchmark Implementation

#### Benchmark Overview  
TPC-H simulates decision support workloads with complex analytical queries over a denormalized star schema representing a wholesale supplier database.

#### Schema (Key Tables)
```sql
-- Part table
CREATE TABLE part (
    p_partkey INTEGER PRIMARY KEY,
    p_name VARCHAR(55),
    p_mfgr CHAR(25),
    p_brand CHAR(10),
    p_type VARCHAR(25),
    p_size INTEGER,
    p_container CHAR(10),
    p_retailprice DECIMAL(15,2),
    p_comment VARCHAR(23)
);

-- Supplier table  
CREATE TABLE supplier (
    s_suppkey INTEGER PRIMARY KEY,
    s_name CHAR(25),
    s_address VARCHAR(40),
    s_nationkey INTEGER,
    s_phone CHAR(15),
    s_acctbal DECIMAL(15,2),
    s_comment VARCHAR(101)
);

-- Lineitem table (largest, fact table)
CREATE TABLE lineitem (
    l_orderkey INTEGER,
    l_partkey INTEGER,
    l_suppkey INTEGER,
    l_linenumber INTEGER,
    l_quantity DECIMAL(15,2),
    l_extendedprice DECIMAL(15,2),
    l_discount DECIMAL(15,2),
    l_tax DECIMAL(15,2),
    l_returnflag CHAR(1),
    l_linestatus CHAR(1),
    l_shipdate DATE,
    l_commitdate DATE,
    l_receiptdate DATE,
    l_shipinstruct CHAR(25),
    l_shipmode CHAR(10),
    l_comment VARCHAR(44),
    PRIMARY KEY (l_orderkey, l_linenumber)
);

-- Additional tables: orders, customer, nation, region
```

#### Test: `benchmark_tpc_h_power_test`
**Purpose**: Single-stream query execution performance
**Configuration**:
- Scale Factor: SF=100 (≈100GB database)
- Query Stream: All 22 TPC-H queries in sequence
- Execution: Single connection, no parallel execution

**Sample Queries**:

**Q1 - Pricing Summary Report** (Aggregation Heavy):
```sql
SELECT 
    l_returnflag,
    l_linestatus,
    SUM(l_quantity) as sum_qty,
    SUM(l_extendedprice) as sum_base_price,
    SUM(l_extendedprice * (1 - l_discount)) as sum_disc_price,
    SUM(l_extendedprice * (1 - l_discount) * (1 + l_tax)) as sum_charge,
    AVG(l_quantity) as avg_qty,
    AVG(l_extendedprice) as avg_price,
    AVG(l_discount) as avg_disc,
    COUNT(*) as count_order
FROM lineitem
WHERE l_shipdate <= DATE '1998-12-01' - INTERVAL '120' DAY
GROUP BY l_returnflag, l_linestatus
ORDER BY l_returnflag, l_linestatus;
```

**Q3 - Shipping Priority** (Join Heavy):
```sql
SELECT 
    l_orderkey,
    SUM(l_extendedprice * (1 - l_discount)) as revenue,
    o_orderdate,
    o_shippriority
FROM customer, orders, lineitem
WHERE c_mktsegment = 'AUTOMOBILE'
  AND c_custkey = o_custkey
  AND l_orderkey = o_orderkey
  AND o_orderdate < DATE '1995-03-15'
  AND l_shipdate > DATE '1995-03-15'
GROUP BY l_orderkey, o_orderdate, o_shippriority
ORDER BY revenue DESC, o_orderdate
LIMIT 10;
```

**Execution Process**:
```bash
# Database setup
./tpch_dbgen -s 100          # Generate 100GB dataset
./tpch_load_parallel --scale=100 --workers=16
./db_create_indexes_tpch
./db_analyze_all_tables

# Run power test (single stream)
for query in {1..22}; do
    echo "Executing Q${query}..."
    time ./run_query "Q${query}.sql" > Q${query}_results.txt
done

# Calculate geometric mean of execution times
./calculate_power_metric Q*_results.txt
```

**Performance Targets**:

| Query | Type | Target Time | Max Acceptable |
|-------|------|-------------|----------------|
| Q1 | Aggregation | < 30s | < 120s |
| Q2 | Complex Join | < 15s | < 60s |
| Q3 | Join + Group | < 45s | < 180s |
| Q4 | Semi-join | < 20s | < 80s |
| Q5 | Multi-join | < 25s | < 100s |
| Q6 | Simple Filter | < 5s | < 20s |
| ... | ... | ... | ... |
| Q22 | Subquery | < 10s | < 40s |

#### Test: `benchmark_tpc_h_throughput_test`
**Purpose**: Multi-stream concurrent query execution
**Configuration**:
- Scale Factor: SF=100 
- Concurrent Streams: 4 parallel query streams
- Query Mix: Each stream runs randomized query order
- Measurement: Total queries completed per hour

**Execution Process**:
```bash
# Run 4 concurrent streams for 1 hour
./tpch_throughput_test \
  --scale=100 \
  --streams=4 \
  --duration=3600 \
  --random-seed=12345

# Example output:
# Stream 1: 87 queries completed
# Stream 2: 91 queries completed  
# Stream 3: 89 queries completed
# Stream 4: 85 queries completed
# Total: 352 queries in 3600 seconds
# QphH@100: 352 (target: 1000+)
```

### 3. Custom Database Benchmarks

#### Test: `benchmark_insert_throughput`
**Purpose**: Measure bulk insert performance
**Configuration**:
- Table: Simple schema with 10 columns (mix of types)
- Batch Sizes: 1, 100, 1000, 10000 rows per transaction
- Total Rows: 10 million rows
- Concurrent Loaders: 1, 4, 8, 16 threads

**Test Process**:
```bash
# Single-threaded insert test
./insert_benchmark \
  --rows=10000000 \
  --batch-size=1000 \
  --threads=1 \
  --table=benchmark_insert

# Multi-threaded insert test  
./insert_benchmark \
  --rows=10000000 \
  --batch-size=1000 \
  --threads=16 \
  --table=benchmark_insert_mt
```

**Expected Results**:

| Threads | Batch Size | Target Rate | Min Acceptable |
|---------|------------|-------------|----------------|
| 1 | 1000 | 50K rows/sec | 20K rows/sec |
| 4 | 1000 | 150K rows/sec | 60K rows/sec |
| 8 | 1000 | 250K rows/sec | 100K rows/sec |
| 16 | 1000 | 400K rows/sec | 150K rows/sec |

#### Test: `benchmark_index_build_performance`
**Purpose**: Measure index creation speed and concurrency impact
**Setup**:
- Base Table: 100 million rows, 50GB size
- Index Types: B-tree, Hash (if supported), Partial, Multi-column
- Concurrent Activity: OLTP workload during index build

**Test Scenarios**:
1. **Offline Index Build**: No concurrent activity
2. **Online Index Build**: Concurrent INSERT/UPDATE/DELETE operations
3. **Multiple Index Build**: Create 5 indexes simultaneously

```sql
-- Test index builds
CREATE INDEX CONCURRENTLY idx_customer_name ON customer(c_last, c_first);
CREATE INDEX CONCURRENTLY idx_orders_date ON orders(o_orderdate);
CREATE INDEX CONCURRENTLY idx_lineitem_ship ON lineitem(l_shipdate)
  WHERE l_shipdate >= '2020-01-01';
```

**Measurements**:
- Index build time vs table size
- Impact on concurrent transaction throughput
- Memory usage during build process
- Disk I/O patterns and efficiency

#### Test: `benchmark_vacuum_performance`
**Purpose**: Measure VACUUM/garbage collection performance
**Setup**:
- Table: 10GB with 50% dead tuples from updates/deletes
- VACUUM Types: Standard VACUUM, VACUUM FULL, Auto-vacuum
- Concurrent Load: Measure impact on active queries

**Test Process**:
```bash
# Create table with dead tuples
./create_fragmented_table --size=10GB --dead-ratio=0.5

# Measure standard VACUUM
time ./run_vacuum --type=standard --table=fragmented_test

# Measure VACUUM FULL  
time ./run_vacuum --type=full --table=fragmented_test

# Measure auto-vacuum effectiveness
./monitor_autovacuum --duration=3600
```

**Performance Targets**:
- VACUUM rate: > 100MB/second
- VACUUM FULL rate: > 50MB/second  
- Concurrent query degradation: < 20% during VACUUM
- Space reclamation efficiency: > 95% of dead space recovered

### 4. Concurrency and Isolation Benchmarks

#### Test: `benchmark_lock_contention`
**Purpose**: Measure performance under high lock contention
**Configuration**:
- Hot Spot Table: 1000 rows frequently updated
- Concurrent Threads: 50-200 threads updating same rows
- Transaction Types: Point updates, range updates, read operations

**Execution**:
```bash
./lock_contention_test \
  --hot-rows=1000 \
  --threads=100 \
  --duration=600 \
  --update-ratio=0.8 \
  --read-ratio=0.2
```

**Measurements**:
- Transactions per second under contention
- Lock wait time distribution
- Deadlock frequency and resolution time
- Fairness of lock acquisition

#### Test: `benchmark_isolation_overhead`
**Purpose**: Measure performance overhead of different isolation levels
**Configuration**:
- Workload: TPC-C style mixed read-write
- Isolation Levels: READ COMMITTED, REPEATABLE READ, SERIALIZABLE
- Concurrent Users: 100 connections

**Expected Overhead**:
- READ COMMITTED → REPEATABLE READ: < 10% degradation
- REPEATABLE READ → SERIALIZABLE: < 30% degradation
- Serialization failure rate: < 5% at SERIALIZABLE

### 5. Memory and I/O Performance Tests

#### Test: `benchmark_buffer_pool_efficiency`
**Purpose**: Measure buffer pool hit ratio under various workloads
**Configuration**:
- Database Size: 200GB (2x buffer pool size)
- Buffer Pool: 100GB
- Workloads: Sequential scan, random access, mixed

**Test Process**:
```bash
# Sequential scan workload
./workload_generator \
  --type=sequential-scan \
  --tables=large_table \
  --duration=1800

# Random access workload  
./workload_generator \
  --type=random-access \
  --selectivity=0.01 \
  --duration=1800

# Mixed workload
./workload_generator \
  --type=mixed \
  --oltp-ratio=0.7 \
  --olap-ratio=0.3 \
  --duration=1800
```

**Target Metrics**:
- Sequential scan: Buffer hit ratio > 60%
- Random access: Buffer hit ratio > 95%
- Mixed workload: Buffer hit ratio > 90%

#### Test: `benchmark_wal_performance`**
**Purpose**: Measure WAL write performance and impact on transactions
**Configuration**:
- WAL Modes: fsync, fdatasync, open_sync
- Group Commit: Enabled/disabled
- Concurrent Writers: 1, 10, 50, 100

**Measurements**:
- WAL write throughput (MB/s)
- Transaction commit latency
- Group commit efficiency
- Checkpoint impact on transaction latency

### 6. Replication Performance Tests

#### Test: `benchmark_replication_lag`
**Purpose**: Measure replication lag under various load conditions
**Setup**:
- Primary-replica pair with network latency simulation
- Workloads: Insert-heavy, update-heavy, mixed
- Network Conditions: LAN, WAN, intermittent connectivity

**Test Process**:
```bash
# High throughput insert test
./replication_lag_test \
  --workload=insert-heavy \
  --rate=10000-tps \
  --duration=1800 \
  --network-delay=50ms

# Monitor replication lag
./monitor_replication_lag \
  --sample-interval=1s \
  --alert-threshold=10s
```

**Performance Targets**:
- Average lag: < 1 second under normal load
- Maximum lag: < 10 seconds during peak load
- Catch-up time: < 2x lag duration after load reduction

#### Test: `benchmark_failover_time`
**Purpose**: Measure failover speed and data consistency
**Configuration**:
- Automatic failover system
- Various failure types: Process crash, network partition, server failure

**Measurements**:
- Detection time: How quickly failure is detected
- Promotion time: Time to promote replica
- Client reconnection time: Application recovery time
- Data loss: Measure committed transactions lost (should be 0)

## Stress Testing

### 1. Resource Exhaustion Tests
**Test: `benchmark_memory_pressure`**
- Gradually increase memory pressure until performance degrades
- Measure graceful degradation vs catastrophic failure
- Test swap behavior and OOM handling

**Test: `benchmark_disk_space_exhaustion`**
- Fill disk to 95%+ capacity
- Measure impact on database operations
- Test recovery after space is freed

**Test: `benchmark_connection_limits`**
- Scale connections from 100 to maximum supported
- Measure memory usage per connection
- Test connection pooling efficiency

### 2. Long-Running Stability Tests
**Test: `benchmark_24_hour_stability`**
**Purpose**: Verify performance stability over extended periods
**Configuration**:
- Duration: 24-48 hours continuous operation
- Mixed workload: 70% OLTP, 30% OLAP queries
- Monitoring: Resource usage, performance metrics, error rates

**Success Criteria**:
- < 5% performance degradation over time
- No memory leaks detected
- Error rate remains < 0.01%
- No database corruption

## Performance Analysis and Reporting

### Metrics Collection
All benchmarks must collect these metrics:

#### Database Metrics
```
transactions_per_second
queries_per_second  
connection_count
active_connections
lock_waits_per_second
deadlocks_per_minute
checkpoint_duration
wal_write_rate
buffer_hit_ratio
cache_miss_ratio
```

#### System Metrics
```  
cpu_usage_percent
memory_usage_percent
disk_read_iops
disk_write_iops
disk_read_mbps
disk_write_mbps
network_read_mbps
network_write_mbps
context_switches_per_second
page_faults_per_second
```

#### Application Metrics
```
response_time_p50
response_time_p95
response_time_p99
response_time_max
error_rate_percent
throughput_variance
```

### Benchmark Report Format
```markdown
# Database Performance Benchmark Results

## Test Configuration
- **Date**: 2024-01-15
- **Database Version**: v2.1.0
- **Test Duration**: 1800 seconds
- **Hardware**: 16-core Xeon, 256GB RAM, NVMe SSD
- **Scale Factor**: TPC-C 100 warehouses

## Results Summary
| Benchmark | Target | Actual | Status |
|-----------|--------|--------|--------|
| TPC-C tpmC | 100,000 | 127,543 | ✅ PASS |
| TPC-H QphH@100 | 3,000 | 2,847 | ⚠️  NEAR |
| Point Query P99 | < 10ms | 8.2ms | ✅ PASS |
| Insert Rate | 1M rows/sec | 1.3M rows/sec | ✅ PASS |

## Detailed Analysis
...
```

### Performance Regression Testing
- **Baseline Establishment**: Record performance baselines for each release
- **Automated Testing**: Run core benchmarks on every build
- **Regression Alerts**: Flag performance decreases > 10%
- **Performance History**: Track performance trends over time

### Continuous Benchmarking Pipeline
```yaml
# Example CI pipeline for performance testing
performance_tests:
  stage: benchmark
  trigger: 
    - schedule: nightly
    - merge_request: performance-related changes
  
  script:
    - ./setup_benchmark_environment.sh
    - ./run_tpc_c_benchmark.sh --scale=10 --duration=600
    - ./run_custom_benchmarks.sh --quick-mode
    - ./analyze_results.sh
    - ./compare_with_baseline.sh
  
  artifacts:
    reports:
      performance: benchmark_results.json
  
  only:
    variables:
      - $PERFORMANCE_TESTING == "enabled"
```

This comprehensive benchmark specification ensures consistent, reproducible performance validation of relational database implementations across all major workload patterns and stress scenarios.