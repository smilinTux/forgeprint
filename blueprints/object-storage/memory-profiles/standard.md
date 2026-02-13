# Standard Memory Profile for Object Storage Systems

## Overview
This document provides comprehensive memory management guidelines for S3-compatible object storage implementations. Efficient memory usage is critical for handling high-throughput object operations, large-scale metadata management, and erasure coding operations while maintaining predictable performance.

## Memory Architecture Principles

### 1. Memory Hierarchy Strategy
**Hot Path Optimization**: Prioritize memory allocation for request-critical operations
- **Request processing**: Fast path for GET/PUT operations
- **Metadata caching**: Keep frequently accessed bucket/object metadata in memory
- **Buffer pools**: Pre-allocated buffers for I/O operations
- **Cold storage**: Lifecycle, replication, healing operations use lower-priority memory

### 2. Zero-Copy Data Paths
**Streaming Operations**: Minimize memory copies in the data path
```rust
// Streaming upload: Client → Erasure Encoder → Disk (no full object buffering)
struct StreamingUpload {
    shard_writers: Vec<ShardWriter>,    // Direct to disk writers
    erasure_encoder: StreamingEncoder,   // Encode on-the-fly
    buffer_size: usize,                 // Small stripe buffers only
}
```

**Memory Mapping**: Use memory-mapped I/O for large sequential reads
```rust
// Memory-mapped shard reading for large objects
struct MemoryMappedShard {
    mmap: memmap::Mmap,
    offset: u64,
    length: u64,
}
```

### 3. Predictable Memory Usage
**Bounded Growth**: All memory pools have configurable upper bounds
- Request processing: O(1) memory per request (bounded buffers)
- Metadata caching: LRU with size limits
- Erasure coding: Bounded by stripe size × concurrent operations

## Buffer Pool Management

### 1. Multi-Tier Buffer Architecture
```rust
struct BufferPoolManager {
    // Different buffer sizes for different use cases
    small_buffers: BufferPool,      // 4KB - headers, small objects
    medium_buffers: BufferPool,     // 64KB - stripe units
    large_buffers: BufferPool,      // 1MB - large I/O operations
    huge_buffers: BufferPool,       // 16MB - multipart upload parts
    
    // Specialized buffers
    erasure_encode_buffers: BufferPool,  // For EC operations
    metadata_buffers: BufferPool,        // For metadata serialization
    
    // Memory accounting
    total_allocated: AtomicUsize,
    allocation_limit: usize,
    pressure_threshold: usize,      // Start applying backpressure
}

// Buffer size classes optimized for object storage workloads
const BUFFER_SIZES: &[usize] = &[
    4   * 1024,     // 4KB:  HTTP headers, small objects, metadata
    64  * 1024,     // 64KB: Erasure coding stripe units
    256 * 1024,     // 256KB: Large I/O operations
    1   * 1024 * 1024,  // 1MB: Multipart upload chunks
    16  * 1024 * 1024,  // 16MB: Large multipart parts
];
```

### 2. Buffer Pool Implementation
```rust
struct BufferPool {
    free_buffers: crossbeam::queue::SegQueue<Buffer>,
    buffer_size: usize,
    initial_count: usize,
    max_count: usize,
    current_count: AtomicUsize,
    
    // Allocation statistics
    allocations: AtomicU64,
    deallocations: AtomicU64,
    peak_usage: AtomicUsize,
    cache_hits: AtomicU64,
    cache_misses: AtomicU64,
}

impl BufferPool {
    fn get_buffer(&self) -> Option<Buffer> {
        if let Some(buffer) = self.free_buffers.pop() {
            self.cache_hits.fetch_add(1, Ordering::Relaxed);
            Some(buffer)
        } else {
            self.cache_misses.fetch_add(1, Ordering::Relaxed);
            // Try to allocate new buffer if under limit
            let current = self.current_count.load(Ordering::Acquire);
            if current < self.max_count {
                if self.current_count.compare_exchange_weak(
                    current, 
                    current + 1, 
                    Ordering::AcqRel, 
                    Ordering::Relaxed
                ).is_ok() {
                    self.allocations.fetch_add(1, Ordering::Relaxed);
                    Some(Buffer::new(self.buffer_size))
                } else {
                    None
                }
            } else {
                None
            }
        }
    }
    
    fn return_buffer(&self, mut buffer: Buffer) {
        // Clear buffer contents for security (overwrite with zeros)
        buffer.clear();
        
        // Return to pool if not at max capacity
        if self.free_buffers.len() < self.initial_count * 2 {
            self.free_buffers.push(buffer);
        } else {
            // Let buffer be deallocated
            self.current_count.fetch_sub(1, Ordering::AcqRel);
            self.deallocations.fetch_add(1, Ordering::Relaxed);
        }
    }
}
```

