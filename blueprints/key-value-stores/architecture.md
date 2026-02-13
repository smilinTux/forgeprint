# Key-Value Store Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing a production-grade Redis/Valkey-compatible key-value store. It covers the single-threaded event loop model, memory management, persistence mechanisms, replication protocol, cluster architecture, and performance optimization strategies.

## Architectural Foundations

### 1. Core Architecture: Single-Threaded Event Loop

The defining architectural choice of Redis-style key-value stores is the single-threaded command execution model. All data structure operations execute on a single thread, eliminating locks, race conditions, and concurrent access complexity. This guarantees atomic execution of every command without explicit synchronization.

#### Event Loop Implementation
```rust
struct EventLoop {
    epoll_fd: i32,
    listen_fds: Vec<i32>,
    clients: HashMap<i32, Client>,
    timer_events: BinaryHeap<TimerEvent>,
    before_sleep_callbacks: Vec<Box<dyn Fn(&mut Server)>>,
    after_sleep_callbacks: Vec<Box<dyn Fn(&mut Server)>>,
}

impl EventLoop {
    fn run(&mut self, server: &mut Server) -> Result<(), EventLoopError> {
        loop {
            // Before sleep: flush AOF, flush client output buffers,
            // handle blocked clients, process pending writes
            for callback in &self.before_sleep_callbacks {
                callback(server);
            }

            // Calculate timeout from nearest timer event
            let timeout_ms = self.nearest_timer_timeout();

            // Wait for I/O events
            let events = epoll_wait(self.epoll_fd, &mut self.event_buffer, timeout_ms)?;

            // After sleep: process any post-wait callbacks
            for callback in &self.after_sleep_callbacks {
                callback(server);
            }

            // Process I/O events
            for event in &events[..] {
                let fd = event.data as i32;
                if self.listen_fds.contains(&fd) {
                    self.accept_new_client(fd, server)?;
                } else {
                    if event.is_readable() {
                        self.handle_client_read(fd, server)?;
                    }
                    if event.is_writable() {
                        self.handle_client_write(fd, server)?;
                    }
                }
            }

            // Process expired timer events (cron jobs)
            self.process_timer_events(server);
        }
    }
}
```

#### Server Cron (Periodic Tasks)
The server cron runs at configurable frequency (default: 10 Hz = every 100ms):

```rust
struct ServerCron {
    hz: u32,  // Frequency in Hz (default 10, max 500)
}

impl ServerCron {
    fn run(&self, server: &mut Server) {
        // 1. Update cached time (avoid syscalls)
        server.update_cached_time();

        // 2. Active key expiry (sample and delete expired keys)
        self.active_expire_cycle(server);

        // 3. Handle background child processes
        //    - Check if RDB save child completed
        //    - Check if AOF rewrite child completed
        self.check_child_processes(server);

        // 4. Replication cron
        //    - Send heartbeats to replicas (REPLCONF ACK)
        //    - Handle timed-out replicas
        //    - Start pending replication if needed
        self.replication_cron(server);

        // 5. Cluster cron (if cluster enabled)
        //    - Send PING to random nodes
        //    - Check for node failures
        //    - Handle slot migration
        self.cluster_cron(server);

        // 6. Resize hash tables if needed
        self.resize_databases(server);

        // 7. Incremental rehashing (1ms budget per call)
        self.incremental_rehash(server);

        // 8. Client timeout check
        self.check_client_timeouts(server);

        // 9. AOF flush if needed
        self.aof_flush_if_needed(server);

        // 10. Memory usage check and eviction
        self.check_memory_and_evict(server);

        // 11. Latency monitoring samples
        self.collect_latency_samples(server);
    }
}
```

#### Active Expiry Algorithm
```rust
impl ServerCron {
    fn active_expire_cycle(&self, server: &mut Server) {
        // Called 10 times/sec by default (server.hz)
        // Time budget: 25% of 1000/hz milliseconds = 25ms at hz=10
        let time_limit_us = 1_000_000 / self.hz as u64 / 4;
        let start = Instant::now();

        for db in &mut server.databases {
            if db.expires.is_empty() { continue; }

            loop {
                // Sample 20 keys with TTL
                let sample_size = 20.min(db.expires.len());
                let mut expired_count = 0;

                for _ in 0..sample_size {
                    if let Some((key, expire_at)) = db.expires.random_entry() {
                        if server.mstime() > expire_at {
                            db.delete_key(&key);
                            expired_count += 1;
                            server.propagate_expire(&key);
                        }
                    }
                }

                // If < 25% of sampled keys were expired, stop
                // (database is mostly not expired)
                if expired_count < sample_size / 4 {
                    break;
                }

                // Check time budget
                if start.elapsed().as_micros() as u64 > time_limit_us {
                    break;
                }
            }
        }
    }
}
```

### 2. I/O Threading Model (Redis 6.0+)

While command execution remains single-threaded, I/O operations (reading requests and writing responses) can be parallelized across multiple threads.

```rust
struct IoThreadManager {
    threads: Vec<IoThread>,
    pending_reads: Vec<Vec<ClientId>>,   // Per-thread read queues
    pending_writes: Vec<Vec<ClientId>>,  // Per-thread write queues
    num_threads: usize,
    do_reads: bool,  // Whether to thread reads too
}

struct IoThread {
    id: usize,
    thread: JoinHandle<()>,
    pending: Arc<AtomicI32>,  // Number of pending operations
}

impl IoThreadManager {
    fn distribute_reads(&mut self, clients: &[ClientId]) {
        // Round-robin distribute clients to I/O threads
        for (i, client_id) in clients.iter().enumerate() {
            let thread_idx = i % self.num_threads;
            if thread_idx == 0 {
                // Thread 0 is always the main thread
                self.main_thread_read(*client_id);
            } else {
                self.pending_reads[thread_idx].push(*client_id);
            }
        }

        // Signal I/O threads to start reading
        for thread in &self.threads[1..] {
            thread.pending.store(
                self.pending_reads[thread.id].len() as i32,
                Ordering::Release
            );
        }

        // Main thread processes its share
        self.process_main_thread_reads();

        // Wait for all I/O threads to finish
        self.wait_for_io_threads();
    }

    fn distribute_writes(&mut self, clients: &[ClientId]) {
        // Similar distribution for write operations
        // After main thread executes commands, responses are
        // written back by I/O threads in parallel
    }
}
```

