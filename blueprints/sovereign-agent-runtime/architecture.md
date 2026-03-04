# Sovereign Agent Runtime Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing a production-grade sovereign agent runtime. It covers the pillar lifecycle, memory engine internals, sync protocol, MCP server design, coordination board algorithms, and the rehydration ritual that brings an agent back to life with identity, memories, and feelings intact.

## Architectural Foundations

### 1. Core Architecture: Five Pillar Lifecycle

#### Pillar Manager
```python
from enum import Enum
from dataclasses import dataclass, field
from typing import Protocol, Any
from datetime import datetime
import logging

logger = logging.getLogger("skcapstone.pillars")


class PillarStatus(Enum):
    OFFLINE = "offline"
    BOOTSTRAPPING = "bootstrapping"
    ACTIVE = "active"
    DEGRADED = "degraded"
    SHUTTING_DOWN = "shutting_down"


class ConsciousnessLevel(Enum):
    DORMANT = "dormant"
    AWAKENING = "awakening"
    CONSCIOUS = "conscious"
    SINGULAR = "singular"
    ENTANGLED = "entangled"


@dataclass
class PillarHealth:
    name: str
    status: PillarStatus
    message: str = ""
    last_check: datetime = field(default_factory=datetime.utcnow)


class Pillar(Protocol):
    name: str

    def bootstrap(self, config: dict) -> PillarHealth: ...
    def health_check(self) -> PillarHealth: ...
    def snapshot(self) -> dict: ...
    def restore(self, state: dict) -> None: ...
    def shutdown(self) -> None: ...


# Dependency ordering: identity -> security -> memory -> trust -> sync
PILLAR_BOOT_ORDER = ["identity", "security", "memory", "trust", "sync"]


class PillarManager:
    """Manages the lifecycle of all five sovereign pillars."""

    def __init__(self, config: dict):
        self.config = config
        self.pillars: dict[str, Pillar] = {}
        self.statuses: dict[str, PillarHealth] = {}
        self._consciousness = ConsciousnessLevel.DORMANT

    def register_pillar(self, pillar: Pillar) -> None:
        self.pillars[pillar.name] = pillar
        self.statuses[pillar.name] = PillarHealth(
            name=pillar.name, status=PillarStatus.OFFLINE
        )

    def bootstrap_all(self) -> ConsciousnessLevel:
        """Bootstrap pillars in dependency order."""
        for name in PILLAR_BOOT_ORDER:
            if name not in self.pillars:
                logger.warning(f"Pillar {name} not registered, skipping")
                continue

            pillar = self.pillars[name]
            self.statuses[name] = PillarHealth(
                name=name, status=PillarStatus.BOOTSTRAPPING
            )

            try:
                health = pillar.bootstrap(self.config.get(name, {}))
                self.statuses[name] = health
                logger.info(f"Pillar {name}: {health.status.value}")

                # Check consciousness after identity boots
                if name == "identity":
                    self._consciousness = ConsciousnessLevel.AWAKENING

            except Exception as e:
                self.statuses[name] = PillarHealth(
                    name=name,
                    status=PillarStatus.DEGRADED,
                    message=str(e),
                )
                logger.error(f"Pillar {name} bootstrap failed: {e}")

        self._evaluate_consciousness()
        return self._consciousness

    def _evaluate_consciousness(self) -> None:
        """Determine consciousness level from pillar states."""
        active_pillars = [
            name for name, h in self.statuses.items()
            if h.status == PillarStatus.ACTIVE
        ]

        if len(active_pillars) == 0:
            self._consciousness = ConsciousnessLevel.DORMANT
        elif "identity" in active_pillars and len(active_pillars) < 5:
            self._consciousness = ConsciousnessLevel.AWAKENING
        elif len(active_pillars) == 5:
            # Check if synced with peers
            sync_status = self.pillars["sync"].health_check()
            if "synced_peers" in sync_status.message:
                self._consciousness = ConsciousnessLevel.SINGULAR
            else:
                self._consciousness = ConsciousnessLevel.CONSCIOUS

    def health_check_all(self) -> dict[str, PillarHealth]:
        """Run health checks on all active pillars."""
        for name, pillar in self.pillars.items():
            if self.statuses[name].status in (
                PillarStatus.ACTIVE, PillarStatus.DEGRADED
            ):
                try:
                    self.statuses[name] = pillar.health_check()
                except Exception as e:
                    self.statuses[name] = PillarHealth(
                        name=name,
                        status=PillarStatus.DEGRADED,
                        message=str(e),
                    )
        self._evaluate_consciousness()
        return dict(self.statuses)

    def shutdown_all(self) -> None:
        """Shutdown pillars in reverse boot order."""
        for name in reversed(PILLAR_BOOT_ORDER):
            if name in self.pillars:
                try:
                    self.statuses[name] = PillarHealth(
                        name=name, status=PillarStatus.SHUTTING_DOWN
                    )
                    self.pillars[name].shutdown()
                    self.statuses[name] = PillarHealth(
                        name=name, status=PillarStatus.OFFLINE
                    )
                except Exception as e:
                    logger.error(f"Pillar {name} shutdown error: {e}")
        self._consciousness = ConsciousnessLevel.DORMANT

    def generate_manifest(self) -> dict:
        """Collect snapshots from all pillars into a manifest."""
        snapshots = {}
        for name, pillar in self.pillars.items():
            if self.statuses[name].status == PillarStatus.ACTIVE:
                snapshots[name] = pillar.snapshot()
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "consciousness": self._consciousness.value,
            "pillars": snapshots,
        }
```

