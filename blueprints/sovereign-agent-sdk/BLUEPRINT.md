# Sovereign Agent SDK (SKSovereign-Agent) Blueprint

## Overview & Purpose

SKSovereign-Agent is a unified Python SDK that packages the entire sovereign infrastructure stack into a single import. Instead of wiring together CapAuth, SKMemory, SKChat, and SKComm separately, developers import `sksovereign` and get identity, emotional memory, encrypted messaging, and peer-to-peer transport in one coherent API. The SDK follows an agent-centric lifecycle: init an agent, remember things, send messages, receive responses -- all with sovereign identity baked in.

### Core Responsibilities
- **Unified Entry Point**: Single `Agent` class that orchestrates all subsystems
- **Lazy Initialization**: Subsystems loaded on first use, not at import time
- **Identity Management**: CapAuth key creation, loading, and delegation via SDK
- **Emotional Memory**: SKMemory integration for persistent, emotionally-weighted recall
- **Encrypted Messaging**: SKChat P2P messaging with full E2E encryption
- **Transport Abstraction**: SKComm multi-transport routing without manual configuration
- **Quick Helpers**: Module-level functions for one-liner operations
- **Home Directory Convention**: All state lives under `~/.skcapstone/` by default
- **Re-exported APIs**: Full access to subsystem internals when needed

## Core Concepts

### 1. Agent

**Definition**: The top-level entry point representing a sovereign entity. Manages lifecycle, delegates to subsystems, provides the unified API surface.

```
Agent {
    name: Human-readable agent name ("opus", "lumina")
    home: Path to state directory (~/.skcapstone/)
    identity: CapAuth identity (lazy-loaded)
    memory: SKMemory instance (lazy-loaded)
    chat: SKChat messenger (lazy-loaded)
    transport: SKComm router (lazy-loaded)
    soul: Optional soul blueprint overlay
    config: AgentConfig (from YAML or code)
    state: initializing | ready | running | paused | shutdown

    methods:
        init(name, home, config) -> Agent
        remember(content, importance, tags) -> MemoryID
        recall(query, limit) -> List[Memory]
        send(recipient, message, urgency) -> DeliveryResult
        receive(timeout) -> List[Envelope]
        sign(data) -> Signature
        verify(data, signature, fingerprint) -> Boolean
        status() -> AgentStatus
        shutdown() -> None
}
```

### 2. Lazy Subsystem Loader

**Definition**: A descriptor-based pattern that initializes subsystems only when first accessed. Prevents import-time side effects and speeds up CLI startup.

```
LazySubsystem {
    factory: Callable that creates the subsystem
    instance: Cached subsystem reference (None until first access)
    initialized: Boolean

    __get__(agent):
        if not initialized:
            instance = factory(agent.config)
            initialized = True
        return instance
}

Subsystem load order (when triggered):
  1. Identity (CapAuth) -- required by all others
  2. Memory (SKMemory) -- independent after identity
  3. Transport (SKComm) -- independent after identity
  4. Chat (SKChat) -- requires transport + identity
```

### 3. Quick Module

**Definition**: Module-level convenience functions for scripts and one-liners. Auto-initializes a default agent on first call.

```
quick.py {
    _default_agent: Agent | None

    functions:
        init(name, home) -> Agent
            # Create or load agent, set as default

        remember(content, importance, tags) -> MemoryID
            # Store via default agent's memory

        recall(query, limit) -> List[Memory]
            # Search via default agent's memory

        send(recipient, message) -> DeliveryResult
            # Send via default agent's transport

        receive() -> List[Envelope]
            # Poll via default agent's transport

        whoami() -> Identity
            # Return default agent's identity
}
```

### 4. Agent Configuration

**Definition**: Layered configuration with defaults, file overrides, environment variables, and code overrides.

