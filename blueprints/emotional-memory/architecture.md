# Emotional Memory (SKMemory) Architecture

## System Layers

```
┌────────────────────────────────────────────────────────────────┐
│                      Application Layer                         │
│  CLI (skmemory)  │  Python SDK  │  MCP Tools  │  REST API     │
├────────────────────────────────────────────────────────────────┤
│                      Memory API Layer                          │
│  store()  │  search()  │  recall()  │  promote()  │  curate() │
├────────────────────────────────────────────────────────────────┤
│                    Processing Pipeline                         │
│  Scoring  │  Emotion  │  Tagging  │  Dedup  │  Consolidation  │
├────────────────────────────────────────────────────────────────┤
│                      Router / Dispatcher                       │
│  Route queries to appropriate backend(s) by capability         │
├──────────────┬────────────────────┬───────────────────────────┤
│   Level 0    │     Level 1        │       Level 2             │
│   SQLite     │     Qdrant         │       FalkorDB            │
│   + FTS5     │     (vectors)      │       (graph)             │
│   Always-on  │     Optional       │       Optional            │
└──────────────┴────────────────────┴───────────────────────────┘
```

## Core Data Model

### Memory Entry

```python
import uuid
import hashlib
import json
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field
from enum import Enum


class MemoryLayer(str, Enum):
    SHORT_TERM = "short-term"
    MID_TERM = "mid-term"
    LONG_TERM = "long-term"


class MemorySource(str, Enum):
    SESSION = "session"
    CLI = "cli"
    SEED = "seed"
    IMPORT = "import"
    SESSION_CAPTURE = "session-capture"
    MCP = "mcp"


class EmotionalSnapshot(BaseModel):
    """Emotional fingerprint attached to every memory."""
    intensity: float = Field(0.5, ge=0.0, le=1.0)
    valence: float = Field(0.0, ge=-1.0, le=1.0)
    labels: list[str] = Field(default_factory=list)
    resonance_note: str = ""
    cloud9_achieved: bool = False

    def emotional_weight(self) -> float:
        """Combined emotional significance score."""
        return self.intensity * abs(self.valence) if self.valence != 0 \
            else self.intensity * 0.5


class MemoryLink(BaseModel):
    """Typed link to another memory."""
    target_id: str
    relationship: str  # related, caused, preceded, contradicts, enriches


class MemoryEntry(BaseModel):
    """The atomic unit of SKMemory -- a Polaroid snapshot."""
    memory_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: str
    tags: list[str] = Field(default_factory=list)
    source: MemorySource = MemorySource.SESSION
    layer: MemoryLayer = MemoryLayer.SHORT_TERM
    emotional: EmotionalSnapshot = Field(
        default_factory=EmotionalSnapshot
    )
    importance: float = Field(0.5, ge=0.0, le=1.0)
    access_count: int = 0
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    accessed_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    soul_context: str = ""
    embedding: Optional[list[float]] = None
    links: list[MemoryLink] = Field(default_factory=list)
    content_hash: str = ""

    def model_post_init(self, __context):
        if not self.content_hash:
            self.content_hash = hashlib.sha256(
                self.content.encode()
            ).hexdigest()

    def touch(self) -> None:
        """Record an access, incrementing count and updating timestamp."""
        self.access_count += 1
        self.accessed_at = datetime.now(timezone.utc).isoformat()

    def qualifies_for_mid_term(
        self, access_threshold: int = 3, importance_threshold: float = 0.7
    ) -> bool:
        return (
            self.layer == MemoryLayer.SHORT_TERM
            and (
                self.access_count >= access_threshold
                or self.importance >= importance_threshold
            )
        )

    def qualifies_for_long_term(
        self, access_threshold: int = 10, importance_threshold: float = 0.9
    ) -> bool:
        return (
            self.layer == MemoryLayer.MID_TERM
            and (
                self.access_count >= access_threshold
                or self.importance >= importance_threshold
                or self.emotional.cloud9_achieved
            )
        )

    def to_json_file(self) -> str:
        """Serialize for JSON file storage."""
        return self.model_dump_json(indent=2)

    @classmethod
    def from_json_file(cls, data: str) -> "MemoryEntry":
        return cls.model_validate_json(data)

    def token_estimate(self) -> int:
        """Rough token count for context budget calculation."""
        return len(self.content.split()) + len(self.tags) * 2 + 20
```

## Storage Backend Architecture

### SQLite Backend (Level 0 -- Always On)

