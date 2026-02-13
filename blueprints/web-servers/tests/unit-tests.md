# Web Server Unit Tests Specification

## Overview
This document defines comprehensive unit test requirements for any generated web server implementation. Every test MUST pass for the implementation to be considered complete and production-ready.

## Test Categories

### 1. HTTP Request Parsing Tests

#### 1.1 Request Line Parsing
**Test: `test_parse_get_request`**
- **Purpose**: Verify basic GET request line parsing
- **Input**: `GET /index.html HTTP/1.1\r\n`
- **Assert**: method=GET, uri="/index.html", version=HTTP/1.1

**Test: `test_parse_post_request_with_body`**
- **Purpose**: Verify POST with Content-Length body
- **Input**:
```http
POST /api/users HTTP/1.1\r\n
Content-Type: application/json\r\n
Content-Length: 27\r\n
\r\n
{"name":"Alice","age":30}
```
- **Assert**: method=POST, body parsed correctly, Content-Length validated

**Test: `test_parse_all_http_methods`**
- **Purpose**: Verify all standard methods are supported
- **Input**: GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS, TRACE requests
- **Assert**: All methods correctly identified

**Test: `test_parse_request_with_query_string`**
- **Purpose**: Verify query string parsing
- **Input**: `GET /search?q=hello+world&page=2&lang=en HTTP/1.1\r\n`
- **Assert**: path="/search", query_string="q=hello+world&page=2&lang=en"

**Test: `test_parse_percent_encoded_uri`**
- **Purpose**: Verify percent-encoding in URI
- **Input**: `GET /path%20with%20spaces/file%23name HTTP/1.1\r\n`
- **Assert**: Decoded path="/path with spaces/file#name"

**Test: `test_reject_malformed_request_line`**
- **Purpose**: Verify rejection of invalid request format
- **Input**: `INVALID REQUEST\r\n`
- **Assert**: 400 Bad Request response

**Test: `test_reject_unsupported_http_version`**
- **Purpose**: Verify rejection of unsupported versions
- **Input**: `GET / HTTP/3.0\r\n`
- **Assert**: 505 HTTP Version Not Supported

**Test: `test_reject_request_line_too_long`**
- **Purpose**: Verify URI length limit enforcement
- **Setup**: Configure max_uri_length = 8192
- **Input**: GET request with 10000-character URI
- **Assert**: 414 URI Too Long

#### 1.2 Header Parsing
**Test: `test_parse_standard_headers`**
- **Input**:
```http
GET / HTTP/1.1\r\n
Host: example.com\r\n
User-Agent: Mozilla/5.0\r\n
Accept: text/html,application/json\r\n
Accept-Encoding: gzip, deflate, br\r\n
Connection: keep-alive\r\n
\r\n
```
- **Assert**: All headers correctly parsed as key-value pairs

**Test: `test_parse_header_case_insensitive`**
- **Purpose**: Verify header name case insensitivity
- **Input**: `content-type: text/html\r\n` and `Content-Type: text/html\r\n`
- **Assert**: Both resolve to same header

**Test: `test_parse_multi_value_header`**
- **Purpose**: Verify comma-separated header values
- **Input**: `Accept: text/html, application/json, */*\r\n`
- **Assert**: Parsed as list of three media types

**Test: `test_parse_duplicate_headers`**
- **Purpose**: Verify duplicate header handling (combine per RFC 7230)
- **Input**: Two `X-Custom: value1\r\n` and `X-Custom: value2\r\n` headers
- **Assert**: Combined as `X-Custom: value1, value2` or stored as list

**Test: `test_reject_header_without_host`**
- **Purpose**: Verify HTTP/1.1 Host header requirement
- **Input**: `GET / HTTP/1.1\r\n\r\n` (no Host header)
- **Assert**: 400 Bad Request

**Test: `test_reject_oversized_headers`**
- **Setup**: Configure max_header_size = 8192
- **Input**: Single header value > 8192 bytes
- **Assert**: 431 Request Header Fields Too Large

**Test: `test_reject_too_many_headers`**
- **Setup**: Configure max_header_count = 100
- **Input**: Request with 150 headers
- **Assert**: 431 Request Header Fields Too Large

#### 1.3 Request Body Parsing
**Test: `test_parse_content_length_body`**
- **Purpose**: Verify Content-Length body reading
- **Input**: POST with `Content-Length: 13` and body `Hello, World!`
- **Assert**: Body is exactly "Hello, World!" (13 bytes)

