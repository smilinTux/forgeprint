# Web Server Performance Benchmarks

## Overview
This document defines performance benchmarks and targets for web server implementations. These benchmarks establish minimum acceptable performance thresholds using industry-standard testing patterns and provide standardized methodology for validating HTTP server performance.

## Test Environment Specifications

### Hardware Requirements
- **CPU**: 4+ cores, 2.5+ GHz (8+ cores for high-concurrency tests)
- **RAM**: 8GB minimum, 16GB recommended
- **Network**: Gigabit Ethernet (10Gbps for throughput tests)
- **Storage**: SSD for static content serving (NVMe for max performance)

### Software Environment
- **OS**: Linux (Ubuntu 20.04+ or equivalent)
- **Kernel**: Version 5.4+ with io_uring support
- **Network Stack**: Optimized TCP settings for high concurrency
- **Load Generator**: wrk, Apache Bench (ab), or siege

### System Configuration
```bash
# Network tuning for high-performance testing
echo 'net.core.somaxconn = 65535' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_max_syn_backlog = 65535' >> /etc/sysctl.conf
echo 'net.core.netdev_max_backlog = 30000' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_congestion_control = bbr' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_slow_start_after_idle = 0' >> /etc/sysctl.conf

# File descriptor limits
echo '* soft nofile 65535' >> /etc/security/limits.conf
echo '* hard nofile 65535' >> /etc/security/limits.conf

# Memory settings
echo 'vm.swappiness = 10' >> /etc/sysctl.conf
```

## Performance Targets by Feature Set

### 1. Static File Server (Minimal)
**Features**: Basic HTTP/1.1, static file serving

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Static files/sec (1KB)** | 50,000 | 25,000 |
| **Static files/sec (100KB)** | 8,000 | 4,000 |
| **Concurrent connections** | 10,000 | 5,000 |
| **P50 latency** | < 1ms | < 5ms |
| **P95 latency** | < 5ms | < 20ms |
| **P99 latency** | < 10ms | < 50ms |
| **Memory per connection** | < 2KB | < 8KB |
| **CPU utilization** | < 70% | < 85% |

### 2. Full HTTP/1.1 Feature Set
**Features**: Virtual hosts, compression, caching, SSL termination

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Requests/sec (dynamic)** | 25,000 | 15,000 |
| **Requests/sec (cached)** | 40,000 | 20,000 |
| **HTTPS requests/sec** | 15,000 | 8,000 |
| **P50 latency** | < 2ms | < 10ms |
| **P95 latency** | < 10ms | < 50ms |
| **P99 latency** | < 25ms | < 100ms |
| **Memory per connection** | < 8KB | < 20KB |

### 3. Full Feature Set + HTTP/2
**Features**: HTTP/2, server push, load balancing, WebSocket

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **HTTP/2 streams/sec** | 20,000 | 10,000 |
| **WebSocket connections** | 50,000 | 25,000 |
| **Reverse proxy RPS** | 20,000 | 10,000 |
| **P50 latency (with SSL)** | < 3ms | < 15ms |
| **P95 latency (with SSL)** | < 15ms | < 75ms |
| **P99 latency (with SSL)** | < 40ms | < 150ms |

## Detailed Benchmark Tests

### 1. Static Content Benchmarks

#### Test: `benchmark_static_file_throughput`
**Purpose**: Measure maximum throughput for static file serving
**Setup**:
- 1KB file (small.html)
- 100KB file (medium.js)
- 1MB file (large.pdf)
- Files served from local disk (eliminate network as bottleneck)

**Test Procedure**:
```bash
# Small files (1KB) - CPU and request parsing bound
for threads in 1 2 4 8 16 32 64; do
  wrk -t $threads -c $((threads * 10)) -d 30s --latency \
    http://localhost:8080/small.html > static_small_${threads}t.txt
done

# Medium files (100KB) - Balance of CPU and I/O
for connections in 100 500 1000 2000; do
  wrk -t 16 -c $connections -d 30s --latency \
    http://localhost:8080/medium.js > static_medium_${connections}c.txt
done

# Large files (1MB) - I/O and sendfile efficiency
wrk -t 8 -c 100 -d 30s --latency \
  http://localhost:8080/large.pdf > static_large.txt
```

**Measurements**:
- Requests per second at each concurrency level
- Latency distribution (P50, P95, P99)
- System CPU usage (user, system, iowait)
- Network throughput (MB/s)
- sendfile() call efficiency (syscalls vs bytes transferred)

**Success Criteria**:
- 1KB files: > 25,000 RPS
- 100KB files: > 4,000 RPS
- 1MB files: > 400 RPS
- CPU-efficient: < 85% CPU at target RPS

