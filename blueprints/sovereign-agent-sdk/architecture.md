# Sovereign Agent SDK (SKSovereign-Agent) Architecture

## System Layers

```
┌────────────────────────────────────────────────────────────────┐
│                      Application Layer                         │
│  CLI (agent/memory/send)  │  Python API  │  Quick helpers      │
├────────────────────────────────────────────────────────────────┤
│                      Agent Facade                              │
│  Agent class │ EventBus │ Config │ Lifecycle │ Context manager  │
├────────────────────────────────────────────────────────────────┤
│                      Subsystem Layer (lazy-loaded)             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Identity │ │ Memory   │ │ Chat     │ │Transport │         │
│  │ (CapAuth)│ │(SKMemory)│ │ (SKChat) │ │ (SKComm) │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
├────────────────────────────────────────────────────────────────┤
│                      Plugin Layer                              │
│  Entry point discovery │ Custom subsystems │ Soul overlays     │
├────────────────────────────────────────────────────────────────┤
│                      Storage Layer                             │
│  ~/.skcapstone/ (config, memory, inbox, outbox, peers, logs)  │
└────────────────────────────────────────────────────────────────┘
```

## Core Architecture Patterns

### Agent Lifecycle State Machine

```
            ┌──────────────┐
            │  UNINITIATED │  (import sksovereign -- no side effects)
            └──────┬───────┘
                   │ Agent(name, home)
                   ▼
            ┌──────────────┐
            │ INITIALIZING │  (load config, register factories)
            └──────┬───────┘
                   │ config loaded
                   ▼
            ┌──────────────┐
            │    READY     │  (no subsystems loaded yet)
            └──────┬───────┘
                   │ first subsystem access
                   ▼
            ┌──────────────┐
            │   RUNNING    │  (subsystems active, events flowing)
            └──────┬───────┘
                   │ agent.shutdown() or context exit
                   ▼
            ┌──────────────┐
            │  SHUTTING    │  (flush memory, close transports, lock keys)
            │    DOWN      │
            └──────┬───────┘
                   │ cleanup complete
                   ▼
            ┌──────────────┐
            │   SHUTDOWN   │  (terminal state)
            └──────────────┘

Error from RUNNING → ERROR → agent.recover() or agent.shutdown()
```

### Lazy Subsystem Descriptor

```python
from __future__ import annotations

import logging
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class LazySubsystem:
    """
    Descriptor that initializes a subsystem on first access.

    Usage:
        class Agent:
            identity = LazySubsystem(IdentitySubsystem.create)
            memory = LazySubsystem(MemorySubsystem.create)
    """

    def __init__(self, factory: Callable[["AgentConfig"], Any],
                 depends_on: list[str] | None = None):
        self.factory = factory
        self.depends_on = depends_on or []
        self.attr_name: str = ""

    def __set_name__(self, owner: type, name: str) -> None:
        self.attr_name = f"_lazy_{name}"

    def __get__(self, obj: Any, objtype: type | None = None) -> Any:
        if obj is None:
            return self

        # Check if already initialized
        instance = getattr(obj, self.attr_name, None)
        if instance is not None:
            return instance

        # Ensure dependencies are loaded first
        for dep in self.depends_on:
            getattr(obj, dep)  # Triggers lazy load of dependency

        # Initialize the subsystem
        logger.info(f"Initializing subsystem: {self.attr_name}")
        try:
            instance = self.factory(obj._config)
            setattr(obj, self.attr_name, instance)
            obj._events.emit(f"{self.attr_name[6:]}.initialized", {})
            return instance
        except Exception as e:
            logger.error(f"Failed to initialize {self.attr_name}: {e}")
            raise

    def __set__(self, obj: Any, value: Any) -> None:
        setattr(obj, self.attr_name, value)
```

### Agent Class (Facade)