**Test: `test_parse_chunked_transfer_encoding`**
- **Purpose**: Verify chunked encoding decoding
- **Input**:
```
7\r\n
Mozilla\r\n
9\r\n
Developer\r\n
7\r\n
Network\r\n
0\r\n
\r\n
```
- **Assert**: Decoded body = "MozillaDeveloperNetwork"

**Test: `test_reject_body_exceeding_max_size`**
- **Setup**: Configure client_max_body_size = 1MB
- **Input**: POST with Content-Length: 2000000
- **Assert**: 413 Payload Too Large

**Test: `test_100_continue_handling`**
- **Purpose**: Verify Expect: 100-continue flow
- **Input**: Request with `Expect: 100-continue` header
- **Assert**: Server sends `100 Continue` before reading body

### 2. Content Negotiation Tests

**Test: `test_accept_encoding_gzip`**
- **Purpose**: Verify gzip selection from Accept-Encoding
- **Input**: `Accept-Encoding: gzip, deflate, br`
- **Setup**: Server supports gzip and br
- **Assert**: Response uses best supported encoding (br preferred, then gzip)

**Test: `test_accept_encoding_identity`**
- **Purpose**: Verify no compression when not accepted
- **Input**: `Accept-Encoding: identity`
- **Assert**: Response body uncompressed

**Test: `test_accept_encoding_quality_values`**
- **Input**: `Accept-Encoding: gzip;q=0.8, br;q=1.0, deflate;q=0.5`
- **Assert**: Selects br (highest quality value)

**Test: `test_vary_header_set_for_negotiation`**
- **Purpose**: Verify Vary header when content negotiation occurs
- **Assert**: Response includes `Vary: Accept-Encoding`

**Test: `test_accept_media_type_negotiation`**
- **Input**: `Accept: application/json;q=0.9, text/html;q=1.0`
- **Assert**: Server returns text/html if available, json as fallback

### 3. Virtual Host Tests

**Test: `test_vhost_exact_match`**
- **Setup**: Two vhosts: example.com → /var/www/example, test.com → /var/www/test
- **Input**: Request with `Host: example.com`
- **Assert**: Serves from /var/www/example

**Test: `test_vhost_wildcard_match`**
- **Setup**: Vhost `*.example.com` → /var/www/wildcard
- **Input**: `Host: blog.example.com`
- **Assert**: Matches wildcard vhost

**Test: `test_vhost_default_fallback`**
- **Setup**: Default vhost configured
- **Input**: `Host: unknown-domain.com`
- **Assert**: Falls back to default vhost

**Test: `test_vhost_port_matching`**
- **Setup**: Vhost bound to port 8080 only
- **Input**: Request on port 8080 vs port 80
- **Assert**: Vhost matches only on correct port

**Test: `test_vhost_sni_certificate_selection`**
- **Setup**: Two vhosts with different SSL certificates
- **Input**: TLS ClientHello with SNI = example.com
- **Assert**: Correct certificate presented for SNI hostname

### 4. Static File Serving Tests

#### 4.1 Basic File Serving
**Test: `test_serve_html_file`**
- **Setup**: /var/www/index.html exists with known content
- **Action**: `GET /index.html`
- **Assert**: 200 OK, Content-Type: text/html, correct body

**Test: `test_serve_binary_file`**
- **Setup**: /var/www/image.png exists
- **Action**: `GET /image.png`
- **Assert**: 200 OK, Content-Type: image/png, body matches file bytes

**Test: `test_mime_type_detection`**
- **Assert**: .html→text/html, .css→text/css, .js→application/javascript, .json→application/json, .png→image/png, .jpg→image/jpeg, .svg→image/svg+xml, .woff2→font/woff2

**Test: `test_directory_index_file`**
- **Setup**: /var/www/docs/index.html exists
- **Action**: `GET /docs/`
- **Assert**: Serves /var/www/docs/index.html

**Test: `test_directory_listing_when_enabled`**
- **Setup**: autoindex enabled, no index file in directory
- **Action**: `GET /files/`
- **Assert**: HTML directory listing with file names, sizes, dates

**Test: `test_directory_listing_disabled`**
- **Setup**: autoindex disabled, no index file
- **Action**: `GET /files/`
- **Assert**: 403 Forbidden

**Test: `test_file_not_found`**
- **Action**: `GET /nonexistent.html`
- **Assert**: 404 Not Found

**Test: `test_custom_error_page`**
- **Setup**: Custom 404 page configured at /error/404.html
- **Action**: `GET /nonexistent.html`
- **Assert**: 404 status but body is custom error page content

#### 4.2 Conditional Requests
**Test: `test_etag_generation`**
- **Action**: `GET /style.css`
- **Assert**: Response includes ETag header

