# Search Engine Performance Benchmarks

## Overview
This document defines performance benchmarks and targets for search engine implementations. These benchmarks establish minimum acceptable performance thresholds and provide standardized testing methodology for comparing implementations across different configurations and hardware platforms.

## Test Environment Specifications

### Hardware Requirements
- **CPU**: 8+ cores, 3.0+ GHz (Intel Xeon or AMD EPYC class)
- **RAM**: 32GB minimum, 64GB recommended
- **Storage**: NVMe SSD with 10,000+ IOPS, 2GB/s sequential throughput
- **Network**: 10 Gigabit Ethernet for distributed tests

### Software Environment  
- **OS**: Linux (Ubuntu 22.04+ or RHEL 8+)
- **Kernel**: Version 5.15+ (for modern I/O optimizations)
- **File System**: ext4 or xfs with optimal mount options
- **JVM**: OpenJDK 17+ with G1GC (if applicable)

### System Configuration
```bash
# Optimize for search engine workloads
echo 'vm.max_map_count = 262144' >> /etc/sysctl.conf    # Memory mapping
echo 'vm.swappiness = 1' >> /etc/sysctl.conf           # Avoid swap
echo 'fs.file-max = 2097152' >> /etc/sysctl.conf       # File descriptors

# I/O scheduler optimization
echo 'mq-deadline' > /sys/block/nvme0n1/queue/scheduler

# Memory transparent huge pages
echo 'madvise' > /sys/kernel/mm/transparent_hugepage/enabled
```

---

## Performance Targets by Workload

### 1. Indexing Performance

#### 1.1 Bulk Indexing Throughput
**Baseline Configuration**: Single node, 3 primary shards, no replicas, refresh_interval=30s

| Document Size | Target (docs/sec) | Minimum Acceptable | Test Duration |
|---------------|------------------|-------------------|---------------|
| **Small (1KB)** | 25,000 docs/sec | 15,000 docs/sec | 10 minutes |
| **Medium (10KB)** | 8,000 docs/sec | 5,000 docs/sec | 10 minutes |
| **Large (100KB)** | 1,000 docs/sec | 600 docs/sec | 10 minutes |
| **Vector-heavy (50KB + 768-dim)** | 2,000 docs/sec | 1,200 docs/sec | 10 minutes |

**Resource Constraints**:
- CPU usage: <80% average during indexing
- Memory usage: <75% of available RAM
- I/O wait: <20% average

#### 1.2 Concurrent Indexing and Search
**Mixed Workload**: 70% indexing load + 30% search queries

| Scenario | Indexing Rate | Query Rate | Target Search Latency | Minimum Acceptable |
|----------|---------------|------------|----------------------|-------------------|
| **Log Analytics** | 10,000 docs/sec | 50 queries/sec | P95 < 200ms | P95 < 500ms |
| **E-commerce** | 1,000 docs/sec | 200 queries/sec | P95 < 100ms | P95 < 250ms |
| **Document Search** | 500 docs/sec | 100 queries/sec | P95 < 150ms | P95 < 300ms |

#### 1.3 Index Size and Compression
**Storage Efficiency**: Measured after force merge to single segment

| Content Type | Target Compression | Minimum Acceptable | Notes |
|--------------|-------------------|-------------------|-------|
| **Log Messages** | 8:1 ratio | 5:1 ratio | High redundancy text |
| **Product Catalog** | 3:1 ratio | 2:1 ratio | Mixed structured data |
| **Documents/Articles** | 5:1 ratio | 3:1 ratio | Natural language text |
| **Vectors + Metadata** | 2:1 ratio | 1.5:1 ratio | Dense numeric data |

---

### 2. Query Performance

#### 2.1 Search Latency (Single Node)
**Test Dataset**: 10M documents across 5 shards, warmed cache

| Query Type | Target P50 | Target P95 | Target P99 | Minimum P99 |
|------------|------------|------------|------------|-------------|
| **Term Query** | <5ms | <15ms | <30ms | <50ms |
| **Match Query** | <10ms | <30ms | <60ms | <100ms |
| **Bool Query (3 clauses)** | <15ms | <50ms | <100ms | <200ms |
| **Phrase Query** | <20ms | <60ms | <120ms | <250ms |
| **Fuzzy Query** | <25ms | <75ms | <150ms | <300ms |
| **Wildcard Query** | <30ms | <100ms | <200ms | <500ms |
| **Range Query** | <8ms | <25ms | <50ms | <100ms |

