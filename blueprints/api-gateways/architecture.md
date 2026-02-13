# API Gateway Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing production-grade API gateways. It covers the plugin/middleware pipeline, request lifecycle, upstream management, service discovery integration, configuration hot-reload, multi-tenancy, and security architecture that determine scalability, extensibility, and reliability.

## Architectural Foundations

### 1. Core Architecture Patterns

#### Event-Driven with Plugin Pipeline (Recommended)
**Single-threaded event loops per core with composable plugin chain**

```rust
struct ApiGateway {
    listeners: Vec<Listener>,
    router: Arc<RouteTable>,
    plugin_registry: Arc<PluginRegistry>,
    upstream_manager: Arc<UpstreamManager>,
    config_manager: Arc<ConfigManager>,
    metrics: Arc<MetricsEngine>,
    worker_count: usize,
}

struct Worker {
    id: usize,
    event_loop: EventLoop,
    router: Arc<RouteTable>,
    plugin_chain: PluginChain,
    upstream_pool: ConnectionPoolManager,
    rate_limiter: RateLimiter,
    cache: LocalCache,
}

impl Worker {
    fn run(&mut self) -> Result<(), WorkerError> {
        loop {
            let num_events = self.event_loop.poll(POLL_TIMEOUT_MS)?;
            
            for event in self.event_loop.events(num_events) {
                match event.token() {
                    Token::Listener(id) => self.accept_connection(id)?,
                    Token::Client(conn_id) => self.handle_client_event(conn_id, event)?,
                    Token::Upstream(conn_id) => self.handle_upstream_event(conn_id, event)?,
                    Token::Timer(timer_id) => self.handle_timer(timer_id)?,
                    Token::Signal(sig) => self.handle_signal(sig)?,
                }
            }
            
            // Process timers: health checks, cache eviction, config sync
            self.process_pending_timers();
            
            // Process deferred tasks: async auth lookups, rate limit syncs
            self.process_deferred_tasks();
        }
    }
}
```

**Benefits:**
- **High concurrency**: Each worker handles thousands of connections
- **Plugin isolation**: Plugins execute within well-defined phases
- **Predictable latency**: No thread contention per-request
- **Horizontal scaling**: Add workers per CPU core

**Considerations:**
- **Plugin CPU work**: CPU-bound plugins (crypto, body transforms) can block the event loop
- **Shared state**: Rate limiter and cache state needs synchronization across workers
- **Plugin ordering**: Incorrect ordering can cause security bypasses

#### Multi-Threaded Worker Pool Architecture
**Thread pool with shared route table and per-thread plugin instances**

```rust
struct ThreadPoolGateway {
    listener: TcpListener,
    workers: Vec<JoinHandle<()>>,
    shared_config: Arc<RwLock<GatewayConfig>>,
    shared_router: Arc<RwLock<RouteTable>>,
    plugin_factories: Arc<Vec<Box<dyn PluginFactory>>>,
}

struct WorkerThread {
    id: usize,
    router: Arc<RwLock<RouteTable>>,
    plugin_instances: Vec<Box<dyn GatewayPlugin>>,  // Per-thread instances
    connection_pool: ConnectionPool,
    local_cache: LruCache<String, CachedResponse>,
    rate_limiter: Arc<DistributedRateLimiter>,
}

impl WorkerThread {
    fn process_request(&mut self, request: Request) -> Response {
        // 1. Route matching (read lock on router)
        let route = {
            let router = self.router.read().unwrap();
            router.match_route(&request)
        };
        
        let route = match route {
            Some(r) => r,
            None => return Response::not_found(),
        };
        
        // 2. Build plugin chain for this route
        let chain = self.build_plugin_chain(&route);
        
        // 3. Execute request through chain
        let mut ctx = PluginContext::new(request, route);
        
        for plugin in &chain {
            match plugin.on_access(&mut ctx) {
                PluginResult::Continue => continue,
                PluginResult::Response(resp) => return resp,
                PluginResult::Error(e) => return Response::from_error(e),
            }
        }
        
        // 4. Forward to upstream
        let upstream_response = self.forward_to_upstream(&ctx);
        
        // 5. Execute response plugins (reverse order)
        ctx.set_response(upstream_response);
        for plugin in chain.iter().rev() {
            plugin.on_header_filter(&mut ctx);
            plugin.on_body_filter(&mut ctx);
        }
        
        // 6. Log phase (async, non-blocking)
        for plugin in &chain {
            plugin.on_log(&ctx);
        }
        
        ctx.take_response()
    }
}
```

#### Sidecar / Service Mesh Architecture
**Lightweight per-service proxy with centralized control plane**

```rust
struct SidecarGateway {
    // Lightweight data plane
    inbound_listener: Listener,   // Intercept incoming traffic
    outbound_listener: Listener,  // Intercept outgoing traffic
    local_service: SocketAddr,    // Local application
    
    // Control plane connection
    control_plane: ControlPlaneClient,
    
    // Minimal config synced from control plane
    routes: Arc<RwLock<Vec<Route>>>,
    policies: Arc<RwLock<Vec<Policy>>>,
    certificates: Arc<RwLock<CertificateStore>>,
}

impl SidecarGateway {
    async fn handle_inbound(&self, request: Request) -> Response {
        // Apply inbound policies (auth, rate limit)
        let policies = self.policies.read().await;
        for policy in policies.iter().filter(|p| p.direction == Inbound) {
            policy.enforce(&request)?;
        }
        
        // Forward to local service
        self.forward_to_local(request).await
    }
    
    async fn handle_outbound(&self, request: Request) -> Response {
        // Apply outbound policies (mTLS, retry, circuit breaker)
        let policies = self.policies.read().await;
        for policy in policies.iter().filter(|p| p.direction == Outbound) {
            policy.enforce(&request)?;
        }
        
        // Resolve destination via service discovery
        let target = self.control_plane.resolve(&request.host()).await?;
        
        // Forward with mTLS
        self.forward_with_mtls(request, target).await
    }
}
```

### 2. Request Lifecycle State Machine

