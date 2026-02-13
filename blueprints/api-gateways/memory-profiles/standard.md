# Standard Memory Profile for API Gateways

## Overview
This document provides comprehensive memory management guidelines for API gateway implementations. Efficient memory usage is critical for handling thousands of concurrent API requests while maintaining low latency for authentication, rate limiting, caching, and request transformation operations.

## Memory Architecture Principles

### 1. Gateway Memory Layout
```
┌────────────────────────────────────────────────────────────────┐
│                     SHARED MEMORY                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Route Table │  │  Response    │  │  Rate Limiter│        │
│  │  (Radix Tree)│  │  Cache       │  │  Counters    │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Consumer    │  │  Plugin      │  │  Connection  │        │
│  │  Registry    │  │  Configs     │  │  Pool State  │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└────────────────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Connection 1 │  │ Connection 2 │  │ Connection N │
│  ┌─────────┐ │  │  ┌─────────┐ │  │  ┌─────────┐ │
│  │Request  │ │  │  │Request  │ │  │  │Request  │ │
│  │Context  │ │  │  │Context  │ │  │  │Context  │ │
│  ├─────────┤ │  │  ├─────────┤ │  │  ├─────────┤ │
│  │Plugin   │ │  │  │Plugin   │ │  │  │Plugin   │ │
│  │Chain    │ │  │  │Chain    │ │  │  │Chain    │ │
│  ├─────────┤ │  │  ├─────────┤ │  │  ├─────────┤ │
│  │Response │ │  │  │Response │ │  │  │Response │ │
│  │Buffer   │ │  │  │Buffer   │ │  │  │Buffer   │ │
│  └─────────┘ │  │  └─────────┘ │  │  └─────────┘ │
│  PER-REQUEST │  │  PER-REQUEST │  │  PER-REQUEST │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 2. Memory Budget Allocation
```
Total Memory Budget = Available RAM - OS - Other Processes

Typical Allocation:
  Route Table:        ~2-5% (10-50MB)
  Response Cache:     ~30-50% (largest component)
  Rate Limiter:       ~5-10% (depends on consumer count)
  Consumer Registry:  ~2-5%
  Plugin Configs:     ~1-2%
  Connection Pools:   ~5-10%
  Per-Request Memory: ~10-20% (varies with concurrency)
  Buffer/Overhead:    ~10-15%
```

## Route Table Memory Management

### 1. Route Storage Structure
```rust
struct RouteTable {
    // Radix tree for path-based routing
    path_tree: RadixTree<RouteEntry>,
    
    // Host-based routing (SNI, virtual hosts)
    host_routes: HashMap<String, Vec<RouteId>>,
    
    // Method-based routing cache
    method_cache: [HashMap<String, RouteId>; 9], // GET, POST, PUT, etc.
    
    // Compiled regex patterns
    regex_routes: Vec<CompiledRegexRoute>,
    
    // Route priority sorted list
    priority_routes: Vec<RouteId>,
    
    // Route metadata
    route_metadata: Vec<RouteMetadata>,
}

struct RouteEntry {
    route_id: RouteId,
    service_id: ServiceId,
    method_mask: u16,               // Bitfield for allowed methods
    plugins: SmallVec<[PluginInstance; 4]>, // Inline storage for common case
    strip_path: bool,
    preserve_host: bool,
}

struct RouteMetadata {
    path_pattern: String,           // Original path pattern
    compiled_pattern: CompiledPattern,
    priority: u32,
    created_at: Timestamp,
    usage_count: AtomicU64,         // For route analytics
}
```

### 2. Efficient Route Lookup
```rust
impl RouteTable {
    fn match_route(&self, method: Method, path: &str, host: &str) -> Option<&RouteEntry> {
        // 1. Fast path: exact match cache
        if let Some(route_id) = self.method_cache[method as usize].get(path) {
            return self.get_route(*route_id);
        }
        
        // 2. Radix tree lookup for path patterns
        let mut candidates = self.path_tree.find_matches(path);
        
        // 3. Filter by method and host
        candidates.retain(|&route| {
            let route_entry = self.get_route(route).unwrap();
            (route_entry.method_mask & (1 << method as u16)) != 0 &&
            self.matches_host(route, host)
        });
        
        // 4. Return highest priority match
        candidates.sort_by_key(|&route| self.get_priority(route));
        candidates.first().map(|&id| self.get_route(id).unwrap())
    }
    
