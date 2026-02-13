# Standard Memory Profile for Message Queues

## Overview
This document provides comprehensive memory management guidelines for message queue implementations. Efficient memory usage is critical for sustaining high message throughput while maintaining low latency and avoiding garbage collection pauses or out-of-memory failures.

## Memory Architecture Principles

### 1. Page Cache Reliance
**The OS page cache is the primary caching layer for log-based message queues**

Message queues that use append-only logs (Kafka, Redpanda) should rely heavily on the OS page cache rather than implementing application-level caches. This provides:
- Automatic warm-up on restart (data stays in page cache)
- No double-caching (application heap + page cache)
- Efficient memory reclamation under pressure
- Zero-copy transfer via `sendfile()` directly from page cache to socket

```
Memory Layout (Kafka-style):
┌──────────────────────────────────────────────┐
│                  Total RAM (64GB)             │
├──────────────┬───────────────────────────────┤
│  JVM Heap    │         OS Page Cache          │
│  (6-8GB)     │         (50-56GB)              │
│              │                               │
│  • Request   │  • Active log segments         │
│    buffers   │  • Index files                 │
│  • Metadata  │  • Recently written data       │
│  • Consumer  │  • Recently read data          │
│    state     │  • Older segments (LRU evict)  │
│  • Indices   │                               │
└──────────────┴───────────────────────────────┘
```

### 2. Object Lifecycle Management
**Message Data**: Never copy into application heap; stream from page cache
- **Production path**: Network buffer → page cache (via mmap or write)
- **Consumption path**: Page cache → network socket (via sendfile/zero-copy)
- **Replication path**: Page cache → network → follower page cache

**Connection State**: Pooled and reused across requests
- **Creation**: Allocate on client connect
- **Growth**: Expand buffers as needed for large requests
- **Reuse**: Reset state between requests on same connection
- **Cleanup**: Return to pool on disconnect

**Consumer Group State**: In-memory with periodic checkpoint
- **Offsets**: HashMap in memory, flushed to internal topic periodically
- **Membership**: Tracked per coordinator broker
- **Assignments**: Computed during rebalance, cached until next rebalance

### 3. Zero-Copy Transfer
```c
// Linux sendfile: page cache → socket without kernel→user→kernel copies
ssize_t bytes = sendfile(socket_fd, log_file_fd, &offset, count);

// This avoids:
// 1. Read from disk to page cache (already there from write)
// 2. Copy from page cache to user space (SKIPPED)
// 3. Copy from user space to socket buffer (SKIPPED)
// 4. DMA from socket buffer to NIC

// Instead:
// 1. Page cache → socket buffer (kernel-to-kernel, or DMA scatter-gather)
// 2. Socket buffer → NIC (DMA)
```

```rust
struct ZeroCopyTransfer {
    file_channel: FileChannel,
    transfer_stats: TransferStats,
}

impl ZeroCopyTransfer {
    fn transfer_to(&self, socket: &TcpStream, 
                    position: u64, count: u64) -> Result<u64, IoError> {
        // Use sendfile for zero-copy transfer
        let bytes = self.file_channel.transfer_to(
            position, count, socket
        )?;
        
        self.transfer_stats.record_zero_copy_bytes(bytes);
        Ok(bytes)
    }
}
```

## Memory Allocation Strategies

### 1. Message Buffer Management

#### Producer Send Buffer
```rust
struct ProducerMemoryPool {
    total_memory: usize,          // Default: 32MB (buffer.memory)
    batch_size: usize,            // Default: 16KB (batch.size)
    available: AtomicUsize,
    free_list: ConcurrentQueue<ByteBuffer>,
    waiters: Mutex<VecDeque<Waker>>,
}

impl ProducerMemoryPool {
    fn allocate(&self, size: usize) -> Result<ByteBuffer, AllocationError> {
        // Try free list first (pooled batch-sized buffers)
        if size == self.batch_size {
            if let Some(buffer) = self.free_list.pop() {
                return Ok(buffer);
            }
        }
        
        // Try available memory
        loop {
            let available = self.available.load(Ordering::Acquire);
            if available >= size {
                if self.available.compare_exchange_weak(
                    available, available - size,
                    Ordering::AcqRel, Ordering::Relaxed
                ).is_ok() {
                    return Ok(ByteBuffer::allocate(size));
                }
            } else {
                // Block with timeout (max.block.ms)
                return self.wait_for_memory(size);
            }
        }
    }
    
    fn deallocate(&self, mut buffer: ByteBuffer) {
        let size = buffer.capacity();
        buffer.clear();
        
        if size == self.batch_size {
            self.free_list.push(buffer);
        } else {
            // Non-standard size: free and return memory to pool
            drop(buffer);
            self.available.fetch_add(size, Ordering::Release);
        }
        
        // Wake blocked producers
        self.wake_waiters();
    }
}
```