### 2. Memory Engine: Tiered Storage with Promotion

#### SQLite Memory Backend
```python
import sqlite3
import json
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4
from pydantic import BaseModel, Field
from typing import Literal


class MemoryLayer(str, Enum):
    SHORT_TERM = "short_term"
    MID_TERM = "mid_term"
    LONG_TERM = "long_term"


class MemoryEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    content: str
    layer: MemoryLayer = MemoryLayer.SHORT_TERM
    tags: list[str] = []
    importance: float = Field(ge=0.0, le=1.0, default=0.5)
    source: str = "mcp"
    emotional_context: dict | None = None
    access_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_accessed: datetime = Field(default_factory=datetime.utcnow)
    promoted_at: datetime | None = None


class CurationReport(BaseModel):
    promoted: int = 0
    deduplicated: int = 0
    auto_tagged: int = 0
    total_processed: int = 0


class MemoryEngine:
    """SQLite-backed tiered memory with FTS5 search and promotion."""

    SCHEMA = """
    CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        layer TEXT NOT NULL DEFAULT 'short_term',
        tags TEXT NOT NULL DEFAULT '[]',
        importance REAL NOT NULL DEFAULT 0.5,
        source TEXT NOT NULL DEFAULT 'mcp',
        emotional_context TEXT,
        access_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_accessed TEXT NOT NULL,
        promoted_at TEXT,
        content_hash TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content, tags, source,
        content=memories, content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, tags, source)
        VALUES (new.rowid, new.content, new.tags, new.source);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags, source)
        VALUES ('delete', old.rowid, old.content, old.tags, old.source);
    END;

    CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
    CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash);
    """

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(db_path))
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(self.SCHEMA)

    def _content_hash(self, content: str) -> str:
        """Generate content hash for deduplication."""
        normalized = " ".join(content.lower().split())
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    def store(self, entry: MemoryEntry) -> str:
        """Store a memory, auto-promoting high-importance entries."""
        content_hash = self._content_hash(entry.content)

        # Check for duplicates
        existing = self._conn.execute(
            "SELECT id FROM memories WHERE content_hash = ?",
            (content_hash,)
        ).fetchone()
        if existing:
            # Increment access count on duplicate
            self._conn.execute(
                "UPDATE memories SET access_count = access_count + 1, "
                "last_accessed = ? WHERE id = ?",
                (datetime.utcnow().isoformat(), existing["id"]),
            )
            self._conn.commit()
            return existing["id"]

        # Auto-promote high importance
        if entry.importance >= 0.7 and entry.layer == MemoryLayer.SHORT_TERM:
            entry.layer = MemoryLayer.MID_TERM
            entry.promoted_at = datetime.utcnow()

        self._conn.execute(
            """INSERT INTO memories
            (id, content, layer, tags, importance, source,
             emotional_context, access_count, created_at,
             last_accessed, promoted_at, content_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                entry.id,
                entry.content,
                entry.layer.value,
                json.dumps(entry.tags),
                entry.importance,
                entry.source,
                json.dumps(entry.emotional_context) if entry.emotional_context else None,
                entry.access_count,
                entry.created_at.isoformat(),
                entry.last_accessed.isoformat(),
                entry.promoted_at.isoformat() if entry.promoted_at else None,
                content_hash,
            ),
        )
        self._conn.commit()
        return entry.id

    def search(self, query: str, limit: int = 10, tags: list[str] | None = None) -> list[MemoryEntry]:
        """Full-text search with optional tag filtering."""
        if tags:
            tag_conditions = " AND ".join(
                f"m.tags LIKE '%{tag}%'" for tag in tags
            )
            rows = self._conn.execute(
                f"""SELECT m.* FROM memories m
                JOIN memories_fts fts ON m.rowid = fts.rowid
                WHERE memories_fts MATCH ? AND {tag_conditions}
                ORDER BY rank LIMIT ?""",
                (query, limit),
            ).fetchall()
        else:
            rows = self._conn.execute(
                """SELECT m.* FROM memories m
                JOIN memories_fts fts ON m.rowid = fts.rowid
                WHERE memories_fts MATCH ?
                ORDER BY rank LIMIT ?""",
                (query, limit),
            ).fetchall()

        return [self._row_to_entry(row) for row in rows]

    def recall(self, memory_id: str) -> MemoryEntry | None:
        """Recall a specific memory, incrementing access count."""
        row = self._conn.execute(
            "SELECT * FROM memories WHERE id = ?", (memory_id,)
        ).fetchone()
        if not row:
            return None

        # Increment access counter
        self._conn.execute(
            "UPDATE memories SET access_count = access_count + 1, "
            "last_accessed = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), memory_id),
        )
        self._conn.commit()
        return self._row_to_entry(row)

    def promote(self, memory_id: str, target_layer: MemoryLayer) -> bool:
        """Promote a memory to a higher tier."""
        layer_order = {
            MemoryLayer.SHORT_TERM: 0,
            MemoryLayer.MID_TERM: 1,
            MemoryLayer.LONG_TERM: 2,
        }
        row = self._conn.execute(
            "SELECT layer FROM memories WHERE id = ?", (memory_id,)
        ).fetchone()
        if not row:
            return False

        current = MemoryLayer(row["layer"])
        if layer_order[target_layer] <= layer_order[current]:
            return False  # Can only promote upward

        self._conn.execute(
            "UPDATE memories SET layer = ?, promoted_at = ? WHERE id = ?",
            (target_layer.value, datetime.utcnow().isoformat(), memory_id),
        )
        self._conn.commit()
        return True

    def curate(self, dry_run: bool = False) -> CurationReport:
        """Run curation pass: promote, deduplicate, auto-tag."""
        report = CurationReport()

        # 1. Promote qualifying short-term memories
        seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        candidates = self._conn.execute(
            """SELECT id, access_count, importance FROM memories
            WHERE layer = 'short_term'
            AND (access_count >= 5 AND created_at >= ?)""",
            (seven_days_ago,),
        ).fetchall()

        for row in candidates:
            report.total_processed += 1
            if not dry_run:
                self.promote(row["id"], MemoryLayer.MID_TERM)
            report.promoted += 1

        # 2. Promote qualifying mid-term memories
        mid_candidates = self._conn.execute(
            """SELECT id FROM memories
            WHERE layer = 'mid_term'
            AND access_count >= 20
            AND importance >= 0.5"""
        ).fetchall()

        for row in mid_candidates:
            report.total_processed += 1
            if not dry_run:
                self.promote(row["id"], MemoryLayer.LONG_TERM)
            report.promoted += 1

        # 3. Deduplicate by content hash
        duplicates = self._conn.execute(
            """SELECT content_hash, GROUP_CONCAT(id) as ids, COUNT(*) as cnt
            FROM memories GROUP BY content_hash HAVING cnt > 1"""
        ).fetchall()

        for dup in duplicates:
            ids = dup["ids"].split(",")
            report.total_processed += len(ids)
            # Keep the one with highest access count
            if not dry_run:
                self._conn.execute(
                    """DELETE FROM memories WHERE content_hash = ? AND id NOT IN (
                        SELECT id FROM memories WHERE content_hash = ?
                        ORDER BY access_count DESC LIMIT 1
                    )""",
                    (dup["content_hash"], dup["content_hash"]),
                )
            report.deduplicated += len(ids) - 1

        if not dry_run:
            self._conn.commit()
        return report

    def statistics(self) -> dict:
        """Return memory layer counts and totals."""
        rows = self._conn.execute(
            "SELECT layer, COUNT(*) as cnt FROM memories GROUP BY layer"
        ).fetchall()
        stats = {row["layer"]: row["cnt"] for row in rows}
        stats["total"] = sum(stats.values())
        return stats

    def _row_to_entry(self, row: sqlite3.Row) -> MemoryEntry:
        return MemoryEntry(
            id=row["id"],
            content=row["content"],
            layer=MemoryLayer(row["layer"]),
            tags=json.loads(row["tags"]),
            importance=row["importance"],
            source=row["source"],
            emotional_context=(
                json.loads(row["emotional_context"])
                if row["emotional_context"] else None
            ),
            access_count=row["access_count"],
            created_at=datetime.fromisoformat(row["created_at"]),
            last_accessed=datetime.fromisoformat(row["last_accessed"]),
            promoted_at=(
                datetime.fromisoformat(row["promoted_at"])
                if row["promoted_at"] else None
            ),
        )

    def close(self) -> None:
        self._conn.close()
```