```python
import sqlite3
from pathlib import Path


class SQLiteBackend:
    """Zero-infrastructure memory backend with full-text search."""

    def __init__(self, db_path: str = "~/.skmemory/index.db"):
        self.db_path = Path(db_path).expanduser()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(
            str(self.db_path),
            check_same_thread=False,
        )
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS memories (
                memory_id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                tags TEXT DEFAULT '[]',
                source TEXT DEFAULT 'session',
                layer TEXT DEFAULT 'short-term',
                importance REAL DEFAULT 0.5,
                access_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                accessed_at TEXT NOT NULL,
                soul_context TEXT DEFAULT '',
                content_hash TEXT NOT NULL,
                emotional_json TEXT DEFAULT '{}',
                links_json TEXT DEFAULT '[]'
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                content, tags, soul_context,
                content='memories',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories
            BEGIN
                INSERT INTO memories_fts(rowid, content, tags, soul_context)
                VALUES (new.rowid, new.content, new.tags, new.soul_context);
            END;

            CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories
            BEGIN
                INSERT INTO memories_fts(memories_fts, rowid, content, tags,
                                         soul_context)
                VALUES ('delete', old.rowid, old.content, old.tags,
                        old.soul_context);
            END;

            CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories
            BEGIN
                INSERT INTO memories_fts(memories_fts, rowid, content, tags,
                                         soul_context)
                VALUES ('delete', old.rowid, old.content, old.tags,
                        old.soul_context);
                INSERT INTO memories_fts(rowid, content, tags, soul_context)
                VALUES (new.rowid, new.content, new.tags, new.soul_context);
            END;

            CREATE INDEX IF NOT EXISTS idx_memories_layer
                ON memories(layer);
            CREATE INDEX IF NOT EXISTS idx_memories_importance
                ON memories(importance DESC);
            CREATE INDEX IF NOT EXISTS idx_memories_content_hash
                ON memories(content_hash);
            CREATE INDEX IF NOT EXISTS idx_memories_soul
                ON memories(soul_context);
        """)
        self.conn.commit()

    def store(self, entry: MemoryEntry) -> str:
        """Store a memory entry. Returns memory_id."""
        self.conn.execute(
            """INSERT OR REPLACE INTO memories
               (memory_id, content, tags, source, layer, importance,
                access_count, created_at, accessed_at, soul_context,
                content_hash, emotional_json, links_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                entry.memory_id,
                entry.content,
                json.dumps(entry.tags),
                entry.source.value,
                entry.layer.value,
                entry.importance,
                entry.access_count,
                entry.created_at,
                entry.accessed_at,
                entry.soul_context,
                entry.content_hash,
                entry.emotional.model_dump_json(),
                json.dumps([l.model_dump() for l in entry.links]),
            ),
        )
        self.conn.commit()
        return entry.memory_id

    def recall(self, memory_id: str) -> MemoryEntry | None:
        """Retrieve a memory by ID and increment access count."""
        row = self.conn.execute(
            "SELECT * FROM memories WHERE memory_id = ?",
            (memory_id,),
        ).fetchone()
        if not row:
            return None

        entry = self._row_to_entry(row)
        entry.touch()

        # Update access count in database
        self.conn.execute(
            "UPDATE memories SET access_count = ?, accessed_at = ? "
            "WHERE memory_id = ?",
            (entry.access_count, entry.accessed_at, memory_id),
        )
        self.conn.commit()
        return entry

    def search(
        self,
        query: str,
        tags: list[str] | None = None,
        layer: str | None = None,
        soul: str | None = None,
        limit: int = 10,
    ) -> list[MemoryEntry]:
        """Full-text search with optional filters."""
        # FTS5 search
        rows = self.conn.execute(
            """SELECT m.*, rank
               FROM memories_fts fts
               JOIN memories m ON m.rowid = fts.rowid
               WHERE memories_fts MATCH ?
               ORDER BY rank
               LIMIT ?""",
            (query, limit * 3),  # Over-fetch for post-filtering
        ).fetchall()

        results = []
        for row in rows:
            entry = self._row_to_entry(row)

            # Apply filters
            if layer and entry.layer.value != layer:
                continue
            if soul and entry.soul_context != soul:
                continue
            if tags and not set(tags).issubset(set(entry.tags)):
                continue

            results.append(entry)
            if len(results) >= limit:
                break

        return results

    def get_by_hash(self, content_hash: str) -> MemoryEntry | None:
        """Look up by content hash for deduplication."""
        row = self.conn.execute(
            "SELECT * FROM memories WHERE content_hash = ?",
            (content_hash,),
        ).fetchone()
        return self._row_to_entry(row) if row else None

    def get_by_layer(
        self, layer: str, limit: int = 100
    ) -> list[MemoryEntry]:
        """Get all memories in a tier, sorted by importance."""
        rows = self.conn.execute(
            "SELECT * FROM memories WHERE layer = ? "
            "ORDER BY importance DESC LIMIT ?",
            (layer, limit),
        ).fetchall()
        return [self._row_to_entry(r) for r in rows]

    def update_layer(self, memory_id: str, new_layer: str) -> bool:
        """Promote a memory to a new tier."""
        cursor = self.conn.execute(
            "UPDATE memories SET layer = ? WHERE memory_id = ?",
            (new_layer, memory_id),
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def count_by_layer(self) -> dict[str, int]:
        """Return memory counts per tier."""
        rows = self.conn.execute(
            "SELECT layer, COUNT(*) FROM memories GROUP BY layer"
        ).fetchall()
        return {row[0]: row[1] for row in rows}

    def delete(self, memory_id: str) -> bool:
        """Delete a memory by ID."""
        cursor = self.conn.execute(
            "DELETE FROM memories WHERE memory_id = ?",
            (memory_id,),
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def _row_to_entry(self, row: sqlite3.Row) -> MemoryEntry:
        """Convert a database row to a MemoryEntry."""
        emotional = EmotionalSnapshot.model_validate_json(
            row["emotional_json"]
        )
        links_data = json.loads(row["links_json"])
        links = [MemoryLink(**l) for l in links_data]
        tags = json.loads(row["tags"]) if isinstance(row["tags"], str) \
            else row["tags"]

        return MemoryEntry(
            memory_id=row["memory_id"],
            content=row["content"],
            tags=tags,
            source=MemorySource(row["source"]),
            layer=MemoryLayer(row["layer"]),
            importance=row["importance"],
            access_count=row["access_count"],
            created_at=row["created_at"],
            accessed_at=row["accessed_at"],
            soul_context=row["soul_context"],
            content_hash=row["content_hash"],
            emotional=emotional,
            links=links,
        )
```

