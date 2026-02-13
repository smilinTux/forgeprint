# Standard Memory Profile for Key-Value Stores

## Overview
This document provides comprehensive memory management guidelines for Redis/Valkey-style key-value store implementations. Memory efficiency and predictable allocation patterns are critical for achieving sub-millisecond latency while maintaining stable performance under varying workloads and memory pressure.

## Memory Architecture Principles

### 1. Memory Allocator Strategy

#### jemalloc as Default Allocator
Redis-style key-value stores benefit significantly from jemalloc's characteristics:

**Arena-based allocation**:
```rust
// Configure jemalloc for KV store workload
struct JemallocConfig {
    narenas: usize,        // Number of arenas (typically 1 for single-threaded)
    dirty_decay_ms: i32,   // 10000ms default - balance memory usage vs syscall overhead
    muzzy_decay_ms: i32,   // 10000ms default - decay unused clean pages
    background_thread: bool, // true - enable background purging thread
}

impl MemoryAllocator {
    fn initialize_jemalloc() -> Result<(), AllocatorError> {
        // Single arena for main thread (no contention)
        mallctl("opt.narenas", 1)?;
        
        // Optimize for KV workload
        mallctl("opt.dirty_decay_ms", 10_000)?;  // 10 second decay
        mallctl("opt.muzzy_decay_ms", 10_000)?;  // 10 second decay
        mallctl("opt.background_thread", true)?;
        
        // Disable THP for predictable memory usage
        mallctl("opt.thp", "never")?;
        
        Ok(())
    }
}
```

**Size classes optimization**:
```
Small objects: 8, 16, 32, 48, 64, 80, 96, 112, 128, ... up to 14KB
Large objects: 16KB, 20KB, 24KB, 28KB, 32KB, ... up to 4MB  
Huge objects: 4MB, 6MB, 8MB, ... (direct mmap)

Redis object sizes:
- RedisObject header: 16 bytes → 16-byte size class
- SDS headers: 3-9 bytes + string data
- Dict entries: ~32 bytes → 32-byte size class
- List nodes: ~24 bytes → 32-byte size class
```

### 2. Object Encoding Strategy

#### String Object Encodings
```rust
enum StringEncoding {
    // Raw SDS - separate allocation
    Raw,
    // Embedded SDS - single allocation with RedisObject
    EmbStr, 
    // Integer - no separate allocation
    Int,
}

impl StringEncoding {
    fn select_encoding(data: &[u8]) -> StringEncoding {
        // Try integer encoding first
        if let Ok(_) = btoi::btoi::<i64>(data) {
            return StringEncoding::Int;
        }
        
        // Embstr for strings ≤ 44 bytes (fits in 64-byte allocation)
        if data.len() <= 44 {
            StringEncoding::EmbStr
        } else {
            StringEncoding::Raw
        }
    }
}

// Memory layout comparison:
// Raw:    [RedisObject: 16 bytes] → [SdsHdr + data: N bytes] = 2 allocations
// EmbStr: [RedisObject + SdsHdr + data ≤ 44: 64 bytes total] = 1 allocation  
// Int:    [RedisObject with value in ptr field: 16 bytes] = 1 allocation
```

#### List Object Encodings
```rust
enum ListEncoding {
    ListPack,   // Single allocation for small lists
    QuickList,  // Linked list of listpack nodes
}

const LIST_MAX_LISTPACK_SIZE: i32 = -2; // 8KB max per listpack (configurable)
const LIST_COMPRESS_DEPTH: u16 = 0;     // LZF compression depth (0 = disabled)

struct QuickListNode {
    prev: *mut QuickListNode,
    next: *mut QuickListNode,
    entry: *mut u8,        // listpack data or compressed data
    count: u32,            // Number of elements in this listpack
    size: u32,             // Bytes used by listpack
    encoding: u8,          // PLAIN=1 or LZF=2
    container: u8,         // PACKED=2 (listpack)
    recompress: bool,      // Was this temporarily decompressed?
    attempted_compress: bool,
    extra: u16,           // Extra data for future use
}

// Memory characteristics:
// - Node overhead: 32 bytes per node
// - Listpack overhead: ~10 bytes per listpack
// - Element overhead in listpack: 1-9 bytes per element (depends on size/type)
// - Compression: ~50-70% space reduction for text data
```