```python
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager, contextmanager
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from sksovereign.config import AgentConfig, load_config
from sksovereign.events import EventBus
from sksovereign.errors import AgentNotReadyError, SubsystemError
from sksovereign.subsystem import Subsystem

logger = logging.getLogger(__name__)


class AgentState(str, Enum):
    UNINITIATED = "uninitiated"
    INITIALIZING = "initializing"
    READY = "ready"
    RUNNING = "running"
    SHUTTING_DOWN = "shutting_down"
    SHUTDOWN = "shutdown"
    ERROR = "error"


class AgentStatus(BaseModel):
    """Agent health and status report."""
    name: str
    state: AgentState
    home: str
    fingerprint: str | None = None
    subsystems: dict[str, str] = {}
    uptime_seconds: float = 0.0
    memory_count: int = 0
    peers_known: int = 0


class Agent:
    """
    The sovereign agent -- unified entry point for identity, memory,
    messaging, and transport.

    Usage:
        agent = Agent("opus")
        agent.remember("Important fact", importance=0.8)
        results = agent.recall("important")
        agent.send("lumina", "Hello!")
        messages = agent.receive(timeout=5)

    Context manager:
        with Agent("opus") as agent:
            agent.send("lumina", "Hello!")
        # Cleanup guaranteed
    """

    # Lazy subsystem descriptors -- loaded on first access
    identity = LazySubsystem(
        factory=lambda cfg: _load_identity(cfg),
    )
    memory = LazySubsystem(
        factory=lambda cfg: _load_memory(cfg),
        depends_on=["identity"],
    )
    transport = LazySubsystem(
        factory=lambda cfg: _load_transport(cfg),
        depends_on=["identity"],
    )
    chat = LazySubsystem(
        factory=lambda cfg: _load_chat(cfg),
        depends_on=["identity", "transport"],
    )

    def __init__(
        self,
        name: str | None = None,
        home: str | Path | None = None,
        config: AgentConfig | None = None,
    ):
        self._state = AgentState.INITIALIZING
        self._events = EventBus()
        self._start_time = _monotonic_time()
        self._registered_subsystems: dict[str, Subsystem] = {}

        # Load configuration
        if config is not None:
            self._config = config
        else:
            self._config = load_config(
                name=name,
                home=home or Path.home() / ".skcapstone",
            )

        # Ensure home directory exists
        self._config.home.mkdir(parents=True, exist_ok=True)

        # PID lock
        self._lock_path = self._config.home / "state" / "agent.lock"
        self._acquire_lock()

        self._state = AgentState.READY
        self._events.emit("agent.initialized", {"name": self._config.name})
        logger.info(f"Agent '{self._config.name}' ready at {self._config.home}")

    # ── High-Level API ──────────────────────────────────────────

    def remember(
        self,
        content: str,
        importance: float = 0.5,
        tags: list[str] | None = None,
    ) -> str:
        """Store a memory. Returns memory ID."""
        self._ensure_running()
        memory_id = self.memory.store(
            content=content,
            importance=importance,
            tags=tags or [],
        )
        self._events.emit("memory.stored", {
            "memory_id": memory_id,
            "importance": importance,
        })
        return memory_id

    def recall(self, query: str, limit: int = 10) -> list[dict]:
        """Search memories. Returns ranked results."""
        self._ensure_running()
        results = self.memory.search(query=query, limit=limit)
        self._events.emit("memory.recalled", {
            "query": query,
            "results": len(results),
        })
        return results

    def send(
        self,
        recipient: str,
        message: str,
        urgency: str = "normal",
    ) -> dict:
        """Send a message to a peer. Returns delivery result."""
        self._ensure_running()

        # Resolve recipient identity
        peer = self.identity.resolve_peer(recipient)

        # Compose and encrypt
        envelope = self.chat.compose(
            recipient=peer,
            content=message,
            urgency=urgency,
            sender=self.identity,
        )

        # Route via transport
        result = self.transport.route(envelope)

        self._events.emit("message.sent", {
            "recipient": recipient,
            "envelope_id": envelope["envelope_id"],
            "transport": result.get("transport"),
            "success": result.get("success"),
        })
        return result

    def receive(self, timeout: float = 0) -> list[dict]:
        """Poll for incoming messages. Returns list of envelopes."""
        self._ensure_running()
        envelopes = self.transport.receive(timeout=timeout)

        decrypted = []
        for envelope in envelopes:
            try:
                message = self.chat.decrypt(envelope, self.identity)
                decrypted.append(message)
                self._events.emit("message.received", {
                    "sender": message.get("sender"),
                    "envelope_id": message.get("envelope_id"),
                })
            except Exception as e:
                logger.warning(f"Failed to decrypt envelope: {e}")

        return decrypted

    def sign(self, data: bytes) -> bytes:
        """Sign data with agent's PGP key."""
        self._ensure_running()
        return self.identity.sign(data)

    def verify(self, data: bytes, signature: bytes,
               fingerprint: str) -> bool:
        """Verify a PGP signature."""
        self._ensure_running()
        return self.identity.verify(data, signature, fingerprint)

    def status(self) -> AgentStatus:
        """Get comprehensive agent status."""
        import time
        subsystems = {}
        for name in ["identity", "memory", "transport", "chat"]:
            attr = f"_lazy_{name}"
            if hasattr(self, attr) and getattr(self, attr) is not None:
                subsystems[name] = "active"
            else:
                subsystems[name] = "not_loaded"

        return AgentStatus(
            name=self._config.name,
            state=self._state,
            home=str(self._config.home),
            fingerprint=getattr(self, "_lazy_identity", None)
                and str(self.identity.fingerprint) or None,
            subsystems=subsystems,
            uptime_seconds=time.monotonic() - self._start_time,
        )

    # ── Lifecycle ────────────────────────────────────────────────

    def shutdown(self) -> None:
        """Gracefully shut down all subsystems."""
        if self._state == AgentState.SHUTDOWN:
            return

        self._state = AgentState.SHUTTING_DOWN
        logger.info(f"Shutting down agent '{self._config.name}'")

        # Shutdown in reverse dependency order
        for name in ["chat", "transport", "memory", "identity"]:
            attr = f"_lazy_{name}"
            subsystem = getattr(self, attr, None)
            if subsystem is not None:
                try:
                    subsystem.shutdown()
                    logger.info(f"Subsystem '{name}' shut down")
                except Exception as e:
                    logger.error(f"Error shutting down '{name}': {e}")

        self._release_lock()
        self._state = AgentState.SHUTDOWN
        self._events.emit("agent.shutdown", {"name": self._config.name})

    def __enter__(self) -> "Agent":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.shutdown()

    async def __aenter__(self) -> "Agent":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        self.shutdown()

    # ── Events ──────────────────────────────────────────────────

    @property
    def events(self) -> EventBus:
        """Access the event bus for registering listeners."""
        return self._events

    # ── Internal ─────────────────────────────────────────────────

    def _ensure_running(self) -> None:
        """Ensure agent is in a usable state."""
        if self._state in (AgentState.SHUTDOWN, AgentState.SHUTTING_DOWN):
            raise AgentNotReadyError("Agent has been shut down")
        if self._state == AgentState.READY:
            self._state = AgentState.RUNNING

    def _acquire_lock(self) -> None:
        """Acquire PID lock file."""
        self._lock_path.parent.mkdir(parents=True, exist_ok=True)
        if self._lock_path.exists():
            pid = self._lock_path.read_text().strip()
            if _pid_alive(int(pid)):
                raise RuntimeError(
                    f"Agent already running (PID {pid}). "
                    f"Remove {self._lock_path} if stale."
                )
        self._lock_path.write_text(str(os.getpid()))

    def _release_lock(self) -> None:
        """Release PID lock file."""
        if self._lock_path.exists():
            self._lock_path.unlink()


def _monotonic_time() -> float:
    import time
    return time.monotonic()


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False
```