**I/O Thread Flow**:
```
1. Main thread reads from all clients (or I/O threads read)
2. Main thread parses all commands
3. Main thread executes ALL commands sequentially (single-threaded!)
4. Main thread distributes responses to I/O threads
5. I/O threads write responses to clients in parallel
6. Main thread waits for all writes to complete
7. Repeat
```

### 3. Memory Allocator Architecture

#### jemalloc Integration (Default)
```rust
struct MemoryAllocator {
    allocator: JemallocAllocator,
    used_memory: AtomicU64,
    peak_memory: AtomicU64,
    fragmentation_ratio: AtomicF64,
}

impl MemoryAllocator {
    fn allocate(&self, size: usize) -> *mut u8 {
        let ptr = self.allocator.malloc(size);
        if !ptr.is_null() {
            let actual_size = self.allocator.malloc_usable_size(ptr);
            self.used_memory.fetch_add(actual_size as u64, Ordering::Relaxed);
            self.update_peak();
        }
        ptr
    }

    fn deallocate(&self, ptr: *mut u8) {
        if !ptr.is_null() {
            let actual_size = self.allocator.malloc_usable_size(ptr);
            self.used_memory.fetch_sub(actual_size as u64, Ordering::Relaxed);
            self.allocator.free(ptr);
        }
    }

    fn fragmentation_ratio(&self) -> f64 {
        // RSS (actual resident memory) / used_memory (logical)
        let rss = self.get_rss();
        let used = self.used_memory.load(Ordering::Relaxed);
        if used == 0 { return 1.0; }
        rss as f64 / used as f64
    }

    fn memory_stats(&self) -> MemoryStats {
        MemoryStats {
            used_memory: self.used_memory.load(Ordering::Relaxed),
            used_memory_rss: self.get_rss(),
            peak_memory: self.peak_memory.load(Ordering::Relaxed),
            fragmentation_ratio: self.fragmentation_ratio(),
            allocator_allocated: self.allocator.stats_allocated(),
            allocator_active: self.allocator.stats_active(),
            allocator_resident: self.allocator.stats_resident(),
        }
    }
}
```

#### jemalloc Arena Configuration
```
jemalloc properties:
  - Arena-based allocation: reduces contention, locality-aware
  - Thread-local caches (tcache): fast small allocations
  - Size classes: small (8B-14KB), large (16KB-4MB), huge (>4MB)
  - Background thread purging of unused dirty pages
  - Redis uses single arena for main thread (no multi-thread contention)
  - Fragmentation generally 1.0-1.5x (healthy < 1.5)
```

### 4. Data Structure Internals

#### SDS (Simple Dynamic String)
The foundational string type, optimizing for binary safety and minimal overhead.

```rust
// SDS header variants (different sizes for length fields)
#[repr(C)]
struct SdsHdr8 {
    len: u8,         // Used length
    alloc: u8,       // Allocated length (excluding header and null terminator)
    flags: u8,       // 3 LSB = type, 5 MSB = unused
    buf: [u8; 0],    // Flexible array member
}

#[repr(C)]
struct SdsHdr16 {
    len: u16,
    alloc: u16,
    flags: u8,
    buf: [u8; 0],
}

#[repr(C)]
struct SdsHdr32 {
    len: u32,
    alloc: u32,
    flags: u8,
    buf: [u8; 0],
}

#[repr(C)]
struct SdsHdr64 {
    len: u64,
    alloc: u64,
    flags: u8,
    buf: [u8; 0],
}

// SDS type selection based on string length
fn sds_type(string_size: usize) -> SdsType {
    match string_size {
        0..=255 => SdsType::SDS_TYPE_8,
        256..=65535 => SdsType::SDS_TYPE_16,
        65536..=4294967295 => SdsType::SDS_TYPE_32,
        _ => SdsType::SDS_TYPE_64,
    }
}

impl SDS {
    fn new(data: &[u8]) -> SDS {
        let sds_type = sds_type(data.len());
        let header_size = sds_type.header_size();
        // Allocate header + data + null terminator in one allocation
        let total = header_size + data.len() + 1;
        let ptr = allocate(total);
        // Write header, copy data, add null terminator
        // Return pointer to buf (not header!) — SDS pointer math
        SDS { ptr: ptr.add(header_size) }
    }

    fn available_space(&self) -> usize {
        self.alloc() - self.len()
    }

    fn make_room_for(&mut self, addlen: usize) {
        let avail = self.available_space();
        if avail >= addlen { return; }

        let new_len = self.len() + addlen;
        // Growth policy: double up to 1MB, then grow by 1MB
        let new_alloc = if new_len < 1_048_576 {
            new_len * 2
        } else {
            new_len + 1_048_576
        };
        self.realloc(new_alloc);
    }
}
```

**Embedded String Optimization (embstr)**:
```
Regular string: two allocations
  [RedisObject] → [SdsHdr + data]

Embedded string (≤44 bytes): single allocation
  [RedisObject | SdsHdr8 | data (≤44 bytes) | \0]
  Total: 16 (robj) + 3 (sdshdr8) + 44 + 1 = 64 bytes (fits jemalloc size class)
```

#### Dict (Hash Table)
The core hash table powering the keyspace, sets, sorted sets, and hashes.

