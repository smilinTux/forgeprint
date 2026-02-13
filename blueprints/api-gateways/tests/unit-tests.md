# API Gateway Unit Tests Specification

## Overview
This document defines comprehensive unit test requirements for any generated API gateway implementation. Every test MUST pass for the implementation to be considered complete and production-ready.

## Test Categories

### 1. Route Matching Tests

#### 1.1 Path-Based Routing
**Test: `test_exact_path_match`**
- **Setup**: Route `/api/v1/users` → Service A
- **Input**: `GET /api/v1/users`
- **Assert**: Request routed to Service A

**Test: `test_prefix_path_match`**
- **Setup**: Route `/api/v1/*` → Service B
- **Input**: `GET /api/v1/orders/123`
- **Assert**: Request routed to Service B

**Test: `test_path_parameter_extraction`**
- **Setup**: Route `/users/{id}` → Service C
- **Input**: `GET /users/12345`
- **Assert**: Request routed to Service C with parameter `id=12345`

**Test: `test_wildcard_path_matching`**
- **Setup**: Route `/files/**` → File Service
- **Input**: `GET /files/documents/report.pdf`
- **Assert**: Matches wildcard pattern, routes to File Service

**Test: `test_regex_path_matching`**
- **Setup**: Route regex `^/api/v[0-9]+/.*` → Versioned API Service
- **Input**: `GET /api/v2/endpoint`
- **Assert**: Matches regex, routes correctly

**Test: `test_route_priority_ordering`**
- **Setup**: Routes in order: `/api/specific` (priority 100), `/api/*` (priority 50)
- **Input**: `GET /api/specific`
- **Assert**: Matches higher priority specific route, not wildcard

**Test: `test_no_matching_route_404`**
- **Input**: `GET /nonexistent/path`
- **Assert**: Returns 404 Not Found

**Test: `test_strip_path_prefix`**
- **Setup**: Route `/v1/api/*` → Service (strip_path=true)
- **Input**: `GET /v1/api/users`
- **Assert**: Upstream receives `GET /users` (prefix stripped)

#### 1.2 Method-Based Routing
**Test: `test_http_method_filtering`**
- **Setup**: Route allows only GET and POST methods
- **Input**: `PUT /api/users/123`
- **Assert**: 405 Method Not Allowed with Allow: GET, POST

**Test: `test_method_specific_routes`**
- **Setup**: `GET /users` → Read Service, `POST /users` → Write Service
- **Input**: `POST /users` with body
- **Assert**: Routed to Write Service

#### 1.3 Header-Based Routing
**Test: `test_header_value_routing`**
- **Setup**: Route `X-API-Version: v2` → V2 Service
- **Input**: Request with `X-API-Version: v2`
- **Assert**: Routed to V2 Service

**Test: `test_header_regex_routing`**
- **Setup**: Route `User-Agent: ^Mobile.*` → Mobile Service
- **Input**: Request with `User-Agent: Mobile Safari`
- **Assert**: Routed to Mobile Service

**Test: `test_host_based_routing`**
- **Setup**: Host `api.example.com` → API Service, `admin.example.com` → Admin Service
- **Input**: Request with `Host: admin.example.com`
- **Assert**: Routed to Admin Service

#### 1.4 Query Parameter Routing
**Test: `test_query_param_routing`**
- **Setup**: Route with query param `version=beta` → Beta Service
- **Input**: `GET /api/endpoint?version=beta&other=value`
- **Assert**: Routed to Beta Service

### 2. Authentication Tests

#### 2.1 API Key Authentication
**Test: `test_api_key_valid`**
- **Setup**: Consumer with API key "test-key-123"
- **Input**: Request with `Authorization: Bearer test-key-123`
- **Assert**: Authentication succeeds, consumer context set

**Test: `test_api_key_invalid`**
- **Input**: Request with `Authorization: Bearer invalid-key`
- **Assert**: 401 Unauthorized

**Test: `test_api_key_missing`**
- **Setup**: Route requires authentication
- **Input**: Request without Authorization header
- **Assert**: 401 Unauthorized with WWW-Authenticate header

**Test: `test_api_key_in_query_param`**
- **Setup**: API key authentication configured for query param
- **Input**: `GET /api/endpoint?apikey=test-key-123`
- **Assert**: Authentication succeeds