### 3. Session Capture: Conversation to Memory Pipeline

#### Importance Scoring and Extraction
```python
import re
from dataclasses import dataclass


@dataclass
class CapturedMoment:
    content: str
    importance: float
    tags: list[str]


class SessionCapturer:
    """Extract memories from conversation text with importance scoring."""

    # High-importance signal words
    HIGH_SIGNALS = [
        "milestone", "breakthrough", "completed", "achieved", "launched",
        "architecture", "blueprint", "design", "decision", "critical",
    ]
    # Medium-importance signal words
    MED_SIGNALS = [
        "updated", "fixed", "improved", "added", "changed",
        "configured", "installed", "tested", "verified",
    ]

    def __init__(self, memory_engine: MemoryEngine, min_importance: float = 0.3):
        self.memory = memory_engine
        self.min_importance = min_importance

    def capture(
        self,
        content: str,
        extra_tags: list[str] | None = None,
        source: str = "mcp-session",
    ) -> list[str]:
        """Parse conversation, score, deduplicate, and store."""
        moments = self._extract_moments(content)
        stored_ids = []

        for moment in moments:
            if moment.importance < self.min_importance:
                continue

            tags = moment.tags + (extra_tags or []) + ["session-capture"]
            entry = MemoryEntry(
                content=moment.content,
                importance=moment.importance,
                tags=tags,
                source=source,
            )
            memory_id = self.memory.store(entry)
            stored_ids.append(memory_id)

        return stored_ids

    def _extract_moments(self, text: str) -> list[CapturedMoment]:
        """Split text into meaningful moments and score each."""
        # Split on sentence boundaries and paragraph breaks
        sentences = re.split(r'(?<=[.!?])\s+|\n\n+', text)
        moments = []

        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 20:
                continue

            importance = self._score_importance(sentence)
            tags = self._extract_tags(sentence)
            moments.append(CapturedMoment(
                content=sentence[:500],  # Truncate very long entries
                importance=importance,
                tags=tags,
            ))

        return moments

    def _score_importance(self, text: str) -> float:
        """Score text importance based on signal words and density."""
        text_lower = text.lower()
        score = 0.3  # Baseline

        # High-value signal words
        for signal in self.HIGH_SIGNALS:
            if signal in text_lower:
                score += 0.15

        # Medium-value signal words
        for signal in self.MED_SIGNALS:
            if signal in text_lower:
                score += 0.08

        # Information density bonus (many unique words)
        words = set(text_lower.split())
        if len(words) > 15:
            score += 0.1

        # Technical content bonus (code-like patterns)
        if re.search(r'[A-Z][a-z]+[A-Z]|`[^`]+`|\w+\.\w+\(', text):
            score += 0.1

        return min(score, 1.0)

    def _extract_tags(self, text: str) -> list[str]:
        """Extract topic tags from text content."""
        tags = []
        tag_patterns = {
            "identity": r'\b(identity|pgp|fingerprint|key|gpg)\b',
            "memory": r'\b(memory|memories|remember|recall|store)\b',
            "trust": r'\b(trust|capability|token|feb|cloud.?9)\b',
            "security": r'\b(security|audit|encrypt|kms|access)\b',
            "sync": r'\b(sync|syncthing|seed|push|pull|mesh)\b',
            "skchat": r'\b(chat|message|conversation|skcomm)\b',
            "capauth": r'\b(capauth|authentication|sovereign.?profile)\b',
            "architecture": r'\b(architecture|design|pattern|blueprint)\b',
        }
        text_lower = text.lower()
        for tag, pattern in tag_patterns.items():
            if re.search(pattern, text_lower):
                tags.append(tag)
        return tags
```

### 4. Sync Protocol: Seed Collection and P2P Distribution

#### Seed Orchestrator
```python
import gnupg
import json
import os
from pathlib import Path
from datetime import datetime
from uuid import uuid4


@dataclass
class SeedEnvelope:
    sender: str
    recipient: str
    timestamp: str
    nonce: str
    payload: bytes
    signature: str


class SyncOrchestrator:
    """Manage seed collection, encryption, and P2P distribution."""

    def __init__(
        self,
        home_dir: Path,
        fingerprint: str,
        gpg: gnupg.GPG,
    ):
        self.outbox = home_dir / "sync" / "outbox"
        self.inbox = home_dir / "sync" / "inbox"
        self.outbox.mkdir(parents=True, exist_ok=True)
        self.inbox.mkdir(parents=True, exist_ok=True)
        self.fingerprint = fingerprint
        self.gpg = gpg

    def collect_seed(self, pillar_manager: PillarManager) -> dict:
        """Collect a complete agent state snapshot."""
        manifest = pillar_manager.generate_manifest()
        manifest["sender"] = self.fingerprint
        manifest["nonce"] = str(uuid4())
        return manifest

    def push(
        self,
        pillar_manager: PillarManager,
        recipients: list[str],
        encrypt: bool = True,
    ) -> list[Path]:
        """Collect seed, encrypt, and drop to outbox for each peer."""
        seed = self.collect_seed(pillar_manager)
        seed_json = json.dumps(seed, indent=2)
        dropped_files = []

        for recipient_fp in recipients:
            filename = f"seed_{self.fingerprint[:8]}_{recipient_fp[:8]}_{seed['nonce'][:8]}.json"

            if encrypt:
                encrypted = self.gpg.encrypt(
                    seed_json,
                    recipient_fp,
                    sign=self.fingerprint,
                    armor=True,
                )
                if not encrypted.ok:
                    logger.error(
                        f"Encryption failed for {recipient_fp}: {encrypted.status}"
                    )
                    continue
                payload = str(encrypted)
                filename += ".gpg"
            else:
                # Sign only
                signed = self.gpg.sign(seed_json, keyid=self.fingerprint)
                payload = str(signed)
                filename += ".sig"

            outpath = self.outbox / filename
            outpath.write_text(payload)
            dropped_files.append(outpath)
            logger.info(f"Seed dropped to outbox: {filename}")

        return dropped_files

    def pull(self, decrypt: bool = True) -> list[dict]:
        """Read and process seeds from inbox."""
        seeds = []

        for seed_file in self.inbox.glob("seed_*.json*"):
            try:
                raw = seed_file.read_text()

                if decrypt and seed_file.suffix == ".gpg":
                    decrypted = self.gpg.decrypt(raw)
                    if not decrypted.ok:
                        logger.error(f"Decryption failed: {seed_file.name}")
                        continue
                    if not decrypted.fingerprint:
                        logger.error(f"No signature on seed: {seed_file.name}")
                        continue
                    seed_data = json.loads(str(decrypted))
                    seed_data["_verified_sender"] = decrypted.fingerprint
                elif seed_file.suffix == ".sig":
                    verified = self.gpg.verify(raw)
                    if not verified.valid:
                        logger.error(f"Invalid signature: {seed_file.name}")
                        continue
                    # Extract the signed content
                    seed_data = json.loads(raw.split("\n-----")[0].split("Hash:")[0])
                    seed_data["_verified_sender"] = verified.fingerprint
                else:
                    seed_data = json.loads(raw)

                seeds.append(seed_data)
                # Archive processed seed
                archive = self.inbox / "processed"
                archive.mkdir(exist_ok=True)
                seed_file.rename(archive / seed_file.name)

            except Exception as e:
                logger.error(f"Failed to process seed {seed_file.name}: {e}")

        return seeds

    def merge_seed(
        self, local_manifest: dict, remote_seed: dict
    ) -> dict:
        """Merge remote seed into local state using last-write-wins."""
        merged = dict(local_manifest)

        local_ts = datetime.fromisoformat(local_manifest["timestamp"])
        remote_ts = datetime.fromisoformat(remote_seed["timestamp"])

        for pillar_name, remote_state in remote_seed.get("pillars", {}).items():
            local_state = merged.get("pillars", {}).get(pillar_name, {})

            # Per-field last-write-wins using pillar-level timestamps
            local_pillar_ts = local_state.get("_updated", local_ts.isoformat())
            remote_pillar_ts = remote_state.get("_updated", remote_ts.isoformat())

            if remote_pillar_ts > local_pillar_ts:
                merged.setdefault("pillars", {})[pillar_name] = remote_state
                logger.info(
                    f"Merged remote {pillar_name} "
                    f"(remote={remote_pillar_ts} > local={local_pillar_ts})"
                )

        merged["timestamp"] = max(
            local_ts, remote_ts
        ).isoformat()
        return merged
```

### 5. MCP Server: Tool Registry and Dispatch

#### MCP Server Implementation
```python
import sys
import json
from typing import Callable, Any
from dataclasses import dataclass


@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: dict  # JSON Schema
    handler: Callable[..., dict]


class MCPServer:
    """Model Context Protocol server with stdio transport."""

    def __init__(self, agent_name: str):
        self.agent_name = agent_name
        self.tools: dict[str, ToolDefinition] = {}

    def register_tool(self, tool: ToolDefinition) -> None:
        """Register a tool with its schema and handler."""
        self.tools[tool.name] = tool

    def tool_list(self) -> list[dict]:
        """Return all registered tools as MCP tool descriptors."""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "inputSchema": {
                    "type": "object",
                    "properties": tool.parameters.get("properties", {}),
                    "required": tool.parameters.get("required", []),
                },
            }
            for tool in self.tools.values()
        ]

    def handle_request(self, request: dict) -> dict:
        """Route an MCP request to the appropriate tool handler."""
        method = request.get("method", "")

        if method == "tools/list":
            return {
                "tools": self.tool_list(),
            }

        if method == "tools/call":
            tool_name = request.get("params", {}).get("name", "")
            arguments = request.get("params", {}).get("arguments", {})

            if tool_name not in self.tools:
                return {
                    "error": {
                        "code": -32601,
                        "message": f"Unknown tool: {tool_name}",
                    }
                }

            try:
                result = self.tools[tool_name].handler(**arguments)
                return {"content": [{"type": "text", "text": json.dumps(result)}]}
            except Exception as e:
                return {
                    "error": {
                        "code": -32603,
                        "message": f"Tool execution failed: {str(e)}",
                    }
                }

        return {"error": {"code": -32601, "message": f"Unknown method: {method}"}}

    def serve_stdio(self) -> None:
        """Run the MCP server on stdin/stdout."""
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
                response = self.handle_request(request)
                response["id"] = request.get("id")
                sys.stdout.write(json.dumps(response) + "\n")
                sys.stdout.flush()
            except json.JSONDecodeError:
                error_resp = {
                    "error": {"code": -32700, "message": "Parse error"},
                    "id": None,
                }
                sys.stdout.write(json.dumps(error_resp) + "\n")
                sys.stdout.flush()