#### Complete Request Processing States
```rust
#[derive(Debug, Clone, Copy, PartialEq)]
enum RequestState {
    // Connection establishment
    Accepting,              // Accepting TCP connection
    TlsHandshaking,        // TLS handshake (if HTTPS)
    
    // Request parsing
    ReadingHeaders,         // Reading HTTP request line and headers
    ReadingBody,            // Reading request body (if present)
    
    // Gateway processing
    RouteMatching,          // Finding matching route in route table
    PluginCertificate,      // Certificate phase plugins
    PluginRewrite,          // Rewrite phase plugins (URL/header rewriting)
    PluginAccess,           // Access phase plugins (auth, rate limit, ACL)
    CacheCheck,             // Check response cache before forwarding
    
    // Upstream communication
    SelectingUpstream,      // Choosing upstream target (load balancing)
    ConnectingUpstream,     // Establishing connection to upstream
    SendingUpstream,        // Sending request to upstream
    ReceivingHeaders,       // Reading upstream response headers
    ReceivingBody,          // Reading upstream response body
    
    // Response processing
    PluginHeaderFilter,     // Response header filter plugins
    PluginBodyFilter,       // Response body filter plugins (streaming)
    CacheWrite,             // Write response to cache
    SendingResponse,        // Sending response to client
    
    // Completion
    PluginLog,              // Async log phase plugins
    KeepAlive,              // Waiting for next request (keep-alive)
    
    // Error / cleanup
    RetryingUpstream,       // Retrying with different upstream target
    CircuitBreakerTripped,  // Circuit breaker is open, returning error
    ShortCircuited,         // Plugin returned early response (401, 429, etc.)
    Error,                  // Error state, generating error response
    Closing,                // Closing connection
}

impl RequestState {
    fn valid_transitions(&self) -> &[RequestState] {
        use RequestState::*;
        match self {
            Accepting => &[TlsHandshaking, ReadingHeaders, Error, Closing],
            TlsHandshaking => &[ReadingHeaders, Error, Closing],
            ReadingHeaders => &[ReadingBody, RouteMatching, Error, Closing],
            ReadingBody => &[RouteMatching, Error, Closing],
            RouteMatching => &[PluginCertificate, PluginRewrite, Error],
            PluginCertificate => &[PluginRewrite, ShortCircuited, Error],
            PluginRewrite => &[PluginAccess, ShortCircuited, Error],
            PluginAccess => &[CacheCheck, ShortCircuited, Error],
            CacheCheck => &[SelectingUpstream, PluginHeaderFilter], // cache hit skips upstream
            SelectingUpstream => &[ConnectingUpstream, CircuitBreakerTripped, Error],
            ConnectingUpstream => &[SendingUpstream, RetryingUpstream, Error],
            SendingUpstream => &[ReceivingHeaders, RetryingUpstream, Error],
            ReceivingHeaders => &[ReceivingBody, PluginHeaderFilter, Error],
            ReceivingBody => &[PluginHeaderFilter, Error],
            PluginHeaderFilter => &[PluginBodyFilter, SendingResponse, Error],
            PluginBodyFilter => &[SendingResponse, Error],
            CacheWrite => &[SendingResponse],
            SendingResponse => &[PluginLog, KeepAlive, Closing],
            PluginLog => &[KeepAlive, Closing],
            KeepAlive => &[ReadingHeaders, Closing],
            RetryingUpstream => &[SelectingUpstream, Error],
            CircuitBreakerTripped => &[PluginHeaderFilter], // return 503
            ShortCircuited => &[SendingResponse],
            Error => &[SendingResponse, Closing],
            Closing => &[],
        }
    }
}
```

#### Request Context Through Lifecycle
```rust
struct RequestContext {
    // Immutable request info
    connection_id: ConnectionId,
    client_addr: SocketAddr,
    tls_info: Option<TlsInfo>,
    received_at: Instant,
    
    // Mutable request (plugins can modify)
    request: Request,
    original_path: String,       // Before rewriting
    original_host: Option<String>, // Before rewriting
    
    // Routing result
    matched_route: Option<Arc<Route>>,
    matched_service: Option<Arc<Service>>,
    
    // Authentication result
    consumer: Option<Arc<Consumer>>,
    authenticated_credential: Option<Credential>,
    auth_groups: Vec<String>,
    
    // Upstream state
    selected_upstream: Option<Arc<UpstreamTarget>>,
    upstream_attempts: u32,
    upstream_connect_time: Option<Duration>,
    upstream_header_time: Option<Duration>,
    upstream_response_time: Option<Duration>,
    
    // Response
    response: Option<Response>,
    cache_status: CacheStatus,  // Miss, Hit, Bypass, Expired
    
    // Plugin shared state (inter-plugin communication)
    ctx_variables: HashMap<String, Value>,
    
    // Timing
    timing: RequestTiming,
}

struct RequestTiming {
    received_at: Instant,
    tls_handshake_ms: Option<f64>,
    route_match_us: Option<f64>,
    plugin_access_ms: Option<f64>,
    upstream_connect_ms: Option<f64>,
    upstream_response_ms: Option<f64>,
    plugin_response_ms: Option<f64>,
    total_ms: Option<f64>,
}

struct TlsInfo {
    version: TlsVersion,
    cipher: String,
    client_cert_subject: Option<String>,
    client_cert_serial: Option<String>,
    sni_hostname: Option<String>,
}
```

### 3. Route Matching Engine

#### Radix Tree-Based Router
```rust
struct RouteTable {
    // Primary index: radix tree on normalized path
    path_tree: RadixTree<RouteNode>,
    
    // Secondary indexes for fast narrowing
    host_index: HashMap<String, BitSet>,     // host -> route IDs
    method_index: [BitSet; 9],               // method -> route IDs
    
    // Route storage
    routes: Vec<Arc<Route>>,
    
    // Stats
    total_routes: usize,
    last_rebuild: Instant,
}

struct RouteNode {
    // Multiple routes can match same path (different methods/hosts/headers)
    route_ids: Vec<usize>,
    
    // Path parameters captured at this node
    param_names: Vec<String>,
    
    // Whether this is a wildcard catch-all node
    is_catch_all: bool,
}

impl RouteTable {
    fn match_route(&self, request: &Request) -> Option<RouteMatch> {
        let path = normalize_path(request.path());
        let method = request.method();
        let host = request.host();
        
        // 1. Path tree lookup (returns candidate nodes)
        let path_candidates = self.path_tree.find(&path);
        
        if path_candidates.is_empty() {
            return None;
        }
        
        // 2. Filter by host (if any routes have host constraints)
        let host_filtered = if let Some(host) = host {
            self.filter_by_host(&path_candidates, host)
        } else {
            path_candidates
        };
        
        // 3. Filter by method
        let method_filtered = self.filter_by_method(&host_filtered, method);
        
        // 4. Filter by headers (for routes with header constraints)
        let header_filtered = self.filter_by_headers(&method_filtered, request.headers());
        
        // 5. Select highest priority match
        header_filtered.into_iter()
            .max_by_key(|m| m.route.priority)
    }
    
    fn rebuild_from_config(&mut self, routes: Vec<RouteConfig>) {
        let mut new_tree = RadixTree::new();
        let mut new_routes = Vec::new();
        let mut new_host_index = HashMap::new();
        let mut new_method_index: [BitSet; 9] = Default::default();
        
        for (idx, route_config) in routes.into_iter().enumerate() {
            let route = Arc::new(Route::from_config(route_config));
            
            // Insert into path tree
            for path in &route.paths {
                let compiled = compile_path_pattern(path);
                new_tree.insert(&compiled.normalized, RouteNode {
                    route_ids: vec![idx],
                    param_names: compiled.params,
                    is_catch_all: compiled.is_catch_all,
                });
            }
            
            // Build secondary indexes
            for host in &route.hosts {
                new_host_index.entry(host.clone())
                    .or_insert_with(BitSet::new)
                    .insert(idx);
            }
            
            for method in &route.methods {
                new_method_index[method_to_index(method)].insert(idx);
            }
            
            new_routes.push(route);
        }
        
        // Atomic swap
        self.path_tree = new_tree;
        self.routes = new_routes;
        self.host_index = new_host_index;
        self.method_index = new_method_index;
        self.total_routes = self.routes.len();
        self.last_rebuild = Instant::now();
    }
}

struct RouteMatch {
    route: Arc<Route>,
    service: Arc<Service>,
    path_params: HashMap<String, String>,
    matched_path: String,
    stripped_path: Option<String>,
}
```

#### Path Pattern Compilation
```rust
enum PathSegment {
    Literal(String),       // /users
    Parameter(String),     // /{id}
    Wildcard,              // /*
    Regex(String, Regex),  // /{id:[0-9]+}
}

struct CompiledPath {
    normalized: String,
    segments: Vec<PathSegment>,
    params: Vec<String>,
    is_catch_all: bool,
    specificity: u32,  // Higher = more specific (for priority)
}

fn compile_path_pattern(pattern: &str) -> CompiledPath {
    let mut segments = Vec::new();
    let mut params = Vec::new();
    let mut specificity = 0;
    let mut is_catch_all = false;
    
    for part in pattern.split('/').filter(|s| !s.is_empty()) {
        if part == "*" {
            segments.push(PathSegment::Wildcard);
            is_catch_all = true;
        } else if part.starts_with('{') && part.ends_with('}') {
            let inner = &part[1..part.len()-1];
            if let Some(colon_pos) = inner.find(':') {
                let name = &inner[..colon_pos];
                let pattern = &inner[colon_pos+1..];
                let regex = Regex::new(pattern).expect("Invalid path regex");
                params.push(name.to_string());
                segments.push(PathSegment::Regex(name.to_string(), regex));
                specificity += 2;  // Regex is more specific than plain param
            } else {
                params.push(inner.to_string());
                segments.push(PathSegment::Parameter(inner.to_string()));
                specificity += 1;
            }
        } else {
            segments.push(PathSegment::Literal(part.to_string()));
            specificity += 3;  // Literal is most specific
        }
    }
    
    CompiledPath {
        normalized: pattern.to_string(),
        segments,
        params,
        is_catch_all,
        specificity,
    }
}
```

