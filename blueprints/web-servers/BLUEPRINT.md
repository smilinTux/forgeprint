# Web Server Blueprint

## Overview & Purpose

A web server is a software system that accepts HTTP requests from clients (typically web browsers) and serves HTTP responses including static content, dynamically generated pages, API responses, and proxied upstream content. It acts as the foundational gateway between clients and web applications, handling protocol negotiation, content delivery, security enforcement, and connection management.

### Core Responsibilities
- **HTTP Protocol Handling**: Parse, validate, and respond to HTTP/1.1, HTTP/2, and HTTP/3 requests
- **Content Serving**: Deliver static files, directory listings, and generated content efficiently
- **Security Enforcement**: TLS/SSL termination, access control, request filtering, CORS
- **Connection Management**: Keep-alive, pipelining, multiplexing, WebSocket upgrades
- **Request Routing**: Virtual hosts, URL rewriting, reverse proxy, path-based dispatch
- **Performance Optimization**: Compression, caching, sendfile/zero-copy, buffer management
- **Extensibility**: CGI/FastCGI, module/plugin systems, scripting integration

## Core Concepts

### 1. Listeners (Bind Endpoints)
**Definition**: Network endpoints that accept incoming client connections.

```
Listener {
    bind_address: IP address or "0.0.0.0" / "::"
    port: TCP port (typically 80, 443, 8080)
    protocol: HTTP or HTTPS
    ssl_config: Optional SSL/TLS configuration
    backlog: TCP listen backlog size
    deferred_accept: Boolean (Linux TCP_DEFER_ACCEPT)
    reuseport: Boolean (SO_REUSEPORT for multi-worker)
}
```

**Types**:
- **HTTP Listener**: Plain text HTTP/1.1 and h2c (HTTP/2 cleartext)
- **HTTPS Listener**: TLS-wrapped, supports ALPN for HTTP/2 negotiation
- **QUIC/HTTP/3 Listener**: UDP-based, requires TLS 1.3

### 2. Virtual Hosts
**Definition**: Logical server contexts that allow a single web server to serve multiple domains/sites.

```
VirtualHost {
    server_names: ["example.com", "www.example.com", "*.example.com"]
    document_root: "/var/www/example.com/public"
    listen: Reference to listener(s)
    ssl_certificate: Path to certificate chain
    ssl_key: Path to private key
    access_log: Log file path and format
    error_log: Log file path and level
    locations: List of Location blocks
    error_pages: Map of status code to error page
    index_files: ["index.html", "index.htm"]
}
```

**Resolution Order**:
1. Exact hostname match
2. Wildcard prefix match (`*.example.com`)
3. Wildcard suffix match (`www.example.*`)
4. Regular expression match
5. Default virtual host (catch-all)

### 3. Location Blocks (Route Handlers)
**Definition**: URL-pattern-matched configuration contexts that determine how requests are processed.

```
Location {
    pattern: URL path or regex
    match_type: Prefix | Exact | Regex | RegexCaseInsensitive
    handler: Static | Proxy | FastCGI | Redirect | Return
    access_rules: List of allow/deny rules
    auth_config: Optional authentication configuration
    rewrite_rules: List of URL rewrite rules
    headers: Custom response headers
    cache_control: Caching directives
    rate_limit: Optional rate limit configuration
}
```

**Match Priority** (Nginx-style):
1. Exact match (`= /path`)
2. Longest prefix with priority (`^~ /prefix`)
3. First matching regex (`~ pattern` or `~* pattern`)
4. Longest prefix match (`/prefix`)

### 4. Request Processing Pipeline

```
Client → [Accept] → [TLS Handshake] → [Read Request] → [Parse Headers]
    → [Virtual Host Selection] → [Location Match] → [Access Control]
    → [Authentication] → [URL Rewrite] → [Handler Dispatch]
    → [Content Generation] → [Output Filters] → [Send Response]
    → [Log] → [Keep-Alive or Close]
```

