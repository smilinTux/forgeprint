# API Gateway Performance Benchmarks

## Overview
This document defines performance benchmarks and targets for API gateway implementations. These benchmarks establish minimum acceptable performance thresholds using realistic API gateway workloads and provide standardized methodology for validating latency, throughput, and resource efficiency.

## Test Environment Specifications

### Hardware Requirements
- **CPU**: 8+ cores, 2.5+ GHz
- **RAM**: 16GB minimum, 32GB recommended
- **Network**: 10Gbps Ethernet (for multi-service testing)
- **Storage**: SSD for logs and cache storage

### Software Environment
- **OS**: Linux (Ubuntu 20.04+ or equivalent)
- **Kernel**: Version 5.4+ with optimizations
- **Load Generator**: wrk, JMeter, or custom gateway-specific tools
- **Upstream Services**: Lightweight echo services for testing

### System Configuration
```bash
# Network optimizations for high-throughput testing
echo 'net.core.somaxconn = 65535' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_tw_reuse = 1' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_fin_timeout = 30' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_keepalive_time = 1200' >> /etc/sysctl.conf

# File descriptor limits
ulimit -n 100000
echo '* soft nofile 100000' >> /etc/security/limits.conf
echo '* hard nofile 100000' >> /etc/security/limits.conf
```

## Performance Targets by Feature Set

### 1. Basic Proxy (No Plugins)
**Features**: Simple request forwarding without authentication or plugins

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Requests/second** | 50,000 | 25,000 |
| **P50 latency** | < 1ms | < 5ms |
| **P95 latency** | < 5ms | < 20ms |
| **P99 latency** | < 20ms | < 50ms |
| **Memory per connection** | < 4KB | < 10KB |
| **CPU utilization** | < 60% | < 80% |

### 2. Authentication Enabled
**Features**: JWT validation or API key authentication

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Requests/second** | 25,000 | 15,000 |
| **P50 latency** | < 3ms | < 10ms |
| **P95 latency** | < 15ms | < 50ms |
| **P99 latency** | < 40ms | < 100ms |
| **JWT validation overhead** | < 2ms | < 5ms |

### 3. Full Plugin Chain
**Features**: Auth + Rate limiting + Transformation + Circuit breaker

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Requests/second** | 15,000 | 8,000 |
| **P50 latency** | < 5ms | < 15ms |
| **P95 latency** | < 25ms | < 75ms |
| **P99 latency** | < 60ms | < 150ms |
| **Plugin chain overhead** | < 4ms | < 10ms |

### 4. Enterprise Feature Set
**Features**: All above + Caching + Analytics + Complex routing

| Metric | Target | Minimum Acceptable |
|--------|--------|-------------------|
| **Requests/second** | 10,000 | 5,000 |
| **Cache hit latency** | < 0.5ms | < 2ms |
| **Route matching (1000 routes)** | < 0.1ms | < 0.5ms |
| **Analytics overhead** | < 1ms | < 3ms |

## Detailed Benchmark Tests

### 1. Basic Proxy Throughput

#### Test: `benchmark_proxy_throughput_baseline`
**Purpose**: Measure maximum throughput without plugins
**Setup**: 
- Single upstream service (echo server)
- No authentication or plugins enabled
- Minimal routing configuration

**Test Procedure**:
```bash
# Single-threaded baseline
wrk -t 1 -c 10 -d 30s --latency \
  http://gateway:8000/api/echo > proxy_baseline_1t.txt

# Multi-threaded scaling
for threads in 1 2 4 8 16; do
  connections=$((threads * 50))
  wrk -t $threads -c $connections -d 30s --latency \
    http://gateway:8000/api/echo > proxy_baseline_${threads}t.txt
done
```

**Measurements**:
- Requests per second vs thread count
- Latency distribution at each concurrency level
- CPU utilization and memory usage
- Network throughput (MB/s)

**Success Criteria**:
- Single thread: > 5,000 RPS
- Linear scaling up to CPU core count
- Memory usage < 256MB at 25,000 RPS

#### Test: `benchmark_proxy_message_sizes`
**Purpose**: Measure throughput vs payload size
**Setup**: Echo service with configurable response sizes