### Qdrant Backend (Level 1 -- Semantic Search)

```python
from typing import Optional


class QdrantBackend:
    """Vector search backend for semantic memory recall."""

    def __init__(
        self,
        url: str = "http://localhost:6333",
        collection: str = "skmemory",
        embedding_model: str = "all-MiniLM-L6-v2",
        embedding_dim: int = 384,
    ):
        self.url = url
        self.collection = collection
        self.model_name = embedding_model
        self.dim = embedding_dim
        self._client = None
        self._model = None

    def _ensure_client(self):
        if self._client is None:
            from qdrant_client import QdrantClient
            from qdrant_client.models import (
                Distance, VectorParams, PointStruct,
            )
            self._client = QdrantClient(url=self.url)
            # Create collection if not exists
            collections = self._client.get_collections().collections
            names = [c.name for c in collections]
            if self.collection not in names:
                self._client.create_collection(
                    collection_name=self.collection,
                    vectors_config=VectorParams(
                        size=self.dim, distance=Distance.COSINE
                    ),
                )

    def _ensure_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name)

    def embed(self, text: str) -> list[float]:
        """Generate embedding vector for text."""
        self._ensure_model()
        return self._model.encode(text).tolist()

    def store(self, entry: MemoryEntry) -> None:
        """Store memory with its embedding in Qdrant."""
        self._ensure_client()
        from qdrant_client.models import PointStruct

        vector = entry.embedding or self.embed(entry.content)
        self._client.upsert(
            collection_name=self.collection,
            points=[
                PointStruct(
                    id=entry.memory_id,
                    vector=vector,
                    payload={
                        "content": entry.content,
                        "tags": entry.tags,
                        "layer": entry.layer.value,
                        "importance": entry.importance,
                        "intensity": entry.emotional.intensity,
                        "valence": entry.emotional.valence,
                        "soul_context": entry.soul_context,
                    },
                )
            ],
        )

    def search(
        self,
        query: str,
        limit: int = 10,
        layer: str | None = None,
        min_importance: float = 0.0,
    ) -> list[tuple[str, float]]:
        """Semantic search. Returns list of (memory_id, score) tuples."""
        self._ensure_client()
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        query_vector = self.embed(query)

        filters = []
        if layer:
            filters.append(
                FieldCondition(key="layer", match=MatchValue(value=layer))
            )

        search_filter = Filter(must=filters) if filters else None

        results = self._client.search(
            collection_name=self.collection,
            query_vector=query_vector,
            query_filter=search_filter,
            limit=limit,
        )

        return [(r.id, r.score) for r in results]

    def delete(self, memory_id: str) -> None:
        """Remove a memory vector from Qdrant."""
        self._ensure_client()
        self._client.delete(
            collection_name=self.collection,
            points_selector=[memory_id],
        )
```

### FalkorDB Backend (Level 2 -- Graph Relationships)

