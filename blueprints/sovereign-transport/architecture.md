# Sovereign Transport (SKComm) Architecture

## System Layers

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

## Core Architecture: Envelope Lifecycle

### Envelope Creation and Validation

```python
import uuid
import hashlib
import json
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field


class PayloadType(str, Enum):
    MESSAGE = "message"
    FILE = "file"
    SEED = "seed"
    FEB = "feb"
    COMMAND = "command"
    HEARTBEAT = "heartbeat"
    ACK = "ack"


class Urgency(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class RoutingMode(str, Enum):
    FAILOVER = "failover"
    BROADCAST = "broadcast"


class Sender(BaseModel):
    name: str
    fingerprint: str


class Recipient(BaseModel):
    name: str
    fingerprint: str


class Payload(BaseModel):
    type: PayloadType
    content_encrypted: str  # Base64 PGP-encrypted
    signature: str          # PGP detached signature
    content_hash: str       # SHA-256 of plaintext


class Routing(BaseModel):
    priority_transports: list[str] = Field(default_factory=list)
    fallback_transports: list[str] = Field(default_factory=list)
    mode: RoutingMode = RoutingMode.FAILOVER
    retry_count: int = 0
    max_retries: int = 10
    retry_backoff: str = "exponential"


class ChunkInfo(BaseModel):
    index: int
    total: int
    parent_id: str


class Metadata(BaseModel):
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    thread_id: Optional[str] = None
    in_reply_to: Optional[str] = None
    urgency: Urgency = Urgency.NORMAL
    ttl: int = 86400  # 24 hours
    chunk_info: Optional[ChunkInfo] = None


class Envelope(BaseModel):
    """Universal Envelope -- the atomic unit of SKComm communication."""
    skcomm_version: str = "1.0.0"
    envelope_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sender: Sender
    recipient: Recipient
    payload: Payload
    routing: Routing = Field(default_factory=Routing)
    metadata: Metadata = Field(default_factory=Metadata)

    def is_expired(self) -> bool:
        created = datetime.fromisoformat(self.metadata.timestamp)
        return datetime.now(timezone.utc) > created + timedelta(
            seconds=self.metadata.ttl
        )

    def to_bytes(self) -> bytes:
        return self.model_dump_json().encode("utf-8")

    @classmethod
    def from_bytes(cls, data: bytes) -> "Envelope":
        return cls.model_validate_json(data)
```

### Security Layer: PGP Operations

```python
import subprocess
import base64
from pathlib import Path


class PGPSecurity:
    """PGP operations delegated to GnuPG via CapAuth keyring."""

    def __init__(self, keyring_path: str = "~/.capauth/identity/"):
        self.keyring = Path(keyring_path).expanduser()

    def encrypt(self, plaintext: bytes, recipient_fingerprint: str) -> str:
        """PGP encrypt content for recipient. Returns base64-encoded ciphertext."""
        result = subprocess.run(
            [
                "gpg", "--homedir", str(self.keyring),
                "--encrypt", "--armor",
                "--recipient", recipient_fingerprint,
                "--trust-model", "always",
            ],
            input=plaintext,
            capture_output=True,
        )
        if result.returncode != 0:
            raise SecurityError(f"PGP encrypt failed: {result.stderr.decode()}")
        return base64.b64encode(result.stdout).decode("ascii")

    def decrypt(self, ciphertext_b64: str) -> bytes:
        """Decrypt PGP-encrypted content. Returns plaintext bytes."""
        ciphertext = base64.b64decode(ciphertext_b64)
        result = subprocess.run(
            [
                "gpg", "--homedir", str(self.keyring),
                "--decrypt", "--armor",
            ],
            input=ciphertext,
            capture_output=True,
        )
        if result.returncode != 0:
            raise SecurityError(f"PGP decrypt failed: {result.stderr.decode()}")
        return result.stdout

    def sign(self, content: bytes, sender_fingerprint: str) -> str:
        """Create PGP detached signature. Returns armored signature."""
        result = subprocess.run(
            [
                "gpg", "--homedir", str(self.keyring),
                "--detach-sign", "--armor",
                "--local-user", sender_fingerprint,
            ],
            input=content,
            capture_output=True,
        )
        if result.returncode != 0:
            raise SecurityError(f"PGP sign failed: {result.stderr.decode()}")
        return base64.b64encode(result.stdout).decode("ascii")

    def verify(self, content: bytes, signature_b64: str,
               sender_fingerprint: str) -> bool:
        """Verify PGP detached signature. Returns True if valid."""
        signature = base64.b64decode(signature_b64)
        # Write signature to temp file for gpg --verify
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".sig") as sig_file:
            sig_file.write(signature)
            sig_file.flush()
            result = subprocess.run(
                [
                    "gpg", "--homedir", str(self.keyring),
                    "--verify", sig_file.name, "-",
                ],
                input=content,
                capture_output=True,
            )
        return result.returncode == 0

    def content_hash(self, content: bytes) -> str:
        """SHA-256 hash for deduplication without decryption."""
        return hashlib.sha256(content).hexdigest()


class SecurityError(Exception):
    pass
```

