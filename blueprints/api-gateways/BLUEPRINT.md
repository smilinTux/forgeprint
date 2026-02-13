# API Gateway Blueprint

## Overview & Purpose

An API gateway is a centralized entry point that sits between clients and backend services, providing a unified interface for API consumers while handling cross-cutting concerns such as authentication, rate limiting, request transformation, and observability. It acts as a reverse proxy with deep application-layer intelligence, enabling organizations to manage, secure, and monitor their API traffic at scale.

### Core Responsibilities
- **Request Routing**: Route incoming API requests to appropriate backend services based on path, headers, method, and custom rules
- **Authentication & Authorization**: Validate client identity (JWT, OAuth2, API keys, mTLS) and enforce access policies (RBAC, ABAC)
- **Rate Limiting & Throttling**: Protect backend services from overload through configurable rate limits and quota management
- **Request/Response Transformation**: Modify requests and responses in-flight (header injection, body transformation, protocol translation)
- **Protocol Translation**: Bridge between protocols (REST↔gRPC, HTTP↔WebSocket, JSON↔XML)
- **Caching**: Reduce backend load through intelligent response caching
- **Observability**: Provide comprehensive logging, metrics, distributed tracing, and analytics
- **Security**: Enforce security policies including WAF rules, input validation, IP filtering, and TLS termination
- **Developer Experience**: Expose API documentation portals, SDK generation, and sandbox environments

## Core Concepts

### 1. Routes & Services

**Route**: A mapping rule that matches incoming requests to upstream services.

```
Route {
    id: Unique identifier
    name: Human-readable name
    methods: [GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD]
    paths: ["/api/v1/users", "/api/v1/users/{id}"]
    hosts: ["api.example.com", "*.example.com"]
    headers: { "X-API-Version": "2" }
    protocols: [http, https, grpc, grpcs]
    strip_path: bool
    preserve_host: bool
    priority: u32
    service_id: Reference to upstream service
    plugins: [List of applied plugins]
}
```

**Service**: A representation of an upstream backend API.

```
Service {
    id: Unique identifier
    name: Human-readable name
    protocol: http | https | grpc | grpcs | tcp | tls
    host: Backend hostname or service discovery name
    port: Backend port number
    path: Base path prefix for backend requests
    retries: Number of retry attempts
    connect_timeout: Connection timeout (ms)
    write_timeout: Write timeout (ms)
    read_timeout: Read timeout (ms)
    client_certificate: mTLS certificate for upstream
}
```

### 2. Consumers & Credentials

**Consumer**: A registered API client with associated credentials and policies.

```
Consumer {
    id: Unique identifier
    username: Human-readable identifier
    custom_id: External system identifier
    credentials: [API keys, JWT secrets, OAuth2 clients, basic auth, HMAC, mTLS certs]
    groups: [Group memberships for ACL]
    rate_limit_tier: Assigned rate limit policy
    plugins: [Consumer-scoped plugins]
}
```

**Credential Types**:
- **API Key**: Simple token-based authentication (`apikey` header or query param)
- **JWT**: JSON Web Token with configurable claims validation
- **OAuth2**: Full OAuth 2.0 flow support (authorization code, client credentials, PKCE)
- **Basic Auth**: HTTP Basic Authentication (username:password)
- **HMAC**: Request signature-based authentication
- **mTLS**: Client certificate-based mutual TLS authentication
- **LDAP**: Directory service authentication integration
- **OpenID Connect**: OIDC-based identity federation

### 3. Plugins & Middleware Pipeline

**Plugin**: A composable unit of logic that intercepts and processes requests/responses at various lifecycle phases.

```
Plugin {
    id: Unique identifier
    name: Plugin type name
    config: Plugin-specific configuration
    enabled: bool
    scope: global | service | route | consumer
    protocols: Applicable protocol filter
    ordering: { before: [...], after: [...] }
    phase: certificate | rewrite | access | header_filter | body_filter | log
}
```

**Plugin Execution Phases**:
1. **Certificate**: TLS certificate selection and client cert validation
2. **Rewrite**: URL and header rewriting before routing
3. **Access**: Authentication, authorization, rate limiting (can short-circuit)
4. **Header Filter**: Modify response headers from upstream
5. **Body Filter**: Modify response body from upstream (streaming)
6. **Log**: Async logging and analytics after response sent

### 4. Upstreams & Load Balancing

**Upstream**: A virtual hostname representing a group of backend targets with load balancing.