### 4. Plugin Engine Architecture

#### Plugin Registry and Lifecycle
```rust
struct PluginRegistry {
    // Registered plugin factories
    factories: HashMap<String, Box<dyn PluginFactory>>,
    
    // Global plugin instances (applied to all routes)
    global_plugins: Vec<PluginInstance>,
    
    // Plugin ordering by phase
    phase_order: HashMap<Phase, Vec<String>>,
}

trait PluginFactory: Send + Sync {
    fn name(&self) -> &str;
    fn version(&self) -> &str;
    fn priority(&self) -> u32;
    fn phases(&self) -> Vec<Phase>;
    fn schema(&self) -> JsonSchema;
    fn create(&self, config: Value) -> Result<Box<dyn GatewayPlugin>, PluginError>;
}

struct PluginInstance {
    plugin: Box<dyn GatewayPlugin>,
    config: Value,
    enabled: bool,
    scope: PluginScope,
    priority: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Phase {
    Certificate,    // TLS certificate selection
    Rewrite,        // URL/header rewriting
    Access,         // Auth, rate limiting, ACL (can short-circuit)
    BalancerPick,   // Custom load balancing
    HeaderFilter,   // Response header modification
    BodyFilter,     // Response body modification (streaming)
    Log,            // Async post-response logging
}

#[derive(Debug, Clone, Copy)]
enum PluginScope {
    Global,         // All routes
    Service(ServiceId),
    Route(RouteId),
    Consumer(ConsumerId),
}

impl PluginRegistry {
    fn build_chain_for_route(&self, route: &Route, consumer: Option<&Consumer>) -> PluginChain {
        let mut plugins: Vec<&PluginInstance> = Vec::new();
        
        // 1. Collect global plugins
        plugins.extend(self.global_plugins.iter().filter(|p| p.enabled));
        
        // 2. Collect service-level plugins
        if let Some(service_plugins) = self.service_plugins.get(&route.service_id) {
            plugins.extend(service_plugins.iter().filter(|p| p.enabled));
        }
        
        // 3. Collect route-level plugins (override service/global)
        plugins.extend(route.plugins.iter().filter(|p| p.enabled));
        
        // 4. Collect consumer-level plugins
        if let Some(consumer) = consumer {
            plugins.extend(consumer.plugins.iter().filter(|p| p.enabled));
        }
        
        // 5. Deduplicate (consumer > route > service > global)
        let deduped = self.deduplicate_by_scope(plugins);
        
        // 6. Sort by priority within each phase
        let mut chain = PluginChain::new();
        for phase in Phase::all() {
            let mut phase_plugins: Vec<_> = deduped.iter()
                .filter(|p| p.plugin.phases().contains(&phase))
                .collect();
            phase_plugins.sort_by_key(|p| std::cmp::Reverse(p.priority));
            chain.add_phase(phase, phase_plugins);
        }
        
        chain
    }
}
```

#### Plugin Chain Execution
```rust
struct PluginChain {
    phases: HashMap<Phase, Vec<PluginRef>>,
}

impl PluginChain {
    fn execute_access_phase(&self, ctx: &mut RequestContext) -> AccessResult {
        if let Some(plugins) = self.phases.get(&Phase::Access) {
            for plugin in plugins {
                let start = Instant::now();
                
                let result = plugin.on_access(ctx);
                
                // Record plugin timing
                ctx.timing.record_plugin(plugin.name(), Phase::Access, start.elapsed());
                
                match result {
                    PluginResult::Continue => continue,
                    PluginResult::ShortCircuit(response) => {
                        // Plugin returned a response directly (e.g., 401, 429)
                        ctx.response = Some(response);
                        return AccessResult::ShortCircuited;
                    }
                    PluginResult::Error(err) => {
                        return AccessResult::Error(err);
                    }
                }
            }
        }
        AccessResult::Continue
    }
    
    fn execute_header_filter_phase(&self, ctx: &mut RequestContext) {
        if let Some(plugins) = self.phases.get(&Phase::HeaderFilter) {
            for plugin in plugins.iter().rev() {
                plugin.on_header_filter(ctx);
            }
        }
    }
    
    fn execute_body_filter_phase(&self, ctx: &mut RequestContext, chunk: &mut Vec<u8>, eof: bool) {
        if let Some(plugins) = self.phases.get(&Phase::BodyFilter) {
            for plugin in plugins.iter().rev() {
                plugin.on_body_filter(ctx, chunk, eof);
            }
        }
    }
    
    fn execute_log_phase(&self, ctx: &RequestContext) {
        // Log phase is fire-and-forget, never blocks response
        if let Some(plugins) = self.phases.get(&Phase::Log) {
            for plugin in plugins {
                plugin.on_log(ctx);
            }
        }
    }
}
```

### 5. Authentication Engine