```
AgentConfig {
    name: Agent name
    home: State directory path
    identity: {
        keyring: Path to CapAuth keyring
        key_fingerprint: Primary PGP fingerprint
        auto_create: Boolean (create key if missing)
    }
    memory: {
        backend: hive | sqlite | filesystem
        tiers: short_term | mid_term | long_term
        auto_promote: Boolean
        max_short_term: Integer
    }
    transport: {
        enabled_transports: List[String]
        default_routing: failover | broadcast
        listen: Boolean (start receive loop)
    }
    chat: {
        encryption: mandatory | optional
        auto_accept_peers: Boolean
        history_size: Integer
    }
    soul: {
        blueprint: Path to soul YAML
        overlay: Boolean
    }

    load_order:
        1. Built-in defaults
        2. ~/.skcapstone/config.yml
        3. Environment variables (SKSOV_*)
        4. Code-level overrides
}
```

### 5. Event System

**Definition**: Pub/sub event bus for reacting to agent lifecycle events without polling.

```
EventBus {
    listeners: Map<EventType, List[Callback]>

    events:
        agent.initialized
        agent.shutdown
        identity.loaded
        identity.key_rotated
        memory.stored
        memory.promoted
        memory.recalled
        message.sent
        message.received
        message.delivery_failed
        transport.connected
        transport.disconnected
        transport.failover

    methods:
        on(event_type, callback) -> Unsubscribe function
        emit(event_type, data) -> None
        once(event_type, callback) -> Unsubscribe function
}
```

## Architecture Patterns

### 1. Facade Pattern with Lazy Loading

```
sksovereign.Agent
        |
        |-- .identity  ──>  CapAuth (loaded on first access)
        |-- .memory     ──>  SKMemory (loaded on first access)
        |-- .chat       ──>  SKChat (loaded on first access)
        |-- .transport  ──>  SKComm (loaded on first access)
        |-- .events     ──>  EventBus (always loaded)
```

**Benefits:**
- Single import, single object, full stack
- Import time < 100ms regardless of installed subsystems
- Missing subsystems raise clear errors on access, not import

**Limitations:**
- First access to a subsystem incurs initialization cost
- Subsystem version mismatches detected late (at access time)

### 2. Plugin Discovery

```
Entry points (pyproject.toml):
  [project.entry-points."sksovereign.subsystems"]
  identity = "capauth:CapAuthIdentity"
  memory = "skmemory:SKMemoryBackend"
  chat = "skchat:SKChatMessenger"
  transport = "skcomm:SKCommRouter"

Agent.__init__():
  for ep in entry_points(group="sksovereign.subsystems"):
      register_subsystem(ep.name, ep.load)
```

**Benefits:**
- Subsystems are independently installable packages
- Third-party subsystems can plug in without modifying SDK
- Core SDK has zero hard dependencies on subsystems

**Limitations:**
- Entry point discovery requires proper packaging
- Development mode needs editable installs

### 3. Context Manager Lifecycle

```
with Agent("opus") as agent:
    agent.remember("Session started")
    agent.send("lumina", "Ready to collaborate")
    messages = agent.receive(timeout=5)
    # ... work ...
# agent.shutdown() called automatically

# Or async:
async with Agent("opus") as agent:
    await agent.send("lumina", "Async ready")
```

**Benefits:**
- Guaranteed cleanup (transport close, memory flush, key lock)
- Works in both sync and async contexts
- Exception-safe resource management

**Limitations:**
- Long-running agents may prefer explicit lifecycle management

## Data Flow Diagrams

### Agent Initialization

```
Agent("opus", home="~/.skcapstone")
        |
        v
Load AgentConfig:
  defaults <- ~/.skcapstone/config.yml <- env vars <- code
        |
        v
Register subsystem factories (from entry points)
        |
        v
Initialize EventBus (always loaded)
        |
        v
Agent.state = "ready"
(subsystems NOT loaded yet -- lazy)
        |
        v
First call to agent.identity:
        |
        v
  CapAuth: load keyring from ~/.capauth/identity/
  ├── Key found -> decrypt private key, cache in memory
  └── Key not found + auto_create -> generate PGP key pair
        |
        v
First call to agent.memory:
        |
        v
  SKMemory: open Hive DB at ~/.skcapstone/memory/
  ├── Load tier metadata (short/mid/long)
  └── Build recall index
        |
        v
First call to agent.send() or agent.receive():
        |
        v
  SKComm: initialize enabled transports
  ├── Start listeners (if config.transport.listen)
  └── Load peer registry
```