```
Upstream {
    id: Unique identifier
    name: Virtual hostname (e.g., "user-service.internal")
    algorithm: round_robin | consistent_hashing | least_connections | latency
    hash_on: none | consumer | ip | header | path | cookie
    hash_fallback: none | consumer | ip | header | path | cookie
    slots: Number of hash ring slots (for consistent hashing)
    healthchecks: {
        active: { ... }
        passive: { ... }
    }
    targets: [List of backend targets with weights]
    circuit_breaker: Circuit breaker configuration
}
```

### 5. API Versioning Strategies

| Strategy | Implementation | Pros | Cons |
|----------|---------------|------|------|
| **URI Path** | `/api/v1/users`, `/api/v2/users` | Simple, explicit | URL pollution |
| **Query Param** | `/api/users?version=2` | Non-intrusive | Easy to miss |
| **Header** | `Accept: application/vnd.api.v2+json` | Clean URLs | Header complexity |
| **Content Negotiation** | `Accept: application/vnd.example.v2+json` | RESTful | Complex parsing |
| **Subdomain** | `v2.api.example.com` | Clear separation | DNS management |
| **Custom Header** | `X-API-Version: 2` | Flexible | Non-standard |

## Data Flow Diagrams

### Complete Request Lifecycle
```
Client Request Flow:
┌──────────┐    ┌───────────────────────────────────────────────────────────┐    ┌──────────┐
│          │    │                    API GATEWAY                            │    │          │
│          │    │                                                           │    │          │
│  Client  │───▶│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐  │───▶│ Backend  │
│          │    │  │  TLS     │  │ Route   │  │ Plugin  │  │ Upstream  │  │    │ Service  │
│          │    │  │Terminate │─▶│ Match   │─▶│ Chain   │─▶│ Forward   │  │    │          │
│          │    │  └─────────┘  └─────────┘  └─────────┘  └───────────┘  │    │          │
│          │◀───│                                                           │◀───│          │
│          │    │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐  │    │          │
│          │    │  │Response │  │ Body    │  │ Header  │  │ Response  │  │    │          │
│          │    │  │ Send    │◀─│ Filter  │◀─│ Filter  │◀─│ Receive   │  │    │          │
│          │    │  └─────────┘  └─────────┘  └─────────┘  └───────────┘  │    │          │
└──────────┘    └───────────────────────────────────────────────────────────┘    └──────────┘
                         │                                      │
                         ▼                                      ▼
                  ┌─────────────┐                        ┌─────────────┐
                  │   Metrics   │                        │   Logging   │
                  │  Collector  │                        │   & Trace   │
                  └─────────────┘                        └─────────────┘
```

### Plugin Chain Execution
```
Plugin Execution Pipeline:
┌──────────────────────────────────────────────────────────────────┐
│                     REQUEST PHASE                                 │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ CORS     │─▶│ Rate     │─▶│ Auth     │─▶│ Request          │ │
│  │ Plugin   │  │ Limiter  │  │ Plugin   │  │ Transformer      │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
│       │              │              │                │            │
│  Can short─────Can short─────Can short─────         │            │
│  circuit        circuit        circuit               │            │
│  (preflight)   (429)          (401/403)              │            │
│                                                      ▼            │
│                                            ┌──────────────────┐  │
│                                            │ Forward to       │  │
│                                            │ Upstream         │  │
│                                            └──────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     RESPONSE PHASE (Reverse Order)                │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Response │◀─│ Cache    │◀─│ Response │◀─│ Security         │ │
│  │ Logger   │  │ Writer   │  │ Transform│  │ Headers          │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Authentication Flow
```
Authentication Decision Tree:
┌──────────────┐
│ Incoming     │
│ Request      │
└──────┬───────┘
       │
       ▼
┌──────────────┐     No Auth      ┌──────────────┐
│ Route has    │────Required──────▶│ Pass Through │
│ auth plugin? │                   └──────────────┘
└──────┬───────┘
       │ Yes
       ▼
┌──────────────┐     Not Found    ┌──────────────┐
│ Extract      │─────────────────▶│ 401          │
│ Credentials  │                   │ Unauthorized │
└──────┬───────┘                   └──────────────┘
       │ Found
       ▼
┌──────────────┐     Invalid      ┌──────────────┐
│ Validate     │─────────────────▶│ 401/403      │
│ Credentials  │                   │ Invalid      │
└──────┬───────┘                   └──────────────┘
       │ Valid
       ▼
