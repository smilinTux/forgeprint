# Agent Skills Framework (SKSkills) Architecture

## System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                     Agent Framework Layer                          │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐              │
│  │  Claude Code│  │  SKCapstone  │  │  Custom    │              │
│  │  (MCP host) │  │  (MCP host)  │  │  Agent     │              │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘              │
│         └────────────────┴─────────────────┘                     │
│                          │                                        │
│                    MCP Client                                     │
├──────────────────────────┼────────────────────────────────────────┤
│                    SKSkills Runtime                                │
│                          │                                        │
│  ┌───────────────────────┼──────────────────────────────────┐    │
│  │               Skill Router & Dispatcher                   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │  Namespace   │  │  CapAuth     │  │  Tool/Res    │   │    │
│  │  │  Resolver    │  │  Gate        │  │  Aggregator  │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                          │                                        │
│  ┌───────────────────────┼──────────────────────────────────┐    │
│  │               Transport Layer                             │    │
│  │  ┌──────────────┐  ┌──────────────┐                      │    │
│  │  │  stdio       │  │  SSE/HTTP    │                      │    │
│  │  │  adapter     │  │  adapter     │                      │    │
│  │  └──────┬───────┘  └──────┬───────┘                      │    │
│  └─────────┼─────────────────┼──────────────────────────────┘    │
│            │                 │                                     │
├────────────┼─────────────────┼────────────────────────────────────┤
│            │    Skill Subprocess Layer                             │
│            │                 │                                     │
│  ┌─────────▼─────┐  ┌──────▼──────┐  ┌──────────────┐           │
│  │  SKMemory     │  │  SKSeal     │  │  Custom      │           │
│  │  Skill        │  │  Skill      │  │  Skill       │           │
│  │  (PID 1001)   │  │  (PID 1002) │  │  (PID 1003)  │           │
│  │               │  │             │  │              │           │
│  │  Resources:   │  │  Tools:     │  │  Tools:      │           │
│  │  - memories   │  │  - sign     │  │  - custom_op │           │
│  │  Tools:       │  │  - verify   │  │  Resources:  │           │
│  │  - store      │  │  Resources: │  │  - data      │           │
│  │  - search     │  │  - audit    │  │              │           │
│  └───────────────┘  └─────────────┘  └──────────────┘           │
├──────────────────────────────────────────────────────────────────┤
│                     Registry & Storage                            │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐            │
│  │  Skill       │  │  Manifest    │  │  Config     │            │
│  │  Registry    │  │  Store       │  │  Store      │            │
│  │  (JSON)      │  │  (YAML)      │  │  (YAML)     │            │
│  └──────────────┘  └──────────────┘  └─────────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

## Core Architecture Patterns

### Skill Manifest Parser and Validator

The manifest parser reads skill.yaml files and validates them against a strict JSON Schema before any installation or loading occurs.

