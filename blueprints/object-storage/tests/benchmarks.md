# Object Storage Performance Benchmarks

## Overview
This document defines performance benchmarks and targets for S3-compatible object storage implementations. These benchmarks establish minimum acceptable performance thresholds and provide standardized testing methodology for evaluating system behavior under various workloads.

## Test Environment Specifications

### Hardware Requirements
- **CPU**: 16+ cores, 2.4+ GHz (Intel Xeon or AMD EPYC)
- **RAM**: 32GB minimum, 64GB recommended
- **Storage**: NVMe SSD for hot data, SATA SSD/HDD for capacity testing
- **Network**: 25+ Gbps Ethernet with low latency
- **Drives**: Minimum 6 drives for erasure coding tests (EC:4+2)

### Software Environment
- **OS**: Linux (Ubuntu 22.04+ or equivalent) with kernel 5.15+
- **Filesystem**: XFS or ext4 with recommended mount options
- **Network Stack**: Optimized TCP settings, io_uring support
- **Time Synchronization**: NTP synchronized across all nodes

### Network Configuration
```bash
# Optimize for high-performance storage workloads
echo 'net.core.rmem_max = 67108864' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 67108864' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_rmem = 4096 131072 67108864' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_wmem = 4096 131072 67108864' >> /etc/sysctl.conf
echo 'net.core.netdev_max_backlog = 30000' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_congestion_control = bbr' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_mtu_probing = 1' >> /etc/sysctl.conf
```

## Performance Targets by Configuration

### 1. Single-Node Configuration (Development/Edge)
**Setup**: 1 node, 4-6 drives, EC:2+2 or 3-way replication

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **PUT Throughput (64KB objects)** | 5,000 ops/sec | 3,000 ops/sec |
| **GET Throughput (64KB objects)** | 10,000 ops/sec | 6,000 ops/sec |
| **PUT Bandwidth (10MB objects)** | 1 GB/s | 600 MB/s |
| **GET Bandwidth (10MB objects)** | 2 GB/s | 1.2 GB/s |
| **Concurrent Connections** | 1,000 | 500 |
| **PUT Latency P99** | < 50ms | < 100ms |
| **GET Latency P99** | < 25ms | < 50ms |
| **Metadata Operations/sec** | 1,000 | 500 |

### 2. Small Cluster Configuration (3-6 nodes)
**Setup**: 3-6 nodes, 4 drives per node, EC:4+2

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **PUT Throughput (64KB objects)** | 15,000 ops/sec | 10,000 ops/sec |
| **GET Throughput (64KB objects)** | 30,000 ops/sec | 20,000 ops/sec |
| **PUT Bandwidth (10MB objects)** | 5 GB/s | 3 GB/s |
| **GET Bandwidth (10MB objects)** | 10 GB/s | 6 GB/s |
| **Concurrent Connections** | 5,000 | 3,000 |
| **PUT Latency P99** | < 30ms | < 60ms |
| **GET Latency P99** | < 15ms | < 30ms |
| **Metadata Operations/sec** | 5,000 | 3,000 |

### 3. Large Cluster Configuration (10+ nodes)
**Setup**: 10+ nodes, 6+ drives per node, EC:8+4

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **PUT Throughput (64KB objects)** | 50,000 ops/sec | 30,000 ops/sec |
| **GET Throughput (64KB objects)** | 100,000 ops/sec | 60,000 ops/sec |
| **PUT Bandwidth (10MB objects)** | 25 GB/s | 15 GB/s |
| **GET Bandwidth (10MB objects)** | 50 GB/s | 30 GB/s |
| **Concurrent Connections** | 20,000 | 12,000 |
| **PUT Latency P99** | < 20ms | < 40ms |
| **GET Latency P99** | < 10ms | < 20ms |
| **Metadata Operations/sec** | 20,000 | 12,000 |

## Detailed Benchmark Tests

### 1. Object Throughput Benchmarks

#### Test: `benchmark_put_throughput_small_objects`
**Purpose**: Measure PUT throughput for small objects (realistic web workload)
**Setup**:
- Object size: 64KB (typical for images, documents, API responses)
- Concurrent clients: 32 threads
- Test duration: 300 seconds (5 minutes)
- Object key pattern: Sequential with random suffix to avoid hotspotting