┌──────────────┐     Denied       ┌──────────────┐
│ Check        │─────────────────▶│ 403          │
│ Authorization│                   │ Forbidden    │
└──────┬───────┘                   └──────────────┘
       │ Allowed
       ▼
┌──────────────┐
│ Set Consumer │
│ Context      │
│ Continue     │
└──────────────┘
```

### Rate Limiting Architecture
```
Rate Limiter Data Flow:
┌──────────────┐    ┌────────────────────┐    ┌──────────────────┐
│   Request    │───▶│  Identify Client   │───▶│  Lookup Counter  │
│   Arrives    │    │  (IP/Key/Consumer) │    │  (Local/Redis)   │
└──────────────┘    └────────────────────┘    └────────┬─────────┘
                                                       │
                                              ┌────────▼─────────┐
                                              │  Window Check    │
                                              │  (Fixed/Sliding/ │
                                              │   Token Bucket)  │
                                              └────────┬─────────┘
                                                       │
                                          ┌────────────┴────────────┐
                                          │                         │
                                   ┌──────▼──────┐          ┌──────▼──────┐
                                   │  Within     │          │  Exceeded   │
                                   │  Limit      │          │  Limit      │
                                   └──────┬──────┘          └──────┬──────┘
                                          │                         │
                                   ┌──────▼──────┐          ┌──────▼──────┐
                                   │ Increment   │          │ 429 Too     │
                                   │ Counter     │          │ Many Reqs   │
                                   │ Set Headers │          │ Retry-After │
                                   │ Continue    │          │ X-RateLimit │
                                   └─────────────┘          └─────────────┘
```

### Circuit Breaker State Machine
```
Circuit Breaker States:
                    success_threshold
                    reached
           ┌──────────────────────────────┐
           │                              │
    ┌──────▼──────┐   failure_threshold  ┌┴─────────────┐
    │             │   exceeded           │              │
    │   CLOSED   │──────────────────────▶│    OPEN      │
    │  (normal)  │                       │  (failing    │
    │            │                       │   fast)      │
    └─────────────┘                      └──────┬───────┘
           ▲                                     │
           │                              timeout│expires
           │                                     │
           │           success           ┌───────▼───────┐
           └─────────────────────────────│   HALF-OPEN   │
                                         │  (testing     │
                    failure              │   recovery)   │
                    ┌────────────────────│               │
                    │                    └───────────────┘
                    │
             ┌──────▼──────┐
             │    OPEN     │
             └─────────────┘
```

## Protocol Support Matrix

| Protocol | Layer | Features | Use Cases |
|----------|-------|----------|-----------|
| **HTTP/1.1** | L7 | Full header inspection, body transformation, caching | REST APIs, web applications |
| **HTTP/2** | L7 | Multiplexing, server push, header compression | High-performance APIs, gRPC |
| **HTTP/3 (QUIC)** | L7 | 0-RTT, connection migration, reduced head-of-line blocking | Mobile APIs, global APIs |
| **gRPC** | L7 | Protobuf inspection, transcoding to REST, streaming | Microservice communication |
| **GraphQL** | L7 | Query depth limiting, field-level auth, persisted queries | Flexible client queries |
| **WebSocket** | L7 | Upgrade handling, frame inspection, per-message auth | Real-time applications |
| **Server-Sent Events** | L7 | Long-lived streaming, reconnection | Push notifications |
| **TCP** | L4 | Raw proxying, SNI-based routing | Database proxying, custom protocols |
| **TLS** | L4 | mTLS termination, certificate management | Secure service-to-service |

### Protocol-Specific Gateway Features

#### REST/HTTP Features
- Path parameter extraction and validation (`/users/{id}`)
- Query parameter validation against OpenAPI schema
- Content negotiation (JSON, XML, YAML, MessagePack)
- CORS preflight handling and header injection
- HTTP method override (`X-HTTP-Method-Override`)
- Request/response body schema validation
- API versioning (path, header, query param)
- HATEOAS link rewriting

#### gRPC Features
- gRPC-to-JSON transcoding (HTTP/JSON ↔ gRPC/Protobuf)
- gRPC health checking protocol support
- gRPC reflection service proxying
- gRPC metadata manipulation (headers/trailers)
- Unary, server-streaming, client-streaming, bidirectional streaming
- gRPC-Web support for browser clients
- Deadline/timeout propagation
- Error code mapping (gRPC status → HTTP status)

#### GraphQL Features
- Query depth and complexity limiting
- Field-level authorization
- Query cost analysis and rejection
- Persisted queries / automatic persisted queries (APQ)
- GraphQL subscription (WebSocket) proxying
- Schema stitching / federation gateway
- Introspection control (enable/disable)
- Query batching support

## Configuration Model

### Hierarchical Structure
```yaml
api_gateway:
  global:
    admin_listen: "0.0.0.0:8001"
    proxy_listen: "0.0.0.0:8000"
    ssl_listen: "0.0.0.0:8443"
    database: "postgres" | "cassandra" | "off" (declarative)
    log_level: "info"
    
  services:
    - name: user-service
      url: http://user-svc.internal:8080
      retries: 3
      connect_timeout: 5000
      routes:
        - name: user-routes
          paths: ["/api/v1/users"]
          methods: [GET, POST, PUT, DELETE]
          plugins:
            - name: jwt
              config:
                secret_is_base64: true
                claims_to_verify: ["exp", "nbf"]
            - name: rate-limiting
              config:
                minute: 100
                policy: redis
                
  consumers:
    - username: mobile-app
      credentials:
        - type: jwt
          key: "mobile-app-iss"
          secret: "..."
      plugins:
        - name: rate-limiting
          config:
            minute: 1000  # Higher limit for this consumer
            
  plugins:
    - name: cors
      config:
        origins: ["*"]
        methods: [GET, POST, PUT, DELETE, OPTIONS]
        headers: [Authorization, Content-Type]
        
  upstreams:
    - name: user-svc.internal
      algorithm: round-robin
      healthchecks:
        active:
          http_path: /health
          healthy:
            interval: 5
            successes: 2
          unhealthy:
            interval: 5
            http_failures: 3
      targets:
        - target: 10.0.0.1:8080
          weight: 100
        - target: 10.0.0.2:8080
          weight: 100