    // Memory-efficient regex compilation
    fn compile_regex_routes(&mut self) {
        for route in &self.regex_routes {
            // Use regex-automata for memory-efficient DFA compilation
            route.pattern = RegexDFA::new(&route.pattern_string)
                .expect("Invalid regex pattern");
        }
    }
}
```

### 3. Route Table Memory Sizing
```yaml
route_table_sizing:
  # Per-route memory overhead
  simple_route: "~200 bytes"      # Path string + metadata
  regex_route: "~2KB"             # Compiled DFA overhead
  complex_route: "~500 bytes"     # Multiple plugins/conditions
  
  # Route table capacity
  small_deployment: 
    max_routes: 1000
    memory_usage: "~1MB"
    
  medium_deployment:
    max_routes: 10000  
    memory_usage: "~10MB"
    
  large_deployment:
    max_routes: 100000
    memory_usage: "~100MB"
    
  # Lookup performance
  route_lookup_target: "<0.1ms for 1000 routes"
  memory_efficiency: "Linear scaling with route count"
```

## Plugin Chain Memory Management

### 1. Plugin Instance Management
```rust
struct PluginChain {
    // Pre-allocated plugin instances per phase
    certificate_plugins: Vec<PluginInstance>,
    rewrite_plugins: Vec<PluginInstance>,
    access_plugins: Vec<PluginInstance>,
    header_filter_plugins: Vec<PluginInstance>,
    body_filter_plugins: Vec<PluginInstance>,
    log_plugins: Vec<PluginInstance>,
    
    // Plugin execution order cache
    execution_order: Vec<(Phase, usize)>,
    
    // Shared plugin state
    shared_state: HashMap<PluginId, Arc<dyn PluginSharedState>>,
}

struct PluginInstance {
    plugin_id: PluginId,
    config: Arc<PluginConfig>,          // Shared config (read-only)
    runtime_state: Option<Box<dyn PluginState>>, // Per-instance state
    enabled: bool,
    priority: u32,
}

// Request-scoped plugin execution context
struct PluginContext {
    route: Arc<Route>,
    service: Arc<Service>,
    consumer: Option<Arc<Consumer>>,
    
    // Request state accessible to plugins
    request_headers: HeaderMap,
    request_body: Option<Bytes>,
    response_headers: HeaderMap,
    response_body: Option<Bytes>,
    
    // Inter-plugin communication
    shared_context: HashMap<String, Value>,
    
    // Memory management
    allocator: PluginAllocator,         // Per-request allocator
}
```

### 2. Plugin Memory Allocation Strategies
```rust
struct PluginAllocator {
    // Small allocations pool (< 1KB)
    small_pool: Vec<Box<[u8; 1024]>>,
    small_free_list: Vec<usize>,
    
    // Medium allocations (1KB - 64KB)
    medium_chunks: Vec<Vec<u8>>,
    medium_watermark: usize,
    
    // Large allocations (> 64KB) - go directly to system
    large_allocations: Vec<Box<[u8]>>,
    
    // Total allocated by this request
    total_allocated: usize,
    max_allocation_limit: usize,        // Prevent runaway memory usage
}

impl PluginAllocator {
    fn allocate(&mut self, size: usize) -> Result<*mut u8, AllocationError> {
        if self.total_allocated + size > self.max_allocation_limit {
            return Err(AllocationError::LimitExceeded);
        }
        
        match size {
            1..=1024 => self.allocate_small(size),
            1025..=65536 => self.allocate_medium(size), 
            _ => self.allocate_large(size),
        }
    }
    
    fn reset(&mut self) {
        // Return all allocations to pools for reuse
        self.small_free_list.clear();
        self.medium_watermark = 0;
        self.large_allocations.clear();
        self.total_allocated = 0;
    }
}
```

### 3. Plugin Configuration Memory
```rust
struct PluginConfigRegistry {
    // Immutable plugin configurations (shared)
    configs: HashMap<PluginId, Arc<PluginConfig>>,
    
    // Schema validation cache
    schema_cache: HashMap<String, Arc<JsonSchema>>,
    
    // Plugin lifecycle management
    plugin_factories: HashMap<String, Box<dyn PluginFactory>>,
    
    // Hot-reload support
    config_version: AtomicU64,
    pending_configs: RwLock<HashMap<PluginId, PluginConfig>>,
}

// Configuration size optimization
struct PluginConfig {
    plugin_type: String,
    
    // Use compact data structures
    config_data: CompactMap<String, ConfigValue>,
    
    // Interned strings for common values
    interned_strings: Vec<InternedString>,
}

