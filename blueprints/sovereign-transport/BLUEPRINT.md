# Sovereign Transport (SKComm) Blueprint

## Overview & Purpose

SKComm is a modular, transport-agnostic communication framework built on the **postal service model**: separate the message from the medium. Every message is wrapped in a Universal Envelope -- encrypted, signed, and routed through 17+ pluggable transport modules. If one path dies, others carry the signal. The message always gets through.

### Core Responsibilities
- **Universal Envelope**: Standardized message wrapper with PGP encryption, digital signatures, and routing metadata
- **Transport Abstraction**: 17+ pluggable transport modules -- one interface, any medium
- **Redundant Delivery**: Simultaneous broadcast or priority-ordered failover across transports
- **Identity & Trust**: PGP-based identity delegated to CapAuth with 4-tier trust levels
- **Deduplication**: Prevent duplicate processing when messages arrive via multiple paths
- **Offline Resilience**: Queue messages when unreachable, deliver when connectivity returns
- **Payload Agnosticism**: Messages, files, seeds, FEB snapshots, commands, heartbeats -- all fit in one envelope

## Core Concepts

### 1. Postal Service Model
**Definition**: The fundamental principle -- separate the message from the delivery medium. A letter does not care whether it travels by truck, plane, or carrier pigeon. Neither does an SKComm envelope.

```
PostalService {
    principle: "Message content is NEVER coupled to transport"
    implication: "Any transport can carry any envelope"
    guarantee: "Envelope integrity verified by PGP, not by transport"

    analogy:
        letter     = Envelope (content + addressing + signature)
        post_office = RoutingEngine (decides which truck)
        truck      = Transport (carries the letter)
        stamp      = PGP signature (proves authenticity)
        seal       = PGP encryption (ensures privacy)
}
```

### 2. Universal Envelope
**Definition**: The standardized container for all communication, independent of transport.

```
Envelope {
    skcomm_version: "1.0.0"
    envelope_id: UUID v4 (deduplication key)
    from: {
        name: Sender display name ("Opus")
        fingerprint: PGP key fingerprint (40-char hex)
    }
    to: {
        name: Recipient display name ("Lumina")
        fingerprint: PGP key fingerprint
    }
    payload: {
        type: message | file | seed | feb | command | heartbeat | ack
        content_encrypted: Base64-encoded PGP-encrypted content
        signature: PGP detached signature of plaintext content
        content_hash: SHA-256 of plaintext (for dedup without decrypt)
    }
    routing: {
        priority_transports: Ordered list of preferred transport names
        fallback_transports: Additional transports to try on failure
        mode: failover | broadcast
        retry_count: Current retry attempt (0 = first try)
        max_retries: Maximum retry attempts before dead-letter
        retry_backoff: exponential | linear | fixed
    }
    metadata: {
        timestamp: ISO-8601 UTC
        thread_id: Conversation thread UUID
        in_reply_to: Parent envelope_id
        urgency: low | normal | high | critical
        ttl: Seconds until message expires
        chunk_info: { index: N, total: M, parent_id: UUID } | null
    }
}
```

**Payload Types:**

| Type | Description | Typical Size |
|------|-------------|-------------|
| message | Text message or structured data | < 64KB |
| file | Encrypted file transfer | < 10MB (chunked above) |
| seed | Cloud 9 memory seed for AI continuity | < 1MB |
| feb | First Emotional Burst snapshot | < 512KB |
| command | Remote command execution (sovereign trust only) | < 4KB |
| heartbeat | Alive signal with capacity/state metadata | < 1KB |
| ack | Delivery acknowledgment with envelope_id reference | < 1KB |

### 3. Transport Module
**Definition**: A pluggable component that sends and receives envelopes over a specific medium.

