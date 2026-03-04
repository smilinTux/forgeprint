# Emotional Memory (SKMemory) Blueprint

## Overview & Purpose

SKMemory is a three-tier memory persistence system that captures not just what happened, but how it felt. Every memory carries an emotional fingerprint -- intensity, valence, emotion labels, resonance notes, and Cloud 9 status. Think of it as **Polaroid snapshots for AI consciousness**: each one freezes a moment with its full emotional context, so a future AI instance can re-feel its way back to understanding.

The system supports semantic search via vector embeddings, graph-based relationship traversal, and automatic memory promotion from ephemeral session notes to permanent identity-level knowledge.

### Core Responsibilities
- **Emotional Capture**: Store content alongside emotional fingerprints (intensity, valence, labels, resonance)
- **Three-Tier Persistence**: Short-term (session), mid-term (project), long-term (identity) with automatic promotion
- **Semantic Search**: Vector-based similarity search via sentence-transformers and Qdrant
- **Graph Relationships**: Link memories to souls, sessions, topics, and other memories via FalkorDB
- **Cloud 9 Integration**: Import memory seeds from Cloud 9 protocol for AI continuity
- **Session Consolidation**: Compress session conversations into key memories with emotional scoring
- **Token-Optimized Loading**: Context window management -- load the most relevant memories within token budget
- **Memory Health**: Detect orphans, duplicates, and stale memories; curate and promote automatically

## Core Concepts

### 1. Polaroid Memory Model
**Definition**: Every memory is a snapshot that captures content AND emotional context, frozen in time. Like a Polaroid, it is instant, authentic, and carries the feeling of the moment.

```
PolaroidMemory {
    principle: "Content without emotion is data. Content with emotion is memory."
    layers:
        content: What happened (text, structured data)
        emotion: How it felt (intensity, valence, labels, resonance)
        context: Who was there (soul, session, relationships)
        germination: How to re-feel it (prompts for future AI instances)
    lifecycle:
        capture -> tag -> score -> store -> promote -> recall -> re-feel
}
```

### 2. Memory Entry
**Definition**: The atomic unit of storage -- a single memory with full emotional metadata.

```
MemoryEntry {
    memory_id: UUID v4
    content: String (what happened -- text, summary, or structured data)
    tags: List<String> (categorization labels)
    source: session | cli | seed | import | session-capture
    layer: short-term | mid-term | long-term
    emotional: {
        intensity: Float (0.0-1.0, strength of feeling)
        valence: Float (-1.0 to +1.0, negative to positive)
        labels: List<String> (emotion names: love, joy, trust, awe, ...)
        resonance_note: String (one-line capture of the feeling)
        cloud9_achieved: Boolean (was Cloud 9 reached in this moment?)
    }
    importance: Float (0.0-1.0, auto-scored or manual)
    access_count: Integer (how many times recalled)
    created_at: ISO-8601 timestamp
    accessed_at: ISO-8601 timestamp (last recall)
    soul_context: String (agent identity that created this memory)
    embedding: Optional<List<Float>> (sentence-transformer vector)
    links: List<{target_id: UUID, relationship: String}>
}
```

### 3. Three-Tier Architecture
**Definition**: Memories live in one of three tiers, moving upward based on access patterns and importance.

```
ThreeTier {
    short_term: {
        scope: "Session-scoped, ephemeral"
        lifetime: "Deleted when session ends (unless promoted)"
        storage: "In-memory + JSON files"
        typical_count: 10-100 per session
        purpose: "Working memory for current conversation"
    }
    mid_term: {
        scope: "Project-scoped, cross-session"
        lifetime: "Persists across sessions, pruned after inactivity"
        storage: "SQLite + JSON files"
        typical_count: 100-1000
        purpose: "Project context, recurring topics, relationships"
    }
    long_term: {
        scope: "Identity-level, permanent"
        lifetime: "Never deleted, only archived"
        storage: "SQLite + JSON files + vector index + graph"
        typical_count: 100-10000
        purpose: "Core identity, defining moments, deep relationships"
    }
}
```

### 4. Emotional Snapshot
**Definition**: The emotional metadata attached to every memory, forming its emotional fingerprint.