```

### Configuration Hot-Reload
- **Zero-downtime**: Configuration changes applied without dropping connections
- **Declarative mode**: Entire config replaced atomically (dbless/declarative)
- **Incremental mode**: Individual entities created/updated/deleted via Admin API
- **Validation**: Full schema validation before applying any changes
- **Rollback**: Automatic rollback on failed configuration application
- **Event propagation**: Configuration changes propagated to all gateway nodes in cluster

### Environment Variables & Secrets
- Support environment variable substitution in config (`${ENV_VAR}`)
- Integration with external secret stores (Vault, AWS Secrets Manager, K8s Secrets)
- Encrypted credential storage in database
- Secret rotation without gateway restart
- Certificate hot-reload for TLS termination

## Extension Points

### 1. Plugin Interface
```rust
trait GatewayPlugin {
    fn name(&self) -> &str;
    fn priority(&self) -> u32;  // Execution order (higher = earlier)
    fn phases(&self) -> Vec<Phase>;
    
    // Lifecycle hooks
    fn on_certificate(&self, ctx: &mut CertificateContext) -> PluginResult { Ok(()) }
    fn on_rewrite(&self, ctx: &mut RewriteContext) -> PluginResult { Ok(()) }
    fn on_access(&self, ctx: &mut AccessContext) -> PluginResult { Ok(()) }
    fn on_header_filter(&self, ctx: &mut HeaderFilterContext) -> PluginResult { Ok(()) }
    fn on_body_filter(&self, ctx: &mut BodyFilterContext) -> PluginResult { Ok(()) }
    fn on_log(&self, ctx: &LogContext) { }
    