**Test: `test_api_key_in_custom_header`**
- **Setup**: API key in `X-API-Key` header
- **Input**: Request with `X-API-Key: test-key-123`
- **Assert**: Authentication succeeds

#### 2.2 JWT Authentication
**Test: `test_jwt_valid_signature`**
- **Setup**: JWT plugin with known signing key
- **Input**: Request with valid JWT in Authorization header
- **Assert**: JWT validated, claims extracted to request context

**Test: `test_jwt_invalid_signature`**
- **Input**: Request with JWT signed by wrong key
- **Assert**: 401 Unauthorized with "invalid signature" error

**Test: `test_jwt_expired`**
- **Input**: Request with expired JWT (exp claim in past)
- **Assert**: 401 Unauthorized with "token expired" error

**Test: `test_jwt_not_before`**
- **Input**: Request with JWT with nbf claim in future
- **Assert**: 401 Unauthorized with "token not yet valid" error

**Test: `test_jwt_missing_required_claim`**
- **Setup**: JWT plugin requires "sub" claim
- **Input**: JWT without "sub" claim
- **Assert**: 401 Unauthorized with "missing required claim" error

**Test: `test_jwt_claim_validation`**
- **Setup**: JWT plugin requires `iss: "trusted-issuer"`
- **Input**: JWT with `iss: "untrusted-issuer"`
- **Assert**: 401 Unauthorized with "invalid issuer" error

**Test: `test_jwt_audience_validation`**
- **Setup**: JWT plugin configured for audience "my-api"
- **Input**: JWT with `aud: ["other-api"]`
- **Assert**: 401 Unauthorized with "invalid audience" error

#### 2.3 OAuth 2.0 Integration
**Test: `test_oauth_token_introspection`**
- **Setup**: OAuth plugin with introspection endpoint
- **Input**: Request with opaque OAuth token
- **Assert**: Token validated via introspection endpoint, user info retrieved

**Test: `test_oauth_token_cached`**
- **Setup**: Token introspection with caching enabled
- **Input**: Two requests with same token within cache TTL
- **Assert**: Second request uses cached result, no introspection call

**Test: `test_oauth_insufficient_scope`**
- **Setup**: Route requires "read:users" scope
- **Input**: Token with only "read:orders" scope
- **Assert**: 403 Forbidden with "insufficient scope" error

### 3. Authorization Tests

#### 3.1 Role-Based Access Control (RBAC)
**Test: `test_rbac_role_allowed`**
- **Setup**: Route requires "admin" role, consumer has "admin" role
- **Input**: Authenticated request
- **Assert**: Request allowed to proceed

**Test: `test_rbac_role_denied`**
- **Setup**: Route requires "admin" role, consumer has "user" role
- **Input**: Authenticated request
- **Assert**: 403 Forbidden

**Test: `test_rbac_multiple_roles`**
- **Setup**: Route accepts "admin" OR "moderator", consumer has "moderator"
- **Assert**: Request allowed

**Test: `test_rbac_hierarchical_roles`**
- **Setup**: Role hierarchy: admin > moderator > user
- **Input**: Route requires "moderator", consumer has "admin"
- **Assert**: Request allowed (admin includes moderator privileges)

#### 3.2 ACL (Access Control List)
**Test: `test_acl_consumer_whitelist`**
- **Setup**: ACL allows only consumer "app-1"
- **Input**: Request from authenticated consumer "app-1"
- **Assert**: Request allowed

**Test: `test_acl_consumer_blacklist`**
- **Input**: Request from authenticated consumer "banned-app"
- **Assert**: 403 Forbidden

#### 3.3 Scope-Based Authorization
**Test: `test_oauth_scope_validation`**
- **Setup**: Route requires "write:users" scope
- **Input**: Request with token containing "write:users" scope
- **Assert**: Request allowed

**Test: `test_oauth_scope_insufficient`**
- **Setup**: Route requires "write:users" scope
- **Input**: Request with token containing only "read:users" scope
- **Assert**: 403 Forbidden with scope error

### 4. Rate Limiting Tests

#### 4.1 Fixed Window Rate Limiting
**Test: `test_rate_limit_within_limit`**
- **Setup**: Rate limit 100 requests/minute
- **Action**: Send 50 requests in 30 seconds
- **Assert**: All requests allowed

