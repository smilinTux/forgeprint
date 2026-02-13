# Standard Memory Profile for Web Servers

## Overview
This document provides comprehensive memory management guidelines for web server implementations. Web servers must efficiently handle tens of thousands of concurrent connections, serve files of varying sizes, manage TLS state, and cache hot content — all while maintaining predictable latency and bounded memory usage.

## Memory Architecture Principles

### 1. Memory Budget Per Connection

A web server's memory usage scales primarily with concurrent connections. Here's the breakdown of per-connection memory cost:

```
Idle Keep-Alive Connection:    ~1.5 - 2.5 KB
  - Connection struct:          128 bytes
  - Read buffer (minimum):      0 bytes (allocated on demand)
  - Timer entry:                32 bytes
  - epoll registration:         ~24 bytes
  - fd table entry:             ~16 bytes
  - Connection metadata:        ~64 bytes
  
Active HTTP/1.1 Request:       ~4 - 16 KB
  - Connection struct:          128 bytes
  - Read buffer:                4,096 bytes (grows as needed)
  - Write buffer:               4,096 bytes
  - Parsed headers (refs):      ~512 bytes (32 headers × 16 bytes)
  - Response headers:           ~256 bytes
  - URI/path storage:           ~256 bytes
  - Filter state:               ~512 bytes
  
Active HTTPS Request:          ~20 - 40 KB
  - All of above:               ~8 KB
  - TLS session state:          ~8 - 16 KB
  - TLS read/write buffers:     ~8 KB (16KB max TLS record)
  
Active HTTP/2 Connection:      ~30 - 100 KB
  - Connection frame state:     ~4 KB
  - HPACK dynamic table:        4,096 bytes (configurable)
  - Per-stream state (×N):      ~1 KB per stream
  - Flow control windows:       ~256 bytes
  - Priority tree:              ~512 bytes
```

### 2. Buffer Pool Architecture

```rust
/// Tiered buffer pool with thread-local free lists for zero-contention allocation
struct BufferPoolManager {
    // Thread-local pools (no locking needed)
    // Each worker thread has its own pool
    tls_pools: ThreadLocal<BufferPool>,
    
    // Global overflow pool (locked, used when thread-local is empty/full)
    global_pool: Mutex<GlobalBufferPool>,
    
    // Configuration
    config: BufferPoolConfig,
}

struct BufferPool {
    small: VecDeque<Box<[u8; 4096]>>,    // 4KB: HTTP headers, small requests
    medium: VecDeque<Box<[u8; 16384]>>,   // 16KB: Typical requests, TLS records
    large: VecDeque<Box<[u8; 65536]>>,    // 64KB: Large POST bodies, file chunks
    
    // Limits per thread-local pool
    small_max: usize,   // 256
    medium_max: usize,  // 64
    large_max: usize,   // 16
}

struct BufferPoolConfig {
    // Per-worker pool sizes
    small_pool_size: usize,     // Default: 256 buffers (1 MB per worker)
    medium_pool_size: usize,    // Default: 64 buffers (1 MB per worker)
    large_pool_size: usize,     // Default: 16 buffers (1 MB per worker)
    
    // Global overflow pool
    global_small_max: usize,    // Default: 1024
    global_medium_max: usize,   // Default: 256
    global_large_max: usize,    // Default: 64
}

impl BufferPool {
    fn get(&mut self, min_size: usize) -> Box<[u8]> {
        if min_size <= 4096 {
            self.small.pop_front()
                .map(|b| b as Box<[u8]>)
                .unwrap_or_else(|| vec![0u8; 4096].into_boxed_slice())
        } else if min_size <= 16384 {
            self.medium.pop_front()
                .map(|b| b as Box<[u8]>)
                .unwrap_or_else(|| vec![0u8; 16384].into_boxed_slice())
        } else {
            self.large.pop_front()
                .map(|b| b as Box<[u8]>)
                .unwrap_or_else(|| vec![0u8; 65536].into_boxed_slice())
        }
    }
    
    fn put(&mut self, buffer: Box<[u8]>) {
        let len = buffer.len();
        if len <= 4096 && self.small.len() < self.small_max {
            // Zero out buffer for security before returning to pool
            unsafe { std::ptr::write_bytes(buffer.as_ptr() as *mut u8, 0, len); }
            self.small.push_back(unsafe { Box::from_raw(Box::into_raw(buffer) as *mut [u8; 4096]) });
        } else if len <= 16384 && self.medium.len() < self.medium_max {
            unsafe { std::ptr::write_bytes(buffer.as_ptr() as *mut u8, 0, len); }
            self.medium.push_back(unsafe { Box::from_raw(Box::into_raw(buffer) as *mut [u8; 16384]) });
        } else if len <= 65536 && self.large.len() < self.large_max {
            // Don't zero large buffers by default (perf trade-off)
            self.large.push_back(unsafe { Box::from_raw(Box::into_raw(buffer) as *mut [u8; 65536]) });
        }
        // If pool is full, buffer is dropped (deallocated)
    }
}
```

