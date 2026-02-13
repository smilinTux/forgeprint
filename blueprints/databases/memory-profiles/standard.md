# Standard Memory Profile for Relational Databases

## Overview
This document provides comprehensive memory management guidelines for relational database implementations. Efficient memory management is critical for achieving high query throughput, low latency, and supporting hundreds of concurrent connections while maintaining ACID guarantees and avoiding out-of-memory failures.

## Memory Architecture Principles

### 1. Shared vs Private Memory
Databases have a fundamental split between shared memory (visible to all connections) and private memory (per-connection/per-query).

```
┌──────────────────────────────────────────────────────────┐
│                    SHARED MEMORY                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Buffer Pool  │  │  WAL Buffers │  │  Lock Table  │   │
│  │  (largest)    │  │              │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Catalog Cache │  │ Plan Cache   │  │  MVCC State  │   │
│  │              │  │              │  │ (Active TXs) │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Connection 1 │  │ Connection 2 │  │ Connection N │
│  ┌─────────┐ │  │  ┌─────────┐ │  │  ┌─────────┐ │
│  │work_mem │ │  │  │work_mem │ │  │  │work_mem │ │
│  │sort/hash│ │  │  │sort/hash│ │  │  │sort/hash│ │
│  ├─────────┤ │  │  ├─────────┤ │  │  ├─────────┤ │
│  │parse buf│ │  │  │parse buf│ │  │  │parse buf│ │
│  ├─────────┤ │  │  ├─────────┤ │  │  ├─────────┤ │
│  │result   │ │  │  │result   │ │  │  │result   │ │
│  │buffer   │ │  │  │buffer   │ │  │  │buffer   │ │
│  └─────────┘ │  │  └─────────┘ │  │  └─────────┘ │
│  PRIVATE MEM │  │  PRIVATE MEM │  │  PRIVATE MEM │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 2. Memory Budget Model
```
Total Available Memory = Physical RAM - OS Reserved - Other Processes

Allocation:
  Buffer Pool:           ~50-75% of available memory
  WAL Buffers:           ~1-4% (or 64MB-256MB)
  Lock Table:            ~1-2%
  Catalog/Plan Cache:    ~2-5%
  Per-Connection Memory: ~5-20% (work_mem × max_connections)
  Maintenance Memory:    ~5-10% (VACUUM, index builds)
  OS Page Cache:         Remaining (used for double-buffering)
```

## Buffer Pool Management

### 1. Buffer Pool Architecture
The buffer pool is the largest shared memory component, caching data pages read from disk.

```rust
struct BufferPool {
    pages: Vec<BufferPage>,       // Pre-allocated page frames
    page_table: HashMap<PageId, FrameId>, // Page→Frame mapping
    frame_descriptors: Vec<FrameDescriptor>,
    free_list: VecDeque<FrameId>,
    clock_hand: AtomicUsize,      // For Clock-sweep eviction
    stats: BufferPoolStats,
}

struct BufferPage {
    data: [u8; PAGE_SIZE],        // 8KB or 16KB typically
}

struct FrameDescriptor {
    page_id: Option<PageId>,
    pin_count: AtomicU32,         // Number of active users
    dirty: AtomicBool,            // Modified since read from disk
    usage_count: AtomicU8,        // For Clock-sweep (recently used)
    last_access: AtomicU64,       // Timestamp for LRU
    io_in_progress: AtomicBool,   // Read/write in progress
}

const PAGE_SIZE: usize = 8192;   // 8KB (PostgreSQL default)
```

### 2. Page Eviction Strategies

#### Clock-Sweep Algorithm (PostgreSQL-style)
```rust
impl BufferPool {
    fn find_victim(&self) -> Option<FrameId> {
        let num_frames = self.frame_descriptors.len();
        let mut scanned = 0;
        
        loop {
            if scanned >= num_frames * 2 {
                return None; // No evictable frame found
            }
            
            let frame_id = self.clock_hand.fetch_add(1, Ordering::Relaxed) % num_frames;
            let desc = &self.frame_descriptors[frame_id];
            
            // Skip pinned frames
            if desc.pin_count.load(Ordering::Acquire) > 0 {
                scanned += 1;
                continue;
            }
            
            let usage = desc.usage_count.load(Ordering::Relaxed);
            if usage > 0 {
                // Decrement usage count and move on
                desc.usage_count.fetch_sub(1, Ordering::Relaxed);
                scanned += 1;
                continue;
            }
            
            // usage_count == 0 and not pinned → evict this frame
            return Some(frame_id);
        }
    }
    