**Test Procedure**:
```bash
for size in 100 1024 10240 102400; do
  # Configure echo service for response size
  curl -X POST http://echo:8080/config -d "response_size=$size"
  
  wrk -t 8 -c 200 -d 30s --latency \
    http://gateway:8000/api/echo > proxy_size_${size}b.txt
done
```

**Expected Results**:
- Small payloads (100B): > 40,000 RPS
- Medium payloads (1KB): > 25,000 RPS  
- Large payloads (100KB): > 500 RPS
- Throughput (bytes/sec) should remain relatively constant

### 2. Authentication Benchmarks

#### Test: `benchmark_jwt_validation_overhead`
**Purpose**: Measure JWT validation impact on performance
**Setup**: JWT plugin with RSA and ECDSA signature validation

**Test Procedure**:
```bash
# Generate test JWTs
./generate-test-jwts.sh --count 1000 --algorithm RS256 > rs256_tokens.txt
./generate-test-jwts.sh --count 1000 --algorithm ES256 > es256_tokens.txt

# No auth baseline
wrk -t 8 -c 200 -d 30s --latency \
  http://gateway:8000/api/echo > auth_baseline.txt

# RSA JWT validation
wrk -t 8 -c 200 -d 30s --latency \
  -H "Authorization: Bearer $(head -1 rs256_tokens.txt)" \
  http://gateway:8000/api/echo > auth_jwt_rsa.txt

# ECDSA JWT validation  
wrk -t 8 -c 200 -d 30s --latency \
  -H "Authorization: Bearer $(head -1 es256_tokens.txt)" \
  http://gateway:8000/api/echo > auth_jwt_ecdsa.txt
```

**Measurements**:
- Throughput overhead for each signature algorithm
- JWT validation latency (P50, P95, P99)
- CPU usage for cryptographic operations
- Memory usage for JWT parsing

**Expected Results**:
- RSA validation: 30-50% throughput reduction vs baseline
- ECDSA validation: 20-30% throughput reduction vs baseline
- JWT validation latency < 2ms P95

#### Test: `benchmark_api_key_validation`
**Purpose**: Compare API key vs JWT performance
**Setup**: API key plugin with in-memory key store

**Expected Results**:
- API key validation: 5-10% throughput overhead (much faster than JWT)
- API key lookup latency < 0.1ms

#### Test: `benchmark_authentication_cache_effectiveness`
**Purpose**: Measure auth caching performance benefit
**Setup**: JWT validation with token caching enabled/disabled

**Test Procedure**:
```bash
# Without caching (validate every request)
curl -X PUT http://gateway:8001/plugins/jwt/config \
  -d '{"cache_ttl": 0}'

wrk -t 8 -c 200 -d 30s --latency \
  -H "Authorization: Bearer $JWT_TOKEN" \
  http://gateway:8000/api/echo > auth_no_cache.txt

# With caching (5 minute TTL)
curl -X PUT http://gateway:8001/plugins/jwt/config \
  -d '{"cache_ttl": 300}'

wrk -t 8 -c 200 -d 30s --latency \
  -H "Authorization: Bearer $JWT_TOKEN" \
  http://gateway:8000/api/echo > auth_cached.txt
```

**Success Criteria**:
- Cached validation > 5x faster than uncached
- Cache hit ratio > 95% for repeated tokens
- Memory overhead for cache < 100MB for 100K tokens

### 3. Rate Limiting Benchmarks

#### Test: `benchmark_rate_limiter_accuracy`
**Purpose**: Validate rate limiter precision and performance impact
**Setup**: Rate limit 1000 requests/minute per consumer

**Test Procedure**:
```bash
# Test rate limit accuracy
./rate-limit-accuracy-test.sh \
  --limit 1000 \
  --window 60s \
  --burst-size 100 \
  --test-duration 300s > rate_limit_accuracy.txt

# Performance impact measurement
wrk -t 4 -c 100 -d 30s --latency \
  http://gateway:8000/api/echo > rate_limit_disabled.txt

# Enable rate limiting  
curl -X POST http://gateway:8001/plugins -d '{"name": "rate-limiting", "config": {"minute": 10000}}'

wrk -t 4 -c 100 -d 30s --latency \
  -H "X-Consumer-ID: test-consumer" \
  http://gateway:8000/api/echo > rate_limit_enabled.txt
```