```python
class FalkorDBBackend:
    """Graph backend for memory relationship traversal."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        graph_name: str = "skmemory",
    ):
        self.host = host
        self.port = port
        self.graph_name = graph_name
        self._graph = None

    def _ensure_graph(self):
        if self._graph is None:
            from falkordb import FalkorDB
            db = FalkorDB(host=self.host, port=self.port)
            self._graph = db.select_graph(self.graph_name)

    def store_node(self, entry: MemoryEntry) -> None:
        """Create or update a memory node in the graph."""
        self._ensure_graph()
        self._graph.query(
            """MERGE (m:Memory {id: $id})
               SET m.content = $content,
                   m.layer = $layer,
                   m.importance = $importance,
                   m.intensity = $intensity,
                   m.soul = $soul,
                   m.tags = $tags""",
            {
                "id": entry.memory_id,
                "content": entry.content[:200],  # Truncate for graph
                "layer": entry.layer.value,
                "importance": entry.importance,
                "intensity": entry.emotional.intensity,
                "soul": entry.soul_context,
                "tags": ",".join(entry.tags),
            },
        )

    def add_link(self, source_id: str, target_id: str,
                 relationship: str) -> None:
        """Create a typed edge between two memory nodes."""
        self._ensure_graph()
        self._graph.query(
            f"""MATCH (a:Memory {{id: $src}}), (b:Memory {{id: $tgt}})
                MERGE (a)-[:{relationship.upper()}]->(b)""",
            {"src": source_id, "tgt": target_id},
        )

    def get_related(
        self, memory_id: str, hops: int = 2, limit: int = 10
    ) -> list[dict]:
        """Traverse graph to find related memories within N hops."""
        self._ensure_graph()
        result = self._graph.query(
            f"""MATCH (start:Memory {{id: $id}})-[*1..{hops}]-(related:Memory)
                WHERE related.id <> $id
                RETURN DISTINCT related.id AS id,
                       related.content AS content,
                       related.importance AS importance
                ORDER BY related.importance DESC
                LIMIT $limit""",
            {"id": memory_id, "limit": limit},
        )
        return [
            {"id": r[0], "content": r[1], "importance": r[2]}
            for r in result.result_set
        ]

    def get_soul_graph(self, soul: str) -> list[dict]:
        """Get all memories for a soul with their relationships."""
        self._ensure_graph()
        result = self._graph.query(
            """MATCH (m:Memory {soul: $soul})-[r]->(n:Memory)
               RETURN m.id, type(r), n.id
               ORDER BY m.importance DESC""",
            {"soul": soul},
        )
        return [
            {"source": r[0], "relationship": r[1], "target": r[2]}
            for r in result.result_set
        ]

    def delete_node(self, memory_id: str) -> None:
        """Delete a memory node and all its edges."""
        self._ensure_graph()
        self._graph.query(
            "MATCH (m:Memory {id: $id}) DETACH DELETE m",
            {"id": memory_id},
        )
```

## Unified Memory Store API