    fn evict_page(&self, frame_id: FrameId) -> Result<(), EvictionError> {
        let desc = &self.frame_descriptors[frame_id];
        
        // If dirty, flush to disk first
        if desc.dirty.load(Ordering::Acquire) {
            self.flush_page(frame_id)?;
            desc.dirty.store(false, Ordering::Release);
        }
        
        // Remove from page table
        if let Some(page_id) = desc.page_id {
            self.page_table.remove(&page_id);
        }
        
        // Add to free list
        self.free_list.push_back(frame_id);
        Ok(())
    }
}
```

#### LRU-K Algorithm (For hot/cold separation)
```rust
struct LruKDescriptor {
    access_history: [Timestamp; K],  // Last K access timestamps
    history_count: usize,
}

impl LruKDescriptor {
    fn backward_k_distance(&self, now: Timestamp) -> u64 {
        if self.history_count < K {
            u64::MAX // Not enough history → treat as very old (correlated reference period)
        } else {
            now - self.access_history[0] // Distance to K-th most recent access
        }
    }
}

// Evict page with largest backward K-distance
// K=2 is common: distinguishes "accessed once" from "accessed repeatedly"
```

### 3. Buffer Pool Sizing
```rust
struct BufferPoolConfig {
    // Total size (should be 25-75% of RAM)
    total_size_bytes: usize,
    
    // Derived: number of page frames
    num_frames: usize, // total_size_bytes / PAGE_SIZE
    
    // Ring buffer sub-pools (optional optimization)
    bulk_read_ring_size: usize,      // For sequential scans (256KB-16MB)
    vacuum_ring_size: usize,         // For VACUUM operations (256KB)
    reuse_ring_size: usize,          // For bulk writes
    
    // Background writer
    bgwriter_lru_maxpages: usize,    // Pages per background write round
    bgwriter_lru_multiplier: f64,    // Aggressiveness of background writes
    bgwriter_delay_ms: u64,          // Delay between background write rounds
}

impl BufferPoolConfig {
    fn for_deployment_size(available_ram: usize) -> Self {
        let total = match available_ram {
            ..=4_GB => available_ram / 4,         // Small: 25% of RAM
            4_GB..=32_GB => available_ram / 4,    // Medium: 25% of RAM  
            32_GB..=256_GB => available_ram * 3/8, // Large: ~37% of RAM
            _ => 64_GB,                            // Cap at 64GB
        };
        
        BufferPoolConfig {
            total_size_bytes: total,
            num_frames: total / PAGE_SIZE,
            bulk_read_ring_size: 256 * 1024,    // 256KB
            vacuum_ring_size: 256 * 1024,
            reuse_ring_size: 8 * 1024 * 1024,   // 8MB
            bgwriter_lru_maxpages: 100,
            bgwriter_lru_multiplier: 2.0,
            bgwriter_delay_ms: 200,
        }
    }
}
```

### 4. Ring Buffers for Sequential Access
```rust
/// Small ring buffer that prevents sequential scans from evicting
/// frequently-accessed pages from the main buffer pool.
struct RingBuffer {
    frames: Vec<FrameId>,
    current: usize,
    size: usize,
}

impl RingBuffer {
    fn next_frame(&mut self) -> FrameId {
        let frame = self.frames[self.current];
        self.current = (self.current + 1) % self.size;
        frame
    }
}