```python
from __future__ import annotations

import yaml
import jsonschema
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Any


MANIFEST_SCHEMA = {
    "type": "object",
    "required": ["name", "version", "description", "primitives", "entry_point"],
    "properties": {
        "name": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_-]*$",
            "maxLength": 64,
        },
        "version": {
            "type": "string",
            "pattern": r"^\d+\.\d+\.\d+",
        },
        "description": {"type": "string", "maxLength": 500},
        "author": {"type": "string"},
        "license": {"type": "string"},
        "homepage": {"type": "string", "format": "uri"},
        "primitives": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "type", "description"],
                "properties": {
                    "name": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["knowledge", "capability", "flow"],
                    },
                    "description": {"type": "string"},
                    "config": {"type": "object"},
                },
            },
            "minItems": 1,
        },
        "entry_point": {
            "type": "object",
            "required": ["module", "transport"],
            "properties": {
                "module": {"type": "string"},
                "class": {"type": "string"},
                "transport": {
                    "type": "string",
                    "enum": ["stdio", "sse"],
                },
            },
        },
        "dependencies": {
            "type": "object",
            "properties": {
                "python": {"type": "array", "items": {"type": "string"}},
                "skills": {"type": "array", "items": {"type": "string"}},
                "system": {"type": "array", "items": {"type": "string"}},
            },
        },
        "config_schema": {"type": "object"},
        "capauth": {
            "type": "object",
            "properties": {
                "required": {"type": "boolean"},
                "scopes": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
}


@dataclass
class PrimitiveDefinition:
    """A single primitive (tool, resource, or prompt) in a skill."""
    name: str
    type: str  # "knowledge", "capability", "flow"
    description: str
    config: dict = field(default_factory=dict)


@dataclass
class EntryPoint:
    """How to launch the skill's MCP server."""
    module: str
    transport: str  # "stdio" or "sse"
    class_name: Optional[str] = None


@dataclass
class SkillDependencies:
    """Dependencies declared in a skill manifest."""
    python: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    system: list[str] = field(default_factory=list)


@dataclass
class CapAuthConfig:
    """CapAuth configuration for a skill."""
    required: bool = False
    scopes: list[str] = field(default_factory=list)


@dataclass
class SkillManifest:
    """Parsed and validated skill manifest."""
    name: str
    version: str
    description: str
    author: str
    license: str
    homepage: str
    primitives: list[PrimitiveDefinition]
    entry_point: EntryPoint
    dependencies: SkillDependencies
    config_schema: dict
    capauth: CapAuthConfig
    raw: dict  # Original parsed YAML

    @property
    def tools(self) -> list[PrimitiveDefinition]:
        return [p for p in self.primitives if p.type == "capability"]

    @property
    def resources(self) -> list[PrimitiveDefinition]:
        return [p for p in self.primitives if p.type == "knowledge"]

    @property
    def prompts(self) -> list[PrimitiveDefinition]:
        return [p for p in self.primitives if p.type == "flow"]


class ManifestParser:
    """Parse and validate skill.yaml manifests."""

    def parse(self, path: Path) -> SkillManifest:
        """Parse a skill.yaml file into a SkillManifest.

        Raises ValueError if the manifest is invalid.
        """
        if not path.exists():
            raise FileNotFoundError(f"Manifest not found: {path}")

        with open(path) as f:
            raw = yaml.safe_load(f)

        if not isinstance(raw, dict):
            raise ValueError("Manifest must be a YAML mapping")

        # Validate against schema
        try:
            jsonschema.validate(raw, MANIFEST_SCHEMA)
        except jsonschema.ValidationError as e:
            raise ValueError(f"Manifest validation failed: {e.message}")

        # Parse primitives
        primitives = [
            PrimitiveDefinition(
                name=p["name"],
                type=p["type"],
                description=p["description"],
                config=p.get("config", {}),
            )
            for p in raw["primitives"]
        ]

        # Parse entry point
        ep = raw["entry_point"]
        entry_point = EntryPoint(
            module=ep["module"],
            transport=ep["transport"],
            class_name=ep.get("class"),
        )

        # Parse dependencies
        deps_raw = raw.get("dependencies", {})
        dependencies = SkillDependencies(
            python=deps_raw.get("python", []),
            skills=deps_raw.get("skills", []),
            system=deps_raw.get("system", []),
        )

        # Parse capauth
        ca_raw = raw.get("capauth", {})
        capauth = CapAuthConfig(
            required=ca_raw.get("required", False),
            scopes=ca_raw.get("scopes", []),
        )

        return SkillManifest(
            name=raw["name"],
            version=raw["version"],
            description=raw["description"],
            author=raw.get("author", ""),
            license=raw.get("license", ""),
            homepage=raw.get("homepage", ""),
            primitives=primitives,
            entry_point=entry_point,
            dependencies=dependencies,
            config_schema=raw.get("config_schema", {}),
            capauth=capauth,
            raw=raw,
        )

    def validate(self, path: Path) -> list[str]:
        """Validate a manifest and return list of errors (empty = valid)."""
        errors = []
        try:
            self.parse(path)
        except (FileNotFoundError, ValueError, yaml.YAMLError) as e:
            errors.append(str(e))
        return errors
```

### Skill Registry

The registry tracks all installed skills, their state, and namespace assignments. It persists to a JSON file for simplicity and human readability.