#### Multi-Strategy Authentication
```rust
struct AuthEngine {
    providers: HashMap<String, Box<dyn AuthProvider>>,
    credential_cache: LruCache<CredentialHash, CachedAuthResult>,
    cache_ttl: Duration,
}

impl AuthEngine {
    fn authenticate(&mut self, request: &Request, auth_config: &AuthConfig) -> AuthResult {
        // Determine which auth strategies are configured for this route
        let strategies = &auth_config.strategies;
        
        match auth_config.mode {
            AuthMode::Any => self.authenticate_any(request, strategies),
            AuthMode::All => self.authenticate_all(request, strategies),
            AuthMode::FirstMatch => self.authenticate_first_match(request, strategies),
        }
    }
    
    fn authenticate_any(&mut self, request: &Request, strategies: &[AuthStrategy]) -> AuthResult {
        // Try each strategy, succeed on first success
        let mut last_error = None;
        
        for strategy in strategies {
            match self.try_strategy(request, strategy) {
                Ok(identity) => return Ok(identity),
                Err(e) => last_error = Some(e),
            }
        }
        
        Err(last_error.unwrap_or(AuthError::NoCredentials))
    }
    
    fn try_strategy(&mut self, request: &Request, strategy: &AuthStrategy) -> Result<Identity, AuthError> {
        let provider = self.providers.get(&strategy.provider_name)
            .ok_or(AuthError::ProviderNotFound)?;
        
        // Extract credentials from request
        let credentials = provider.extract_credentials(request)
            .ok_or(AuthError::NoCredentials)?;
        
        // Check cache
        let cache_key = credentials.cache_key();
        if let Some(cached) = self.credential_cache.get(&cache_key) {
            if cached.is_valid() {
                return cached.result.clone();
            }
        }
        
        // Validate credentials
        let result = provider.validate_credentials(&credentials);
        
        // Cache result
        self.credential_cache.put(cache_key, CachedAuthResult {
            result: result.clone(),
            cached_at: Instant::now(),
            ttl: self.cache_ttl,
        });
        
        result
    }
}

// JWT Provider Implementation
struct JwtAuthProvider {
    config: JwtConfig,
    key_store: JwksKeyStore,
}

impl AuthProvider for JwtAuthProvider {
    fn extract_credentials(&self, request: &Request) -> Option<Credentials> {
        // Try Authorization: Bearer <token>
        if let Some(auth_header) = request.header("Authorization") {
            if let Some(token) = auth_header.strip_prefix("Bearer ") {
                return Some(Credentials::Jwt(token.to_string()));
            }
        }
        
        // Try query parameter
        if let Some(token) = request.query_param(&self.config.query_param_name) {
            return Some(Credentials::Jwt(token.to_string()));
        }
        
        // Try cookie
        if let Some(token) = request.cookie(&self.config.cookie_name) {
            return Some(Credentials::Jwt(token.to_string()));
        }
        
        None
    }
    
    fn validate_credentials(&self, creds: &Credentials) -> Result<Identity, AuthError> {
        let token = match creds {
            Credentials::Jwt(t) => t,
            _ => return Err(AuthError::InvalidCredentialType),
        };
        
        // 1. Decode header (without verification) to get kid
        let header = decode_jwt_header(token)?;
        
        // 2. Look up signing key
        let key = self.key_store.get_key(&header.kid)
            .ok_or(AuthError::UnknownSigningKey)?;
        
        // 3. Verify signature
        verify_jwt_signature(token, &key, &header.alg)?;
        
        // 4. Decode and validate claims
        let claims = decode_jwt_claims(token)?;
        
        // 5. Check expiration
        if let Some(exp) = claims.get("exp") {
            if exp.as_u64().unwrap_or(0) < current_unix_timestamp() {
                return Err(AuthError::TokenExpired);
            }
        }
        
        // 6. Check not-before
        if let Some(nbf) = claims.get("nbf") {
            if nbf.as_u64().unwrap_or(0) > current_unix_timestamp() {
                return Err(AuthError::TokenNotYetValid);
            }
        }
        
        // 7. Check issuer
        if let Some(expected_iss) = &self.config.issuer {
            if claims.get("iss").and_then(|v| v.as_str()) != Some(expected_iss) {
                return Err(AuthError::InvalidIssuer);
            }
        }
        
        // 8. Check audience
        if let Some(expected_aud) = &self.config.audience {
            let aud = claims.get("aud");
            if !audience_matches(aud, expected_aud) {
                return Err(AuthError::InvalidAudience);
            }
        }
        
        // 9. Map to consumer
        let consumer_key = claims.get(&self.config.consumer_claim)
            .and_then(|v| v.as_str())
            .ok_or(AuthError::MissingConsumerClaim)?;
        
        Ok(Identity {
            consumer_key: consumer_key.to_string(),
            claims,
            credential_type: "jwt".to_string(),
        })
    }
}
```

#### JWKS Key Store with Auto-Refresh
```rust
struct JwksKeyStore {
    keys: Arc<RwLock<HashMap<String, JwkKey>>>,
    jwks_uri: String,
    refresh_interval: Duration,
    last_refresh: AtomicU64,
    http_client: HttpClient,
}

impl JwksKeyStore {
    async fn refresh_keys(&self) -> Result<(), JwksError> {
        let response = self.http_client.get(&self.jwks_uri)
            .timeout(Duration::from_secs(10))
            .send().await?;
        
        let jwks: JwksResponse = response.json().await?;
        
        let mut new_keys = HashMap::new();
        for key in jwks.keys {
            if let Some(kid) = &key.kid {
                let parsed = parse_jwk(&key)?;
                new_keys.insert(kid.clone(), parsed);
            }
        }
        
        // Atomic swap
        let mut keys = self.keys.write().unwrap();
        *keys = new_keys;
        self.last_refresh.store(unix_timestamp_now(), Ordering::Release);
        
        Ok(())
    }
    
    fn get_key(&self, kid: &str) -> Option<JwkKey> {
        let keys = self.keys.read().unwrap();
        keys.get(kid).cloned()
    }
}
```

### 6. Rate Limiter Architecture

#### Multi-Algorithm Rate Limiter
```rust
struct RateLimiter {
    algorithm: RateLimitAlgorithm,
    local_store: DashMap<RateLimitKey, WindowState>,
    distributed_store: Option<Arc<dyn RateLimiterBackend>>,
    sync_interval: Duration,
}

#[derive(Debug, Clone)]
enum RateLimitAlgorithm {
    FixedWindow,
    SlidingWindowLog,
    SlidingWindowCounter,
    TokenBucket { refill_rate: f64, bucket_size: u64 },
    LeakyBucket { drain_rate: f64, bucket_size: u64 },
}

#[derive(Debug)]
struct RateLimitKey {
    identifier: String,   // IP, consumer ID, API key
    route_id: Option<RouteId>,
    window: Duration,
}

impl RateLimiter {
    fn check_rate_limit(&self, key: &RateLimitKey, limit: u64) -> RateLimitResult {
        match self.algorithm {
            RateLimitAlgorithm::FixedWindow => self.check_fixed_window(key, limit),
            RateLimitAlgorithm::SlidingWindowCounter => self.check_sliding_window(key, limit),
            RateLimitAlgorithm::TokenBucket { refill_rate, bucket_size } => {
                self.check_token_bucket(key, limit, refill_rate, bucket_size)
            },
            RateLimitAlgorithm::LeakyBucket { drain_rate, bucket_size } => {
                self.check_leaky_bucket(key, limit, drain_rate, bucket_size)
            },
            _ => self.check_fixed_window(key, limit),
        }
    }
    
    fn check_fixed_window(&self, key: &RateLimitKey, limit: u64) -> RateLimitResult {
        let now = unix_timestamp_now();
        let window_start = now - (now % key.window.as_secs());
        let window_key = format!("{}:{}", key.identifier, window_start);
        
        let mut entry = self.local_store.entry(window_key.clone())
            .or_insert(WindowState {
                count: AtomicU64::new(0),
                window_start,
                window_duration: key.window,
            });
        
        let current = entry.count.fetch_add(1, Ordering::Relaxed) + 1;
        
        if current > limit {
            entry.count.fetch_sub(1, Ordering::Relaxed); // Rollback
            RateLimitResult::Exceeded {
                limit,
                remaining: 0,
                reset: window_start + key.window.as_secs(),
                retry_after: Duration::from_secs(
                    (window_start + key.window.as_secs()) - now
                ),
            }
        } else {
            RateLimitResult::Allowed {
                limit,
                remaining: limit - current,
                reset: window_start + key.window.as_secs(),
            }
        }
    }
    
    fn check_token_bucket(&self, key: &RateLimitKey, limit: u64, 
                         refill_rate: f64, bucket_size: u64) -> RateLimitResult {
        let now_ns = Instant::now();
        
        let mut entry = self.local_store.entry(key.identifier.clone())
            .or_insert(TokenBucketState {
                tokens: AtomicU64::new(bucket_size),
                last_refill: AtomicU64::new(now_ns.as_nanos() as u64),
            });
        
        // Refill tokens based on elapsed time
        let last_refill = entry.last_refill.load(Ordering::Acquire);
        let elapsed_ns = now_ns.as_nanos() as u64 - last_refill;
        let elapsed_secs = elapsed_ns as f64 / 1_000_000_000.0;
        let new_tokens = (elapsed_secs * refill_rate) as u64;
        
        if new_tokens > 0 {
            let current = entry.tokens.load(Ordering::Acquire);
            let refilled = (current + new_tokens).min(bucket_size);
            entry.tokens.store(refilled, Ordering::Release);
            entry.last_refill.store(now_ns.as_nanos() as u64, Ordering::Release);
        }
        
        // Try to consume a token
        let current = entry.tokens.load(Ordering::Acquire);
        if current > 0 {
            entry.tokens.fetch_sub(1, Ordering::Release);
            RateLimitResult::Allowed {
                limit: bucket_size,
                remaining: current - 1,
                reset: 0,
            }
        } else {
            let retry_after_secs = 1.0 / refill_rate;
            RateLimitResult::Exceeded {
                limit: bucket_size,
                remaining: 0,
                reset: 0,
                retry_after: Duration::from_secs_f64(retry_after_secs),
            }
        }
    }
}

struct RateLimitResult {
    // Applied to response headers
}

impl RateLimitResult {
    fn to_headers(&self) -> Vec<(String, String)> {
        match self {
            RateLimitResult::Allowed { limit, remaining, reset } => vec![
                ("X-RateLimit-Limit".into(), limit.to_string()),
                ("X-RateLimit-Remaining".into(), remaining.to_string()),
                ("X-RateLimit-Reset".into(), reset.to_string()),
            ],
            RateLimitResult::Exceeded { limit, remaining, reset, retry_after } => vec![
                ("X-RateLimit-Limit".into(), limit.to_string()),
                ("X-RateLimit-Remaining".into(), "0".into()),
                ("X-RateLimit-Reset".into(), reset.to_string()),
                ("Retry-After".into(), retry_after.as_secs().to_string()),
            ],
        }
    }
}
```