#### Set Object Encodings  
```rust
enum SetEncoding {
    IntSet,     // Sorted array of integers
    ListPack,   // Small sets with mixed types
    HashTable,  // General case
}

const SET_MAX_INTSET_ENTRIES: usize = 512;
const SET_MAX_LISTPACK_ENTRIES: usize = 128;
const SET_MAX_LISTPACK_VALUE: usize = 64;

struct IntSet {
    encoding: IntSetEncoding,  // INT16, INT32, INT64
    length: u32,
    contents: [u8],           // Flexible array of sorted integers
}

// Memory usage:
// IntSet: 8 bytes header + (2/4/8 bytes × number of elements)
// ListPack: ~15 bytes overhead + element storage
// HashTable: Dict overhead + DictEntry per element (~32 bytes each)
```

#### Sorted Set Object Encodings
```rust  
enum ZSetEncoding {
    ListPack,   // Small sorted sets
    SkipList,   // Skip list + hash table combination
}

const ZSET_MAX_LISTPACK_ENTRIES: usize = 128;
const ZSET_MAX_LISTPACK_VALUE: usize = 64;

struct ZSet {
    dict: Dict,          // element → score mapping for O(1) lookups
    zsl: SkipList,       // skip list for range operations
}

// Memory overhead:
// ListPack: ~20 bytes overhead + element/score storage
// SkipList: Skip list nodes (~40 bytes each) + Dict entries (~32 bytes each)
//           Total: ~72 bytes per element + variable levels
```

#### Hash Object Encodings
```rust
enum HashEncoding {
    ListPack,   // Small hashes
    HashTable,  // General case
}

const HASH_MAX_LISTPACK_ENTRIES: usize = 128;
const HASH_MAX_LISTPACK_VALUE: usize = 64;

// Memory usage:
// ListPack: ~15 bytes overhead + field/value storage
// HashTable: Dict overhead + DictEntry per field (~32 bytes each)
```

### 3. Key Expiry Memory Management

#### Expire Dictionary
```rust
struct Database {
    dict: Dict,         // Main key-value dictionary  
    expires: Dict,      // Key → expiry timestamp mapping
}

// Memory optimization: expires dict only contains keys with TTL
// Overhead: ~32 bytes per expiring key (DictEntry)
// Alternative: embed expiry in main dict (always 8 bytes per key)
```

#### Active Expiry Algorithm
```rust
struct ActiveExpiryState {
    cycles_per_second: u32,     // Default 10
    time_limit_percentage: u32, // Default 25% of cycle time
    sample_size: usize,         // Default 20 keys per cycle
    fast_cycle_enabled: bool,   // Emergency fast cycles when memory pressure
}

impl ActiveExpiryState {
    fn memory_optimized_cycle(&self, db: &mut Database) {
        let start_time = Instant::now();
        let time_limit = Duration::from_millis(1000 / self.cycles_per_second / 4); // 25ms at 10Hz
        
        loop {
            let mut expired_count = 0;
            let sample_size = self.sample_size.min(db.expires.len());
            
            // Use memory-efficient sampling
            for _ in 0..sample_size {
                if let Some(key) = self.sample_expiring_key(db) {
                    if self.is_expired(&key, db) {
                        // Lazy free if enabled for large objects
                        if self.should_lazy_free(&key, db) {
                            self.async_delete(&key, db);
                        } else {
                            self.sync_delete(&key, db);
                        }
                        expired_count += 1;
                    }
                }
            }
            
            // Stop if < 25% expired (database is mostly fresh)
            if expired_count < sample_size / 4 {
                break;
            }
            
            // Check time budget
            if start_time.elapsed() > time_limit {
                break;
            }
        }
    }
}
```