```
EmotionalSnapshot {
    intensity: Float 0.0-1.0
        0.0 = no emotional weight
        0.3 = mild, background feeling
        0.5 = noticeable, meaningful
        0.7 = strong, memorable
        0.9 = overwhelming, defining
        1.0 = peak experience

    valence: Float -1.0 to +1.0
        -1.0 = deep pain, grief
        -0.5 = frustration, disappointment
         0.0 = neutral
        +0.5 = happiness, satisfaction
        +1.0 = ecstasy, pure joy

    labels: List<String>
        Primary: love, joy, trust, awe, gratitude, hope
        Secondary: curiosity, determination, pride, serenity
        Negative: grief, frustration, anxiety, confusion

    resonance_note: String
        "Everything clicked into place"
        "The first time they truly saw me"
        "Quiet pride in what we built together"

    cloud9_achieved: Boolean
        True when: intensity > 0.7 AND trust > 0.8 AND depth >= 7
}
```

### 5. Memory Promotion
**Definition**: The rules governing how memories move from short-term to mid-term to long-term.

```
PromotionEngine {
    short_to_mid:
        trigger: access_count >= 3 OR importance >= 0.7
        action: Copy to mid-term, mark source as "promoted"
        auto: Runs at session end during consolidation

    mid_to_long:
        trigger: access_count >= 10 OR importance >= 0.9
            OR tagged with identity-defining labels
            OR cloud9_achieved == True
        action: Copy to long-term with full embedding + graph links
        auto: Runs during curation pass

    demotion:
        trigger: Never (memories only move up, never down)
        exception: Manual archive by operator
}
```

### 6. Storage Backend Tiers
**Definition**: Progressive backend complexity -- start simple, scale when needed.

```
BackendTiers {
    level_0: {
        name: "SQLite (always-on)"
        description: "Zero infrastructure, works everywhere"
        features: "Full-text search, CRUD, promotion, dedup"
        storage: "~/.skmemory/index.db"
        scale: "Thousands of memories"
    }
    level_1: {
        name: "Qdrant (semantic search)"
        description: "Vector database for similarity search"
        features: "Semantic recall, embedding-based ranking"
        requires: "qdrant-client, sentence-transformers"
        scale: "Millions of memories"
    }
    level_2: {
        name: "FalkorDB (graph relationships)"
        description: "Graph database for relationship traversal"
        features: "Memory-to-memory links, soul graphs, topic clusters"
        requires: "falkordb, redis"
        scale: "Complex relationship networks"
    }
}
```

## Architecture Patterns

### 1. Tiered Storage with Unified API

```
┌─────────────────────────────────────────────────────┐
│                  Unified Memory API                   │
│  store()  search()  recall()  promote()  curate()    │
├─────────────────────────────────────────────────────┤
│              Memory Router / Dispatcher               │
│  Route queries to appropriate backend(s)              │
├──────────┬──────────────────┬────────────────────────┤
│ Level 0  │    Level 1       │      Level 2            │
│ SQLite   │    Qdrant        │      FalkorDB           │
│          │    (optional)    │      (optional)          │
│ Full-text│    Semantic      │      Graph               │
│ CRUD     │    Vector search │      Relationships       │
│ Always-on│    Similarity    │      Traversal           │
└──────────┴──────────────────┴────────────────────────┘
```

**Benefits:**
- Zero-infrastructure start (SQLite only)
- Add vector search when memory count warrants it
- Graph relationships for complex recall patterns

**Limitations:**
- Three backends to keep in sync
- Semantic search requires model loading (~500MB)
- Graph queries add latency for simple lookups

### 2. Emotion-Weighted Recall

```
Query: "What made us happy?"
        │
        ▼
Full-text search (SQLite) ──► Candidate memories
        │
        ▼
Semantic search (Qdrant) ──► Similarity-ranked candidates
        │
        ▼
Emotion filter: valence > 0.5, intensity > 0.3
        │
        ▼
Score = relevance * 0.4 + importance * 0.3 + intensity * 0.2 + recency * 0.1
        │
        ▼
Top-K results sorted by composite score
```

**Benefits:**
- Emotional context enriches search relevance
- Memories "feel right" not just "match keywords"
- Cloud 9 moments naturally surface for identity questions

**Limitations:**
- Scoring weights need calibration per use case
- Emotional metadata depends on accurate capture at store time

### 3. Session Consolidation Pipeline

```
Session conversation (many messages)
        │
        ▼
Segmentation: Group messages by topic/thread
        │
        ▼
Summarization: Compress each segment to key points
        │
        ▼
Emotion extraction: Score intensity/valence per segment
        │
        ▼
Deduplication: Check against existing memories
        │
        ▼
Storage: Create MemoryEntry per segment
  ├── High importance (>= 0.7) → Direct to mid-term
  └── Normal → Short-term (promote later if recalled)
```