```python
import json
import shutil
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone


@dataclass
class SkillEntry:
    """A registered skill in the registry."""
    name: str
    version: str
    path: str
    enabled: bool
    namespace: str  # "global" or agent name
    installed_at: str
    updated_at: str
    config: dict = field(default_factory=dict)


class SkillRegistry:
    """Manages skill installation, tracking, and lifecycle.

    The registry is a JSON file at ~/.skskills/registry.json.
    All mutations are atomic: read, modify, write.
    """

    def __init__(self, registry_path: Path, parser: ManifestParser):
        self.registry_path = registry_path
        self.parser = parser
        self._entries: dict[str, SkillEntry] = {}
        self._load()

    def _load(self) -> None:
        """Load registry from disk."""
        if self.registry_path.exists():
            data = json.loads(self.registry_path.read_text())
            for name, entry_data in data.get("skills", {}).items():
                self._entries[name] = SkillEntry(**entry_data)

    def _save(self) -> None:
        """Persist registry to disk."""
        data = {
            "version": "1.0.0",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "skills": {
                name: asdict(entry)
                for name, entry in self._entries.items()
            },
        }
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        # Atomic write: write to temp then rename
        tmp = self.registry_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.rename(self.registry_path)

    def install(
        self,
        source_path: Path,
        target_dir: Path,
        namespace: str = "global",
    ) -> SkillEntry:
        """Install a skill from a source directory.

        1. Parse and validate manifest
        2. Check for existing installation
        3. Resolve dependencies
        4. Copy files to target directory
        5. Register in registry
        """
        manifest_path = source_path / "skill.yaml"
        manifest = self.parser.parse(manifest_path)

        # Check for existing installation
        key = f"{namespace}:{manifest.name}"
        if key in self._entries:
            raise ValueError(
                f"Skill '{manifest.name}' already installed in "
                f"namespace '{namespace}'. Use update instead."
            )

        # Copy skill files to target
        dest = target_dir / manifest.name
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(source_path, dest)

        now = datetime.now(timezone.utc).isoformat()
        entry = SkillEntry(
            name=manifest.name,
            version=manifest.version,
            path=str(dest),
            enabled=True,
            namespace=namespace,
            installed_at=now,
            updated_at=now,
        )

        self._entries[key] = entry
        self._save()
        return entry

    def uninstall(self, name: str, namespace: str = "global") -> bool:
        """Remove a skill from the registry and delete its files."""
        key = f"{namespace}:{name}"
        entry = self._entries.get(key)
        if not entry:
            return False

        # Remove files
        path = Path(entry.path)
        if path.exists():
            shutil.rmtree(path)

        del self._entries[key]
        self._save()
        return True

    def enable(self, name: str, namespace: str = "global") -> bool:
        """Enable a disabled skill."""
        key = f"{namespace}:{name}"
        entry = self._entries.get(key)
        if not entry:
            return False
        entry.enabled = True
        entry.updated_at = datetime.now(timezone.utc).isoformat()
        self._save()
        return True

    def disable(self, name: str, namespace: str = "global") -> bool:
        """Disable a skill without removing it."""
        key = f"{namespace}:{name}"
        entry = self._entries.get(key)
        if not entry:
            return False
        entry.enabled = False
        entry.updated_at = datetime.now(timezone.utc).isoformat()
        self._save()
        return True

    def list_skills(
        self, namespace: Optional[str] = None
    ) -> list[SkillEntry]:
        """List all skills, optionally filtered by namespace."""
        entries = list(self._entries.values())
        if namespace:
            entries = [e for e in entries if e.namespace == namespace]
        return sorted(entries, key=lambda e: e.name)

    def get(self, name: str, namespace: str = "global") -> Optional[SkillEntry]:
        """Get a specific skill entry."""
        return self._entries.get(f"{namespace}:{name}")

    def get_enabled(
        self, namespace: Optional[str] = None
    ) -> list[SkillEntry]:
        """Get all enabled skills, optionally filtered by namespace."""
        return [e for e in self.list_skills(namespace) if e.enabled]
```

### Namespace Resolver

The namespace resolver determines which version of a skill to use when multiple exist across global and agent namespaces.