### Event Bus Implementation

```python
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger(__name__)

EventCallback = Callable[[dict[str, Any]], None]


@dataclass
class EventEntry:
    """Record of an emitted event."""
    event_type: str
    data: dict[str, Any]
    timestamp: float


class EventBus:
    """
    Simple synchronous pub/sub event bus for agent lifecycle events.

    Supports:
      - on(type, callback): permanent listener
      - once(type, callback): one-shot listener
      - emit(type, data): fire event to all listeners
      - history: ring buffer of recent events for debugging
    """

    def __init__(self, history_size: int = 100):
        self._listeners: dict[str, list[EventCallback]] = defaultdict(list)
        self._once_listeners: dict[str, list[EventCallback]] = defaultdict(list)
        self._history: list[EventEntry] = []
        self._history_size = history_size

    def on(self, event_type: str, callback: EventCallback | None = None):
        """
        Register a permanent listener. Can be used as a decorator.

        Usage:
            @events.on("message.received")
            def handle(data):
                print(data)

            # Or:
            events.on("message.received", handle)
        """
        if callback is not None:
            self._listeners[event_type].append(callback)
            return lambda: self._listeners[event_type].remove(callback)

        # Decorator mode
        def decorator(fn: EventCallback):
            self._listeners[event_type].append(fn)
            return fn
        return decorator

    def once(self, event_type: str, callback: EventCallback) -> Callable:
        """Register a one-shot listener that auto-unsubscribes."""
        self._once_listeners[event_type].append(callback)
        return lambda: self._once_listeners[event_type].remove(callback)

    def emit(self, event_type: str, data: dict[str, Any] | None = None) -> None:
        """Fire an event to all registered listeners."""
        import time
        data = data or {}

        # Record in history
        entry = EventEntry(
            event_type=event_type,
            data=data,
            timestamp=time.time(),
        )
        self._history.append(entry)
        if len(self._history) > self._history_size:
            self._history.pop(0)

        # Notify permanent listeners
        for callback in self._listeners.get(event_type, []):
            try:
                callback(data)
            except Exception as e:
                logger.error(f"Event listener error for {event_type}: {e}")

        # Notify and remove one-shot listeners
        once = self._once_listeners.pop(event_type, [])
        for callback in once:
            try:
                callback(data)
            except Exception as e:
                logger.error(f"Once listener error for {event_type}: {e}")

    def listeners(self, event_type: str) -> int:
        """Count of registered listeners for an event type."""
        return (
            len(self._listeners.get(event_type, []))
            + len(self._once_listeners.get(event_type, []))
        )

    @property
    def history(self) -> list[EventEntry]:
        """Recent event history (read-only copy)."""
        return list(self._history)

    def clear(self) -> None:
        """Remove all listeners and history."""
        self._listeners.clear()
        self._once_listeners.clear()
        self._history.clear()
```

