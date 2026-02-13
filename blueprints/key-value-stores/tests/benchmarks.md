# Key-Value Store Performance Benchmarks

## Overview
This document defines performance benchmarks and targets for Redis/Valkey-compatible key-value store implementations. These benchmarks establish minimum acceptable performance thresholds and provide standardized testing methodology to validate production readiness.

## Test Environment Specifications

### Hardware Requirements
- **CPU**: 4+ cores, 2.5+ GHz (modern x86_64)
- **RAM**: 16GB minimum, 32GB recommended
- **Storage**: NVMe SSD for persistence tests
- **Network**: Gigabit Ethernet minimum
- **OS**: Linux (Ubuntu 22.04+ or equivalent)

### Software Environment
```bash
# System optimization for testing
echo 'net.core.somaxconn = 65535' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_max_syn_backlog = 65535' >> /etc/sysctl.conf
echo 'net.core.netdev_max_backlog = 30000' >> /etc/sysctl.conf
echo 'vm.overcommit_memory = 1' >> /etc/sysctl.conf
echo never > /sys/kernel/mm/transparent_hugepage/enabled

# Disable swap for consistent latency
swapoff -a

# CPU frequency scaling
echo performance > /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

### Key-Value Store Configuration
```yaml
# Standard benchmark configuration
bind: "0.0.0.0"
port: 6379
tcp-backlog: 511
timeout: 0
tcp-keepalive: 300

# Memory
maxmemory: "8gb"
maxmemory-policy: "noeviction"  # No eviction during benchmarks

# Persistence (disable for pure performance tests)
save: ""
appendonly: no

# Threading
io-threads: 4
io-threads-do-reads: yes

# Logging
loglevel: warning
```

## Performance Targets by Configuration

### 1. Single-Threaded Mode (Traditional Redis)
**Configuration**: Single main thread, no I/O threading

| Operation | Target RPS | Minimum RPS | P99 Latency Target | P99 Latency Max |
|-----------|------------|-------------|-------------------|------------------|
| **GET (small)** | 150,000 | 100,000 | < 0.5ms | < 1ms |
| **SET (small)** | 150,000 | 100,000 | < 0.5ms | < 1ms |
| **INCR** | 150,000 | 100,000 | < 0.5ms | < 1ms |
| **LPUSH** | 120,000 | 80,000 | < 0.8ms | < 2ms |
| **LPOP** | 120,000 | 80,000 | < 0.8ms | < 2ms |
| **SADD** | 100,000 | 70,000 | < 1ms | < 2ms |
| **ZADD** | 80,000 | 50,000 | < 1.5ms | < 3ms |
| **HSET** | 100,000 | 70,000 | < 1ms | < 2ms |

### 2. I/O Threading Mode (Redis 6.0+)
**Configuration**: I/O threads enabled (4 threads)

| Operation | Target RPS | Minimum RPS | P99 Latency Target | P99 Latency Max |
|-----------|------------|-------------|-------------------|------------------|
| **GET (small)** | 200,000 | 140,000 | < 0.4ms | < 0.8ms |
| **SET (small)** | 200,000 | 140,000 | < 0.4ms | < 0.8ms |
| **INCR** | 200,000 | 140,000 | < 0.4ms | < 0.8ms |
| **Pipeline (10 cmds)** | 500,000 | 350,000 | < 1ms | < 2ms |

### 3. Multi-Threaded Mode (DragonflyDB-style)
**Configuration**: Shared-nothing per-core architecture

| Operation | Target RPS | Minimum RPS | P99 Latency Target | P99 Latency Max |
|-----------|------------|-------------|-------------------|------------------|
| **GET (small)** | 800,000 | 500,000 | < 0.3ms | < 0.6ms |
| **SET (small)** | 800,000 | 500,000 | < 0.3ms | < 0.6ms |
| **INCR** | 800,000 | 500,000 | < 0.3ms | < 0.6ms |

## Detailed Benchmark Tests

### 1. Core Operation Benchmarks

#### Test: `benchmark_string_operations`
**Purpose**: Measure basic string operation performance
**Tool**: redis-benchmark or custom benchmarking tool

```bash
# GET performance
redis-benchmark -t get -n 1000000 -c 50 -d 64 --csv