enum ConfigValue {
    String(InternedString),             // Interned to save memory
    Integer(i64),
    Float(f64),
    Boolean(bool),
    Array(SmallVec<[ConfigValue; 4]>), // Inline small arrays
    Object(CompactMap<String, ConfigValue>),
}
```

## Consumer Registry Memory Management

### 1. Consumer Storage
```rust
struct ConsumerRegistry {
    // Primary consumer lookup (by ID)
    consumers_by_id: HashMap<ConsumerId, Arc<Consumer>>,
    
    // Secondary indices for credential lookups
    api_key_index: HashMap<String, ConsumerId>,
    jwt_issuer_index: HashMap<String, ConsumerId>,
    oauth_client_index: HashMap<String, ConsumerId>,
    username_index: HashMap<String, ConsumerId>,
    
    // Consumer groups for ACL
    groups: HashMap<GroupId, Arc<ConsumerGroup>>,
    
    // LRU cache for frequently accessed consumers
    consumer_cache: LruCache<ConsumerId, Arc<Consumer>>,
    
    // Credential cache with TTL
    credential_cache: TtlCache<String, CredentialCacheEntry>,
}

struct Consumer {
    id: ConsumerId,
    username: Option<String>,
    custom_id: Option<String>,
    
    // Credentials (multiple types possible)
    credentials: SmallVec<[Credential; 2]>, // Most consumers have 1-2 creds
    
    // Group memberships  
    groups: SmallVec<[GroupId; 4]>,        // Most consumers in few groups
    
    // Plugin configurations specific to this consumer
    plugins: SmallVec<[PluginInstance; 2]>,
    
    // Rate limiting tier
    rate_limit_tier: Option<RateLimitTier>,
    
    // Metadata (tags, creation time, etc.)
    metadata: CompactMap<String, String>,
}

struct CredentialCacheEntry {
    consumer_id: ConsumerId,
    credential_type: CredentialType,
    cached_at: Timestamp,
    ttl: Duration,
    validation_result: ValidationResult,
}
```

### 2. Consumer Lookup Optimization
```rust
impl ConsumerRegistry {
    fn authenticate_api_key(&self, api_key: &str) -> Result<Arc<Consumer>, AuthError> {
        // Check credential cache first
        if let Some(cached) = self.credential_cache.get(api_key) {
            if !cached.is_expired() {
                return self.get_consumer(cached.consumer_id);
            }
        }
        
        // Lookup in index
        if let Some(consumer_id) = self.api_key_index.get(api_key) {
            let consumer = self.get_consumer(*consumer_id)?;
            
            // Cache the successful lookup
            self.credential_cache.insert(api_key.to_string(), CredentialCacheEntry {
                consumer_id: *consumer_id,
                credential_type: CredentialType::ApiKey,
                cached_at: Timestamp::now(),
                ttl: Duration::from_secs(300), // 5 minute cache
                validation_result: ValidationResult::Valid,
            });
            
            Ok(consumer)
        } else {
            Err(AuthError::InvalidCredentials)
        }
    }
    
    fn optimize_memory_usage(&mut self) {
        // Periodically clean expired cache entries
        self.credential_cache.cleanup_expired();
        
        // Shrink consumer cache if needed
        if self.consumer_cache.len() > self.consumer_cache.capacity() / 2 {
            self.consumer_cache.resize(self.consumer_cache.capacity() * 3 / 4);
        }
    }
}
```

### 3. Consumer Registry Sizing
```yaml
consumer_registry_sizing:
  # Per-consumer memory overhead
  minimal_consumer: "~500 bytes"      # Basic consumer with API key
  typical_consumer: "~1KB"            # API key + JWT + metadata
  complex_consumer: "~2KB"            # Multiple creds + groups + plugins
  
  # Registry capacity
  small_deployment:
    max_consumers: 10000
    memory_usage: "~10MB"
    
  medium_deployment:
    max_consumers: 100000
    memory_usage: "~100MB"
    
  large_deployment:
    max_consumers: 1000000
    memory_usage: "~1GB"
    
  # Cache sizing
  credential_cache_size: "10% of max consumers"
  cache_ttl: "300 seconds"
  cache_hit_ratio_target: "> 95%"
```

## Rate Limiter Memory Management

### 1. Rate Limit Counter Storage
```rust
struct RateLimiterMemory {
    // Per-consumer counters (most common case)
    consumer_counters: HashMap<ConsumerId, RateLimitCounter>,
    