### 4. Memory Eviction Policies

#### LRU Implementation (Approximate)
```rust
struct LruClock {
    server_lru_clock: u32,      // 24-bit clock, updated every 1000ms
    lru_decay_time: u32,        // Minutes before counter decays
}

impl LruClock {
    fn update_lru_clock(&mut self) {
        // Called from server cron, 24-bit clock wraps every ~194 days
        self.server_lru_clock = (unix_time_in_ms() / 1000) & ((1 << 24) - 1);
    }
    
    fn estimate_idle_time(&self, object_lru: u32) -> u32 {
        let mut idle = self.server_lru_clock.wrapping_sub(object_lru);
        if idle > (1 << 23) {
            // Handle wrap-around: if idle > 2^23, likely wrapped
            idle = (1 << 24) - 1 - idle;
        }
        idle
    }
}
```

#### LFU Implementation (Logarithmic Counter)
```rust
struct LfuCounter {
    lfu_log_factor: u8,    // Default 10
    lfu_decay_time: u8,    // Default 1 minute
}

impl LfuCounter {
    fn increment_counter(&self, counter: u8) -> u8 {
        if counter == 255 { return 255; }
        
        let base_val = (counter as f64 - 5.0).max(0.0); // LFU_INIT_VAL = 5
        let probability = 1.0 / (base_val * self.lfu_log_factor as f64 + 1.0);
        
        if rand::random::<f64>() < probability {
            counter + 1
        } else {
            counter
        }
    }
    
    fn decay_counter(&self, counter: u8, minutes_elapsed: u64) -> u8 {
        let decay = minutes_elapsed / self.lfu_decay_time as u64;
        if decay >= counter as u64 {
            0
        } else {
            counter - decay as u8
        }
    }
}

// Memory usage: 1 byte per object (embedded in RedisObject)
// Counter represents log2(access_count) with decay
```

#### Eviction Sample Pool
```rust
struct EvictionPool {
    pool: [EvictionPoolEntry; 16],  // Sample pool size
    pool_populated: usize,
}

struct EvictionPoolEntry {
    idle: u64,
    key: SDS,
    cached_object: *mut RedisObject,
    db_id: u8,
}

impl EvictionPool {
    fn populate_pool(&mut self, db: &Database, policy: EvictionPolicy) {
        // Sample more keys than pool size to get better candidates
        let sample_count = 5 * self.pool.len();  // 80 samples for 16-entry pool
        
        for _ in 0..sample_count {
            let (key, obj) = if policy.is_volatile() {
                db.expires.random_entry()
            } else {
                db.dict.random_entry()
            }.unwrap();
            
            let idle = match policy {
                EvictionPolicy::AllKeysLru | EvictionPolicy::VolatileLru => {
                    self.calculate_lru_idle(obj)
                },
                EvictionPolicy::AllKeysLfu | EvictionPolicy::VolatileLfu => {
                    self.calculate_lfu_idle(obj)
                },
                EvictionPolicy::VolatileTtl => {
                    self.calculate_ttl_urgency(key, db)
                },
                _ => rand::random::<u64>(),
            };
            
            self.try_insert_entry(key, obj, idle);
        }
        
        // Sort pool by idle time (descending)
        self.pool[..self.pool_populated].sort_by(|a, b| b.idle.cmp(&a.idle));
    }
    
    fn get_best_eviction_candidate(&mut self) -> Option<&EvictionPoolEntry> {
        if self.pool_populated > 0 {
            Some(&self.pool[0])  // Highest idle time
        } else {
            None
        }
    }
}
```

### 5. Client Output Buffer Management