    // Configuration
    fn schema(&self) -> JsonSchema;
    fn configure(&mut self, config: Value) -> Result<(), ConfigError>;
}
```

### 2. Authentication Provider Interface
```rust
trait AuthProvider {
    fn authenticate(&self, request: &Request) -> Result<Consumer, AuthError>;
    fn extract_credentials(&self, request: &Request) -> Option<Credentials>;
    fn validate_credentials(&self, creds: &Credentials) -> Result<Identity, AuthError>;
    fn refresh_token(&self, refresh_token: &str) -> Result<TokenPair, AuthError>;
}
```

### 3. Rate Limiter Backend Interface
```rust
trait RateLimiterBackend {
    fn increment(&self, key: &str, window: Duration) -> Result<RateLimitStatus, Error>;
    fn get_remaining(&self, key: &str, limit: u64, window: Duration) -> Result<u64, Error>;
    fn reset(&self, key: &str) -> Result<(), Error>;
}
```

### 4. Service Discovery Interface
```rust
trait ServiceDiscovery {
    fn resolve(&self, service_name: &str) -> Result<Vec<Target>, DiscoveryError>;
    fn watch(&self, service_name: &str, callback: Box<dyn Fn(Vec<Target>)>) -> WatchHandle;
    fn register(&self, service: ServiceRegistration) -> Result<(), DiscoveryError>;
    fn deregister(&self, service_id: &str) -> Result<(), DiscoveryError>;
}
```

### 5. Transformation Engine Interface
```rust
trait TransformationEngine {
    fn transform_request(&self, request: &mut Request, config: &TransformConfig) -> Result<(), TransformError>;
    fn transform_response(&self, response: &mut Response, config: &TransformConfig) -> Result<(), TransformError>;
    fn validate_schema(&self, body: &[u8], schema: &JsonSchema) -> Result<(), ValidationError>;
}
```

### 6. Cache Backend Interface
```rust
trait CacheBackend {
    fn get(&self, key: &str) -> Result<Option<CachedResponse>, CacheError>;
    fn set(&self, key: &str, response: &CachedResponse, ttl: Duration) -> Result<(), CacheError>;
    fn invalidate(&self, key: &str) -> Result<(), CacheError>;
    fn invalidate_pattern(&self, pattern: &str) -> Result<(), CacheError>;
    fn stats(&self) -> CacheStats;
}
```

## Security Considerations

### 1. Authentication Security
- **JWT Validation**: Signature verification, expiration checking, audience validation, issuer validation
- **Token Storage**: Never log or cache full tokens; use token hashes for tracking
- **Key Rotation**: Support for JWKS endpoints with automatic key rotation
- **OAuth2 Security**: PKCE enforcement, state parameter validation, token binding
- **API Key Security**: Key hashing in storage, key rotation policies, key scoping
- **mTLS**: Certificate chain validation, CRL/OCSP checking, certificate pinning options

### 2. Input Validation & Injection Prevention
- **Request size limits**: Maximum header size, body size, URL length
- **Header injection prevention**: Strip CRLF from header values
- **Path traversal protection**: Normalize and validate URL paths
- **SQL injection markers**: Detect and block common injection patterns in query params
- **XSS prevention**: Content-Type enforcement, output encoding
- **Schema validation**: Validate request bodies against OpenAPI schemas
- **GraphQL-specific**: Query depth limiting, complexity scoring, introspection control

### 3. Transport Security
- **TLS 1.3 preferred**: Disable TLS 1.0/1.1, configure strong cipher suites
- **HSTS enforcement**: Strict-Transport-Security header injection
- **Certificate management**: Auto-renewal (ACME/Let's Encrypt), SNI support
- **mTLS to upstreams**: Encrypted and authenticated communication to backends
- **Perfect Forward Secrecy**: Ephemeral key exchange (ECDHE)

### 4. Rate Limiting & DDoS Protection
- **Multi-layer limiting**: Per-IP, per-consumer, per-route, global limits
- **Adaptive rate limiting**: Adjust limits based on backend health
- **Slowloris protection**: Request header/body timeout enforcement
- **Connection limits**: Maximum concurrent connections per source
- **Payload size limits**: Reject oversized requests early

### 5. Audit & Compliance
- **Access logging**: Every request logged with correlation ID
- **Security event logging**: Auth failures, rate limit hits, blocked requests
- **Data masking**: Mask sensitive data in logs (Authorization headers, PII)
- **Compliance**: GDPR data handling, HIPAA audit trails, PCI DSS logging
- **Non-repudiation**: Request signing and verification for critical APIs

## Performance Targets

### Throughput Targets (per core)
- **Simple proxy (no plugins)**: 30,000 requests/second
- **With auth (JWT validation)**: 20,000 requests/second
- **With auth + rate limiting**: 15,000 requests/second
- **With full plugin chain (6+ plugins)**: 8,000 requests/second
- **gRPC proxy**: 25,000 requests/second
- **GraphQL (with depth check)**: 10,000 requests/second

### Latency Targets
- **P50 latency (no plugins)**: < 1ms added
- **P50 latency (auth + rate limit)**: < 3ms added
- **P95 latency (full chain)**: < 10ms added
- **P99 latency (full chain)**: < 25ms added
- **JWT validation overhead**: < 0.5ms
- **Rate limit check overhead**: < 0.2ms

### Resource Utilization
- **Memory per route**: < 2KB
- **Memory per active connection**: < 8KB
- **Memory per rate limit counter**: < 64 bytes
- **Memory per cached response**: Response size + 256 bytes metadata
- **CPU utilization**: < 80% under normal load
- **File descriptors**: Support for 50,000+ concurrent connections

### Scalability Targets
- **Route table**: Support 50,000+ routes with < 1ms lookup
- **Consumer registry**: Support 1,000,000+ consumers
- **Horizontal scaling**: Linear throughput increase with added nodes
- **Configuration propagation**: < 5 seconds cluster-wide
- **Health check overhead**: < 2% CPU for 1,000 upstream targets

### Reliability Targets
- **Uptime**: 99.99% availability (52 minutes downtime/year)
- **Zero-downtime deploys**: Config changes and upgrades without dropping connections
- **Graceful degradation**: Continue routing if auth service is down (configurable)
- **Fast failover**: < 5 seconds to detect and route around failed upstreams
- **Recovery**: Full functionality restored within 30 seconds of dependency recovery

## Implementation Architecture

### Core Components
1. **Listener Manager**: Accept and manage client connections (HTTP, HTTPS, gRPC, WebSocket)
2. **Router Engine**: High-performance route matching (radix tree / prefix tree)
3. **Plugin Engine**: Ordered plugin chain execution with short-circuit capability
4. **Auth Engine**: Multi-strategy authentication with credential caching
5. **Rate Limiter**: Distributed rate limiting with multiple algorithm support
6. **Upstream Manager**: Backend pool management, load balancing, health checking
7. **Cache Engine**: Response caching with configurable invalidation strategies
8. **Transformation Engine**: Request/response modification pipeline
9. **Configuration Manager**: Hot-reload, validation, cluster sync
10. **Observability Engine**: Structured logging, metrics export, trace propagation

### Core Data Structures
```rust
// Route table entry
struct Route {
    id: RouteId,
    methods: MethodSet,           // Bitfield for HTTP methods
    paths: Vec<PathMatcher>,      // Compiled path patterns
    hosts: Vec<HostMatcher>,      // Compiled host patterns
    headers: Vec<HeaderMatcher>,  // Header matching rules
    priority: u32,
    service: ServiceId,
    plugins: Vec<PluginInstance>,
    strip_path: bool,
    preserve_host: bool,
}