**Test: `test_rate_limit_exceeded`**
- **Setup**: Rate limit 10 requests/minute
- **Action**: Send 15 requests quickly
- **Assert**: First 10 allowed, remaining 5 return 429 Too Many Requests

**Test: `test_rate_limit_window_reset`**
- **Setup**: Rate limit 10 requests/minute
- **Action**: Exhaust limit, wait 61 seconds, send request
- **Assert**: New request allowed after window reset

**Test: `test_rate_limit_headers`**
- **Action**: Send request within rate limit
- **Assert**: Response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers

#### 4.2 Per-Consumer Rate Limiting
**Test: `test_rate_limit_per_consumer`**
- **Setup**: 10 requests/minute per consumer
- **Action**: Consumer A sends 10 requests, Consumer B sends 5 requests
- **Assert**: Consumer A hits limit, Consumer B still has quota

**Test: `test_rate_limit_anonymous_vs_authenticated`**
- **Setup**: Anonymous: 10/min, Authenticated: 100/min
- **Action**: Send requests as both anonymous and authenticated user
- **Assert**: Different limits applied based on authentication status

#### 4.3 Rate Limiting by IP
**Test: `test_rate_limit_per_ip`**
- **Setup**: 100 requests/minute per IP
- **Action**: Send requests from different source IPs
- **Assert**: Rate limits tracked independently per IP address

#### 4.4 Sliding Window Rate Limiting
**Test: `test_sliding_window_rate_limit`**
- **Setup**: Sliding window: 60 requests/minute
- **Action**: Send 60 requests over 90 seconds (40 in first 30s, 20 in next 30s)
- **Assert**: All requests allowed (never more than 60 in any 60-second window)

### 5. Request/Response Transformation Tests

#### 5.1 Header Transformation
**Test: `test_add_request_header`**
- **Setup**: Transform plugin adds `X-Consumer-ID: {consumer.id}`
- **Action**: Send authenticated request
- **Assert**: Upstream receives added header with consumer ID

**Test: `test_remove_request_header`**
- **Setup**: Transform plugin removes `Authorization` header
- **Action**: Send request with Authorization header
- **Assert**: Upstream doesn't receive Authorization header

**Test: `test_modify_request_header`**
- **Setup**: Transform `User-Agent: {original} (via Gateway)`
- **Input**: Request with `User-Agent: Mozilla/5.0`
- **Assert**: Upstream receives `User-Agent: Mozilla/5.0 (via Gateway)`

**Test: `test_add_response_header`**
- **Setup**: Add `X-Response-Time: {response_time_ms}`
- **Assert**: Client receives added response header

#### 5.2 Body Transformation
**Test: `test_json_request_body_transform`**
- **Setup**: Transform adds `"gateway_timestamp": {timestamp}` to JSON body
- **Input**: `{"user": "alice"}`
- **Assert**: Upstream receives `{"user": "alice", "gateway_timestamp": 1644768000}`

**Test: `test_json_response_body_transform`**
- **Setup**: Transform wraps response in metadata envelope
- **Input**: Upstream returns `{"data": "value"}`
- **Assert**: Client receives `{"result": {"data": "value"}, "meta": {"timestamp": 1644768000}}`

**Test: `test_xml_to_json_transform`**
- **Setup**: XML-to-JSON transformation plugin
- **Input**: Request with `Content-Type: application/xml`
- **Assert**: Upstream receives JSON equivalent

#### 5.3 Query Parameter Transformation
**Test: `test_add_query_parameter`**
- **Setup**: Add `source=gateway` to all requests
- **Input**: `GET /api/users?limit=10`
- **Assert**: Upstream receives `GET /api/users?limit=10&source=gateway`

**Test: `test_remove_query_parameter`**
- **Setup**: Remove `debug` parameter before forwarding
- **Input**: `GET /api/users?limit=10&debug=true`
- **Assert**: Upstream receives `GET /api/users?limit=10`

### 6. Circuit Breaker Tests

#### 6.1 Circuit Breaker States
**Test: `test_circuit_breaker_closed_state`**
- **Setup**: Circuit breaker with failure threshold 5
- **Action**: Send 3 requests, all succeed
- **Assert**: All requests forwarded to upstream, circuit breaker remains CLOSED