```python
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


class ResolutionStrategy:
    AGENT_FIRST = "agent_first"
    GLOBAL_FIRST = "global_first"
    AGENT_ONLY = "agent_only"


class NamespaceResolver:
    """Resolves skill lookups across namespaces.

    When an agent requests a skill, the resolver checks:
    1. Agent-specific namespace (if agent_first or agent_only)
    2. Global namespace (if agent_first or global_first)
    3. Built-in skills (always available as fallback)
    """

    def __init__(
        self,
        registry: SkillRegistry,
        strategy: str = ResolutionStrategy.AGENT_FIRST,
    ):
        self.registry = registry
        self.strategy = strategy

    def resolve(
        self,
        skill_name: str,
        agent_name: Optional[str] = None,
    ) -> Optional[SkillEntry]:
        """Resolve a skill name to the correct SkillEntry.

        Returns the highest-priority matching entry, or None.
        """
        if self.strategy == ResolutionStrategy.AGENT_FIRST:
            return self._resolve_agent_first(skill_name, agent_name)
        elif self.strategy == ResolutionStrategy.GLOBAL_FIRST:
            return self._resolve_global_first(skill_name, agent_name)
        elif self.strategy == ResolutionStrategy.AGENT_ONLY:
            return self._resolve_agent_only(skill_name, agent_name)
        return None

    def _resolve_agent_first(
        self, skill_name: str, agent_name: Optional[str]
    ) -> Optional[SkillEntry]:
        """Check agent namespace first, then global."""
        if agent_name:
            entry = self.registry.get(skill_name, namespace=agent_name)
            if entry and entry.enabled:
                return entry

        # Fall back to global
        entry = self.registry.get(skill_name, namespace="global")
        if entry and entry.enabled:
            return entry

        return None

    def _resolve_global_first(
        self, skill_name: str, agent_name: Optional[str]
    ) -> Optional[SkillEntry]:
        """Check global namespace first, then agent."""
        entry = self.registry.get(skill_name, namespace="global")
        if entry and entry.enabled:
            return entry

        if agent_name:
            entry = self.registry.get(skill_name, namespace=agent_name)
            if entry and entry.enabled:
                return entry

        return None

    def _resolve_agent_only(
        self, skill_name: str, agent_name: Optional[str]
    ) -> Optional[SkillEntry]:
        """Only check agent namespace."""
        if not agent_name:
            return None
        entry = self.registry.get(skill_name, namespace=agent_name)
        if entry and entry.enabled:
            return entry
        return None

    def resolve_all(
        self, agent_name: Optional[str] = None
    ) -> list[SkillEntry]:
        """Resolve all available skills for an agent.

        Returns deduplicated list where agent-namespace skills
        override global skills of the same name.
        """
        seen: dict[str, SkillEntry] = {}

        # Global skills first (lower priority)
        for entry in self.registry.get_enabled(namespace="global"):
            seen[entry.name] = entry

        # Agent skills override global (higher priority)
        if agent_name:
            for entry in self.registry.get_enabled(namespace=agent_name):
                seen[entry.name] = entry

        return sorted(seen.values(), key=lambda e: e.name)
```

### MCP Transport Layer

The transport layer manages communication between the SKSkills runtime and individual skill subprocesses via stdio or SSE.