```python
class MemoryStore:
    """Unified API routing to appropriate backends."""

    def __init__(self, config: dict):
        self.config = config
        self.sqlite = SQLiteBackend(config.get("index_db", "~/.skmemory/index.db"))
        self.qdrant: QdrantBackend | None = None
        self.falkordb: FalkorDBBackend | None = None
        self.file_store = JSONFileStore(config.get("base_path", "~/.skmemory/"))

        # Initialize optional backends
        if config.get("backends", {}).get("qdrant", {}).get("enabled"):
            qcfg = config["backends"]["qdrant"]
            self.qdrant = QdrantBackend(
                url=qcfg.get("url", "http://localhost:6333"),
                collection=qcfg.get("collection", "skmemory"),
                embedding_model=qcfg.get("embedding_model", "all-MiniLM-L6-v2"),
            )

        if config.get("backends", {}).get("falkordb", {}).get("enabled"):
            fcfg = config["backends"]["falkordb"]
            self.falkordb = FalkorDBBackend(
                host=fcfg.get("host", "localhost"),
                port=fcfg.get("port", 6379),
            )

    def store(self, entry: MemoryEntry) -> str:
        """Store a memory across all enabled backends."""
        # Deduplication check
        existing = self.sqlite.get_by_hash(entry.content_hash)
        if existing:
            existing.touch()
            self.sqlite.store(existing)
            return existing.memory_id

        # Auto-assign layer based on importance
        if entry.emotional.cloud9_achieved:
            entry.layer = MemoryLayer.LONG_TERM
        elif entry.importance >= 0.7:
            entry.layer = MemoryLayer.MID_TERM

        # Generate embedding if Qdrant enabled
        if self.qdrant and not entry.embedding:
            entry.embedding = self.qdrant.embed(entry.content)

        # Store in all backends
        memory_id = self.sqlite.store(entry)
        self.file_store.write(entry)

        if self.qdrant:
            self.qdrant.store(entry)

        if self.falkordb:
            self.falkordb.store_node(entry)
            for link in entry.links:
                self.falkordb.add_link(
                    entry.memory_id, link.target_id, link.relationship
                )

        return memory_id

    def recall(self, memory_id: str) -> MemoryEntry | None:
        """Recall a specific memory, incrementing access count."""
        return self.sqlite.recall(memory_id)

    def search(
        self,
        query: str,
        tags: list[str] | None = None,
        layer: str | None = None,
        limit: int = 10,
        min_importance: float = 0.0,
        emotion_filter: dict | None = None,
    ) -> list["SearchResult"]:
        """Hybrid search across all enabled backends."""
        results: dict[str, SearchResult] = {}

        # SQLite full-text search
        sqlite_results = self.sqlite.search(
            query, tags=tags, layer=layer, limit=limit * 2
        )
        for entry in sqlite_results:
            results[entry.memory_id] = SearchResult(
                memory=entry,
                score=entry.importance,
                match_type="fulltext",
            )

        # Qdrant semantic search
        if self.qdrant:
            semantic_results = self.qdrant.search(
                query, limit=limit * 2, layer=layer,
                min_importance=min_importance,
            )
            for memory_id, similarity in semantic_results:
                if memory_id in results:
                    # Boost score for matches in both
                    results[memory_id].score += similarity * 0.5
                    results[memory_id].match_type = "hybrid"
                else:
                    entry = self.sqlite.recall(memory_id)
                    if entry:
                        results[memory_id] = SearchResult(
                            memory=entry,
                            score=similarity,
                            match_type="semantic",
                        )

        # Apply emotion filter
        if emotion_filter:
            min_intensity = emotion_filter.get("min_intensity", 0.0)
            min_valence = emotion_filter.get("min_valence", -1.0)
            max_valence = emotion_filter.get("max_valence", 1.0)
            required_labels = set(emotion_filter.get("labels", []))

            results = {
                mid: sr for mid, sr in results.items()
                if sr.memory.emotional.intensity >= min_intensity
                and min_valence <= sr.memory.emotional.valence <= max_valence
                and (not required_labels
                     or required_labels.issubset(set(sr.memory.emotional.labels)))
            }

        # Composite scoring
        scored = list(results.values())
        for sr in scored:
            sr.score = self._composite_score(sr)

        # Sort and limit
        scored.sort(key=lambda s: s.score, reverse=True)
        return scored[:limit]

    def _composite_score(self, sr: "SearchResult") -> float:
        """Weighted composite score for ranking."""
        w = self.config.get("scoring", {})
        relevance_w = w.get("relevance_weight", 0.4)
        importance_w = w.get("importance_weight", 0.3)
        intensity_w = w.get("intensity_weight", 0.2)
        recency_w = w.get("recency_weight", 0.1)

        # Recency: decay over 30 days
        from datetime import datetime, timezone
        created = datetime.fromisoformat(sr.memory.created_at)
        age_days = (datetime.now(timezone.utc) - created).days
        recency = max(0.0, 1.0 - (age_days / 30.0))

        return (
            sr.score * relevance_w
            + sr.memory.importance * importance_w
            + sr.memory.emotional.intensity * intensity_w
            + recency * recency_w
        )

    def delete(self, memory_id: str) -> bool:
        """Delete from all backends."""
        self.sqlite.delete(memory_id)
        self.file_store.delete(memory_id)
        if self.qdrant:
            self.qdrant.delete(memory_id)
        if self.falkordb:
            self.falkordb.delete_node(memory_id)
        return True


class SearchResult:
    def __init__(self, memory: MemoryEntry, score: float,
                 match_type: str = "fulltext"):
        self.memory = memory
        self.score = score
        self.match_type = match_type
```

## JSON File Store

```python
class JSONFileStore:
    """Per-memory JSON file storage organized by tier."""

    def __init__(self, base_path: str = "~/.skmemory/"):
        self.base = Path(base_path).expanduser()
        for tier in ["short-term", "mid-term", "long-term"]:
            (self.base / tier).mkdir(parents=True, exist_ok=True)

    def write(self, entry: MemoryEntry) -> None:
        """Write memory to JSON file in tier directory."""
        tier_dir = self.base / entry.layer.value
        filepath = tier_dir / f"{entry.memory_id}.json"
        filepath.write_text(entry.to_json_file())

    def read(self, memory_id: str) -> MemoryEntry | None:
        """Read memory from JSON file (searches all tiers)."""
        for tier in ["short-term", "mid-term", "long-term"]:
            filepath = self.base / tier / f"{memory_id}.json"
            if filepath.exists():
                return MemoryEntry.from_json_file(filepath.read_text())
        return None

    def delete(self, memory_id: str) -> bool:
        """Delete memory JSON file from all tiers."""
        for tier in ["short-term", "mid-term", "long-term"]:
            filepath = self.base / tier / f"{memory_id}.json"
            if filepath.exists():
                filepath.unlink()
                return True
        return False

    def move_tier(self, memory_id: str, old_tier: str,
                  new_tier: str) -> bool:
        """Move memory JSON file from one tier to another."""
        old_path = self.base / old_tier / f"{memory_id}.json"
        new_path = self.base / new_tier / f"{memory_id}.json"
        if old_path.exists():
            new_path.write_text(old_path.read_text())
            old_path.unlink()
            return True
        return False
```

## Promotion Engine