#### Broker Request Buffers
```rust
struct RequestBufferPool {
    small_buffers: SegQueue<ByteBuffer>,    // 4KB (metadata requests)
    medium_buffers: SegQueue<ByteBuffer>,   // 64KB (typical produce/fetch)
    large_buffers: SegQueue<ByteBuffer>,    // 1MB (large batches)
    
    allocation_stats: AllocationStats,
}

impl RequestBufferPool {
    fn get_buffer(&self, min_size: usize) -> ByteBuffer {
        match min_size {
            0..=4096 => self.small_buffers.pop()
                .unwrap_or_else(|| ByteBuffer::allocate(4096)),
            4097..=65536 => self.medium_buffers.pop()
                .unwrap_or_else(|| ByteBuffer::allocate(65536)),
            _ => self.large_buffers.pop()
                .unwrap_or_else(|| ByteBuffer::allocate(min_size.next_power_of_two())),
        }
    }
    
    fn return_buffer(&self, mut buffer: ByteBuffer) {
        buffer.clear();
        match buffer.capacity() {
            4096 => { self.small_buffers.push(buffer); },
            65536 => { self.medium_buffers.push(buffer); },
            size if size >= 1048576 => {
                if self.large_buffers.len() < 64 {
                    self.large_buffers.push(buffer);
                }
                // else: drop to avoid unbounded growth
            },
            _ => { /* non-standard size, just drop */ }
        }
    }
}
```

### 2. Consumer State Memory

#### Offset Storage
```rust
struct ConsumerOffsetCache {
    // In-memory offset cache (written to __consumer_offsets topic)
    offsets: DashMap<GroupTopicPartition, OffsetAndMetadata>,
    
    // Memory budget
    max_entries: usize,
    entry_overhead: usize,  // ~200 bytes per entry
}

struct GroupTopicPartition {
    group_id: String,       // Variable length
    topic: String,          // Variable length
    partition: u32,         // 4 bytes
}

struct OffsetAndMetadata {
    offset: i64,            // 8 bytes
    leader_epoch: i32,      // 4 bytes
    metadata: String,       // Variable length (usually empty)
    commit_timestamp: i64,  // 8 bytes
    expire_timestamp: i64,  // 8 bytes
}

impl ConsumerOffsetCache {
    fn estimated_memory_usage(&self) -> usize {
        self.offsets.len() * self.entry_overhead
    }
    
    fn evict_expired(&self, now: i64) {
        self.offsets.retain(|_, v| v.expire_timestamp > now || v.expire_timestamp == -1);
    }
}
```