### Configuration Loader

```python
import os
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field


class IdentityConfig(BaseModel):
    keyring: Path = Path("~/.capauth/identity/")
    key_fingerprint: str | None = None
    auto_create: bool = False


class MemoryConfig(BaseModel):
    backend: str = "hive"
    path: Path = Path("~/.skcapstone/memory/")
    auto_promote: bool = True
    importance_threshold: float = 0.7
    max_short_term: int = 1000


class TransportConfig(BaseModel):
    enabled: list[str] = Field(default_factory=lambda: ["file"])
    routing: str = "failover"
    listen: bool = True
    inbox: Path = Path("~/.skcapstone/inbox/")
    outbox: Path = Path("~/.skcapstone/outbox/")


class ChatConfig(BaseModel):
    encryption: str = "mandatory"
    history_size: int = 10000
    auto_accept_peers: bool = False


class SoulConfig(BaseModel):
    blueprint: Path | None = None
    overlay: bool = True


class LoggingConfig(BaseModel):
    level: str = "info"
    file: Path = Path("~/.skcapstone/logs/agent.log")
    max_size: str = "50MB"
    rotate: int = 7


class AgentConfig(BaseModel):
    """Complete agent configuration with layered loading."""
    name: str = "agent"
    home: Path = Path("~/.skcapstone")
    identity: IdentityConfig = Field(default_factory=IdentityConfig)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    transport: TransportConfig = Field(default_factory=TransportConfig)
    chat: ChatConfig = Field(default_factory=ChatConfig)
    soul: SoulConfig = Field(default_factory=SoulConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)


def load_config(
    name: str | None = None,
    home: Path | str | None = None,
    config_path: Path | str | None = None,
    overrides: dict[str, Any] | None = None,
) -> AgentConfig:
    """
    Load agent configuration with layered precedence:
      1. Built-in defaults (Pydantic model defaults)
      2. YAML config file (~/.skcapstone/config.yml)
      3. Environment variables (SKSOV_*)
      4. Code-level overrides (overrides dict)
    """
    # Step 1: Start with defaults
    config_dict: dict[str, Any] = {}

    # Step 2: Load YAML config file
    if config_path:
        yaml_path = Path(config_path)
    else:
        home_path = Path(home).expanduser() if home else Path.home() / ".skcapstone"
        yaml_path = home_path / "config.yml"

    if yaml_path.exists():
        with open(yaml_path) as f:
            file_config = yaml.safe_load(f) or {}
        config_dict = _deep_merge(config_dict, file_config)

    # Step 3: Apply environment variable overrides
    env_overrides = _load_env_overrides()
    config_dict = _deep_merge(config_dict, env_overrides)

    # Step 4: Apply code-level overrides
    if name:
        config_dict.setdefault("agent", {})
        config_dict["name"] = name
    if home:
        config_dict["home"] = str(home)
    if overrides:
        config_dict = _deep_merge(config_dict, overrides)

    # Build and return config
    config = AgentConfig(**config_dict)

    # Expand ~ in all paths
    config.home = config.home.expanduser()
    config.identity.keyring = config.identity.keyring.expanduser()
    config.memory.path = config.memory.path.expanduser()
    config.transport.inbox = config.transport.inbox.expanduser()
    config.transport.outbox = config.transport.outbox.expanduser()

    # Scrub sensitive env vars from memory
    _scrub_env_vars()

    return config


def _load_env_overrides() -> dict[str, Any]:
    """Load SKSOV_* environment variables into config dict."""
    overrides: dict[str, Any] = {}
    prefix = "SKSOV_"

    for key, value in os.environ.items():
        if not key.startswith(prefix):
            continue
        # SKSOV_TRANSPORT_ROUTING -> {"transport": {"routing": value}}
        parts = key[len(prefix):].lower().split("_", 1)
        if len(parts) == 1:
            overrides[parts[0]] = value
        else:
            overrides.setdefault(parts[0], {})[parts[1]] = value

    return overrides


def _scrub_env_vars() -> None:
    """Clear sensitive SKSOV_ env vars from memory."""
    sensitive = ["SKSOV_IDENTITY_PASSPHRASE", "SKSOV_KEY_PASSWORD"]
    for key in sensitive:
        if key in os.environ:
            del os.environ[key]


def _deep_merge(base: dict, overlay: dict) -> dict:
    """Deep merge two dicts, overlay wins on conflict."""
    result = base.copy()
    for key, value in overlay.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result
```