### 3. Adaptive Pool Sizing
```rust
struct AdaptivePoolManager {
    pools: Vec<BufferPool>,
    usage_monitor: UsageMonitor,
    resize_interval: Duration,
}

impl AdaptivePoolManager {
    fn monitor_and_resize(&self) {
        let stats = self.usage_monitor.get_stats();
        
        for (i, pool) in self.pools.iter().enumerate() {
            let usage = stats.pool_usage[i];
            
            // If usage consistently high (>80%), grow pool
            if usage.average_utilization > 0.8 && usage.miss_rate > 0.1 {
                pool.grow(pool.max_count * 110 / 100); // Grow by 10%
            }
            
            // If usage consistently low (<30%), shrink pool
            else if usage.average_utilization < 0.3 && usage.hit_rate > 0.95 {
                pool.shrink(pool.max_count * 90 / 100); // Shrink by 10%
            }
        }
    }
}
```

## Erasure Coding Memory Management

### 1. EC Operation Memory Requirements
```rust
struct ErasureMemoryProfile {
    data_shards: usize,      // k (typically 4-8)
    parity_shards: usize,    // m (typically 2-4)
    shard_size: usize,       // Stripe unit (64KB - 1MB)
    
    // Memory calculations
    input_buffer_size: usize,    // data_shards × shard_size
    output_buffer_size: usize,   // (data_shards + parity_shards) × shard_size
    working_memory: usize,       // Reed-Solomon computation scratch space
    total_per_operation: usize,  // Sum of above
}

impl ErasureMemoryProfile {
    fn calculate_memory_requirements(&mut self) {
        self.input_buffer_size = self.data_shards * self.shard_size;
        self.output_buffer_size = (self.data_shards + self.parity_shards) * self.shard_size;
        
        // Reed-Solomon working memory (matrix operations)
        self.working_memory = self.parity_shards * self.data_shards * 2; // 2 bytes per element
        
        self.total_per_operation = self.input_buffer_size + self.output_buffer_size + self.working_memory;
    }
    
    fn max_concurrent_operations(&self, available_memory: usize) -> usize {
        // Leave 50% headroom for other operations
        let ec_memory_budget = available_memory / 2;
        ec_memory_budget / self.total_per_operation
    }
}

// Example memory requirements for different EC schemes:
// EC:4+2, 64KB shards: 4×64KB + 6×64KB + ~48 bytes = 640KB per operation
// EC:8+4, 1MB shards:  8×1MB + 12×1MB + ~96 bytes = 20MB per operation
```

### 2. Erasure Coding Buffer Management
```rust
struct ECBufferManager {
    encoder_pools: Vec<ECEncoderPool>,   // One pool per EC configuration
    decoder_pools: Vec<ECDecoderPool>,
    working_memory_pool: BufferPool,     // For matrix operations
    
    // Concurrent operation limiting
    max_encode_ops: Semaphore,
    max_decode_ops: Semaphore,
    encode_queue_depth: AtomicUsize,
    decode_queue_depth: AtomicUsize,
}

struct ECEncoderPool {
    shard_buffers: Vec<BufferPool>,      // One per shard index
    encoder_contexts: Vec<ReedSolomonEncoder>, // Pre-allocated encoders
    free_contexts: crossbeam::queue::SegQueue<ReedSolomonEncoder>,
}

impl ECBufferManager {
    async fn encode_object(&self, data: &[u8], ec_config: ECConfig) -> Result<Vec<Vec<u8>>, ECError> {
        // Acquire encoding semaphore to limit concurrent operations
        let _permit = self.max_encode_ops.acquire().await;
        
        // Get pre-allocated buffers
        let encoder_pool = &self.encoder_pools[ec_config.scheme_index];
        let encoder = encoder_pool.get_encoder().await?;
        
        // Get shard buffers
        let mut shard_buffers = Vec::with_capacity(ec_config.total_shards());
        for i in 0..ec_config.total_shards() {
            let buffer = encoder_pool.shard_buffers[i].get_buffer()
                .ok_or(ECError::OutOfMemory)?;
            shard_buffers.push(buffer);
        }
        
        // Perform encoding (this is the CPU-intensive part)
        let result = encoder.encode_with_buffers(data, &mut shard_buffers);
        
        // Return encoder to pool
        encoder_pool.return_encoder(encoder);
        
        // Return buffers to pools (except for result data)
        for (i, buffer) in shard_buffers.into_iter().enumerate() {
            if let Ok(ref shards) = result {
                // Transfer ownership of result data
                if i < shards.len() {
                    continue; // Don't return buffers containing result data
                }
            }
            encoder_pool.shard_buffers[i].return_buffer(buffer);
        }
        
        result
    }
}
```