    // Per-IP counters (for anonymous limiting)
    ip_counters: HashMap<IpAddr, RateLimitCounter>,
    
    // Per-route counters (for global rate limiting)
    route_counters: HashMap<RouteId, RateLimitCounter>,
    
    // Composite key counters (consumer+route, ip+route, etc.)
    composite_counters: HashMap<CompositeKey, RateLimitCounter>,
    
    // Counter cleanup task
    cleanup_scheduler: CounterCleanup,
}

struct RateLimitCounter {
    // Fixed window counters
    current_window: AtomicU64,      // Current time window
    current_count: AtomicU64,       // Request count in current window
    
    // Sliding window state (if enabled)
    sliding_window: Option<SlidingWindow>,
    
    // Rate limit policy reference
    policy: RateLimitPolicy,
    
    // Timestamps
    created_at: Timestamp,
    last_accessed: AtomicU64,       // For cleanup
}

struct SlidingWindow {
    // Ring buffer of timestamps
    timestamps: RingBuffer<Timestamp>,
    window_duration: Duration,
    max_requests: u64,
}

// Memory-efficient composite key
#[derive(Hash, Eq, PartialEq)]
enum CompositeKey {
    ConsumerRoute(ConsumerId, RouteId),
    IpRoute(u32, RouteId),          // IPv4 as u32 to save space
    ConsumerService(ConsumerId, ServiceId),
}
```

### 2. Rate Limit Algorithm Memory Usage
```rust
// Fixed Window (most memory-efficient)
struct FixedWindowCounter {
    window_start: AtomicU64,        // 8 bytes
    count: AtomicU64,              // 8 bytes
    limit: u64,                    // 8 bytes
    window_duration: Duration,      // 16 bytes
    // Total: ~40 bytes per counter
}

// Sliding Window (more accurate, higher memory)
struct SlidingWindowCounter {
    ring_buffer: Vec<Timestamp>,    // window_duration / precision * 8 bytes
    buffer_index: AtomicUsize,      // 8 bytes
    total_count: AtomicU64,         // 8 bytes
    limit: u64,                    // 8 bytes
    window_duration: Duration,      // 16 bytes
    // Total: ~48 bytes + buffer size (typically 1-10KB)
}

// Token Bucket (moderate memory, burst handling)
struct TokenBucketCounter {
    tokens: AtomicU64,             // 8 bytes (fractional tokens as integer)
    last_refill: AtomicU64,        // 8 bytes
    capacity: u64,                 // 8 bytes
    refill_rate: u64,              // 8 bytes (tokens per second)
    // Total: ~32 bytes per counter
}
```

### 3. Rate Limiter Memory Optimization
```rust
impl RateLimiterMemory {
    fn cleanup_expired_counters(&mut self) {
        let now = Timestamp::now();
        let expiry_threshold = now - Duration::from_secs(3600); // 1 hour
        
        // Clean up counters not accessed recently
        self.consumer_counters.retain(|_, counter| {
            counter.last_accessed.load(Ordering::Relaxed) > expiry_threshold.as_secs()
        });
        
        self.ip_counters.retain(|_, counter| {
            counter.last_accessed.load(Ordering::Relaxed) > expiry_threshold.as_secs()
        });
        
        // Shrink hash maps if they're mostly empty
        self.shrink_hashmaps_if_needed();
    }
    
    fn estimate_memory_usage(&self) -> usize {
        let consumer_memory = self.consumer_counters.len() * std::mem::size_of::<RateLimitCounter>();
        let ip_memory = self.ip_counters.len() * std::mem::size_of::<RateLimitCounter>();
        let route_memory = self.route_counters.len() * std::mem::size_of::<RateLimitCounter>();
        
        consumer_memory + ip_memory + route_memory
    }
}
```

### 4. Rate Limiter Sizing Guidelines
```yaml
rate_limiter_sizing:
  # Memory per counter by algorithm
  fixed_window: "~40 bytes per counter"
  sliding_window: "~2KB per counter"    # Depends on precision
  token_bucket: "~32 bytes per counter"
  
  # Typical deployment sizes
  small_deployment:
    concurrent_consumers: 1000
    memory_usage: "~40KB (fixed window)"
    
  medium_deployment:
    concurrent_consumers: 10000
    memory_usage: "~400KB (fixed window)"
    
  large_deployment:
    concurrent_consumers: 100000
    memory_usage: "~4MB (fixed window)"
    
  # Counter cleanup
  cleanup_interval: "5 minutes"
  counter_ttl: "1 hour"
  max_counters: "2x expected concurrent consumers"