// Usage: Large sequential scans get their own ring buffer
// so they cycle through a small set of pages instead of
// evicting the entire buffer pool.
```

## WAL Buffer Management

### 1. WAL Buffer Architecture
```rust
struct WalBufferManager {
    buffer: Box<[u8]>,              // Circular buffer
    buffer_size: usize,             // Typically 16MB-256MB
    write_position: AtomicU64,      // Next write position (LSN)
    flush_position: AtomicU64,      // Last fsynced position (LSN)
    insert_lock: Mutex<()>,         // Serializes WAL inserts (or use lock-free)
}

/// WAL Record format
struct WalRecord {
    lsn: u64,                       // Log Sequence Number
    tx_id: u64,                     // Transaction ID
    record_type: WalRecordType,     // INSERT, UPDATE, DELETE, COMMIT, etc.
    relation_id: u32,               // Table OID
    block_id: u32,                  // Page number
    offset: u16,                    // Offset within page
    data_length: u16,
    data: Vec<u8>,                  // Actual change data
    // For full-page writes (after checkpoint):
    full_page: Option<Box<[u8; PAGE_SIZE]>>,
}

enum WalRecordType {
    Insert,
    Update,
    Delete,
    Commit,
    Abort,
    Checkpoint,
    FullPageWrite,
    // ... more types
}
```

### 2. WAL Write Strategy
```rust
impl WalBufferManager {
    fn insert_record(&self, record: &WalRecord) -> u64 {
        let serialized = record.serialize();
        let record_size = serialized.len();
        
        // Reserve space in WAL buffer (atomic)
        let lsn = self.write_position.fetch_add(record_size as u64, Ordering::AcqRel);
        
        // Copy record into buffer
        let buf_offset = (lsn as usize) % self.buffer_size;
        self.buffer[buf_offset..buf_offset + record_size].copy_from_slice(&serialized);
        
        lsn
    }
    
    fn flush_to_disk(&self, up_to_lsn: u64) -> Result<(), IoError> {
        let current_flush = self.flush_position.load(Ordering::Acquire);
        if current_flush >= up_to_lsn {
            return Ok(()); // Already flushed
        }
        
        // Write WAL buffer contents to disk
        let start = (current_flush as usize) % self.buffer_size;
        let end = (up_to_lsn as usize) % self.buffer_size;
        
        self.wal_file.write_at(start, &self.buffer[start..end])?;
        self.wal_file.fsync()?; // Durability guarantee
        
        self.flush_position.store(up_to_lsn, Ordering::Release);
        Ok(())
    }
    
    // Called at COMMIT: ensure this transaction's WAL records are on disk
    fn flush_for_commit(&self, commit_lsn: u64) -> Result<(), IoError> {
        // Group commit optimization: wait briefly for other transactions
        // to accumulate their records, then flush once for all of them
        self.group_commit_wait(commit_lsn)?;
        self.flush_to_disk(commit_lsn)
    }
}
```

### 3. WAL Buffer Sizing
```yaml
wal_buffer_sizing:
  # Minimum: enough for typical transaction's WAL records
  minimum: "1MB"
  
  # Default: handles burst of concurrent commits
  default: "64MB"  # 16MB for small systems
  
  # Large: high write throughput systems
  large: "256MB"
  
  # Rule of thumb: 1/16 of shared_buffers, capped at 256MB
  formula: "min(shared_buffers / 16, 256MB)"
  
  # Too small: frequent WAL flushes, high fsync overhead
  # Too large: wasted memory, longer recovery replay
```

## Per-Connection Memory Management

### 1. Connection Memory Structure
```rust
struct ConnectionMemory {
    // Parser memory
    parse_buffer: Vec<u8>,         // SQL text buffer (~8KB initial)
    token_buffer: Vec<Token>,      // Lexer token output
    ast_arena: Arena,              // AST node allocation arena
    
    // Query execution memory
    work_mem: WorkMemAllocator,    // Sort/hash memory (configurable)
    result_buffer: ResultBuffer,    // Query result staging
    
    // Transaction state
    tx_state: TransactionState,    // Current TX metadata
    snapshot: Option<Snapshot>,     // MVCC visibility snapshot
    savepoints: Vec<Savepoint>,    // Savepoint stack
    lock_list: Vec<LockEntry>,     // Locks held by this connection
    
