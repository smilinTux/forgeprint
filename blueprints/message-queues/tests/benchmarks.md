# Message Queue Performance Benchmarks

## Overview
This document defines performance benchmarks and targets for message queue implementations. These benchmarks establish minimum acceptable performance thresholds using industry-standard messaging patterns and provide standardized methodology for validating throughput, latency, and scalability characteristics.

## Test Environment Specifications

### Hardware Requirements
- **CPU**: 4+ cores, 2.5+ GHz (8+ cores for high-throughput tests)
- **RAM**: 16GB minimum, 32GB recommended
- **Network**: 10Gbps Ethernet (for multi-broker tests)
- **Storage**: NVMe SSD for WAL and message storage

### Software Environment
- **OS**: Linux (Ubuntu 20.04+ or equivalent)
- **Kernel**: Version 5.4+ with io_uring support
- **Network**: Optimized for high packet rates
- **JVM**: OpenJDK 11+ with G1GC (for JVM-based implementations)

### System Configuration
```bash
# Network tuning for high throughput
echo 'net.core.rmem_default = 262144' >> /etc/sysctl.conf
echo 'net.core.rmem_max = 16777216' >> /etc/sysctl.conf
echo 'net.core.wmem_default = 262144' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 16777216' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_rmem = 1024 4096 16777216' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_wmem = 1024 4096 16777216' >> /etc/sysctl.conf

# File descriptor limits
echo '* soft nofile 100000' >> /etc/security/limits.conf
echo '* hard nofile 100000' >> /etc/security/limits.conf

# Memory settings
echo 'vm.swappiness = 1' >> /etc/sysctl.conf
echo 'vm.dirty_ratio = 80' >> /etc/sysctl.conf
echo 'vm.dirty_background_ratio = 5' >> /etc/sysctl.conf
```

## Performance Targets by Feature Set

### 1. Single-Node Minimal Feature Set
**Features**: Basic pub/sub, single partition, no replication

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Messages/second** | 500,000 | 250,000 |
| **Throughput (1KB msgs)** | 500 MB/s | 250 MB/s |
| **Producer latency P50** | < 1ms | < 5ms |
| **Producer latency P99** | < 10ms | < 50ms |
| **End-to-end latency P50** | < 5ms | < 20ms |
| **End-to-end latency P99** | < 50ms | < 200ms |
| **Memory per connection** | < 5MB | < 20MB |

### 2. Multi-Partition Single-Node
**Features**: Partitioning, consumer groups, offset management

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Messages/second** | 300,000 | 150,000 |
| **Partitions supported** | 1,000 | 500 |
| **Consumer group rebalance time** | < 10s | < 30s |
| **Cross-partition latency std dev** | < 5ms | < 20ms |

### 3. Multi-Node Replicated
**Features**: Replication, leader election, fault tolerance

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Replicated messages/second** | 200,000 | 100,000 |
| **Leader election time** | < 5s | < 15s |
| **Replication lag P99** | < 100ms | < 500ms |
| **Sync replication overhead** | < 50% | < 100% |

### 4. Full Feature Set
**Features**: Transactions, exactly-once, schema registry, monitoring

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Transactional messages/sec** | 50,000 | 25,000 |
| **Exactly-once overhead** | < 3x | < 5x |
| **Schema validation overhead** | < 20% | < 50% |

## Detailed Benchmark Tests

### 1. Producer Throughput Benchmarks

#### Test: `benchmark_producer_throughput_single_partition`
**Purpose**: Measure maximum producer throughput to single partition
**Setup**:
- Single topic with 1 partition
- 1KB message size
- No replication (replication factor = 1)
- Producer batch size optimized

**Test Procedure**:
```bash
# Baseline single producer
kafka-producer-perf-test.sh \
  --topic throughput-test \
  --num-records 1000000 \
  --record-size 1024 \
  --throughput -1 \
  --producer-props acks=1 batch.size=16384 linger.ms=0

# Multiple producers (scale up)
for producers in 1 2 4 8 16; do
  ./run-parallel-producers.sh \
    --producers $producers \
    --messages-per-producer 500000 \
    --message-size 1024 > throughput_${producers}p.txt
done
```

**Measurements**:
- Messages per second
- MB/s throughput
- CPU utilization
- Network utilization
- Producer-side latency

**Success Criteria**:
- Single producer: > 250,000 msgs/sec
- Linear scaling up to CPU limit
- < 85% CPU utilization at target throughput

#### Test: `benchmark_producer_throughput_multiple_partitions`
**Purpose**: Measure throughput scaling across partitions
**Setup**: Topic with 1, 4, 16, 64 partitions