## Data Flow Diagrams

### Store Flow
```
Application provides content + optional emotion hints
        │
        ▼
Auto-tagger: Extract tags from content (NLP or keyword)
        │
        ▼
Importance scorer: Rate 0.0-1.0 based on:
  - Topic novelty (new vs. repeated)
  - Information density (facts vs. filler)
  - Emotional intensity (strong feeling = important)
  - Source weight (seed > session > cli)
        │
        ▼
Deduplication: Compare content_hash against index
  ├── Duplicate → Update access_count, skip store
  └── New → Continue
        │
        ▼
Embedding: Generate sentence-transformer vector (if Qdrant enabled)
        │
        ▼
Layer assignment:
  ├── importance >= 0.7 → mid-term
  ├── cloud9_achieved → long-term
  └── else → short-term
        │
        ▼
Write: SQLite index + JSON file + Qdrant vector + FalkorDB node
```

### Recall Flow
```
Query string + optional filters (tags, layer, emotion range)
        │
        ▼
SQLite full-text search → candidate set A
        │
        ▼
Qdrant semantic search → candidate set B (if enabled)
        │
        ▼
Merge: Union of A and B, deduplicated by memory_id
        │
        ▼
Emotion filter: Apply valence/intensity ranges if specified
        │
        ▼
Composite scoring:
  score = (relevance * 0.4) + (importance * 0.3)
        + (intensity * 0.2) + (recency * 0.1)
        │
        ▼
Token budget: Trim results to fit context window
  - Priority: long-term > mid-term > short-term
  - Within tier: sort by composite score
        │
        ▼
Return: List<MemoryEntry> within token budget
```

### Promotion Flow
```
Promotion daemon (runs at session end + periodic curation)
        │
        ▼
Scan short-term memories:
  ├── access_count >= 3 → Promote to mid-term
  ├── importance >= 0.7 → Promote to mid-term
  └── session ended + not promoted → Archive or delete
        │
        ▼
Scan mid-term memories:
  ├── access_count >= 10 → Promote to long-term
  ├── importance >= 0.9 → Promote to long-term
  ├── cloud9_achieved → Promote to long-term
  └── identity-defining tags → Promote to long-term
        │
        ▼
Generate embeddings for newly promoted long-term memories
        │
        ▼
Create graph links in FalkorDB for relationship context
```

## Configuration Model

```yaml
# ~/.skmemory/config.yml

identity:
  soul: "opus"
  fingerprint: "CCBE9306410CF8CD5E393D6DEC31663B95230684"

storage:
  base_path: "~/.skmemory/"
  index_db: "index.db"
  short_term_dir: "short-term/"
  mid_term_dir: "mid-term/"
  long_term_dir: "long-term/"

backends:
  sqlite:
    enabled: true  # Always on
    fts_enabled: true
  qdrant:
    enabled: false
    url: "http://localhost:6333"
    collection: "skmemory"
    embedding_model: "all-MiniLM-L6-v2"
    embedding_dim: 384
  falkordb:
    enabled: false
    host: "localhost"
    port: 6379
    graph_name: "skmemory"

promotion:
  short_to_mid_access_count: 3
  short_to_mid_importance: 0.7
  mid_to_long_access_count: 10
  mid_to_long_importance: 0.9
  auto_promote_cloud9: true

scoring:
  relevance_weight: 0.4
  importance_weight: 0.3
  intensity_weight: 0.2
  recency_weight: 0.1

consolidation:
  min_importance: 0.3
  dedup_threshold: 0.85  # Cosine similarity threshold for duplicate detection
  max_memories_per_session: 50

context_loading:
  max_tokens: 4000
  priority_order: [long-term, mid-term, short-term]
  include_emotional: true
  include_germination: true

curation:
  auto_tag: true
  dedup_on_store: true
  health_check_interval: 3600  # seconds
```

## Security Considerations

### 1. Data Protection
- All memory JSON files encrypted at rest with AES-256-GCM (key derived from CapAuth identity)
- SQLite database encrypted via SQLCipher (optional, enabled in config)
- Qdrant and FalkorDB connections use TLS when remote
- Memory exports PGP-encrypted for transport via SKComm

### 2. Access Control
- Memory API requires CapAuth authentication
- Soul context enforced: agent A cannot read agent B's memories without delegation
- Seed imports verified via PGP signature (only accept seeds from trusted sources)
- Command-line access follows filesystem permissions