**Measurements**:
- Rate limit accuracy (should allow exactly 1000 reqs/min ± 5%)
- Latency overhead for rate limit checks
- Memory usage for rate limit counters
- Performance degradation vs baseline

**Success Criteria**:
- Rate limit accuracy within 2% of configured limit
- Rate limiter overhead < 1ms P95
- Memory usage < 1KB per tracked consumer

#### Test: `benchmark_rate_limiter_algorithms`
**Purpose**: Compare performance of rate limiting algorithms
**Algorithms**: Fixed window, sliding window, token bucket

**Test Matrix**:
| Algorithm | Memory/Consumer | CPU Overhead | Accuracy |
|-----------|----------------|--------------|----------|
| Fixed Window | ~64 bytes | Lowest | Good |
| Sliding Window | ~1KB | Medium | Better |
| Token Bucket | ~128 bytes | Low | Best |

#### Test: `benchmark_distributed_rate_limiting`
**Purpose**: Measure performance of distributed rate limiting
**Setup**: Multiple gateway nodes sharing Redis for rate limit state

**Expected Results**:
- Distributed rate limiting: 5-15ms additional latency (Redis RTT)
- Accuracy maintained across nodes
- Linear scaling with gateway node count

### 4. Plugin Chain Performance

#### Test: `benchmark_plugin_chain_latency`
**Purpose**: Measure cumulative latency of plugin chain
**Setup**: Progressive plugin enablement

**Test Procedure**:
```bash
# Baseline (no plugins)
wrk -t 8 -c 200 -d 30s --latency \
  http://gateway:8000/api/echo > plugin_chain_0.txt

# Add authentication
curl -X POST http://gateway:8001/plugins -d '{"name": "key-auth"}'
wrk -t 8 -c 200 -d 30s --latency \
  -H "apikey: test-key" \
  http://gateway:8000/api/echo > plugin_chain_1.txt

# Add rate limiting
curl -X POST http://gateway:8001/plugins -d '{"name": "rate-limiting"}'
wrk -t 8 -c 200 -d 30s --latency \
  -H "apikey: test-key" \
  http://gateway:8000/api/echo > plugin_chain_2.txt

# Add request transformer
curl -X POST http://gateway:8001/plugins -d '{"name": "request-transformer"}'
wrk -t 8 -c 200 -d 30s --latency \
  -H "apikey: test-key" \
  http://gateway:8000/api/echo > plugin_chain_3.txt
```

**Measurements**:
- Latency increase per plugin
- Cumulative overhead
- Plugin execution time distribution
- Memory usage growth

**Success Criteria**:
- Each plugin adds < 1ms P95 latency
- Total chain latency < 5ms P95
- Linear latency growth with plugin count

#### Test: `benchmark_plugin_error_handling_overhead`
**Purpose**: Measure performance impact of plugin error handling
**Setup**: Plugin that occasionally fails with circuit breaker

**Expected Results**:
- Error path should be faster than success path
- Circuit breaker adds < 0.1ms overhead when closed

### 5. Load Balancing Performance

#### Test: `benchmark_load_balancing_algorithms`
**Purpose**: Compare performance of load balancing strategies
**Setup**: 5 upstream targets, different algorithms

**Test Procedure**:
```bash
algorithms=("round-robin" "least-connections" "ip-hash" "weighted-round-robin")

for algo in "${algorithms[@]}"; do
  # Configure load balancer
  curl -X PUT http://gateway:8001/upstreams/test/config \
    -d "{\"algorithm\": \"$algo\"}"
  
  wrk -t 8 -c 200 -d 30s --latency \
    http://gateway:8000/api/echo > lb_${algo}.txt
done
```

**Expected Results**:
- Round-robin: Fastest (O(1) selection)
- Least-connections: ~5% slower (O(n) selection)
- IP-hash: Similar to round-robin
- Weighted: ~2% slower than round-robin

#### Test: `benchmark_upstream_health_checking_overhead`
**Purpose**: Measure active health check performance impact
**Setup**: Health checks every 30 seconds vs disabled

**Expected Results**:
- Health check overhead: < 1% throughput impact
- Health check response time < 10ms
- Automatic failover within 60 seconds

### 6. Caching Performance

#### Test: `benchmark_response_cache_hit_ratio`
**Purpose**: Measure cache performance and hit ratios
**Setup**: Proxy cache with configurable TTL