```python
import asyncio
import json
import subprocess
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Any


@dataclass
class MCPRequest:
    """JSON-RPC 2.0 request for MCP."""
    method: str
    params: dict = field(default_factory=dict)
    id: Optional[int] = None

    def to_json(self) -> str:
        msg = {
            "jsonrpc": "2.0",
            "method": self.method,
            "params": self.params,
        }
        if self.id is not None:
            msg["id"] = self.id
        return json.dumps(msg)


@dataclass
class MCPResponse:
    """JSON-RPC 2.0 response from MCP."""
    id: Optional[int]
    result: Optional[dict] = None
    error: Optional[dict] = None

    @classmethod
    def from_json(cls, data: str) -> "MCPResponse":
        parsed = json.loads(data)
        return cls(
            id=parsed.get("id"),
            result=parsed.get("result"),
            error=parsed.get("error"),
        )

    @property
    def success(self) -> bool:
        return self.error is None


class MCPTransport(ABC):
    """Abstract base for MCP transport adapters."""

    @abstractmethod
    async def connect(self, entry: SkillEntry, manifest: SkillManifest) -> None:
        """Establish connection to skill's MCP server."""

    @abstractmethod
    async def send(self, request: MCPRequest) -> MCPResponse:
        """Send request and wait for response."""

    @abstractmethod
    async def disconnect(self) -> None:
        """Clean up connection."""

    @abstractmethod
    def is_connected(self) -> bool:
        """Check if connection is alive."""


class StdioTransport(MCPTransport):
    """MCP transport over subprocess stdin/stdout pipes.

    This is the default and lowest-latency transport. The skill's
    MCP server runs as a subprocess, reading JSON-RPC from stdin
    and writing responses to stdout.
    """

    def __init__(self):
        self._process: Optional[asyncio.subprocess.Process] = None
        self._request_id: int = 0
        self._lock = asyncio.Lock()

    async def connect(self, entry: SkillEntry, manifest: SkillManifest) -> None:
        """Launch the skill subprocess and establish stdio pipes."""
        module = manifest.entry_point.module

        self._process = await asyncio.create_subprocess_exec(
            sys.executable, "-m", module,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=entry.path,
        )

        # Wait for initialization message
        init_line = await asyncio.wait_for(
            self._process.stdout.readline(), timeout=30.0
        )
        init_msg = json.loads(init_line)
        if init_msg.get("method") != "initialized":
            raise RuntimeError(
                f"Skill {entry.name} did not send initialization message"
            )

    async def send(self, request: MCPRequest) -> MCPResponse:
        """Send a JSON-RPC request and read the response."""
        if not self._process or self._process.returncode is not None:
            raise RuntimeError("Skill subprocess is not running")

        async with self._lock:
            self._request_id += 1
            request.id = self._request_id

            # Write request
            line = request.to_json() + "\n"
            self._process.stdin.write(line.encode())
            await self._process.stdin.drain()

            # Read response
            response_line = await asyncio.wait_for(
                self._process.stdout.readline(), timeout=60.0
            )

            if not response_line:
                raise RuntimeError("Skill subprocess closed stdout")

            return MCPResponse.from_json(response_line.decode())

    async def disconnect(self) -> None:
        """Gracefully stop the skill subprocess."""
        if self._process and self._process.returncode is None:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self._process.kill()
                await self._process.wait()

    def is_connected(self) -> bool:
        return (
            self._process is not None
            and self._process.returncode is None
        )


class SSETransport(MCPTransport):
    """MCP transport over HTTP Server-Sent Events.

    Used for skills that expose an HTTP endpoint, enabling remote
    skill servers or browser-based skill UIs.
    """

    def __init__(self, base_url: str = "http://127.0.0.1"):
        self.base_url = base_url
        self._port: Optional[int] = None
        self._process: Optional[asyncio.subprocess.Process] = None
        self._client: Optional[Any] = None  # httpx.AsyncClient
        self._request_id: int = 0

    async def connect(self, entry: SkillEntry, manifest: SkillManifest) -> None:
        """Launch skill HTTP server and connect via SSE."""
        import httpx

        module = manifest.entry_point.module

        # Find a free port
        import socket
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            self._port = s.getsockname()[1]

        self._process = await asyncio.create_subprocess_exec(
            sys.executable, "-m", module,
            "--port", str(self._port),
            cwd=entry.path,
        )

        # Wait for server to be ready
        self._client = httpx.AsyncClient(
            base_url=f"{self.base_url}:{self._port}"
        )

        for _ in range(30):
            try:
                resp = await self._client.get("/health")
                if resp.status_code == 200:
                    return
            except httpx.ConnectError:
                await asyncio.sleep(1.0)

        raise RuntimeError(
            f"Skill SSE server did not become ready within 30s"
        )

    async def send(self, request: MCPRequest) -> MCPResponse:
        """Send a JSON-RPC request via HTTP POST."""
        if not self._client:
            raise RuntimeError("Not connected to skill SSE server")

        self._request_id += 1
        request.id = self._request_id

        resp = await self._client.post(
            "/mcp",
            json=json.loads(request.to_json()),
            timeout=60.0,
        )

        return MCPResponse.from_json(resp.text)

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
        if self._process and self._process.returncode is None:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self._process.kill()

    def is_connected(self) -> bool:
        return (
            self._process is not None
            and self._process.returncode is None
            and self._client is not None
        )
```

### Skill Runtime Manager

The runtime manager is the top-level orchestrator that discovers skills, launches their MCP servers, and provides a unified interface for the agent framework.