### 7. Upstream Manager and Load Balancing

#### Upstream Pool Management
```rust
struct UpstreamManager {
    upstreams: HashMap<String, Upstream>,
    health_checker: HealthCheckManager,
    connection_pools: HashMap<UpstreamTargetId, ConnectionPool>,
}

struct Upstream {
    name: String,
    algorithm: LoadBalancingAlgorithm,
    targets: Vec<UpstreamTarget>,
    hash_ring: Option<ConsistentHashRing>,
    healthcheck_config: HealthCheckConfig,
    circuit_breaker: CircuitBreaker,
    retry_policy: RetryPolicy,
}

struct UpstreamTarget {
    id: UpstreamTargetId,
    address: SocketAddr,
    weight: u32,
    health: AtomicU8,           // HealthStatus enum as u8
    active_requests: AtomicU32,
    total_requests: AtomicU64,
    total_failures: AtomicU64,
    latency_ewma_us: AtomicU64, // Exponential weighted moving average in microseconds
}

impl Upstream {
    fn select_target(&self, ctx: &RequestContext) -> Option<&UpstreamTarget> {
        let healthy_targets: Vec<_> = self.targets.iter()
            .filter(|t| t.is_healthy() && !self.circuit_breaker.is_tripped_for(t.id))
            .collect();
        
        if healthy_targets.is_empty() {
            return None;
        }
        
        match &self.algorithm {
            LoadBalancingAlgorithm::RoundRobin => {
                self.round_robin_select(&healthy_targets)
            }
            LoadBalancingAlgorithm::ConsistentHashing { hash_on } => {
                let key = self.compute_hash_key(ctx, hash_on);
                self.hash_ring.as_ref()
                    .and_then(|ring| ring.get(&key))
                    .and_then(|id| healthy_targets.iter().find(|t| t.id == *id))
                    .copied()
                    .or_else(|| self.round_robin_select(&healthy_targets))
            }
            LoadBalancingAlgorithm::LeastConnections => {
                healthy_targets.iter()
                    .min_by_key(|t| t.active_requests.load(Ordering::Acquire))
                    .copied()
            }
            LoadBalancingAlgorithm::LatencyWeighted => {
                healthy_targets.iter()
                    .min_by_key(|t| {
                        let latency = t.latency_ewma_us.load(Ordering::Acquire);
                        let conns = t.active_requests.load(Ordering::Acquire) as u64;
                        latency * (conns + 1) / t.weight as u64
                    })
                    .copied()
            }
        }
    }
    
    fn record_response(&self, target_id: UpstreamTargetId, latency: Duration, success: bool) {
        if let Some(target) = self.targets.iter().find(|t| t.id == target_id) {
            target.active_requests.fetch_sub(1, Ordering::Release);
            target.total_requests.fetch_add(1, Ordering::Relaxed);
            
            // Update EWMA latency (alpha = 0.2)
            let latency_us = latency.as_micros() as u64;
            let old = target.latency_ewma_us.load(Ordering::Acquire);
            let new_ewma = if old == 0 { latency_us } 
                           else { (old * 80 + latency_us * 20) / 100 };
            target.latency_ewma_us.store(new_ewma, Ordering::Release);
            
            if !success {
                target.total_failures.fetch_add(1, Ordering::Relaxed);
                self.circuit_breaker.record_failure(target_id);
            } else {
                self.circuit_breaker.record_success(target_id);
            }
        }
    }
}
```

#### Retry Policy with Backoff
```rust
struct RetryPolicy {
    max_retries: u32,
    retry_on_status: Vec<u16>,       // e.g., [502, 503, 504]
    retry_on_connect_failure: bool,
    retry_on_timeout: bool,
    backoff: BackoffStrategy,
}

enum BackoffStrategy {
    None,
    Fixed(Duration),
    Exponential { base: Duration, max: Duration },
    ExponentialWithJitter { base: Duration, max: Duration },
}

impl RetryPolicy {
    fn should_retry(&self, attempt: u32, status: Option<u16>, error: Option<&UpstreamError>) -> bool {
        if attempt >= self.max_retries {
            return false;
        }
        
        // Check status code
        if let Some(status) = status {
            if self.retry_on_status.contains(&status) {
                return true;
            }
        }
        
        // Check error type
        if let Some(error) = error {
            match error {
                UpstreamError::ConnectFailed if self.retry_on_connect_failure => true,
                UpstreamError::Timeout if self.retry_on_timeout => true,
                UpstreamError::ConnectionReset => true,
                _ => false,
            }
        } else {
            false
        }
    }
    
    fn delay_for_attempt(&self, attempt: u32) -> Duration {
        match &self.backoff {
            BackoffStrategy::None => Duration::ZERO,
            BackoffStrategy::Fixed(d) => *d,
            BackoffStrategy::Exponential { base, max } => {
                let delay = *base * 2u32.pow(attempt);
                delay.min(*max)
            }
            BackoffStrategy::ExponentialWithJitter { base, max } => {
                let delay = *base * 2u32.pow(attempt);
                let delay = delay.min(*max);
                let jitter = rand::thread_rng().gen_range(Duration::ZERO..delay);
                delay / 2 + jitter / 2
            }
        }
    }
}
```

### 8. Service Discovery Integration