#### 2.2 Complex Query Performance
**Advanced Query Patterns**: Real-world complex queries

| Query Pattern | Target P95 | Minimum Acceptable | Description |
|---------------|------------|-------------------|-------------|
| **Multi-Match + Filters** | <80ms | <200ms | Search across 5 fields + 3 filters |
| **Nested Query** | <120ms | <300ms | Query within nested object arrays |
| **Script Score** | <200ms | <500ms | Custom scoring with Painless script |
| **Geo Distance** | <50ms | <150ms | Within 10km radius + text search |
| **kNN Vector Search** | <100ms | <250ms | k=10 nearest neighbors, 768-dim |
| **Hybrid Search** | <150ms | <400ms | BM25 + kNN with RRF combination |

#### 2.3 Concurrent Query Throughput
**Load Testing**: Sustained concurrent query execution

| Concurrency Level | Target QPS | Target P95 Latency | Minimum QPS | Max P95 Latency |
|-------------------|------------|-------------------|-------------|-----------------|
| **10 concurrent** | 200 QPS | <100ms | 150 QPS | <200ms |
| **50 concurrent** | 800 QPS | <200ms | 600 QPS | <400ms |
| **100 concurrent** | 1200 QPS | <400ms | 900 QPS | <800ms |
| **200 concurrent** | 1500 QPS | <800ms | 1100 QPS | <1500ms |

**Saturation Point**: Performance should degrade gracefully beyond saturation, not cliff-edge collapse

---

### 3. Aggregation Performance

#### 3.1 Bucket Aggregations
**Test Dataset**: 10M documents with representative cardinality

| Aggregation Type | Field Cardinality | Target Latency | Minimum Acceptable | Memory Usage |
|------------------|------------------|---------------|-------------------|--------------|
| **Terms Agg (top 10)** | 1K unique | <50ms | <100ms | <100MB |
| **Terms Agg (top 10)** | 100K unique | <200ms | <500ms | <500MB |
| **Terms Agg (top 100)** | 1M unique | <800ms | <2000ms | <1GB |
| **Date Histogram** | 1 year daily | <30ms | <80ms | <50MB |
| **Range Agg** | Numeric ranges | <25ms | <60ms | <30MB |
| **Nested Agg (2-level)** | Category → Brand | <150ms | <400ms | <200MB |

#### 3.2 Metric Aggregations
**Statistical Computations**: Single-pass metric calculations

| Metric Type | Target Latency | Minimum Acceptable | Notes |
|-------------|---------------|-------------------|-------|
| **Stats (min/max/avg/sum)** | <20ms | <50ms | Basic statistics |
| **Extended Stats** | <30ms | <80ms | Includes variance, std dev |
| **Percentiles** | <50ms | <150ms | T-digest approximation |
| **Cardinality** | <40ms | <120ms | HyperLogLog++ estimation |
| **Geo Bounds** | <35ms | <100ms | Geographic extent |

#### 3.3 Complex Aggregations
**Multi-Level Nested Aggregations**: Real-world analytics queries

| Aggregation Pattern | Target Latency | Minimum Acceptable | Description |
|---------------------|---------------|-------------------|-------------|
| **3-Level Nesting** | <500ms | <1500ms | Date → Category → Stats |
| **Significant Terms** | <300ms | <800ms | Find unusual terms |
| **Top Hits per Bucket** | <200ms | <600ms | Best doc per category |
| **Pipeline Aggregations** | <400ms | <1000ms | Derivative, moving avg |
| **Composite Pagination** | <150ms | <400ms | Paginate large buckets |

---

### 4. Distributed Performance

#### 4.1 Multi-Node Query Performance
**3-Node Cluster**: 15M documents across 9 shards (3 per node)

| Query Type | Target P95 | vs Single Node | Network Overhead |
|------------|------------|----------------|------------------|
| **Simple Term** | <25ms | +10ms | <5ms |
| **Complex Bool** | <80ms | +20ms | <10ms |
| **Aggregation** | <200ms | +50ms | <15ms |
| **Cross-Cluster** | <400ms | +200ms | <50ms |