#### Consumer Fetch Buffer
```rust
struct ConsumerFetchBuffer {
    // Per-partition fetch buffers
    partition_buffers: HashMap<TopicPartition, PartitionBuffer>,
    
    // Global memory limit
    max_total_bytes: usize,
    current_bytes: AtomicUsize,
}

struct PartitionBuffer {
    records: VecDeque<RecordBatch>,
    total_bytes: usize,
    next_fetch_offset: u64,
    
    // Adaptive sizing
    avg_batch_size: RollingAverage,
    fetch_size_bytes: u32,
}

impl ConsumerFetchBuffer {
    fn add_records(&mut self, tp: &TopicPartition, 
                   batch: RecordBatch) -> Result<(), BufferFullError> {
        let batch_size = batch.size_bytes();
        let current = self.current_bytes.load(Ordering::Acquire);
        
        if current + batch_size > self.max_total_bytes {
            return Err(BufferFullError);
        }
        
        self.current_bytes.fetch_add(batch_size, Ordering::Release);
        
        let buffer = self.partition_buffers.entry(tp.clone())
            .or_insert_with(PartitionBuffer::new);
        buffer.records.push_back(batch);
        buffer.total_bytes += batch_size;
        buffer.avg_batch_size.record(batch_size);
        
        Ok(())
    }
    
    fn poll(&mut self, max_records: u32) -> Vec<ConsumerRecord> {
        let mut result = Vec::with_capacity(max_records as usize);
        
        // Round-robin across partitions
        for buffer in self.partition_buffers.values_mut() {
            while let Some(batch) = buffer.records.front() {
                if result.len() >= max_records as usize {
                    return result;
                }
                
                let records = batch.records();
                let batch_bytes = batch.size_bytes();
                result.extend(records);
                
                buffer.records.pop_front();
                buffer.total_bytes -= batch_bytes;
                self.current_bytes.fetch_sub(batch_bytes, Ordering::Release);
            }
        }
        
        result
    }
}
```

### 3. Index Memory Management

#### Memory-Mapped Index Files
```rust
struct MappedIndexFile {
    mmap: MmapMut,           // Memory-mapped region
    file_path: PathBuf,
    max_size: usize,
    current_size: AtomicUsize,
    warm: AtomicBool,        // Whether actively used
}

impl MappedIndexFile {
    fn new(path: PathBuf, max_size: usize) -> Result<Self, IoError> {
        let file = OpenOptions::new()
            .read(true).write(true).create(true)
            .open(&path)?;
        file.set_len(max_size as u64)?;
        
        let mmap = unsafe { MmapMut::map_mut(&file)? };
        
        // Pre-fault pages to avoid page faults during operation
        mmap.advise(Advice::WillNeed)?;
        
        Ok(MappedIndexFile {
            mmap,
            file_path: path,
            max_size,
            current_size: AtomicUsize::new(0),
            warm: AtomicBool::new(true),
        })
    }
    
    fn resize(&mut self, new_size: usize) -> Result<(), IoError> {
        // Trim unused portion of index file
        let actual_size = self.current_size.load(Ordering::Acquire);
        if actual_size < new_size {
            self.mmap.flush()?;
            // Remap with smaller size
            let file = File::open(&self.file_path)?;
            file.set_len(actual_size as u64)?;
            self.mmap = unsafe { MmapMut::map_mut(&file)? };
            self.max_size = actual_size;
        }
        Ok(())
    }
}
```

#### Index Memory Budget
```yaml
# Index memory sizing guidelines

# Offset index: 8 bytes per entry, one entry per index.interval.bytes (4096 default)
# For 1GB segment: 1GB / 4096 = 262,144 entries × 8 bytes = 2MB per segment

# Time index: 12 bytes per entry (8 timestamp + 4 relative offset)
# Same density as offset index: ~3MB per segment

# For 100 partitions × 10 active segments each:
# Offset indices: 100 × 10 × 2MB = 2GB
# Time indices: 100 × 10 × 3MB = 3GB
# Total index memory: ~5GB mapped

index_memory:
  # Per-partition budget
  active_segment_index: "2MB"     # Offset index for active segment
  active_segment_time_index: "3MB" # Time index for active segment
  
  # Per-broker limits
  max_mapped_index_memory: "8GB"  # Total mmap budget
  
  # OS page cache will manage actual resident set
  # Only actively queried indices need to be in RAM
  madvise_strategy: "sequential"  # For log reading
  mlock_active: true              # Lock active segment indices in RAM
```

### 4. Replication Buffer Memory

```rust
struct ReplicaFetcherMemory {
    // Per-partition fetch buffer
    partition_buffers: HashMap<TopicPartition, Vec<u8>>,
    
    // Total memory limit for all fetcher threads
    max_fetch_buffer_bytes: usize,
    current_bytes: AtomicUsize,
    
    // Fetch request sizing
    replica_fetch_max_bytes: u32,        // Default: 1MB
    replica_fetch_response_max_bytes: u32, // Default: 10MB
}

impl ReplicaFetcherMemory {
    fn can_fetch(&self, additional_bytes: usize) -> bool {
        self.current_bytes.load(Ordering::Acquire) + additional_bytes 
            <= self.max_fetch_buffer_bytes
    }
}
```