    // Catalog cache (per-connection)
    catalog_cache: CatalogCache,   // Resolved table/column metadata
    plan_cache: PlanCache,         // Prepared statement plans
    
    // Communication buffers
    recv_buffer: BytesMut,         // Network receive buffer (8KB)
    send_buffer: BytesMut,         // Network send buffer (8KB)
}
```

### 2. Work Memory (Sort/Hash Operations)
```rust
struct WorkMemAllocator {
    max_bytes: usize,              // Configurable per-query limit (e.g., 64MB)
    allocated: usize,
    regions: Vec<MemoryRegion>,
}

impl WorkMemAllocator {
    fn allocate(&mut self, size: usize) -> Result<*mut u8, OutOfMemory> {
        if self.allocated + size > self.max_bytes {
            return Err(OutOfMemory::WorkMemExceeded);
        }
        
        let region = MemoryRegion::allocate(size)?;
        let ptr = region.as_mut_ptr();
        self.allocated += size;
        self.regions.push(region);
        Ok(ptr)
    }
    
    // Called when sort/hash spills to disk
    fn spill_to_disk(&mut self) -> Result<TempFile, IoError> {
        // Release memory, write intermediate results to temp file
        let temp = TempFile::create()?;
        // ... write data to temp file ...
        self.release_all();
        Ok(temp)
    }
    
    fn release_all(&mut self) {
        self.regions.clear();
        self.allocated = 0;
    }
}

// Sort memory usage decision:
// If data fits in work_mem → in-memory quicksort
// If data exceeds work_mem → external merge sort (disk)
impl SortExecutor {
    fn execute(&mut self, work_mem: &mut WorkMemAllocator) -> Result<(), Error> {
        let estimated_size = self.estimate_memory_needed();
        
        if estimated_size <= work_mem.max_bytes {
            self.in_memory_sort(work_mem)
        } else {
            self.external_sort(work_mem) // Uses temp files
        }
    }
}

// Hash join memory usage:
// Build side must fit in work_mem for in-memory hash join
// Otherwise: Grace hash join (partitioned, disk-based)
impl HashJoinExecutor {
    fn execute(&mut self, work_mem: &mut WorkMemAllocator) -> Result<(), Error> {
        let build_size = self.estimate_build_side_size();
        
        if build_size <= work_mem.max_bytes {
            self.in_memory_hash_join(work_mem)
        } else {
            let num_partitions = (build_size / work_mem.max_bytes) + 1;
            self.grace_hash_join(work_mem, num_partitions)
        }
    }
}
```

### 3. Connection Memory Sizing Guidelines
```yaml
connection_memory_guidelines:
  # Per-connection base overhead (without query execution)
  base_overhead:
    small: "~2MB"     # Parser, buffers, catalog cache
    typical: "~5MB"   # With some cached plans
    heavy: "~10MB"    # Many prepared statements, large catalog

  # work_mem: per-sort/hash-operation limit
  work_mem:
    oltp: "4MB-64MB"   # Small result sets, many connections
    olap: "256MB-4GB"  # Large sorts/joins, few connections
    rule: "Available RAM / (max_connections × expected_parallel_operations)"
    
  # maintenance_work_mem: for VACUUM, CREATE INDEX, ALTER TABLE
  maintenance_work_mem:
    default: "256MB"
    large: "1GB-4GB"   # For large table maintenance
    
  # Total connection memory budget
  total:
    formula: "max_connections × (base_overhead + work_mem)"
    example: "200 connections × (5MB + 64MB) = ~14GB"
    warning: "Must leave room for buffer pool and OS"
```

## Lock Table Memory

### 1. Lock Table Structure
```rust
struct LockTable {
    // Hash table: lock target → lock entry
    lock_entries: DashMap<LockTarget, LockEntry>,
    
    // Wait-for graph for deadlock detection
    wait_graph: RwLock<WaitForGraph>,
    
    // Pre-allocated lock entry pool
    entry_pool: ObjectPool<LockEntry>,
}