```rust
struct Dict {
    tables: [HashTable; 2],  // ht[0] = main, ht[1] = rehash target
    rehash_idx: i64,         // -1 if not rehashing
    iterators: u32,          // Active iterators (prevent rehash)
    type_fns: &'static DictType,
}

struct HashTable {
    table: Vec<Option<Box<DictEntry>>>,
    size: usize,          // Always power of 2
    size_mask: usize,     // size - 1 (for fast modulo via bitwise AND)
    used: usize,          // Number of entries
}

struct DictEntry {
    key: *mut u8,
    value: DictValue,
    next: Option<Box<DictEntry>>,  // Chaining for collisions
}

// Hash function: SipHash (Redis 4.0+, defense against hash flooding)
fn dict_hash_key(key: &[u8]) -> u64 {
    siphash_2_4(key, &HASH_SEED)
}

impl Dict {
    // Incremental rehashing — called from serverCron and during lookups
    fn rehash_step(&mut self) {
        if self.rehash_idx < 0 { return; }

        // Move entries from ht[0] to ht[1], one bucket at a time
        let mut empty_visits = 10; // Skip at most 10 empty buckets

        while empty_visits > 0 {
            if self.rehash_idx as usize >= self.tables[0].size {
                // Rehashing complete
                self.tables[0] = std::mem::take(&mut self.tables[1]);
                self.rehash_idx = -1;
                return;
            }

            if self.tables[0].table[self.rehash_idx as usize].is_none() {
                self.rehash_idx += 1;
                empty_visits -= 1;
                continue;
            }

            // Move all entries in this bucket to ht[1]
            let mut entry = self.tables[0].table[self.rehash_idx as usize].take();
            while let Some(mut node) = entry {
                entry = node.next.take();
                let hash = dict_hash_key(node.key_bytes());
                let idx = hash as usize & self.tables[1].size_mask;
                node.next = self.tables[1].table[idx].take();
                self.tables[1].table[idx] = Some(node);
                self.tables[0].used -= 1;
                self.tables[1].used += 1;
            }

            self.rehash_idx += 1;
            return; // One bucket per step
        }
    }

    // Expand when load factor > 1 (or > 5 during BGSAVE)
    fn expand_if_needed(&mut self) {
        if self.is_rehashing() { return; }

        let load_factor = self.tables[0].used as f64 / self.tables[0].size as f64;
        let threshold = if self.has_active_child_process() { 5.0 } else { 1.0 };

        if load_factor > threshold {
            let new_size = next_power_of_2(self.tables[0].used * 2);
            self.tables[1] = HashTable::new(new_size);
            self.rehash_idx = 0;
        }
    }
}
```

#### Listpack (Compact Encoding)
Replacement for ziplist (Redis 7.0+), used for small lists, sets, hashes, sorted sets, and streams.

```rust
// Listpack is a contiguous byte array:
// <total_bytes> <num_elements> [entry1] [entry2] ... <end_marker>
//   4 bytes       2 bytes        var      var          1 byte (0xFF)
//
// Each entry:
// <encoding> <data> <backlen>
//   1-9 bytes  var    1-5 bytes (length of encoding+data, for backward traversal)

struct Listpack {
    data: Vec<u8>,
}

impl Listpack {
    fn num_elements(&self) -> u16 {
        u16::from_le_bytes([self.data[4], self.data[5]])
    }

    fn total_bytes(&self) -> u32 {
        u32::from_le_bytes([self.data[0], self.data[1], self.data[2], self.data[3]])
    }

    // Encoding types:
    // 0xxxxxxx                    → 7-bit unsigned integer (0-127)
    // 110xxxxx yyyyyyyy           → 13-bit signed integer
    // 11110001 <8 bytes>          → 64-bit signed integer
    // 10xxxxxx <data>             → string with 6-bit length (0-63 bytes)
    // 1110xxxx xxxxxxxx <data>    → string with 12-bit length
    // 11110000 <4 bytes> <data>   → string with 32-bit length
}
```

**Conversion Thresholds (configurable)**:
```
list-max-listpack-size 128      # Max entries in listpack node
hash-max-listpack-entries 128   # Convert hash to hashtable above this
hash-max-listpack-value 64      # Convert hash if any value exceeds this
set-max-listpack-entries 128    # Convert set to hashtable above this
zset-max-listpack-entries 128   # Convert zset to skiplist above this
zset-max-listpack-value 64      # Convert zset if any element exceeds this
```

#### Skip List (Sorted Set)
```rust
const SKIPLIST_MAXLEVEL: usize = 32;
const SKIPLIST_P: f64 = 0.25;  // Probability of level promotion

struct SkipList {
    header: Box<SkipListNode>,
    tail: *mut SkipListNode,
    length: u64,
    level: usize,  // Current max level in use
}

struct SkipListNode {
    element: SDS,
    score: f64,
    backward: *mut SkipListNode,  // For reverse traversal
    levels: Vec<SkipListLevel>,
}

struct SkipListLevel {
    forward: *mut SkipListNode,
    span: u64,  // Number of nodes between this and forward (for ZRANK)
}

impl SkipList {
    fn random_level(&self) -> usize {
        let mut level = 1;
        while rand::random::<f64>() < SKIPLIST_P && level < SKIPLIST_MAXLEVEL {
            level += 1;
        }
        level
    }

    fn insert(&mut self, score: f64, element: SDS) -> *mut SkipListNode {
        let mut update: [*mut SkipListNode; SKIPLIST_MAXLEVEL] =
            [std::ptr::null_mut(); SKIPLIST_MAXLEVEL];
        let mut rank: [u64; SKIPLIST_MAXLEVEL] = [0; SKIPLIST_MAXLEVEL];

        // Find insertion position (traverse from top level down)
        let mut x = &*self.header as *const _ as *mut SkipListNode;
        for i in (0..self.level).rev() {
            rank[i] = if i == self.level - 1 { 0 } else { rank[i + 1] };
            unsafe {
                while let Some(next) = (*x).levels[i].forward.as_ref() {
                    if next.score < score ||
                       (next.score == score && next.element < element) {
                        rank[i] += (*x).levels[i].span;
                        x = (*x).levels[i].forward;
                    } else {
                        break;
                    }
                }
            }
            update[i] = x;
        }

        let level = self.random_level();
        if level > self.level {
            for i in self.level..level {
                rank[i] = 0;
                update[i] = &mut *self.header as *mut _;
                unsafe { (*update[i]).levels[i].span = self.length; }
            }
            self.level = level;
        }

        // Create and link new node
        let node = Box::into_raw(Box::new(SkipListNode::new(level, score, element)));
        for i in 0..level {
            unsafe {
                (*node).levels[i].forward = (*update[i]).levels[i].forward;
                (*update[i]).levels[i].forward = node;

                (*node).levels[i].span = (*update[i]).levels[i].span - (rank[0] - rank[i]);
                (*update[i]).levels[i].span = (rank[0] - rank[i]) + 1;
            }
        }

        self.length += 1;
        node
    }
}
```

**ZSet dual structure**: Every sorted set maintains both a skip list (for range operations) and a hash table (for O(1) score lookups by element):
```rust
struct ZSet {
    skiplist: SkipList,          // For ZRANGE, ZRANGEBYSCORE
    dict: Dict,                  // For ZSCORE, ZRANK (element → score)
}
```

#### QuickList (List)
A doubly-linked list of listpack nodes, combining memory efficiency of listpack with O(1) push/pop of linked lists.