### 3. Streaming Erasure Coding
```rust
// Minimize memory usage by encoding/decoding in stripes
struct StreamingErasureCoder {
    config: ECConfig,
    stripe_size: usize,        // Size of each stripe (e.g., 64KB × data_shards)
    buffer_pool: BufferPool,   // Stripe-sized buffers
    
    // Input/output queues for pipeline processing
    input_queue: async_channel::Receiver<StripeData>,
    output_queue: async_channel::Sender<EncodedStripe>,
}

struct StripeData {
    stripe_index: u64,
    data: Vec<u8>,           // One stripe worth of data
    is_final: bool,          // Last stripe may be partial
}

struct EncodedStripe {
    stripe_index: u64,
    shards: Vec<Vec<u8>>,    // Data + parity shards
}

impl StreamingErasureCoder {
    async fn encode_stream(&self, input: impl AsyncRead) -> impl Stream<Item = EncodedStripe> {
        let mut stripe_reader = StripeReader::new(input, self.stripe_size);
        let mut stripe_index = 0;
        
        async_stream::stream! {
            while let Some(stripe_data) = stripe_reader.read_stripe().await {
                // Get buffer for this encoding operation
                let buffer = self.buffer_pool.get_buffer()
                    .ok_or(ECError::OutOfMemory)?;
                
                // Encode stripe
                let encoded = self.encode_stripe(stripe_data, buffer).await?;
                yield encoded;
                
                stripe_index += 1;
            }
        }
    }
    
    async fn encode_stripe(&self, data: StripeData, buffer: Buffer) -> Result<EncodedStripe, ECError> {
        // Use buffer for in-place encoding to minimize allocations
        let shards = self.reed_solomon_encode(&data.data, buffer)?;
        
        Ok(EncodedStripe {
            stripe_index: data.stripe_index,
            shards,
        })
    }
}
```

## Metadata Caching Strategy