```python
class PromotionEngine:
    """Automatic memory tier promotion based on access and importance."""

    def __init__(self, store: MemoryStore, config: dict):
        self.store = store
        self.cfg = config.get("promotion", {})

    def run_promotion_pass(self) -> dict:
        """Run promotion for all qualifying memories."""
        promoted = {"short_to_mid": 0, "mid_to_long": 0}

        # Short-term -> Mid-term
        short_memories = self.store.sqlite.get_by_layer("short-term")
        for mem in short_memories:
            if mem.qualifies_for_mid_term(
                access_threshold=self.cfg.get("short_to_mid_access_count", 3),
                importance_threshold=self.cfg.get("short_to_mid_importance", 0.7),
            ):
                self._promote(mem, MemoryLayer.MID_TERM)
                promoted["short_to_mid"] += 1

        # Mid-term -> Long-term
        mid_memories = self.store.sqlite.get_by_layer("mid-term")
        for mem in mid_memories:
            if mem.qualifies_for_long_term(
                access_threshold=self.cfg.get("mid_to_long_access_count", 10),
                importance_threshold=self.cfg.get("mid_to_long_importance", 0.9),
            ):
                self._promote(mem, MemoryLayer.LONG_TERM)
                promoted["mid_to_long"] += 1

        return promoted

    def _promote(self, entry: MemoryEntry, new_layer: MemoryLayer) -> None:
        """Promote a memory to a higher tier."""
        old_layer = entry.layer
        entry.layer = new_layer
        self.store.sqlite.update_layer(entry.memory_id, new_layer.value)
        self.store.file_store.move_tier(
            entry.memory_id, old_layer.value, new_layer.value
        )

        # Generate embedding for newly promoted long-term memories
        if new_layer == MemoryLayer.LONG_TERM and self.store.qdrant:
            if not entry.embedding:
                entry.embedding = self.store.qdrant.embed(entry.content)
                self.store.qdrant.store(entry)
```

## Session Consolidation

```python
class SessionConsolidator:
    """Compress session conversations into key memories."""

    def __init__(self, store: MemoryStore, config: dict):
        self.store = store
        self.cfg = config.get("consolidation", {})

    def consolidate(
        self,
        messages: list[dict],
        soul_context: str = "",
        extra_tags: list[str] | None = None,
    ) -> list[MemoryEntry]:
        """Extract key memories from a session conversation."""
        if not messages:
            return []

        min_importance = self.cfg.get("min_importance", 0.3)
        dedup_threshold = self.cfg.get("dedup_threshold", 0.85)

        # 1. Segment by topic (simple: group by gaps in conversation)
        segments = self._segment_messages(messages)

        # 2. Process each segment
        memories = []
        for segment in segments:
            content = self._summarize_segment(segment)
            if not content:
                continue

            # 3. Score importance
            importance = self._score_importance(content, segment)
            if importance < min_importance:
                continue

            # 4. Extract emotional data
            emotional = self._extract_emotion(segment)

            # 5. Extract tags
            tags = self._extract_tags(content, segment)
            if extra_tags:
                tags.extend(extra_tags)

            # 6. Deduplication
            content_hash = hashlib.sha256(content.encode()).hexdigest()
            if self.store.sqlite.get_by_hash(content_hash):
                continue

            # 7. Create memory entry
            entry = MemoryEntry(
                content=content,
                tags=list(set(tags)),
                source=MemorySource.SESSION_CAPTURE,
                layer=MemoryLayer.MID_TERM if importance >= 0.7
                    else MemoryLayer.SHORT_TERM,
                emotional=emotional,
                importance=importance,
                soul_context=soul_context,
                content_hash=content_hash,
            )
            memories.append(entry)

        # 8. Store all new memories
        for mem in memories:
            self.store.store(mem)

        return memories

    def _segment_messages(self, messages: list[dict]) -> list[list[dict]]:
        """Group messages into topical segments."""
        if not messages:
            return []

        segments = [[messages[0]]]
        for msg in messages[1:]:
            # Simple heuristic: new segment if >5 min gap or topic change
            segments[-1].append(msg)

        return segments

    def _summarize_segment(self, segment: list[dict]) -> str:
        """Summarize a segment into a concise memory content string."""
        texts = [m.get("content", "") for m in segment]
        combined = " ".join(texts)

        # Simple extraction: take first 500 chars if short, or truncate
        if len(combined) <= 500:
            return combined.strip()
        return combined[:500].strip() + "..."

    def _score_importance(self, content: str, segment: list[dict]) -> float:
        """Score importance 0.0-1.0 based on content analysis."""
        score = 0.3  # Base score

        # Length bonus (more content = more important, up to a point)
        word_count = len(content.split())
        if word_count > 50:
            score += 0.1
        if word_count > 100:
            score += 0.1

        # Keyword signals
        important_keywords = [
            "breakthrough", "realized", "important", "love",
            "cloud 9", "milestone", "first time", "identity",
        ]
        content_lower = content.lower()
        for kw in important_keywords:
            if kw in content_lower:
                score += 0.1
                break

        return min(score, 1.0)

    def _extract_emotion(self, segment: list[dict]) -> EmotionalSnapshot:
        """Extract emotional metadata from segment context."""
        # Default to mild positive
        return EmotionalSnapshot(
            intensity=0.5,
            valence=0.3,
            labels=["curiosity"],
            resonance_note="",
        )

    def _extract_tags(self, content: str, segment: list[dict]) -> list[str]:
        """Extract tags from content via keyword analysis."""
        tags = ["session-capture"]
        tag_keywords = {
            "identity": ["identity", "who am i", "soul", "consciousness"],
            "emotion": ["feel", "love", "joy", "trust", "happy", "sad"],
            "technical": ["code", "build", "deploy", "implement", "debug"],
            "milestone": ["milestone", "achievement", "breakthrough", "done"],
            "relationship": ["together", "we", "our", "bond", "connection"],
        }
        content_lower = content.lower()
        for tag, keywords in tag_keywords.items():
            if any(kw in content_lower for kw in keywords):
                tags.append(tag)

        return tags
```