**Expected Results**:
- Throughput should scale near-linearly with partition count
- Up to core count limit

#### Test: `benchmark_producer_batching_efficiency`
**Purpose**: Optimize batch size for throughput vs latency
**Setup**: Vary batch.size and linger.ms settings

**Test Matrix**:
| batch.size | linger.ms | Expected Throughput | Expected Latency |
|------------|-----------|-------------------|-----------------|
| 16KB | 0ms | Moderate | Low |
| 64KB | 5ms | High | Moderate |
| 256KB | 25ms | Very High | High |

#### Test: `benchmark_producer_compression`
**Purpose**: Measure compression impact on throughput
**Setup**: Test gzip, snappy, lz4, zstd compression

**Test Procedure**:
```bash
for compression in none gzip snappy lz4 zstd; do
  kafka-producer-perf-test.sh \
    --topic compression-test \
    --num-records 500000 \
    --record-size 1024 \
    --producer-props compression.type=$compression > compression_$compression.txt
done
```

**Expected Results**:
- Compression reduces network I/O
- CPU overhead varies: lz4 < snappy < gzip < zstd
- Throughput may increase or decrease depending on network vs CPU bottleneck

### 2. Consumer Throughput Benchmarks

#### Test: `benchmark_consumer_throughput_single_partition`
**Purpose**: Measure maximum consumer throughput
**Setup**: Pre-populated topic with 1M messages

**Test Procedure**:
```bash
kafka-consumer-perf-test.sh \
  --topic throughput-test \
  --messages 1000000 \
  --threads 1 \
  --consumer-props fetch.min.bytes=1048576

# Multiple consumers for same topic (different consumer groups)
for consumers in 1 2 4 8; do
  ./run-parallel-consumers.sh \
    --consumers $consumers \
    --messages-per-consumer 500000 > consumer_throughput_${consumers}c.txt
done
```

**Measurements**:
- Messages consumed per second
- Consumer lag
- Network bandwidth utilization
- Memory usage for buffering

**Success Criteria**:
- Single consumer: > 500,000 msgs/sec (2x producer due to no write overhead)
- Linear scaling with multiple consumers on different consumer groups

#### Test: `benchmark_consumer_group_throughput`
**Purpose**: Measure consumer group parallel consumption
**Setup**: Topic with 8 partitions, consumer group with 1, 2, 4, 8 members

**Expected Results**:
- Linear throughput scaling up to partition count
- Efficient partition assignment
- Low rebalancing overhead

### 3. End-to-End Latency Benchmarks

#### Test: `benchmark_end_to_end_latency`
**Purpose**: Measure complete message journey time
**Setup**: Producer → Broker → Consumer with timestamp correlation

**Test Procedure**:
```bash
# Custom latency test with producer and consumer timestamps
./latency-benchmark.sh \
  --topic latency-test \
  --message-rate 10000 \
  --duration 60s \
  --acks 1 \
  --batch-size 1 \
  --consumer-fetch-size 1

# Varying message rates to see latency under load
for rate in 1000 10000 50000 100000 200000; do
  ./latency-benchmark.sh \
    --message-rate $rate \
    --duration 30s > latency_${rate}msgs.txt
done
```

**Measurements**:
- End-to-end latency percentiles (P50, P95, P99, P99.9)
- Producer latency (client to broker)
- Consumer latency (broker to client)
- Broker processing time

**Success Criteria**:
- P50 end-to-end latency: < 5ms
- P99 end-to-end latency: < 50ms
- Latency should increase sub-linearly with load

#### Test: `benchmark_latency_vs_throughput`
**Purpose**: Characterize latency-throughput trade-off curve
**Setup**: Fixed consumer, vary producer rate and batching

**Expected Results**:
- Low throughput: latency dominated by linger.ms
- Medium throughput: stable latency plateau
- High throughput: latency increases due to queueing

### 4. Partition Scalability Benchmarks

#### Test: `benchmark_partition_scaling`
**Purpose**: Measure performance scaling with partition count
**Setup**: Topics with 1, 10, 100, 1000 partitions

**Test Procedure**:
```bash
for partitions in 1 10 100 1000; do
  # Create topic
  kafka-topics.sh --create --topic scale-test-$partitions --partitions $partitions --replication-factor 1
  
  # Measure producer throughput
  kafka-producer-perf-test.sh \
    --topic scale-test-$partitions \
    --num-records 1000000 \
    --record-size 1024 > partition_scale_${partitions}p.txt
  
  # Measure consumer throughput
  kafka-consumer-perf-test.sh \
    --topic scale-test-$partitions \
    --messages 1000000 \
    --consumer-props num.consumer.fetchers=$partitions
done
```