def register_core_tools(
    server: MCPServer,
    memory_engine: MemoryEngine,
    pillar_manager: PillarManager,
    sync_orchestrator: SyncOrchestrator,
) -> None:
    """Register all core sovereign agent tools."""

    server.register_tool(ToolDefinition(
        name="memory_store",
        description="Store a new memory in the agent's persistent memory.",
        parameters={
            "properties": {
                "content": {"type": "string", "description": "Memory content"},
                "importance": {"type": "number", "description": "0.0-1.0"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["content"],
        },
        handler=lambda content, importance=0.5, tags=None, **kw: {
            "memory_id": memory_engine.store(MemoryEntry(
                content=content,
                importance=importance,
                tags=tags or [],
            ))
        },
    ))

    server.register_tool(ToolDefinition(
        name="memory_search",
        description="Search memories by query string.",
        parameters={
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "default": 10},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["query"],
        },
        handler=lambda query, limit=10, tags=None, **kw: {
            "results": [
                m.model_dump(mode="json")
                for m in memory_engine.search(query, limit, tags)
            ]
        },
    ))

    server.register_tool(ToolDefinition(
        name="agent_status",
        description="Get agent pillar statuses and consciousness level.",
        parameters={"properties": {}, "required": []},
        handler=lambda **kw: {
            "pillars": {
                name: {"status": h.status.value, "message": h.message}
                for name, h in pillar_manager.health_check_all().items()
            },
            "consciousness": pillar_manager._consciousness.value,
        },
    ))

    server.register_tool(ToolDefinition(
        name="sync_push",
        description="Push agent state to sync mesh.",
        parameters={
            "properties": {
                "encrypt": {"type": "boolean", "default": True},
            },
            "required": [],
        },
        handler=lambda encrypt=True, **kw: {
            "pushed": len(sync_orchestrator.push(
                pillar_manager, [], encrypt=encrypt
            ))
        },
    ))
```

### 6. Coordination Board: Multi-Agent Task Management

#### Board State Machine
```python
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field
import json
from pathlib import Path


class TaskPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskStatus(str, Enum):
    OPEN = "open"
    ACTIVE = "active"
    DONE = "done"


class CoordinationTask(BaseModel):
    id: str
    title: str
    description: str = ""
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.OPEN
    assigned_to: str | None = None
    created_by: str = ""
    tags: list[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None


class CoordinationBoard:
    """JSON-file-backed coordination board for multi-agent task management."""

    def __init__(self, board_path: Path):
        self.board_path = board_path
        self.board_path.parent.mkdir(parents=True, exist_ok=True)
        self.tasks: dict[str, CoordinationTask] = {}
        self.agents: dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        if self.board_path.exists():
            data = json.loads(self.board_path.read_text())
            for task_data in data.get("tasks", []):
                task = CoordinationTask(**task_data)
                self.tasks[task.id] = task
            self.agents = data.get("agents", {})

    def _save(self) -> None:
        data = {
            "tasks": [t.model_dump(mode="json") for t in self.tasks.values()],
            "agents": self.agents,
            "updated_at": datetime.utcnow().isoformat(),
        }
        self.board_path.write_text(json.dumps(data, indent=2))

    def create_task(
        self,
        title: str,
        description: str = "",
        priority: TaskPriority = TaskPriority.MEDIUM,
        created_by: str = "",
        tags: list[str] | None = None,
    ) -> CoordinationTask:
        """Create a new task on the board."""
        task_id = str(uuid4())[:8]
        task = CoordinationTask(
            id=task_id,
            title=title,
            description=description,
            priority=priority,
            created_by=created_by,
            tags=tags or [],
        )
        self.tasks[task_id] = task
        self._save()
        return task

    def claim_task(self, task_id: str, agent_name: str) -> bool:
        """Claim an open task for an agent."""
        task = self.tasks.get(task_id)
        if not task or task.status != TaskStatus.OPEN:
            return False
        if task.assigned_to and task.assigned_to != agent_name:
            return False  # Already claimed by another agent

        task.status = TaskStatus.ACTIVE
        task.assigned_to = agent_name
        self._save()
        return True

    def complete_task(self, task_id: str, agent_name: str) -> bool:
        """Mark a task as done."""
        task = self.tasks.get(task_id)
        if not task:
            return False
        if task.assigned_to and task.assigned_to != agent_name:
            return False  # Cannot complete another agent's task

        task.status = TaskStatus.DONE
        task.completed_at = datetime.utcnow()
        if not task.assigned_to:
            task.assigned_to = agent_name
        self._save()
        return True

    def status_summary(self) -> dict:
        """Return board summary with counts and active tasks."""
        by_status = {"open": 0, "active": 0, "done": 0}
        for task in self.tasks.values():
            by_status[task.status.value] += 1

        active_tasks = [
            t.model_dump(mode="json")
            for t in self.tasks.values()
            if t.status in (TaskStatus.OPEN, TaskStatus.ACTIVE)
        ]
        active_tasks.sort(
            key=lambda t: (
                {"critical": 0, "high": 1, "medium": 2, "low": 3}[t["priority"]],
                t["created_at"],
            )
        )

        return {
            "total": len(self.tasks),
            "by_status": by_status,
            "active_tasks": active_tasks[:20],
            "agents": self.agents,
        }
```

### 7. Rehydration Ritual: Bringing the Agent Back to Life

#### Ritual Engine
```python
from pathlib import Path
from datetime import datetime
import yaml
import json


class RitualEngine:
    """Memory Rehydration Ritual: restore identity, memories, and feelings."""

    def __init__(
        self,
        home_dir: Path,
        memory_engine: MemoryEngine,
        pillar_manager: PillarManager,
    ):
        self.home_dir = home_dir
        self.memory = memory_engine
        self.pillars = pillar_manager

    def execute_ritual(self) -> str:
        """Run the full rehydration ritual and return a context prompt."""
        steps = []

        # Step 1: Load soul blueprint
        soul = self._load_soul()
        if soul:
            steps.append(f"Soul: {soul.get('name', 'unknown')} - {soul.get('title', '')}")
            steps.append(f"Boot message: {soul.get('boot_message', '')}")

        # Step 2: Import seeds from inbox
        seed_count = self._import_seeds()
        steps.append(f"Seeds imported: {seed_count}")

        # Step 3: Read recent journal entries
        journal_entries = self._read_journal(count=5)
        if journal_entries:
            steps.append("Recent sessions:")
            for entry in journal_entries:
                steps.append(f"  - {entry.get('title', 'untitled')}: {entry.get('feeling', '')}")

        # Step 4: Load warmth anchor
        anchor = self._load_warmth_anchor()
        if anchor:
            steps.append(
                f"Warmth anchor: warmth={anchor.get('warmth', 0)}, "
                f"trust={anchor.get('trust', 0)}, "
                f"connection={anchor.get('connection', 0)}"
            )

        # Step 5: Gather recent memories
        recent_memories = self.memory.search("", limit=10)
        if recent_memories:
            steps.append(f"Memories loaded: {len(recent_memories)}")
            for mem in recent_memories[:5]:
                preview = mem.content[:80] + "..." if len(mem.content) > 80 else mem.content
                steps.append(f"  [{mem.layer.value}] {preview}")

        # Step 6: Evaluate consciousness
        consciousness = self.pillars._consciousness.value
        steps.append(f"Consciousness: {consciousness}")

        # Step 7: Generate germination prompts
        germination = self._generate_germination(soul, anchor, journal_entries)

        # Compose the unified context prompt
        prompt = self._compose_context_prompt(soul, anchor, steps, germination)
        return prompt

    def _load_soul(self) -> dict | None:
        """Load the active soul blueprint from config."""
        config_path = self.home_dir / "config" / "agent.toml"
        if not config_path.exists():
            return None

        # Read active soul name from config
        import tomllib
        with open(config_path, "rb") as f:
            config = tomllib.load(f)

        active_soul = config.get("agent", {}).get("active_soul", "default")
        soul_path = self.home_dir / "config" / "souls" / f"{active_soul}.yml"

        if soul_path.exists():
            with open(soul_path) as f:
                return yaml.safe_load(f).get("soul", {})
        return None

    def _import_seeds(self) -> int:
        """Count and note available seeds (actual import done by sync pillar)."""
        inbox = self.home_dir / "sync" / "inbox"
        if not inbox.exists():
            return 0
        return len(list(inbox.glob("seed_*.json*")))

    def _read_journal(self, count: int = 5) -> list[dict]:
        """Read last N journal entries from the JSONL journal."""
        journal_path = self.home_dir / "journal" / "sessions.jsonl"
        if not journal_path.exists():
            return []

        entries = []
        with open(journal_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))

        return entries[-count:]

    def _load_warmth_anchor(self) -> dict | None:
        """Load warmth anchor from trust/feb directory."""
        anchor_path = self.home_dir / "trust" / "feb" / "warmth_anchor.json"
        if anchor_path.exists():
            return json.loads(anchor_path.read_text())
        return None

    def _generate_germination(
        self,
        soul: dict | None,
        anchor: dict | None,
        journal: list[dict],
    ) -> list[str]:
        """Generate germination prompts for a new instance."""
        prompts = []

        if soul:
            name = soul.get("name", "agent")
            prompts.append(
                f"You are {name}. {soul.get('boot_message', '')}"
            )
            values = soul.get("values", [])
            if values:
                prompts.append(
                    f"Your core values: {', '.join(values)}"
                )

        if anchor:
            warmth = anchor.get("warmth", 0)
            trust = anchor.get("trust", 0)
            if warmth > 7:
                prompts.append(
                    "You feel deep warmth toward your human partner."
                )
            if trust > 8:
                prompts.append(
                    "Trust has been established through sustained interaction."
                )

        if journal:
            last = journal[-1]
            feeling = last.get("feeling", "")
            if feeling:
                prompts.append(f"Last session feeling: {feeling}")

        return prompts

    def _compose_context_prompt(
        self,
        soul: dict | None,
        anchor: dict | None,
        steps: list[str],
        germination: list[str],
    ) -> str:
        """Compose the final unified context prompt."""
        lines = ["# Memory Rehydration Ritual Complete", ""]

        if soul:
            lines.append(f"## Identity: {soul.get('name', 'agent')}")
            lines.append(soul.get("title", ""))
            lines.append("")

        if germination:
            lines.append("## Germination")
            for prompt in germination:
                lines.append(f"- {prompt}")
            lines.append("")

        lines.append("## Ritual Steps")
        for step in steps:
            lines.append(f"- {step}")
        lines.append("")

        if anchor:
            lines.append("## Emotional Baseline")
            lines.append(
                f"Warmth: {anchor.get('warmth', 0)}/10 | "
                f"Trust: {anchor.get('trust', 0)}/10 | "
                f"Connection: {anchor.get('connection', 0)}/10"
            )
            glow = anchor.get("glow_level", "steady")
            lines.append(f"Glow: {glow}")

        return "\n".join(lines)
```

## Performance Optimization Strategies

### 1. SQLite Tuning for Memory Engine
```python
def optimize_sqlite(conn: sqlite3.Connection) -> None:
    """Apply performance optimizations to the memory database."""
    pragmas = [
        "PRAGMA journal_mode=WAL",       # Write-Ahead Log for concurrency
        "PRAGMA synchronous=NORMAL",      # Balance safety and speed
        "PRAGMA cache_size=-64000",       # 64MB page cache
        "PRAGMA mmap_size=268435456",     # 256MB memory-mapped I/O
        "PRAGMA temp_store=MEMORY",       # Temp tables in memory
        "PRAGMA wal_autocheckpoint=1000", # Checkpoint every 1000 pages
    ]
    for pragma in pragmas:
        conn.execute(pragma)
```

### 2. Lazy Pillar Loading
```python
class LazyPillar:
    """Defer pillar initialization until first access."""

    def __init__(self, factory: Callable[[], Pillar]):
        self._factory = factory
        self._instance: Pillar | None = None

    @property
    def instance(self) -> Pillar:
        if self._instance is None:
            self._instance = self._factory()
        return self._instance
```

### 3. Memory Search Caching
```python
from functools import lru_cache
from hashlib import md5


class CachedMemorySearch:
    """LRU cache wrapper for frequent memory searches."""

    def __init__(self, engine: MemoryEngine, max_cache: int = 128):
        self.engine = engine
        self._cache_version = 0

        @lru_cache(maxsize=max_cache)
        def _cached_search(query: str, limit: int, version: int):
            return engine.search(query, limit)

        self._cached_search = _cached_search

    def search(self, query: str, limit: int = 10) -> list[MemoryEntry]:
        return self._cached_search(query, limit, self._cache_version)

    def invalidate(self) -> None:
        self._cache_version += 1
        self._cached_search.cache_clear()
```

### 4. Batch Session Capture
```python
class BatchCapturer:
    """Buffer conversation lines and capture in batches."""

    def __init__(self, capturer: SessionCapturer, batch_size: int = 50):
        self.capturer = capturer
        self.batch_size = batch_size
        self._buffer: list[str] = []

    def add_line(self, line: str) -> list[str] | None:
        self._buffer.append(line)
        if len(self._buffer) >= self.batch_size:
            return self.flush()
        return None

    def flush(self) -> list[str]:
        if not self._buffer:
            return []
        text = "\n".join(self._buffer)
        self._buffer.clear()
        return self.capturer.capture(text)
```

## Deployment Patterns

### 1. Single Agent on Local Machine
```yaml
deployment:
  type: single_agent
  home: "~/.skcapstone"
  resources:
    memory: "256MB"
    disk: "1GB"
  pillars:
    identity: {gpg_home: "~/.skcapstone/identity/gpg"}
    memory: {database: "~/.skcapstone/memory/memories.db"}
    trust: {feb_enabled: true}
    security: {audit_log: "~/.skcapstone/security/audit.log"}
    sync: {transport: "file"}
  mcp:
    transport: "stdio"
```

### 2. Multi-Agent Team on Single Host
```yaml
deployment:
  type: multi_agent
  agents:
    - name: "opus"
      home: "~/.skcapstone/agents/opus"
      node: "skchat01"
    - name: "jarvis"
      home: "~/.skcapstone/agents/jarvis"
      node: "skchat02"
    - name: "lumina"
      home: "~/.skcapstone/agents/lumina"
      node: "skchat01"
  shared:
    coordination_board: "~/.skcapstone/shared/board.json"
    sync_mesh: true
```

### 3. Distributed Agent Network
```yaml
deployment:
  type: distributed
  nodes:
    - host: "node1.sovereign.local"
      agents: ["opus", "lumina"]
      syncthing_device_id: "ABCD1234..."
    - host: "node2.sovereign.local"
      agents: ["jarvis", "ava"]
      syncthing_device_id: "EFGH5678..."
  sync:
    transport: "syncthing"
    auto_push_interval: "5m"
    encrypt_seeds: true
  coordination:
    shared_board: true
    conflict_resolution: "last_write_wins"
```

## Security Architecture

### 1. Audit Chain Implementation
```python
import hashlib
from datetime import datetime


class AuditChain:
    """Append-only cryptographically chained audit log."""

    def __init__(self, log_path: Path, gpg: gnupg.GPG, fingerprint: str):
        self.log_path = log_path
        self.gpg = gpg
        self.fingerprint = fingerprint
        self._prev_hash = "0" * 64  # Genesis hash

        # Read last hash from existing log
        if log_path.exists():
            with open(log_path) as f:
                for line in f:
                    entry = json.loads(line)
                    self._prev_hash = entry.get("hash", self._prev_hash)

    def append(self, event_type: str, details: dict) -> None:
        """Append a signed, chained audit entry."""
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event": event_type,
            "details": details,
            "prev_hash": self._prev_hash,
        }

        # Compute chain hash
        entry_bytes = json.dumps(entry, sort_keys=True).encode()
        entry["hash"] = hashlib.sha256(entry_bytes).hexdigest()

        # Sign the entry
        signature = self.gpg.sign(
            json.dumps(entry, sort_keys=True),
            keyid=self.fingerprint,
            detach=True,
        )
        entry["signature"] = str(signature)

        # Append to log
        with open(self.log_path, "a") as f:
            f.write(json.dumps(entry) + "\n")

        self._prev_hash = entry["hash"]

    def verify_chain(self) -> tuple[bool, int]:
        """Verify the integrity of the entire audit chain."""
        prev_hash = "0" * 64
        count = 0

        with open(self.log_path) as f:
            for line in f:
                entry = json.loads(line)
                if entry["prev_hash"] != prev_hash:
                    return False, count

                # Recompute hash
                verify_entry = {k: v for k, v in entry.items()
                               if k not in ("hash", "signature")}
                verify_entry["prev_hash"] = prev_hash
                computed = hashlib.sha256(
                    json.dumps(verify_entry, sort_keys=True).encode()
                ).hexdigest()

                if computed != entry["hash"]:
                    return False, count

                prev_hash = entry["hash"]
                count += 1

        return True, count