```rust
struct ClientOutputBuffer {
    reply: VecDeque<ReplyChunk>,
    reply_bytes: usize,
    sentlen: usize,        // Bytes sent from first chunk
    
    // Buffer limits
    soft_limit_reached_time: Option<Instant>,
}

struct ReplyChunk {
    data: Vec<u8>,
    is_static: bool,       // Points to static string, don't free
}

#[derive(Clone)]
struct OutputBufferLimits {
    hard_limit_bytes: usize,      // Immediate disconnect
    soft_limit_bytes: usize,      // Start soft timer
    soft_limit_seconds: u64,      // Seconds over soft limit before disconnect
}

// Default limits by client type:
const NORMAL_CLIENT_LIMITS: OutputBufferLimits = OutputBufferLimits {
    hard_limit_bytes: 0,          // No limit
    soft_limit_bytes: 0,          // No limit  
    soft_limit_seconds: 0,
};

const REPLICA_CLIENT_LIMITS: OutputBufferLimits = OutputBufferLimits {
    hard_limit_bytes: 256 * 1024 * 1024,    // 256MB
    soft_limit_bytes: 64 * 1024 * 1024,     // 64MB
    soft_limit_seconds: 60,
};

const PUBSUB_CLIENT_LIMITS: OutputBufferLimits = OutputBufferLimits {
    hard_limit_bytes: 32 * 1024 * 1024,     // 32MB
    soft_limit_bytes: 8 * 1024 * 1024,      // 8MB
    soft_limit_seconds: 60,
};
```

### 6. Replication Buffer Management

#### Replication Backlog (Circular Buffer)
```rust
struct ReplicationBacklog {
    buffer: Box<[u8]>,            // Fixed-size circular buffer
    buffer_size: usize,           // Default 1MB
    master_repl_offset: i64,      // Global replication offset
    repl_offset: i64,             // Offset of first byte in buffer
    histlen: usize,               // Valid data length in buffer
    idx: usize,                   // Current write position
}

impl ReplicationBacklog {
    fn new(size: usize) -> Self {
        ReplicationBacklog {
            buffer: vec![0u8; size].into_boxed_slice(),
            buffer_size: size,
            master_repl_offset: 1,
            repl_offset: 1,
            histlen: 0,
            idx: 0,
        }
    }
    
    fn feed(&mut self, data: &[u8]) {
        for &byte in data {
            self.buffer[self.idx] = byte;
            self.idx = (self.idx + 1) % self.buffer_size;
            
            if self.histlen < self.buffer_size {
                self.histlen += 1;
            } else {
                self.repl_offset += 1;  // Oldest byte pushed out
            }
        }
        self.master_repl_offset += data.len() as i64;
    }
    
    fn can_partial_sync(&self, replica_offset: i64) -> bool {
        replica_offset >= self.repl_offset &&
        replica_offset <= self.repl_offset + self.histlen as i64
    }
}
```

#### Client Replica Buffer
```rust
struct ReplicaClient {
    client: ClientId,
    replication_state: ReplicationState,
    repldbfd: Option<File>,           // RDB transfer file descriptor
    repldboff: u64,                   // RDB transfer offset
    repldbsize: u64,                  // RDB file size
    
    // Output buffering specific to replication
    repl_ack_off: i64,                // Last ACK offset from replica
    repl_ack_time: Instant,           // Last ACK time
    slave_lag: u64,                   // Estimated lag in seconds
}
```

### 7. Persistence Memory Management

#### RDB Child Process Memory
```rust
struct RdbSaveState {
    child_pid: Option<u32>,
    save_start_time: Instant,
    last_cow_size: usize,            // Copy-on-write memory size
    last_cow_updated: Instant,
}

impl Server {
    fn monitor_rdb_cow_memory(&self) -> usize {
        // Read /proc/[child_pid]/smaps to calculate CoW memory
        let cow_size = self.get_cow_size_from_proc();
        
        // Log if CoW is excessive (> 50% of used memory)
        if cow_size > self.used_memory() / 2 {
            log::warn!("High copy-on-write memory during BGSAVE: {}MB", 
                      cow_size / 1024 / 1024);
        }
        
        cow_size
    }
    
    fn optimize_for_fork(&mut self) {
        // Disable hash table resizing during background save
        // (resizing causes copy-on-write of dictionary pages)
        self.dict_can_resize = false;
        
        // Consider: pause active expiry during BGSAVE
        // (expiry modifies pages → CoW)
        self.active_expire_enabled = false;
    }
}
```

