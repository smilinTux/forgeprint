# Web Server Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing production-grade web servers. It covers fundamental design decisions, concurrency models, request processing pipelines, memory management strategies, and system interactions that determine scalability, performance, and reliability.

## Architectural Foundations

### 1. Core Architecture Patterns

#### Event-Driven Architecture (Recommended — Nginx Model)
**Single-threaded event loop per worker process using non-blocking I/O**

This is the dominant architecture for high-performance web servers. Each worker process runs a single-threaded event loop that handles thousands of concurrent connections without creating a thread per connection.

```rust
struct EventLoopWorker {
    epoll_fd: RawFd,                          // epoll (Linux), kqueue (BSD/macOS)
    listen_fds: Vec<RawFd>,                   // One per listen socket
    connections: Slab<Connection>,             // Indexed by slot, not fd
    fd_to_slot: HashMap<RawFd, usize>,        // Map fd → connection slot
    timer_wheel: TimerWheel,                  // Hierarchical timer wheel
    event_buffer: Vec<EpollEvent>,            // Reusable event buffer
    buffer_pool: BufferPool,                  // Pre-allocated I/O buffers
    config: Arc<ServerConfig>,                // Shared immutable config
    shutdown_requested: bool,
}

impl EventLoopWorker {
    fn run(&mut self) -> Result<(), Error> {
        loop {
            if self.shutdown_requested && self.connections.is_empty() {
                return Ok(());
            }
            
            // Calculate timeout from nearest timer
            let timeout_ms = self.timer_wheel.next_expiry_ms().unwrap_or(1000);
            
            // Wait for I/O events
            let num_events = epoll_wait(
                self.epoll_fd,
                &mut self.event_buffer,
                timeout_ms as i32,
            )?;
            
            // Process I/O events
            for i in 0..num_events {
                let event = &self.event_buffer[i];
                let fd = event.data as RawFd;
                
                if self.listen_fds.contains(&fd) {
                    self.accept_connections(fd)?;
                } else if let Some(&slot) = self.fd_to_slot.get(&fd) {
                    let readable = event.events & EPOLLIN != 0;
                    let writable = event.events & EPOLLOUT != 0;
                    let error = event.events & (EPOLLERR | EPOLLHUP) != 0;
                    
                    if error {
                        self.close_connection(slot);
                    } else {
                        if readable { self.handle_read(slot)?; }
                        if writable { self.handle_write(slot)?; }
                    }
                }
            }
            
            // Process expired timers
            self.timer_wheel.advance(current_time_ms());
            while let Some(timer_event) = self.timer_wheel.pop_expired() {
                self.handle_timer(timer_event);
            }
            
            // Process deferred tasks (e.g., connection close after response sent)
            self.process_deferred_tasks();
        }
    }
    
    fn accept_connections(&mut self, listen_fd: RawFd) -> Result<(), Error> {
        // Accept in a loop until EAGAIN (edge-triggered mode)
        loop {
            match accept4(listen_fd, SOCK_NONBLOCK | SOCK_CLOEXEC) {
                Ok((client_fd, client_addr)) => {
                    if self.connections.len() >= self.config.worker_connections {
                        close(client_fd); // At capacity, reject
                        continue;
                    }
                    
                    // Register with epoll (edge-triggered)
                    epoll_ctl(self.epoll_fd, EPOLL_CTL_ADD, client_fd, 
                              EPOLLIN | EPOLLET)?;
                    
                    // Create connection object
                    let slot = self.connections.insert(Connection::new(
                        client_fd, client_addr, &self.buffer_pool
                    ));
                    self.fd_to_slot.insert(client_fd, slot);
                    
                    // Set connection timeout
                    self.timer_wheel.schedule(
                        slot, 
                        self.config.client_header_timeout_ms,
                        TimerKind::HeaderTimeout
                    );
                },
                Err(e) if e.kind() == ErrorKind::WouldBlock => break,
                Err(e) => return Err(e.into()),
            }
        }
        Ok(())
    }
}
```

**Benefits:**
- Handle 10,000–1,000,000 concurrent connections per worker
- Minimal memory overhead (~2KB per idle connection)
- No thread synchronization within a worker
- Predictable, low-jitter latency
- Excellent CPU cache locality

**Considerations:**
- CPU-bound operations (compression, TLS) can block the event loop
- Must be careful never to call blocking syscalls
- Requires state machine programming style
- File I/O needs either thread pool offloading or AIO

#### Thread-Per-Connection Architecture (Apache prefork/worker)
**Dedicated thread or process for each connection**

```rust
struct ThreadPerConnectionServer {
    listener: TcpListener,
    thread_pool: ThreadPool,
    config: Arc<ServerConfig>,
}

impl ThreadPerConnectionServer {
    fn run(&self) {
        loop {
            let (stream, addr) = self.listener.accept().unwrap();
            let config = self.config.clone();
            
            self.thread_pool.execute(move || {
                let mut handler = ConnectionHandler::new(stream, addr, config);
                handler.handle_connection(); // Blocking I/O is fine here
            });
        }
    }
}

struct ConnectionHandler {
    stream: TcpStream,
    client_addr: SocketAddr,
    config: Arc<ServerConfig>,
    read_buffer: Vec<u8>,
    write_buffer: Vec<u8>,
}

impl ConnectionHandler {
    fn handle_connection(&mut self) {
        // Set socket timeouts
        self.stream.set_read_timeout(Some(self.config.read_timeout)).unwrap();
        self.stream.set_write_timeout(Some(self.config.write_timeout)).unwrap();
        
        // Optional: TLS handshake
        let mut stream = self.maybe_tls_handshake();
        
        // Keep-alive loop
        loop {
            // Read and parse request (blocking)
            let request = match self.read_request(&mut stream) {
                Ok(req) => req,
                Err(_) => break, // Connection error or timeout
            };
            
            // Process request
            let response = self.process_request(&request);
            
            // Write response (blocking)
            if self.write_response(&mut stream, &response).is_err() {
                break;
            }
            
            // Check keep-alive
            if !request.is_keep_alive() || self.should_close() {
                break;
            }
        }
    }
}
```