# SET performance  
redis-benchmark -t set -n 1000000 -c 50 -d 64 --csv

# INCR performance
redis-benchmark -t incr -n 1000000 -c 50 --csv

# Custom payload sizes
for size in 1 16 64 256 1024 4096 16384; do
  redis-benchmark -t set,get -n 100000 -c 50 -d $size --csv
done
```

**Measurements**:
- Requests per second
- Latency distribution (P50, P95, P99, P99.9)
- Throughput scaling with payload size
- Memory usage during test

**Success Criteria**:
- Meet RPS targets for each operation
- P99 latency within limits
- Linear degradation with payload size
- Stable performance throughout test duration

#### Test: `benchmark_list_operations`
**Purpose**: Measure list operation performance

```bash
# List operations
redis-benchmark -t lpush,lpop -n 1000000 -c 50 --csv

# Custom list operation test
redis-benchmark -n 1000000 -c 50 \
  -P 16 \
  LPUSH mylist "item1" "item2" "item3"

# List range operations
redis-benchmark -n 100000 -c 50 \
  -r 10000 \
  LRANGE mylist 0 10

# Blocking operations (custom test)
benchmark_blocking_list_ops --duration 60s --clients 50
```

**Measurements**:
- LPUSH/RPUSH performance
- LPOP/RPOP performance  
- LRANGE performance vs range size
- BLPOP latency and throughput
- Memory efficiency of list encoding

#### Test: `benchmark_set_operations`
**Purpose**: Measure set operation performance

```bash
# Set basic operations
redis-benchmark -t sadd,spop -n 1000000 -c 50 --csv

# Set operations with varying sizes
for members in 10 100 1000 10000; do
  benchmark_set_ops --set-size $members --operations 100000
done

# Set intersection/union performance
benchmark_set_algebra --set1-size 10000 --set2-size 10000
```

**Measurements**:
- SADD/SREM performance
- Set operation (SUNION, SINTER) performance
- Memory usage vs set size
- IntSet vs HashTable performance crossover

#### Test: `benchmark_sorted_set_operations`
**Purpose**: Measure sorted set performance

```bash
# Basic sorted set operations
redis-benchmark -t zadd,zrem -n 1000000 -c 50 --csv

# Range operations
benchmark_zset_ranges --zset-size 100000 --range-sizes "10,100,1000"

# Score-based operations
benchmark_zset_scores --operations 100000
```

**Measurements**:
- ZADD performance with random vs sequential scores
- ZRANGE performance vs range size
- ZRANGEBYSCORE performance
- Skip list vs listpack performance crossover

#### Test: `benchmark_hash_operations`
**Purpose**: Measure hash operation performance

```bash
# Hash operations
redis-benchmark -t hset,hget -n 1000000 -c 50 --csv

# Multi-field operations
redis-benchmark -n 100000 -c 50 \
  HMSET myhash f1 v1 f2 v2 f3 v3 f4 v4 f5 v5

# Hash size scaling
for fields in 10 100 1000 10000; do
  benchmark_hash_scaling --fields $fields --operations 50000
done
```

**Measurements**:
- Single vs multi-field operation performance
- Memory efficiency of hash encodings
- HGETALL performance vs hash size

### 2. Concurrency and Scaling Tests

#### Test: `benchmark_connection_scaling`
**Purpose**: Measure performance with varying client connections

```bash
# Connection scaling test
for clients in 1 10 50 100 200 500 1000; do
  echo "Testing with $clients clients"
  redis-benchmark -t get,set -n 100000 -c $clients --csv