#### AOF Buffer Management
```rust
struct AofState {
    filename: String,
    fd: File,
    
    // In-memory buffer before writing
    buf: Vec<u8>,                    // Current buffer
    buf_size: usize,                 // Buffer size limit (32MB default)
    
    // AOF rewrite buffering
    rewrite_buf_blocks: VecDeque<Vec<u8>>, // List of 10MB blocks
    rewrite_buf_size: usize,               // Total buffered size
    
    // Auto-flush configuration
    auto_fsync: bool,
    last_fsync: Instant,
    fsync_in_progress: AtomicBool,          // Background fsync status
}

impl AofState {
    fn feed_append_only_file(&mut self, cmd: &[u8]) {
        self.buf.extend_from_slice(cmd);
        
        // Auto-flush if buffer reaches limit
        if self.buf.len() >= self.buf_size {
            self.flush_append_only_file();
        }
    }
    
    fn feed_rewrite_buffer(&mut self, cmd: &[u8]) {
        // During AOF rewrite, buffer commands that arrive after fork
        const BLOCK_SIZE: usize = 10 * 1024 * 1024; // 10MB blocks
        
        if self.rewrite_buf_blocks.is_empty() || 
           self.rewrite_buf_blocks.back().unwrap().len() + cmd.len() > BLOCK_SIZE {
            // Start new block
            self.rewrite_buf_blocks.push_back(Vec::new());
        }
        
        self.rewrite_buf_blocks.back_mut().unwrap().extend_from_slice(cmd);
        self.rewrite_buf_size += cmd.len();
        
        // Limit memory usage during rewrite
        const MAX_REWRITE_BUFFER: usize = 256 * 1024 * 1024; // 256MB
        if self.rewrite_buf_size > MAX_REWRITE_BUFFER {
            log::warn!("AOF rewrite buffer size exceeded: {}MB", 
                      self.rewrite_buf_size / 1024 / 1024);
        }
    }
}
```

### 8. Memory Monitoring and Diagnostics

#### Memory Usage Tracking
```rust
struct MemoryInfo {
    // Basic memory stats
    used_memory: u64,                    // Logical memory used by data
    used_memory_rss: u64,                // Resident Set Size (actual RAM)
    used_memory_peak: u64,               // Peak memory usage
    used_memory_peak_human: String,      // Human readable peak
    
    // Fragmentation
    mem_fragmentation_ratio: f64,        // RSS / used_memory
    mem_fragmentation_bytes: i64,        // RSS - used_memory
    
    // Allocator stats (jemalloc)
    mem_allocator_allocated: u64,
    mem_allocator_active: u64,
    mem_allocator_resident: u64,
    mem_allocator_fragmentation_ratio: f64,
    
    // Component breakdown
    used_memory_startup: u64,            // Memory used at startup
    used_memory_overhead: u64,           // Total overhead (dicts, expires, etc.)
    used_memory_dataset: u64,            // Actual data memory
    used_memory_dataset_percentage: f64, // Dataset / total ratio
    
    // Memory policies
    maxmemory: u64,                      // Configured memory limit
    maxmemory_human: String,             // Human readable limit
    maxmemory_policy: String,            // Eviction policy
    
    // Persistence impact
    loading: bool,                       // RDB loading in progress
    rdb_last_bgsave_status: String,      // Success/failure
    rdb_last_cow_size: u64,             // CoW size during last BGSAVE
    aof_last_cow_size: u64,             // CoW size during last AOF rewrite
}

impl MemoryInfo {
    fn collect_memory_info(server: &Server) -> MemoryInfo {
        let used_memory = server.used_memory();
        let rss = get_resident_set_size();
        
        MemoryInfo {
            used_memory,
            used_memory_rss: rss,
            used_memory_peak: server.stat_peak_memory,
            mem_fragmentation_ratio: rss as f64 / used_memory.max(1) as f64,
            mem_fragmentation_bytes: rss as i64 - used_memory as i64,
            
            // Collect allocator stats
            mem_allocator_allocated: jemalloc::stats_allocated(),
            mem_allocator_active: jemalloc::stats_active(),
            mem_allocator_resident: jemalloc::stats_resident(),
            
            // Calculate overhead
            used_memory_overhead: server.calculate_overhead(),
            used_memory_dataset: used_memory.saturating_sub(server.calculate_overhead()),
            
            maxmemory: server.maxmemory,
            maxmemory_policy: format!("{:?}", server.maxmemory_policy),
            
            rdb_last_cow_size: server.rdb_last_cow_size,
            aof_last_cow_size: server.aof_last_cow_size,
            
            ..Default::default()
        }
    }
}
```