### 3. Connection Object Slab Allocator

```rust
/// Slab allocator for connection objects
/// O(1) alloc and free, excellent cache locality
struct ConnectionSlab {
    entries: Vec<SlabEntry>,
    free_head: Option<usize>,
    len: usize,
    capacity: usize,
}

enum SlabEntry {
    Occupied(Connection),
    Vacant { next_free: Option<usize> },
}

impl ConnectionSlab {
    fn new(capacity: usize) -> Self {
        let mut entries = Vec::with_capacity(capacity);
        
        // Pre-allocate and chain free list
        for i in 0..capacity {
            entries.push(SlabEntry::Vacant {
                next_free: if i + 1 < capacity { Some(i + 1) } else { None },
            });
        }
        
        ConnectionSlab {
            entries,
            free_head: if capacity > 0 { Some(0) } else { None },
            len: 0,
            capacity,
        }
    }
    
    fn insert(&mut self, conn: Connection) -> Option<usize> {
        let slot = self.free_head?;
        
        // Update free list
        if let SlabEntry::Vacant { next_free } = self.entries[slot] {
            self.free_head = next_free;
        }
        
        self.entries[slot] = SlabEntry::Occupied(conn);
        self.len += 1;
        Some(slot)
    }
    
    fn remove(&mut self, slot: usize) -> Option<Connection> {
        match std::mem::replace(
            &mut self.entries[slot],
            SlabEntry::Vacant { next_free: self.free_head }
        ) {
            SlabEntry::Occupied(conn) => {
                self.free_head = Some(slot);
                self.len -= 1;
                Some(conn)
            },
            vacant => {
                self.entries[slot] = vacant;
                None
            }
        }
    }
}
```

## File Descriptor Management

### 1. Open File Cache
```rust
/// Cache open file descriptors and metadata to avoid repeated stat() + open() calls
struct OpenFileCache {
    entries: HashMap<PathBuf, CachedFile>,
    lru: LruTracker<PathBuf>,
    max_entries: usize,
    inactive_timeout: Duration,
    min_uses: u32,       // Only cache after N accesses
    valid_interval: Duration, // Re-stat interval to check for changes
}

struct CachedFile {
    fd: RawFd,
    size: u64,
    mtime: SystemTime,
    etag: String,
    content_type: &'static str,
    hit_count: u32,
    last_used: Instant,
    last_validated: Instant,
    mmap_addr: Option<*const u8>,  // If mmap'd
}

impl OpenFileCache {
    fn get(&mut self, path: &Path) -> Result<&CachedFile, FileError> {
        if let Some(entry) = self.entries.get_mut(path) {
            entry.hit_count += 1;
            entry.last_used = Instant::now();
            
            // Periodically re-validate (check if file changed)
            if entry.last_validated.elapsed() > self.valid_interval {
                let metadata = std::fs::metadata(path)?;
                if metadata.modified()? != entry.mtime || metadata.len() != entry.size {
                    // File changed, invalidate
                    self.invalidate(path);
                    return self.open_and_cache(path);
                }
                entry.last_validated = Instant::now();
            }
            
            self.lru.touch(path);
            return Ok(entry);
        }
        
        self.open_and_cache(path)
    }
    
    fn open_and_cache(&mut self, path: &Path) -> Result<&CachedFile, FileError> {
        let metadata = std::fs::metadata(path)?;
        let fd = open(path, O_RDONLY | O_CLOEXEC)?;
        
        let size = metadata.len();
        let mtime = metadata.modified()?;
        let etag = format!("\"{:x}-{:x}-{:x}\"",
            metadata.ino(), size, mtime_to_epoch(mtime));
        let content_type = detect_mime_type(path);
        
        // Optionally mmap small, frequently-accessed files
        let mmap_addr = if size <= 65536 && size > 0 {
            let addr = unsafe {
                mmap(std::ptr::null_mut(), size as usize, PROT_READ,
                     MAP_SHARED | MAP_POPULATE, fd, 0)
            };
            if addr != MAP_FAILED { Some(addr as *const u8) } else { None }
        } else {
            None
        };
        
        // Evict if cache is full
        while self.entries.len() >= self.max_entries {
            if let Some(evicted) = self.lru.evict_oldest() {
                self.close_cached_file(&evicted);
                self.entries.remove(&evicted);
            }
        }
        
        let entry = CachedFile {
            fd, size, mtime, etag, content_type,
            hit_count: 1,
            last_used: Instant::now(),
            last_validated: Instant::now(),
            mmap_addr,
        };
        
        self.entries.insert(path.to_owned(), entry);
        self.lru.insert(path.to_owned());
        
        Ok(self.entries.get(path).unwrap())
    }
    
    fn close_cached_file(&self, path: &Path) {
        if let Some(entry) = self.entries.get(path) {
            if let Some(addr) = entry.mmap_addr {
                unsafe { munmap(addr as *mut _, entry.size as usize); }
            }
            close(entry.fd);
        }
    }
}
```