// Radix tree for fast route lookup
struct RouteTable {
    tree: RadixTree<Vec<Route>>,     // Path-based primary index
    host_index: HashMap<String, Vec<RouteId>>,  // Host secondary index
    method_index: [Vec<RouteId>; 9], // Method secondary index
    total_routes: usize,
}

// Consumer with credentials
struct Consumer {
    id: ConsumerId,
    username: String,
    custom_id: Option<String>,
    credentials: Vec<Credential>,
    groups: Vec<GroupId>,
    plugins: Vec<PluginInstance>,
    rate_limit_tier: Option<RateLimitTier>,
    created_at: Timestamp,
}

// Plugin execution context
struct PluginContext {
    route: Arc<Route>,
    service: Arc<Service>,
    consumer: Option<Arc<Consumer>>,
    request: Request,
    response: Option<Response>,
    shared_state: HashMap<String, Value>,  // Inter-plugin communication
    timing: PluginTimingInfo,
}

// Upstream target with health info
struct UpstreamTarget {
    address: SocketAddr,
    weight: u32,
    health: HealthStatus,
    active_connections: AtomicU32,
    total_requests: AtomicU64,
    total_failures: AtomicU64,
    avg_latency: AtomicU64,  // Microseconds, exponential moving average
}

// Rate limiter state
struct RateLimitState {
    counters: HashMap<RateLimitKey, WindowCounter>,
    policy: RateLimitPolicy,
}

struct WindowCounter {
    count: AtomicU64,
    window_start: AtomicU64,
    window_duration: Duration,
    limit: u64,
}

// Cached response
struct CachedResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
    created_at: Timestamp,
    ttl: Duration,
    vary_key: String,
    etag: Option<String>,
}

// Gateway configuration
struct GatewayConfig {
    listeners: Vec<ListenerConfig>,
    services: Vec<ServiceConfig>,
    routes: Vec<RouteConfig>,
    consumers: Vec<ConsumerConfig>,
    upstreams: Vec<UpstreamConfig>,
    plugins: Vec<PluginConfig>,  // Global plugins
    certificates: Vec<CertificateConfig>,
    global_settings: GlobalSettings,
}
```

This blueprint provides the comprehensive foundation needed to implement a production-grade API gateway with all essential features, security considerations, authentication strategies, and performance requirements clearly defined.