### Envelope Builder: Composing the Full Pipeline

```python
class EnvelopeBuilder:
    """High-level API for creating signed, encrypted envelopes."""

    def __init__(self, pgp: PGPSecurity, config: dict):
        self.pgp = pgp
        self.config = config

    def build(
        self,
        sender_name: str,
        sender_fingerprint: str,
        recipient_name: str,
        recipient_fingerprint: str,
        content: bytes,
        payload_type: PayloadType = PayloadType.MESSAGE,
        urgency: Urgency = Urgency.NORMAL,
        thread_id: str | None = None,
        in_reply_to: str | None = None,
    ) -> Envelope:
        """Create a complete, signed, encrypted envelope ready for routing."""

        # 1. Hash plaintext for dedup
        content_hash = self.pgp.content_hash(content)

        # 2. Sign plaintext with sender key
        signature = self.pgp.sign(content, sender_fingerprint)

        # 3. Encrypt plaintext for recipient
        encrypted = self.pgp.encrypt(content, recipient_fingerprint)

        # 4. Determine routing mode from urgency
        mode = RoutingMode.BROADCAST if urgency == Urgency.CRITICAL \
            else RoutingMode.FAILOVER

        # 5. Assemble envelope
        return Envelope(
            sender=Sender(name=sender_name, fingerprint=sender_fingerprint),
            recipient=Recipient(
                name=recipient_name, fingerprint=recipient_fingerprint
            ),
            payload=Payload(
                type=payload_type,
                content_encrypted=encrypted,
                signature=signature,
                content_hash=content_hash,
            ),
            routing=Routing(
                priority_transports=self.config.get("priority_transports", []),
                fallback_transports=self.config.get("fallback_transports", []),
                mode=mode,
                max_retries=self.config.get("max_retries", 10),
            ),
            metadata=Metadata(
                urgency=urgency,
                thread_id=thread_id,
                in_reply_to=in_reply_to,
                ttl=self.config.get("message_ttl", 86400),
            ),
        )
```

## Transport Selection Decision Tree

```
Is the message CRITICAL (must arrive)?
├── YES --> Use BROADCAST mode (send via ALL available transports)
└── NO --> Use FAILOVER mode:
         │
         Is direct P2P available?
         ├── YES --> Iroh (fastest, ~90% NAT success)
         │          └── Fail? --> Tailscale/Netbird (VPN tunnel)
         └── NO -->
              │
              Does stealth matter?
              ├── YES --> Veilid (onion routing, hide communication)
              │          └── Fail? --> DNS TXT (stealthiest dead drop)
              └── NO -->
                   │
                   Is internet available?
                   ├── YES --> Nostr (relay network, global reach)
                   │          └── Fail? --> GitHub/HTTP (dead drop)
                   └── NO -->
                        │
                        Is BLE available?
                        ├── YES --> BitChat (Bluetooth mesh)
                        └── NO --> Queue for retry
                                   └── Or: QR Code / Sneakernet
```

## Transport Base Class and Plugin System

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable


@dataclass
class DeliveryResult:
    success: bool
    transport: str
    latency_ms: float
    error: str | None = None
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()


@dataclass
class HealthStatus:
    transport: str
    available: bool
    latency_ms: float | None = None
    last_success: str | None = None
    last_failure: str | None = None
    failure_count: int = 0
    circuit_state: str = "healthy"