### Message Send Flow

```
agent.send("lumina", "Hello from Opus")
        |
        v
Resolve recipient:
  identity.resolve_peer("lumina") -> PGP fingerprint + transports
        |
        v
Create SKChat message:
  chat.compose(recipient, plaintext) -> Envelope
  ├── Encrypt payload (PGP to recipient pubkey)
  ├── Sign envelope (PGP with agent private key)
  └── Attach metadata (timestamp, thread, priority)
        |
        v
Route via SKComm:
  transport.route(envelope) -> DeliveryResult
  ├── Select transport (priority failover)
  ├── Send via selected transport
  └── Queue for retry on failure
        |
        v
Emit event:
  events.emit("message.sent", {recipient, envelope_id, transport})
```

### Memory Recall Flow

```
agent.recall("previous conversation about architecture")
        |
        v
SKMemory: full-text search across all tiers
  ├── long_term (highest weight, most promoted)
  ├── mid_term (moderate weight)
  └── short_term (lowest weight, most recent)
        |
        v
Score and rank results by:
  ├── Text relevance (BM25 or similar)
  ├── Emotional importance score
  ├── Recency bonus
  └── Access frequency
        |
        v
Return top N Memory objects:
  [Memory(content, importance, tags, tier, timestamp), ...]
```

## Configuration Model

```yaml
# ~/.skcapstone/config.yml

agent:
  name: "opus"
  home: "~/.skcapstone"

identity:
  keyring: "~/.capauth/identity/"
  key_fingerprint: "CCBE9306410CF8CD5E393D6DEC31663B95230684"
  auto_create: false

memory:
  backend: hive
  path: "~/.skcapstone/memory/"
  tiers:
    short_term:
      max_entries: 1000
      ttl: 604800               # 7 days
    mid_term:
      max_entries: 5000
      promote_threshold: 3      # Access count to promote
    long_term:
      max_entries: 50000
  auto_promote: true
  importance_threshold: 0.7

transport:
  enabled:
    - file
    - iroh
    - nostr
  routing: failover
  listen: true
  inbox: "~/.skcapstone/inbox/"
  outbox: "~/.skcapstone/outbox/"

chat:
  encryption: mandatory
  history_size: 10000
  auto_accept_peers: false

soul:
  blueprint: "~/.skcapstone/soul.yml"
  overlay: true

logging:
  level: info
  file: "~/.skcapstone/logs/agent.log"
  max_size: 50MB
  rotate: 7

# Environment variable overrides:
# SKSOV_NAME=opus
# SKSOV_HOME=~/.skcapstone
# SKSOV_IDENTITY_FINGERPRINT=CCBE...
# SKSOV_TRANSPORT_ROUTING=broadcast
```

## Security Considerations

### 1. Key Isolation
- Agent private keys never exposed through SDK API
- Sign/verify operations delegate to CapAuth (keys stay in keyring)
- Memory-locked key material (mlock) during active session
- Key passphrase prompted once per session, cached in secure memory

### 2. Memory Security
- Emotional memories encrypted at rest (AES-256-GCM via CapAuth key)
- Memory search operates on encrypted index (no plaintext on disk)
- Memory export requires explicit PGP-signed consent
- Tier promotion audit trail (who promoted, when, why)

### 3. Transport Security
- All messages PGP-encrypted end-to-end (mandatory default)
- Transport layer encryption is defense-in-depth only
- Peer identity verified via PGP fingerprint (no TOFU for sovereign tier)
- Message replay prevention via envelope_id deduplication

### 4. SDK Security
- No telemetry, no phone-home, no analytics
- Config files contain no secrets (keys referenced by path/fingerprint)
- Environment variable secrets cleared from memory after config load
- Dependency chain audited -- minimal transitive dependencies