### 2. File Descriptor Limits
```rust
struct FdManager {
    soft_limit: u64,
    hard_limit: u64,
    reserved_fds: u64,      // For logging, upstream connections, etc.
    available_for_clients: u64,
}

impl FdManager {
    fn init() -> Result<Self, Error> {
        let (soft, hard) = getrlimit(RLIMIT_NOFILE)?;
        
        // Try to raise soft limit to hard limit
        if soft < hard {
            setrlimit(RLIMIT_NOFILE, hard, hard)?;
        }
        
        let reserved = 128; // Logging, upstream, signals, etc.
        let available = hard.saturating_sub(reserved);
        
        // Each client connection uses 1 fd (2 if proxying)
        log::info!("Max client connections: ~{}", available / 2);
        
        Ok(FdManager {
            soft_limit: hard,
            hard_limit: hard,
            reserved_fds: reserved,
            available_for_clients: available,
        })
    }
}
```

## Zero-Copy I/O Strategies

### 1. sendfile() for Static Files
```rust
/// Send a file to a socket without copying data through userspace
fn sendfile_response(client_fd: RawFd, file_fd: RawFd, 
                     offset: u64, length: u64) -> io::Result<u64> {
    let mut total_sent: u64 = 0;
    let mut off = offset as i64;
    
    // Enable TCP_CORK to batch headers + file data
    setsockopt(client_fd, IPPROTO_TCP, TCP_CORK, &1)?;
    
    while total_sent < length {
        let remaining = (length - total_sent) as usize;
        let chunk_size = remaining.min(2 * 1024 * 1024); // 2MB chunks
        
        let sent = unsafe {
            libc::sendfile(client_fd, file_fd, &mut off, chunk_size)
        };
        
        if sent < 0 {
            let err = io::Error::last_os_error();
            if err.kind() == io::ErrorKind::WouldBlock {
                // Would block — register for EPOLLOUT and return
                return Ok(total_sent);
            }
            return Err(err);
        }
        
        if sent == 0 {
            break; // EOF
        }
        
        total_sent += sent as u64;
    }
    
    // Release TCP_CORK to flush
    setsockopt(client_fd, IPPROTO_TCP, TCP_CORK, &0)?;
    
    Ok(total_sent)
}
```

### 2. writev() for Scatter-Gather I/O
```rust
/// Send multiple buffers in a single syscall (headers + body chunks)
fn writev_response(client_fd: RawFd, 
                   header_bytes: &[u8], 
                   body_chunks: &[&[u8]]) -> io::Result<usize> {
    let mut iovecs: Vec<libc::iovec> = Vec::with_capacity(1 + body_chunks.len());
    
    // First iovec: HTTP response headers
    iovecs.push(libc::iovec {
        iov_base: header_bytes.as_ptr() as *mut _,
        iov_len: header_bytes.len(),
    });
    
    // Remaining iovecs: body chunks
    for chunk in body_chunks {
        iovecs.push(libc::iovec {
            iov_base: chunk.as_ptr() as *mut _,
            iov_len: chunk.len(),
        });
    }
    
    let written = unsafe {
        libc::writev(client_fd, iovecs.as_ptr(), iovecs.len() as i32)
    };
    
    if written < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(written as usize)
    }
}
```