**Test Procedure**:
```bash
# Using custom load generator
./object-storage-bench put \
  --endpoint http://storage.local:9000 \
  --bucket benchmark-small \
  --object-size 64KB \
  --concurrent-clients 32 \
  --duration 300s \
  --access-key minioadmin \
  --secret-key minioadmin \
  --key-pattern "small-objects/obj-{timestamp}-{thread}-{counter}.dat"
```

**Measurements**:
- Operations per second (PUT/s)
- Bandwidth utilization (MB/s)
- Latency distribution (P50, P90, P95, P99, P99.9, max)
- Error rate (must be < 0.01%)
- CPU utilization on storage nodes
- Network utilization
- Disk I/O patterns and utilization

**Success Criteria**:
- Achieve target PUT/s for configuration
- Latency percentiles within targets
- Zero data corruption (checksum validation)
- Stable performance throughout duration

#### Test: `benchmark_get_throughput_small_objects`
**Purpose**: Measure GET throughput for small objects
**Setup**:
- Pre-populate bucket with 100,000 objects (64KB each)
- Read pattern: Random selection from object pool
- Concurrent clients: 64 threads (higher than PUT due to read-heavy workloads)

**Test Procedure**:
```bash
# Pre-populate phase
./object-storage-bench populate \
  --endpoint http://storage.local:9000 \
  --bucket benchmark-small \
  --object-size 64KB \
  --object-count 100000

# Benchmark phase
./object-storage-bench get \
  --endpoint http://storage.local:9000 \
  --bucket benchmark-small \
  --concurrent-clients 64 \
  --duration 300s \
  --read-pattern random
```

**Measurements**:
- GET operations per second
- Cache hit ratio (if caching enabled)
- Time to First Byte (TTFB)
- Full object download latency
- Network bandwidth utilization

#### Test: `benchmark_put_throughput_large_objects`
**Purpose**: Measure bandwidth for large object uploads
**Setup**:
- Object size: 10MB (typical for video, backups, data files)
- Concurrent clients: 16 threads (fewer due to larger objects)
- Test large object handling and memory management

**Test Procedure**:
```bash
./object-storage-bench put \
  --endpoint http://storage.local:9000 \
  --bucket benchmark-large \
  --object-size 10MB \
  --concurrent-clients 16 \
  --duration 300s \
  --streaming-upload true \
  --verify-checksum true
```

**Key Metrics**:
- Aggregate bandwidth (GB/s)
- Individual upload latency
- Memory usage during uploads (should remain bounded)
- Erasure coding overhead (encoding time)
- Disk write patterns (sequential vs random)

### 2. Multipart Upload Benchmarks

#### Test: `benchmark_multipart_upload_performance`
**Purpose**: Evaluate multipart upload throughput and parallelism
**Setup**:
- Object size: 100MB split into 20 parts (5MB each)
- Concurrent multipart uploads: 8
- Parts uploaded in parallel per object: 4

**Test Procedure**:
```bash
./object-storage-bench multipart \
  --endpoint http://storage.local:9000 \
  --bucket benchmark-multipart \
  --object-size 100MB \
  --part-size 5MB \
  --concurrent-uploads 8 \
  --parallel-parts 4 \
  --duration 300s
```

**Measurements**:
- Multipart upload completion rate (uploads/second)
- Part upload throughput (parts/second)
- Time to complete individual uploads
- Resource utilization during parallel part uploads
- Error handling (part retry behavior)

**Success Criteria**:
- Complete uploads without corruption
- Efficient parallelization (near-linear speedup with parts)
- Memory usage scales with concurrent uploads, not object size

#### Test: `benchmark_multipart_assembly_time`
**Purpose**: Measure multipart completion (assembly) performance
**Setup**:
- Various object sizes: 100MB (20 parts), 1GB (200 parts), 10GB (2000 parts)
- Measure assembly time vs part count

**Test Procedure**:
```bash
# Test multiple object sizes
for size in 100MB 1GB 10GB; do
  ./object-storage-bench multipart-complete \
    --object-size $size \
    --part-size 5MB \
    --measure-assembly-time \
    --repeat 10
done
```

**Analysis**:
- Assembly time should scale sub-linearly with part count
- Memory usage during assembly should be bounded
- Final object immediately accessible after completion