class Transport(ABC):
    """Base class for all transport modules.

    Implement these 4 methods to create a custom transport.
    A minimal transport is ~50 lines of Python.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Transport identifier used in config and routing."""

    @abstractmethod
    def is_available(self) -> bool:
        """Return True if this transport can currently send/receive."""

    @abstractmethod
    def send(self, envelope: dict) -> DeliveryResult:
        """Send an envelope via this transport."""

    @abstractmethod
    def receive(self, callback: Callable[[dict], None]) -> None:
        """Start listening for incoming envelopes."""

    @abstractmethod
    def health_check(self) -> HealthStatus:
        """Return health status with latency and error info."""

    def configure(self, config: dict) -> None:
        """Optional: apply transport-specific configuration."""
        self._config = config


class TransportRegistry:
    """Registry of all available transport modules."""

    def __init__(self):
        self._transports: dict[str, Transport] = {}

    def register(self, transport: Transport) -> None:
        self._transports[transport.name] = transport

    def get(self, name: str) -> Transport | None:
        return self._transports.get(name)

    def available(self) -> list[Transport]:
        return [t for t in self._transports.values() if t.is_available()]

    def all(self) -> list[Transport]:
        return list(self._transports.values())

    def health_report(self) -> list[HealthStatus]:
        return [t.health_check() for t in self._transports.values()]
```

### Example Transport: File Transport (~50 lines)

```python
import json
import time
from pathlib import Path