### 1. Multi-Level Metadata Cache
```rust
struct MetadataCache {
    // Hot cache: Most frequently accessed metadata in memory
    hot_cache: Arc<Mutex<LruCache<MetadataKey, ObjectMetadata>>>,
    
    // Warm cache: Recently accessed, may be in local storage
    warm_cache: Arc<AsyncMutex<LruCache<MetadataKey, CachedMetadata>>>,
    
    // Cold lookup: Distributed metadata store
    metadata_store: Arc<dyn MetadataStore>,
    
    // Cache configuration
    hot_cache_size: usize,      // Number of entries
    warm_cache_size: usize,     // Number of entries
    hot_cache_memory: usize,    // Memory limit in bytes
    
    // Cache statistics
    stats: CacheStats,
}

#[derive(Clone)]
struct CachedMetadata {
    metadata: ObjectMetadata,
    cached_at: Instant,
    access_count: u32,
    ttl: Duration,
}

#[derive(Debug, PartialEq, Eq, Hash)]
struct MetadataKey {
    bucket: String,
    key: String,
    version_id: Option<String>,
}

impl MetadataCache {
    async fn get(&self, key: &MetadataKey) -> Result<ObjectMetadata, MetadataError> {
        // 1. Check hot cache first (fastest)
        {
            let mut hot = self.hot_cache.lock().await;
            if let Some(metadata) = hot.get(key) {
                self.stats.hot_cache_hits.fetch_add(1, Ordering::Relaxed);
                return Ok(metadata.clone());
            }
        }
        
        // 2. Check warm cache
        {
            let mut warm = self.warm_cache.lock().await;
            if let Some(cached) = warm.get_mut(key) {
                // Check TTL
                if cached.cached_at.elapsed() < cached.ttl {
                    cached.access_count += 1;
                    
                    // Promote to hot cache if frequently accessed
                    if cached.access_count > HOT_CACHE_PROMOTION_THRESHOLD {
                        let mut hot = self.hot_cache.lock().await;
                        hot.put(key.clone(), cached.metadata.clone());
                    }
                    
                    self.stats.warm_cache_hits.fetch_add(1, Ordering::Relaxed);
                    return Ok(cached.metadata.clone());
                } else {
                    // Expired, remove from warm cache
                    warm.pop(key);
                }
            }
        }
        
        // 3. Load from distributed store (slowest)
        self.stats.cache_misses.fetch_add(1, Ordering::Relaxed);
        let metadata = self.metadata_store.get_metadata(key).await?;
        
        // 4. Cache the result in warm cache
        let cached = CachedMetadata {
            metadata: metadata.clone(),
            cached_at: Instant::now(),
            access_count: 1,
            ttl: Duration::from_secs(300), // 5 minutes default TTL
        };
        
        let mut warm = self.warm_cache.lock().await;
        warm.put(key.clone(), cached);
        
        Ok(metadata)
    }
    
    async fn put(&self, key: MetadataKey, metadata: ObjectMetadata) -> Result<(), MetadataError> {
        // 1. Write to distributed store first
        self.metadata_store.put_metadata(&key, &metadata).await?;
        
        // 2. Update caches
        {
            let mut hot = self.hot_cache.lock().await;
            hot.put(key.clone(), metadata.clone());
        }
        
        {
            let mut warm = self.warm_cache.lock().await;
            let cached = CachedMetadata {
                metadata,
                cached_at: Instant::now(),
                access_count: 1,
                ttl: Duration::from_secs(300),
            };
            warm.put(key, cached);
        }
        
        Ok(())
    }
    
    fn memory_usage(&self) -> usize {
        // Estimate memory usage of cached metadata
        let hot_entries = self.hot_cache.lock().unwrap().len();
        let warm_entries = self.warm_cache.lock().unwrap().len();
        
        // Rough estimate: 1KB per metadata entry
        (hot_entries + warm_entries) * 1024
    }
}
```

### 2. Bucket Configuration Cache
```rust
// Bucket configurations are read frequently but change rarely
struct BucketConfigCache {
    cache: Arc<RwLock<HashMap<String, CachedBucketConfig>>>,
    config_store: Arc<dyn BucketConfigStore>,
    refresh_interval: Duration,
    background_refresh: bool,
}

#[derive(Clone)]
struct CachedBucketConfig {
    config: BucketConfig,
    cached_at: Instant,
    etag: String,           // For conditional updates
}

impl BucketConfigCache {
    async fn get_config(&self, bucket: &str) -> Result<BucketConfig, ConfigError> {
        // Fast path: read lock for cache lookup
        {
            let cache = self.cache.read().unwrap();
            if let Some(cached) = cache.get(bucket) {
                if cached.cached_at.elapsed() < self.refresh_interval {
                    return Ok(cached.config.clone());
                }
            }
        }
        
        // Slow path: refresh from store
        self.refresh_bucket_config(bucket).await
    }
    
    async fn refresh_bucket_config(&self, bucket: &str) -> Result<BucketConfig, ConfigError> {
        // Check if we have an etag for conditional refresh
        let current_etag = {
            let cache = self.cache.read().unwrap();
            cache.get(bucket).map(|c| c.etag.clone())
        };
        
        let config = self.config_store.get_config(bucket, current_etag.as_deref()).await?;
        
        // Update cache with write lock
        {
            let mut cache = self.cache.write().unwrap();
            cache.insert(bucket.to_string(), CachedBucketConfig {
                config: config.clone(),
                cached_at: Instant::now(),
                etag: config.etag.clone(),
            });
        }
        
        Ok(config)
    }
}
```

## Connection Pool Management