**Pipeline Phases**:
1. **Connection Phase**: Accept, TLS handshake, set timeouts
2. **Read Phase**: Read request line and headers, validate HTTP
3. **Route Phase**: Select virtual host, match location, apply rewrites
4. **Access Phase**: Check IP ACLs, authenticate, authorize
5. **Content Phase**: Execute handler (static file, proxy, CGI, etc.)
6. **Filter Phase**: Compress, add headers, transform body
7. **Response Phase**: Write status line, headers, body to client
8. **Log Phase**: Record access log entry, update metrics

### 5. Content Handlers

#### Static File Handler
- Serve files from document root
- MIME type detection (from extension or magic bytes)
- Range requests (partial content, multipart ranges)
- Conditional requests (If-Modified-Since, If-None-Match, ETag)
- Directory index file resolution
- Directory listing generation (optional)
- Sendfile/zero-copy optimization

#### Reverse Proxy Handler
- Forward requests to upstream backend servers
- Connection pooling to backends
- Load balancing across multiple upstreams
- Request/response header manipulation
- WebSocket proxy (Connection: Upgrade)
- Server-Sent Events (SSE) streaming
- Buffering vs streaming mode
- Retry on upstream failure

#### CGI/FastCGI Handler
- Execute external programs per request (CGI)
- Persistent process pool communication (FastCGI)
- Environment variable passing (REQUEST_METHOD, QUERY_STRING, etc.)
- stdin/stdout body streaming
- SCGI and uWSGI protocol support

#### Redirect/Return Handler
- HTTP redirects (301, 302, 307, 308)
- Custom status code responses
- Variable interpolation in redirect targets

## Data Flow Diagrams

### Complete HTTP Request/Response Flow
```
┌──────────┐                    ┌───────────────────────────────────────────────┐
│  Client  │                    │              Web Server                       │
│ (Browser)│                    │                                               │
└────┬─────┘                    │  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
     │                          │  │ Listener │  │  Worker   │  │  Handler   │  │
     │  TCP SYN ───────────────▶│  │ (Accept) │  │ (Process) │  │ (Content)  │  │
     │  TCP SYN-ACK ◀──────────│  └────┬─────┘  └─────┬─────┘  └─────┬──────┘  │
     │  TCP ACK ───────────────▶│       │              │              │          │
     │                          │       ▼              │              │          │
     │  TLS ClientHello ───────▶│  ┌─────────┐        │              │          │
     │  TLS ServerHello ◀──────│  │   TLS    │        │              │          │
     │  TLS Finished ──────────▶│  │Handshake │        │              │          │
     │                          │  └────┬─────┘        │              │          │
     │                          │       │ assign       │              │          │
     │                          │       ▼──────────────▶              │          │
     │  GET /index.html ───────▶│              ┌───────┘              │          │
     │  Host: example.com       │              │                      │          │
     │                          │              ▼                      │          │
     │                          │     ┌──────────────┐               │          │
     │                          │     │ Parse Request │               │          │
     │                          │     │ Select VHost  │               │          │
     │                          │     │ Match Location│               │          │
     │                          │     │ Check Access  │               │          │
     │                          │     └──────┬───────┘               │          │
     │                          │            │ dispatch               │          │
     │                          │            ▼───────────────────────▶│          │
     │                          │                          ┌─────────┘          │
     │                          │                          ▼                    │
     │                          │                 ┌────────────────┐            │
     │                          │                 │  Read File /   │            │
     │                          │                 │  Proxy Request │            │
     │                          │                 │  Execute CGI   │            │
     │                          │                 └───────┬────────┘            │
     │                          │                         │                    │
     │                          │                         ▼                    │
     │                          │                 ┌────────────────┐            │
     │                          │                 │ Output Filters │            │
     │                          │                 │ (gzip, headers)│            │
     │                          │                 └───────┬────────┘            │
     │                          │                         │                    │
     │  HTTP/1.1 200 OK ◀──────│◀────────────────────────┘                    │
     │  Content-Type: text/html │                                               │
     │  Content-Length: 1234    │  ┌──────────┐                                │
     │  <html>...</html>        │  │ Access   │                                │
     │                          │  │ Log      │                                │
     │                          │  └──────────┘                                │
     │                          │                                               │
     │  (keep-alive: wait)      │  (connection remains open for next request)   │
     │                          │                                               │
└────┴──────────────────────────┴───────────────────────────────────────────────┘
```