#### Test: `benchmark_sendfile_vs_read_write`
**Purpose**: Validate sendfile zero-copy performance benefit
**Setup**: Same 1MB file served with and without sendfile optimization

**Expected Results**:
- sendfile: ~400-800 RPS
- read/write: ~200-400 RPS (50% performance penalty)
- sendfile reduces CPU usage by 20-30%

#### Test: `benchmark_directory_listing`
**Purpose**: Measure auto-index performance for directories with varying file counts
**Setup**: Directories with 10, 100, 1000, 10000 files

**Measurements**:
- Directory listing generation time
- HTML output size vs file count
- Memory usage for large directories

### 2. HTTP Protocol Benchmarks

#### Test: `benchmark_http_keep_alive`
**Purpose**: Compare keep-alive vs new connection overhead
**Setup**: Sequential requests on same vs new connections

**Test Procedure**:
```bash
# Keep-alive connections
wrk -t 16 -c 200 -d 30s --latency \
  -H "Connection: keep-alive" http://localhost:8080/

# New connections each request
wrk -t 16 -c 200 -d 30s --latency \
  -H "Connection: close" http://localhost:8080/
```

**Expected Results**:
- Keep-alive: ~20-50% higher throughput
- Reduced connection setup overhead
- Lower server CPU usage for keep-alive

#### Test: `benchmark_http_methods`
**Purpose**: Compare performance across HTTP methods
**Workloads**: GET, HEAD, POST with small body, PUT with 10KB body

**Success Criteria**:
- HEAD ~5% faster than GET (no response body)
- POST similar to GET for small bodies
- PUT throughput scales with body size

#### Test: `benchmark_chunked_encoding`
**Purpose**: Measure chunked transfer encoding overhead
**Setup**: Same response sent as Content-Length vs chunked

**Measurements**:
- Throughput difference (chunked typically 5-10% slower)
- Memory usage for chunked buffer management

### 3. HTTPS/SSL Benchmarks

#### Test: `benchmark_ssl_handshake_performance`
**Purpose**: Measure TLS handshake throughput and latency
**Setup**: HTTPS listener with RSA 2048-bit and ECDSA P-256 certificates

**Test Procedure**:
```bash
# RSA certificate
wrk -t 8 -c 100 -d 30s --latency \
  -H "Connection: close" https://localhost:8443/ > ssl_rsa.txt

# ECDSA certificate  
wrk -t 8 -c 100 -d 30s --latency \
  -H "Connection: close" https://localhost:8443/ > ssl_ecdsa.txt

# Existing connections (no handshake overhead)
wrk -t 16 -c 200 -d 30s --latency \
  https://localhost:8443/ > ssl_keepalive.txt
```

**Expected Results**:
- RSA handshakes: 1,000-3,000/sec
- ECDSA handshakes: 2,000-5,000/sec (2-3x faster)
- Keep-alive HTTPS: 80-90% of HTTP performance

#### Test: `benchmark_ssl_session_resumption`
**Purpose**: Validate SSL session cache performance benefit
**Setup**: SSL session caching enabled vs disabled

**Measurements**:
- Handshake latency with session resumption (~50% faster)
- Session cache hit rate
- Memory usage for session storage

### 4. Virtual Host Benchmarks

#### Test: `benchmark_vhost_routing_overhead`
**Purpose**: Measure virtual host routing performance impact
**Setup**:
- Single virtual host (baseline)
- 10 virtual hosts with exact match
- 100 virtual hosts with wildcard patterns

**Test Procedure**:
```bash
# Baseline: single vhost
wrk -t 16 -c 400 -d 30s http://localhost:8080/ > vhost_1.txt

# 10 vhosts, round-robin Host headers
wrk -t 16 -c 400 -d 30s -s vhost_10.lua http://localhost:8080/ > vhost_10.txt

# 100 vhosts with pattern matching
wrk -t 16 -c 400 -d 30s -s vhost_100.lua http://localhost:8080/ > vhost_100.txt
```

**Lua script** (vhost_10.lua):
```lua
local hosts = {"host1.example.com", "host2.example.com", ...}
request = function()
  local host = hosts[math.random(1, #hosts)]
  return wrk.format("GET", "/", {["Host"] = host})
end
```

**Success Criteria**:
- < 5% performance degradation for 10 vhosts
- < 15% performance degradation for 100 vhosts
- O(log N) lookup time for large vhost counts

### 5. Compression Benchmarks

#### Test: `benchmark_gzip_compression_performance`
**Purpose**: Measure compression throughput and CPU overhead
**Setup**: Compressible content (HTML/CSS/JS) vs incompressible (images)