## Memory Pressure Management

### 1. Backpressure Under Memory Pressure
```rust
struct MemoryPressureManager {
    heap_usage: AtomicUsize,
    max_heap: usize,
    
    // Thresholds
    warning_threshold: f64,     // 0.70
    high_threshold: f64,        // 0.85
    critical_threshold: f64,    // 0.95
}

enum PressureLevel {
    Normal,     // < 70% heap used
    Warning,    // 70-85% heap used
    High,       // 85-95% heap used
    Critical,   // > 95% heap used
}

impl MemoryPressureManager {
    fn current_pressure(&self) -> PressureLevel {
        let usage = self.heap_usage.load(Ordering::Acquire) as f64 / self.max_heap as f64;
        match usage {
            x if x < self.warning_threshold => PressureLevel::Normal,
            x if x < self.high_threshold => PressureLevel::Warning,
            x if x < self.critical_threshold => PressureLevel::High,
            _ => PressureLevel::Critical,
        }
    }
    
    fn apply_backpressure(&self, request_type: RequestType) -> BackpressureAction {
        match (self.current_pressure(), request_type) {
            (PressureLevel::Normal, _) => BackpressureAction::Accept,
            
            (PressureLevel::Warning, RequestType::Produce) => {
                // Throttle producers slightly
                BackpressureAction::Throttle(Duration::from_millis(10))
            },
            (PressureLevel::Warning, _) => BackpressureAction::Accept,
            
            (PressureLevel::High, RequestType::Produce) => {
                BackpressureAction::Throttle(Duration::from_millis(100))
            },
            (PressureLevel::High, RequestType::Fetch) => {
                // Reduce fetch sizes
                BackpressureAction::ReduceFetchSize(0.5)
            },
            
            (PressureLevel::Critical, RequestType::Produce) => {
                BackpressureAction::Reject  // Temporary produce rejection
            },
            (PressureLevel::Critical, _) => {
                BackpressureAction::Throttle(Duration::from_millis(500))
            },
        }
    }
}
```

### 2. GC-Friendly Patterns (JVM-based implementations)
```yaml
# JVM memory tuning for message queue brokers
jvm_options:
  heap:
    initial: "6g"
    max: "6g"              # Fixed heap size avoids resize pauses
    
  gc:
    collector: "G1GC"      # G1 for balanced latency/throughput
    max_pause_target: "20ms"
    
    # Or for ultra-low-latency:
    # collector: "ZGC"     # Sub-millisecond pauses
    
  off_heap:
    direct_memory: "256m"  # NIO direct buffers
    mapped_memory: "unlimited"  # mmap for index files
    
  gc_tuning:
    # G1GC specific
    g1_heap_region_size: "16m"
    initiating_heap_occupancy: 35
    g1_mixed_gc_count_target: 4
    
    # Avoid full GC
    g1_reserve_percent: 25
    
# Key principle: Keep JVM heap small, let page cache use remaining RAM
# On 64GB server: 6GB heap + 58GB page cache > 32GB heap + 32GB page cache
```

## Memory Monitoring and Diagnostics

### 1. Memory Metrics
```rust
struct MemoryMetrics {
    // Application-level
    heap_used: Gauge,
    heap_max: Gauge,
    direct_memory_used: Gauge,
    mapped_memory_used: Gauge,
    
    // Buffer pools
    request_buffer_pool_used: Gauge,
    request_buffer_pool_available: Gauge,
    producer_buffer_pool_used: Gauge,
    
    // Per-component
    consumer_offset_cache_bytes: Gauge,
    index_mmap_bytes: Gauge,
    replication_buffer_bytes: Gauge,
    
    // OS-level
    page_cache_hit_ratio: Gauge,
    resident_set_size: Gauge,
    virtual_memory_size: Gauge,
    major_page_faults: Counter,
    minor_page_faults: Counter,
    
    // GC metrics (JVM)
    gc_pause_time_ms: Histogram,
    gc_pause_count: Counter,
    gc_reclaimed_bytes: Counter,
}

impl MemoryMetrics {
    fn collect_os_metrics(&self) {
        // Read from /proc/self/status and /proc/self/smaps
        let status = std::fs::read_to_string("/proc/self/status").unwrap();
        
        // VmRSS: Resident set size
        if let Some(rss) = parse_proc_value(&status, "VmRSS") {
            self.resident_set_size.set(rss as f64 * 1024.0);
        }
        
        // Read page cache stats from /proc/meminfo
        let meminfo = std::fs::read_to_string("/proc/meminfo").unwrap();
        if let Some(cached) = parse_proc_value(&meminfo, "Cached") {
            // Approximation of page cache available for our use
            self.page_cache_hit_ratio.set(self.calculate_cache_hit_ratio());
        }
    }
}
```