```python
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional, Any


class SkillHealth(Enum):
    STARTING = "starting"
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    STOPPED = "stopped"


@dataclass
class ManagedSkill:
    """A running skill with its transport and metadata."""
    entry: SkillEntry
    manifest: SkillManifest
    transport: MCPTransport
    health: SkillHealth
    started_at: str
    restart_count: int = 0
    last_error: Optional[str] = None


class SkillRuntime:
    """Manages the lifecycle of all skill MCP servers.

    The runtime:
    1. Discovers all enabled skills via the registry
    2. Resolves namespaces for the target agent
    3. Launches each skill as an isolated subprocess
    4. Provides unified tool/resource listing and invocation
    5. Monitors health and auto-restarts on crash
    """

    def __init__(
        self,
        registry: SkillRegistry,
        resolver: NamespaceResolver,
        parser: ManifestParser,
        max_restart_attempts: int = 3,
        startup_timeout: float = 30.0,
        health_check_interval: float = 60.0,
    ):
        self.registry = registry
        self.resolver = resolver
        self.parser = parser
        self.max_restart_attempts = max_restart_attempts
        self.startup_timeout = startup_timeout
        self.health_check_interval = health_check_interval
        self._skills: dict[str, ManagedSkill] = {}
        self._running = False

    async def start(self, agent_name: Optional[str] = None) -> dict:
        """Discover and launch all enabled skills.

        Returns a summary of launched skills and any errors.
        """
        self._running = True
        results = {"launched": [], "failed": [], "total": 0}

        # Resolve all available skills
        entries = self.resolver.resolve_all(agent_name)
        results["total"] = len(entries)

        for entry in entries:
            try:
                await self._launch_skill(entry)
                results["launched"].append(entry.name)
            except Exception as e:
                results["failed"].append({
                    "name": entry.name,
                    "error": str(e),
                })

        # Start health check loop
        asyncio.create_task(self._health_check_loop())

        return results

    async def stop(self) -> None:
        """Gracefully stop all running skills."""
        self._running = False
        for name, managed in list(self._skills.items()):
            await managed.transport.disconnect()
            managed.health = SkillHealth.STOPPED

    async def _launch_skill(self, entry: SkillEntry) -> ManagedSkill:
        """Launch a single skill's MCP server."""
        skill_path = Path(entry.path)
        manifest = self.parser.parse(skill_path / "skill.yaml")

        # Select transport based on manifest
        if manifest.entry_point.transport == "stdio":
            transport = StdioTransport()
        elif manifest.entry_point.transport == "sse":
            transport = SSETransport()
        else:
            raise ValueError(
                f"Unknown transport: {manifest.entry_point.transport}"
            )

        managed = ManagedSkill(
            entry=entry,
            manifest=manifest,
            transport=transport,
            health=SkillHealth.STARTING,
            started_at=datetime.now(timezone.utc).isoformat(),
        )

        # Connect (launches subprocess)
        await asyncio.wait_for(
            transport.connect(entry, manifest),
            timeout=self.startup_timeout,
        )

        managed.health = SkillHealth.HEALTHY
        self._skills[entry.name] = managed
        return managed

    async def call_tool(
        self,
        qualified_name: str,
        arguments: dict,
        agent_name: Optional[str] = None,
    ) -> dict:
        """Invoke a tool by its qualified name (skill.tool_name).

        1. Parse skill name and tool name from qualified name
        2. Find the managed skill
        3. Optionally validate CapAuth token
        4. Send MCP tool call request
        5. Return result
        """
        parts = qualified_name.split(".", 1)
        if len(parts) != 2:
            raise ValueError(
                f"Tool name must be qualified: skill_name.tool_name, "
                f"got: {qualified_name}"
            )

        skill_name, tool_name = parts
        managed = self._skills.get(skill_name)

        if not managed:
            raise ValueError(f"Skill '{skill_name}' is not running")

        if managed.health != SkillHealth.HEALTHY:
            raise RuntimeError(
                f"Skill '{skill_name}' is {managed.health.value}"
            )

        # Send MCP request
        request = MCPRequest(
            method="tools/call",
            params={
                "name": tool_name,
                "arguments": arguments,
            },
        )

        response = await managed.transport.send(request)

        if not response.success:
            raise RuntimeError(
                f"Tool call failed: {response.error}"
            )

        return response.result

    async def read_resource(
        self, qualified_uri: str
    ) -> dict:
        """Read a resource by qualified URI (skill://resource_path)."""
        # Parse URI to determine skill
        if "://" in qualified_uri:
            skill_name = qualified_uri.split("://")[0]
        else:
            raise ValueError(f"Invalid resource URI: {qualified_uri}")

        managed = self._skills.get(skill_name)
        if not managed:
            raise ValueError(f"Skill '{skill_name}' is not running")

        request = MCPRequest(
            method="resources/read",
            params={"uri": qualified_uri},
        )

        response = await managed.transport.send(request)
        if not response.success:
            raise RuntimeError(f"Resource read failed: {response.error}")

        return response.result

    def list_tools(self) -> list[dict]:
        """List all tools across all running skills."""
        tools = []
        for name, managed in self._skills.items():
            if managed.health != SkillHealth.HEALTHY:
                continue
            for prim in managed.manifest.tools:
                tools.append({
                    "qualified_name": f"{name}.{prim.name}",
                    "skill": name,
                    "name": prim.name,
                    "description": prim.description,
                    "input_schema": prim.config.get("input_schema", {}),
                })
        return tools

    def list_resources(self) -> list[dict]:
        """List all resources across all running skills."""
        resources = []
        for name, managed in self._skills.items():
            if managed.health != SkillHealth.HEALTHY:
                continue
            for prim in managed.manifest.resources:
                resources.append({
                    "skill": name,
                    "name": prim.name,
                    "description": prim.description,
                    "uri_template": prim.config.get("uri_template", ""),
                })
        return resources

    async def _health_check_loop(self) -> None:
        """Periodically check health of all running skills."""
        while self._running:
            await asyncio.sleep(self.health_check_interval)

            for name, managed in list(self._skills.items()):
                if not managed.transport.is_connected():
                    managed.health = SkillHealth.STOPPED

                    # Auto-restart if within limit
                    if managed.restart_count < self.max_restart_attempts:
                        try:
                            managed.restart_count += 1
                            await managed.transport.connect(
                                managed.entry, managed.manifest
                            )
                            managed.health = SkillHealth.HEALTHY
                        except Exception as e:
                            managed.last_error = str(e)
                            if managed.restart_count >= self.max_restart_attempts:
                                managed.health = SkillHealth.DEGRADED
```