**Measurements**:
- Throughput per partition
- Total throughput
- Memory usage (metadata overhead)
- File descriptor usage
- Leader election time (if multi-broker)

**Success Criteria**:
- Near-linear scaling up to 100 partitions
- Graceful degradation beyond core count
- Support for 1000+ partitions without failure

#### Test: `benchmark_partition_leader_distribution`
**Purpose**: Verify even leader distribution across brokers
**Setup**: 3-broker cluster, 30 partitions, replication factor 3

**Measurements**:
- Leader count per broker (should be ~10 each)
- Throughput distribution
- Rebalancing time when broker added/removed

### 5. Consumer Group Benchmarks

#### Test: `benchmark_consumer_group_rebalancing`
**Purpose**: Measure rebalancing performance and impact
**Setup**: Consumer group with 20 partitions, varying member count

**Test Procedure**:
```bash
# Start baseline consumers
./consumer-group-test.sh --group rebalance-test --consumers 5 --partitions 20 &

# Add consumers and measure rebalancing
for add_consumers in 1 2 5 10; do
  echo "Adding $add_consumers consumers at $(date)"
  ./add-consumers.sh --group rebalance-test --count $add_consumers
  
  # Measure time until all consumers resumed processing
  ./measure-rebalance-time.sh --group rebalance-test > rebalance_add_${add_consumers}.txt
  
  sleep 30
done
```

**Measurements**:
- Rebalancing duration (time consumers stopped processing)
- Partition reassignment fairness
- Consumer lag during rebalancing
- Throughput impact

**Success Criteria**:
- Rebalancing completes in < 10 seconds
- < 20% throughput drop during rebalancing
- Fair partition distribution after rebalancing

#### Test: `benchmark_consumer_group_failover`
**Purpose**: Measure failover time when consumer crashes
**Setup**: 4 consumers, 16 partitions

**Test Procedure**:
```bash
# Start consumer group
./consumer-group-test.sh --group failover-test --consumers 4 --partitions 16 &

# Kill one consumer, measure recovery
sleep 10
kill -9 $(pgrep -f consumer-1)

# Measure time until partitions reassigned
./measure-failover-time.sh --group failover-test --expected-consumers 3
```

**Success Criteria**:
- Failover detection within session.timeout (default 30s)
- Partition reassignment within 60s
- No message loss during failover

### 6. Replication Benchmarks

#### Test: `benchmark_replication_throughput`
**Purpose**: Measure replication overhead
**Setup**: 3-broker cluster, varying replication factors

**Test Procedure**:
```bash
for replication in 1 2 3; do
  kafka-topics.sh --create --topic replication-test-$replication \
    --partitions 6 --replication-factor $replication
    
  kafka-producer-perf-test.sh \
    --topic replication-test-$replication \
    --num-records 500000 \
    --record-size 1024 \
    --producer-props acks=all > replication_${replication}x.txt
done
```

**Measurements**:
- Throughput at each replication factor
- Replication lag
- Network traffic between brokers
- CPU and disk I/O overhead

**Expected Results**:
- ~50% throughput drop from RF=1 to RF=2
- ~20% additional drop from RF=2 to RF=3
- Replication lag < 100ms under normal load

#### Test: `benchmark_synchronous_replication_latency`
**Purpose**: Measure latency impact of synchronous replication
**Setup**: acks=all vs acks=1 comparison

**Expected Results**:
- acks=all: +5-20ms latency vs acks=1
- Latency depends on network RTT to replicas

### 7. Exactly-Once Benchmarks

#### Test: `benchmark_exactly_once_overhead`
**Purpose**: Measure performance impact of exactly-once semantics
**Setup**: Compare transactional vs non-transactional producers

**Test Procedure**:
```bash
# Non-transactional baseline
kafka-producer-perf-test.sh \
  --topic exactly-once-test \
  --num-records 500000 \
  --record-size 1024 \
  --producer-props acks=all enable.idempotence=false > baseline.txt

# Idempotent producer
kafka-producer-perf-test.sh \
  --topic exactly-once-test \
  --num-records 500000 \
  --record-size 1024 \
  --producer-props acks=all enable.idempotence=true > idempotent.txt

# Transactional producer
./transactional-producer-perf-test.sh \
  --topic exactly-once-test \
  --num-records 500000 \
  --record-size 1024 \
  --transaction-size 1000 > transactional.txt
```

**Measurements**:
- Throughput overhead for each guarantee level
- Latency overhead
- Memory usage for transaction state