#### 4.2 Shard Scaling Performance
**Linear Scaling Verification**: Performance should scale proportionally

| Shard Count | Documents | Query Latency | Indexing Rate | Notes |
|-------------|-----------|---------------|---------------|-------|
| **1 shard** | 5M docs | Baseline | Baseline | Single shard limit |
| **3 shards** | 15M docs | <1.2x baseline | 2.5x baseline | Near-linear scaling |
| **9 shards** | 45M docs | <1.5x baseline | 7x baseline | Some coordination overhead |
| **27 shards** | 135M docs | <2x baseline | 15x baseline | Increased network chatter |

#### 4.3 Failover and Recovery
**High Availability Performance**: Recovery time from node failure

| Scenario | Target Recovery | Minimum Acceptable | Impact During Recovery |
|----------|-----------------|-------------------|----------------------|
| **Data Node Failure** | <30 seconds | <2 minutes | Search latency +50% |
| **Master Node Failover** | <10 seconds | <30 seconds | Brief unavailability OK |
| **Network Partition** | <60 seconds | <5 minutes | Degraded service acceptable |
| **Full Cluster Restart** | <5 minutes | <15 minutes | Downtime acceptable |

---

### 5. Vector Search Benchmarks

#### 5.1 Vector Index Building
**HNSW Index Construction**: Time to build searchable vector index

| Vector Count | Dimensions | Build Time (Target) | Build Time (Max) | Memory Usage |
|--------------|------------|-------------------|------------------|--------------|
| **100K** | 768 | <5 minutes | <15 minutes | <2GB |
| **1M** | 768 | <30 minutes | <90 minutes | <8GB |
| **10M** | 384 | <3 hours | <8 hours | <25GB |
| **10M** | 768 | <6 hours | <18 hours | <45GB |

#### 5.2 kNN Query Performance
**Approximate Nearest Neighbor Search**: Latency and recall tradeoffs

| Vector Count | k | num_candidates | Target Latency | Min Recall | Max Latency |
|--------------|---|----------------|---------------|------------|-------------|
| **1M** | 10 | 100 | <20ms | 90% | <50ms |
| **1M** | 100 | 1000 | <100ms | 85% | <300ms |
| **10M** | 10 | 100 | <50ms | 85% | <150ms |
| **10M** | 100 | 1000 | <200ms | 80% | <600ms |

#### 5.3 Hybrid Search Performance
**BM25 + kNN Combination**: Real-world retrieval-augmented generation

| Text Corpus | Vector Count | Target Latency | Min Acceptable | RRF Quality |
|-------------|--------------|---------------|---------------|-------------|
| **1M articles** | 1M vectors | <100ms | <250ms | >0.85 nDCG |
| **10M products** | 10M vectors | <200ms | <500ms | >0.80 nDCG |

---

### 6. Real-World Benchmark Scenarios

#### 6.1 Log Analytics Workload
**Time-Series Data**: High-volume ingestion with time-based queries

**Configuration**:
- Index template with daily rollover
- Hot/warm/cold tier lifecycle
- 7-day retention in hot, 90-day in warm

**Performance Targets**:
```
Ingestion: 50,000 logs/second
Storage: 500GB/day raw, 100GB compressed
Queries: 95th percentile <500ms for 24-hour aggregations
Alerting: Real-time queries <100ms
Retention: Delete old indices <5 minutes
```

#### 6.2 E-commerce Product Search
**Product Catalog**: Updates with real-time search

**Configuration**:
- Product updates every 5 minutes
- Inventory changes real-time
- Faceted search with recommendations

**Performance Targets**:
```
Product Updates: 1000 products/minute
Search Latency: P95 <50ms for category browse
Facet Latency: P95 <30ms for filter combinations  
Autocomplete: P95 <25ms for prefix suggestions
Recommendation: P95 <100ms for similar products
```

#### 6.3 Document Management System
**Enterprise Search**: Large documents with access control

**Configuration**:
- Multi-tenant with document-level security
- Full-text search with highlight
- Version tracking and audit logging

**Performance Targets**:
```
Document Indexing: 100 docs/minute (avg 50KB)
Full-text Search: P95 <200ms with highlighting
Security Filtering: <20ms overhead per query
Version History: P95 <300ms for document timeline
Access Control: <10ms per permission check
```