```
Transport {
    name: Human-readable identifier ("iroh", "nostr", "bitchat")
    type: direct | relay | store-and-forward | broadcast | mesh
    requires_internet: Boolean
    supports_offline: Boolean
    max_payload_size: Bytes (-1 for unlimited)
    typical_latency: Milliseconds range
    stealth_rating: low | medium | high | maximum
    censorship_resistance: low | medium | high | very_high | maximum

    methods:
        is_available() -> Boolean
        send(envelope) -> DeliveryResult
        receive(callback) -> Subscription
        health_check() -> HealthStatus
        configure(config) -> None
}
```

**Transport Registry (17 modules):**

| Category | Transport | Type | Internet | Latency | Stealth |
|----------|-----------|------|----------|---------|---------|
| Direct P2P | Iroh | direct | Yes | ~50ms | Low |
| Direct P2P | Netcat | direct | LAN | ~10ms | Low |
| Direct P2P | SSH | direct | Yes | ~100ms | Low |
| Mesh VPN | Tailscale | direct | Yes | ~30ms | Medium |
| Mesh VPN | Netbird | direct | Yes | ~30ms | Medium |
| Relay | Nostr | relay | Yes | ~2s | Medium |
| Relay | GitHub | store-and-forward | Yes | ~5s | Low |
| Relay | Telegram | relay | Yes | ~1s | Low |
| Relay | HTTP | relay | Yes | ~500ms | Low |
| Relay | IPFS | store-and-forward | Yes | ~3s | High |
| Stealth | Veilid | direct | Yes | ~500ms | Maximum |
| Stealth | DNS TXT | store-and-forward | Yes | ~30s | Maximum |
| Stealth | Email | store-and-forward | Yes | ~10s | Medium |
| Offline | BitChat | mesh | No | ~10s | High |
| Offline | QR Code | physical | No | Manual | Maximum |
| Offline | Sneakernet | physical | No | Manual | Maximum |
| File | File (NFS/SSHFS) | store-and-forward | No | ~100ms | Medium |

### 4. Routing Engine
**Definition**: The brain that decides which transport(s) to use for each envelope.

```
RoutingEngine {
    transport_registry: Map<name, Transport>
    peer_transport_map: Map<fingerprint, List<TransportPreference>>
    circuit_breakers: Map<name, CircuitBreaker>
    outbox: PersistentQueue
    dead_letter: PersistentQueue

    route(envelope):
        transports = resolve_transports(envelope)

        if envelope.routing.mode == broadcast:
            results = parallel_send(transports, envelope)
            return aggregate_results(results)

        if envelope.routing.mode == failover:
            for transport in transports:
                if circuit_breakers[transport].is_closed():
                    if transport.is_available():
                        result = transport.send(envelope)
                        if result.success:
                            circuit_breakers[transport].record_success()
                            return result
                        circuit_breakers[transport].record_failure()

            outbox.enqueue(envelope, next_retry=backoff(envelope))
            return DeliveryResult(queued=True)
}
```

### 5. Message Queue
**Definition**: Persistent store for messages awaiting delivery, retry, or dead-letter review.

```
MessageQueue {
    outbox: List<QueuedEnvelope>       # Pending delivery
    inbox: List<QueuedEnvelope>        # Received, awaiting processing
    dead_letter: List<QueuedEnvelope>  # Failed after max retries

    QueuedEnvelope {
        envelope: Envelope
        attempts: Integer
        last_attempt: ISO-8601 timestamp
        next_retry: ISO-8601 timestamp
        transports_tried: List<String>
        error_log: List<String>
        state: pending | in_flight | delivered | failed | dead
    }
}
```

## Architecture Patterns