### Worker Process Model
```
                    ┌──────────────────┐
                    │   Master Process │
                    │   (PID 1)        │
                    │                  │
                    │  - Config load   │
                    │  - Signal handle │
                    │  - Worker mgmt   │
                    │  - Privilege ops  │
                    └────────┬─────────┘
                             │ fork()
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │  Worker #1  │ │  Worker #2  │ │  Worker #N  │
    │             │ │             │ │             │
    │ Event Loop  │ │ Event Loop  │ │ Event Loop  │
    │  - epoll    │ │  - epoll    │ │  - epoll    │
    │  - accept() │ │  - accept() │ │  - accept() │
    │  - read/    │ │  - read/    │ │  - read/    │
    │    write    │ │    write    │ │    write    │
    │  - timers   │ │  - timers   │ │  - timers   │
    └─────────────┘ └─────────────┘ └─────────────┘
          │               │               │
          ▼               ▼               ▼
    ┌───────────────────────────────────────────┐
    │         Shared Listen Socket(s)           │
    │     (SO_REUSEPORT or accept mutex)        │
    └───────────────────────────────────────────┘
```

### Reverse Proxy Data Flow
```
┌────────┐     ┌──────────────────────────┐     ┌──────────┐
│ Client │────▶│       Web Server         │────▶│ Upstream  │
│        │     │                          │     │ Backend   │
│        │     │  1. Accept connection    │     │           │
│        │     │  2. Read client request  │     │           │
│        │     │  3. Select upstream      │     │           │
│        │     │  4. Get pooled connection│     │           │
│        │     │  5. Forward request      │────▶│           │
│        │     │     + X-Forwarded-For    │     │           │
│        │     │     + X-Forwarded-Proto  │     │           │
│        │     │     + X-Real-IP          │     │           │
│        │     │  6. Read upstream resp   │◀────│           │
│        │     │  7. Apply output filters │     │           │
│        │◀────│  8. Send to client       │     │           │
│        │     │  9. Return conn to pool  │     │           │
└────────┘     └──────────────────────────┘     └──────────┘
```

### WebSocket Upgrade Flow
```
Client                    Web Server               Backend
  │                           │                       │
  │  GET /ws HTTP/1.1         │                       │
  │  Upgrade: websocket       │                       │
  │  Connection: Upgrade      │                       │
  │  Sec-WebSocket-Key: xxx   │                       │
  │──────────────────────────▶│                       │
  │                           │  GET /ws HTTP/1.1     │
  │                           │  Upgrade: websocket   │
  │                           │──────────────────────▶│
  │                           │                       │
  │                           │  101 Switching Proto  │
  │                           │◀──────────────────────│
  │  101 Switching Protocols  │                       │
  │◀──────────────────────────│                       │
  │                           │                       │
  │◀═══ bidirectional frames ═══════════════════════▶│
  │     (binary or text)      │   (tunnel mode)       │
  │                           │                       │
```

## Protocol Support

### HTTP/1.1 (RFC 7230-7235)
**Required Features**:
- Persistent connections (keep-alive) as default
- Chunked transfer encoding
- Content-Length validation
- Host header requirement (400 if missing)
- Request pipelining support
- 100 Continue expectation handling
- Connection header hop-by-hop handling
- Trailer headers for chunked encoding

**Request Parsing Requirements**:
```
Request-Line = Method SP Request-URI SP HTTP-Version CRLF
Headers = *(Header-Field CRLF)
CRLF
[Message-Body]

Limits (configurable):
  - Max request line: 8,192 bytes
  - Max single header: 8,192 bytes
  - Max total headers: 32,768 bytes
  - Max header count: 100
  - Max request body: 1MB (default, configurable)
```