**Test Procedure**:
```bash
# Configure cache with 5-minute TTL
curl -X POST http://gateway:8001/plugins \
  -d '{"name": "proxy-cache", "config": {"ttl": 300}}'

# Cache population phase (random URLs)
./populate-cache.sh --requests 10000 --unique-urls 1000

# Cache hit testing
for hit_ratio in 50 70 90 95; do
  ./cache-workload.sh \
    --cache-hit-ratio $hit_ratio \
    --duration 60s \
    --concurrency 200 > cache_${hit_ratio}pct.txt
done
```

**Measurements**:
- Cache hit vs miss latency
- Throughput improvement with caching
- Memory usage for cache storage
- Cache hit ratio accuracy

**Success Criteria**:
- Cache hit latency < 1ms P95
- Cache miss latency = upstream latency + cache overhead
- Cache hit throughput > 10x cache miss throughput
- Memory usage proportional to cached content size

#### Test: `benchmark_cache_invalidation_performance`
**Purpose**: Measure cache invalidation overhead
**Setup**: Cache with periodic invalidation

**Expected Results**:
- Cache invalidation: < 0.1ms per cache entry
- Invalidation doesn't impact request processing
- Memory freed promptly after invalidation

### 7. Routing Performance

#### Test: `benchmark_route_matching_scalability`
**Purpose**: Measure routing performance vs route table size
**Setup**: Route tables with 10, 100, 1000, 10000 routes

**Test Procedure**:
```bash
for route_count in 10 100 1000 10000; do
  # Generate route configuration
  ./generate-routes.sh --count $route_count --pattern-complexity medium
  
  # Test route matching performance
  wrk -t 8 -c 200 -d 30s --latency \
    -s random-routes.lua \
    http://gateway:8000/ > routes_${route_count}.txt
done
```

**Measurements**:
- Route matching latency vs table size
- Memory usage for route storage
- Route compilation time
- Performance degradation curve

**Success Criteria**:
- 100 routes: < 0.1ms route matching P95
- 1000 routes: < 0.5ms route matching P95
- 10000 routes: < 2ms route matching P95
- Memory usage linear with route count

#### Test: `benchmark_route_pattern_complexity`
**Purpose**: Compare simple vs complex route patterns
**Patterns**: Exact match, prefix, regex, path parameters

**Expected Performance Ranking**:
1. Exact match: Fastest (hash table lookup)
2. Prefix match: Fast (trie lookup)
3. Path parameters: Medium (pattern matching)
4. Regex: Slowest (regex engine)

### 8. Transformation Performance

#### Test: `benchmark_json_transformation_overhead`
**Purpose**: Measure JSON request/response transformation impact
**Setup**: Request transformer adding fields, response transformer wrapping

**Test Procedure**:
```bash
# No transformation baseline
wrk -t 8 -c 200 -d 30s --latency \
  -H "Content-Type: application/json" \
  --body='{"user": "test"}' \
  http://gateway:8000/api/echo > transform_baseline.txt

# Request transformation only
curl -X POST http://gateway:8001/plugins \
  -d '{"name": "request-transformer", "config": {"add": {"headers": ["X-Source:gateway"], "json": ["timestamp"]}}}'

wrk -t 8 -c 200 -d 30s --latency \
  -H "Content-Type: application/json" \
  --body='{"user": "test"}' \
  http://gateway:8000/api/echo > transform_request.txt

# Response transformation
curl -X POST http://gateway:8001/plugins \
  -d '{"name": "response-transformer", "config": {"add": {"json": ["meta.processed_by:gateway"]}}}'

wrk -t 8 -c 200 -d 30s --latency \
  -H "Content-Type: application/json" \
  --body='{"user": "test"}' \
  http://gateway:8000/api/echo > transform_response.txt
```

**Measurements**:
- JSON parsing/serialization overhead
- Memory allocation for transformations
- CPU usage for JSON processing
- Latency impact per transformation

**Expected Results**:
- Simple transformations: < 0.5ms overhead
- Complex transformations: < 2ms overhead
- Memory usage proportional to JSON size

### 9. Error Handling Performance

#### Test: `benchmark_error_response_performance`
**Purpose**: Measure error handling vs success path performance
**Setup**: Mix of successful and error responses