struct LockTarget {
    relation_id: u32,       // Table OID
    block_id: u32,          // Page number
    tuple_offset: u16,      // Row offset within page
    lock_level: LockLevel,  // ROW_SHARE, ROW_EXCLUSIVE, etc.
}

struct LockEntry {
    holders: SmallVec<[LockHolder; 4]>,  // Usually few holders
    waiters: VecDeque<LockWaiter>,
    lock_mode: LockMode,
}

enum LockMode {
    AccessShare,         // SELECT
    RowShare,            // SELECT FOR UPDATE
    RowExclusive,        // INSERT, UPDATE, DELETE
    ShareUpdateExclusive,// VACUUM, CREATE INDEX CONCURRENTLY
    Share,               // CREATE INDEX
    ShareRowExclusive,   // -
    Exclusive,           // -
    AccessExclusive,     // ALTER TABLE, DROP TABLE
}
```

### 2. Lock Memory Sizing
```yaml
lock_table_sizing:
  # Per-lock overhead: ~200-400 bytes
  per_lock_bytes: 300
  
  # Typical lock counts:
  read_only_query: 1-5           # Table-level access share locks
  simple_update: 2-10            # Table + row locks
  complex_transaction: 10-100    # Multiple tables, rows
  
  # Total memory: max_locks × per_lock_bytes
  # max_locks depends on max_connections × avg_locks_per_tx
  default_max_locks: 64_000      # ~19MB
  large_system: 256_000          # ~75MB
```

## Catalog and Plan Cache Memory

### 1. Catalog Cache
```rust
struct CatalogCache {
    // Table metadata cache
    tables: LruCache<Oid, Arc<TableDef>>,
    
    // Column metadata (per table)
    columns: LruCache<Oid, Arc<Vec<ColumnDef>>>,
    
    // Index metadata
    indexes: LruCache<Oid, Arc<IndexDef>>,
    
    // Type metadata
    types: LruCache<Oid, Arc<TypeDef>>,
    
    // Statistics cache (for optimizer)
    statistics: LruCache<(Oid, AttNum), Arc<ColumnStatistics>>,
    
    // Invalidation tracking
    invalidation_counter: AtomicU64,
}

// Typical sizes:
// - TableDef: ~500 bytes per table
// - ColumnDef: ~100 bytes per column
// - IndexDef: ~200 bytes per index
// - Statistics: ~1KB per column (histograms, MCV lists)
```

### 2. Plan Cache (Prepared Statements)
```rust
struct PlanCache {
    // Query string hash → cached plan
    plans: LruCache<u64, Arc<CachedPlan>>,
    max_memory_bytes: usize,
    current_memory_bytes: AtomicUsize,
}

struct CachedPlan {
    query_hash: u64,
    plan_tree: Box<PlanNode>,          // Physical plan tree
    param_types: Vec<TypeId>,          // Parameter types
    creation_time: Timestamp,
    use_count: AtomicU64,
    estimated_cost: f64,
    memory_usage: usize,              // Self-reported memory
    is_generic: bool,                  // Generic vs custom plan
}

impl PlanCache {
    fn get_or_plan(&mut self, query: &str, params: &[Datum]) -> Arc<CachedPlan> {
        let hash = hash_query(query);
        
        if let Some(plan) = self.plans.get(&hash) {
            plan.use_count.fetch_add(1, Ordering::Relaxed);
            
            // After 5 uses, check if custom plan is better
            if plan.use_count.load(Ordering::Relaxed) > 5 && !plan.is_generic {
                // Consider switching to generic plan
            }
            
            return plan.clone();
        }
        
        // Plan not cached, create new plan
        let new_plan = self.create_plan(query, params);
        self.insert(hash, new_plan.clone());
        new_plan
    }
    
    fn insert(&mut self, hash: u64, plan: Arc<CachedPlan>) {
        // Evict old plans if memory limit exceeded
        while self.current_memory_bytes.load(Ordering::Relaxed) + plan.memory_usage > self.max_memory_bytes {
            if let Some(evicted) = self.plans.pop_lru() {
                self.current_memory_bytes.fetch_sub(evicted.memory_usage, Ordering::Relaxed);
            } else {
                break;
            }
        }
        
        self.current_memory_bytes.fetch_add(plan.memory_usage, Ordering::Relaxed);
        self.plans.put(hash, plan);
    }
}
```

## MVCC Memory Management

### 1. Transaction State Tracking
```rust
struct TransactionManager {
    // Active transaction list (for snapshot generation)
    active_transactions: RwLock<BTreeSet<TransactionId>>,
    