**Benefits:**
- Simple, linear programming model
- Blocking I/O is natural and safe
- Good for CPU-intensive workloads per request
- Easy to debug with standard tools

**Limitations:**
- Memory: ~8MB stack per thread (default), limiting to ~1,000 concurrent connections per GB
- Context switching overhead grows with connection count
- Thread creation/destruction overhead
- Poor scalability beyond a few thousand connections

#### Hybrid Architecture (Advanced — H2O, LiteSpeed Model)
**Event loop for I/O with thread pool for CPU-bound tasks**

```rust
struct HybridWebServer {
    event_workers: Vec<EventLoopWorker>,
    cpu_thread_pool: ThreadPool,      // For compression, TLS, file I/O
    shared_cache: Arc<ResponseCache>,
    config: Arc<ServerConfig>,
}

impl HybridWebServer {
    fn start(&mut self) {
        // Spawn one event-loop worker per CPU core
        let num_workers = num_cpus::get();
        
        for worker_id in 0..num_workers {
            let config = self.config.clone();
            let cache = self.shared_cache.clone();
            let cpu_pool = self.cpu_thread_pool.clone();
            
            std::thread::spawn(move || {
                let mut worker = EventLoopWorker::new(worker_id, config, cache);
                
                // The event loop runs on this thread
                // CPU-bound tasks are offloaded to cpu_thread_pool:
                //   - gzip/brotli compression
                //   - TLS handshake (RSA operations)
                //   - File stat() and open() calls
                //   - Response body generation
                worker.run_with_offload(cpu_pool);
            });
        }
    }
}

// Offloading pattern for CPU-intensive work
impl EventLoopWorker {
    fn handle_compression_needed(&mut self, slot: usize, body: Vec<u8>) {
        let completion_fd = self.create_eventfd(); // For notification
        let cpu_pool = self.cpu_pool.clone();
        
        // Offload compression to thread pool
        cpu_pool.execute(move || {
            let compressed = gzip_compress(&body, 6);
            // Notify event loop that compression is complete
            write_eventfd(completion_fd, compressed);
        });
        
        // Event loop continues processing other connections
        // When eventfd becomes readable, compressed data is sent
    }
}
```

**Benefits:**
- Event-driven scalability for I/O
- Thread pool handles CPU-bound work without blocking event loop
- Optimal CPU utilization across all cores
- Best throughput for mixed workloads

**Considerations:**
- Most complex to implement correctly
- Requires careful task scheduling
- Cross-thread communication overhead
- Cache coherence concerns for shared data

### 2. Connection State Machine

The connection state machine is the heart of an event-driven web server. Every connection transitions through well-defined states, with each state knowing exactly what I/O operations are needed.

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
enum ConnectionState {
    // Connection establishment
    Accepting,              // Just accepted, setting up
    TlsHandshaking,         // TLS handshake in progress
    
    // Request reading
    ReadingRequestLine,     // Reading "GET /path HTTP/1.1\r\n"
    ReadingHeaders,         // Reading header lines until \r\n\r\n
    ReadingBody,            // Reading request body (Content-Length or chunked)
    ReadingChunkedBody,     // Reading chunked transfer encoding
    
    // Request processing
    ProcessingRequest,      // Matched location, running handler
    
    // Upstream proxy states
    ConnectingUpstream,     // Connecting to backend
    SendingUpstreamRequest, // Forwarding request to backend
    ReadingUpstreamHeaders, // Reading backend response headers
    ReadingUpstreamBody,    // Reading backend response body
    
    // Response writing
    WritingResponseHeaders, // Sending HTTP status + headers
    WritingResponseBody,    // Sending response body
    WritingChunkedBody,     // Sending chunked response body
    
    // WebSocket tunnel
    WebSocketTunnel,        // Bidirectional frame forwarding
    
    // Connection management
    KeepAliveWait,          // Waiting for next request on persistent connection
    Lingering,              // Reading and discarding remaining data before close
    Closing,                // Shutting down connection
}

impl ConnectionState {
    /// What epoll events does this state need?
    fn needed_events(&self) -> u32 {
        use ConnectionState::*;
        match self {
            ReadingRequestLine | ReadingHeaders | ReadingBody | 
            ReadingChunkedBody | ReadingUpstreamHeaders | ReadingUpstreamBody |
            KeepAliveWait | Lingering => EPOLLIN,
            
            WritingResponseHeaders | WritingResponseBody | WritingChunkedBody |
            SendingUpstreamRequest | ConnectingUpstream => EPOLLOUT,
            
            TlsHandshaking => EPOLLIN | EPOLLOUT, // TLS needs both
            
            WebSocketTunnel => EPOLLIN | EPOLLOUT, // Bidirectional
            
            _ => 0,
        }
    }
}
```

#### State Transition Diagram
```
                        ┌───────────┐
         TCP accept ──▶ │ Accepting │
                        └─────┬─────┘
                              │
              ┌───────────────┼───────────────┐
              │ (HTTPS)       │ (HTTP)        │
              ▼               │               │
     ┌────────────────┐      │               │
     │ TlsHandshaking │      │               │
     └───────┬────────┘      │               │
              │               │               │
              ▼               ▼               │
     ┌──────────────────────────┐             │
     │   ReadingRequestLine     │◀────────────┘
     └───────────┬──────────────┘
                 │ Found \r\n (end of request line)
                 ▼
     ┌──────────────────────────┐
     │    ReadingHeaders        │
     └───────────┬──────────────┘
                 │ Found \r\n\r\n (end of headers)
                 │
        ┌────────┼────────────┐
        │ (has body)          │ (no body: GET/HEAD)
        ▼                     ▼
  ┌──────────────┐   ┌──────────────────┐
  │ ReadingBody  │   │ProcessingRequest │
  └──────┬───────┘   └────────┬─────────┘
         │                    │
         ▼                    │
  ┌──────────────────┐       │
  │ProcessingRequest │       │
  └────────┬─────────┘       │
           │                  │
   ┌───────┼─────────────────┼────────────────┐
   │(static)     │(proxy)    │(CGI/FastCGI)   │
   ▼             ▼           ▼                │
  [Read     [Connect    [Execute              │
   File]     Upstream]   Script]              │
   │             │           │                │
   ▼             ▼           ▼                │
  ┌──────────────────────────────────────┐    │
  │       WritingResponseHeaders         │◀───┘
  └──────────────┬───────────────────────┘
                 │
                 ▼
  ┌──────────────────────────────────────┐
  │        WritingResponseBody           │
  └──────────────┬───────────────────────┘
                 │
        ┌────────┼─────────┐
        │ (keep-alive)     │ (close)
        ▼                  ▼
  ┌──────────────┐   ┌──────────┐
  │KeepAliveWait │   │ Closing  │
  └──────┬───────┘   └──────────┘
         │ (new request arrives)
         └──▶ ReadingRequestLine