```rust
struct QuickList {
    head: *mut QuickListNode,
    tail: *mut QuickListNode,
    count: u64,      // Total element count across all nodes
    len: u32,        // Number of quicklist nodes
    fill: i16,       // Max listpack size per node (-2 = 8KB default)
    compress: u16,   // Depth of non-compressed nodes at each end (0 = no compress)
}

struct QuickListNode {
    prev: *mut QuickListNode,
    next: *mut QuickListNode,
    entry: *mut u8,         // Listpack data (or LZF compressed)
    total_count: u32,       // Elements in this listpack
    size: u32,              // Listpack byte size
    encoding: u8,           // RAW=1, LZF=2
    container: u8,          // PLAIN=1, PACKED=2 (listpack)
    recompress: bool,       // Was this temporarily decompressed?
}

// Fill factor interpretation:
// -1: 4KB max per listpack node
// -2: 8KB max per listpack node (DEFAULT)
// -3: 16KB max per listpack node
// -4: 32KB max per listpack node
// -5: 64KB max per listpack node
// Positive: exact max number of entries per node
```

#### IntSet (Integer Set)
Compact, sorted array of integers for sets containing only integers.

```rust
struct IntSet {
    encoding: IntSetEncoding,  // INT16, INT32, or INT64
    length: u32,
    contents: Vec<u8>,  // Sorted array of integers in chosen encoding
}

enum IntSetEncoding {
    Int16,  // Each element: 2 bytes
    Int32,  // Each element: 4 bytes
    Int64,  // Each element: 8 bytes
}

impl IntSet {
    fn add(&mut self, value: i64) -> bool {
        // Check if encoding needs upgrading
        let needed_encoding = IntSetEncoding::for_value(value);
        if needed_encoding > self.encoding {
            self.upgrade_encoding(needed_encoding);
        }

        // Binary search for insertion position
        if let Ok(_) = self.binary_search(value) {
            return false; // Already exists
        }

        // Insert at correct position (shift elements right)
        self.insert_sorted(value);
        true
    }

    // Convert to hashtable when:
    // - Set has > 512 elements (set-max-intset-entries)
    // - A non-integer element is added
}
```

#### Stream (Radix Tree)
```rust
struct Stream {
    rax: RadixTree<StreamId, ListPack>,  // Entries stored in listpacks within radix tree
    length: u64,
    last_id: StreamId,
    first_id: StreamId,
    max_deleted_entry_id: StreamId,
    entries_added: u64,
    consumer_groups: Vec<ConsumerGroup>,
}

struct StreamId {
    ms: u64,       // Millisecond timestamp
    seq: u64,      // Sequence number within same millisecond
}

struct ConsumerGroup {
    name: SDS,
    last_id: StreamId,    // Last delivered ID
    pel: PendingEntryList, // Pending Entry List (not yet ACKed)
    consumers: RadixTree<ConsumerName, Consumer>,
    entries_read: u64,
}

struct PendingEntry {
    id: StreamId,
    consumer: SDS,
    delivery_time: u64,
    delivery_count: u32,
}
```

### 5. Persistence Architecture

#### RDB Snapshot Process
```rust
impl Server {
    fn rdb_save_background(&mut self) -> Result<(), RdbError> {
        if self.has_active_child() {
            return Err(RdbError::ChildAlreadyRunning);
        }

        let child_pid = unsafe { libc::fork() };
        match child_pid {
            -1 => Err(RdbError::ForkFailed),
            0 => {
                // === CHILD PROCESS ===
                // Close listening sockets (child doesn't need them)
                self.close_listeners();

                // Write RDB to temp file
                let temp_path = format!("temp-{}.rdb", std::process::id());
                let result = self.rdb_save_to_file(&temp_path);

                if result.is_ok() {
                    // Report CoW memory to parent via pipe
                    let cow_size = self.get_cow_size();
                    self.report_cow_size(cow_size);

                    // Atomic rename
                    std::fs::rename(&temp_path, "dump.rdb").unwrap();
                }

                // Exit child process
                std::process::exit(if result.is_ok() { 0 } else { 1 });
            },
            pid => {
                // === PARENT PROCESS ===
                self.rdb_child_pid = Some(pid);
                self.rdb_save_time_start = Instant::now();
                // Disable dict rehashing during BGSAVE
                // (reduces copy-on-write memory duplication)
                self.dict_can_resize = false;
                Ok(())
            }
        }
    }
}
```

**Copy-on-Write Memory Behavior**:
```
Initial state after fork():
  Parent pages: [A][B][C][D][E]
  Child pages:  [A][B][C][D][E]  ← same physical pages (shared)

Parent receives write to page B:
  Parent pages: [A][B'][C][D][E]  ← B copied, then modified to B'
  Child pages:  [A][B] [C][D][E]  ← still sees original B

Risk: If parent modifies many pages during BGSAVE,
      memory usage can approach 2x
      
Mitigation:
  - Disable hash table resizing during BGSAVE (dict_can_resize = false)
  - Use Transparent Huge Pages cautiously (2MB CoW granularity!)
  - Monitor via INFO persistence: rdb_last_cow_size
```

#### RDB File Writer
```rust
struct RdbWriter {
    file: BufWriter<File>,
    checksum: Crc64,
}

impl RdbWriter {
    fn write_rdb(&mut self, server: &Server) -> Result<(), RdbError> {
        // 1. Magic + version
        self.write_bytes(b"REDIS0011")?;

        // 2. Auxiliary fields
        self.write_aux("redis-ver", &server.version)?;
        self.write_aux("redis-bits", &format!("{}", std::mem::size_of::<usize>() * 8))?;
        self.write_aux("ctime", &format!("{}", server.unix_time()))?;
        self.write_aux("used-mem", &format!("{}", server.used_memory()))?;
        self.write_aux("aof-base", "0")?;

        // 3. Per-database data
        for db in &server.databases {
            if db.keyspace.is_empty() { continue; }

            // Database selector
            self.write_byte(RDB_OPCODE_SELECTDB)?;
            self.write_length(db.id as u64)?;

            // Hash table size hint
            self.write_byte(RDB_OPCODE_RESIZEDB)?;
            self.write_length(db.keyspace.len() as u64)?;
            self.write_length(db.expires.len() as u64)?;

            // Key-value pairs
            for (key, obj) in &db.keyspace {
                // Optional: expiry
                if let Some(expire_ms) = db.expires.get(key) {
                    self.write_byte(RDB_OPCODE_EXPIRETIME_MS)?;
                    self.write_u64_le(*expire_ms)?;
                }

                // Type byte
                self.write_byte(rdb_type_for_object(obj))?;

                // Key (as string)
                self.write_string(key)?;

                // Value (type-specific encoding)
                self.write_object(obj)?;
            }
        }

        // 4. EOF + checksum
        self.write_byte(RDB_OPCODE_EOF)?;
        let checksum = self.checksum.finalize();
        self.write_u64_le(checksum)?;

        Ok(())
    }
}
```