#### Service Discovery Adapter
```rust
trait ServiceDiscoveryAdapter: Send + Sync {
    fn name(&self) -> &str;
    fn resolve(&self, service_name: &str) -> Result<Vec<DiscoveredTarget>, DiscoveryError>;
    fn watch(&self, service_name: &str) -> Box<dyn Stream<Item = Vec<DiscoveredTarget>>>;
    fn health_check(&self) -> bool;
}

struct DiscoveredTarget {
    address: SocketAddr,
    weight: u32,
    metadata: HashMap<String, String>,
    tags: Vec<String>,
    health: TargetHealth,
}

// Consul implementation
struct ConsulDiscovery {
    client: ConsulClient,
    datacenter: String,
    cache_ttl: Duration,
    cached_services: DashMap<String, (Vec<DiscoveredTarget>, Instant)>,
}

impl ServiceDiscoveryAdapter for ConsulDiscovery {
    fn resolve(&self, service_name: &str) -> Result<Vec<DiscoveredTarget>, DiscoveryError> {
        // Check cache
        if let Some(cached) = self.cached_services.get(service_name) {
            if cached.1.elapsed() < self.cache_ttl {
                return Ok(cached.0.clone());
            }
        }
        
        // Query Consul
        let services = self.client.health_service(service_name, &self.datacenter, true)?;
        
        let targets: Vec<DiscoveredTarget> = services.iter().map(|s| {
            DiscoveredTarget {
                address: SocketAddr::new(s.service.address.parse().unwrap(), s.service.port),
                weight: s.service.meta.get("weight")
                    .and_then(|w| w.parse().ok()).unwrap_or(100),
                metadata: s.service.meta.clone(),
                tags: s.service.tags.clone(),
                health: if s.checks.iter().all(|c| c.status == "passing") {
                    TargetHealth::Healthy
                } else {
                    TargetHealth::Unhealthy
                },
            }
        }).collect();
        
        // Update cache
        self.cached_services.insert(service_name.to_string(), (targets.clone(), Instant::now()));
        
        Ok(targets)
    }
    
    fn watch(&self, service_name: &str) -> Box<dyn Stream<Item = Vec<DiscoveredTarget>>> {
        let client = self.client.clone();
        let dc = self.datacenter.clone();
        let name = service_name.to_string();
        
        Box::new(async_stream::stream! {
            let mut index = 0u64;
            loop {
                match client.health_service_blocking(&name, &dc, true, index).await {
                    Ok((new_index, services)) => {
                        index = new_index;
                        let targets = services.into_iter().map(|s| /* ... */).collect();
                        yield targets;
                    }
                    Err(e) => {
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                }
            }
        })
    }
}

// Kubernetes implementation
struct KubernetesDiscovery {
    client: KubeClient,
    namespace: String,
    label_selectors: HashMap<String, String>,
}

impl ServiceDiscoveryAdapter for KubernetesDiscovery {
    fn resolve(&self, service_name: &str) -> Result<Vec<DiscoveredTarget>, DiscoveryError> {
        let endpoints = self.client.get_endpoints(&self.namespace, service_name)?;
        
        let mut targets = Vec::new();
        for subset in &endpoints.subsets {
            for address in &subset.addresses {
                for port in &subset.ports {
                    targets.push(DiscoveredTarget {
                        address: SocketAddr::new(
                            address.ip.parse().unwrap(),
                            port.port as u16,
                        ),
                        weight: 100,
                        metadata: address.target_ref.as_ref()
                            .map(|t| {
                                let mut m = HashMap::new();
                                m.insert("pod_name".into(), t.name.clone());
                                m
                            })
                            .unwrap_or_default(),
                        tags: vec![],
                        health: if subset.not_ready_addresses.is_empty() {
                            TargetHealth::Healthy
                        } else {
                            TargetHealth::Unhealthy
                        },
                    });
                }
            }
        }
        
        Ok(targets)
    }
    
    fn watch(&self, service_name: &str) -> Box<dyn Stream<Item = Vec<DiscoveredTarget>>> {
        // Use Kubernetes watch API for real-time endpoint updates
        let client = self.client.clone();
        let ns = self.namespace.clone();
        let name = service_name.to_string();
        
        Box::new(async_stream::stream! {
            let watcher = client.watch_endpoints(&ns, &name).await;
            while let Some(event) = watcher.next().await {
                match event {
                    WatchEvent::Added(ep) | WatchEvent::Modified(ep) => {
                        let targets = endpoints_to_targets(&ep);
                        yield targets;
                    }
                    WatchEvent::Deleted(_) => {
                        yield vec![];
                    }
                    _ => {}
                }
            }
        })
    }
}

// DNS SRV implementation
struct DnsDiscovery {
    resolver: TrustDnsResolver,
    cache_ttl: Duration,
}

impl ServiceDiscoveryAdapter for DnsDiscovery {
    fn resolve(&self, service_name: &str) -> Result<Vec<DiscoveredTarget>, DiscoveryError> {
        // Try SRV records first
        let srv_name = format!("_http._tcp.{}", service_name);
        if let Ok(records) = self.resolver.srv_lookup(&srv_name) {
            return Ok(records.iter().map(|r| {
                DiscoveredTarget {
                    address: SocketAddr::new(
                        self.resolver.lookup_ip(r.target().to_string()).unwrap()
                            .iter().next().unwrap(),
                        r.port(),
                    ),
                    weight: r.weight() as u32,
                    metadata: HashMap::new(),
                    tags: vec![],
                    health: TargetHealth::Unknown,
                }
            }).collect());
        }
        
        // Fallback to A records
        let ips = self.resolver.lookup_ip(service_name)?;
        Ok(ips.iter().map(|ip| {
            DiscoveredTarget {
                address: SocketAddr::new(ip, 80),
                weight: 100,
                metadata: HashMap::new(),
                tags: vec![],
                health: TargetHealth::Unknown,
            }
        }).collect())
    }
}
```

### 9. Configuration Hot-Reload

#### Configuration Manager
```rust
struct ConfigManager {
    current_config: Arc<ArcSwap<GatewayConfig>>,
    config_source: ConfigSource,
    validator: ConfigValidator,
    watchers: Vec<Box<dyn ConfigWatcher>>,
    reload_history: VecDeque<ReloadRecord>,
}

enum ConfigSource {
    Declarative { path: PathBuf },
    Database { pool: DbPool, poll_interval: Duration },
    AdminApi { /* managed via API calls */ },
    Kubernetes { client: KubeClient, namespace: String },
}

struct ReloadRecord {
    timestamp: Instant,
    source: String,
    success: bool,
    changes: Vec<ConfigChange>,
    duration: Duration,
    error: Option<String>,
}

impl ConfigManager {
    fn reload(&mut self) -> Result<ReloadReport, ReloadError> {
        let start = Instant::now();
        
        // 1. Load new configuration
        let new_config = self.config_source.load()?;
        
        // 2. Validate
        self.validator.validate(&new_config)?;
        
        // 3. Compute diff
        let current = self.current_config.load();
        let changes = compute_config_diff(&current, &new_config);
        
        if changes.is_empty() {
            return Ok(ReloadReport::NoChanges);
        }
        
        // 4. Build new route table
        let new_route_table = RouteTable::build_from_config(&new_config)?;
        
        // 5. Initialize new plugin instances
        let new_plugins = self.build_plugin_instances(&new_config)?;
        
        // 6. Update upstream targets (graceful — drain old, add new)
        self.update_upstreams(&current, &new_config)?;
        
        // 7. Atomic swap of configuration
        let new_config = Arc::new(new_config);
        self.current_config.store(new_config.clone());
        
        // 8. Notify all watchers
        for watcher in &self.watchers {
            watcher.on_config_change(&changes);
        }
        
        // 9. Record reload
        let record = ReloadRecord {
            timestamp: Instant::now(),
            source: self.config_source.name().to_string(),
            success: true,
            changes: changes.clone(),
            duration: start.elapsed(),
            error: None,
        };
        self.reload_history.push_back(record);
        
        Ok(ReloadReport::Applied {
            changes,
            duration: start.elapsed(),
        })
    }
}

#[derive(Debug, Clone)]
enum ConfigChange {
    RouteAdded(RouteId),
    RouteModified(RouteId),
    RouteDeleted(RouteId),
    ServiceAdded(ServiceId),
    ServiceModified(ServiceId),
    ServiceDeleted(ServiceId),
    ConsumerAdded(ConsumerId),
    ConsumerModified(ConsumerId),
    ConsumerDeleted(ConsumerId),
    PluginAdded(PluginId),
    PluginModified(PluginId),
    PluginDeleted(PluginId),
    UpstreamTargetAdded(UpstreamId, TargetId),
    UpstreamTargetRemoved(UpstreamId, TargetId),
    CertificateUpdated(String),
    GlobalSettingChanged(String),
}
```

### 10. Multi-Tenancy Architecture