**Test Procedure**:
```bash
# Success path baseline
wrk -t 8 -c 200 -d 30s --latency \
  http://gateway:8000/api/echo > error_success.txt

# Authentication failures (401)
wrk -t 8 -c 200 -d 30s --latency \
  http://gateway:8000/api/echo > error_401.txt

# Rate limit exceeded (429)  
./rate-limit-test.sh --exceed-limit \
  http://gateway:8000/api/echo > error_429.txt

# Upstream errors (502)
./upstream-failure-test.sh \
  http://gateway:8000/api/echo > error_502.txt
```

**Expected Results**:
- Error responses should be faster than success (no upstream call)
- Authentication errors: < 1ms P95
- Rate limit errors: < 0.5ms P95
- Upstream errors: Timeout-dependent

### 10. Concurrency and Connection Management

#### Test: `benchmark_concurrent_connection_scaling`
**Purpose**: Measure performance vs concurrent connection count
**Setup**: Fixed request rate, increasing connection count

**Test Procedure**:
```bash
for connections in 100 500 1000 2500 5000 10000; do
  # Fixed total rate across varying connections
  total_rate=20000
  rate_per_connection=$((total_rate / connections))
  
  wrk -t 16 -c $connections -d 60s --latency \
    -R $total_rate \
    http://gateway:8000/api/echo > connections_${connections}.txt
done
```

**Measurements**:
- Latency vs connection count
- Memory usage per connection
- File descriptor usage
- Connection setup/teardown overhead

**Success Criteria**:
- Support 10,000+ concurrent connections
- Memory usage < 8KB per idle connection
- Latency growth < 2x from 100 to 10,000 connections

### 11. Memory and Resource Usage

#### Test: `benchmark_memory_usage_under_load`
**Purpose**: Monitor memory usage patterns under sustained load
**Setup**: Sustained load test with memory profiling

**Test Procedure**:
```bash
# Start memory monitoring
./memory-profiler.sh --interval 10s --duration 3600s > memory_profile.txt &

# Sustained load for 1 hour
wrk -t 8 -c 400 -d 3600s --latency \
  -H "apikey: test-key" \
  http://gateway:8000/api/echo > sustained_load.txt

# Stop memory monitoring
pkill memory-profiler
```

**Measurements**:
- Memory usage over time (should stabilize)
- Memory leaks (continuous growth)
- Garbage collection patterns (if applicable)
- Memory usage by component

**Success Criteria**:
- Memory usage stabilizes within 10 minutes
- No memory leaks (< 1% growth per hour)
- Predictable memory patterns

## Performance Analysis and Reporting

### Metrics Collection
```
# Core Performance
requests_per_second
response_time_p50, p95, p99
error_rate_percentage
throughput_mbps

# Gateway Specific  
plugin_execution_time_ms
route_matching_time_ms
auth_validation_time_ms
cache_hit_ratio
rate_limit_accuracy_pct
transformation_overhead_ms

# System Resources
cpu_utilization_percent
memory_usage_mb
memory_per_connection_kb
file_descriptors_used
network_connections_active

# Plugin Chain Metrics
plugins_per_request
plugin_error_rate
circuit_breaker_trips
load_balancer_distribution
```

### Reporting Format
```markdown
# API Gateway Benchmark Results

## Test Configuration
- **Date**: 2026-02-13
- **Duration**: 60 seconds  
- **Hardware**: 8 cores, 32GB RAM
- **Feature Set**: Full plugin chain

## Results Summary
| Test | Target | Actual | Status |
|------|--------|--------|--------|
| Proxy throughput | 25,000 RPS | 38,500 RPS | ✅ PASS |
| Auth + Rate limit | 15,000 RPS | 22,100 RPS | ✅ PASS |
| P99 latency | < 50ms | 28ms | ✅ PASS |
| Plugin chain overhead | < 4ms | 2.8ms | ✅ PASS |
| Cache hit ratio | > 90% | 94.2% | ✅ PASS |

## Performance Analysis
- Route matching: 0.08ms avg for 1000 routes
- JWT validation: 1.2ms avg
- Rate limiting: 0.3ms avg  
- Cache hit response: 0.4ms avg
```

This comprehensive benchmark specification ensures API gateway implementations meet performance requirements across all critical paths including authentication, rate limiting, caching, routing, and plugin execution with realistic enterprise workload patterns.