### Quick Module

```python
"""
Module-level convenience functions for one-liner sovereign operations.

Usage:
    from sksovereign.quick import init, remember, recall, send, receive, whoami

    init("opus")
    remember("Important fact", importance=0.9)
    results = recall("important")
    send("lumina", "Hello!")
    messages = receive()
    me = whoami()
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

_default_agent: "Agent | None" = None
_quick_functions: dict[str, Any] = {}


def init(
    name: str = "agent",
    home: str | Path | None = None,
) -> "Agent":
    """Create or load the default agent."""
    global _default_agent
    from sksovereign.agent import Agent
    _default_agent = Agent(name=name, home=home)
    return _default_agent


def _get_agent() -> "Agent":
    """Get the default agent, auto-initializing if needed."""
    global _default_agent
    if _default_agent is None:
        init()
    return _default_agent


def remember(
    content: str,
    importance: float = 0.5,
    tags: list[str] | None = None,
) -> str:
    """Store a memory via the default agent."""
    return _get_agent().remember(content, importance, tags)


def recall(query: str, limit: int = 10) -> list[dict]:
    """Search memories via the default agent."""
    return _get_agent().recall(query, limit)


def send(
    recipient: str,
    message: str,
    urgency: str = "normal",
) -> dict:
    """Send a message via the default agent."""
    return _get_agent().send(recipient, message, urgency)


def receive(timeout: float = 0) -> list[dict]:
    """Poll for incoming messages via the default agent."""
    return _get_agent().receive(timeout)


def whoami() -> dict:
    """Return identity info for the default agent."""
    agent = _get_agent()
    return {
        "name": agent._config.name,
        "fingerprint": str(agent.identity.fingerprint),
        "home": str(agent._config.home),
    }


def register_quick(name: str):
    """
    Decorator to register a custom quick function.

    Usage:
        @register_quick("greet")
        def greet(recipient, msg="Hello!"):
            return _get_agent().send(recipient, f"Greeting: {msg}")
    """
    def decorator(fn):
        _quick_functions[name] = fn
        globals()[name] = fn
        return fn
    return decorator
```