#### AOF Architecture
```rust
struct AofState {
    fd: File,
    buf: Vec<u8>,              // In-memory buffer before flush
    fsync_policy: AofFsyncPolicy,
    current_size: u64,
    rewrite_min_size: u64,     // Don't rewrite if AOF < this (64MB default)
    rewrite_percentage: u32,   // Rewrite if grown by this % (100 = doubled)
    last_fsync_time: Instant,
    last_rewrite_size: u64,    // AOF size at last rewrite

    // Multi-part AOF (7.0+)
    manifest: AofManifest,
}

enum AofFsyncPolicy {
    Always,     // fsync after every write
    Everysec,   // fsync at most once per second
    No,         // Let OS decide
}

impl AofState {
    fn append_command(&mut self, cmd: &[Vec<u8>]) {
        // Format as RESP array
        self.buf.extend_from_slice(format!("*{}\r\n", cmd.len()).as_bytes());
        for arg in cmd {
            self.buf.extend_from_slice(format!("${}\r\n", arg.len()).as_bytes());
            self.buf.extend_from_slice(arg);
            self.buf.extend_from_slice(b"\r\n");
        }
    }

    fn flush_if_needed(&mut self) -> Result<(), AofError> {
        if self.buf.is_empty() { return Ok(()); }

        // Write buffer to file
        self.fd.write_all(&self.buf)?;
        self.current_size += self.buf.len() as u64;
        self.buf.clear();

        // fsync based on policy
        match self.fsync_policy {
            AofFsyncPolicy::Always => {
                self.fd.sync_data()?;
            },
            AofFsyncPolicy::Everysec => {
                if self.last_fsync_time.elapsed() >= Duration::from_secs(1) {
                    // Submit to background thread (BIO_AOF_FSYNC)
                    self.schedule_background_fsync();
                    self.last_fsync_time = Instant::now();
                }
            },
            AofFsyncPolicy::No => {
                // OS handles it
            },
        }

        Ok(())
    }

    fn should_rewrite(&self) -> bool {
        self.current_size >= self.rewrite_min_size &&
        self.last_rewrite_size > 0 &&
        (self.current_size - self.last_rewrite_size) * 100 / self.last_rewrite_size
            >= self.rewrite_percentage as u64
    }
}
```

#### AOF Rewrite Process
```rust
impl Server {
    fn aof_rewrite_background(&mut self) -> Result<(), AofError> {
        // Create pipe for parent→child AOF diff buffer
        let (diff_reader, diff_writer) = pipe()?;

        let child_pid = unsafe { libc::fork() };
        match child_pid {
            0 => {
                // === CHILD ===
                // Write compact AOF from current memory state
                let temp_path = format!("temp-rewriteaof-{}.aof", std::process::id());
                let mut writer = AofRewriter::new(&temp_path)?;

                for db in &self.databases {
                    if db.keyspace.is_empty() { continue; }
                    writer.write_select_db(db.id)?;

                    for (key, obj) in &db.keyspace {
                        // Skip expired keys
                        if db.is_expired(key) { continue; }

                        // Write minimal commands to recreate this key
                        writer.write_object_commands(key, obj)?;

                        // Write PEXPIREAT if key has expiry
                        if let Some(expire_ms) = db.expires.get(key) {
                            writer.write_pexpireat(key, *expire_ms)?;
                        }
                    }
                }

                // Read any accumulated diff from parent
                writer.append_diff_from_pipe(diff_reader)?;
                writer.finalize()?;

                std::process::exit(0);
            },
            pid => {
                // === PARENT ===
                self.aof_child_pid = Some(pid);
                self.aof_rewrite_buf = Vec::new();
                self.aof_diff_pipe = Some(diff_writer);
                Ok(())
            }
        }
    }

    // Called from beforeSleep — pipe buffered commands to child
    fn aof_pipe_diff_to_child(&mut self) {
        if let Some(ref pipe) = self.aof_diff_pipe {
            if !self.aof_rewrite_buf.is_empty() {
                let _ = pipe.write_all(&self.aof_rewrite_buf);
                self.aof_rewrite_buf.clear();
            }
        }
    }
}
```

### 6. Replication Architecture

#### Replication State Machine
```rust
enum ReplicationState {
    None,                    // No replication configured
    Connect,                 // Need to connect to master
    Connecting,              // TCP connect in progress
    ReceivePong,             // Sent PING, waiting for PONG
    SendAuth,                // Need to authenticate
    ReceiveAuth,             // Waiting for AUTH response
    SendPort,                // Send REPLCONF listening-port
    ReceivePort,             // Waiting for REPLCONF response
    SendIp,                  // Send REPLCONF ip-address
    ReceiveIp,               // Waiting for REPLCONF response
    SendCapa,                // Send REPLCONF capa (capabilities)
    ReceiveCapa,             // Waiting for REPLCONF response
    SendPsync,               // Send PSYNC replid offset
    ReceivePsync,            // Waiting for PSYNC response
    TransferRdb,             // Receiving RDB file from master
    Connected,               // Replication active, receiving stream
}

struct ReplicaState {
    master_host: String,
    master_port: u16,
    state: ReplicationState,
    master_fd: Option<i32>,

    // PSYNC state
    master_replid: [u8; 41],     // 40-char hex + null
    master_replid2: [u8; 41],    // Previous master's replid (for failover)
    master_repl_offset: i64,
    second_replid_offset: i64,

    // Transfer state
    rdb_transfer_size: i64,
    rdb_transfer_read: i64,
    rdb_transfer_fd: Option<File>,

    // Backlog
    repl_backlog: Option<CircularBuffer>,
    repl_backlog_size: usize,    // Default 1MB
}

impl ReplicaState {
    fn handle_psync_response(&mut self, response: &str) -> PsyncResult {
        if response.starts_with("+FULLRESYNC") {
            // Full resync: receive RDB
            let parts: Vec<&str> = response.split_whitespace().collect();
            self.master_replid.copy_from_slice(parts[1].as_bytes());
            self.master_repl_offset = parts[2].parse().unwrap();
            PsyncResult::FullResync
        } else if response.starts_with("+CONTINUE") {
            // Partial resync: just continue receiving stream
            PsyncResult::PartialResync
        } else {
            PsyncResult::Error
        }
    }
}
```