### 3. mmap() for Hot Content
```rust
/// Memory-map frequently accessed files for optimal serving
struct MmapCache {
    mappings: HashMap<PathBuf, MmapEntry>,
    total_mapped: usize,
    max_total_mapped: usize,    // Don't over-commit virtual memory
    max_file_size: usize,       // Only mmap files smaller than this
}

struct MmapEntry {
    addr: *const u8,
    length: usize,
    fd: RawFd,
    ref_count: AtomicU32,       // How many concurrent responses reference this
}

impl MmapCache {
    fn get_or_map(&mut self, path: &Path, fd: RawFd, size: usize) -> Option<&MmapEntry> {
        if size > self.max_file_size || self.total_mapped + size > self.max_total_mapped {
            return None; // Too large or would exceed budget
        }
        
        if !self.mappings.contains_key(path) {
            let addr = unsafe {
                libc::mmap(
                    std::ptr::null_mut(),
                    size,
                    libc::PROT_READ,
                    libc::MAP_SHARED | libc::MAP_POPULATE,  // Prefault pages
                    fd,
                    0,
                )
            };
            
            if addr == libc::MAP_FAILED {
                return None;
            }
            
            // Advise kernel about access pattern
            unsafe {
                libc::madvise(addr as *mut _, size, libc::MADV_SEQUENTIAL);
            }
            
            self.mappings.insert(path.to_owned(), MmapEntry {
                addr: addr as *const u8,
                length: size,
                fd,
                ref_count: AtomicU32::new(0),
            });
            self.total_mapped += size;
        }
        
        self.mappings.get(path)
    }
}

// Using mmap'd file in response
impl MmapEntry {
    fn as_slice(&self) -> &[u8] {
        unsafe { std::slice::from_raw_parts(self.addr, self.length) }
    }
}
```

## TLS Memory Management

### 1. TLS Session Cache
```rust
/// Shared TLS session cache across workers for session resumption
struct TlsSessionCache {
    // Bounded LRU cache of session tickets/IDs
    sessions: Mutex<LruCache<Vec<u8>, TlsSession>>,
    max_entries: usize,
    timeout: Duration,
}

struct TlsSession {
    data: Vec<u8>,
    created_at: Instant,
    last_used: Instant,
}

impl TlsSessionCache {
    fn new(max_entries: usize, timeout: Duration) -> Self {
        // Memory budget: ~2KB per session × max_entries
        // 10,000 sessions ≈ 20MB
        TlsSessionCache {
            sessions: Mutex::new(LruCache::new(max_entries)),
            max_entries,
            timeout,
        }
    }
}
```

### 2. TLS Buffer Management
```
TLS Record Sizes:
  - Max TLS record: 16,384 bytes (16KB)
  - Typical allocation per TLS connection: 2 × 16KB = 32KB
  - With buffering optimization: 1 × 16KB + dynamic read buffer
  
Optimization: Dynamic TLS Buffer Sizing
  - Initial TLS buffer: 4KB (most requests < 4KB)
  - Grow to 16KB only when needed
  - After handshake, shrink back to 4KB for keep-alive idle
  
Memory Saving:
  - 10,000 connections × 32KB = 320MB (naive)
  - 10,000 connections × 4KB  = 40MB  (optimized idle)
  - 8× reduction for idle keep-alive connections
```

## Response Cache Memory

### 1. Cache Memory Budget
```rust
struct CacheMemoryManager {
    max_memory: usize,          // Total cache memory budget
    current_memory: AtomicUsize,
    
    // Per-category budgets
    static_cache_max: usize,    // Cached static file responses
    proxy_cache_max: usize,     // Cached upstream responses
    
    // Eviction triggers
    high_watermark: usize,      // Start evicting (90% of max)
    low_watermark: usize,       // Stop evicting (70% of max)
}

impl CacheMemoryManager {
    fn can_cache(&self, size: usize) -> bool {
        let current = self.current_memory.load(Ordering::Acquire);
        current + size <= self.high_watermark
    }
    
    fn should_evict(&self) -> bool {
        self.current_memory.load(Ordering::Acquire) > self.high_watermark
    }
    
    fn evict_until_low_watermark(&self, cache: &mut ResponseCache) {
        while self.current_memory.load(Ordering::Acquire) > self.low_watermark {
            if let Some(evicted_size) = cache.evict_lru() {
                self.current_memory.fetch_sub(evicted_size, Ordering::Release);
            } else {
                break;
            }
        }
    }
}
```

## Memory Pressure Handling