### 1. HTTP Connection Pooling
```rust
// Manage connection pools for internode communication and external services
struct ConnectionPoolManager {
    // Pools for different types of connections
    internode_pool: HttpConnectionPool,        // Node-to-node API calls
    kms_pool: HttpConnectionPool,              // External KMS connections
    notification_pools: HashMap<String, HttpConnectionPool>, // Per-target notification pools
    
    // Configuration
    pool_config: ConnectionPoolConfig,
}

struct HttpConnectionPool {
    idle_connections: crossbeam::queue::SegQueue<PooledConnection>,
    active_connections: AtomicUsize,
    max_connections: usize,
    max_idle_connections: usize,
    connection_timeout: Duration,
    idle_timeout: Duration,
    
    // Connection statistics
    total_connections_created: AtomicU64,
    total_connections_closed: AtomicU64,
    active_requests: AtomicUsize,
}

struct PooledConnection {
    connection: hyper::client::conn::Connection,
    last_used: Instant,
    requests_handled: u32,
    connection_id: u64,
}

impl HttpConnectionPool {
    async fn get_connection(&self) -> Result<PooledConnection, PoolError> {
        // Try to get idle connection first
        while let Some(mut conn) = self.idle_connections.pop() {
            if conn.last_used.elapsed() < self.idle_timeout {
                conn.last_used = Instant::now();
                return Ok(conn);
            } else {
                // Connection too old, close it
                self.close_connection(conn);
            }
        }
        
        // No idle connections available, create new if under limit
        let current_active = self.active_connections.load(Ordering::Acquire);
        if current_active < self.max_connections {
            self.create_new_connection().await
        } else {
            Err(PoolError::PoolExhausted)
        }
    }
    
    fn return_connection(&self, connection: PooledConnection) {
        // Check if connection is still healthy and pool has space
        if connection.requests_handled < MAX_REQUESTS_PER_CONNECTION && 
           self.idle_connections.len() < self.max_idle_connections {
            self.idle_connections.push(connection);
        } else {
            self.close_connection(connection);
        }
    }
    
    async fn cleanup_idle_connections(&self) {
        let mut connections_to_close = Vec::new();
        
        // Check all idle connections for timeout
        while let Some(conn) = self.idle_connections.pop() {
            if conn.last_used.elapsed() > self.idle_timeout {
                connections_to_close.push(conn);
            } else {
                // Return still-fresh connection to pool
                self.idle_connections.push(conn);
                break; // All remaining connections are fresh
            }
        }
        
        // Close expired connections
        for conn in connections_to_close {
            self.close_connection(conn);
        }
    }
}
```

### 2. Backend Storage Connection Management
```rust
// Manage connections to storage backend (local disks, remote storage nodes)
struct StorageConnectionManager {
    // Per-node connection pools for distributed deployments
    node_pools: HashMap<NodeId, StorageNodePool>,
    
    // Local disk I/O management
    disk_io_pools: HashMap<DiskId, DiskIOPool>,
    
    // Configuration
    max_concurrent_ios_per_disk: usize,
    io_timeout: Duration,
}

struct StorageNodePool {
    node_id: NodeId,
    endpoint: String,
    connections: HttpConnectionPool,
    
    // Storage-specific metrics
    read_latency: Histogram,
    write_latency: Histogram,
    error_rate: AtomicU64,
}

struct DiskIOPool {
    disk_path: String,
    concurrent_ios: Semaphore,           // Limit concurrent I/O operations
    pending_ios: AtomicUsize,
    completed_ios: AtomicU64,
    
    // I/O scheduling
    read_queue: async_channel::Receiver<IORequest>,
    write_queue: async_channel::Receiver<IORequest>,
    priority_queue: async_channel::Receiver<IORequest>, // For healing, metadata ops
}

impl StorageConnectionManager {
    async fn write_shard(&self, 
                        node_id: &NodeId, 
                        disk_id: &DiskId,
                        shard_path: &str,
                        data: &[u8]) -> Result<(), StorageError> {
        
        if let Some(pool) = self.node_pools.get(node_id) {
            // Remote write via HTTP
            let connection = pool.connections.get_connection().await?;
            let result = self.send_write_request(connection, shard_path, data).await;
            pool.connections.return_connection(connection);
            result
        } else if let Some(disk_pool) = self.disk_io_pools.get(disk_id) {
            // Local disk write
            let _permit = disk_pool.concurrent_ios.acquire().await;
            let result = self.write_local_shard(disk_id, shard_path, data).await;
            result
        } else {
            Err(StorageError::NodeNotFound(*node_id))
        }
    }
}
```