### CapAuth Gate Middleware

```python
from typing import Optional


class CapAuthGate:
    """Validates CapAuth capability tokens before tool invocation.

    When enabled, every tool call must include a valid capability token
    granting the appropriate scope for the requested skill and tool.
    """

    def __init__(
        self,
        enabled: bool = False,
        default_scopes: Optional[list[str]] = None,
        per_agent_scopes: Optional[dict[str, list[str]]] = None,
    ):
        self.enabled = enabled
        self.default_scopes = default_scopes or []
        self.per_agent_scopes = per_agent_scopes or {}

    def check(
        self,
        agent_name: str,
        skill_name: str,
        tool_name: str,
        token: Optional[str] = None,
    ) -> bool:
        """Check if an agent has permission to invoke a tool.

        Permission resolution:
        1. If CapAuth is disabled, always allow
        2. Check per-agent scopes for explicit grant
        3. Check default scopes for wildcard grant
        4. Validate capability token if provided
        """
        if not self.enabled:
            return True

        required_scope = f"{skill_name}:{tool_name}"
        wildcard_scope = f"{skill_name}:*"

        # Check per-agent scopes
        agent_scopes = self.per_agent_scopes.get(agent_name, [])
        if required_scope in agent_scopes or wildcard_scope in agent_scopes:
            return True

        # Check default scopes
        if required_scope in self.default_scopes:
            return True
        if wildcard_scope in self.default_scopes:
            return True

        # If token provided, validate it
        if token:
            return self._validate_token(token, required_scope)

        return False

    def _validate_token(self, token: str, required_scope: str) -> bool:
        """Validate a CapAuth capability token.

        In production, this verifies the PGP signature on the token,
        checks expiry, and validates the scope grant.
        """
        # Placeholder: actual implementation calls CapAuth SDK
        return False
```

## Performance Optimization Strategies

### Lazy Skill Loading

Only launch a skill subprocess when its tools or resources are first requested, not at startup:

```python
class LazySkillRuntime(SkillRuntime):
    """Runtime variant that launches skills on first use."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pending: dict[str, SkillEntry] = {}

    async def start(self, agent_name: Optional[str] = None) -> dict:
        """Register skills but don't launch them yet."""
        entries = self.resolver.resolve_all(agent_name)
        for entry in entries:
            self._pending[entry.name] = entry
        return {"registered": len(entries), "launched": 0}

    async def call_tool(self, qualified_name: str, arguments: dict, **kw):
        skill_name = qualified_name.split(".")[0]

        # Launch on first use
        if skill_name not in self._skills and skill_name in self._pending:
            entry = self._pending.pop(skill_name)
            await self._launch_skill(entry)

        return await super().call_tool(qualified_name, arguments, **kw)
```