**Test: `test_if_none_match_304`**
- **Action**: `GET /style.css` with `If-None-Match: "<previous-etag>"`
- **Assert**: 304 Not Modified, no body

**Test: `test_if_none_match_200_when_changed`**
- **Setup**: File modified since ETag was generated
- **Assert**: 200 OK with new content and new ETag

**Test: `test_if_modified_since_304`**
- **Action**: Request with `If-Modified-Since` equal to file's Last-Modified
- **Assert**: 304 Not Modified

**Test: `test_last_modified_header`**
- **Assert**: Response includes Last-Modified matching file mtime

#### 4.3 Range Requests
**Test: `test_single_range_request`**
- **Setup**: File of 1000 bytes
- **Input**: `Range: bytes=0-499`
- **Assert**: 206 Partial Content, Content-Range: bytes 0-499/1000, 500 bytes

**Test: `test_suffix_range_request`**
- **Input**: `Range: bytes=-200`
- **Assert**: Returns last 200 bytes of file

**Test: `test_open_ended_range`**
- **Input**: `Range: bytes=800-`
- **Assert**: Returns bytes 800 to end of file

**Test: `test_multipart_range_request`**
- **Input**: `Range: bytes=0-99, 200-299`
- **Assert**: 206 with multipart/byteranges body

**Test: `test_invalid_range_416`**
- **Input**: `Range: bytes=5000-6000` (file is 1000 bytes)
- **Assert**: 416 Range Not Satisfiable

**Test: `test_if_range_with_matching_etag`**
- **Input**: `If-Range: "<current-etag>"` + `Range: bytes=0-99`
- **Assert**: 206 Partial Content (ETag matches, range honored)