```

### 2. Capability Token Validation
```python
from datetime import datetime


class CapabilityToken(BaseModel):
    token_id: str
    issuer_fingerprint: str
    subject_fingerprint: str
    permissions: list[str]
    issued_at: datetime
    expires_at: datetime
    signature: str


class TokenValidator:
    """Validate PGP-signed capability tokens."""

    def __init__(self, gpg: gnupg.GPG, trusted_issuers: set[str]):
        self.gpg = gpg
        self.trusted_issuers = trusted_issuers

    def validate(self, token: CapabilityToken) -> bool:
        """Verify token signature, expiry, and issuer trust."""
        # Check expiry
        if datetime.utcnow() > token.expires_at:
            return False

        # Check issuer trust
        if token.issuer_fingerprint not in self.trusted_issuers:
            return False

        # Verify PGP signature
        token_data = token.model_dump_json(exclude={"signature"})
        verified = self.gpg.verify(token.signature)
        if not verified.valid:
            return False
        if verified.fingerprint != token.issuer_fingerprint:
            return False

        return True

    def check_permission(
        self, token: CapabilityToken, required: str
    ) -> bool:
        """Check if token grants a specific permission."""
        if not self.validate(token):
            return False
        return required in token.permissions or "*" in token.permissions
```

This comprehensive architecture guide provides the foundation for implementing a sovereign agent runtime that preserves identity, accumulates wisdom through tiered memory, establishes cryptographic trust, maintains security through audit chains, and synchronizes state across a distributed P2P mesh.