#### Workspace Isolation
```rust
struct MultiTenancyManager {
    workspaces: HashMap<WorkspaceId, Workspace>,
    default_workspace: WorkspaceId,
    isolation_mode: IsolationMode,
}

struct Workspace {
    id: WorkspaceId,
    name: String,
    config: WorkspaceConfig,
    
    // Isolated entities
    routes: Vec<Route>,
    services: Vec<Service>,
    consumers: Vec<Consumer>,
    plugins: Vec<PluginInstance>,
    upstreams: Vec<Upstream>,
    certificates: Vec<Certificate>,
    
    // Resource quotas
    quotas: WorkspaceQuotas,
    usage: WorkspaceUsage,
}

struct WorkspaceQuotas {
    max_routes: u32,
    max_services: u32,
    max_consumers: u32,
    max_rate_limit_rps: u64,
    max_request_body_size: usize,
    max_response_cache_mb: usize,
}

enum IsolationMode {
    Soft,    // Shared infrastructure, logical separation
    Hard,    // Separate processes / containers per workspace
}

impl MultiTenancyManager {
    fn resolve_workspace(&self, request: &Request) -> &Workspace {
        // Resolve by host header, path prefix, or header
        if let Some(ws_header) = request.header("X-Workspace") {
            if let Some(ws) = self.workspaces.get(&WorkspaceId::from(ws_header)) {
                return ws;
            }
        }
        
        // Resolve by host
        if let Some(host) = request.host() {
            for ws in self.workspaces.values() {
                if ws.config.hosts.iter().any(|h| host_matches(host, h)) {
                    return ws;
                }
            }
        }
        
        &self.workspaces[&self.default_workspace]
    }
    
    fn enforce_quotas(&self, workspace: &Workspace, operation: &str) -> Result<(), QuotaError> {
        match operation {
            "add_route" if workspace.routes.len() >= workspace.quotas.max_routes as usize => {
                Err(QuotaError::MaxRoutesExceeded)
            }
            "add_consumer" if workspace.consumers.len() >= workspace.quotas.max_consumers as usize => {
                Err(QuotaError::MaxConsumersExceeded)
            }
            _ => Ok(()),
        }
    }
}
```

### 11. Response Caching Architecture

#### Cache Engine
```rust
struct ResponseCacheEngine {
    local_cache: LruCache<CacheKey, CachedResponse>,
    distributed_cache: Option<Arc<dyn CacheBackend>>,
    max_memory: usize,
    current_memory: AtomicUsize,
    stats: CacheStats,
}

struct CacheKey {
    method: String,
    path: String,
    query: String,
    vary_values: Vec<(String, String)>,  // From Vary header
    consumer_id: Option<String>,
}

struct CachedResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
    created_at: Instant,
    ttl: Duration,
    etag: Option<String>,
    last_modified: Option<String>,
    vary_headers: Vec<String>,
    body_size: usize,
}

impl ResponseCacheEngine {
    fn lookup(&mut self, request: &Request, route_cache_config: &CacheConfig) -> CacheLookupResult {
        // Only cache safe methods
        if !request.method().is_safe() && !route_cache_config.cache_methods.contains(&request.method()) {
            return CacheLookupResult::Bypass("non-cacheable method");
        }
        
        // Check Cache-Control: no-cache
        if request.header("Cache-Control").map(|v| v.contains("no-cache")).unwrap_or(false) {
            return CacheLookupResult::Bypass("client no-cache");
        }
        
        let key = self.build_cache_key(request, route_cache_config);
        
        // Check local cache
        if let Some(cached) = self.local_cache.get(&key) {
            if !cached.is_expired() {
                self.stats.hits.fetch_add(1, Ordering::Relaxed);
                
                // Check conditional request (If-None-Match)
                if let Some(etag) = &cached.etag {
                    if request.header("If-None-Match") == Some(etag) {
                        return CacheLookupResult::NotModified;
                    }
                }
                
                return CacheLookupResult::Hit(cached.clone());
            }
            // Expired but usable for stale-while-revalidate
            if route_cache_config.stale_while_revalidate > Duration::ZERO {
                return CacheLookupResult::Stale(cached.clone());
            }
        }
        
        self.stats.misses.fetch_add(1, Ordering::Relaxed);
        CacheLookupResult::Miss
    }
    
    fn store(&mut self, key: CacheKey, response: &Response, config: &CacheConfig) {
        // Check if response is cacheable
        let status = response.status();
        if !config.cacheable_statuses.contains(&status) {
            return;
        }
        
        // Check Cache-Control: no-store from upstream
        if response.header("Cache-Control").map(|v| v.contains("no-store")).unwrap_or(false) {
            return;
        }
        
        // Determine TTL
        let ttl = self.determine_ttl(response, config);
        
        let body = response.body().to_vec();
        let body_size = body.len();
        
        // Check memory limit
        if self.current_memory.load(Ordering::Acquire) + body_size > self.max_memory {
            self.evict_entries(body_size);
        }
        
        let cached = CachedResponse {
            status,
            headers: response.headers().to_vec(),
            body,
            created_at: Instant::now(),
            ttl,
            etag: response.header("ETag").map(|s| s.to_string()),
            last_modified: response.header("Last-Modified").map(|s| s.to_string()),
            vary_headers: response.header("Vary")
                .map(|v| v.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_default(),
            body_size,
        };
        
        self.current_memory.fetch_add(body_size, Ordering::Release);
        self.local_cache.put(key, cached);
    }
}
```

### 12. Observability Architecture

#### Metrics Engine
```rust
struct MetricsEngine {
    // Per-route metrics
    route_metrics: DashMap<RouteId, RouteMetrics>,
    
    // Global metrics
    total_requests: AtomicU64,
    total_errors: AtomicU64,
    active_connections: AtomicU64,
    
    // Latency histograms
    request_latency: Histogram,
    upstream_latency: Histogram,
    plugin_latency: DashMap<String, Histogram>,
    
    // Exporters
    exporters: Vec<Box<dyn MetricsExporter>>,
}

struct RouteMetrics {
    requests: AtomicU64,
    errors_4xx: AtomicU64,
    errors_5xx: AtomicU64,
    latency: Histogram,
    bandwidth_in: AtomicU64,
    bandwidth_out: AtomicU64,
    cache_hits: AtomicU64,
    cache_misses: AtomicU64,
    rate_limited: AtomicU64,
    auth_failures: AtomicU64,
}

impl MetricsEngine {
    fn record_request(&self, ctx: &RequestContext) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        
        // Route-level metrics
        if let Some(route) = &ctx.matched_route {
            let metrics = self.route_metrics
                .entry(route.id)
                .or_insert_with(RouteMetrics::default);
            
            metrics.requests.fetch_add(1, Ordering::Relaxed);
            
            if let Some(response) = &ctx.response {
                let status = response.status();
                if status >= 400 && status < 500 {
                    metrics.errors_4xx.fetch_add(1, Ordering::Relaxed);
                } else if status >= 500 {
                    metrics.errors_5xx.fetch_add(1, Ordering::Relaxed);
                    self.total_errors.fetch_add(1, Ordering::Relaxed);
                }
            }
            
            metrics.latency.record(ctx.timing.total_ms.unwrap_or(0.0));
        }
        
        // Global latency
        self.request_latency.record(ctx.timing.total_ms.unwrap_or(0.0));
        if let Some(upstream_ms) = ctx.timing.upstream_response_ms {
            self.upstream_latency.record(upstream_ms);
        }
    }
    
    fn export_prometheus(&self) -> String {
        let mut output = String::new();
        
        // Global counters
        output.push_str(&format!(
            "# HELP gateway_requests_total Total number of API requests\n\
             # TYPE gateway_requests_total counter\n\
             gateway_requests_total {}\n\n",
            self.total_requests.load(Ordering::Relaxed)
        ));
        
        output.push_str(&format!(
            "# HELP gateway_errors_total Total number of error responses\n\
             # TYPE gateway_errors_total counter\n\
             gateway_errors_total {}\n\n",
            self.total_errors.load(Ordering::Relaxed)
        ));
        
        output.push_str(&format!(
            "# HELP gateway_connections_active Current active connections\n\
             # TYPE gateway_connections_active gauge\n\
             gateway_connections_active {}\n\n",
            self.active_connections.load(Ordering::Relaxed)
        ));
        
        // Per-route metrics
        output.push_str(
            "# HELP gateway_route_requests_total Requests per route\n\
             # TYPE gateway_route_requests_total counter\n"
        );
        for entry in self.route_metrics.iter() {
            let route_id = entry.key();
            let metrics = entry.value();
            output.push_str(&format!(
                "gateway_route_requests_total{{route=\"{}\"}} {}\n",
                route_id, metrics.requests.load(Ordering::Relaxed)
            ));
        }
        
        // Latency histograms
        output.push_str(&self.request_latency.to_prometheus("gateway_request_duration_ms"));
        output.push_str(&self.upstream_latency.to_prometheus("gateway_upstream_duration_ms"));
        
        output
    }
}
```