```

## Response Cache Memory Management

### 1. Cache Storage Architecture
```rust
struct ResponseCache {
    // LRU cache with TTL support
    cache_store: LruCacheWithTtl<CacheKey, CachedResponse>,
    
    // Cache statistics
    stats: CacheStats,
    
    // Memory management
    max_memory_bytes: usize,
    current_memory_bytes: AtomicUsize,
    
    // Cache policies
    default_ttl: Duration,
    max_entry_size: usize,
    
    // Vary header support
    vary_cache: HashMap<String, Vec<CacheKey>>,
}

struct CacheKey {
    method: Method,
    uri_hash: u64,                      // Hash of normalized URI
    vary_values: SmallVec<[String; 4]>, // Values for Vary headers
}

struct CachedResponse {
    // Response data
    status: StatusCode,
    headers: CompactHeaderMap,
    body: CachedBody,
    
    // Cache metadata
    created_at: Timestamp,
    ttl: Duration,
    size_bytes: usize,
    
    // Cache control
    cacheable: bool,
    private: bool,
    no_cache_headers: SmallVec<[String; 2]>,
}

enum CachedBody {
    Small(SmallVec<[u8; 1024]>),       // Inline for small responses
    Medium(Vec<u8>),                    // Heap allocation for medium
    Large(Arc<[u8]>),                   // Shared for large responses
    Compressed(CompressedBody),         // Compressed storage
}
```

### 2. Cache Memory Management
```rust
impl ResponseCache {
    fn insert(&mut self, key: CacheKey, response: CachedResponse) -> CacheResult {
        let entry_size = response.size_bytes;
        
        // Check if entry exceeds maximum size
        if entry_size > self.max_entry_size {
            return CacheResult::TooLarge;
        }
        
        // Evict entries if memory limit would be exceeded
        while self.current_memory_bytes.load(Ordering::Relaxed) + entry_size > self.max_memory_bytes {
            if let Some((evicted_key, evicted_response)) = self.cache_store.pop_lru() {
                self.current_memory_bytes.fetch_sub(evicted_response.size_bytes, Ordering::Relaxed);
                self.stats.evictions.fetch_add(1, Ordering::Relaxed);
            } else {
                return CacheResult::NoSpace; // Cache is empty but entry still too large
            }
        }
        
        // Insert the entry
        self.cache_store.put(key, response);
        self.current_memory_bytes.fetch_add(entry_size, Ordering::Relaxed);
        self.stats.insertions.fetch_add(1, Ordering::Relaxed);
        
        CacheResult::Success
    }
    
    fn get(&mut self, key: &CacheKey) -> Option<&CachedResponse> {
        if let Some(response) = self.cache_store.get(key) {
            // Check TTL
            if response.is_expired() {
                self.cache_store.pop(key);
                self.current_memory_bytes.fetch_sub(response.size_bytes, Ordering::Relaxed);
                self.stats.expirations.fetch_add(1, Ordering::Relaxed);
                return None;
            }
            
            self.stats.hits.fetch_add(1, Ordering::Relaxed);
            Some(response)
        } else {
            self.stats.misses.fetch_add(1, Ordering::Relaxed);
            None
        }
    }
    
    fn cleanup_expired(&mut self) {
        let now = Timestamp::now();
        let mut expired_keys = Vec::new();
        
        for (key, response) in self.cache_store.iter() {
            if response.created_at + response.ttl < now {
                expired_keys.push(key.clone());
            }
        }
        
        for key in expired_keys {
            if let Some(response) = self.cache_store.pop(&key) {
                self.current_memory_bytes.fetch_sub(response.size_bytes, Ordering::Relaxed);
                self.stats.expirations.fetch_add(1, Ordering::Relaxed);
            }
        }
    }
}
```

### 3. Cache Compression and Optimization
```rust
struct CompressedBody {
    compressed_data: Vec<u8>,
    original_size: usize,
    compression_type: CompressionType,
}

impl CompressedBody {
    fn new(body: &[u8], compression_threshold: usize) -> CachedBody {
        if body.len() < compression_threshold {
            return if body.len() <= 1024 {
                CachedBody::Small(SmallVec::from_slice(body))
            } else {
                CachedBody::Medium(body.to_vec())
            };
        }
        
        // Try compression if body is large enough
        let compressed = compress_gzip(body);
        if compressed.len() < body.len() * 90 / 100 { // At least 10% savings
            CachedBody::Compressed(CompressedBody {
                compressed_data: compressed,
                original_size: body.len(),
                compression_type: CompressionType::Gzip,
            })
        } else {
            CachedBody::Medium(body.to_vec())
        }
    }
    