### HTTP/2 (RFC 7540/9113)
**Required Features**:
- Binary framing layer
- Stream multiplexing (concurrent requests on single connection)
- HPACK header compression
- Flow control (per-stream and per-connection)
- Server push capability
- Stream prioritization / priority signaling
- ALPN negotiation ("h2" for TLS, "h2c" for cleartext)
- Settings frame exchange
- GOAWAY for graceful shutdown
- RST_STREAM for stream cancellation

**Frame Types**:
- DATA, HEADERS, PRIORITY, RST_STREAM, SETTINGS
- PUSH_PROMISE, PING, GOAWAY, WINDOW_UPDATE, CONTINUATION

### HTTP/3 (RFC 9114)
**Required Features**:
- QUIC transport (UDP-based)
- TLS 1.3 integrated into transport
- 0-RTT connection establishment
- Independent stream multiplexing (no head-of-line blocking)
- QPACK header compression
- Connection migration (IP address changes)
- Built-in congestion control

### WebSocket (RFC 6455)
**Required Features**:
- HTTP Upgrade handshake validation
- Sec-WebSocket-Key / Sec-WebSocket-Accept computation
- Frame parsing (text/binary/ping/pong/close)
- Fragmented message reassembly
- Masking validation (client→server must be masked)
- Close handshake with status codes
- Per-message compression (permessage-deflate extension)

### Server-Sent Events (SSE)
**Required Features**:
- Content-Type: text/event-stream
- Event stream format (data:, event:, id:, retry:)
- Automatic reconnection with Last-Event-ID
- Keep connection open indefinitely
- Disable response buffering

## Content Serving

### Static File Serving
```
Static File Pipeline:
1. Resolve document_root + request_uri → filesystem path
2. Security check: no path traversal (../ or symlink escape)
3. Check file exists and is readable
4. Check If-Modified-Since / If-None-Match → 304 Not Modified
5. Determine MIME type from extension
6. Calculate Content-Length, ETag, Last-Modified
7. For Range requests: validate ranges, send 206 Partial Content
8. Apply output filters (compression if Accept-Encoding matches)
9. Send via sendfile() or mmap() for zero-copy
```

**MIME Type Detection**:
- Extension-based mapping (authoritative): `.html` → `text/html`
- Magic bytes detection (fallback): first 512 bytes analysis
- Default type: `application/octet-stream`
- Charset detection for text types

**ETag Generation**:
- Strong ETag: `"<inode>-<size>-<mtime>"` (exact match required)
- Weak ETag: `W/"<size>-<mtime>"` (semantic equivalence)

### Range Requests (RFC 7233)
```
Single Range:
  Request:  Range: bytes=0-499
  Response: 206 Partial Content
            Content-Range: bytes 0-499/1234
            Content-Length: 500

Multi-Range:
  Request:  Range: bytes=0-499, 600-999
  Response: 206 Partial Content
            Content-Type: multipart/byteranges; boundary=xxx
            --xxx
            Content-Range: bytes 0-499/1234
            <bytes 0-499>
            --xxx
            Content-Range: bytes 600-999/1234
            <bytes 600-999>
            --xxx--

Invalid Range:
  Response: 416 Range Not Satisfiable
            Content-Range: bytes */1234
```

### Directory Listings
- Auto-index generation (configurable on/off)
- Sort by name, size, date
- Hide dotfiles option
- Custom header/footer HTML injection
- JSON format option for API consumption

## Reverse Proxy

### Upstream Configuration
```
Upstream {
    name: "backend_pool"
    servers: [
        { address: "127.0.0.1:8001", weight: 3 },
        { address: "127.0.0.1:8002", weight: 2 },
        { address: "127.0.0.1:8003", weight: 1, backup: true }
    ]
    algorithm: RoundRobin | LeastConn | IPHash | Random
    max_connections_per_server: 100
    keepalive_connections: 32
    connect_timeout: 5s
    read_timeout: 60s
    send_timeout: 30s
    retry_on: [502, 503, 504, "error", "timeout"]
    max_retries: 2
    health_check: {
        path: "/health"
        interval: 10s
        timeout: 3s
        unhealthy_threshold: 3
        healthy_threshold: 2
    }
}
```