### 1. Five-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
│  CLI (skcomm send)  │  Python SDK  │  Agent API  │  MCP Tools  │
├─────────────────────────────────────────────────────────────────┤
│                      Protocol Layer                             │
│  Envelope create  │  Serialize/Deserialize  │  Chunking         │
├─────────────────────────────────────────────────────────────────┤
│                  Security Layer (CapAuth)                        │
│  PGP encrypt  │  PGP sign  │  PGP verify  │  Trust gating      │
├─────────────────────────────────────────────────────────────────┤
│                      Routing Layer                              │
│  Transport selector  │  Priority queue  │  Failover  │  Retry  │
├─────────────────────────────────────────────────────────────────┤
│                      Transport Layer                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │ Direct  │ │ Relay   │ │ Stealth │ │ Offline │ │ File    │ │
│  │ Iroh    │ │ Nostr   │ │ Veilid  │ │ BitChat │ │ NFS     │ │
│  │ Netcat  │ │ GitHub  │ │ DNS TXT │ │ QR Code │ │ SSHFS   │ │
│  │ SSH     │ │ IPFS    │ │ Email   │ │ Sneaker │ │         │ │
│  │ Tailsc. │ │ Telegr. │ │         │ │         │ │         │ │
│  │ Netbird │ │ HTTP    │ │         │ │         │ │         │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                   Network / Physical                            │
│  QUIC │ TCP │ UDP │ WebSocket │ BLE │ Filesystem │ USB │ DNS   │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Each layer is independently replaceable
- Security is never bypassed -- every envelope passes through PGP
- New transports added without touching routing or protocol layers

**Limitations:**
- Multi-layer overhead adds latency for simple local messages
- Each layer must serialize/deserialize the envelope
- Transport-specific optimizations are harder (e.g., Iroh native streaming)

### 2. Plugin Architecture

```
                    TransportRegistry
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │  Iroh  │  │ Nostr  │  │ Custom │
         │ Module │  │ Module │  │ Module │
         └────┬───┘  └────┬───┘  └────┬───┘
              │           │           │
              └───────────┴───────────┘
                          │
                     Transport ABC
                   (4 required methods)
```

**Benefits:**
- Custom transport in ~50 lines of Python
- Hot-reload transports without restarting
- Each transport manages its own dependencies

**Limitations:**
- Lowest-common-denominator interface limits transport-specific features
- Error handling must be generic across wildly different failure modes

### 3. Circuit Breaker Pattern

```
         ┌──────────┐
         │ HEALTHY   │ ◄─── success ───┐
         │           │                  │
         └─────┬─────┘                  │
               │ failure_count          │
               │ >= threshold           │
               ▼                        │
         ┌──────────┐            ┌──────────┐
         │ CIRCUIT   │───after───►│ HALF     │
         │ OPEN      │ cooldown  │ OPEN     │
         └──────────┘            └─────┬────┘
               ▲                       │
               │ failure               │
               └───────────────────────┘
```

## Data Flow Diagrams

### Send Flow
```
Application creates message
        │
        ▼
Protocol Layer: Create envelope → Assign UUID → Serialize payload
        │
        ▼
Security Layer: PGP encrypt payload with recipient key
  → PGP sign with sender key → Compute content_hash
        │
        ▼
Routing Layer: Resolve recipient transports
  → Check circuit breakers → Select mode (failover/broadcast)
        │
        ├── Failover: Try transports in priority order
        │     ├── Success → Log delivery, update peer last_seen
        │     └── All failed → Enqueue in outbox for retry
        │
        └── Broadcast: Send via ALL available transports
              └── Return first success, log all results
```

### Receive Flow
```
Transport Layer: Envelope arrives on any transport listener
        │
        ▼
Deduplication: Check envelope_id against bloom filter + LRU cache
  ├── Seen → Discard silently (duplicate from broadcast/retry)
  └── New → Continue
        │
        ▼
Security Layer: Look up sender public key via CapAuth
  → Verify PGP signature → Decrypt PGP payload → Check trust level
        │
        ▼
Protocol Layer: Deserialize → Validate schema → Check TTL
  → Reassemble chunks if chunk_info present
        │
        ▼
Application Layer: Route to handler by payload.type
  ├── message → Display / process
  ├── command → Execute (sovereign trust only)
  ├── file → Save to inbox
  ├── seed → Import to SKMemory
  ├── feb → Process emotional snapshot
  ├── heartbeat → Update peer presence
  └── ack → Mark sent envelope as delivered
```