    // Transaction metadata
    tx_metadata: DashMap<TransactionId, TransactionMetadata>,
    
    // Commit log (CLOG): 2 bits per transaction
    // States: IN_PROGRESS, COMMITTED, ABORTED, SUB_COMMITTED
    commit_log: CommitLog,
}

struct CommitLog {
    // Each page stores status of 16K transactions (2 bits each = 4KB page)
    pages: Vec<[u8; 4096]>,
    // Total memory: ~250KB per 1M transactions
}

struct TransactionMetadata {
    tx_id: TransactionId,
    start_time: Timestamp,
    isolation_level: IsolationLevel,
    snapshot: Snapshot,
    status: TxStatus,
}

struct Snapshot {
    xmin: TransactionId,              // Oldest active TX at snapshot time
    xmax: TransactionId,              // First unassigned TX ID at snapshot time
    active_tx_ids: Vec<TransactionId>, // Active TXs between xmin and xmax
    // Memory: ~8 bytes per concurrent transaction
}
```

### 2. Undo/Rollback Memory
```rust
// For in-place update engines (MySQL/InnoDB style)
struct UndoLog {
    segments: Vec<UndoSegment>,
    free_segments: VecDeque<usize>,
}

struct UndoSegment {
    data: Box<[u8; UNDO_SEGMENT_SIZE]>,  // Typically 1MB
    write_position: usize,
    oldest_tx: TransactionId,
}

// Memory sizing:
// - Each UPDATE generates undo record: ~row_size + 40 bytes overhead
// - Long transactions hold undo segments longer
// - Total undo memory: depends on write rate × transaction duration
```

## Temporary File / Spill Memory

### 1. Temp File Management
```rust
struct TempFileManager {
    temp_directory: PathBuf,
    active_files: Mutex<HashMap<TempFileId, TempFileInfo>>,
    total_bytes_on_disk: AtomicU64,
    max_temp_disk_bytes: u64,     // Limit total temp disk usage
}

struct TempFileInfo {
    path: PathBuf,
    size: u64,
    owning_query: QueryId,
    created_at: Timestamp,
}

// Temp files are used when:
// - Sort exceeds work_mem → external merge sort
// - Hash join exceeds work_mem → Grace hash join partitions
// - Materialized CTEs too large for memory
// - Large query results that can't be sent immediately
```

## Memory Monitoring and Diagnostics

### 1. Memory Usage Tracking
```rust
struct MemoryStats {
    // Shared memory components
    buffer_pool_total: usize,
    buffer_pool_used: usize,
    buffer_pool_dirty: usize,
    wal_buffer_total: usize,
    wal_buffer_used: usize,
    lock_table_size: usize,
    catalog_cache_size: usize,
    plan_cache_size: usize,
    
    // Aggregate per-connection memory
    total_connection_memory: usize,
    total_work_mem_allocated: usize,
    
    // Temp file usage
    temp_files_count: usize,
    temp_files_bytes: usize,
    
    // MVCC overhead
    active_transactions: usize,
    dead_tuples_estimate: usize,
    undo_log_size: usize,
}

impl MemoryStats {
    fn collect(&self) -> MemoryReport {
        MemoryReport {
            total_shared: self.buffer_pool_total + self.wal_buffer_total + self.lock_table_size 
                        + self.catalog_cache_size + self.plan_cache_size,
            total_private: self.total_connection_memory,
            buffer_pool_hit_ratio: self.buffer_pool_hits as f64 / self.buffer_pool_requests as f64,
            buffer_pool_dirty_ratio: self.buffer_pool_dirty as f64 / self.buffer_pool_used as f64,
            temp_file_usage: self.temp_files_bytes,
        }
    }
}
```

### 2. Memory Pressure Detection
```rust
struct MemoryPressureMonitor {
    warning_threshold: f64,         // 80% of max
    critical_threshold: f64,        // 95% of max
    oom_kill_threshold: f64,        // 98% of max
}