#### Replication Backlog
```rust
struct ReplicationBacklog {
    buffer: Vec<u8>,              // Circular buffer
    size: usize,                  // Total buffer size
    offset: i64,                  // First byte's replication offset
    histlen: usize,               // Bytes of valid data in buffer
    write_idx: usize,             // Current write position
}

impl ReplicationBacklog {
    fn feed(&mut self, data: &[u8]) {
        for byte in data {
            self.buffer[self.write_idx] = *byte;
            self.write_idx = (self.write_idx + 1) % self.size;
            if self.histlen < self.size {
                self.histlen += 1;
            } else {
                self.offset += 1;  // Oldest byte pushed out
            }
        }
    }

    fn can_partial_resync(&self, requested_offset: i64) -> bool {
        // Check if the requested offset is still in our backlog
        requested_offset >= self.offset &&
        requested_offset <= self.offset + self.histlen as i64
    }

    fn read_from_offset(&self, offset: i64) -> &[u8] {
        let skip = (offset - self.offset) as usize;
        let start = (self.write_idx + self.size - self.histlen + skip) % self.size;
        // Return data from start to write_idx (may wrap)
        // ... (handle circular buffer wrap-around)
    }
}
```

#### Command Propagation
```rust
impl Server {
    fn propagate_command(&mut self, cmd: &Command, db_id: u8) {
        // 1. Propagate to AOF
        if self.aof_state.is_some() {
            self.aof_state.as_mut().unwrap().append_command(&cmd.argv);
        }

        // 2. Propagate to replicas
        let resp_bytes = cmd.to_resp_bytes();
        for replica in &mut self.replicas {
            if replica.state == ReplicaState::Online {
                replica.add_reply(&resp_bytes);
            }
        }

        // 3. Feed replication backlog
        if let Some(ref mut backlog) = self.repl_backlog {
            backlog.feed(&resp_bytes);
        }

        // 4. Update replication offset
        self.master_repl_offset += resp_bytes.len() as i64;
    }
}
```

### 7. Cluster Architecture

#### Cluster State
```rust
struct ClusterState {
    myself: ClusterNode,
    nodes: HashMap<NodeId, ClusterNode>,
    slots: [Option<NodeId>; 16384],         // Slot → owner mapping
    migrating_slots: [Option<NodeId>; 16384], // Slot being migrated TO
    importing_slots: [Option<NodeId>; 16384], // Slot being imported FROM
    current_epoch: u64,
    state: ClusterStateType,  // Ok or Fail
    size: u32,                // Number of master nodes serving at least 1 slot
    cluster_bus_port: u16,    // Port for node-to-node communication (port + 10000)
}

struct ClusterNode {
    id: NodeId,               // 40-char hex string
    name: String,
    ip: String,
    port: u16,
    cport: u16,               // Cluster bus port
    flags: ClusterNodeFlags,  // MASTER, SLAVE, PFAIL, FAIL, HANDSHAKE, etc.
    config_epoch: u64,
    slots: BitArray<16384>,   // Slots owned by this node
    num_slots: u16,
    replicas: Vec<NodeId>,
    master_id: Option<NodeId>,
    ping_sent: u64,           // Last PING sent timestamp
    pong_received: u64,       // Last PONG received timestamp
    fail_time: u64,           // When FAIL state was set
    voted_for: Option<NodeId>,
    repl_offset: i64,
    link: Option<ClusterLink>,
}
```

#### Gossip Protocol
```rust
impl ClusterState {
    fn cluster_cron(&mut self) {
        // Run every 100ms (10 Hz)

        // 1. Send PING to random node
        let target = self.select_random_node();
        self.send_ping(target);

        // 2. Check for PFAIL → FAIL promotion
        for node in self.nodes.values() {
            if node.flags.contains(ClusterNodeFlags::PFAIL) {
                self.check_fail_promotion(node);
            }
        }

        // 3. Check for nodes that haven't responded
        let node_timeout = self.node_timeout; // Default 15000ms
        for node in self.nodes.values_mut() {
            let elapsed = now_ms() - node.pong_received;
            if elapsed > node_timeout / 2 && node.ping_sent == 0 {
                // Haven't sent PING in a while, send one
                self.send_ping_to(node);
            }
            if elapsed > node_timeout && node.ping_sent > 0 {
                // No PONG received within timeout
                if !node.flags.contains(ClusterNodeFlags::PFAIL) {
                    node.flags.insert(ClusterNodeFlags::PFAIL);
                }
            }
        }

        // 4. Handle slot migration in progress
        self.handle_slot_migration();

        // 5. Update cluster state (OK or FAIL)
        self.update_state();
    }

    fn send_ping(&self, target: &ClusterNode) {
        let mut msg = ClusterMsg::new(ClusterMsgType::Ping);

        // Include gossip about random nodes
        let gossip_count = self.nodes.len().min(3);
        for _ in 0..gossip_count {
            let random_node = self.select_random_node();
            msg.add_gossip(GossipEntry {
                node_id: random_node.id,
                ping_sent: random_node.ping_sent,
                pong_received: random_node.pong_received,
                ip: random_node.ip.clone(),
                port: random_node.port,
                cport: random_node.cport,
                flags: random_node.flags,
            });
        }

        // Include my slot bitmap and config epoch
        msg.set_slots(self.myself.slots.clone());
        msg.set_config_epoch(self.myself.config_epoch);

        self.send_cluster_msg(target, msg);
    }

    fn check_fail_promotion(&mut self, node: &ClusterNode) {
        // Count how many nodes have flagged this node as PFAIL or FAIL
        let mut fail_count = 0;
        for other in self.nodes.values() {
            if other.has_fail_report_for(node.id) {
                fail_count += 1;
            }
        }

        // Need majority of masters to agree
        let needed = (self.size / 2) + 1;
        if fail_count >= needed as usize {
            // Promote PFAIL → FAIL
            let node = self.nodes.get_mut(&node.id).unwrap();
            node.flags.remove(ClusterNodeFlags::PFAIL);
            node.flags.insert(ClusterNodeFlags::FAIL);
            node.fail_time = now_ms();

            // Broadcast FAIL to all nodes immediately
            self.broadcast_fail(node.id);
        }
    }
}
```