**Test Procedure**:
```bash
# Uncompressed baseline
wrk -t 16 -c 200 -d 30s http://localhost:8080/large.html > compression_none.txt

# Gzip compression
wrk -t 16 -c 200 -d 30s \
  -H "Accept-Encoding: gzip" http://localhost:8080/large.html > compression_gzip.txt

# Brotli compression
wrk -t 16 -c 200 -d 30s \
  -H "Accept-Encoding: br" http://localhost:8080/large.html > compression_br.txt
```

**Measurements**:
- Throughput reduction for compression (~20-40% CPU overhead)
- Compression ratio (bytes saved)
- Network bandwidth savings
- Memory usage for compression buffers

**Expected Results**:
- Gzip: 60-80% compression ratio for text, 20-30% RPS reduction
- Brotli: 70-85% compression ratio, 30-50% RPS reduction
- Images: minimal compression, performance impact

### 6. Reverse Proxy Benchmarks

#### Test: `benchmark_reverse_proxy_overhead`
**Purpose**: Measure proxy vs direct serving overhead
**Setup**: Nginx frontend → backend server vs direct backend access

**Test Procedure**:
```bash
# Direct backend access (baseline)
wrk -t 16 -c 300 -d 60s http://backend:8081/ > proxy_direct.txt

# Through proxy
wrk -t 16 -c 300 -d 60s http://proxy:8080/ > proxy_indirect.txt

# Proxy with connection pooling
wrk -t 16 -c 300 -d 60s http://proxy:8080/ > proxy_pooled.txt
```

**Measurements**:
- Added latency from proxying (~1-5ms)
- Throughput overhead (~10-20% reduction)
- Connection pool efficiency
- Memory usage for proxy state

#### Test: `benchmark_load_balancing_algorithms`
**Purpose**: Compare load balancing algorithm performance
**Algorithms**: Round-robin, least connections, IP hash

**Measurements**:
- Algorithm overhead (round-robin fastest)
- Distribution quality (requests per backend)
- Failure recovery time

### 7. WebSocket Benchmarks

#### Test: `benchmark_websocket_connection_scaling`
**Purpose**: Measure WebSocket concurrent connection capacity
**Setup**: WebSocket echo server, varying connection counts

**Test Procedure**:
```bash
# WebSocket connections without traffic
for connections in 1000 5000 10000 25000 50000; do
  ./websocket_bench --mode idle --connections $connections \
    --duration 60s ws://localhost:8080/ws > ws_idle_${connections}.txt
done

# WebSocket with message traffic
./websocket_bench --mode ping --connections 1000 --rate 10 \
  --duration 60s ws://localhost:8080/ws > ws_ping.txt
```

**Success Criteria**:
- Support 25,000+ concurrent idle WebSocket connections
- < 1KB memory per idle connection
- Message latency < 5ms for active connections

### 8. Caching Benchmarks

#### Test: `benchmark_cache_hit_performance`
**Purpose**: Measure cache effectiveness and hit/miss overhead
**Setup**: Proxy cache with configurable hit ratio

**Test Procedure**:
```bash
# Cache miss (first request)
wrk -t 8 -c 100 -d 30s http://localhost:8080/cache-test.html > cache_miss.txt

# Cache hit (subsequent requests)
wrk -t 8 -c 100 -d 30s http://localhost:8080/cache-test.html > cache_hit.txt

# Mixed hit/miss workload (80% hit rate)
wrk -t 16 -c 200 -d 60s -s cache_mixed.lua \
  http://localhost:8080/ > cache_mixed.txt
```

**Expected Results**:
- Cache hit: 5-10x faster than cache miss
- Cache hit latency < 0.5ms
- Memory usage for cache index

### 9. Error Handling Benchmarks

#### Test: `benchmark_404_error_performance`
**Purpose**: Measure 404 error handling overhead vs successful requests
**Setup**: Mix of valid and 404 requests

**Test Procedure**:
```bash
# All 200 OK responses
wrk -t 16 -c 200 -d 30s http://localhost:8080/index.html > errors_200.txt

# All 404 Not Found
wrk -t 16 -c 200 -d 30s http://localhost:8080/nonexistent.html > errors_404.txt

# Mixed 80% success, 20% 404
wrk -t 16 -c 200 -d 30s -s mixed_errors.lua \
  http://localhost:8080/ > errors_mixed.txt
```

**Success Criteria**:
- 404 handling within 5% of 200 OK performance
- Custom error pages don't significantly impact performance
- Error logging doesn't create bottleneck