impl MemoryPressureMonitor {
    fn check_pressure(&self, stats: &MemoryStats) -> MemoryPressureLevel {
        let total_used = stats.total_shared + stats.total_private;
        let total_available = get_available_memory();
        let usage_ratio = total_used as f64 / total_available as f64;
        
        match usage_ratio {
            r if r < self.warning_threshold => MemoryPressureLevel::Normal,
            r if r < self.critical_threshold => {
                // Start shedding: evict plan cache, reduce buffer pool dirty pages
                MemoryPressureLevel::Warning
            },
            r if r < self.oom_kill_threshold => {
                // Aggressive shedding: cancel large queries, reject new connections
                MemoryPressureLevel::Critical
            },
            _ => MemoryPressureLevel::OomRisk,
        }
    }
    
    fn take_action(&self, level: MemoryPressureLevel) {
        match level {
            MemoryPressureLevel::Warning => {
                // Flush dirty buffers more aggressively
                // Evict cold entries from plan cache
                // Log warning
            },
            MemoryPressureLevel::Critical => {
                // Cancel queries using most work_mem
                // Reject new connections temporarily
                // Force checkpoint to reduce dirty pages
            },
            MemoryPressureLevel::OomRisk => {
                // Kill longest-running queries
                // Force all temp files to disk
                // Emergency checkpoint
            },
            _ => {}
        }
    }
}
```

## Memory Configuration Guidelines

### 1. Sizing Recommendations by Deployment

#### Small Deployment (< 4GB RAM, < 50 connections)
```yaml
memory_config:
  shared_buffers: "1GB"           # 25% of 4GB
  wal_buffers: "16MB"
  work_mem: "8MB"                 # 50 × 8MB = 400MB headroom
  maintenance_work_mem: "128MB"
  effective_cache_size: "3GB"     # Total expected cache (buffers + OS)
  max_connections: 50
  
  # Total memory budget:
  # Shared: 1GB + 16MB + ~20MB (locks/catalog) ≈ 1GB
  # Private: 50 × (5MB base + 8MB work) ≈ 650MB  
  # OS + overhead: ~2.3GB
  # Total: ~4GB ✓
```

#### Medium Deployment (16GB RAM, 200 connections)
```yaml
memory_config:
  shared_buffers: "4GB"           # 25% of 16GB
  wal_buffers: "64MB"
  work_mem: "32MB"
  maintenance_work_mem: "512MB"
  effective_cache_size: "12GB"
  max_connections: 200
  
  # Budget:
  # Shared: 4GB + 64MB + ~50MB ≈ 4.1GB
  # Private: 200 × (5MB + 32MB) ≈ 7.4GB (worst case, not all concurrent)
  # OS: ~4.5GB
  # Total: ~16GB ✓
```

#### Large Deployment (64GB RAM, 500 connections)
```yaml
memory_config:
  shared_buffers: "16GB"          # 25% of 64GB
  wal_buffers: "256MB"
  work_mem: "64MB"
  maintenance_work_mem: "2GB"
  effective_cache_size: "48GB"
  max_connections: 500
  
  # Budget:
  # Shared: 16GB + 256MB + ~100MB ≈ 16.4GB
  # Private: 500 × (5MB + 64MB) ≈ 34GB (worst case)
  # OS: ~13.6GB
  # Total: ~64GB ✓
  # Note: Use connection pooler to limit actual concurrent queries
```

### 2. Tuning Parameters
```yaml
memory_tuning:
  # Buffer pool tuning
  bgwriter_delay: "200ms"         # Background writer frequency
  bgwriter_lru_maxpages: 100      # Pages per round
  checkpoint_completion_target: 0.9 # Spread checkpoint I/O
  
  # Work memory tuning
  hash_mem_multiplier: 2.0        # Hash ops get 2x work_mem
  
  # MVCC tuning
  autovacuum_work_mem: "256MB"    # Separate from maintenance_work_mem
  max_dead_tuples_before_vacuum: 100000
  
  # Temp file limits
  temp_file_limit: "10GB"         # Per-query temp disk limit
  
  # Plan cache
  plan_cache_max_memory: "256MB"  # Per-connection plan cache
  plan_cache_eviction: "lru"