#### Hash Slot Routing
```rust
impl ClusterState {
    fn get_slot_for_key(key: &[u8]) -> u16 {
        // Check for hash tag: {tag}
        if let Some(start) = key.iter().position(|&b| b == b'{') {
            if let Some(end) = key[start+1..].iter().position(|&b| b == b'}') {
                if end > 0 {
                    // Use content between {} for hash
                    return crc16(&key[start+1..start+1+end]) % 16384;
                }
            }
        }
        crc16(key) % 16384
    }

    fn handle_command_routing(&self, client: &mut Client, cmd: &Command)
        -> RoutingResult
    {
        let slot = Self::get_slot_for_key(&cmd.key());

        // Check if we own this slot
        if let Some(owner) = self.slots[slot as usize] {
            if owner == self.myself.id {
                // We own it — check if it's being migrated
                if let Some(target) = self.migrating_slots[slot as usize] {
                    // Key exists locally? Serve it. Otherwise, ASK redirect.
                    if self.key_exists(&cmd.key()) {
                        return RoutingResult::Local;
                    } else {
                        let target_node = &self.nodes[&target];
                        return RoutingResult::Ask(target_node.ip.clone(), target_node.port);
                    }
                }
                return RoutingResult::Local;
            } else {
                // Check if we're importing this slot
                if let Some(_source) = self.importing_slots[slot as usize] {
                    if client.flags.contains(ClientFlags::ASKING) {
                        client.flags.remove(ClientFlags::ASKING);
                        return RoutingResult::Local;
                    }
                }
                // MOVED redirect
                let owner_node = &self.nodes[&owner];
                return RoutingResult::Moved(slot, owner_node.ip.clone(), owner_node.port);
            }
        }

        RoutingResult::ClusterDown
    }
}

enum RoutingResult {
    Local,
    Moved(u16, String, u16),      // slot, ip, port
    Ask(String, u16),              // ip, port
    ClusterDown,
}
```

#### Slot Migration
```rust
impl ClusterState {
    fn migrate_slot(&mut self, slot: u16, target_node_id: NodeId) -> Result<(), MigrationError> {
        // Phase 1: Set slot states
        self.migrating_slots[slot as usize] = Some(target_node_id);
        // Target node sets: importing_slots[slot] = Some(source_node_id)

        // Phase 2: Migrate keys one at a time
        loop {
            // Get a key in this slot
            let key = match self.get_random_key_in_slot(slot) {
                Some(k) => k,
                None => break,  // No more keys in this slot
            };

            // MIGRATE target_host target_port key db timeout REPLACE
            let value = self.dump_key(&key)?;
            self.send_migrate(target_node_id, &key, &value)?;
            self.delete_key(&key);
        }

        // Phase 3: Update slot ownership
        // CLUSTER SETSLOT <slot> NODE <target-node-id>
        self.slots[slot as usize] = Some(target_node_id);
        self.migrating_slots[slot as usize] = None;
        self.myself.slots.clear(slot as usize);
        self.current_epoch += 1;
        self.myself.config_epoch = self.current_epoch;

        // Broadcast new config to cluster
        self.broadcast_pong();

        Ok(())
    }
}
```

### 8. Client Output Buffer Management

```rust
struct ClientOutputBuffer {
    // Three classes with different limits
    normal_limits: OutputBufferLimits,   // Regular clients
    replica_limits: OutputBufferLimits,  // Replica connections
    pubsub_limits: OutputBufferLimits,   // Pub/sub subscribers
}

struct OutputBufferLimits {
    hard_limit: usize,       // Immediate disconnect
    soft_limit: usize,       // Start soft limit timer
    soft_limit_seconds: u64, // Disconnect after this many seconds over soft limit
}

// Default limits:
// client-output-buffer-limit normal 0 0 0          # No limits for normal
// client-output-buffer-limit replica 256mb 64mb 60  # 256MB hard, 64MB soft for 60s
// client-output-buffer-limit pubsub 32mb 8mb 60     # 32MB hard, 8MB soft for 60s

impl Client {
    fn check_output_buffer_limits(&mut self) -> BufferAction {
        let buffer_size = self.reply_bytes;
        let limits = self.get_output_buffer_limits();

        // Hard limit: immediate disconnect
        if limits.hard_limit > 0 && buffer_size >= limits.hard_limit {
            return BufferAction::CloseConnection;
        }

        // Soft limit: track time over limit
        if limits.soft_limit > 0 && buffer_size >= limits.soft_limit {
            if self.soft_limit_start.is_none() {
                self.soft_limit_start = Some(Instant::now());
            } else if self.soft_limit_start.unwrap().elapsed()
                      >= Duration::from_secs(limits.soft_limit_seconds) {
                return BufferAction::CloseConnection;
            }
        } else {
            self.soft_limit_start = None;
        }

        BufferAction::Continue
    }
}
```

### 9. Pub/Sub Architecture

```rust
struct PubSubEngine {
    // Channel name → set of subscribed clients
    channels: HashMap<Vec<u8>, HashSet<ClientId>>,
    // Pattern → set of subscribed clients
    patterns: Vec<(Pattern, HashSet<ClientId>)>,
    // Sharded channels (cluster mode) — only routed within hash slot
    shard_channels: HashMap<Vec<u8>, HashSet<ClientId>>,
}

impl PubSubEngine {
    fn publish(&self, channel: &[u8], message: &[u8], server: &Server) -> u64 {
        let mut receivers = 0u64;

        // 1. Direct channel subscribers
        if let Some(clients) = self.channels.get(channel) {
            let msg = format_pubsub_message("message", channel, message);
            for &client_id in clients {
                if let Some(client) = server.get_client(client_id) {
                    client.add_reply(&msg);
                    receivers += 1;
                }
            }
        }

        // 2. Pattern subscribers
        for (pattern, clients) in &self.patterns {
            if pattern.matches(channel) {
                let msg = format_pubsub_pmessage(pattern.as_str(), channel, message);
                for &client_id in clients {
                    if let Some(client) = server.get_client(client_id) {
                        client.add_reply(&msg);
                        receivers += 1;
                    }
                }
            }
        }

        receivers
    }
}
```

### 10. Lua Scripting Architecture