```

### 3. Request Parsing Pipeline

#### Zero-Copy HTTP Parser
The HTTP parser is the most performance-critical component. It must parse HTTP without unnecessary memory copies.

```rust
struct HttpParser {
    state: ParserState,
    // Positions are offsets into the connection's read buffer
    method_start: usize,
    method_end: usize,
    uri_start: usize,
    uri_end: usize,
    version_start: usize,
    version_end: usize,
    headers: SmallVec<[HeaderSlice; 32]>,  // Inline storage for common case
    content_length: Option<u64>,
    chunked: bool,
    keep_alive: bool,
    host: Option<HeaderSlice>,
}

/// A header represented as byte offsets into the read buffer (zero-copy)
#[derive(Clone, Copy)]
struct HeaderSlice {
    name_start: u16,
    name_end: u16,
    value_start: u16,
    value_end: u16,
}

#[derive(Debug, Clone, Copy)]
enum ParserState {
    RequestLine,
    HeaderLine,
    HeaderValue,
    HeaderValueLWS,    // Linear whitespace (header folding)
    ChunkSize,
    ChunkData,
    ChunkTrailer,
    Complete,
    Error(ParserError),
}

impl HttpParser {
    /// Parse as much as possible from the buffer. Returns how many bytes consumed.
    /// This is designed to be called incrementally as data arrives.
    fn parse(&mut self, buffer: &[u8], offset: usize) -> ParseResult {
        let mut pos = offset;
        
        while pos < buffer.len() {
            match self.state {
                ParserState::RequestLine => {
                    // Scan for \r\n
                    if let Some(eol) = find_crlf(&buffer[pos..]) {
                        let line = &buffer[pos..pos + eol];
                        self.parse_request_line(line, pos)?;
                        pos += eol + 2; // Skip \r\n
                        self.state = ParserState::HeaderLine;
                    } else {
                        // Check limits
                        if pos - self.method_start > MAX_REQUEST_LINE_SIZE {
                            return ParseResult::Error(ParserError::RequestLineTooLong);
                        }
                        return ParseResult::NeedMore(pos);
                    }
                },
                
                ParserState::HeaderLine => {
                    if buffer[pos] == b'\r' && buffer.get(pos + 1) == Some(&b'\n') {
                        // Empty line = end of headers
                        pos += 2;
                        self.finalize_headers();
                        self.state = ParserState::Complete;
                        return ParseResult::Complete(pos);
                    }
                    
                    if let Some(eol) = find_crlf(&buffer[pos..]) {
                        let line = &buffer[pos..pos + eol];
                        self.parse_header_line(line, pos)?;
                        pos += eol + 2;
                        
                        if self.headers.len() > MAX_HEADER_COUNT {
                            return ParseResult::Error(ParserError::TooManyHeaders);
                        }
                    } else {
                        return ParseResult::NeedMore(pos);
                    }
                },
                
                _ => { /* chunk parsing states */ }
            }
        }
        
        ParseResult::NeedMore(pos)
    }
    
    fn parse_request_line(&mut self, line: &[u8], base_offset: usize) -> Result<(), ParserError> {
        // "GET /path HTTP/1.1"
        let mut iter = line.iter().enumerate();
        
        // Parse method
        self.method_start = base_offset;
        let method_end = line.iter().position(|&b| b == b' ')
            .ok_or(ParserError::BadRequestLine)?;
        self.method_end = base_offset + method_end;
        
        // Parse URI
        self.uri_start = base_offset + method_end + 1;
        let uri_end = line[method_end + 1..].iter().position(|&b| b == b' ')
            .ok_or(ParserError::BadRequestLine)?;
        self.uri_end = self.uri_start + uri_end;
        
        // Validate URI length
        if self.uri_end - self.uri_start > MAX_URI_SIZE {
            return Err(ParserError::UriTooLong);
        }
        
        // Parse version
        self.version_start = self.uri_end + 1;
        self.version_end = base_offset + line.len();
        
        // Validate version
        let version = &line[self.version_start - base_offset..];
        match version {
            b"HTTP/1.0" => self.keep_alive = false,
            b"HTTP/1.1" => self.keep_alive = true,
            _ => return Err(ParserError::UnsupportedVersion),
        }
        
        Ok(())
    }
}
```

#### Request Processing After Parsing
```rust
struct ParsedRequest<'buf> {
    method: &'buf [u8],
    uri: &'buf [u8],
    version: HttpVersion,
    headers: &'buf [HeaderSlice],
    host: Option<&'buf [u8]>,
    content_length: Option<u64>,
    is_chunked: bool,
    is_keep_alive: bool,
    
    // Parsed URI components
    path: &'buf [u8],          // "/path/to/resource"
    query: Option<&'buf [u8]>, // "key=value&key2=value2"
    fragment: Option<&'buf [u8]>,
}

impl<'buf> ParsedRequest<'buf> {
    /// Decode percent-encoded path and normalize it
    fn normalized_path(&self) -> Result<Vec<u8>, PathError> {
        let mut result = Vec::with_capacity(self.path.len());
        let mut i = 0;
        
        while i < self.path.len() {
            match self.path[i] {
                b'%' => {
                    // Decode %XX
                    if i + 2 >= self.path.len() {
                        return Err(PathError::InvalidPercentEncoding);
                    }
                    let high = hex_digit(self.path[i + 1])?;
                    let low = hex_digit(self.path[i + 2])?;
                    let byte = (high << 4) | low;
                    
                    // Reject null bytes
                    if byte == 0 {
                        return Err(PathError::NullByte);
                    }
                    result.push(byte);
                    i += 3;
                },
                b'\\' => {
                    // Normalize backslash to forward slash
                    result.push(b'/');
                    i += 1;
                },
                b => {
                    result.push(b);
                    i += 1;
                }
            }
        }
        
        // Resolve . and .. components
        self.resolve_dot_segments(&mut result)?;
        
        Ok(result)
    }
    