done
```

**Measurements**:
- Throughput vs number of clients
- Latency vs number of clients
- Connection establishment overhead
- Memory usage per connection

**Success Criteria**:
- Sub-linear performance degradation with client count
- Stable latency up to 100 clients
- Graceful degradation beyond 500 clients

#### Test: `benchmark_pipeline_performance`
**Purpose**: Measure pipelining efficiency

```bash
# Pipeline scaling
for pipeline in 1 2 5 10 20 50 100; do
  redis-benchmark -t get,set -n 100000 -c 50 -P $pipeline --csv
done

# Large pipeline test
redis-benchmark -t set -n 100000 -c 10 -P 1000 --csv
```

**Measurements**:
- Throughput scaling with pipeline depth
- Latency impact of pipelining
- Memory usage during large pipelines
- Optimal pipeline depth

**Success Criteria**:
- 10x+ throughput improvement with pipeline depth 10
- Linear scaling up to pipeline depth 50
- Graceful handling of pipeline depth 1000+

### 3. Memory Performance Tests

#### Test: `benchmark_memory_efficiency`
**Purpose**: Measure memory usage patterns

```bash
# Memory usage by data type
benchmark_memory_usage --keys 1000000 --value-size 100 --type string
benchmark_memory_usage --keys 100000 --list-size 10 --type list
benchmark_memory_usage --keys 100000 --set-size 10 --type set
benchmark_memory_usage --keys 100000 --hash-fields 10 --type hash
benchmark_memory_usage --keys 100000 --zset-size 10 --type zset

# Encoding transition points
benchmark_encoding_transitions
```

**Measurements**:
- Bytes per key for each data type
- Encoding transition thresholds
- Memory fragmentation ratio
- Object overhead percentages

**Expected Results**:
- String (100 bytes): ≤ 150 bytes total
- List (10 elements): ≤ 300 bytes total  
- Set (10 elements): ≤ 400 bytes total
- Hash (10 fields): ≤ 500 bytes total
- ZSet (10 elements): ≤ 600 bytes total

#### Test: `benchmark_memory_eviction`
**Purpose**: Measure eviction performance impact

```bash
# Setup eviction scenario
configure_maxmemory 1GB allkeys-lru

# Fill beyond memory limit
benchmark_eviction_performance --target-memory 1.2GB --operations 1000000
```

**Measurements**:
- Eviction overhead per operation
- Latency impact during eviction
- Eviction accuracy (LRU/LFU)
- Memory usage stability

### 4. Persistence Performance Tests

#### Test: `benchmark_rdb_performance`
**Purpose**: Measure RDB save/load performance

```bash
# RDB save performance
benchmark_rdb_save --dataset-size 1GB --data-types mixed

# RDB load performance  
benchmark_rdb_load --rdb-size 1GB

# Save frequency impact
benchmark_rdb_impact --save-frequency "900 1" --duration 3600s
```

**Measurements**:
- RDB save time vs dataset size
- RDB load time vs file size
- Copy-on-write memory usage during save
- Performance impact during background save
- RDB file compression ratio

**Success Criteria**:
- 1GB dataset saves in < 30 seconds
- 1GB RDB loads in < 15 seconds  
- CoW memory < 150% of dataset size
- < 5% performance impact during BGSAVE

#### Test: `benchmark_aof_performance`
**Purpose**: Measure AOF write performance

```bash
# AOF write performance by fsync policy
for policy in always everysec no; do
  configure_aof_fsync $policy
  redis-benchmark -t set -n 100000 -c 50 --csv
done

# AOF rewrite performance
benchmark_aof_rewrite --aof-size 1GB
```

**Measurements**:
- Throughput impact by fsync policy
- AOF file growth rate
- AOF rewrite time vs file size
- Performance during AOF rewrite

**Success Criteria**:
- fsync=everysec: < 10% throughput impact
- fsync=always: < 50% throughput impact
- AOF rewrite: 1GB compacts in < 60 seconds

### 5. Replication Performance Tests

#### Test: `benchmark_replication_throughput`
**Purpose**: Measure replication performance impact

```bash
# Master performance with replicas
benchmark_replication_scaling --replicas 0,1,2,5,10 --operations 1000000