**Expected Results**:
- Idempotent: 10-20% throughput overhead
- Transactional: 50-200% throughput overhead
- Overhead depends on transaction size

### 8. Large Message Benchmarks

#### Test: `benchmark_large_message_performance`
**Purpose**: Test performance with varying message sizes
**Setup**: Message sizes from 1KB to 10MB

**Test Procedure**:
```bash
for size in 1024 10240 102400 1048576 10485760; do
  kafka-producer-perf-test.sh \
    --topic large-message-test \
    --num-records 10000 \
    --record-size $size \
    --producer-props max.request.size=11534336 > size_${size}b.txt
done
```

**Measurements**:
- Messages per second vs message size
- Bytes per second (should be relatively constant)
- Memory usage
- Network efficiency

**Expected Results**:
- Throughput (msgs/sec) inversely proportional to message size
- Throughput (bytes/sec) relatively constant until memory limits

### 9. Consumer Lag Benchmarks

#### Test: `benchmark_consumer_lag_under_load`
**Purpose**: Measure consumer lag behavior under various load conditions
**Setup**: Fast producer, varying consumer speed

**Test Procedure**:
```bash
# Start fast producer
kafka-producer-perf-test.sh \
  --topic lag-test \
  --num-records -1 \
  --record-size 1024 \
  --throughput 100000 &
PRODUCER_PID=$!

# Start slow consumer
kafka-console-consumer.sh \
  --topic lag-test \
  --consumer-property fetch.max.wait.ms=5000 &
CONSUMER_PID=$!

# Monitor lag for 5 minutes
for i in {1..300}; do
  kafka-consumer-groups.sh --describe --group lag-test-group
  sleep 1
done > consumer_lag.txt

kill $PRODUCER_PID $CONSUMER_PID
```

**Measurements**:
- Consumer lag over time
- Lag accumulation rate
- Catch-up rate when consumer speeds up
- Memory usage under high lag

### 10. Stress Tests

#### Test: `benchmark_broker_stability_under_load`
**Purpose**: Long-term stability test under sustained load
**Setup**: 24-hour continuous load test

**Test Procedure**:
```bash
# Start long-running producer
./continuous-producer.sh \
  --topic stress-test \
  --target-rate 50000 \
  --duration 86400 & # 24 hours

# Start consumer
./continuous-consumer.sh \
  --topic stress-test \
  --consumer-group stress-test-group &

# Monitor system resources
./monitor-resources.sh --interval 60 --duration 86400 > stress_resources.txt
```

**Measurements**:
- Throughput stability over time
- Memory usage growth (detect leaks)
- CPU utilization patterns
- Disk space usage
- Error rates

**Success Criteria**:
- < 5% throughput degradation over 24 hours
- No memory leaks (stable memory usage)
- No log segment accumulation issues
- Error rate < 0.01%

## Performance Analysis and Reporting

### Metrics Collection
```
# Core Metrics
messages_per_second
bytes_per_second
producer_latency_p50, p95, p99
consumer_latency_p50, p95, p99
end_to_end_latency_p50, p95, p99
error_rate_percentage

# Scalability Metrics
partition_count_supported
consumer_group_rebalance_time
leader_election_time
replication_lag_p99

# Resource Metrics
cpu_utilization_percent
memory_usage_mb
network_io_mbps
disk_io_iops
file_descriptors_used

# Message Queue Specific
consumer_lag_seconds
partition_leader_distribution
replication_factor_overhead
transaction_success_rate
```

### Reporting Format
```markdown
# Message Queue Benchmark Results

## Test Configuration
- **Date**: 2026-02-13
- **Duration**: 60 seconds
- **Hardware**: 8 cores, 32GB RAM
- **Feature Set**: Multi-partition single-node

## Results Summary
| Test | Target | Actual | Status |
|------|--------|--------|--------|
| Messages/sec | 150,000 | 275,000 | ✅ PASS |
| End-to-end P99 | < 200ms | 45ms | ✅ PASS |
| Rebalance time | < 30s | 8.5s | ✅ PASS |
| Partition scaling | 500 | 1000+ | ✅ PASS |

## Detailed Analysis
[Performance graphs and scaling curves]
```

### Regression Testing
- **Baseline**: Performance baselines per feature set
- **Comparison**: Automated comparison with previous versions
- **Alerting**: Alert on > 15% performance regression
- **Trends**: Track performance trends across releases

This benchmark specification ensures comprehensive performance validation of message queue implementations across throughput, latency, scalability, and reliability dimensions with industry-standard patterns and workloads.