### Proxy Headers
```
# Headers to add when proxying:
X-Forwarded-For: <client_ip>, <proxy1_ip>
X-Forwarded-Proto: https
X-Forwarded-Host: original-host.com
X-Forwarded-Port: 443
X-Real-IP: <client_ip>
Via: 1.1 webserver-hostname

# Hop-by-hop headers to strip:
Connection, Keep-Alive, Proxy-Authenticate,
Proxy-Authorization, TE, Trailers, Transfer-Encoding, Upgrade
```

### Buffering Modes
- **Full buffering**: Read entire upstream response, then send to client (default)
- **Streaming**: Forward response as chunks arrive (for SSE, large responses)
- **X-Accel-Buffering**: Upstream can control buffering via header

## CGI / FastCGI

### CGI (Common Gateway Interface)
```
Environment Variables Passed:
  REQUEST_METHOD      = GET | POST | PUT | DELETE | ...
  QUERY_STRING        = key=value&key2=value2
  CONTENT_TYPE        = application/x-www-form-urlencoded
  CONTENT_LENGTH      = 1234
  SCRIPT_NAME         = /cgi-bin/script.py
  PATH_INFO           = /extra/path/info
  SERVER_NAME         = example.com
  SERVER_PORT         = 80
  SERVER_PROTOCOL     = HTTP/1.1
  REMOTE_ADDR         = 192.168.1.100
  REMOTE_HOST         = client.example.com
  HTTP_*              = (all client headers, dash→underscore)

Execution:
  1. Fork new process
  2. Set environment variables
  3. Pipe request body to stdin
  4. Read response from stdout
  5. Parse CGI response headers (Status:, Content-Type:, Location:)
  6. Forward response to client
  7. Wait for process exit
```

### FastCGI
```
Protocol:
  - Multiplexed binary protocol over Unix socket or TCP
  - Persistent connections (process stays alive)
  - Record types: BEGIN_REQUEST, ABORT_REQUEST, END_REQUEST,
                   PARAMS, STDIN, STDOUT, STDERR, DATA
  - Request ID for multiplexing
  - Padding for 8-byte alignment

Implementation:
  1. Maintain pool of FastCGI connections
  2. Send PARAMS records (environment variables)
  3. Send STDIN records (request body)
  4. Read STDOUT records (response)
  5. Read STDERR records (error logging)
  6. Reuse connection for next request
```

## Access Control

### IP-Based Access Control
```
Rules (evaluated in order):
  allow 192.168.1.0/24
  allow 10.0.0.0/8
  deny  all

  # Or:
  deny  192.168.1.100
  allow all
```

### Authentication
- **Basic Auth**: Base64(username:password) in Authorization header
- **Digest Auth**: Challenge-response with nonce (MD5-based)
- **Token Auth**: Bearer token in Authorization header
- **Client Certificate**: mTLS with certificate validation

### Authorization
- Per-location allow/deny rules
- Method-based restrictions (GET allowed, POST denied)
- Required groups/roles for authenticated users

## URL Rewriting

### Rewrite Engine
```
Rewrite Rules:
  # Internal rewrite (client URL unchanged)
  rewrite ^/old-page$  /new-page  last

  # External redirect (client sees new URL)
  rewrite ^/legacy/(.*)$  /modern/$1  redirect    # 302
  rewrite ^/moved/(.*)$   /new/$1     permanent   # 301

  # Conditional rewrite
  if ($http_user_agent ~* "mobile") {
      rewrite ^/(.*)$ /mobile/$1 break
  }

  # Map-based rewrite
  map $uri $new_uri {
      /old-1   /new-1;
      /old-2   /new-2;
      default  $uri;
  }
```

### Try Files Pattern
```
# Try each path in order, fall back to last entry
try_files $uri $uri/ /index.html =404

Resolution:
  1. Try exact file: $document_root/$uri
  2. Try directory: $document_root/$uri/ (+ index file)
  3. Try fallback: $document_root/index.html
  4. Return 404 if nothing matches
```