### 1. Backpressure System
```rust
#[derive(Debug, Clone, Copy)]
enum MemoryPressure {
    Normal,      // < 70% of budget
    Elevated,    // 70-85% — reduce cache sizes
    High,        // 85-95% — stop caching, close idle connections
    Critical,    // > 95% — reject new connections, emergency cleanup
}

struct MemoryPressureHandler {
    total_budget: usize,
    current_usage: AtomicUsize,
}

impl MemoryPressureHandler {
    fn current_pressure(&self) -> MemoryPressure {
        let usage_pct = (self.current_usage.load(Ordering::Relaxed) * 100) / self.total_budget;
        match usage_pct {
            0..=69 => MemoryPressure::Normal,
            70..=84 => MemoryPressure::Elevated,
            85..=94 => MemoryPressure::High,
            _ => MemoryPressure::Critical,
        }
    }
    
    fn apply_pressure_response(&self, pressure: MemoryPressure, server: &mut ServerState) {
        match pressure {
            MemoryPressure::Normal => {},
            
            MemoryPressure::Elevated => {
                // Shrink caches
                server.response_cache.shrink_to(70); // percent
                server.open_file_cache.shrink_to(70);
            },
            
            MemoryPressure::High => {
                // Aggressive cleanup
                server.response_cache.clear();
                server.close_idle_keepalive_connections();
                server.reduce_buffer_pool_sizes(50); // percent
            },
            
            MemoryPressure::Critical => {
                // Emergency mode
                server.stop_accepting_connections();
                server.close_oldest_connections(25); // percent
                // Will resume accepting when pressure drops
            },
        }
    }
}
```

### 2. Connection Memory Lifecycle
```
Connection Lifecycle Memory:

1. ACCEPT (allocate connection slot: ~128 bytes)
   └── Slab allocator: O(1), no heap allocation

2. TLS HANDSHAKE (allocate TLS state: ~20KB)
   └── TLS buffer from pool, session state

3. READ HEADERS (allocate read buffer: 4KB)
   └── Buffer from pool, grows if needed

4. PROCESS (allocate response state: ~1KB)
   └── Response builder, filter state

5. SEND RESPONSE (allocate write buffer: 4KB or use sendfile)
   └── Buffer from pool, or zero-copy

6. KEEP-ALIVE (release most buffers, keep connection: ~2KB)
   └── Return read/write buffers to pool
   └── Shrink TLS buffers to minimum
   └── Reset parser state

7. CLOSE (release everything)
   └── Return all buffers to pool
   └── Return TLS state to pool
   └── Return connection slot to slab
```

## Configuration Guidelines

### Memory Sizing Recommendations

```yaml
# Small deployment (< 1,000 concurrent connections, 2GB RAM)
memory:
  worker_connections: 1024
  buffer_pools:
    small: { count: 256, size: "4KB" }    # 1 MB
    medium: { count: 64, size: "16KB" }   # 1 MB
    large: { count: 16, size: "64KB" }    # 1 MB
  open_file_cache: 1000
  response_cache: "64MB"
  tls_session_cache: "5MB"    # ~2,500 sessions

# Medium deployment (< 10,000 connections, 8GB RAM)
memory:
  worker_connections: 4096
  buffer_pools:
    small: { count: 1024, size: "4KB" }   # 4 MB
    medium: { count: 256, size: "16KB" }  # 4 MB
    large: { count: 64, size: "64KB" }    # 4 MB
  open_file_cache: 10000
  response_cache: "512MB"
  tls_session_cache: "50MB"   # ~25,000 sessions

# Large deployment (< 100,000 connections, 32GB RAM)
memory:
  worker_connections: 32768
  buffer_pools:
    small: { count: 4096, size: "4KB" }    # 16 MB
    medium: { count: 1024, size: "16KB" }  # 16 MB
    large: { count: 256, size: "64KB" }    # 16 MB
  open_file_cache: 100000
  response_cache: "4GB"
  tls_session_cache: "500MB"  # ~250,000 sessions
```

### Memory Monitoring Metrics
```
Metrics to expose:
  - webserver_memory_total_bytes            # RSS from /proc/self/status
  - webserver_memory_heap_bytes             # Heap usage
  - webserver_buffer_pool_allocated{size}   # Buffers currently in use
  - webserver_buffer_pool_available{size}   # Buffers available in pool
  - webserver_connections_active            # Current active connections
  - webserver_connections_idle              # Keep-alive idle connections
  - webserver_open_file_cache_entries       # Cached file descriptors
  - webserver_response_cache_bytes          # Response cache memory
  - webserver_tls_session_cache_entries     # TLS session cache size
  - webserver_memory_pressure               # Current pressure level (0-3)
```

This memory profile provides the foundation for implementing memory-efficient web servers that scale to hundreds of thousands of concurrent connections while maintaining bounded, predictable memory usage.