### 2. Memory Configuration Guidelines

```yaml
# Memory sizing by deployment tier

# Development (single broker)
development:
  total_ram: "4GB"
  application_heap: "1GB"
  page_cache: "2.5GB"
  os_reserved: "512MB"
  max_partitions: 100
  max_concurrent_connections: 100

# Production (per broker)
production_small:
  total_ram: "16GB"
  application_heap: "4GB"
  page_cache: "10GB"
  os_reserved: "2GB"
  max_partitions: 2000
  max_concurrent_connections: 1000

production_medium:
  total_ram: "64GB"
  application_heap: "6GB"
  page_cache: "54GB"
  os_reserved: "4GB"
  max_partitions: 10000
  max_concurrent_connections: 5000

production_large:
  total_ram: "128GB"
  application_heap: "8GB"
  page_cache: "114GB"
  os_reserved: "6GB"
  max_partitions: 30000
  max_concurrent_connections: 10000

# Key ratios:
# - Heap: 5-10% of total RAM (counter-intuitive but correct for log-based MQs)
# - Page cache: 80-90% of total RAM
# - Active data in page cache: aim for 100% of last 1 hour of data
# - Index files: ~5MB per partition (mmap'd, counted as page cache)
```

### 3. Memory Leak Detection
```rust
struct MemoryLeakDetector {
    snapshots: VecDeque<MemorySnapshot>,
    snapshot_interval: Duration,
    max_snapshots: usize,
    leak_threshold_bytes_per_hour: usize,
}

struct MemorySnapshot {
    timestamp: Instant,
    heap_used: usize,
    direct_used: usize,
    mapped_used: usize,
    connection_count: usize,
    partition_count: usize,
    consumer_group_count: usize,
}

impl MemoryLeakDetector {
    fn check_for_leaks(&self) -> Vec<LeakWarning> {
        let mut warnings = Vec::new();
        
        if self.snapshots.len() < 2 { return warnings; }
        
        let first = self.snapshots.front().unwrap();
        let last = self.snapshots.back().unwrap();
        let elapsed_hours = last.timestamp.duration_since(first.timestamp).as_secs_f64() / 3600.0;
        
        if elapsed_hours < 1.0 { return warnings; }
        
        // Check heap growth rate
        let heap_growth = last.heap_used as f64 - first.heap_used as f64;
        let heap_growth_per_hour = heap_growth / elapsed_hours;
        
        if heap_growth_per_hour > self.leak_threshold_bytes_per_hour as f64 {
            // Normalize: is growth proportional to workload increase?
            let partition_growth = last.partition_count as f64 / first.partition_count as f64;
            let normalized_growth = heap_growth_per_hour / partition_growth;
            
            if normalized_growth > self.leak_threshold_bytes_per_hour as f64 {
                warnings.push(LeakWarning::HeapLeak {
                    growth_rate_bytes_per_hour: heap_growth_per_hour as usize,
                    normalized_rate: normalized_growth as usize,
                });
            }
        }
        
        // Check direct memory growth
        let direct_growth = last.direct_used as f64 - first.direct_used as f64;
        if direct_growth / elapsed_hours > self.leak_threshold_bytes_per_hour as f64 {
            warnings.push(LeakWarning::DirectMemoryLeak {
                growth_rate: (direct_growth / elapsed_hours) as usize,
            });
        }
        
        warnings
    }
}
```

This memory profile provides the foundation for implementing memory-efficient message queue systems that maximize throughput by leveraging OS page cache, zero-copy I/O, and careful buffer pool management.