## Compression

### Supported Algorithms
| Algorithm | Content-Encoding | Compression Ratio | CPU Cost | Browser Support |
|-----------|-----------------|-------------------|----------|----------------|
| **gzip**  | gzip            | Good (60-80%)     | Medium   | Universal      |
| **deflate** | deflate       | Good (60-80%)     | Medium   | Universal      |
| **brotli** | br             | Excellent (70-90%)| High     | Modern browsers|
| **zstd**  | zstd            | Excellent (70-90%)| Medium   | Emerging       |

### Compression Configuration
```
Compression {
    enabled: true
    min_length: 256 bytes    # Don't compress tiny responses
    level: 6                  # 1=fast/low, 9=slow/high
    types: [
        "text/html", "text/css", "text/javascript",
        "application/javascript", "application/json",
        "application/xml", "image/svg+xml"
    ]
    exclude: [
        "image/jpeg", "image/png", "image/gif",  # Already compressed
        "video/*", "application/zip"
    ]
    vary: true               # Add Vary: Accept-Encoding header
    proxied: any             # Compress proxied responses too
}
```

### Content Negotiation
```
Client sends:
  Accept-Encoding: br, gzip, deflate

Server selects best match:
  1. Check if content type is compressible
  2. Check if response size > min_length
  3. Select highest-priority encoding client supports
  4. Apply compression
  5. Set Content-Encoding header
  6. Set Vary: Accept-Encoding header
  7. Remove/update Content-Length header
```

## Caching

### Browser Cache Directives
```
# Cache-Control header combinations:
Cache-Control: public, max-age=31536000      # CDN + browser, 1 year
Cache-Control: private, max-age=3600         # Browser only, 1 hour
Cache-Control: no-cache                       # Must revalidate every time
Cache-Control: no-store                       # Never cache
Cache-Control: must-revalidate, max-age=600  # Revalidate after 10 min
Cache-Control: immutable, max-age=31536000   # Never revalidate (hashed assets)
```

### ETag-Based Validation
```
First Request:
  → GET /style.css
  ← 200 OK
  ← ETag: "abc123"
  ← <css content>

Subsequent Request:
  → GET /style.css
  → If-None-Match: "abc123"
  ← 304 Not Modified (no body)  # If file unchanged
  OR
  ← 200 OK                      # If file changed
  ← ETag: "def456"
  ← <new css content>
```

### Proxy Cache
```
Proxy Cache {
    storage: /var/cache/webserver
    max_size: 10GB
    keys: "$scheme$host$request_uri"
    valid: {
        200: "1h"
        301: "24h"
        404: "1m"
    }
    bypass: "$cookie_nocache" "$arg_nocache"
    use_stale: [error, timeout, updating, http_500, http_502, http_503]
    lock: true               # Only one request updates cache
    lock_timeout: 5s
    min_uses: 2              # Cache after N hits
    inactive: 7d             # Purge if unused for 7 days
}
```

## SSL/TLS Configuration

### TLS Protocol Configuration
```
SSL {
    protocols: [TLSv1.2, TLSv1.3]
    ciphers: "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:..."
    prefer_server_ciphers: true
    certificate: /etc/ssl/certs/example.com.pem
    certificate_key: /etc/ssl/private/example.com.key
    trusted_certificate: /etc/ssl/certs/ca-chain.pem   # For OCSP stapling
    session_cache: shared:SSL:10m
    session_timeout: 1d
    session_tickets: true
    ocsp_stapling: true
    ocsp_stapling_verify: true
    stapling_responder: http://ocsp.example.com
    dhparam: /etc/ssl/dhparam.pem  # For DHE ciphers
    ecdh_curve: X25519:secp384r1:secp256r1
    hsts: "max-age=63072000; includeSubDomains; preload"
}
```