### 3. Concurrent Connection Benchmarks

#### Test: `benchmark_connection_scaling`
**Purpose**: Test system behavior under high connection count
**Setup**:
- Ramp test: Gradually increase concurrent connections
- Connection types: Long-lived HTTP keep-alive connections
- Operations: Mixed GET/PUT workload

**Test Procedure**:
```bash
# Ramp from 100 to 10,000 connections over 10 minutes
./object-storage-bench ramp \
  --endpoint http://storage.local:9000 \
  --bucket benchmark-connections \
  --start-connections 100 \
  --end-connections 10000 \
  --ramp-duration 600s \
  --test-duration-per-level 30s \
  --operation-mix "get:70,put:30"
```

**Measurements**:
- Maximum stable concurrent connections
- Request latency vs connection count
- Memory usage per connection
- File descriptor utilization
- Connection establishment rate
- Connection cleanup efficiency

**Success Criteria**:
- Handle target concurrent connections without errors
- Linear or sub-linear latency increase with connection count
- Clean connection cleanup (no resource leaks)

### 4. Erasure Coding Performance

#### Test: `benchmark_erasure_coding_encode_performance`
**Purpose**: Measure erasure coding encoding overhead
**Setup**:
- Test various EC schemes: EC:2+1, EC:4+2, EC:8+4
- Object sizes: 1MB to 100MB
- Measure encoding time and CPU utilization

**Test Procedure**:
```bash
for scheme in "2+1" "4+2" "8+4"; do
  for size in 1MB 10MB 100MB; do
    ./object-storage-bench ec-encode \
      --scheme $scheme \
      --object-size $size \
      --iterations 100 \
      --measure-cpu-time
  done
done
```

**Measurements**:
- Encoding time per MB
- CPU cycles consumed per encoding operation
- Memory usage during encoding
- Parallel encoding efficiency (multiple objects)

**Analysis**:
- Encoding time should scale linearly with object size
- Higher redundancy schemes (more parity) take more time
- CPU usage should be predictable and bounded

#### Test: `benchmark_erasure_coding_decode_performance`
**Purpose**: Measure reconstruction performance under failure scenarios
**Setup**:
- Various failure scenarios: 1 drive lost, 2 drives lost, etc.
- Different EC schemes and object sizes
- Measure reconstruction time and resource usage

**Test Procedure**:
```bash
./object-storage-bench ec-reconstruct \
  --scheme "4+2" \
  --object-size 10MB \
  --failed-shards 1,2 \
  --iterations 50 \
  --measure-reconstruction-time
```

**Measurements**:
- Reconstruction time vs number of failed shards
- Memory usage during reconstruction
- I/O amplification factor (reads required for reconstruction)
- Parallel reconstruction efficiency

### 5. Metadata Performance

#### Test: `benchmark_metadata_operations`
**Purpose**: Test metadata-heavy operations (LIST, HEAD, etc.)
**Setup**:
- Pre-populate bucket with 1 million objects
- Various list operation patterns
- Concurrent metadata operations

**Test Procedure**:
```bash
# Pre-populate with hierarchical structure
./object-storage-bench populate \
  --bucket benchmark-metadata \
  --object-count 1000000 \
  --key-pattern "year={year}/month={month}/day={day}/hour={hour}/file-{id}.dat" \
  --object-size 1KB

# Benchmark list operations
./object-storage-bench list \
  --bucket benchmark-metadata \
  --concurrent-clients 32 \
  --list-patterns "prefix,delimiter,max-keys" \
  --duration 300s
```

**Test Cases**:
- List all objects (no prefix/delimiter)
- List with various prefix lengths
- List with delimiter (directory simulation)
- List with max-keys pagination
- Concurrent HEAD operations on random objects

**Measurements**:
- List operations per second
- Response time vs result set size
- Memory usage for large list operations
- Pagination efficiency (continuation token performance)

**Success Criteria**:
- List performance scales sub-linearly with object count
- Memory usage bounded regardless of bucket size
- Consistent pagination performance

### 6. Mixed Workload Benchmarks

#### Test: `benchmark_realistic_workload_web_serving`
**Purpose**: Simulate realistic web application object storage usage
**Setup**:
- Object size distribution: 80% small (1-100KB), 20% medium (1-10MB)
- Operation mix: 80% GET, 15% PUT, 5% DELETE
- Access pattern: 80% recent objects (hot), 20% random (cold)