    fn resolve_dot_segments(&self, path: &mut Vec<u8>) -> Result<(), PathError> {
        let mut segments: Vec<&[u8]> = path.split(|&b| b == b'/').collect();
        let mut resolved = Vec::new();
        
        for segment in segments {
            match segment {
                b"." => {},       // Skip current dir
                b".." => {
                    if resolved.is_empty() {
                        return Err(PathError::TraversalAttempt);
                    }
                    resolved.pop(); // Go up one level
                },
                s => resolved.push(s),
            }
        }
        
        *path = resolved.join(&b'/');
        Ok(())
    }
}
```

### 4. Response Generation Pipeline

```rust
struct ResponseBuilder {
    status: u16,
    reason: &'static str,
    headers: Vec<(String, String)>,
    body_source: BodySource,
}

enum BodySource {
    Empty,
    Buffer(Vec<u8>),
    File { fd: RawFd, offset: u64, length: u64 },
    Chunked(Box<dyn ChunkedProducer>),
    Streaming(Box<dyn AsyncRead>),
}

impl ResponseBuilder {
    fn build_header_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(512);
        
        // Status line
        write!(buf, "HTTP/1.1 {} {}\r\n", self.status, self.reason).unwrap();
        
        // Headers
        for (name, value) in &self.headers {
            write!(buf, "{}: {}\r\n", name, value).unwrap();
        }
        
        // Server header
        buf.extend_from_slice(b"Server: WebServer/1.0\r\n");
        
        // Date header (cached, updated once per second)
        write!(buf, "Date: {}\r\n", cached_http_date()).unwrap();
        
        // End of headers
        buf.extend_from_slice(b"\r\n");
        
        buf
    }
}

/// Send response using optimal I/O strategy
fn send_response(conn: &mut Connection, response: &ResponseBuilder) -> io::Result<()> {
    // Write headers
    let header_bytes = response.build_header_bytes();
    conn.write_buffer.extend_from_slice(&header_bytes);
    
    match &response.body_source {
        BodySource::Empty => {
            // Just headers, flush write buffer
            conn.flush_write_buffer()?;
        },
        
        BodySource::Buffer(data) => {
            // Small body: append to write buffer
            conn.write_buffer.extend_from_slice(data);
            conn.flush_write_buffer()?;
        },
        
        BodySource::File { fd, offset, length } => {
            // Large file: use TCP_CORK + sendfile for zero-copy
            conn.set_tcp_cork(true)?;
            conn.flush_write_buffer()?; // Send headers
            
            // sendfile: kernel transfers directly from page cache to socket
            let mut sent = 0u64;
            let mut off = *offset as i64;
            while sent < *length {
                let n = sendfile(conn.fd, *fd, &mut off, (*length - sent) as usize)?;
                if n == 0 { break; }
                sent += n as u64;
            }
            
            conn.set_tcp_cork(false)?; // Flush final packet
        },
        
        BodySource::Chunked(producer) => {
            conn.flush_write_buffer()?; // Send headers
            
            // Send chunks
            loop {
                let chunk = producer.next_chunk()?;
                if chunk.is_empty() {
                    conn.write_all(b"0\r\n\r\n")?; // Final chunk
                    break;
                }
                write!(conn, "{:x}\r\n", chunk.len())?;
                conn.write_all(&chunk)?;
                conn.write_all(b"\r\n")?;
            }
        },
        
        BodySource::Streaming(reader) => {
            // For SSE, WebSocket, or large proxied responses
            conn.flush_write_buffer()?;
            // Copy data as it arrives from upstream
            io::copy(reader.as_mut(), &mut conn.stream)?;
        }
    }
    
    Ok(())
}
```

### 5. Virtual Host Resolution

```rust
struct VirtualHostResolver {
    exact_hosts: HashMap<String, usize>,           // "example.com" → vhost index
    wildcard_prefix: Vec<(String, usize)>,         // "*.example.com" → vhost index
    wildcard_suffix: Vec<(String, usize)>,         // "www.example.*" → vhost index
    regex_hosts: Vec<(Regex, usize)>,              // Compiled regex patterns
    default_host: usize,                           // Fallback vhost index
}

impl VirtualHostResolver {
    fn resolve(&self, hostname: &str) -> usize {
        let hostname_lower = hostname.to_ascii_lowercase();
        
        // 1. Exact match (O(1) hash lookup)
        if let Some(&idx) = self.exact_hosts.get(&hostname_lower) {
            return idx;
        }
        
        // 2. Wildcard prefix match: *.example.com
        for (pattern, &idx) in &self.wildcard_prefix {
            // pattern stored as ".example.com"
            if hostname_lower.ends_with(pattern) {
                return idx;
            }
        }
        
        // 3. Wildcard suffix match: www.example.*
        for (pattern, &idx) in &self.wildcard_suffix {
            if hostname_lower.starts_with(pattern) {
                return idx;
            }
        }
        
        // 4. Regex match (most expensive, evaluated in order)
        for (regex, &idx) in &self.regex_hosts {
            if regex.is_match(&hostname_lower) {
                return idx;
            }
        }
        
        // 5. Default virtual host
        self.default_host
    }
}
```

### 6. Location Matching Engine

```rust
struct LocationMatcher {
    exact_locations: HashMap<String, usize>,        // "= /exact/path" → location index
    prefix_priority: Vec<(String, usize)>,          // "^~ /prefix" → location index
    regex_locations: Vec<(Regex, usize)>,            // "~ pattern" → location index  
    prefix_locations: Vec<(String, usize)>,          // "/prefix" → location index
    // prefix_locations sorted by length (longest first)
}