#### Memory Usage Analysis
```rust
impl Server {
    fn calculate_overhead(&self) -> u64 {
        let mut overhead = 0u64;
        
        // Server structure overhead
        overhead += std::mem::size_of::<Server>() as u64;
        
        // Database dictionaries overhead
        for db in &self.db {
            overhead += db.dict.overhead_bytes();
            overhead += db.expires.overhead_bytes();
        }
        
        // Client structures
        overhead += self.clients.len() as u64 * std::mem::size_of::<Client>() as u64;
        
        // Replication backlog
        if let Some(ref backlog) = self.repl_backlog {
            overhead += backlog.size() as u64;
        }
        
        // AOF buffer
        overhead += self.aof_buf.capacity() as u64;
        
        // Pub/Sub structures
        overhead += self.pubsub_channels.overhead_bytes();
        overhead += self.pubsub_patterns.overhead_bytes();
        
        overhead
    }
    
    fn analyze_key_memory_usage(&self, key: &[u8]) -> KeyMemoryInfo {
        let db = &self.db[self.current_db];
        let obj = db.dict.find(key).unwrap();
        
        KeyMemoryInfo {
            key_size: key.len(),
            value_size: self.object_size(obj),
            total_size: key.len() + self.object_size(obj) + 
                       std::mem::size_of::<DictEntry>(),
            encoding: format!("{:?}", obj.encoding),
            type_name: format!("{:?}", obj.obj_type),
            expire_size: if db.expires.contains_key(key) { 8 } else { 0 },
        }
    }
}
```

### 9. Memory Optimization Guidelines

#### Small Object Optimization
```rust
const SMALL_OBJECT_THRESHOLD: usize = 64;  // Objects ≤ 64 bytes

struct SmallObjectPool {
    // Pre-allocated pool for common small objects
    string_pool: Vec<RedisObject>,     // For small strings
    list_node_pool: Vec<ListNode>,     // For list nodes  
    dict_entry_pool: Vec<DictEntry>,   // For hash entries
}

impl SmallObjectPool {
    fn get_string_object(&mut self, value: &str) -> Option<RedisObject> {
        if value.len() <= SMALL_OBJECT_THRESHOLD {
            self.string_pool.pop()
        } else {
            None
        }
    }
}
```

#### Memory Pool Configuration by Workload

**Cache workload (mostly strings)**:
```yaml
memory_config:
  maxmemory_policy: "allkeys-lru"  # Evict any key
  hash_max_listpack_entries: 512   # Larger threshold for cache hits
  hash_max_listpack_value: 64
  list_max_listpack_size: -2       # 8KB max per node
  set_max_intset_entries: 512      # More int sets
  zset_max_listpack_entries: 128
  
  # Optimize for string operations
  string_sharing: true             # Share small string values
  maxmemory_samples: 3             # Faster eviction
```