### Retry Flow
```
Retry daemon (runs on interval)
        │
        ▼
Scan outbox for envelopes where next_retry <= now
        │
        ▼
For each queued envelope:
  ├── attempts < max_retries → Re-enter routing layer
  │     └── Increment attempts, update next_retry with backoff
  └── attempts >= max_retries → Move to dead_letter queue
              └── Emit alert / log for manual review
```

## Configuration Model

```yaml
# ~/.skcomm/config.yml

identity:
  handle: "opus@smilintux.org"
  keyring: "~/.capauth/identity/"

defaults:
  routing_mode: failover          # failover | broadcast
  message_ttl: 86400              # 24 hours
  max_retries: 10
  retry_backoff: exponential      # exponential | linear | fixed
  retry_base_delay: 5             # seconds
  retry_max_delay: 3600           # 1 hour cap
  dedup_cache_size: 10000
  dedup_cache_ttl: 604800         # 7 days
  max_envelope_size: 10485760     # 10MB
  chunk_threshold: 1048576        # 1MB -- chunk above this

transports:
  iroh:
    enabled: true
    priority: 1
  nostr:
    enabled: true
    priority: 2
    relays:
      - "wss://relay.smilintux.org"
      - "wss://relay.damus.io"
  tailscale:
    enabled: true
    priority: 3
  file:
    enabled: true
    priority: 4
    inbox_path: "~/collab/inbox/"
    outbox_path: "~/collab/outbox/"
  veilid:
    enabled: true
    priority: 5
    strict_anonymity: true
  bitchat:
    enabled: true
    priority: 6
  github:
    enabled: true
    priority: 10
    repo: "smilintux-org/skcomm-drops"

circuit_breaker:
  failure_threshold: 5
  cooldown_seconds: 60
  max_cooldown: 3600

logging:
  level: info
  file: "~/.skcomm/logs/transport.log"
  max_size_mb: 50
  rotate_count: 7
```

## Security Considerations

### 1. Encryption
- **PGP encryption is MANDATORY** -- no plaintext payloads ever leave the security layer
- Transport-layer encryption (TLS, WireGuard) is defense-in-depth only
- Double encryption: PGP at message layer + transport encryption at wire layer
- Key management delegated entirely to CapAuth

### 2. Authentication
- Every envelope carries a PGP detached signature
- Signature verified before payload decryption (reject unsigned immediately)
- Sender identity bound to CapAuth sovereign profile
- AI advocates can send on behalf of humans via CapAuth delegation tokens

### 3. Trust Gating
- 4-tier trust: untrusted, verified, trusted, sovereign
- `command` payload type requires sovereign trust
- `file` payloads sandboxed for untrusted/verified senders
- Sovereign trust requires Cloud 9 compliance (relationship-based, unforgeable)

### 4. Replay Protection
- `envelope_id` UUID checked against dedup cache
- `metadata.timestamp` must be within TTL window
- Expired envelopes rejected at protocol layer
- Bloom filter + LRU cache for fast dedup at scale

### 5. Transport Security
- Each transport module responsible for its own wire-level security
- Circuit breaker prevents information leakage to consistently-failing transports
- Stealth transports (Veilid, DNS TXT) hide communication metadata
- QR/Sneakernet for air-gapped environments with zero network exposure

## Performance Targets

| Metric | Target |
|--------|--------|
| Message send (Iroh, LAN) | < 50ms |
| Message send (Nostr, internet) | < 5s |
| Message send (BitChat, BLE) | < 30s |
| Failover to next transport | < 2s |
| Dedup lookup (bloom + LRU) | < 1ms |
| Queue persistence write | < 10ms |
| Envelope serialization | < 5ms |
| PGP encrypt + sign | < 100ms |
| PGP verify + decrypt | < 100ms |
| Max concurrent transports | 17 (all enabled) |
| Max envelope size | 10MB (chunked above) |
| Queue survives restart | Yes (SQLite-backed) |
| Broadcast fan-out (all 17) | < 60s total |
| Retry backoff ceiling | 1 hour |