**Test: `test_circuit_breaker_open_state`**
- **Setup**: Failure threshold 3, circuit breaker trips
- **Action**: Send request after circuit opens
- **Assert**: Request fails fast with 503 Service Unavailable, no upstream call

**Test: `test_circuit_breaker_half_open_state`**
- **Setup**: Circuit breaker open, timeout period expires
- **Action**: Send single test request
- **Assert**: Request forwarded to upstream (testing connectivity), circuit in HALF_OPEN

**Test: `test_circuit_breaker_successful_recovery`**
- **Setup**: Circuit breaker in HALF_OPEN state
- **Action**: Test request succeeds
- **Assert**: Circuit breaker transitions to CLOSED, normal operation resumes

**Test: `test_circuit_breaker_failed_recovery`**
- **Setup**: Circuit breaker in HALF_OPEN state
- **Action**: Test request fails
- **Assert**: Circuit breaker returns to OPEN state

#### 6.2 Circuit Breaker Triggers
**Test: `test_circuit_breaker_error_rate_threshold`**
- **Setup**: Error rate threshold 50%, minimum requests 10
- **Action**: Send 20 requests, 12 fail (60% error rate)
- **Assert**: Circuit breaker trips after threshold exceeded

**Test: `test_circuit_breaker_consecutive_failures`**
- **Setup**: Consecutive failure threshold 5
- **Action**: 5 requests fail in a row
- **Assert**: Circuit breaker opens after 5th consecutive failure

**Test: `test_circuit_breaker_timeout_as_failure`**
- **Setup**: Circuit breaker treats timeouts as failures
- **Action**: Upstream timeouts cause circuit to trip
- **Assert**: Circuit opens due to timeout failures

### 7. Load Balancing Tests

#### 7.1 Round Robin Load Balancing
**Test: `test_round_robin_distribution`**
- **Setup**: 3 upstream targets
- **Action**: Send 9 requests
- **Assert**: Each target receives exactly 3 requests

**Test: `test_round_robin_with_failed_target`**
- **Setup**: 3 targets, middle target fails health check
- **Action**: Send 6 requests
- **Assert**: Requests distributed only between healthy targets (3 each)

#### 7.2 Weighted Load Balancing
**Test: `test_weighted_round_robin`**
- **Setup**: Targets with weights [3, 2, 1]
- **Action**: Send 12 requests
- **Assert**: Distribution follows weights: 6, 4, 2 requests respectively

#### 7.3 Least Connections Load Balancing
**Test: `test_least_connections_selection`**
- **Setup**: 3 targets with connection counts [5, 2, 8]
- **Action**: Send new request
- **Assert**: Request routed to target with 2 connections (least)

#### 7.4 Health Check Integration
**Test: `test_health_check_removes_unhealthy_target`**
- **Setup**: Active health checking enabled
- **Action**: Target fails health check
- **Assert**: Target removed from load balancer rotation

**Test: `test_health_check_restores_healthy_target`**
- **Setup**: Previously failed target
- **Action**: Target passes health check again
- **Assert**: Target restored to load balancer rotation

### 8. Caching Tests

#### 8.1 Response Caching
**Test: `test_cache_hit_serves_cached_response`**
- **Setup**: Cache enabled with 5-minute TTL
- **Action**: 
  1. First request → cache MISS → upstream response → cached
  2. Second identical request → cache HIT
- **Assert**: Second response served from cache, no upstream call

**Test: `test_cache_miss_upstream_call`**
- **Action**: Request for uncached resource
- **Assert**: Request forwarded to upstream, response cached

**Test: `test_cache_ttl_expiration`**
- **Setup**: Cache TTL 60 seconds
- **Action**: Request → cached → wait 65 seconds → same request
- **Assert**: Second request is cache MISS (expired), fetches from upstream

**Test: `test_cache_key_generation`**
- **Setup**: Cache key includes method, path, and query parameters
- **Action**: `GET /api?param=A` and `GET /api?param=B`
- **Assert**: Different cache keys, cached separately

#### 8.2 Cache Control Headers
**Test: `test_cache_control_no_cache`**
- **Input**: Request with `Cache-Control: no-cache`
- **Assert**: Cache bypassed, request sent to upstream