```

### 3. Memory Allocation Anti-Patterns

```markdown
## Common Mistakes to Avoid

1. **Setting shared_buffers too high (> 50% of RAM)**
   - Leaves too little for OS page cache and connection memory
   - OS page cache is needed for double-buffering

2. **Setting work_mem too high with many connections**
   - work_mem × max_connections can exceed RAM
   - Each sort/hash operation in a query gets its own work_mem
   - Complex queries may use 5-10× work_mem simultaneously

3. **Not accounting for maintenance_work_mem**
   - VACUUM and CREATE INDEX can use large amounts
   - Running multiple concurrent autovacuum workers compounds this

4. **Ignoring temp_file_limit**
   - Runaway queries can fill disk with temp files
   - Set reasonable limits to prevent disk exhaustion

5. **Forgetting connection pooling**
   - 1000 idle connections × 5MB each = 5GB wasted
   - Use pgbouncer/connection pooler to limit to actual concurrent queries
```

## Performance Optimizations

### 1. Huge Pages
```rust
// Use huge pages (2MB instead of 4KB) to reduce TLB misses
// Critical for large buffer pools
struct HugePageAllocator;

impl HugePageAllocator {
    fn allocate_buffer_pool(size: usize) -> Result<*mut u8, AllocError> {
        let ptr = unsafe {
            libc::mmap(
                std::ptr::null_mut(),
                size,
                libc::PROT_READ | libc::PROT_WRITE,
                libc::MAP_PRIVATE | libc::MAP_ANONYMOUS | libc::MAP_HUGETLB,
                -1,
                0,
            )
        };
        
        if ptr == libc::MAP_FAILED {
            Err(AllocError::HugePagesNotAvailable)
        } else {
            Ok(ptr as *mut u8)
        }
    }
}

// System setup for huge pages:
// echo 8192 > /proc/sys/vm/nr_hugepages  (for 16GB buffer pool)
```

### 2. NUMA-Aware Allocation
```rust
struct NumaAwareBufferPool {
    // Allocate buffer pool on the NUMA node where the I/O device is attached
    // This reduces cross-NUMA memory access latency
    
    node_pools: Vec<NodeBufferPool>,
}

impl NumaAwareBufferPool {
    fn get_page_for_connection(&self, connection: &Connection) -> &BufferPage {
        let numa_node = connection.cpu_affinity().numa_node();
        self.node_pools[numa_node].get_page()
    }
}
```

### 3. Memory-Mapped I/O (Alternative to Buffer Pool)
```rust
// Some databases (SQLite, LMDB) use mmap instead of explicit buffer pool
// Pros: OS manages caching, simpler code
// Cons: Less control over eviction, fsync complexity, no async I/O

struct MmapStorage {
    mapping: *mut u8,
    file_size: usize,
}

impl MmapStorage {
    fn open(path: &Path) -> Result<Self, IoError> {
        let file = File::open(path)?;
        let size = file.metadata()?.len() as usize;
        let ptr = unsafe {
            libc::mmap(
                std::ptr::null_mut(), size,
                libc::PROT_READ | libc::PROT_WRITE,
                libc::MAP_SHARED, file.as_raw_fd(), 0,
            ) as *mut u8
        };
        Ok(MmapStorage { mapping: ptr, file_size: size })
    }
    
    fn get_page(&self, page_id: u32) -> &[u8] {
        let offset = page_id as usize * PAGE_SIZE;
        unsafe { std::slice::from_raw_parts(self.mapping.add(offset), PAGE_SIZE) }
    }
}
```

This memory profile provides the foundation for implementing memory-efficient, high-performance relational databases that can handle hundreds of concurrent connections while maintaining ACID guarantees and predictable query performance.