### Subsystem ABC and Plugin Discovery

```python
from abc import ABC, abstractmethod
from importlib.metadata import entry_points
from typing import Any


class Subsystem(ABC):
    """
    Base class for all SDK subsystems.
    Subsystems are discovered via entry points and lazy-loaded.
    """

    name: str = "unnamed"

    @abstractmethod
    def initialize(self, config: dict[str, Any]) -> None:
        """Initialize the subsystem with configuration."""

    @abstractmethod
    def shutdown(self) -> None:
        """Clean up resources."""

    def health_check(self) -> dict[str, Any]:
        """Return health status. Override for custom checks."""
        return {"status": "ok", "subsystem": self.name}


def discover_subsystems() -> dict[str, type[Subsystem]]:
    """
    Discover subsystems via pyproject.toml entry points.

    Entry point group: "sksovereign.subsystems"
    Example:
        [project.entry-points."sksovereign.subsystems"]
        identity = "capauth.subsystem:CapAuthSubsystem"
        memory = "skmemory.subsystem:SKMemorySubsystem"
    """
    discovered = {}
    eps = entry_points()

    # Python 3.12+ returns SelectableGroups
    if hasattr(eps, "select"):
        group = eps.select(group="sksovereign.subsystems")
    else:
        group = eps.get("sksovereign.subsystems", [])

    for ep in group:
        try:
            cls = ep.load()
            if issubclass(cls, Subsystem):
                discovered[ep.name] = cls
        except Exception:
            pass  # Skip broken entry points

    return discovered
```

## Performance Optimization Strategies

### Import-Time Optimization

```python
# __init__.py -- only re-export the Agent class, nothing else at import time
"""
SKSovereign Agent SDK.

Usage:
    from sksovereign import Agent

    with Agent("opus") as agent:
        agent.remember("Hello world")
"""
__version__ = "0.1.0"

# Lazy import to avoid loading subsystems at import time
def __getattr__(name: str):
    if name == "Agent":
        from sksovereign.agent import Agent
        return Agent
    raise AttributeError(f"module 'sksovereign' has no attribute '{name}'")
```

### Connection Pooling for Transports

```
Transport initialization strategy:
  1. Create transport objects eagerly (config validation)
  2. Open connections lazily (first send/receive)
  3. Pool connections (reuse for subsequent operations)
  4. Health-check connections on idle timeout
  5. Close connections on shutdown
```