**Session store workload (hashes + TTL)**:
```yaml
memory_config:
  maxmemory_policy: "volatile-lru"   # Only evict keys with TTL
  hash_max_listpack_entries: 256    # More hash objects
  hash_max_listpack_value: 128      # Larger session data
  expire_effort: 1                  # Fast expiry for sessions
  maxmemory_samples: 10             # More accurate eviction
```

**Analytics workload (sorted sets + lists)**:
```yaml
memory_config:
  maxmemory_policy: "allkeys-lfu"    # Keep frequently accessed data
  zset_max_listpack_entries: 64     # Convert to skiplist sooner
  list_max_listpack_size: -3        # 16KB nodes for analytics
  maxmemory_samples: 10             # Accurate frequency tracking
  lfu_log_factor: 5                 # More sensitive LFU
```

### 10. Memory Debugging and Troubleshooting

#### Memory Leak Detection
```rust
struct MemoryTracker {
    allocations: HashMap<*const u8, AllocationInfo>,
    total_allocated: AtomicU64,
    total_freed: AtomicU64,
    peak_allocated: AtomicU64,
}

struct AllocationInfo {
    size: usize,
    timestamp: Instant,
    stack_trace: Vec<String>,  // Debug builds only
    allocation_type: AllocationType,
}

enum AllocationType {
    RedisObject,
    SdsString,
    DictEntry,
    ListNode,
    SkipListNode,
    Client,
    Other(String),
}

impl MemoryTracker {
    fn track_allocation(&self, ptr: *const u8, size: usize, alloc_type: AllocationType) {
        if cfg!(debug_assertions) {
            let info = AllocationInfo {
                size,
                timestamp: Instant::now(),
                stack_trace: capture_stack_trace(),
                allocation_type: alloc_type,
            };
            self.allocations.insert(ptr, info);
        }
        
        self.total_allocated.fetch_add(size as u64, Ordering::Relaxed);
        self.update_peak();
    }
    
    fn detect_leaks(&self) -> Vec<LeakReport> {
        let mut leaks = Vec::new();
        let leak_threshold = Duration::from_secs(3600); // 1 hour
        let now = Instant::now();
        
        for (ptr, info) in &self.allocations {
            if now.duration_since(info.timestamp) > leak_threshold {
                leaks.push(LeakReport {
                    ptr: *ptr,
                    size: info.size,
                    age: now.duration_since(info.timestamp),
                    alloc_type: info.allocation_type.clone(),
                    stack_trace: info.stack_trace.clone(),
                });
            }
        }
        
        leaks.sort_by_key(|leak| std::cmp::Reverse(leak.size));
        leaks
    }
}
```

#### Memory Profiling Commands
```rust
// MEMORY USAGE key [SAMPLES count]
fn memory_usage_command(key: &[u8], samples: Option<usize>) -> Result<u64, Error> {
    let obj = get_object_for_key(key)?;
    
    let samples = samples.unwrap_or(0);
    if samples > 0 {
        calculate_memory_usage_sampled(obj, samples)
    } else {
        calculate_memory_usage_full(obj)
    }
}

// MEMORY DOCTOR
fn memory_doctor_command() -> Vec<String> {
    let mut advice = Vec::new();
    let info = MemoryInfo::collect_memory_info();
    
    // Check fragmentation
    if info.mem_fragmentation_ratio > 1.5 {
        advice.push(format!(
            "High memory fragmentation: {:.2}. Consider restarting if persistent.",
            info.mem_fragmentation_ratio
        ));
    }
    
    // Check dataset vs overhead ratio
    if info.used_memory_dataset_percentage < 50.0 {
        advice.push(format!(
            "Dataset only {:.1}% of memory. High overhead suggests many small keys.",
            info.used_memory_dataset_percentage
        ));
    }
    
    // Check memory policy
    if info.maxmemory > 0 && info.used_memory as f64 / info.maxmemory as f64 > 0.8 {
        advice.push(format!(
            "Memory usage {}% of limit. Consider tuning maxmemory-policy or adding memory.",
            (info.used_memory * 100 / info.maxmemory)
        ));
    }
    
    advice
}

// MEMORY STATS
fn memory_stats_command() -> MemoryStats {
    let (allocated, active, metadata, resident, mapped, retained) = jemalloc::stats();
    
    MemoryStats {
        peak_allocated: allocated,
        total_allocated: allocated,
        total_active: active,
        total_resident: resident,
        total_mapped: mapped,
        fragmentation_ratio: active as f64 / allocated.max(1) as f64,
        dataset_bytes: calculate_dataset_memory(),
        overhead_bytes: calculate_overhead_memory(),
        db: collect_database_memory_stats(),
        replication: collect_replication_memory_stats(),
        clients: collect_client_memory_stats(),
    }
}
```