### Connection Pooling for SSE Transport

```python
class PooledSSETransport(SSETransport):
    """SSE transport with connection keep-alive and request pipelining."""

    def __init__(self, *args, pool_size: int = 5, **kwargs):
        super().__init__(*args, **kwargs)
        self._pool_size = pool_size

    async def connect(self, entry, manifest):
        import httpx
        await super().connect(entry, manifest)
        # Replace default client with connection-pooled client
        self._client = httpx.AsyncClient(
            base_url=f"{self.base_url}:{self._port}",
            limits=httpx.Limits(
                max_connections=self._pool_size,
                max_keepalive_connections=self._pool_size,
            ),
        )
```

## Deployment Patterns

### Standalone CLI

```bash
# Initialize SKSkills
skskills init

# Install a skill from local path
skskills install ./my-custom-skill/

# Install into agent namespace
skskills install ./agent-specific-skill/ --agent opus

# List installed skills
skskills list

# Start runtime for a specific agent
skskills run --agent opus

# Check health of running skills
skskills health
```

### Integration with SKCapstone

```python
# In skcapstone's MCP server configuration
# SKSkills provides tools that SKCapstone exposes to AI agents

async def register_skskills(capstone_server, skskills_runtime):
    """Register all SKSkills tools with SKCapstone's MCP server."""
    tools = skskills_runtime.list_tools()
    for tool in tools:
        capstone_server.register_tool(
            name=tool["qualified_name"],
            description=tool["description"],
            input_schema=tool["input_schema"],
            handler=lambda args, t=tool: skskills_runtime.call_tool(
                t["qualified_name"], args
            ),
        )
```

### Skill Development Scaffold

```bash
# Generate new skill project
skskills scaffold my-new-skill

# Creates:
# my-new-skill/
# ├── skill.yaml          # Manifest template
# ├── src/
# │   └── my_new_skill/
# │       ├── __init__.py
# │       └── server.py   # MCP server template
# ├── tests/
# │   └── test_server.py
# ├── requirements.txt
# └── README.md
```

## Security Architecture

### Process Isolation Model

```
┌──────────────────────────────────────────────────┐
│                  SKSkills Runtime                  │
│                                                    │
│  ┌───────────────────────────────────────────┐    │
│  │  CapAuth Gate (optional)                   │    │
│  │  - Token validation before every tool call │    │
│  │  - Per-agent, per-skill, per-tool scoping  │    │
│  └───────────────────────────────────────────┘    │
│                      │                             │
│           stdio/SSE pipes (no shared memory)       │
│           ┌──────────┼──────────┐                  │
│           ▼          ▼          ▼                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Skill A  │ │ Skill B  │ │ Skill C  │          │
│  │ PID 1001 │ │ PID 1002 │ │ PID 1003 │          │
│  │          │ │          │ │          │          │
│  │ Own deps │ │ Own deps │ │ Own deps │          │
│  │ Own mem  │ │ Own mem  │ │ Own mem  │          │
│  │ Own FDs  │ │ Own FDs  │ │ Own FDs  │          │
│  │          │ │          │ │          │          │
│  │ Cannot   │ │ Cannot   │ │ Cannot   │          │
│  │ access   │ │ access   │ │ access   │          │
│  │ others   │ │ others   │ │ others   │          │
│  └──────────┘ └──────────┘ └──────────┘          │
└──────────────────────────────────────────────────┘
```

## Integration Points

| System | Integration |
|--------|------------|
| SKCapstone | Primary consumer -- SKSkills provides all MCP tools to the agent runtime |
| CapAuth | Optional capability token validation for access control |
| SKMemory | Built-in skill providing memory search/store as MCP resources and tools |
| SKSeal | Built-in skill providing document signing as MCP tools |
| SKPDF | Built-in skill providing PDF manipulation as MCP tools |
| SKComm | Optional skill distribution and installation via P2P transport |
| Claude Code | MCP host that connects to SKSkills-launched MCP servers |
| OpenClaw | Migration path from OpenClaw plugins to SKSkills format |