impl LocationMatcher {
    fn match_location(&self, uri_path: &str) -> Option<usize> {
        // 1. Exact match (highest priority)
        if let Some(&idx) = self.exact_locations.get(uri_path) {
            return Some(idx);
        }
        
        // 2. Find longest prefix match
        let mut best_prefix: Option<(usize, usize)> = None; // (length, index)
        let mut is_priority_prefix = false;
        
        for (prefix, &idx) in &self.prefix_priority {
            if uri_path.starts_with(prefix) && prefix.len() > best_prefix.map_or(0, |b| b.0) {
                best_prefix = Some((prefix.len(), idx));
                is_priority_prefix = true;
            }
        }
        
        if !is_priority_prefix {
            for (prefix, &idx) in &self.prefix_locations {
                if uri_path.starts_with(prefix) && prefix.len() > best_prefix.map_or(0, |b| b.0) {
                    best_prefix = Some((prefix.len(), idx));
                }
            }
        }
        
        // 3. If priority prefix found, use it (skip regex)
        if is_priority_prefix {
            return best_prefix.map(|(_, idx)| idx);
        }
        
        // 4. Try regex matches (first match wins)
        for (regex, &idx) in &self.regex_locations {
            if regex.is_match(uri_path) {
                return Some(idx);
            }
        }
        
        // 5. Use longest prefix match
        best_prefix.map(|(_, idx)| idx)
    }
}
```

### 7. Output Filter Chain

Output filters transform the response before sending to the client. They are chained together and process data in streaming fashion.

```rust
trait OutputFilter: Send {
    /// Called once before body data. Can modify headers.
    fn filter_headers(&mut self, response: &mut ResponseHeaders) -> FilterResult;
    
    /// Called for each chunk of body data. Returns transformed data.
    fn filter_body(&mut self, data: &[u8], is_last: bool) -> FilterResult;
}

enum FilterResult {
    Data(Vec<u8>),   // Pass this data to next filter
    Buffered,        // Data buffered internally, nothing to pass yet
    Error(String),
}

struct FilterChain {
    filters: Vec<Box<dyn OutputFilter>>,
}

impl FilterChain {
    fn new(request: &ParsedRequest, config: &LocationConfig) -> Self {
        let mut filters: Vec<Box<dyn OutputFilter>> = Vec::new();
        
        // Add filters based on configuration and request
        // Order matters: each filter feeds into the next
        
        // 1. Security headers filter (always)
        if config.security_headers_enabled {
            filters.push(Box::new(SecurityHeadersFilter::new(config)));
        }
        
        // 2. CORS filter (if configured)
        if config.cors.is_some() {
            filters.push(Box::new(CorsFilter::new(config.cors.as_ref().unwrap())));
        }
        
        // 3. Compression filter (if client accepts and content is compressible)
        if let Some(encoding) = negotiate_encoding(request, config) {
            match encoding {
                Encoding::Gzip => filters.push(Box::new(GzipFilter::new(config.gzip_level))),
                Encoding::Brotli => filters.push(Box::new(BrotliFilter::new(config.brotli_level))),
                Encoding::Zstd => filters.push(Box::new(ZstdFilter::new(config.zstd_level))),
                _ => {}
            }
        }
        
        // 4. Chunked transfer encoding (if no Content-Length known)
        if config.chunked_transfer {
            filters.push(Box::new(ChunkedEncodingFilter::new()));
        }
        
        FilterChain { filters }
    }
    
    fn process_headers(&mut self, response: &mut ResponseHeaders) {
        for filter in &mut self.filters {
            filter.filter_headers(response);
        }
    }
    
    fn process_body_chunk(&mut self, data: &[u8], is_last: bool) -> Vec<u8> {
        let mut current_data = data.to_vec();
        
        for filter in &mut self.filters {
            match filter.filter_body(&current_data, is_last) {
                FilterResult::Data(transformed) => current_data = transformed,
                FilterResult::Buffered => return Vec::new(),
                FilterResult::Error(e) => {
                    log::error!("Filter error: {}", e);
                    return current_data; // Pass through on error
                }
            }
        }
        
        current_data
    }
}
```

### 8. Reverse Proxy Architecture

```rust
struct ReverseProxy {
    upstream_pools: HashMap<String, UpstreamPool>,
}

struct UpstreamPool {
    name: String,
    servers: Vec<UpstreamServer>,
    algorithm: Box<dyn LoadBalanceAlgorithm>,
    connection_pool: ConnectionPool,
    health_checker: HealthChecker,
    config: UpstreamConfig,
}

struct UpstreamServer {
    address: SocketAddr,
    weight: u32,
    max_connections: u32,
    active_connections: AtomicU32,
    health_status: AtomicBool,
    fail_count: AtomicU32,
    response_time_avg: AtomicU64, // Microseconds
}

struct ConnectionPool {
    // Per-server pool of keepalive connections
    pools: HashMap<SocketAddr, VecDeque<PooledConnection>>,
    max_idle_per_server: usize,
    idle_timeout: Duration,
}

struct PooledConnection {
    stream: TcpStream,
    created_at: Instant,
    last_used: Instant,
    requests_served: u32,
}

impl ReverseProxy {
    fn proxy_request(&self, 
                     pool_name: &str,
                     client_request: &ParsedRequest,
                     client_conn: &mut Connection) -> Result<(), ProxyError> {
        let pool = self.upstream_pools.get(pool_name)
            .ok_or(ProxyError::PoolNotFound)?;
        
        // Select a healthy upstream server
        let server = pool.algorithm.select(&pool.servers, client_request)
            .ok_or(ProxyError::NoHealthyUpstream)?;
        
        // Try to get a pooled connection, or create new one
        let mut upstream_conn = pool.connection_pool
            .get_connection(&server.address)
            .unwrap_or_else(|| self.create_upstream_connection(server)?);
        
        // Build upstream request (modify headers)
        let upstream_request = self.build_upstream_request(client_request, server);
        
        // Send request to upstream
        upstream_conn.write_all(&upstream_request)?;
        
        // If client has a body, forward it
        if client_request.content_length.unwrap_or(0) > 0 || client_request.is_chunked {
            self.forward_request_body(client_conn, &mut upstream_conn, client_request)?;
        }
        
        // Read upstream response headers
        let upstream_response = self.read_upstream_response(&mut upstream_conn)?;
        
        // Build client response (may modify headers)
        let client_response = self.build_client_response(&upstream_response);
        
        // Send response to client, forwarding body
        client_conn.write_all(&client_response.header_bytes())?;
        self.forward_response_body(&mut upstream_conn, client_conn, &upstream_response)?;
        
        // Return connection to pool if keep-alive
        if upstream_response.is_keep_alive {
            pool.connection_pool.return_connection(server.address, upstream_conn);
        }
        
        Ok(())
    }
    