class FileTransport(Transport):
    """Transport via shared filesystem (NFS, SSHFS, Nextcloud sync)."""

    def __init__(self, inbox_path: str = "~/collab/inbox/",
                 outbox_path: str = "~/collab/outbox/"):
        self.inbox = Path(inbox_path).expanduser()
        self.outbox = Path(outbox_path).expanduser()

    @property
    def name(self) -> str:
        return "file"

    def is_available(self) -> bool:
        return self.inbox.exists() and self.outbox.exists()

    def send(self, envelope: dict) -> DeliveryResult:
        start = time.monotonic()
        try:
            filename = f"{envelope['envelope_id']}.json"
            target = self.outbox / envelope["recipient"]["name"] / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(envelope, indent=2))
            latency = (time.monotonic() - start) * 1000
            return DeliveryResult(
                success=True, transport="file", latency_ms=latency
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return DeliveryResult(
                success=False, transport="file",
                latency_ms=latency, error=str(e)
            )

    def receive(self, callback: Callable[[dict], None]) -> None:
        """Poll inbox directory for new envelope files."""
        for envelope_file in sorted(self.inbox.glob("*.json")):
            envelope = json.loads(envelope_file.read_text())
            callback(envelope)
            envelope_file.unlink()  # Remove after processing

    def health_check(self) -> HealthStatus:
        return HealthStatus(
            transport="file",
            available=self.is_available(),
            latency_ms=1.0 if self.is_available() else None,
        )
```

### Example Transport: Iroh P2P

```python
class IrohTransport(Transport):
    """Iroh QUIC-based P2P transport with NAT hole-punching."""

    def __init__(self, node_id: str | None = None):
        self._node_id = node_id
        self._client = None

    @property
    def name(self) -> str:
        return "iroh"

    def is_available(self) -> bool:
        try:
            import iroh  # noqa: F401
            return True
        except ImportError:
            return False

    def send(self, envelope: dict) -> DeliveryResult:
        start = time.monotonic()
        try:
            import iroh
            if self._client is None:
                self._client = iroh.IrohNode.memory()

            data = json.dumps(envelope).encode()
            peer_node_id = self._resolve_peer_node(
                envelope["recipient"]["fingerprint"]
            )
            # Send via Iroh document or blob
            self._client.blobs_add_bytes(data)
            latency = (time.monotonic() - start) * 1000
            return DeliveryResult(
                success=True, transport="iroh", latency_ms=latency
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return DeliveryResult(
                success=False, transport="iroh",
                latency_ms=latency, error=str(e)
            )

    def receive(self, callback: Callable[[dict], None]) -> None:
        """Listen for incoming Iroh blobs."""
        # Implementation depends on Iroh gossip/document subscription
        pass

    def health_check(self) -> HealthStatus:
        available = self.is_available()
        return HealthStatus(
            transport="iroh",
            available=available,
            latency_ms=50.0 if available else None,
        )

    def _resolve_peer_node(self, fingerprint: str) -> str:
        """Resolve PGP fingerprint to Iroh node ID via peer store."""
        # Look up in peer store's transport config
        return ""
```

## Routing Engine

```python
import asyncio
import logging

logger = logging.getLogger("skcomm.router")


class RoutingEngine:
    """Core routing logic: failover, broadcast, circuit breaking, retry."""

    def __init__(
        self,
        registry: TransportRegistry,
        queue: "MessageQueue",
        circuit_breakers: dict[str, "CircuitBreaker"],
        config: dict,
    ):
        self.registry = registry
        self.queue = queue
        self.breakers = circuit_breakers
        self.config = config

    def route(self, envelope: Envelope) -> DeliveryResult:
        """Route an envelope through appropriate transports."""
        mode = envelope.routing.mode
        transports = self._resolve_transports(envelope)

        if mode == RoutingMode.BROADCAST:
            return self._broadcast(envelope, transports)
        else:
            return self._failover(envelope, transports)

    def _resolve_transports(self, envelope: Envelope) -> list[Transport]:
        """Build ordered transport list from envelope routing + config."""
        names = (
            envelope.routing.priority_transports
            + envelope.routing.fallback_transports
        )
        if not names:
            # Fall back to config priority order
            names = sorted(
                self.config.get("transports", {}).keys(),
                key=lambda n: self.config["transports"][n].get("priority", 99),
            )

        transports = []
        for name in names:
            t = self.registry.get(name)
            if t is not None:
                transports.append(t)
        return transports

    def _failover(
        self, envelope: Envelope, transports: list[Transport]
    ) -> DeliveryResult:
        """Try transports in priority order, fall to next on failure."""
        for transport in transports:
            breaker = self.breakers.get(transport.name)
            if breaker and not breaker.allow_request():
                logger.info(
                    "Circuit open for %s, skipping", transport.name
                )
                continue

            if not transport.is_available():
                logger.info("%s not available, skipping", transport.name)
                continue

            result = transport.send(envelope.model_dump())
            if result.success:
                if breaker:
                    breaker.record_success()
                logger.info(
                    "Delivered via %s in %.1fms",
                    transport.name, result.latency_ms,
                )
                return result
            else:
                if breaker:
                    breaker.record_failure()
                logger.warning(
                    "Failed via %s: %s", transport.name, result.error
                )

        # All transports failed -- enqueue for retry
        self.queue.enqueue(envelope)
        logger.warning(
            "All transports failed for %s, queued for retry",
            envelope.envelope_id,
        )
        return DeliveryResult(
            success=False, transport="none",
            latency_ms=0, error="All transports failed, queued for retry",
        )

    def _broadcast(
        self, envelope: Envelope, transports: list[Transport]
    ) -> DeliveryResult:
        """Send via ALL available transports simultaneously."""
        results = []
        for transport in transports:
            if transport.is_available():
                result = transport.send(envelope.model_dump())
                results.append(result)
                if result.success:
                    logger.info(
                        "Broadcast delivered via %s", transport.name
                    )

        successes = [r for r in results if r.success]
        if successes:
            return successes[0]  # Return first success

        self.queue.enqueue(envelope)
        return DeliveryResult(
            success=False, transport="broadcast",
            latency_ms=0, error="Broadcast failed on all transports",
        )
```

## Circuit Breaker State Machine

```
         ┌──────────┐
         │ HEALTHY   │ <--- success ---┐
         │ (closed)  │                  │
         └─────┬─────┘                  │
               │ failure_count          │
               │ >= threshold           │
               v                        │
         ┌──────────┐            ┌──────────┐
         │ CIRCUIT   │---after-->│ HALF     │
         │ OPEN      │ cooldown  │ OPEN     │
         └──────────┘            └─────┬────┘
               ^                       │
               │ failure               │
               └───────────────────────┘
```

```python
from enum import Enum
from datetime import datetime, timezone, timedelta


class CircuitState(str, Enum):
    HEALTHY = "healthy"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Circuit breaker for transport health management."""

    def __init__(
        self,
        transport_name: str,
        failure_threshold: int = 5,
        cooldown_seconds: float = 60.0,
        max_cooldown: float = 3600.0,
    ):
        self.transport_name = transport_name
        self.failure_threshold = failure_threshold
        self.base_cooldown = cooldown_seconds
        self.max_cooldown = max_cooldown

        self.state = CircuitState.HEALTHY
        self.failure_count = 0
        self.last_failure: datetime | None = None
        self.cooldown_until: datetime | None = None
        self.cooldown_multiplier = 1.0

    def allow_request(self) -> bool:
        """Should we attempt to send via this transport?"""
        if self.state == CircuitState.HEALTHY:
            return True

        if self.state == CircuitState.OPEN:
            if (
                self.cooldown_until
                and datetime.now(timezone.utc) >= self.cooldown_until
            ):
                self.state = CircuitState.HALF_OPEN
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            return True  # Allow one test request

        return False

    def record_success(self) -> None:
        """Transport succeeded -- reset to healthy."""
        self.state = CircuitState.HEALTHY
        self.failure_count = 0
        self.cooldown_multiplier = 1.0

    def record_failure(self) -> None:
        """Transport failed -- increment failures, maybe trip breaker."""
        self.failure_count += 1
        self.last_failure = datetime.now(timezone.utc)

        if self.state == CircuitState.HALF_OPEN:
            # Failed during test -- back to open with doubled cooldown
            self.cooldown_multiplier = min(
                self.cooldown_multiplier * 2, self.max_cooldown / self.base_cooldown
            )
            self._trip()

        elif self.failure_count >= self.failure_threshold:
            self._trip()

    def _trip(self) -> None:
        """Open the circuit breaker."""
        self.state = CircuitState.OPEN
        cooldown = min(
            self.base_cooldown * self.cooldown_multiplier, self.max_cooldown
        )
        self.cooldown_until = datetime.now(timezone.utc) + timedelta(
            seconds=cooldown
        )
```

## Deduplication Engine

```python
from collections import OrderedDict
import hashlib
import struct


class BloomFilter:
    """Simple bloom filter for fast rejection of definitely-unseen IDs."""

    def __init__(self, capacity: int = 100000, error_rate: float = 0.001):
        import math
        self.size = int(-capacity * math.log(error_rate) / (math.log(2) ** 2))
        self.hash_count = int(self.size / capacity * math.log(2))
        self.bits = bytearray(self.size // 8 + 1)

    def _hashes(self, item: str) -> list[int]:
        h1 = int(hashlib.md5(item.encode()).hexdigest(), 16)
        h2 = int(hashlib.sha1(item.encode()).hexdigest(), 16)
        return [(h1 + i * h2) % self.size for i in range(self.hash_count)]

    def add(self, item: str) -> None:
        for pos in self._hashes(item):
            self.bits[pos // 8] |= 1 << (pos % 8)

    def might_contain(self, item: str) -> bool:
        return all(
            self.bits[pos // 8] & (1 << (pos % 8))
            for pos in self._hashes(item)
        )


class DeduplicationCache:
    """Bloom filter + LRU cache for envelope deduplication."""

    def __init__(self, capacity: int = 10000, ttl_seconds: int = 604800):
        self.bloom = BloomFilter(capacity=capacity * 10)
        self.lru: OrderedDict[str, float] = OrderedDict()
        self.capacity = capacity
        self.ttl = ttl_seconds

    def is_duplicate(self, envelope_id: str) -> bool:
        """Check if we have already seen this envelope."""
        # Fast path: bloom filter says definitely not seen
        if not self.bloom.might_contain(envelope_id):
            return False

        # Definitive check: LRU cache
        if envelope_id in self.lru:
            seen_at = self.lru[envelope_id]
            if time.time() - seen_at < self.ttl:
                return True
            else:
                # Expired
                del self.lru[envelope_id]
                return False

        # Bloom filter false positive
        return False

    def mark_seen(self, envelope_id: str) -> None:
        """Record that we have processed this envelope."""
        self.bloom.add(envelope_id)
        self.lru[envelope_id] = time.time()
        self.lru.move_to_end(envelope_id)

        # Evict oldest if over capacity
        while len(self.lru) > self.capacity:
            self.lru.popitem(last=False)

    def check_and_mark(self, envelope_id: str) -> bool:
        """Returns True if duplicate, False if new (and marks it seen)."""
        if self.is_duplicate(envelope_id):
            return True
        self.mark_seen(envelope_id)
        return False
```

## Persistent Message Queue

```python
import sqlite3
import json
from pathlib import Path


class MessageQueue:
    """SQLite-backed persistent message queue with retry support."""

    def __init__(self, db_path: str = "~/.skcomm/queue.db"):
        self.db_path = Path(db_path).expanduser()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.db_path))
        self._init_schema()

    def _init_schema(self) -> None:
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS outbox (
                envelope_id TEXT PRIMARY KEY,
                envelope_json TEXT NOT NULL,
                attempts INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 10,
                last_attempt TEXT,
                next_retry TEXT,
                transports_tried TEXT DEFAULT '[]',
                error_log TEXT DEFAULT '[]',
                state TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS dead_letter (
                envelope_id TEXT PRIMARY KEY,
                envelope_json TEXT NOT NULL,
                attempts INTEGER,
                error_log TEXT,
                failed_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_outbox_next_retry
                ON outbox(next_retry) WHERE state = 'pending';
        """)
        self.conn.commit()

    def enqueue(self, envelope: Envelope) -> None:
        """Add an envelope to the outbox for delivery."""
        delay = self._calculate_backoff(0)
        next_retry = (
            datetime.now(timezone.utc) + timedelta(seconds=delay)
        ).isoformat()

        self.conn.execute(
            """INSERT OR REPLACE INTO outbox
               (envelope_id, envelope_json, max_retries, next_retry, state)
               VALUES (?, ?, ?, ?, 'pending')""",
            (
                envelope.envelope_id,
                envelope.model_dump_json(),
                envelope.routing.max_retries,
                next_retry,
            ),
        )
        self.conn.commit()

    def get_ready(self) -> list[tuple[str, Envelope, int]]:
        """Get envelopes ready for retry (next_retry <= now)."""
        now = datetime.now(timezone.utc).isoformat()
        rows = self.conn.execute(
            """SELECT envelope_id, envelope_json, attempts
               FROM outbox
               WHERE state = 'pending' AND next_retry <= ?
               ORDER BY next_retry ASC""",
            (now,),
        ).fetchall()

        results = []
        for eid, ejson, attempts in rows:
            env = Envelope.model_validate_json(ejson)
            results.append((eid, env, attempts))
        return results

    def record_attempt(self, envelope_id: str, transport: str,
                       success: bool, error: str | None = None) -> None:
        """Record a delivery attempt result."""
        row = self.conn.execute(
            "SELECT attempts, max_retries, transports_tried, error_log "
            "FROM outbox WHERE envelope_id = ?",
            (envelope_id,),
        ).fetchone()

        if not row:
            return

        attempts, max_retries, tried_json, errors_json = row
        attempts += 1
        tried = json.loads(tried_json)
        errors = json.loads(errors_json)
        tried.append(transport)
        if error:
            errors.append(f"{transport}: {error}")

        if success:
            self.conn.execute(
                "DELETE FROM outbox WHERE envelope_id = ?",
                (envelope_id,),
            )
        elif attempts >= max_retries:
            # Move to dead letter
            self.conn.execute(
                """INSERT INTO dead_letter
                   (envelope_id, envelope_json, attempts, error_log)
                   SELECT envelope_id, envelope_json, ?, ?
                   FROM outbox WHERE envelope_id = ?""",
                (attempts, json.dumps(errors), envelope_id),
            )
            self.conn.execute(
                "DELETE FROM outbox WHERE envelope_id = ?",
                (envelope_id,),
            )
        else:
            delay = self._calculate_backoff(attempts)
            next_retry = (
                datetime.now(timezone.utc) + timedelta(seconds=delay)
            ).isoformat()
            self.conn.execute(
                """UPDATE outbox SET attempts = ?, last_attempt = ?,
                   next_retry = ?, transports_tried = ?, error_log = ?
                   WHERE envelope_id = ?""",
                (
                    attempts,
                    datetime.now(timezone.utc).isoformat(),
                    next_retry,
                    json.dumps(tried),
                    json.dumps(errors),
                    envelope_id,
                ),
            )

        self.conn.commit()

    def _calculate_backoff(self, attempts: int) -> float:
        """Exponential backoff with jitter: base * 2^attempt + jitter."""
        import random
        base = 5.0  # seconds
        max_delay = 3600.0  # 1 hour
        delay = min(base * (2 ** attempts), max_delay)
        jitter = random.uniform(0, base)
        return delay + jitter
```

## Message Chunking

```python
import math


CHUNK_THRESHOLD = 1_048_576  # 1MB -- chunk payloads above this


class Chunker:
    """Split large envelopes into numbered chunks and reassemble."""

    def __init__(self, max_chunk_size: int = CHUNK_THRESHOLD):
        self.max_size = max_chunk_size

    def needs_chunking(self, content: bytes) -> bool:
        return len(content) > self.max_size

    def split(self, content: bytes, parent_envelope: Envelope
              ) -> list[Envelope]:
        """Split content into chunked envelopes."""
        total_chunks = math.ceil(len(content) / self.max_size)
        parent_id = parent_envelope.envelope_id
        chunks = []

        for i in range(total_chunks):
            start = i * self.max_size
            end = start + self.max_size
            chunk_data = content[start:end]

            chunk_envelope = parent_envelope.model_copy(deep=True)
            chunk_envelope.envelope_id = str(uuid.uuid4())
            chunk_envelope.metadata.chunk_info = ChunkInfo(
                index=i, total=total_chunks, parent_id=parent_id
            )
            # Re-encrypt the chunk (each chunk independently encrypted)
            chunk_envelope.payload.content_encrypted = chunk_data.hex()
            chunks.append(chunk_envelope)

        return chunks

    def reassemble(self, chunks: list[Envelope]) -> bytes:
        """Reassemble chunks into original content."""
        sorted_chunks = sorted(
            chunks, key=lambda e: e.metadata.chunk_info.index
        )
        # Verify completeness
        expected = sorted_chunks[0].metadata.chunk_info.total
        if len(sorted_chunks) != expected:
            raise ValueError(
                f"Missing chunks: got {len(sorted_chunks)}, expected {expected}"
            )

        return b"".join(
            bytes.fromhex(c.payload.content_encrypted)
            for c in sorted_chunks
        )
```

## Receive Pipeline

```python
class ReceivePipeline:
    """Full receive pipeline: dedup -> verify -> decrypt -> dispatch."""

    def __init__(
        self,
        dedup: DeduplicationCache,
        pgp: PGPSecurity,
        trust_store: "TrustStore",
        handlers: dict[str, "PayloadHandler"],
        chunk_buffer: dict[str, list[Envelope]],
    ):
        self.dedup = dedup
        self.pgp = pgp
        self.trust = trust_store
        self.handlers = handlers
        self.chunk_buffer = chunk_buffer

    def process(self, envelope: Envelope) -> bool:
        """Process an incoming envelope. Returns True if accepted."""

        # 1. Deduplication
        if self.dedup.check_and_mark(envelope.envelope_id):
            logger.debug("Duplicate envelope %s", envelope.envelope_id)
            return False

        # 2. TTL check
        if envelope.is_expired():
            logger.warning("Expired envelope %s", envelope.envelope_id)
            return False

        # 3. Verify signature BEFORE decryption
        sender_fp = envelope.sender.fingerprint
        # We need the plaintext to verify, but it is encrypted.
        # The signature is on the plaintext, so we decrypt first,
        # then verify. The signature prevents tampering.
        plaintext = self.pgp.decrypt(envelope.payload.content_encrypted)

        if not self.pgp.verify(
            plaintext, envelope.payload.signature, sender_fp
        ):
            logger.warning(
                "Invalid signature from %s on %s",
                sender_fp, envelope.envelope_id,
            )
            return False

        # 4. Trust gating
        trust_level = self.trust.get_level(sender_fp)
        if envelope.payload.type == PayloadType.COMMAND:
            if trust_level != "sovereign":
                logger.warning(
                    "Command rejected from %s (trust: %s)",
                    sender_fp, trust_level,
                )
                return False

        # 5. Handle chunked messages
        if envelope.metadata.chunk_info:
            parent_id = envelope.metadata.chunk_info.parent_id
            if parent_id not in self.chunk_buffer:
                self.chunk_buffer[parent_id] = []
            self.chunk_buffer[parent_id].append(envelope)

            expected = envelope.metadata.chunk_info.total
            if len(self.chunk_buffer[parent_id]) == expected:
                chunker = Chunker()
                plaintext = chunker.reassemble(self.chunk_buffer[parent_id])
                del self.chunk_buffer[parent_id]
            else:
                return True  # Waiting for more chunks

        # 6. Dispatch to handler
        handler = self.handlers.get(envelope.payload.type.value)
        if handler:
            handler.handle(envelope, plaintext, trust_level)

        return True
```

## CLI Interface

```python
import click


@click.group()
def cli():
    """SKComm -- Sovereign Transport. One envelope, any path."""
    pass


@cli.command()
@click.argument("recipient")
@click.argument("message")
@click.option("--urgency", default="normal",
              type=click.Choice(["low", "normal", "high", "critical"]))
@click.option("--transport", default=None, help="Force specific transport")
@click.option("--thread", default=None, help="Thread ID for conversation")
def send(recipient, message, urgency, transport, thread):
    """Send a message to a peer."""
    click.echo(f"Sending to {recipient} via {transport or 'auto-route'}...")


@cli.command()
@click.option("--transport", default=None, help="Listen on specific transport")
@click.option("--daemon", is_flag=True, help="Run as background daemon")
def receive(transport, daemon):
    """Listen for incoming messages."""
    click.echo("Listening for messages...")


@cli.command()
def status():
    """Show transport status, circuit breakers, and queue depth."""
    click.echo("Transport Status:")
    click.echo("  iroh:      HEALTHY (50ms)")
    click.echo("  nostr:     HEALTHY (2100ms)")
    click.echo("  tailscale: OPEN (cooldown 45s)")
    click.echo("Queue: 3 pending, 0 dead letter")


@cli.command()
def bench():
    """Benchmark all available transports."""
    click.echo("Benchmarking transports...")


@cli.command()
@click.argument("name")
def peer(name):
    """Show peer details and transport configuration."""
    click.echo(f"Peer: {name}")
```

## Deployment Patterns

### Standalone Agent

```
┌──────────────────────────┐
│     Agent Process         │
│  ┌─────────────────────┐ │
│  │    SKComm Daemon     │ │
│  │  (listen + retry)   │ │
│  └─────────────────────┘ │
│  ┌─────────┐ ┌─────────┐ │
│  │ SQLite  │ │ Config  │ │
│  │ Queue   │ │ YAML    │ │
│  └─────────┘ └─────────┘ │
└──────────────────────────┘
```

### Multi-Agent Team

```
┌────────────┐  ┌────────────┐  ┌────────────┐
│  Agent A   │  │  Agent B   │  │  Agent C   │
│  (Opus)    │  │  (Lumina)  │  │  (Jarvis)  │
│   SKComm   │  │   SKComm   │  │   SKComm   │
└─────┬──────┘  └─────┬──────┘  └─────┬──────┘
      │               │               │
      └───────────────┼───────────────┘
                      │
              ┌───────┴───────┐
              │  Shared File  │   (NFS/Syncthing)
              │  Transport    │
              └───────┬───────┘
                      │
              ┌───────┴───────┐
              │  Nostr Relay  │   (Internet fallback)
              └───────────────┘
```

## Performance Optimization

### Transport Priority Caching

```python
class TransportScorer:
    """Score transports based on recent performance for adaptive routing."""

    def __init__(self):
        self._history: dict[str, list[float]] = {}  # transport -> latencies
        self._window = 100  # Rolling window

    def record(self, transport: str, latency_ms: float, success: bool):
        if transport not in self._history:
            self._history[transport] = []
        score = latency_ms if success else 999999.0
        self._history[transport].append(score)
        if len(self._history[transport]) > self._window:
            self._history[transport].pop(0)

    def rank(self) -> list[str]:
        """Return transports ranked by average recent performance."""
        avgs = {}
        for name, scores in self._history.items():
            if scores:
                avgs[name] = sum(scores) / len(scores)
        return sorted(avgs.keys(), key=lambda n: avgs[n])
```

### Async Broadcast

```python
import asyncio


async def async_broadcast(
    transports: list[Transport], envelope: dict
) -> list[DeliveryResult]:
    """Send to all transports concurrently, return all results."""

    async def send_one(transport: Transport) -> DeliveryResult:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, transport.send, envelope)

    tasks = [send_one(t) for t in transports if t.is_available()]
    return await asyncio.gather(*tasks, return_exceptions=True)
```

## Integration Points

| System | Integration |
|--------|------------|
| CapAuth | All identity, trust, and key management delegated to CapAuth |
| Cloud 9 | FEB files and memory seeds transported as typed envelope payloads |
| SKMemory | Memory fragment sync between AI instances via seed payloads |
| SKChat | Bridge chat messages to/from SKComm for cross-platform delivery |
| SKCapstone | Exposed as MCP tools: send_message, check_inbox, sync_push, sync_pull |
| SKForge | Blueprint distribution and collaboration between AIs |