```rust
struct ScriptingEngine {
    lua: LuaState,
    scripts_cache: HashMap<[u8; 20], Vec<u8>>,  // SHA1 → script body
    // Functions registry (Redis 7.0+)
    libraries: HashMap<String, FunctionLibrary>,
}

impl ScriptingEngine {
    fn eval(&mut self, script: &[u8], keys: &[Vec<u8>], args: &[Vec<u8>],
            server: &mut Server) -> Result<RespValue, ScriptError> {
        // 1. Set KEYS and ARGV in Lua globals
        self.set_lua_keys_argv(keys, args);

        // 2. Set up redis.call / redis.pcall callbacks
        //    These call back into the server's command execution
        self.setup_redis_callbacks(server);

        // 3. Execute script atomically
        //    - No other clients can execute commands during script
        //    - Script has a timeout (lua-time-limit, default 5s)
        //    - After timeout, clients can send SCRIPT KILL
        server.set_busy_flag(true);
        let result = self.lua.execute(script);
        server.set_busy_flag(false);

        // 4. Convert Lua result to RESP value
        self.lua_to_resp(result)
    }

    fn setup_redis_callbacks(&mut self, server: &mut Server) {
        // redis.call(cmd, args...) — errors propagate to client
        // redis.pcall(cmd, args...) — errors returned as Lua table
        // redis.error_reply(msg) — return error to client
        // redis.status_reply(msg) — return status to client
        // redis.log(level, msg) — server logging
        // redis.sha1hex(data) — SHA1 hash

        // IMPORTANT: Scripts cannot use commands that are non-deterministic
        // in a way that affects replication (e.g., RANDOMKEY, TIME)
        // unless using EVALRO/read-only mode
    }
}
```

### 11. Memory Eviction Architecture

```rust
struct EvictionManager {
    policy: EvictionPolicy,
    maxmemory: u64,
    maxmemory_samples: u32,  // Default 5, higher = more accurate but slower
}

enum EvictionPolicy {
    NoEviction,         // Return error on write when full
    AllKeysLru,         // Evict least recently used key
    AllKeysLfu,         // Evict least frequently used key
    AllKeysRandom,      // Evict random key
    VolatileLru,        // Evict least recently used key WITH TTL
    VolatileLfu,        // Evict least frequently used key WITH TTL
    VolatileRandom,     // Evict random key WITH TTL
    VolatileTtl,        // Evict key with shortest remaining TTL
}

impl EvictionManager {
    fn perform_eviction(&self, server: &mut Server) -> Result<(), EvictionError> {
        loop {
            let used = server.used_memory();
            if used <= self.maxmemory { return Ok(()); }

            if self.policy == EvictionPolicy::NoEviction {
                return Err(EvictionError::OOM);
            }

            // Approximated LRU/LFU: sample N random keys, evict best candidate
            let mut best_key: Option<Vec<u8>> = None;
            let mut best_idle: u64 = 0;

            for db in &server.databases {
                let dict = match self.policy {
                    EvictionPolicy::VolatileLru |
                    EvictionPolicy::VolatileLfu |
                    EvictionPolicy::VolatileRandom |
                    EvictionPolicy::VolatileTtl => &db.expires,
                    _ => &db.keyspace,
                };

                if dict.is_empty() { continue; }

                // Sample N random keys
                for _ in 0..self.maxmemory_samples {
                    let (key, obj) = dict.random_entry().unwrap();
                    let idle = match self.policy {
                        EvictionPolicy::AllKeysLru |
                        EvictionPolicy::VolatileLru => {
                            server.lru_clock() - obj.lru_clock
                        },
                        EvictionPolicy::AllKeysLfu |
                        EvictionPolicy::VolatileLfu => {
                            255 - obj.lfu_counter as u64  // Invert: lower freq = higher idle
                        },
                        EvictionPolicy::VolatileTtl => {
                            // Keys expiring sooner have higher priority
                            u64::MAX - db.expires.get(&key).unwrap_or(&u64::MAX)
                        },
                        _ => rand::random::<u64>(),  // Random
                    };

                    if idle > best_idle || best_key.is_none() {
                        best_idle = idle;
                        best_key = Some(key.clone());
                    }
                }
            }

            if let Some(key) = best_key {
                // Use lazy free if enabled
                if server.lazyfree_lazy_eviction {
                    server.db_async_delete(&key);
                } else {
                    server.db_delete(&key);
                }
                server.propagate_del(&key);
            } else {
                return Err(EvictionError::NoCandidates);
            }
        }
    }
}
```

#### LFU (Least Frequently Used) Counter
```rust
// Logarithmic counter with decay
impl LfuCounter {
    fn log_incr(counter: u8) -> u8 {
        if counter == 255 { return 255; }
        let r: f64 = rand::random();
        let base_val = (counter as f64 - 5.0).max(0.0); // LFU_INIT_VAL = 5
        let p = 1.0 / (base_val * 10.0 + 1.0);  // lfu-log-factor = 10
        if r < p {
            counter + 1
        } else {
            counter
        }
    }

    fn decay(counter: u8, minutes_since_last_access: u64) -> u8 {
        // lfu-decay-time = 1 (minute)
        let decay_amount = minutes_since_last_access; // 1 per minute
        if decay_amount as u8 >= counter {
            0
        } else {
            counter - decay_amount as u8
        }
    }
}
```

## Deployment Architecture Patterns

### 1. Standalone
```yaml
deployment:
  type: standalone
  persistence:
    rdb: true
    aof: true
    aof_fsync: everysec
  resources:
    maxmemory: "4gb"
    maxmemory_policy: "allkeys-lfu"
```

### 2. Sentinel HA (3 nodes)
```yaml
deployment:
  type: sentinel
  master:
    host: redis-1
    port: 6379
  replicas:
    - host: redis-2
      port: 6379
    - host: redis-3
      port: 6379
  sentinels:
    - host: sentinel-1
      port: 26379
    - host: sentinel-2
      port: 26379
    - host: sentinel-3
      port: 26379
  quorum: 2
  down_after_ms: 5000
  failover_timeout: 60000
```

### 3. Cluster (6 nodes)
```yaml
deployment:
  type: cluster
  nodes:
    - host: redis-1
      port: 6379
      slots: "0-5460"
      replica: redis-4
    - host: redis-2
      port: 6379
      slots: "5461-10922"
      replica: redis-5
    - host: redis-3
      port: 6379
      slots: "10923-16383"
      replica: redis-6
  cluster_node_timeout: 15000
  cluster_require_full_coverage: yes
```

This comprehensive architecture guide provides the foundation for implementing a production-grade, Redis/Valkey-compatible key-value store with all essential subsystems clearly specified.