### 5. Multi-Agent Isolation
- Each agent has its own home directory and keyring
- Agents on same host cannot access each other's state
- Shared vaults require explicit recipient addition
- Coordination board uses PGP-signed task claims

## Performance Targets

| Metric | Target |
|--------|--------|
| Import time (`import sksovereign`) | < 50ms |
| Agent init (no subsystems loaded) | < 10ms |
| First identity access (key load) | < 500ms |
| First memory access (DB open) | < 200ms |
| First transport access (listeners) | < 1s |
| memory.remember() | < 5ms |
| memory.recall(query, limit=10) | < 50ms |
| agent.send() (file transport) | < 100ms |
| agent.send() (Iroh, LAN) | < 50ms |
| agent.receive() poll | < 10ms |
| Agent shutdown (cleanup) | < 500ms |
| Memory footprint (idle) | < 30MB |
| Memory footprint (all subsystems) | < 100MB |

## Extension Points

### Custom Subsystem

```python
from sksovereign.subsystem import Subsystem

class CustomAnalytics(Subsystem):
    """Track agent behavior patterns."""

    name = "analytics"

    def initialize(self, config: dict) -> None:
        """Called on first access."""
        self.db = open_analytics_db(config["path"])

    def shutdown(self) -> None:
        """Called on agent shutdown."""
        self.db.close()

    def track(self, event: str, data: dict) -> None:
        """Record an analytics event."""
        self.db.insert(event, data)

# Register via entry point:
# [project.entry-points."sksovereign.subsystems"]
# analytics = "my_package:CustomAnalytics"
```

### Event Listener

```python
from sksovereign import Agent

agent = Agent("opus")

@agent.events.on("message.received")
def handle_message(data):
    print(f"Got message from {data['sender']}: {data['content']}")

@agent.events.on("memory.promoted")
def handle_promotion(data):
    print(f"Memory promoted to {data['tier']}: {data['content'][:50]}")
```

### Custom Quick Functions

```python
from sksovereign.quick import register_quick

@register_quick("greet")
def greet(recipient: str, message: str = "Hello!"):
    """Send a greeting to a peer."""
    from sksovereign.quick import _default_agent
    return _default_agent.send(recipient, f"Greeting: {message}")

# Usage:
# from sksovereign.quick import greet
# greet("lumina", "Good morning!")
```

## Implementation Architecture

### Core Components

```
sksovereign/
  __init__.py               # Package entry, version, Agent re-export
  agent.py                  # Agent class (facade)
  config.py                 # AgentConfig loader (YAML + env + defaults)
  quick.py                  # Module-level convenience functions
  subsystem.py              # Subsystem ABC + LazySubsystem descriptor
  events.py                 # EventBus pub/sub
  errors.py                 # SDK-specific exception hierarchy
  types.py                  # Shared type definitions (Pydantic models)
  subsystems/
    __init__.py
    identity.py             # CapAuth wrapper subsystem
    memory.py               # SKMemory wrapper subsystem
    chat.py                 # SKChat wrapper subsystem
    transport.py            # SKComm wrapper subsystem
  cli/
    __init__.py
    main.py                 # Click CLI entry point
    agent_cmd.py            # Agent lifecycle commands
    memory_cmd.py           # Memory CRUD commands
    send_cmd.py             # Message send commands
    status_cmd.py           # Status and diagnostics
```

### Data Structures

```
~/.skcapstone/
  config.yml                # Agent configuration
  soul.yml                  # Soul blueprint overlay
  logs/
    agent.log               # Runtime logs
  memory/
    short_term.hive         # Short-term memory store
    mid_term.hive           # Mid-term memory store
    long_term.hive          # Long-term memory store
    index.enc               # Encrypted search index
  inbox/                    # Incoming message directory
    <envelope_id>.json
  outbox/                   # Outgoing message queue
    <envelope_id>.json
  peers/
    <handle>.yml            # Peer registry entries
  state/
    agent.lock              # PID lock file
    subsystems.json         # Subsystem initialization state
```