# Replication lag measurement
benchmark_replication_lag --write-rate 50000 --duration 300s
```

**Measurements**:
- Master throughput vs number of replicas
- Replication lag under various write loads
- Network bandwidth usage
- Memory usage for replication buffers

**Success Criteria**:
- < 5% throughput impact per replica
- Replication lag < 1ms under normal load
- Replication lag < 100ms under heavy load

#### Test: `benchmark_partial_resync`
**Purpose**: Measure partial resync performance

```bash
# Simulate network partitions
benchmark_partial_resync --partition-duration 30s --write-rate 10000
```

**Measurements**:
- Partial resync success rate
- Resync time vs backlog size
- Full resync fallback conditions

### 6. Clustering Performance Tests

#### Test: `benchmark_cluster_operations`
**Purpose**: Measure cluster mode performance

```bash
# Single-node vs cluster comparison
benchmark_cluster_comparison --nodes 1,3,6 --operations 1000000

# Cross-slot operation performance  
benchmark_cluster_cross_slot --operations 100000

# Slot migration performance
benchmark_cluster_migration --source-keys 100000
```

**Measurements**:
- Single-key operation overhead in cluster mode
- Multi-key operation limitations  
- Slot migration impact on performance
- Cluster routing latency

**Success Criteria**:
- < 10% overhead vs standalone mode
- Slot migration completes without timeouts
- MOVED/ASK redirects handled efficiently

### 7. Pub/Sub Performance Tests

#### Test: `benchmark_pubsub_throughput`
**Purpose**: Measure pub/sub performance

```bash
# Publisher throughput
benchmark_pubsub_publish --channels 1 --subscribers 1000 --rate 100000

# Subscriber fan-out
benchmark_pubsub_fanout --subscribers 1,10,100,1000,10000 --messages 100000

# Pattern subscription overhead
benchmark_pubsub_patterns --patterns 100 --messages 100000
```

**Measurements**:
- Publisher throughput vs subscriber count
- Message delivery latency
- Memory usage for subscriber management
- Pattern matching overhead

**Success Criteria**:
- 100,000 msgs/sec to 1000 subscribers
- P99 delivery latency < 5ms
- Linear memory scaling with subscribers

### 8. Scripting Performance Tests

#### Test: `benchmark_lua_performance`
**Purpose**: Measure Lua scripting overhead

```bash
# Script execution overhead
benchmark_lua_overhead --script-types simple,complex,redis-calls

# Script caching efficiency
benchmark_lua_caching --unique-scripts 1000 --executions 100000

# Large script performance
benchmark_lua_large --script-size 10KB,100KB,1MB
```

**Measurements**:
- Script execution time vs complexity
- Script compilation overhead
- Redis command call overhead from Lua
- Memory usage for script caching

**Success Criteria**:
- Simple script: < 0.1ms execution overhead
- Script caching: 90%+ cache hit rate
- Complex script: execution time proportional to operations

### 9. Stress and Endurance Tests

#### Test: `benchmark_stress_test`
**Purpose**: Determine breaking points

```bash
# Gradually increase load until failure
stress_test_ramp --start-rps 1000 --increment 1000 --max-rps 500000

# High connection stress
stress_test_connections --start-clients 100 --increment 100 --max-clients 10000
```

**Measurements**:
- Maximum sustainable throughput
- Breaking point identification  
- Error rates under stress
- Recovery time after overload

#### Test: `benchmark_endurance_test`
**Purpose**: Long-term stability testing

```bash
# 24-hour stability test
endurance_test --duration 24h --load 50% --operations mixed