**Test Procedure**:
```bash
./object-storage-bench mixed-workload \
  --endpoint http://storage.local:9000 \
  --bucket benchmark-realistic \
  --duration 1800s \
  --operation-mix "get:80,put:15,delete:5" \
  --object-size-distribution "small:80,medium:20" \
  --access-pattern "hot:80,cold:20" \
  --concurrent-clients 64
```

**Measurements**:
- Overall operations per second (mixed)
- Per-operation-type latency distributions
- Resource utilization patterns
- Cache effectiveness (if caching enabled)
- System stability over extended duration

#### Test: `benchmark_backup_workload`
**Purpose**: Simulate backup/archival workload characteristics
**Setup**:
- Large sequential writes (simulating backup streams)
- Object size: 1GB objects via multipart upload
- Write-heavy with occasional reads for verification

**Test Procedure**:
```bash
./object-storage-bench backup \
  --endpoint http://storage.local:9000 \
  --bucket benchmark-backup \
  --object-size 1GB \
  --concurrent-streams 8 \
  --write-read-ratio 95:5 \
  --duration 1800s \
  --verify-integrity true
```

**Measurements**:
- Sustained write bandwidth
- Memory efficiency during large uploads
- Disk utilization patterns
- Read performance for verification
- Data integrity validation (checksum verification)

### 7. Failure Scenario Benchmarks

#### Test: `benchmark_single_drive_failure`
**Purpose**: Measure performance degradation during drive failure
**Setup**:
- Baseline performance with all drives healthy
- Simulate single drive failure during active workload
- Measure impact on operations

**Test Procedure**:
```bash
# Baseline measurement
./object-storage-bench baseline \
  --duration 300s \
  --operation-mix "get:70,put:30" \
  --concurrent-clients 32

# Drive failure simulation
./object-storage-bench failure \
  --simulate-drive-failure node1:/data/disk3 \
  --failure-time 150s \
  --duration 300s \
  --operation-mix "get:70,put:30" \
  --concurrent-clients 32
```

**Measurements**:
- Performance degradation percentage
- Error rate during failure
- Recovery time after replacement
- Latency impact during degraded operation
- Healing progress and resource usage

**Success Criteria**:
- Continued operation during single drive failure
- < 20% performance degradation for EC:4+2
- < 1% error rate during failure
- Full recovery within 1 hour for 1TB of affected data

#### Test: `benchmark_network_partition`
**Purpose**: Test behavior during network partitions in distributed setup
**Setup**:
- Multi-node cluster with replication or distribution
- Simulate network partition affecting 1 node
- Measure impact on availability and consistency

**Test Procedure**:
```bash
./object-storage-bench partition \
  --cluster-nodes node1,node2,node3,node4 \
  --partition-node node3 \
  --partition-duration 180s \
  --test-duration 600s \
  --operation-mix "get:60,put:40"
```

**Measurements**:
- Request success rate during partition
- Consistency behavior (read-after-write)
- Recovery behavior after partition heals
- Data synchronization time

### 8. Scalability Benchmarks

#### Test: `benchmark_horizontal_scalability`
**Purpose**: Measure performance scaling as nodes are added
**Setup**:
- Start with 3-node cluster
- Add nodes one at a time (3→4→5→6 nodes)
- Measure performance improvement

**Test Procedure**:
```bash
for nodes in 3 4 5 6; do
  ./object-storage-bench scale \
    --active-nodes $nodes \
    --operation-mix "get:60,put:40" \
    --duration 300s \
    --concurrent-clients $((nodes * 16)) \
    --measure-scaling-efficiency
done
```

**Analysis**:
- Performance scaling efficiency (actual vs theoretical)
- Resource utilization across nodes
- Load balancing effectiveness
- Network bottlenecks

**Success Criteria**:
- > 80% linear scaling efficiency for 3→6 nodes
- Even load distribution across nodes
- No single-node bottlenecks

### 9. Long-term Performance Testing

#### Test: `benchmark_endurance_testing`
**Purpose**: Verify sustained performance over extended periods
**Setup**:
- 24-48 hour continuous operation
- Realistic mixed workload
- Monitor for performance degradation, memory leaks