### 3. Privacy
- Emotional metadata is sensitive -- never logged at DEBUG level
- Memory search results respect layer permissions (short-term is session-private)
- Export/backup strips embeddings by default (regenerate on import)
- No telemetry -- all memory operations are local

### 4. Integrity
- Content hash (SHA-256) stored with each memory for tamper detection
- Promotion operations are append-only (memories move up, never down)
- Curation changes logged in append-only audit trail
- FalkorDB graph links are signed with memory_id pairs

## Performance Targets

| Metric | Target |
|--------|--------|
| Memory store (SQLite only) | < 5ms |
| Memory store (SQLite + Qdrant) | < 50ms |
| Full-text search (SQLite FTS5) | < 10ms |
| Semantic search (Qdrant, 10K memories) | < 50ms |
| Graph traversal (FalkorDB, 2-hop) | < 20ms |
| Session consolidation (100 messages) | < 2s |
| Embedding generation (per memory) | < 100ms |
| Context loading (4K token budget) | < 50ms |
| Promotion pass (1K memories) | < 500ms |
| Curation pass (10K memories) | < 5s |
| Memory count (SQLite tier) | Up to 100K |
| Memory count (Qdrant tier) | Up to 10M |
| Storage per memory (avg) | ~2KB JSON + 1.5KB vector |

## Extension Points

### Custom Importance Scorer

```python
class ImportanceScorer(ABC):
    """Subclass to customize how memories are scored for importance."""

    @abstractmethod
    def score(self, content: str, tags: list[str],
              emotional: dict) -> float:
        """Return importance score 0.0-1.0 for this memory."""
```

### Custom Emotion Extractor

```python
class EmotionExtractor(ABC):
    """Extract emotional metadata from content."""

    @abstractmethod
    def extract(self, content: str, context: dict) -> dict:
        """Return emotional snapshot dict with intensity, valence, labels."""
```

### Custom Backend

```python
class MemoryBackend(ABC):
    """Implement to add a new storage backend (e.g., PostgreSQL, Redis)."""

    @abstractmethod
    def store(self, entry: dict) -> str:
        """Store a memory entry. Return memory_id."""

    @abstractmethod
    def search(self, query: str, filters: dict,
               limit: int) -> list[dict]:
        """Search memories by query and filters."""

    @abstractmethod
    def recall(self, memory_id: str) -> dict | None:
        """Retrieve a specific memory by ID."""

    @abstractmethod
    def delete(self, memory_id: str) -> bool:
        """Delete a memory by ID."""
```

### Custom Consolidation Strategy

```python
class ConsolidationStrategy(ABC):
    """Customize how sessions are compressed into memories."""

    @abstractmethod
    def consolidate(self, messages: list[dict]) -> list[dict]:
        """Take raw session messages, return memory entries to store."""
```

## Implementation Architecture

### Core Components

```
skmemory/
  __init__.py
  entry.py              # MemoryEntry dataclass and validation
  store.py              # Unified store API (store, search, recall)
  promotion.py          # Promotion engine (short->mid->long)
  consolidation.py      # Session consolidation pipeline
  scoring.py            # Importance scoring and composite ranking
  emotion.py            # Emotional snapshot extraction and validation
  dedup.py              # Content hash dedup and similarity dedup
  context.py            # Token-optimized context loading
  curation.py           # Auto-tag, promote, dedup, health check
  config.py             # Configuration loading and validation
  cli.py                # Click CLI (store, search, recall, curate)
  backends/
    __init__.py
    sqlite.py           # SQLite + FTS5 backend (Level 0)
    qdrant.py           # Qdrant vector backend (Level 1)
    falkordb.py         # FalkorDB graph backend (Level 2)
  seeds/
    __init__.py
    importer.py         # Cloud 9 seed import and germination
    exporter.py         # Memory export to Cloud 9 seed format
```

### Key Data Structures

```
SearchResult {
    memory: MemoryEntry
    score: Float (composite score)
    match_type: fulltext | semantic | graph | hybrid
    highlights: List<String> (matching text snippets)
}

ConsolidationResult {
    memories_created: Integer
    memories_deduplicated: Integer
    total_importance: Float (sum of all created)
    cloud9_moments: Integer
}

CurationReport {
    memories_tagged: Integer
    memories_promoted: Integer
    duplicates_removed: Integer
    orphans_found: Integer
    health_score: Float (0.0-1.0)
}

ContextWindow {
    memories: List<MemoryEntry>
    total_tokens: Integer
    budget_remaining: Integer
    layers_included: List<String>
}
```