    fn build_upstream_request(&self, 
                              req: &ParsedRequest, 
                              server: &UpstreamServer) -> Vec<u8> {
        let mut buf = Vec::with_capacity(1024);
        
        // Request line (preserve method and URI)
        write!(buf, "{} {} HTTP/1.1\r\n", 
               std::str::from_utf8(req.method).unwrap(),
               std::str::from_utf8(req.uri).unwrap()).unwrap();
        
        // Forward original headers (except hop-by-hop)
        for header in req.headers {
            let name = header.name(req.buffer);
            let value = header.value(req.buffer);
            
            // Skip hop-by-hop headers
            match name.to_ascii_lowercase().as_slice() {
                b"connection" | b"keep-alive" | b"proxy-authenticate" |
                b"proxy-authorization" | b"te" | b"trailers" |
                b"transfer-encoding" | b"upgrade" => continue,
                _ => {}
            }
            
            buf.extend_from_slice(name);
            buf.extend_from_slice(b": ");
            buf.extend_from_slice(value);
            buf.extend_from_slice(b"\r\n");
        }
        
        // Add proxy headers
        write!(buf, "X-Forwarded-For: {}\r\n", req.client_addr.ip()).unwrap();
        write!(buf, "X-Forwarded-Proto: {}\r\n", 
               if req.is_https { "https" } else { "http" }).unwrap();
        write!(buf, "X-Real-IP: {}\r\n", req.client_addr.ip()).unwrap();
        buf.extend_from_slice(b"Connection: keep-alive\r\n");
        buf.extend_from_slice(b"\r\n");
        
        buf
    }
}
```

### 9. Worker Process Management

```rust
struct MasterProcess {
    config: ServerConfig,
    workers: Vec<WorkerInfo>,
    listen_fds: Vec<RawFd>,     // Shared listen sockets
    signal_fd: RawFd,           // signalfd for signal handling
}

struct WorkerInfo {
    pid: Pid,
    channel: UnixStream,        // Communication channel
    generation: u64,            // Config generation when spawned
    status: WorkerStatus,
}

enum WorkerStatus {
    Running,
    ShuttingDown { since: Instant },
    Exited { code: i32 },
}

impl MasterProcess {
    fn run(&mut self) -> Result<(), Error> {
        // 1. Parse and validate configuration
        self.config = ServerConfig::load_and_validate()?;
        
        // 2. Create listen sockets (as root, before privilege drop)
        self.create_listen_sockets()?;
        
        // 3. Spawn initial workers
        let num_workers = self.config.worker_processes.unwrap_or_else(num_cpus::get);
        for _ in 0..num_workers {
            self.spawn_worker()?;
        }
        
        // 4. Drop privileges (if running as root)
        if self.config.user.is_some() {
            drop_privileges(&self.config.user.as_ref().unwrap())?;
        }
        
        // 5. Master event loop
        loop {
            let signal = self.wait_for_signal()?;
            
            match signal {
                Signal::SIGHUP => {
                    // Reload configuration
                    self.hot_reload()?;
                },
                Signal::SIGTERM | Signal::SIGINT => {
                    // Graceful shutdown
                    self.graceful_shutdown()?;
                    break;
                },
                Signal::SIGCHLD => {
                    // Worker exited, respawn if not shutting down
                    self.handle_worker_exit()?;
                },
                Signal::SIGUSR1 => {
                    // Reopen log files
                    self.reopen_logs()?;
                },
                Signal::SIGUSR2 => {
                    // Binary upgrade (exec new binary)
                    self.binary_upgrade()?;
                },
                _ => {}
            }
        }
        
        Ok(())
    }
    
    fn hot_reload(&mut self) -> Result<(), Error> {
        // 1. Parse new configuration
        let new_config = match ServerConfig::load_and_validate() {
            Ok(config) => config,
            Err(e) => {
                log::error!("Config reload failed: {}. Keeping old config.", e);
                return Ok(()); // Don't crash on invalid config
            }
        };
        
        // 2. Open new listen sockets if needed
        let new_listen_fds = self.open_new_listen_sockets(&new_config)?;
        
        // 3. Increment generation
        let new_generation = self.config_generation + 1;
        
        // 4. Spawn new workers with new config
        let num_workers = new_config.worker_processes.unwrap_or_else(num_cpus::get);
        for _ in 0..num_workers {
            self.spawn_worker_with_config(&new_config, new_generation)?;
        }
        
        // 5. Signal old workers to gracefully shut down
        for worker in &mut self.workers {
            if worker.generation < new_generation && worker.status == WorkerStatus::Running {
                kill(worker.pid, Signal::SIGQUIT)?; // Graceful shutdown
                worker.status = WorkerStatus::ShuttingDown { since: Instant::now() };
            }
        }
        
        // 6. Update config
        self.config = new_config;
        self.config_generation = new_generation;
        
        Ok(())
    }
    
    fn spawn_worker(&mut self) -> Result<(), Error> {
        // Create Unix socket pair for master-worker communication
        let (master_sock, worker_sock) = UnixStream::pair()?;
        
        match unsafe { fork() }? {
            ForkResult::Parent { child } => {
                drop(worker_sock);
                self.workers.push(WorkerInfo {
                    pid: child,
                    channel: master_sock,
                    generation: self.config_generation,
                    status: WorkerStatus::Running,
                });
            },
            ForkResult::Child => {
                drop(master_sock);
                
                // Worker process
                let mut worker = EventLoopWorker::new(
                    self.listen_fds.clone(),
                    self.config.clone(),
                    worker_sock,
                );
                worker.run().expect("Worker failed");
                std::process::exit(0);
            }
        }
        
        Ok(())
    }
}
```

### 10. TLS Integration Architecture

```rust
struct TlsManager {
    contexts: HashMap<String, TlsContext>,  // SNI hostname → TLS context
    default_context: Option<TlsContext>,
    session_cache: SharedSessionCache,
    ocsp_cache: OcspCache,
}