---

## Benchmark Test Suite

### 1. Standard Test Datasets

#### Dataset A: Synthetic Web Pages
- **Size**: 1 million documents
- **Fields**: title (text), content (text), url (keyword), category (keyword), timestamp (date)
- **Characteristics**: Realistic text distribution, moderate term frequency

#### Dataset B: Product Catalog  
- **Size**: 10 million products
- **Fields**: name, description, brand, category, price, features, images
- **Characteristics**: High cardinality categorical data, numerical ranges

#### Dataset C: Server Logs
- **Size**: 100 million log entries
- **Fields**: timestamp, level, message, service, host, duration
- **Characteristics**: Time-series data, high ingestion rate simulation

#### Dataset D: Research Papers
- **Size**: 1 million academic papers  
- **Fields**: title, abstract, authors, journal, citations, full_text, embeddings
- **Characteristics**: Long-form text, vector embeddings, complex relationships

### 2. Benchmark Execution Framework

#### Test Runner Configuration
```yaml
benchmark:
  warmup_time: 5 minutes
  test_duration: 15 minutes
  cooldown_time: 2 minutes
  
  resource_monitoring:
    cpu_samples: 1 second
    memory_samples: 5 seconds
    disk_io_samples: 1 second
    
  failure_conditions:
    max_error_rate: 0.1%
    max_memory_usage: 90%
    max_cpu_usage: 95%
    
  reporting:
    percentiles: [50, 95, 99, 99.9]
    output_format: json
    include_raw_data: true
```

#### Load Generation Patterns
- **Constant Rate**: Steady query/indexing rate
- **Poisson**: Realistic bursty traffic patterns  
- **Ramp Up**: Gradual load increase to find breaking points
- **Spike**: Sudden load spikes to test elasticity

### 3. Performance Regression Detection

#### Baseline Establishment
- Run benchmarks on reference implementation
- Store results in performance database
- Track metrics trends over time

#### Regression Thresholds
- **Major Regression**: >20% performance decrease
- **Minor Regression**: 5-20% performance decrease  
- **Improvement**: >10% performance increase
- **Noise Threshold**: <5% variation (ignore)

#### Automated Alerts
```yaml
performance_monitoring:
  baseline_comparison: true
  alert_thresholds:
    query_latency_p95: +15%
    indexing_throughput: -10%
    memory_usage: +20%
    
  notification_channels:
    - slack: "#search-engine-alerts"  
    - email: "search-team@company.com"
```

---

## Hardware Scaling Guidelines

### Single Node Configurations

| RAM | CPU Cores | Storage | Target Dataset | Max QPS |
|-----|-----------|---------|----------------|---------|
| **16GB** | 4 cores | 500GB SSD | <5M docs | 200 QPS |
| **32GB** | 8 cores | 1TB SSD | <20M docs | 500 QPS |
| **64GB** | 16 cores | 2TB SSD | <50M docs | 1000 QPS |
| **128GB** | 32 cores | 4TB SSD | <100M docs | 2000 QPS |

### Multi-Node Scaling
- **3-node cluster**: 3x single-node capacity with fault tolerance
- **9-node cluster**: 7-8x single-node capacity (coordination overhead)
- **27-node cluster**: 15-20x single-node capacity (network bottlenecks emerge)

### Cost-Performance Optimization
- **Memory-optimized**: Better for aggregation-heavy workloads
- **Compute-optimized**: Better for complex query workloads  
- **Storage-optimized**: Better for large dataset, simple queries
- **Network-optimized**: Better for distributed deployments

---

## Conclusion

These benchmarks establish baseline performance expectations for search engine implementations. Actual performance may vary based on specific use cases, data characteristics, and hardware configurations. Regular benchmark execution ensures performance regression detection and guides optimization efforts.

Performance targets should be adjusted based on:
- **Data characteristics**: Text vs numeric vs vector content
- **Query patterns**: Simple vs complex vs real-time analytics
- **Hardware constraints**: Cloud vs on-premise vs edge deployment
- **SLA requirements**: Real-time vs near-real-time vs batch processing

Continuous benchmarking and performance monitoring are essential for maintaining production-grade search engine implementations.