**Test: `test_if_range_with_stale_etag`**
- **Input**: `If-Range: "<old-etag>"` + `Range: bytes=0-99`
- **Assert**: 200 OK with full content (ETag doesn't match, range ignored)

#### 4.4 Security
**Test: `test_path_traversal_blocked`**
- **Input**: `GET /../../../etc/passwd`
- **Assert**: 400 Bad Request or 403 Forbidden

**Test: `test_path_traversal_encoded_blocked`**
- **Input**: `GET /%2e%2e/%2e%2e/etc/passwd`
- **Assert**: Blocked after URL decoding

**Test: `test_null_byte_in_path_blocked`**
- **Input**: `GET /file.txt%00.html`
- **Assert**: 400 Bad Request

**Test: `test_symlink_escape_blocked`**
- **Setup**: Symlink /var/www/link → /etc/passwd, symlink following disabled
- **Assert**: 403 Forbidden or 404

### 5. Access Control Tests

**Test: `test_ip_allow_rule`**
- **Setup**: Allow 192.168.1.0/24, deny all
- **Input**: Request from 192.168.1.50
- **Assert**: Request allowed

**Test: `test_ip_deny_rule`**
- **Input**: Request from 10.0.0.1
- **Assert**: 403 Forbidden

**Test: `test_basic_auth_valid_credentials`**
- **Setup**: Basic auth enabled, user "admin:secret"
- **Input**: `Authorization: Basic YWRtaW46c2VjcmV0` (admin:secret)
- **Assert**: Request allowed, user context set

**Test: `test_basic_auth_invalid_credentials`**
- **Input**: `Authorization: Basic YWRtaW46d3Jvbmc=` (admin:wrong)
- **Assert**: 401 Unauthorized with WWW-Authenticate header

**Test: `test_basic_auth_missing_credentials`**
- **Input**: No Authorization header
- **Assert**: 401 Unauthorized with WWW-Authenticate: Basic realm="..."

**Test: `test_method_restriction`**
- **Setup**: Location allows only GET and HEAD
- **Input**: POST request
- **Assert**: 405 Method Not Allowed, Allow header lists GET, HEAD

### 6. Compression Tests

**Test: `test_gzip_compression`**
- **Setup**: gzip enabled for text/html
- **Input**: `Accept-Encoding: gzip`
- **Assert**: Response has `Content-Encoding: gzip`, body is gzip-compressed, decompresses to original

**Test: `test_brotli_compression`**
- **Setup**: brotli enabled
- **Input**: `Accept-Encoding: br, gzip`
- **Assert**: Response uses br (preferred over gzip)

**Test: `test_no_compression_below_min_length`**
- **Setup**: min_length = 256 bytes
- **Input**: Request for 100-byte file with `Accept-Encoding: gzip`
- **Assert**: Response not compressed (below threshold)

**Test: `test_no_compression_for_images`**
- **Input**: Request for image.png with `Accept-Encoding: gzip`
- **Assert**: Image served uncompressed (already compressed format)

**Test: `test_precompressed_file_served`**
- **Setup**: /var/www/app.js and /var/www/app.js.gz both exist, static precompression enabled
- **Input**: `Accept-Encoding: gzip`
- **Assert**: Serves pre-compressed .gz file (avoids CPU overhead)

**Test: `test_vary_accept_encoding_header`**
- **Assert**: Compressed responses include `Vary: Accept-Encoding`

### 7. Caching Tests

**Test: `test_cache_control_static_assets`**
- **Setup**: Location /static/ configured with `expires 30d`
- **Assert**: `Cache-Control: max-age=2592000` in response

**Test: `test_cache_control_no_store`**
- **Setup**: Location /api/ configured with no-store
- **Assert**: `Cache-Control: no-store`

**Test: `test_proxy_cache_stores_response`**
- **Setup**: Proxy cache enabled for upstream
- **Action**: First request → cache MISS → upstream response → cached
- **Action**: Second identical request → cache HIT
- **Assert**: Second response served from cache (faster, no upstream hit)

**Test: `test_proxy_cache_respects_no_cache`**
- **Input**: Request with `Cache-Control: no-cache`
- **Assert**: Cache bypassed, request forwarded to upstream

**Test: `test_proxy_cache_vary_key`**
- **Setup**: Upstream returns `Vary: Accept-Encoding`
- **Action**: Request with gzip → cached → request without gzip
- **Assert**: Second request is cache MISS (different Vary key)

**Test: `test_proxy_cache_stale_on_error`**
- **Setup**: use_stale enabled for 502/503
- **Action**: Upstream returns 502
- **Assert**: Stale cached response served instead of 502

### 8. Connection Management Tests

**Test: `test_keep_alive_connection_reuse`**
- **Setup**: keep-alive enabled, timeout=65s
- **Action**: Send two sequential requests on same connection
- **Assert**: Both handled without new TCP connection

**Test: `test_keep_alive_max_requests`**
- **Setup**: keepalive_requests = 100
- **Action**: Send 100 requests on same connection
- **Assert**: Connection closed after 100th request

**Test: `test_keep_alive_timeout`**
- **Setup**: keepalive_timeout = 5s
- **Action**: Send request, wait 10 seconds, send another
- **Assert**: Second request on new connection (old one timed out)

**Test: `test_connection_close_header`**
- **Input**: `Connection: close`
- **Assert**: Server closes connection after response

**Test: `test_concurrent_connections_limit`**
- **Setup**: worker_connections = 1024
- **Action**: Open 1024 concurrent connections
- **Assert**: All accepted; 1025th may be rejected or queued

### 9. URL Rewriting Tests

**Test: `test_internal_rewrite`**
- **Setup**: Rewrite `^/old-page$ /new-page last`
- **Input**: `GET /old-page`
- **Assert**: Internally serves /new-page content, client sees original URL

**Test: `test_external_redirect_301`**
- **Setup**: Rewrite `^/moved/(.*) /new/$1 permanent`
- **Input**: `GET /moved/page`
- **Assert**: 301 Location: /new/page

**Test: `test_external_redirect_302`**
- **Setup**: Rewrite `^/temp/(.*) /other/$1 redirect`
- **Input**: `GET /temp/page`
- **Assert**: 302 Location: /other/page

**Test: `test_try_files_fallback`**
- **Setup**: `try_files $uri $uri/ /index.html =404`
- **Input**: `GET /app/dashboard` (file doesn't exist)
- **Assert**: Serves /index.html (SPA fallback)

**Test: `test_try_files_existing_file`**
- **Setup**: Same try_files config, /var/www/app/dashboard.html exists
- **Assert**: Serves the existing file directly

### 10. Reverse Proxy Tests

**Test: `test_proxy_pass_basic`**
- **Setup**: Location /api proxied to http://backend:8080
- **Input**: `GET /api/users`
- **Assert**: Request forwarded to backend, response returned to client

**Test: `test_proxy_header_forwarding`**
- **Assert**: Backend receives X-Forwarded-For, X-Forwarded-Proto, X-Real-IP headers

**Test: `test_proxy_preserve_host`**
- **Setup**: proxy_set_header Host $host
- **Assert**: Backend receives original Host header, not proxy's address

**Test: `test_proxy_connection_pooling`**
- **Action**: Send 10 requests through proxy
- **Assert**: Backend sees ≤ keepalive connection limit (not 10 separate connections)

**Test: `test_proxy_backend_timeout`**
- **Setup**: proxy_read_timeout = 5s, backend sleeps 10s
- **Assert**: 504 Gateway Timeout after 5 seconds

**Test: `test_proxy_backend_down`**
- **Setup**: Backend not running
- **Assert**: 502 Bad Gateway

**Test: `test_proxy_websocket_upgrade`**
- **Input**: WebSocket upgrade request
- **Assert**: 101 Switching Protocols, bidirectional frames forwarded

**Test: `test_proxy_buffering_disabled`**
- **Setup**: proxy_buffering off (for SSE)
- **Assert**: Response chunks forwarded immediately to client

### 11. SSL/TLS Tests

**Test: `test_tls_handshake_success`**
- **Setup**: Valid certificate for example.com
- **Action**: TLS connection to example.com
- **Assert**: Handshake completes, HTTP works over TLS

**Test: `test_tls_redirect_http_to_https`**
- **Setup**: HTTP listener redirects to HTTPS
- **Input**: `GET http://example.com/page`
- **Assert**: 301 Location: https://example.com/page

**Test: `test_hsts_header`**
- **Setup**: HSTS enabled with max-age=63072000
- **Assert**: Response includes `Strict-Transport-Security: max-age=63072000`

**Test: `test_sni_correct_certificate`**
- **Setup**: Certificates for example.com and test.com
- **Action**: TLS with SNI=test.com
- **Assert**: test.com certificate presented

**Test: `test_tls_1_0_rejected`**
- **Setup**: Only TLS 1.2+ enabled
- **Action**: Client attempts TLS 1.0
- **Assert**: Handshake fails

**Test: `test_client_certificate_auth`**
- **Setup**: mTLS enabled with trusted CA
- **Action**: Client presents valid certificate signed by trusted CA
- **Assert**: Connection accepted, client identity available

### 12. Security Header Tests

**Test: `test_x_content_type_options`**
- **Setup**: Security headers enabled
- **Assert**: `X-Content-Type-Options: nosniff`

**Test: `test_x_frame_options`**
- **Assert**: `X-Frame-Options: DENY` or `SAMEORIGIN`

**Test: `test_cors_preflight`**
- **Setup**: CORS enabled for https://app.example.com
- **Input**: OPTIONS with Origin: https://app.example.com
- **Assert**: Access-Control-Allow-Origin, -Methods, -Headers in response

**Test: `test_cors_rejected_origin`**
- **Input**: Origin: https://evil.com
- **Assert**: No Access-Control-Allow-Origin header (CORS blocked)

### 13. Logging Tests

**Test: `test_access_log_entry_format`**
- **Action**: Complete HTTP request
- **Assert**: Access log contains remote_addr, method, URI, status, size, user-agent

**Test: `test_access_log_json_format`**
- **Setup**: JSON log format enabled
- **Assert**: Log entry is valid JSON with all fields

**Test: `test_error_log_on_5xx`**
- **Action**: Trigger 502 (backend down)
- **Assert**: Error log records the upstream connection failure

### 14. Configuration Tests

**Test: `test_valid_config_loads`**
- **Action**: Load valid configuration file
- **Assert**: Server starts successfully

**Test: `test_invalid_config_rejected`**
- **Action**: Load config with syntax error
- **Assert**: Server refuses to start with clear error message

**Test: `test_config_test_mode`**
- **Action**: Run config test/validation without starting
- **Assert**: Validation reports success or specific errors

**Test: `test_config_hot_reload`**
- **Setup**: Running server
- **Action**: Send reload signal (SIGHUP)
- **Assert**: New config applied without dropping existing connections

**Test: `test_graceful_shutdown`**
- **Setup**: In-flight request during shutdown
- **Action**: Send shutdown signal
- **Assert**: In-flight request completes, then server exits

## Test Execution Requirements

### Test Environment
- **Isolation**: Each test uses ephemeral server instance or isolated config
- **Cleanup**: All temp files and sockets cleaned up
- **Repeatability**: Tests produce same results on multiple runs
- **Speed**: Full test suite completes in < 5 minutes

### Coverage Requirements
- **Functionality**: All HTTP features must have tests
- **Error Paths**: All error status codes tested
- **Edge Cases**: Empty bodies, maximum sizes, unicode paths covered
- **Security**: All security mechanisms tested including bypass attempts

### Success Criteria
A web server implementation passes unit tests if:
1. **100% test pass rate** on all applicable tests
2. **HTTP compliance** validated for all supported protocol features
3. **No security vulnerabilities** in path traversal, injection, or auth tests
4. **Correct caching behavior** with proper cache invalidation
5. **Clean connection management** without leaks or hangs