impl TlsManager {
    fn create_ssl_for_connection(&self, sni_hostname: Option<&str>) -> Result<Ssl, TlsError> {
        // Select context based on SNI
        let ctx = match sni_hostname {
            Some(host) => self.contexts.get(host)
                .or_else(|| self.find_wildcard_context(host))
                .unwrap_or_else(|| self.default_context.as_ref().unwrap()),
            None => self.default_context.as_ref()
                .ok_or(TlsError::NoDefaultCertificate)?,
        };
        
        let mut ssl = Ssl::new(ctx)?;
        
        // Attach session cache
        ssl.set_session_cache(&self.session_cache);
        
        // Attach OCSP response if available
        if let Some(ocsp_response) = self.ocsp_cache.get(sni_hostname.unwrap_or("default")) {
            ssl.set_ocsp_response(&ocsp_response)?;
        }
        
        Ok(ssl)
    }
    
    /// SNI callback — called by TLS library during handshake
    fn sni_callback(ssl: &mut Ssl, hostname: &str) -> Result<(), TlsError> {
        // Switch to the correct certificate based on the hostname
        let ctx = TLS_MANAGER.contexts.get(hostname)
            .or_else(|| TLS_MANAGER.find_wildcard_context(hostname));
        
        if let Some(ctx) = ctx {
            ssl.set_ssl_context(ctx)?;
        }
        // If no match, default context remains
        
        Ok(())
    }
}
```

### 11. Caching Architecture

```rust
struct ResponseCache {
    entries: DashMap<CacheKey, CacheEntry>,  // Concurrent hash map
    lru: Mutex<LruTracker>,
    current_size: AtomicU64,
    max_size: u64,
    disk_cache: Option<DiskCache>,
}

#[derive(Hash, Eq, PartialEq)]
struct CacheKey {
    method: Method,
    scheme: Scheme,
    host: String,
    uri: String,
    vary_headers: Vec<(String, String)>,  // Headers listed in Vary
}

struct CacheEntry {
    status: u16,
    headers: Vec<(String, String)>,
    body: CacheBody,
    created_at: Instant,
    expires_at: Instant,
    last_validated: Instant,
    etag: Option<String>,
    last_modified: Option<String>,
    hit_count: AtomicU64,
}

enum CacheBody {
    InMemory(Bytes),
    OnDisk(PathBuf),
    TooLarge,  // Not cached
}

impl ResponseCache {
    fn lookup(&self, request: &ParsedRequest) -> CacheLookupResult {
        let key = CacheKey::from_request(request);
        
        match self.entries.get(&key) {
            Some(entry) => {
                if entry.expires_at > Instant::now() {
                    // Fresh cache hit
                    entry.hit_count.fetch_add(1, Ordering::Relaxed);
                    self.lru.lock().unwrap().touch(&key);
                    CacheLookupResult::Hit(entry.clone())
                } else {
                    // Stale — needs revalidation
                    CacheLookupResult::Stale(entry.clone())
                }
            },
            None => CacheLookupResult::Miss,
        }
    }
    
    fn store(&self, key: CacheKey, response: &Response, body: &[u8]) {
        // Check if response is cacheable
        if !self.is_cacheable(response) {
            return;
        }
        
        let body_size = body.len() as u64;
        
        // Evict if needed
        while self.current_size.load(Ordering::Acquire) + body_size > self.max_size {
            if let Some(evicted_key) = self.lru.lock().unwrap().evict_oldest() {
                if let Some((_, entry)) = self.entries.remove(&evicted_key) {
                    self.current_size.fetch_sub(entry.body_size(), Ordering::Release);
                }
            } else {
                break; // Nothing to evict
            }
        }
        
        let cache_body = if body_size <= 1_048_576 { // 1MB threshold
            CacheBody::InMemory(Bytes::copy_from_slice(body))
        } else if let Some(ref disk) = self.disk_cache {
            let path = disk.store(body)?;
            CacheBody::OnDisk(path)
        } else {
            CacheBody::TooLarge
        };
        
        let ttl = self.calculate_ttl(response);
        let entry = CacheEntry {
            status: response.status,
            headers: response.headers.clone(),
            body: cache_body,
            created_at: Instant::now(),
            expires_at: Instant::now() + ttl,
            last_validated: Instant::now(),
            etag: response.header("ETag").map(|v| v.to_string()),
            last_modified: response.header("Last-Modified").map(|v| v.to_string()),
            hit_count: AtomicU64::new(0),
        };
        
        self.current_size.fetch_add(body_size, Ordering::Release);
        self.entries.insert(key, entry);
    }
}
```

### 12. Compression Architecture

```rust
struct GzipFilter {
    compressor: Option<GzipEncoder>,
    level: u32,
    min_length: u64,
    content_type_match: bool,
    total_input: u64,
    total_output: u64,
}

impl OutputFilter for GzipFilter {
    fn filter_headers(&mut self, response: &mut ResponseHeaders) -> FilterResult {
        // Check if compression should be applied
        let content_type = response.get("Content-Type").unwrap_or("");
        let content_length: u64 = response.get("Content-Length")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        
        self.content_type_match = is_compressible_type(content_type);
        
        if !self.content_type_match || content_length < self.min_length {
            return FilterResult::Skip; // Don't compress
        }
        
        // Initialize compressor
        self.compressor = Some(GzipEncoder::new(self.level));
        
        // Modify headers
        response.set("Content-Encoding", "gzip");
        response.remove("Content-Length");  // Length changes after compression
        response.append("Vary", "Accept-Encoding");
        
        // Switch to chunked if needed
        if response.get("Transfer-Encoding").is_none() {
            response.set("Transfer-Encoding", "chunked");
        }
        
        FilterResult::Continue
    }
    