**Test Procedure**:
```bash
./object-storage-bench endurance \
  --endpoint http://storage.local:9000 \
  --bucket benchmark-endurance \
  --duration 86400s \
  --operation-mix "get:70,put:25,delete:5" \
  --concurrent-clients 32 \
  --object-lifecycle-enabled true \
  --monitor-interval 300s
```

**Monitoring**:
- Performance trending over time
- Memory usage patterns
- Resource leak detection
- Disk space utilization
- System log analysis for errors

**Success Criteria**:
- < 5% performance degradation over 24 hours
- No memory leaks or resource exhaustion
- Stable error rates (< 0.01%)
- Successful completion of all lifecycle operations

## Performance Analysis and Reporting

### Metrics Collection Framework

#### Core Performance Metrics
```yaml
throughput_metrics:
  - operations_per_second
  - bytes_per_second
  - requests_completed_total
  - requests_failed_total

latency_metrics:
  - request_duration_seconds  # Histogram with percentiles
  - time_to_first_byte_seconds
  - upload_completion_time_seconds
  - multipart_assembly_time_seconds

resource_metrics:
  - cpu_usage_percent
  - memory_usage_bytes
  - memory_usage_percent  
  - disk_io_bytes_total
  - disk_io_operations_total
  - network_bytes_total

erasure_coding_metrics:
  - encode_operations_total
  - encode_duration_seconds
  - decode_operations_total
  - decode_duration_seconds
  - healing_operations_total

storage_metrics:
  - objects_total
  - bytes_stored_total
  - drive_usage_percent
  - drive_health_status
```

#### Advanced Analytics
```python
class BenchmarkAnalyzer:
    def analyze_performance_trends(self, metrics_data):
        """Identify performance degradation patterns"""
        
    def detect_bottlenecks(self, resource_metrics):
        """Identify system bottlenecks (CPU, memory, disk, network)"""
        
    def calculate_scaling_efficiency(self, node_count, performance_data):
        """Measure horizontal scaling effectiveness"""
        
    def analyze_latency_distribution(self, latency_data):
        """Analyze latency patterns and identify outliers"""
        
    def estimate_capacity_limits(self, utilization_data):
        """Predict capacity limits based on current utilization"""
```

### Benchmark Report Generation

#### Performance Summary Report
```markdown
# Object Storage Benchmark Results

## Test Configuration
- **Date**: 2026-02-13
- **Duration**: 5 minutes per test
- **Nodes**: 4 storage nodes
- **EC Configuration**: EC:4+2
- **Total Storage**: 24 drives

## Results Summary
| Test Category | Target | Actual | Status |
|---------------|--------|---------|---------|
| PUT Throughput (64KB) | 15,000 ops/sec | 18,250 ops/sec | ✅ PASS |
| GET Throughput (64KB) | 30,000 ops/sec | 34,150 ops/sec | ✅ PASS |
| PUT Latency P99 | < 30ms | 24.2ms | ✅ PASS |
| GET Latency P99 | < 15ms | 12.8ms | ✅ PASS |
| Multipart Assembly | < 2s | 1.4s | ✅ PASS |

## Detailed Analysis
...
```

### Performance Regression Testing
- **Baseline Establishment**: Create performance baselines for each release
- **Regression Detection**: Automated detection of performance regressions > 10%
- **Trend Analysis**: Track performance trends over time
- **Alerting**: Performance alerts when targets not met

### Continuous Benchmarking Pipeline
```yaml
benchmark_pipeline:
  triggers:
    - code_changes: true
    - scheduled: "daily"
    - manual: true
  
  test_matrix:
    - small_cluster: [3_nodes, 6_drives_per_node]
    - medium_cluster: [6_nodes, 8_drives_per_node]
    - large_cluster: [12_nodes, 10_drives_per_node]
  
  test_suites:
    - basic_performance
    - multipart_upload  
    - concurrent_connections
    - failure_scenarios
    - mixed_workloads
  
  reporting:
    - performance_dashboard
    - regression_alerts
    - trend_analysis
```

This comprehensive benchmark specification ensures consistent, reproducible performance validation of object storage implementations across different deployment sizes and workload patterns, providing confidence in production readiness and helping identify optimization opportunities.