    fn decompress(&self) -> Vec<u8> {
        match self.compression_type {
            CompressionType::Gzip => decompress_gzip(&self.compressed_data),
            CompressionType::Brotli => decompress_brotli(&self.compressed_data),
        }
    }
}
```

### 4. Cache Sizing Guidelines
```yaml
response_cache_sizing:
  # Memory allocation by deployment size
  small_deployment:
    cache_memory: "256MB"
    max_entries: "~10000"             # Assuming 25KB avg response
    hit_ratio_target: "> 80%"
    
  medium_deployment:
    cache_memory: "2GB"
    max_entries: "~80000"
    hit_ratio_target: "> 85%"
    
  large_deployment:
    cache_memory: "8GB"
    max_entries: "~320000"
    hit_ratio_target: "> 90%"
    
  # Cache tuning parameters
  default_ttl: "300 seconds"
  max_entry_size: "1MB"
  compression_threshold: "4KB"
  cleanup_interval: "60 seconds"
  
  # Memory efficiency targets
  metadata_overhead: "< 5% of total cache size"
  fragmentation_overhead: "< 10% of allocated cache memory"
```

## Connection Pool Memory Management

### 1. Upstream Connection Pools
```rust
struct ConnectionPoolManager {
    // Per-service connection pools
    pools: HashMap<ServiceId, Arc<ConnectionPool>>,
    
    // Global connection limits
    total_connections: AtomicUsize,
    max_total_connections: usize,
    
    // Connection factory
    connector: Arc<dyn HttpConnector>,
}

struct ConnectionPool {
    service_id: ServiceId,
    
    // Available connections
    idle_connections: VecDeque<IdleConnection>,
    
    // Active connections tracking
    active_connections: HashSet<ConnectionId>,
    
    // Pool configuration
    config: PoolConfig,
    
    // Pool statistics
    stats: PoolStats,
}

struct IdleConnection {
    connection: Box<dyn HttpConnection>,
    last_used: Timestamp,
    total_requests: u32,
    created_at: Timestamp,
}

struct PoolConfig {
    max_idle: usize,                // Maximum idle connections
    max_active: usize,              // Maximum active connections  
    idle_timeout: Duration,         // Idle connection timeout
    connect_timeout: Duration,      // New connection timeout
    max_lifetime: Duration,         // Maximum connection lifetime
    max_requests_per_conn: u32,     // Max requests before connection refresh
}
```

### 2. Connection Pool Memory Optimization
```rust
impl ConnectionPool {
    fn get_connection(&mut self) -> Result<Box<dyn HttpConnection>, PoolError> {
        // Try to reuse idle connection
        while let Some(idle_conn) = self.idle_connections.pop_front() {
            if self.is_connection_valid(&idle_conn) {
                self.active_connections.insert(idle_conn.connection.id());
                self.stats.reused_connections.fetch_add(1, Ordering::Relaxed);
                return Ok(idle_conn.connection);
            } else {
                // Connection expired or invalid, drop it
                self.stats.expired_connections.fetch_add(1, Ordering::Relaxed);
            }
        }
        
        // Create new connection if under limits
        if self.active_connections.len() < self.config.max_active {
            let conn = self.create_new_connection()?;
            self.active_connections.insert(conn.id());
            self.stats.new_connections.fetch_add(1, Ordering::Relaxed);
            Ok(conn)
        } else {
            Err(PoolError::PoolExhausted)
        }
    }
    
    fn return_connection(&mut self, mut connection: Box<dyn HttpConnection>) {
        self.active_connections.remove(&connection.id());
        
        // Check if connection should be kept in pool
        if self.should_keep_connection(&connection) && 
           self.idle_connections.len() < self.config.max_idle {
            
            self.idle_connections.push_back(IdleConnection {
                connection,
                last_used: Timestamp::now(),
                total_requests: connection.request_count(),
                created_at: connection.created_at(),
            });
        } else {
            // Drop connection (will close automatically)
            self.stats.dropped_connections.fetch_add(1, Ordering::Relaxed);
        }
    }
    
    fn cleanup_expired_connections(&mut self) {
        let now = Timestamp::now();
        
        self.idle_connections.retain(|idle_conn| {
            let is_valid = now - idle_conn.last_used < self.config.idle_timeout &&