#### Distributed Tracing Integration
```rust
struct TracingEngine {
    propagation_format: TracePropagationFormat,
    sampling_rate: f64,
    exporter: Box<dyn TraceExporter>,
}

enum TracePropagationFormat {
    W3CTraceContext,
    B3SingleHeader,
    B3MultiHeader,
    Jaeger,
}

impl TracingEngine {
    fn extract_context(&self, request: &Request) -> Option<TraceContext> {
        match self.propagation_format {
            TracePropagationFormat::W3CTraceContext => {
                let traceparent = request.header("traceparent")?;
                let tracestate = request.header("tracestate");
                TraceContext::from_w3c(traceparent, tracestate)
            }
            TracePropagationFormat::B3SingleHeader => {
                let b3 = request.header("b3")?;
                TraceContext::from_b3_single(b3)
            }
            TracePropagationFormat::B3MultiHeader => {
                let trace_id = request.header("X-B3-TraceId")?;
                let span_id = request.header("X-B3-SpanId")?;
                let sampled = request.header("X-B3-Sampled");
                let parent = request.header("X-B3-ParentSpanId");
                TraceContext::from_b3_multi(trace_id, span_id, sampled, parent)
            }
            TracePropagationFormat::Jaeger => {
                let header = request.header("uber-trace-id")?;
                TraceContext::from_jaeger(header)
            }
        }
    }
    
    fn inject_context(&self, trace_ctx: &TraceContext, request: &mut Request) {
        match self.propagation_format {
            TracePropagationFormat::W3CTraceContext => {
                request.set_header("traceparent", &trace_ctx.to_w3c_traceparent());
                if let Some(state) = &trace_ctx.tracestate {
                    request.set_header("tracestate", state);
                }
            }
            TracePropagationFormat::B3SingleHeader => {
                request.set_header("b3", &trace_ctx.to_b3_single());
            }
            _ => { /* ... */ }
        }
    }
    
    fn create_gateway_span(&self, ctx: &RequestContext, trace_ctx: &TraceContext) -> Span {
        Span {
            trace_id: trace_ctx.trace_id.clone(),
            span_id: generate_span_id(),
            parent_span_id: Some(trace_ctx.span_id.clone()),
            operation_name: format!("{} {}", ctx.request.method(), ctx.request.path()),
            start_time: ctx.received_at,
            duration: ctx.timing.total_ms.unwrap_or(0.0),
            tags: vec![
                ("http.method".into(), ctx.request.method().to_string()),
                ("http.url".into(), ctx.request.path().to_string()),
                ("http.status_code".into(), ctx.response.as_ref()
                    .map(|r| r.status().to_string()).unwrap_or_default()),
                ("gateway.route".into(), ctx.matched_route.as_ref()
                    .map(|r| r.name.clone()).unwrap_or_default()),
                ("gateway.consumer".into(), ctx.consumer.as_ref()
                    .map(|c| c.username.clone()).unwrap_or("anonymous".into())),
            ],
        }
    }
}
```

## Deployment Architecture Patterns

### 1. Centralized Gateway
```yaml
deployment:
  type: centralized
  description: "Single logical gateway cluster as API entry point"
  instances: 3
  
  load_balancer:
    type: external_lb  # NLB, HAProxy, or DNS round-robin in front
    health_check: /health
    
  configuration:
    mode: database  # PostgreSQL for config storage + cluster sync
    database: postgresql://gateway_db:5432/kong
    
  scaling:
    horizontal: true
    min_instances: 2
    max_instances: 20
    scale_on: cpu_usage > 70% || rps > 40000
```

### 2. Distributed / Edge Gateway
```yaml
deployment:
  type: distributed
  description: "Multiple gateway instances at edge locations"
  
  regions:
    - name: us-east
      instances: 3
      upstream_preference: us-east-backends
    - name: eu-west
      instances: 2
      upstream_preference: eu-west-backends
    - name: ap-southeast
      instances: 2
      upstream_preference: ap-southeast-backends
      
  configuration:
    mode: declarative  # Push config to all regions
    sync: eventual_consistency
    propagation_delay: < 5s
    
  dns:
    type: geo_routing  # Route clients to nearest gateway
    provider: cloudflare | route53
```

### 3. Kubernetes-Native Gateway
```yaml
deployment:
  type: kubernetes_ingress
  description: "Gateway as Kubernetes Ingress Controller"
  
  controller:
    replicas: 3
    resources:
      requests:
        cpu: 500m
        memory: 256Mi
      limits:
        cpu: 2000m
        memory: 1Gi
        
  configuration:
    mode: kubernetes_crds  # Custom Resource Definitions
    watch_namespaces: ["default", "api-services"]
    
  crds:
    - GatewayRoute
    - GatewayPlugin
    - GatewayConsumer
    - GatewayUpstream
```

## Security Architecture

### Multi-Layer Security Model
```rust
struct SecurityPipeline {
    // Layer 1: Network (before TLS)
    ip_filter: IpFilterEngine,
    connection_limiter: ConnectionLimiter,
    
    // Layer 2: Transport (TLS)
    tls_manager: TlsManager,
    mtls_validator: MtlsValidator,
    
    // Layer 3: Protocol (HTTP parsing)
    request_validator: RequestValidator,
    waf_engine: Option<WafEngine>,
    
    // Layer 4: Application (Gateway plugins)
    auth_engine: AuthEngine,
    rate_limiter: RateLimiter,
    acl_engine: AclEngine,
    
    // Layer 5: Data (transformation)
    schema_validator: SchemaValidator,
    data_masker: DataMasker,
}

impl SecurityPipeline {
    fn evaluate(&self, request: &Request, ctx: &mut RequestContext) -> SecurityDecision {
        // L1: Network
        if !self.ip_filter.is_allowed(&ctx.client_addr.ip()) {
            return SecurityDecision::Block(BlockReason::IpDenied);
        }
        
        if !self.connection_limiter.accept(&ctx.client_addr.ip()) {
            return SecurityDecision::Block(BlockReason::TooManyConnections);
        }
        
        // L2: Transport (TLS already handled by listener)
        if let Some(mtls_config) = ctx.route_requires_mtls() {
            if !self.mtls_validator.validate(&ctx.tls_info, mtls_config) {
                return SecurityDecision::Block(BlockReason::MtlsFailed);
            }
        }
        
        // L3: Protocol
        if let Err(e) = self.request_validator.validate(request) {
            return SecurityDecision::Block(BlockReason::MalformedRequest(e));
        }
        
        if let Some(waf) = &self.waf_engine {
            if let Some(violation) = waf.inspect(request) {
                return SecurityDecision::Block(BlockReason::WafViolation(violation));
            }
        }
        
        // L4 & L5 handled by plugin chain
        SecurityDecision::Continue
    }
}
```

This comprehensive architecture guide provides the foundation for implementing scalable, secure, and extensible API gateways that can handle production workloads with sophisticated plugin pipelines, multi-strategy authentication, distributed rate limiting, and dynamic service discovery.