### ACME / Let's Encrypt Integration
```
Automatic Certificate Management:
  1. Generate account key (first time)
  2. Request certificate for configured domains
  3. Complete HTTP-01 or TLS-ALPN-01 challenge
  4. Receive and install certificate
  5. Schedule renewal (before expiry, typically 30 days)
  6. Reload configuration on renewal
```

### SNI (Server Name Indication)
- Client sends hostname in TLS ClientHello
- Server selects appropriate certificate
- Fallback to default certificate if no SNI match
- Required for multiple HTTPS virtual hosts on same IP

## Security Features

### Request Filtering
- Maximum request body size enforcement
- Header size limits
- URL length limits
- Slow request detection (slowloris protection)
- Request rate limiting per IP / per path
- HTTP method whitelist per location

### Response Security Headers
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY | SAMEORIGIN
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self' cdn.example.com
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
```

### CORS (Cross-Origin Resource Sharing)
```
CORS {
    allowed_origins: ["https://app.example.com", "https://dev.example.com"]
    allowed_methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allowed_headers: ["Content-Type", "Authorization", "X-Requested-With"]
    exposed_headers: ["X-Request-Id", "X-RateLimit-Remaining"]
    max_age: 86400        # Preflight cache duration
    credentials: true      # Allow cookies/auth
}

Preflight Flow:
  1. Browser sends OPTIONS with Origin, Access-Control-Request-Method
  2. Server checks if origin is allowed
  3. Server responds with Access-Control-Allow-* headers
  4. Browser proceeds with actual request if allowed
```

### Path Traversal Prevention
```
Security Checks on Every File Serve:
  1. Normalize path (resolve /./ and /../)
  2. Decode percent-encoded characters
  3. Check resolved path starts with document_root
  4. Optionally check symlinks don't escape document_root
  5. Reject null bytes in path
  6. Reject backslash path separators
```

## Configuration Model

### Hierarchical Configuration
```yaml
server:
  global:
    worker_processes: auto          # Match CPU cores
    worker_connections: 4096        # Per worker
    error_log: /var/log/webserver/error.log
    pid_file: /var/run/webserver.pid
    
  http:
    sendfile: true
    tcp_nopush: true
    tcp_nodelay: true
    keepalive_timeout: 65s
    keepalive_requests: 1000
    types_hash_max_size: 2048
    client_max_body_size: 10m
    gzip: true
    gzip_types: [text/css, application/javascript, application/json]
    
    upstreams:
      - name: backend
        servers:
          - { addr: "127.0.0.1:8001", weight: 3 }
          - { addr: "127.0.0.1:8002", weight: 2 }
    
    virtual_hosts:
      - server_names: ["example.com", "www.example.com"]
        listen: [":80", ":443 ssl"]
        ssl_certificate: /etc/ssl/example.com.pem
        ssl_key: /etc/ssl/example.com.key
        root: /var/www/example.com
        
        locations:
          - path: "/"
            try_files: ["$uri", "$uri/", "/index.html"]
          - path: "/api"
            proxy_pass: "http://backend"
          - path: "/static"
            root: /var/www/static
            expires: 30d
            cache_control: "public, immutable"
```

### Configuration Hot-Reload
```
Reload Sequence:
  1. Master process receives SIGHUP or reload command
  2. Parse and validate new configuration
  3. Open new listen sockets if needed
  4. Fork new worker processes with new config
  5. Signal old workers to gracefully shut down
  6. Old workers stop accepting new connections
  7. Old workers finish processing current requests
  8. Old workers exit after timeout
  9. New workers handle all traffic
  
  Rollback: If config validation fails, no changes applied
```

## Extension Points

### Module/Plugin Interface
```rust
trait WebServerModule {
    fn name(&self) -> &str;
    fn init(&mut self, config: &ModuleConfig) -> Result<(), ModuleError>;
    
    // Hook into request processing pipeline
    fn on_request_start(&self, req: &mut Request) -> ModuleAction;
    fn on_access_check(&self, req: &Request) -> AccessResult;
    fn on_content_handler(&self, req: &Request) -> Option<Response>;
    fn on_response_filter(&self, req: &Request, resp: &mut Response) -> ModuleAction;
    fn on_log(&self, req: &Request, resp: &Response);
    