## Memory Pressure and Backpressure

### 1. Memory Pressure Detection
```rust
struct MemoryPressureMonitor {
    total_memory_limit: usize,
    current_usage: AtomicUsize,
    
    // Pressure thresholds
    normal_threshold: usize,      // < 70% = normal
    warning_threshold: usize,     // 70-85% = warning
    critical_threshold: usize,    // 85-95% = critical
    emergency_threshold: usize,   // > 95% = emergency
    
    // Pressure state
    current_pressure: AtomicU8,   // 0=normal, 1=warning, 2=critical, 3=emergency
    pressure_callbacks: Vec<Box<dyn PressureCallback>>,
}

#[derive(Debug, PartialEq)]
enum MemoryPressure {
    Normal,
    Warning,
    Critical,
    Emergency,
}

trait PressureCallback: Send + Sync {
    fn on_pressure_change(&self, old_pressure: MemoryPressure, new_pressure: MemoryPressure);
}

impl MemoryPressureMonitor {
    fn check_pressure(&self) -> MemoryPressure {
        let usage = self.current_usage.load(Ordering::Acquire);
        let percentage = (usage * 100) / self.total_memory_limit;
        
        match percentage {
            0..=69 => MemoryPressure::Normal,
            70..=84 => MemoryPressure::Warning,
            85..=94 => MemoryPressure::Critical,
            _ => MemoryPressure::Emergency,
        }
    }
    
    fn update_pressure(&self) {
        let new_pressure = self.check_pressure();
        let old_pressure_val = self.current_pressure.load(Ordering::Acquire);
        let old_pressure = match old_pressure_val {
            0 => MemoryPressure::Normal,
            1 => MemoryPressure::Warning,
            2 => MemoryPressure::Critical,
            _ => MemoryPressure::Emergency,
        };
        
        if new_pressure != old_pressure {
            let new_val = match new_pressure {
                MemoryPressure::Normal => 0,
                MemoryPressure::Warning => 1,
                MemoryPressure::Critical => 2,
                MemoryPressure::Emergency => 3,
            };
            
            self.current_pressure.store(new_val, Ordering::Release);
            
            // Notify callbacks
            for callback in &self.pressure_callbacks {
                callback.on_pressure_change(old_pressure, new_pressure);
            }
        }
    }
}
```

### 2. Backpressure Application
```rust
struct BackpressureManager {
    pressure_monitor: Arc<MemoryPressureMonitor>,
    request_limiters: HashMap<RequestType, RateLimiter>,
    
    // Backpressure configuration
    normal_limits: RequestLimits,
    warning_limits: RequestLimits,
    critical_limits: RequestLimits,
    emergency_limits: RequestLimits,
}

#[derive(Clone)]
struct RequestLimits {
    max_put_requests: u32,
    max_get_requests: u32,
    max_multipart_uploads: u32,
    max_erasure_operations: u32,
    buffer_allocation_rate: u32,  // Buffers per second
}

impl PressureCallback for BackpressureManager {
    fn on_pressure_change(&self, _old: MemoryPressure, new: MemoryPressure) {
        let limits = match new {
            MemoryPressure::Normal => &self.normal_limits,
            MemoryPressure::Warning => &self.warning_limits,
            MemoryPressure::Critical => &self.critical_limits,
            MemoryPressure::Emergency => &self.emergency_limits,
        };
        
        // Update rate limiters
        self.request_limiters.get_mut(&RequestType::PutObject)
            .unwrap().set_rate(limits.max_put_requests);
        
        self.request_limiters.get_mut(&RequestType::GetObject)
            .unwrap().set_rate(limits.max_get_requests);
            
        // More aggressive limiting for memory-intensive operations
        self.request_limiters.get_mut(&RequestType::MultipartUpload)
            .unwrap().set_rate(limits.max_multipart_uploads);
            
        self.request_limiters.get_mut(&RequestType::ErasureOperation)
            .unwrap().set_rate(limits.max_erasure_operations);
    }
}

// Request admission control
impl BackpressureManager {
    async fn admit_request(&self, request_type: RequestType) -> Result<RequestPermit, BackpressureError> {
        let limiter = self.request_limiters.get(&request_type)
            .ok_or(BackpressureError::UnknownRequestType)?;
        
        match self.pressure_monitor.check_pressure() {
            MemoryPressure::Emergency => {
                // Only allow reads in emergency
                if matches!(request_type, RequestType::GetObject | RequestType::HeadObject) {
                    limiter.acquire().await
                } else {
                    Err(BackpressureError::SystemOverloaded)
                }
            },
            _ => {
                limiter.acquire().await
            }
        }
    }
}
```