## Performance Tuning Guidelines

### Memory Optimization Checklist

#### 1. Choose Appropriate Data Structures
- **Strings < 44 bytes**: Use embedded strings (automatic)
- **Small lists (< 128 elements)**: Keep as listpack
- **Integer sets**: Configure `set-max-intset-entries` based on workload
- **Small hashes**: Increase `hash-max-listpack-entries` for cache workloads
- **Sorted sets**: Tune `zset-max-listpack-entries` vs range query needs

#### 2. Configure Memory Policies
```yaml
# Memory eviction
maxmemory: "4gb"
maxmemory-policy: "allkeys-lfu"  # or allkeys-lru, volatile-lru
maxmemory-samples: 10            # Higher = more accurate, slower

# Object encoding thresholds  
hash-max-listpack-entries: 512
hash-max-listpack-value: 64
list-max-listpack-size: -2      # 8KB
set-max-listpack-entries: 128
set-max-listpack-value: 64
zset-max-listpack-entries: 128
zset-max-listpack-value: 64

# Lazy freeing
lazyfree-lazy-eviction: yes
lazyfree-lazy-expire: yes
lazyfree-lazy-server-del: yes
```

#### 3. Monitor Memory Metrics
- **Fragmentation ratio**: Keep < 1.5
- **Dataset percentage**: Aim for > 60%
- **Peak memory**: Set alerts at 80% of maxmemory
- **CoW during saves**: Monitor for excessive growth
- **Client output buffers**: Watch for slow consumers

### 4. Memory-Efficient Key Naming
```
Good patterns:
  user:{id}:profile     # Hierarchical, predictable length
  sess:{session_id}     # Short prefixes
  cache:{hash_of_url}   # Fixed-length hashes

Poor patterns:
  user_profile_for_id_12345_with_details  # Long, verbose
  {timestamp}:{random}:{data}              # Unpredictable lengths
  really_long_descriptive_key_names       # Wastes memory
```

### 5. Workload-Specific Optimizations

#### High-Throughput Cache
```yaml
# Optimize for string operations
string-sharing: enabled
# Faster eviction
maxmemory-samples: 3
# Larger listpack thresholds (less fragmentation)
hash-max-listpack-entries: 1024
```

#### Session Store
```yaml
# TTL-focused eviction
maxmemory-policy: "volatile-lru"
# Compact session data
hash-max-listpack-entries: 256
hash-max-listpack-value: 128
```

#### Analytics/Counters
```yaml
# Frequency-based eviction
maxmemory-policy: "allkeys-lfu"
lfu-log-factor: 5
lfu-decay-time: 1
# Optimize for numeric data
set-max-intset-entries: 1024
```

## Conclusion

Effective memory management in Redis-style key-value stores requires understanding the interplay between data structure encodings, memory allocator behavior, and workload patterns. By tuning object encoding thresholds, choosing appropriate eviction policies, and monitoring key memory metrics, implementations can achieve both high performance and efficient memory utilization.

The single-threaded model simplifies memory management by eliminating concurrency issues, but requires careful attention to allocation patterns, fragmentation, and the impact of persistence operations on memory usage. Regular monitoring and workload-appropriate tuning ensure sustained performance as data scales.