    fn cleanup(&mut self);
}

enum ModuleAction {
    Continue,           // Pass to next module
    Handled(Response),  // Module generated response, stop pipeline
    Error(StatusCode),  // Return error response
}
```

### Filter Chain
```rust
trait OutputFilter {
    fn filter_headers(&self, resp: &mut Response) -> FilterResult;
    fn filter_body(&self, chunk: &[u8]) -> Vec<u8>;
    fn finalize(&self) -> Option<Vec<u8>>; // Final chunk (e.g., gzip trailer)
}

// Standard filters:
// GzipFilter → BrotliFilter → ChunkedFilter → RangeFilter
```

## Logging

### Access Log Format
```
# Combined Log Format (CLF):
$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"

# Example:
192.168.1.100 - john [13/Feb/2026:11:30:00 -0500] "GET /index.html HTTP/1.1" 200 1234 "https://google.com" "Mozilla/5.0..."

# JSON format:
{"time":"2026-02-13T11:30:00-05:00","remote_addr":"192.168.1.100","method":"GET","uri":"/index.html","status":200,"bytes":1234,"duration_ms":2.5,"user_agent":"Mozilla/5.0..."}
```

### Error Log Levels
- **emerg**: System unusable
- **alert**: Immediate action required
- **crit**: Critical conditions
- **error**: Error conditions (4xx, 5xx triggers)
- **warn**: Warning conditions
- **notice**: Normal but significant
- **info**: Informational
- **debug**: Debug-level (verbose, performance impact)

## Performance Targets

### Throughput Targets (per core)
- **Static file (1KB)**: 80,000+ requests/second
- **Static file (100KB)**: 15,000+ requests/second
- **Reverse proxy**: 40,000+ requests/second
- **HTTPS (RSA 2048)**: 15,000+ requests/second
- **HTTPS (ECDSA P-256)**: 25,000+ requests/second
- **HTTP/2 multiplexed**: 30,000+ streams/second

### Latency Targets (added latency by web server)
- **P50**: < 0.5ms
- **P95**: < 2ms
- **P99**: < 5ms
- **TLS handshake**: < 50ms (RSA), < 20ms (ECDSA)

### Resource Targets
- **Memory per connection**: < 2KB (idle keep-alive), < 8KB (active request)
- **Memory per worker**: < 50MB base footprint
- **File descriptors**: Support 100,000+ concurrent connections
- **CPU**: Near line-rate for static content with sendfile

### Scalability
- **Concurrent connections**: 100,000+ per worker (event-driven)
- **Virtual hosts**: 10,000+ without performance degradation
- **Rewrite rules**: 1,000+ with compiled regex
- **Upstream pools**: 100+ with health checking

## Implementation Priorities

### Phase 1: Minimal Viable Web Server
1. TCP listener with SO_REUSEPORT
2. HTTP/1.1 request parser (method, URI, headers, body)
3. Static file serving (sendfile, MIME types, directory index)
4. Single virtual host
5. Access logging
6. Graceful shutdown

### Phase 2: Production Features
1. Multiple virtual hosts with SNI
2. TLS/SSL termination
3. Gzip compression
4. Keep-alive connection management
5. URL rewriting and redirects
6. IP-based access control
7. Configuration file parsing
8. Worker process model

### Phase 3: Advanced Features
1. HTTP/2 support
2. Reverse proxy with connection pooling
3. FastCGI support
4. Proxy caching
5. Rate limiting
6. WebSocket proxying
7. Configuration hot-reload
8. Brotli compression
9. ACME/Let's Encrypt

### Phase 4: Enterprise Features
1. HTTP/3 / QUIC
2. Server-Sent Events
3. Lua/scripting integration
4. WAF rules
5. mTLS client certificates
6. Distributed tracing headers
7. Prometheus metrics endpoint
8. Admin API

This blueprint provides the comprehensive foundation needed to implement a production-grade web server with all essential features, security considerations, and performance requirements clearly defined.