## Memory Configuration Guidelines

### 1. Sizing Recommendations by Deployment Size

#### Small Deployment (< 100GB storage, < 1000 requests/second)
```yaml
memory_profile: small
total_memory: "4GB"
allocations:
  buffer_pools: "1GB"         # 25%
  metadata_cache: "1GB"       # 25%
  erasure_coding: "512MB"     # 12.5%
  connection_pools: "256MB"   # 6.25%
  system_reserve: "1.25GB"    # 31.25%

buffer_pool_config:
  small_buffers:     # 4KB
    initial: 1000
    max: 5000
  medium_buffers:    # 64KB
    initial: 200
    max: 1000
  large_buffers:     # 1MB
    initial: 50
    max: 200

erasure_coding_config:
  max_concurrent_encode: 4
  max_concurrent_decode: 8
  stripe_size: "64KB"
```

#### Medium Deployment (1TB - 100TB storage, < 10,000 requests/second)
```yaml
memory_profile: medium
total_memory: "32GB"
allocations:
  buffer_pools: "8GB"         # 25%
  metadata_cache: "8GB"       # 25%
  erasure_coding: "4GB"       # 12.5%
  connection_pools: "2GB"     # 6.25%
  system_reserve: "10GB"      # 31.25%

buffer_pool_config:
  small_buffers:     # 4KB
    initial: 10000
    max: 50000
  medium_buffers:    # 64KB
    initial: 2000
    max: 10000
  large_buffers:     # 1MB
    initial: 500
    max: 2000
  huge_buffers:      # 16MB
    initial: 50
    max: 200

erasure_coding_config:
  max_concurrent_encode: 16
  max_concurrent_decode: 32
  stripe_size: "256KB"
```

#### Large Deployment (100TB+ storage, > 10,000 requests/second)
```yaml
memory_profile: large
total_memory: "128GB"
allocations:
  buffer_pools: "32GB"        # 25%
  metadata_cache: "32GB"      # 25%
  erasure_coding: "16GB"      # 12.5%
  connection_pools: "8GB"     # 6.25%
  system_reserve: "40GB"      # 31.25%

buffer_pool_config:
  small_buffers:     # 4KB
    initial: 50000
    max: 200000
  medium_buffers:    # 64KB
    initial: 10000
    max: 50000
  large_buffers:     # 1MB
    initial: 2000
    max: 10000
  huge_buffers:      # 16MB
    initial: 200
    max: 1000

erasure_coding_config:
  max_concurrent_encode: 64
  max_concurrent_decode: 128
  stripe_size: "1MB"
```

### 2. Tuning Parameters

#### Memory Pressure Thresholds
```yaml
pressure_thresholds:
  normal: 70        # < 70% memory usage
  warning: 85       # 70-85% usage - start gentle backpressure
  critical: 95      # 85-95% usage - aggressive backpressure
  emergency: 95     # > 95% usage - reject non-essential requests

backpressure_config:
  normal_limits:
    put_requests_per_second: 1000
    get_requests_per_second: 5000
    multipart_uploads: 100
    erasure_operations: 50
  
  warning_limits:
    put_requests_per_second: 800
    get_requests_per_second: 4000
    multipart_uploads: 75
    erasure_operations: 30
  
  critical_limits:
    put_requests_per_second: 500
    get_requests_per_second: 3000
    multipart_uploads: 50
    erasure_operations: 20
  
  emergency_limits:
    put_requests_per_second: 0      # Block all writes
    get_requests_per_second: 1000   # Minimal reads only
    multipart_uploads: 0
    erasure_operations: 5           # Only for healing
```

This comprehensive memory profile provides the foundation for implementing memory-efficient, scalable object storage systems that can handle production workloads while maintaining predictable performance under various load conditions.