# Memory leak detection
endurance_test --duration 12h --monitor-memory --leak-threshold 1MB/hour
```

**Measurements**:
- Performance consistency over time
- Memory usage trends
- Error rate stability
- Resource leak detection

**Success Criteria**:
- < 5% performance degradation over 24 hours
- No memory leaks (< 1MB/hour growth)
- Zero crashes or hangs

### 10. Large-Scale Data Tests

#### Test: `benchmark_large_datasets`
**Purpose**: Performance with large datasets

```bash
# Large dataset performance
benchmark_large_data --dataset-size 10GB,50GB,100GB --operations 1000000

# Large value performance  
benchmark_large_values --value-sizes 1MB,10MB,100MB --operations 10000

# Many small keys
benchmark_many_keys --key-count 10M,50M,100M --operations 1000000
```

**Measurements**:
- Performance scaling with dataset size
- Large value handling efficiency
- Memory usage patterns
- Startup time with large datasets

## Benchmark Analysis and Reporting

### Metrics Collection
All benchmark tests must collect:

#### Performance Metrics
```
requests_per_second
operations_per_second  
latency_p50_ms
latency_p95_ms
latency_p99_ms
latency_p99_9_ms
latency_max_ms
throughput_mb_per_second
```

#### Resource Metrics
```
cpu_usage_percent
memory_usage_mb
memory_rss_mb
network_rx_mb_per_second
network_tx_mb_per_second
disk_read_mb_per_second
disk_write_mb_per_second
```

#### Application Metrics
```
connection_count
command_count_by_type
keyspace_hits_per_second
keyspace_misses_per_second
evicted_keys_per_second
expired_keys_per_second
```

### Performance Report Format

```markdown
# Key-Value Store Benchmark Results

## Test Configuration
- **Date**: 2024-02-13
- **Duration**: 300 seconds
- **Hardware**: 4-core 3.2GHz, 32GB RAM, NVMe SSD
- **Tool**: redis-benchmark 7.0
- **Implementation**: Forgeprint KV Store v1.0

## Performance Summary
| Operation | RPS | P99 Latency | Memory/Key | Status |
|-----------|-----|-------------|------------|--------|
| GET | 145,230 | 0.8ms | 150B | ✅ PASS |
| SET | 142,180 | 0.9ms | 150B | ✅ PASS |
| LPUSH | 89,420 | 1.8ms | 280B | ✅ PASS |
| ZADD | 67,890 | 2.1ms | 520B | ✅ PASS |

## Detailed Results
[Include full latency histograms, resource utilization graphs, etc.]
```

### Regression Detection
- **Baseline establishment**: Record performance baselines for each release
- **Automated comparison**: Compare current results with baseline
- **Alert thresholds**: Flag regressions > 10% in throughput or latency
- **Performance tracking**: Maintain historical performance trends

### Benchmark Automation

```yaml
# CI/CD Pipeline Integration
benchmark_tests:
  stage: performance
  script:
    - ./setup_benchmark_environment.sh
    - ./run_core_benchmarks.sh
    - ./run_stress_tests.sh
    - ./analyze_results.sh
    - ./compare_with_baseline.sh
  artifacts:
    reports:
      performance: benchmark_results.json
  only:
    - main
    - release/*
```

## Hardware-Specific Targets

### Cloud Instance Recommendations

#### AWS c5.xlarge (4 vCPU, 8GB RAM)
```
GET/SET: 80,000 RPS (P99 < 1ms)
LPUSH/LPOP: 60,000 RPS (P99 < 2ms)
Memory limit: 6GB effective
```

#### AWS c5.2xlarge (8 vCPU, 16GB RAM)
```
GET/SET: 150,000 RPS (P99 < 0.8ms)
LPUSH/LPOP: 120,000 RPS (P99 < 1.5ms)  
Memory limit: 12GB effective
```

#### AWS c5.4xlarge (16 vCPU, 32GB RAM)
```
GET/SET: 200,000+ RPS (P99 < 0.6ms)
LPUSH/LPOP: 150,000+ RPS (P99 < 1.2ms)
Memory limit: 26GB effective
```

This comprehensive benchmark specification ensures consistent, reproducible performance validation of key-value store implementations across different deployment scenarios and hardware configurations.