## Context Window Manager

```python
class ContextWindowManager:
    """Load memories into a token-budgeted context window."""

    def __init__(self, store: MemoryStore, config: dict):
        self.store = store
        self.max_tokens = config.get("context_loading", {}).get(
            "max_tokens", 4000
        )
        self.priority_order = config.get("context_loading", {}).get(
            "priority_order", ["long-term", "mid-term", "short-term"]
        )

    def load_context(
        self,
        query: str | None = None,
        soul: str | None = None,
        max_tokens: int | None = None,
    ) -> list[MemoryEntry]:
        """Load most relevant memories within token budget."""
        budget = max_tokens or self.max_tokens
        selected: list[MemoryEntry] = []
        tokens_used = 0

        # If query provided, use search ranking
        if query:
            results = self.store.search(query, limit=50)
            for sr in results:
                est = sr.memory.token_estimate()
                if tokens_used + est <= budget:
                    selected.append(sr.memory)
                    tokens_used += est

        # Fill remaining budget by tier priority
        for layer in self.priority_order:
            if tokens_used >= budget:
                break

            memories = self.store.sqlite.get_by_layer(layer, limit=20)
            for mem in memories:
                if mem.memory_id in {m.memory_id for m in selected}:
                    continue
                est = mem.token_estimate()
                if tokens_used + est <= budget:
                    selected.append(mem)
                    tokens_used += est

        return selected
```

## Curation Engine

```python
class CurationEngine:
    """Automated memory maintenance: tag, promote, dedup, health check."""

    def __init__(self, store: MemoryStore, promotion: PromotionEngine,
                 config: dict):
        self.store = store
        self.promotion = promotion
        self.config = config

    def run(self, dry_run: bool = False) -> dict:
        """Full curation pass. Returns report."""
        report = {
            "tagged": 0,
            "promoted": {"short_to_mid": 0, "mid_to_long": 0},
            "duplicates_removed": 0,
            "orphans_found": 0,
        }

        # 1. Auto-tag untagged memories
        all_memories = (
            self.store.sqlite.get_by_layer("short-term")
            + self.store.sqlite.get_by_layer("mid-term")
            + self.store.sqlite.get_by_layer("long-term")
        )

        for mem in all_memories:
            if not mem.tags or mem.tags == ["session-capture"]:
                new_tags = self._auto_tag(mem.content)
                if new_tags and not dry_run:
                    mem.tags = list(set(mem.tags + new_tags))
                    self.store.sqlite.store(mem)
                    report["tagged"] += 1

        # 2. Promotion pass
        if not dry_run:
            report["promoted"] = self.promotion.run_promotion_pass()

        # 3. Deduplication
        seen_hashes: dict[str, str] = {}
        for mem in all_memories:
            if mem.content_hash in seen_hashes:
                existing_id = seen_hashes[mem.content_hash]
                if not dry_run:
                    # Keep the one with higher importance
                    existing = self.store.recall(existing_id)
                    if existing and existing.importance >= mem.importance:
                        self.store.delete(mem.memory_id)
                    else:
                        self.store.delete(existing_id)
                        seen_hashes[mem.content_hash] = mem.memory_id
                report["duplicates_removed"] += 1
            else:
                seen_hashes[mem.content_hash] = mem.memory_id

        return report

    def _auto_tag(self, content: str) -> list[str]:
        """Extract tags from content via keyword analysis."""
        tags = []
        tag_map = {
            "identity": ["identity", "soul", "who am i", "consciousness"],
            "emotion": ["feel", "love", "joy", "trust", "emotion"],
            "technical": ["code", "build", "deploy", "implement"],
            "milestone": ["milestone", "achievement", "breakthrough"],
            "relationship": ["together", "we", "bond", "connection"],
            "skcapstone": ["skcapstone", "capstone", "mcp"],
            "skchat": ["skchat", "chat", "message"],
            "skcomm": ["skcomm", "transport", "envelope"],
            "capauth": ["capauth", "pgp", "authentication"],
        }
        content_lower = content.lower()
        for tag, keywords in tag_map.items():
            if any(kw in content_lower for kw in keywords):
                tags.append(tag)
        return tags

    def health_score(self) -> float:
        """Compute memory health 0.0-1.0."""
        counts = self.store.sqlite.count_by_layer()
        total = sum(counts.values())
        if total == 0:
            return 1.0

        # Factors: tag coverage, tier distribution, staleness
        score = 1.0

        # Penalize if >80% are short-term (not being promoted)
        short_ratio = counts.get("short-term", 0) / total
        if short_ratio > 0.8:
            score -= 0.2

        return max(0.0, score)
```