### 10. Concurrent Connection Scaling

#### Test: `benchmark_connection_scaling`
**Purpose**: Measure how performance scales with concurrent connections
**Setup**: Fixed total request rate, varying connection count

**Test Procedure**:
```bash
# Vary connections, keep total rate ~10,000 RPS
for connections in 10 50 100 500 1000 2000 5000; do
  threads=$((connections / 10))
  threads=$((threads > 16 ? 16 : threads))
  
  wrk -t $threads -c $connections -d 30s --latency \
    http://localhost:8080/small.html > scaling_${connections}c.txt
done
```

**Measurements**:
- Latency vs connection count
- Memory usage scaling (linear with connections)
- CPU scheduling overhead
- File descriptor usage

**Success Criteria**:
- Linear memory scaling: < 8KB per connection
- Latency growth: P99 < 2x at 1000 connections vs 100
- Support configured max_connections

### 11. HTTP/2 Specific Benchmarks

#### Test: `benchmark_http2_multiplexing`
**Purpose**: Measure HTTP/2 stream multiplexing efficiency
**Setup**: HTTP/1.1 vs HTTP/2 with multiple concurrent requests per connection

**Test Procedure**:
```bash
# HTTP/1.1 baseline (6 connections per client)
h2load -n 10000 -c 100 -m 6 --h1 http://localhost:8080/

# HTTP/2 multiplexing (many streams per connection)
h2load -n 10000 -c 10 -m 100 http://localhost:8443/

# HTTP/2 server push test
h2load -n 1000 -c 10 -m 10 --header "accept: text/html" \
  http://localhost:8443/push.html
```

**Expected Results**:
- HTTP/2: Better latency for multiple resources
- Reduced connection overhead
- Server push eliminates round trips

### 12. Memory Usage Under Load

#### Test: `benchmark_memory_growth_under_load`
**Purpose**: Verify memory usage remains stable under sustained load
**Setup**: Long-running test with memory monitoring

**Test Procedure**:
```bash
# Start memory monitoring
./memory_monitor.sh nginx &
MONITOR_PID=$!

# Sustained load for 10 minutes
wrk -t 16 -c 500 -d 600s http://localhost:8080/ > memory_stress.txt

# Stop monitoring
kill $MONITOR_PID
```

**Measurements**:
- Memory usage over time (should stabilize)
- Memory leaks detection (RSS growth)
- Buffer pool effectiveness
- Connection memory scaling

**Success Criteria**:
- Memory usage stabilizes within 5 minutes
- No continuous growth > 1% per hour
- Memory per connection within targets

## Performance Analysis and Reporting

### Metrics Collection
```
# Request metrics
requests_per_second
response_time_p50, p95, p99
error_rate_percentage
bytes_per_second

# Connection metrics  
concurrent_connections
connection_setup_rate
keep_alive_ratio

# System metrics
cpu_usage_percent
memory_usage_mb
network_rx_tx_mbps
disk_io_read_write_mbps

# Protocol specific
ssl_handshakes_per_second
http2_streams_per_connection
websocket_message_latency
compression_ratio
cache_hit_ratio
```

### Reporting Format
```markdown
# Web Server Benchmark Results

## Test Configuration
- **Date**: 2026-02-13
- **Duration**: 60 seconds
- **Hardware**: 8 cores, 16GB RAM
- **Feature Set**: Full HTTP/1.1

## Results Summary
| Test | Target | Actual | Status |
|------|--------|--------|--------|
| Static Files (1KB) | 25,000 RPS | 42,150 RPS | ✅ PASS |
| HTTPS | 8,000 RPS | 12,300 RPS | ✅ PASS |
| P99 Latency | < 100ms | 35ms | ✅ PASS |
| Memory/Connection | < 20KB | 8.2KB | ✅ PASS |

## Detailed Results
[Performance graphs and analysis]
```

### Regression Testing
- **Baseline**: Record performance baselines for each feature set
- **Comparison**: Compare results against previous versions
- **Alerting**: Flag regressions > 10%
- **CI Integration**: Automated benchmark runs on releases

## Benchmark Automation

### Continuous Integration
```yaml
performance_tests:
  stage: benchmark
  script:
    - ./setup_test_environment.sh
    - ./configure_webserver.sh --feature-set full
    - ./run_benchmarks.sh --duration 60s
    - ./analyze_results.sh
    - ./check_regression.sh
  artifacts:
    reports:
      performance: benchmark_results.json
```

This benchmark specification ensures consistent, reproducible performance validation of web server implementations across static serving, dynamic content, SSL/TLS, HTTP/2, WebSocket, and reverse proxy scenarios.