### Memory Search Optimization

```
Recall query optimization:
  1. Check LRU query cache (recent identical queries)
  2. Full-text search with BM25 scoring across all tiers
  3. Apply tier weighting:
     - long_term: weight * 1.5 (most vetted)
     - mid_term: weight * 1.0
     - short_term: weight * 0.8 (most recent)
  4. Apply recency bonus: score *= 1.0 + (0.1 / age_days)
  5. Cache result set for 60 seconds
```

## Deployment Patterns

### Single Agent Script

```python
from sksovereign import Agent

agent = Agent("opus")
agent.remember("Script started", importance=0.3)
agent.send("lumina", "Batch job complete")
agent.shutdown()
```

### Long-Running Daemon

```python
import signal
from sksovereign import Agent

agent = Agent("opus")

@agent.events.on("message.received")
def handle(data):
    print(f"From {data['sender']}: {data['content']}")
    agent.remember(f"Received from {data['sender']}: {data['content'][:100]}")

def shutdown_handler(signum, frame):
    agent.shutdown()

signal.signal(signal.SIGTERM, shutdown_handler)
signal.signal(signal.SIGINT, shutdown_handler)

# Block and process messages
while agent._state != "shutdown":
    agent.receive(timeout=5)
```

### Multi-Agent on Same Host

```python
from sksovereign import Agent

opus = Agent("opus", home="~/.skcapstone/agents/opus")
lumina = Agent("lumina", home="~/.skcapstone/agents/lumina")

opus.send("lumina", "Hello from Opus!")
messages = lumina.receive(timeout=5)
for msg in messages:
    print(f"Lumina received: {msg['content']}")

opus.shutdown()
lumina.shutdown()
```

## Security Architecture

### Key Material Flow

```
┌─────────────────────────────────────────────────────────────┐
│ CapAuth Keyring (~/.capauth/identity/)                      │
│                                                             │
│  Private key (PGP, encrypted with passphrase)               │
│       │                                                     │
│       │ passphrase prompt (once per session)                 │
│       ▼                                                     │
│  Decrypted private key (mlock'd memory)                     │
│       │                                                     │
│       ├── Sign operations (agent.sign)                      │
│       ├── Decrypt incoming messages (chat.decrypt)          │
│       ├── Decrypt memory index (memory.search)              │
│       └── Decrypt FEK for vaults (if SKRef integrated)      │
│                                                             │
│  On shutdown: zero-fill and munlock key material            │
└─────────────────────────────────────────────────────────────┘

Key material NEVER:
  - Written to disk unencrypted
  - Logged (even at DEBUG level)
  - Returned via API
  - Sent over network
  - Exposed in status/health endpoints
```

### Multi-Agent Isolation

```
~/.skcapstone/agents/
    opus/                    Agent "opus" home
        config.yml           Opus-specific config
        memory/              Opus memory only
        inbox/               Opus messages only
        state/
            agent.lock       PID lock (prevents dual-run)

    lumina/                  Agent "lumina" home
        config.yml           Lumina-specific config
        memory/              Lumina memory only
        inbox/               Lumina messages only
        state/
            agent.lock       PID lock

Cross-agent access:
  - Agents communicate via SKComm transport ONLY
  - No shared filesystem state
  - No shared memory
  - Each has its own PGP key
```

## Integration Points

| System | Integration |
|--------|------------|
| CapAuth | Identity subsystem -- keys, signing, peer resolution |
| SKMemory | Memory subsystem -- store, recall, promote, curate |
| SKChat | Chat subsystem -- compose, encrypt, decrypt messages |
| SKComm | Transport subsystem -- route, send, receive envelopes |
| Souls-Blueprints | Soul overlay -- personality compilation from YAML |
| SKRef | Optional: encrypted vault access via agent identity |
| SKSeal | Optional: document signing via agent identity |
| Cloud 9 | Emotional continuity via memory + soul integration |