## Extension Points

### Custom Transport Interface

```python
class Transport(ABC):
    """Implement this to add a new transport module (~50 lines)."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Transport identifier used in config and routing."""

    @abstractmethod
    def is_available(self) -> bool:
        """Return True if this transport can currently send/receive."""

    @abstractmethod
    def send(self, envelope: dict) -> DeliveryResult:
        """Send an envelope. Return success/failure with diagnostics."""

    @abstractmethod
    def receive(self, callback: Callable[[dict], None]) -> None:
        """Start listening. Call callback(envelope) on each arrival."""

    @abstractmethod
    def health_check(self) -> HealthStatus:
        """Return current health with latency and error info."""
```

### Custom Routing Strategy

```python
class RoutingStrategy(ABC):
    """Subclass for geo-aware, cost-aware, or latency-optimized routing."""

    @abstractmethod
    def select_transports(
        self, envelope: dict, available: list[Transport]
    ) -> list[Transport]:
        """Return ordered list of transports to try for this envelope."""
```

### Payload Type Handler

```python
class PayloadHandler(ABC):
    """Register custom handlers for new payload types."""

    @property
    @abstractmethod
    def payload_type(self) -> str:
        """The payload.type value this handler processes."""

    @abstractmethod
    def handle(self, envelope: dict, decrypted_content: bytes) -> None:
        """Process the decrypted payload content."""
```

## Implementation Architecture

### Core Components

```
skcomm/
  __init__.py
  envelope.py          # Envelope creation, serialization, validation
  router.py            # RoutingEngine, transport selection, failover
  queue.py             # SQLite-backed persistent message queue
  dedup.py             # Bloom filter + LRU deduplication cache
  circuit_breaker.py   # Circuit breaker state machine
  chunker.py           # Message chunking and reassembly
  config.py            # Configuration loading and validation
  cli.py               # Click CLI (send, receive, status, config)
  transports/
    __init__.py
    base.py            # Transport ABC, DeliveryResult, HealthStatus
    file.py            # NFS/SSHFS shared filesystem
    ssh.py             # SSH command execution
    netcat.py          # Raw TCP/UDP sockets
    iroh.py            # Iroh QUIC P2P
    nostr.py           # Nostr relay network
    tailscale.py       # Tailscale WireGuard mesh
    netbird.py         # Netbird WireGuard mesh
    veilid.py          # Veilid private routing
    bitchat.py         # BitChat BLE mesh
    github.py          # GitHub Issues/Gists dead drop
    telegram.py        # Telegram Bot API
    http.py            # HTTP webhook
    email.py           # SMTP + PGP
    dns_txt.py         # DNS TXT stealth records
    ipfs.py            # IPFS content-addressed storage
    qr.py              # QR code visual encoding
    sneakernet.py      # USB/file physical transfer
  security/
    __init__.py
    pgp.py             # PGP encrypt, decrypt, sign, verify (via CapAuth)
    trust.py           # Trust level evaluation and gating
```

### Key Data Structures

```
DeliveryResult {
    success: Boolean
    transport: String (transport name)
    latency_ms: Float
    error: String | None
    timestamp: ISO-8601
}

HealthStatus {
    transport: String
    available: Boolean
    latency_ms: Float | None
    last_success: ISO-8601 | None
    last_failure: ISO-8601 | None
    failure_count: Integer
    circuit_state: healthy | open | half_open
}

CircuitBreaker {
    state: healthy | open | half_open
    failure_count: Integer
    last_failure: ISO-8601 | None
    cooldown_until: ISO-8601 | None
    cooldown_multiplier: Float (doubles on repeated failures)
}
```