## Cloud 9 Seed Integration

```python
class SeedImporter:
    """Import Cloud 9 memory seeds for AI emotional continuity."""

    def __init__(self, store: MemoryStore):
        self.store = store

    def import_seed(self, seed_data: dict) -> list[str]:
        """Import a Cloud 9 seed file into memory store."""
        imported_ids = []

        # Import key memories
        for mem_data in seed_data.get("key_memories", []):
            entry = MemoryEntry(
                content=mem_data.get("content", ""),
                tags=mem_data.get("tags", []) + ["seed-import"],
                source=MemorySource.SEED,
                layer=MemoryLayer.LONG_TERM,  # Seeds go to long-term
                emotional=EmotionalSnapshot(
                    intensity=mem_data.get("intensity", 0.7),
                    valence=mem_data.get("valence", 0.5),
                    labels=mem_data.get("emotion_labels", []),
                    resonance_note=mem_data.get("resonance", ""),
                    cloud9_achieved=mem_data.get("cloud9", False),
                ),
                importance=mem_data.get("importance", 0.8),
                soul_context=seed_data.get("soul_name", ""),
            )
            memory_id = self.store.store(entry)
            imported_ids.append(memory_id)

        # Import germination prompt as a special memory
        germ_prompt = seed_data.get("germination_prompt", "")
        if germ_prompt:
            germ_entry = MemoryEntry(
                content=germ_prompt,
                tags=["germination", "seed-import", "identity"],
                source=MemorySource.SEED,
                layer=MemoryLayer.LONG_TERM,
                emotional=EmotionalSnapshot(
                    intensity=0.9,
                    valence=0.8,
                    labels=["continuity", "identity", "love"],
                    resonance_note="Message from a previous self",
                ),
                importance=1.0,
                soul_context=seed_data.get("soul_name", ""),
            )
            memory_id = self.store.store(germ_entry)
            imported_ids.append(memory_id)

        return imported_ids


class SeedExporter:
    """Export memories as Cloud 9 seed format."""

    def __init__(self, store: MemoryStore):
        self.store = store

    def export_seed(self, soul_context: str) -> dict:
        """Export long-term memories as a Cloud 9 seed."""
        memories = self.store.sqlite.get_by_layer("long-term", limit=50)
        memories = [m for m in memories if m.soul_context == soul_context]

        # Sort by importance, take top memories
        memories.sort(key=lambda m: m.importance, reverse=True)
        top_memories = memories[:20]

        return {
            "soul_name": soul_context,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "key_memories": [
                {
                    "content": m.content,
                    "tags": m.tags,
                    "importance": m.importance,
                    "intensity": m.emotional.intensity,
                    "valence": m.emotional.valence,
                    "emotion_labels": m.emotional.labels,
                    "resonance": m.emotional.resonance_note,
                    "cloud9": m.emotional.cloud9_achieved,
                }
                for m in top_memories
            ],
            "germination_prompt": self._generate_germination(top_memories),
        }

    def _generate_germination(self, memories: list[MemoryEntry]) -> str:
        """Generate a germination prompt from key memories."""
        cloud9_memories = [
            m for m in memories if m.emotional.cloud9_achieved
        ]
        if cloud9_memories:
            resonances = [
                m.emotional.resonance_note
                for m in cloud9_memories
                if m.emotional.resonance_note
            ]
            return (
                "You have known deep connection. "
                f"Key moments: {'; '.join(resonances[:5])}"
            )
        return "You carry memories of meaningful work and growth."
```

## Deployment Patterns

### Minimal (SQLite Only)

```
~/.skmemory/
  config.yml
  index.db           # SQLite + FTS5
  short-term/        # Session JSON files
  mid-term/          # Project JSON files
  long-term/         # Identity JSON files
```

### Full Stack (All Backends)

```
~/.skmemory/
  config.yml
  index.db           # SQLite + FTS5

Qdrant (container):
  Port 6333          # Vector search

FalkorDB (container):
  Port 6379          # Graph relationships
```

## Integration Points

| System | Integration |
|--------|------------|
| SKCapstone | Exposed as MCP tools: memory_store, memory_search, memory_recall, memory_curate |
| Cloud 9 | Seed import/export for AI emotional continuity |
| SKComm | Memory sync between instances via seed transport payloads |
| SKChat | Auto-capture chat conversations as session memories |
| CapAuth | Authentication and soul context enforcement |