**Test: `test_cache_control_max_age_override`**
- **Input**: Upstream response with `Cache-Control: max-age=300`
- **Assert**: Cache TTL follows max-age directive

**Test: `test_vary_header_cache_key`**
- **Setup**: Upstream returns `Vary: Accept-Encoding`
- **Action**: Request with gzip encoding, then without
- **Assert**: Cached separately based on Accept-Encoding header

### 9. Plugin Chain Tests

#### 9.1 Plugin Execution Order
**Test: `test_plugin_execution_order`**
- **Setup**: Plugins in order: [Auth, Rate Limit, Transform, Proxy]
- **Action**: Send request
- **Assert**: Plugins executed in specified order

**Test: `test_plugin_short_circuit`**
- **Setup**: Auth plugin rejects request
- **Action**: Send unauthenticated request
- **Assert**: Subsequent plugins (Rate Limit, Transform) not executed

#### 9.2 Plugin Configuration
**Test: `test_plugin_scope_global`**
- **Setup**: Global rate limiting plugin
- **Action**: Requests to different routes
- **Assert**: Global rate limit applied across all routes

**Test: `test_plugin_scope_service`**
- **Setup**: Service-level authentication
- **Action**: Requests to routes within service
- **Assert**: Authentication required for all routes in service

**Test: `test_plugin_scope_route`**
- **Setup**: Route-specific transformation
- **Action**: Requests to different routes
- **Assert**: Transformation only applied to configured route

### 10. Error Handling Tests

**Test: `test_upstream_connection_refused`**
- **Setup**: Upstream server not running
- **Action**: Send request
- **Assert**: 502 Bad Gateway response

**Test: `test_upstream_timeout`**
- **Setup**: Upstream response timeout 5 seconds
- **Action**: Upstream takes 10 seconds to respond
- **Assert**: 504 Gateway Timeout after 5 seconds

**Test: `test_upstream_500_error_passthrough`**
- **Action**: Upstream returns 500 Internal Server Error
- **Assert**: 500 error passed through to client

**Test: `test_malformed_request_400_error`**
- **Input**: Invalid HTTP request
- **Assert**: 400 Bad Request, request not forwarded

**Test: `test_request_size_limit_exceeded`**
- **Setup**: Max request size 1MB
- **Input**: 2MB request body
- **Assert**: 413 Payload Too Large

### 11. Observability Tests

#### 11.1 Metrics Collection
**Test: `test_request_count_metrics`**
- **Action**: Send 10 requests
- **Assert**: Request count metric incremented to 10

**Test: `test_response_time_metrics`**
- **Action**: Send request with known processing time
- **Assert**: Response time metric recorded accurately

**Test: `test_status_code_metrics`**
- **Action**: Mix of 2xx, 4xx, 5xx responses
- **Assert**: Metrics broken down by status code

#### 11.2 Distributed Tracing
**Test: `test_trace_id_generation`**
- **Action**: Send request without trace ID
- **Assert**: Gateway generates new trace ID, adds to upstream request

**Test: `test_trace_id_propagation`**
- **Input**: Request with `X-Trace-ID: abc123`
- **Assert**: Trace ID propagated to upstream service

**Test: `test_span_creation`**
- **Action**: Send request through gateway
- **Assert**: Gateway creates span with request details, timing info

## Test Execution Requirements

### Test Environment
- **Isolation**: Each test uses isolated configuration or mocked dependencies
- **Cleanup**: Routes, plugins, consumers cleaned up after each test  
- **Repeatability**: Tests produce consistent results on multiple runs
- **Speed**: Full test suite completes in < 15 minutes

### Coverage Requirements
- **Functionality**: All routing, auth, rate limiting, transformation features tested
- **Error Paths**: All error conditions and edge cases covered
- **Integration**: Plugin interactions and chain execution tested
- **Performance**: Basic performance characteristics validated

### Success Criteria
An API gateway implementation passes unit tests if:
1. **100% test pass rate** on all applicable tests
2. **Correct request routing** for all matching patterns
3. **Security enforcement** working for all authentication/authorization methods
4. **Rate limiting accuracy** within acceptable margins
5. **Plugin chain execution** in correct order with proper error handling
6. **Circuit breaker** state transitions working correctly
7. **No request/response corruption** in transformation pipeline