    fn filter_body(&mut self, data: &[u8], is_last: bool) -> FilterResult {
        if let Some(ref mut compressor) = self.compressor {
            self.total_input += data.len() as u64;
            
            compressor.write_all(data).unwrap();
            
            if is_last {
                compressor.finish().unwrap();
            }
            
            let compressed = compressor.take_output();
            self.total_output += compressed.len() as u64;
            
            FilterResult::Data(compressed)
        } else {
            FilterResult::Data(data.to_vec()) // Pass through
        }
    }
}
```

## Performance Architecture Decisions

### 1. Accept Strategy
```rust
// SO_REUSEPORT: Each worker has its own accept queue
// Better than: accept mutex (Nginx legacy) or thundering herd (Apache)
fn setup_listen_socket(addr: &SocketAddr) -> io::Result<RawFd> {
    let socket = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, 0)?;
    setsockopt(socket, SOL_SOCKET, SO_REUSEADDR, &1)?;
    setsockopt(socket, SOL_SOCKET, SO_REUSEPORT, &1)?;  // Key: per-worker queue
    setsockopt(socket, IPPROTO_TCP, TCP_DEFER_ACCEPT, &5)?; // Wait for data
    bind(socket, addr)?;
    listen(socket, 4096)?; // Large backlog
    Ok(socket)
}
```

### 2. Date Header Caching
```rust
// HTTP Date header changes once per second. Cache it.
thread_local! {
    static CACHED_DATE: RefCell<(Instant, String)> = RefCell::new(
        (Instant::now(), format_http_date(SystemTime::now()))
    );
}

fn cached_http_date() -> String {
    CACHED_DATE.with(|cell| {
        let mut cached = cell.borrow_mut();
        if cached.0.elapsed() >= Duration::from_secs(1) {
            cached.0 = Instant::now();
            cached.1 = format_http_date(SystemTime::now());
        }
        cached.1.clone()
    })
}
```

### 3. Static File Optimization Tiers
```
Tier 1 — Hot files (< 64KB, frequently accessed):
  → mmap() + MAP_POPULATE, kept in open file cache
  → Served from kernel page cache, near zero CPU

Tier 2 — Warm files (< 1MB, moderate access):
  → sendfile() from page cache
  → Zero-copy kernel-to-socket transfer

Tier 3 — Cold files (> 1MB or rare access):
  → sendfile() with readahead hints
  → May cause disk I/O, can be offloaded to thread pool

Tier 4 — Very large files (> 100MB):
  → sendfile() with limited chunk sizes
  → Rate limiting to prevent single client consuming bandwidth
```

### 4. Buffer Management Strategy
```
Read Buffer Management:
  - Initial allocation: 4KB (most requests fit)
  - Growth: Double up to 8KB, then grow by page size (4KB)
  - Maximum: 64KB for headers (configurable)
  - Pooling: Return to thread-local free list on connection close

Write Buffer Management:
  - Cork mode: Accumulate headers + first body chunk
  - Flush threshold: 16KB or when cork is released
  - For sendfile: Zero-copy, no write buffer needed
  - For proxied: Configurable buffering vs streaming

Connection Object Pooling:
  - Pre-allocate array of connection objects
  - Use slab allocator for O(1) alloc/free
  - Connection objects contain inline space for small buffers
  - Extended data (SSL, HTTP/2 streams) allocated on demand
```

## Error Handling Architecture

### Error Classification and Response
```rust
enum ServerError {
    // Client errors (4xx)
    BadRequest(String),          // 400: Malformed request
    Unauthorized(String),        // 401: Auth required
    Forbidden(String),           // 403: Access denied
    NotFound(String),            // 404: File/resource not found
    MethodNotAllowed(Vec<Method>), // 405: Wrong HTTP method
    RequestTimeout,              // 408: Client too slow
    RequestTooLarge,             // 413: Body exceeds limit
    UriTooLong,                  // 414: URI exceeds limit
    TooManyRequests,             // 429: Rate limited
    
    // Server errors (5xx)
    InternalError(String),       // 500: Bug or unexpected error
    BadGateway(String),          // 502: Upstream connection failed
    ServiceUnavailable(String),  // 503: Overloaded or maintenance
    GatewayTimeout,              // 504: Upstream response timeout
    
    // Connection errors (no HTTP response possible)
    ConnectionReset,
    BrokenPipe,
    TlsError(String),
}

impl ServerError {
    fn to_response(&self, config: &ErrorPageConfig) -> Response {
        let status = self.status_code();
        
        // Check for custom error page
        if let Some(page_path) = config.custom_pages.get(&status) {
            if let Ok(body) = std::fs::read(page_path) {
                return Response::new(status)
                    .header("Content-Type", "text/html")
                    .body(body);
            }
        }
        
        // Default error page
        let body = format!(
            "<html><head><title>{} {}</title></head>\
             <body><center><h1>{} {}</h1></center>\
             <hr><center>WebServer/1.0</center></body></html>",
            status, self.reason_phrase(), status, self.reason_phrase()
        );
        
        Response::new(status)
            .header("Content-Type", "text/html")
            .body(body.into_bytes())
    }
}
```

## Deployment Considerations

### Single-Process Development Mode
```yaml
mode: development
workers: 1
listen: "127.0.0.1:8080"
auto_reload: true          # Watch filesystem for changes
verbose_errors: true       # Show stack traces in error pages
access_log: stdout
```

### Multi-Worker Production Mode
```yaml
mode: production
workers: auto              # One per CPU core
listen: 
  - "0.0.0.0:80"
  - "0.0.0.0:443 ssl"
user: www-data
pid_file: /var/run/webserver.pid
error_log: /var/log/webserver/error.log
access_log: /var/log/webserver/access.log

# OS tuning applied by server
rlimit_nofile: 65536
tcp_backlog: 4096
```

### Container Deployment
```yaml
mode: production
workers: auto
listen: "0.0.0.0:8080"    # Single non-privileged port
access_log: /dev/stdout    # Log to container stdout
error_log: /dev/stderr
pid_file: ""               # No PID file needed
graceful_timeout: 30s      # Match SIGTERM grace period
```

This architecture guide provides the complete foundation for implementing a high-performance, production-grade web server capable of handling modern web workloads at scale.
