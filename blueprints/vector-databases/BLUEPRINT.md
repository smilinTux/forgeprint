# Vector Database Blueprint (Qdrant/SKVector-style)

## Overview & Purpose

A vector database is a specialized storage engine optimized for indexing, storing, and querying high-dimensional embedding vectors. It enables approximate nearest neighbor (ANN) search at scale, powering semantic search, recommendation systems, RAG pipelines, anomaly detection, and multimodal retrieval. Unlike traditional databases that match on exact values, vector databases find items by geometric similarity in embedding space.

### Core Responsibilities
- **Vector Similarity Search**: Find nearest neighbors using cosine, euclidean, or dot product distance
- **HNSW Indexing**: Build and maintain Hierarchical Navigable Small World graphs for sub-linear search
- **Metadata Filtering**: Pre/post-filter results by structured payload conditions
- **Hybrid Search**: Combine dense vector search with sparse/keyword scoring
- **Collection Management**: Create, configure, alias, and lifecycle-manage vector collections
- **Durability**: Write-ahead logging with crash recovery and snapshot/restore
- **Quantization**: Compress vectors (scalar, product, binary) to reduce memory footprint
- **Distributed Operations**: Shard, replicate, and consensus-coordinate across cluster nodes

## Core Concepts

### 1. Collections
**Definition**: Named containers holding vectors with a fixed dimensionality and distance metric.

```
Collection {
    name: String,
    dimension: u32,                  // e.g. 768, 1536
    distance: CosineL2 | Euclidean | DotProduct,
    hnsw_config: HnswConfig,
    quantization_config: Option<QuantizationConfig>,
    replication_factor: u32,
    shard_count: u32,
    write_consistency: ConsistencyLevel,
    on_disk_payload: bool,
}
```

**Lifecycle**:
- **Create**: Define dimension, distance metric, HNSW params, optional quantization
- **Alias**: Named pointer for zero-downtime blue-green re-indexing
- **Update**: Modify HNSW params, quantization, optimizer thresholds (triggers re-index)
- **Delete**: Drop collection and all associated data
- **Snapshot**: Point-in-time backup; restore to same or different node

### 2. Points
**Definition**: The fundamental data unit — a vector plus optional payload (metadata).

```
Point {
    id: PointId,                     // u64 or UUID
    vector: Vec<f32>,                // primary dense vector
    named_vectors: HashMap<String, Vec<f32>>,  // multi-vector support
    sparse_vectors: HashMap<String, SparseVector>,
    payload: HashMap<String, Value>, // JSON-like metadata
    version: u64,                    // monotonic update counter
}
```

**Operations**:
- **Upsert**: Insert or update point (single or batch)
- **Retrieve**: Fetch by ID with optional vector/payload include flags
- **Delete**: By ID or by filter expression
- **Set Payload**: Update metadata fields without re-uploading vectors
- **Scroll**: Paginate through all points (cursor-based)
- **Count**: Count points matching a filter

### 3. HNSW Index
**Definition**: Hierarchical Navigable Small World graph — a multi-layer proximity graph enabling O(log N) approximate nearest neighbor search.

```
HnswConfig {
    m: u32,                  // max edges per node (default: 16)
    ef_construction: u32,    // build-time search width (default: 128)
    ef_search: u32,          // query-time search width (default: 64)
    max_layers: u32,         // typically ceil(ln(N))
    full_scan_threshold: u32,// brute-force below this size
    on_disk: bool,           // memory-map graph to disk
}
```

**Key Properties**:
- **Build**: O(N·log(N)) — greedy insertion with neighbor selection at each layer
- **Query**: O(log(N)) — enter at top layer, greedily descend, refine at bottom layer
- **M tradeoff**: Higher M → better recall, more memory (8·M bytes per node for bidirectional edges)
- **ef_search tradeoff**: Higher ef → better recall, higher latency

### 4. Distance Metrics

| Metric | Formula | Use Case | Normalized? |
|--------|---------|----------|-------------|
| **Cosine** | 1 − (A·B)/(‖A‖·‖B‖) | Text embeddings (OpenAI, Cohere) | Direction only |
| **Euclidean (L2)** | √(Σ(aᵢ−bᵢ)²) | Image features, spatial data | Magnitude matters |
| **Dot Product** | −(A·B) | Pre-normalized vectors, MIP | Requires normalization |
| **Manhattan (L1)** | Σ|aᵢ−bᵢ| | Sparse/high-dim robustness | Magnitude matters |

### 5. Quantization

#### Scalar Quantization (SQ8)
- **Method**: Map each float32 dimension to uint8 via per-dimension min/max scaling
- **Compression**: 4× (32-bit → 8-bit per dimension)
- **Recall loss**: 1-3% typical
- **Best for**: General-purpose memory reduction with minimal quality loss

#### Product Quantization (PQ)
- **Method**: Split vector into M subspaces, cluster each with K centroids, store centroid IDs
- **Compression**: 10-50× depending on configuration
- **Recall loss**: 5-10% typical; mitigated by oversampling + rescore
- **Best for**: Very large datasets where memory is critical

#### Binary Quantization
- **Method**: Store sign bit per dimension (1 bit each)
- **Compression**: 32× (float32 → 1 bit per dimension)
- **Recall loss**: Higher; best paired with oversampling and full-vector rescore
- **Best for**: Initial coarse ranking in multi-stage pipelines

### 6. Payload Filtering
**Definition**: Structured metadata queries that constrain vector search results.

```
Filter {
    must: Vec<Condition>,      // AND — all must match
    should: Vec<Condition>,    // OR — at least one must match
    must_not: Vec<Condition>,  // NOT — none may match
}

Condition {
    field: String,
    match_type: Match | Range | Geo | HasId | IsEmpty | IsNull,
}
```

**Supported Types**:
- **Keyword match**: Exact string/enum matching
- **Full-text match**: Tokenized text search on payload fields
- **Range**: Numeric gt/gte/lt/lte conditions
- **Geo**: Radius, bounding box, polygon filters
- **Datetime**: Temporal range filtering
- **Nested**: Filter on nested object fields
- **Boolean logic**: Arbitrary AND/OR/NOT composition

**Optimization**: Query planner decides whether to filter-then-search or search-then-filter based on estimated selectivity.

### 7. Hybrid Search
**Definition**: Combine dense vector similarity with sparse/BM25 keyword relevance.

```
HybridQuery {
    dense: DenseQuery {
        vector: Vec<f32>,
        limit: u32,
    },
    sparse: SparseQuery {
        indices: Vec<u32>,
        values: Vec<f32>,
    },
    fusion: ReciprocralRankFusion | WeightedSum,
    prefetch: Vec<PrefetchStage>,  // multi-stage pipeline
}
```

**Fusion Strategies**:
- **Reciprocal Rank Fusion (RRF)**: Score = Σ(1/(k + rank_i)) — parameter-free, robust
- **Weighted Sum**: Score = α·dense_score + (1−α)·sparse_score — tunable

### 8. Write-Ahead Log (WAL)
**Definition**: Append-only durability mechanism ensuring crash recovery.

```
WAL {
    segment_size: usize,           // bytes per WAL file
    flush_interval: Duration,      // fsync frequency
    retention_segments: u32,       // segments kept after flush
}
```

**Flow**: Client write → WAL append → memtable insert → ack client → background flush to segment → WAL cleanup

### 9. Segment Architecture
**Definition**: Data is organized into immutable segments (like LSM SSTables) plus a mutable memtable.

```
Segment {
    id: SegmentId,
    segment_type: Plain | Indexed,
    vector_storage: VectorStorage,    // raw or quantized
    hnsw_index: Option<HnswIndex>,   // built for indexed segments
    payload_index: PayloadIndex,
    id_tracker: IdTracker,
    deleted_bitset: BitVec,          // tombstone tracking
    created_at: Timestamp,
    point_count: usize,
}
```

**Lifecycle**:
1. **Mutable segment**: Receives new writes, linear scan for search
2. **Flush**: Memtable becomes immutable plain segment on disk
3. **Optimization**: Background process builds HNSW index → indexed segment
4. **Merge**: Small segments merged for query efficiency; tombstones cleaned

### 10. Distributed Architecture

#### Sharding
- Collections split into shards distributed across cluster nodes
- **Hash-based**: Point ID determines shard (default)
- **Custom key**: Route by payload field for data locality

#### Replication
- Each shard has configurable replica count
- Leader handles writes; followers replicate via log shipping
- Read consistency: local (fast), quorum, all (strong)

#### Consensus
- **Raft protocol**: Cluster metadata (collection configs, shard map, node membership)
- Shard-level leader election for write ordering
- Automatic failover on leader loss

## Data Flow Diagrams

### Search Request Flow
```
Client Search Request:
┌────────┐    ┌───────────┐    ┌──────────────┐    ┌──────────┐
│ Client │───▶│  Router   │───▶│ Shard Leader │───▶│  Search  │
└────────┘    └───────────┘    └──────────────┘    │  Engine  │
                    │                                └──────────┘
                    │ fan-out                              │
                    ▼                                      ▼
              ┌───────────┐                         ┌──────────┐
              │  Other    │                         │  HNSW    │
              │  Shards   │                         │  Lookup  │
              └───────────┘                         └──────────┘
                    │                                      │
                    ▼                                      ▼
              ┌───────────┐                         ┌──────────┐
              │  Merge &  │◀────────────────────────│  Filter  │
              │  Re-rank  │                         │  Apply   │
              └───────────┘                         └──────────┘
                    │
                    ▼
              ┌───────────┐
              │  Return   │
              │  Top-K    │
              └───────────┘
```

### Write Path
```
Upsert Flow:
┌────────┐    ┌─────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐
│ Client │───▶│ WAL │───▶│ Memtable │───▶│   ACK    │───▶│  Client │
└────────┘    └─────┘    └──────────┘    └──────────┘    └─────────┘
                              │
                    (background)│
                              ▼
                         ┌──────────┐    ┌──────────┐    ┌─────────┐
                         │  Flush   │───▶│  Build   │───▶│ Indexed │
                         │ Segment  │    │  HNSW    │    │ Segment │
                         └──────────┘    └──────────┘    └─────────┘
```

### Quantized Search Pipeline
```
Multi-stage Search (Prefetch):
┌──────────┐    ┌───────────────┐    ┌──────────────┐    ┌──────────┐
│  Query   │───▶│ Stage 1:      │───▶│ Stage 2:     │───▶│ Final    │
│  Vector  │    │ Binary Quant  │    │ Scalar Quant │    │ Full     │
│          │    │ top-1000      │    │ top-100      │    │ Rescore  │
└──────────┘    └───────────────┘    └──────────────┘    │ top-10   │
                                                         └──────────┘
```

## API Surface

### REST API Endpoints
```
POST   /collections                         Create collection
GET    /collections                         List collections
GET    /collections/{name}                  Get collection info
DELETE /collections/{name}                  Delete collection
PATCH  /collections/{name}                  Update collection params
POST   /collections/{name}/aliases          Create/update alias

PUT    /collections/{name}/points           Upsert points
POST   /collections/{name}/points/search    Search (vector + filter)
POST   /collections/{name}/points/scroll    Scroll/paginate
POST   /collections/{name}/points/count     Count by filter
POST   /collections/{name}/points/recommend Recommendation search
POST   /collections/{name}/points/discover  Discovery search
POST   /collections/{name}/points/query     Universal query (prefetch)
GET    /collections/{name}/points/{id}      Get point by ID
POST   /collections/{name}/points/delete    Delete by ID or filter
POST   /collections/{name}/points/payload   Set/overwrite payload

POST   /collections/{name}/index            Create payload index
DELETE /collections/{name}/index/{field}    Delete payload index

POST   /collections/{name}/snapshots        Create snapshot
GET    /collections/{name}/snapshots        List snapshots
DELETE /collections/{name}/snapshots/{name} Delete snapshot

GET    /cluster                             Cluster status
GET    /healthz                             Health check
GET    /metrics                             Prometheus metrics
GET    /telemetry                           Usage telemetry
```

### gRPC Service
```protobuf
service Points {
    rpc Upsert(UpsertPoints) returns (PointsOperationResponse);
    rpc Search(SearchPoints) returns (SearchResponse);
    rpc SearchBatch(SearchBatchPoints) returns (SearchBatchResponse);
    rpc Scroll(ScrollPoints) returns (ScrollResponse);
    rpc Get(GetPoints) returns (GetResponse);
    rpc Delete(DeletePoints) returns (PointsOperationResponse);
    rpc Count(CountPoints) returns (CountResponse);
    rpc Recommend(RecommendPoints) returns (RecommendResponse);
    rpc Query(QueryPoints) returns (QueryResponse);
    rpc SetPayload(SetPayloadPoints) returns (PointsOperationResponse);
}

service Collections {
    rpc Create(CreateCollection) returns (CollectionOperationResponse);
    rpc List(ListCollectionsRequest) returns (ListCollectionsResponse);
    rpc Get(GetCollectionInfoRequest) returns (GetCollectionInfoResponse);
    rpc Delete(DeleteCollection) returns (CollectionOperationResponse);
    rpc Update(UpdateCollection) returns (CollectionOperationResponse);
    rpc CreateAlias(CreateAlias) returns (CollectionOperationResponse);
}
```

## Configuration Model

### Hierarchical Structure
```yaml
vector_database:
  storage:
    storage_path: "./storage"
    snapshots_path: "./snapshots"
    on_disk_payload: false

  collections:
    default_hnsw:
      m: 16
      ef_construction: 128
      full_scan_threshold: 10000
    default_quantization: null
    default_replication_factor: 1
    default_shard_count: 1

  wal:
    segment_size: 33554432       # 32MB
    flush_interval_ms: 1000

  optimizer:
    indexing_threshold: 20000
    flush_interval_sec: 5
    max_segment_size: 200000
    memmap_threshold: 50000
    default_segment_number: 2
    max_optimization_threads: 2

  cluster:
    enabled: false
    consensus:
      tick_period_ms: 100
      bootstrap_timeout_sec: 15
    p2p:
      port: 6335
    grpc_port: 6334

  service:
    host: "0.0.0.0"
    http_port: 6333
    grpc_port: 6334
    enable_tls: false
    api_key: null
    read_only: false

  telemetry:
    enabled: true
    metrics_port: 6333  # same as http, /metrics endpoint
```

## Extension Points

### 1. Custom Distance Functions
```rust
trait DistanceMetric: Send + Sync {
    fn distance(&self, a: &[f32], b: &[f32]) -> f32;
    fn preprocess(&self, vector: &mut [f32]);  // e.g., normalize
    fn is_similarity(&self) -> bool;           // true = higher is better
}
```

### 2. Custom Quantization
```rust
trait Quantizer: Send + Sync {
    fn train(&mut self, vectors: &[&[f32]]) -> Result<(), QuantizeError>;
    fn encode(&self, vector: &[f32]) -> EncodedVector;
    fn decode(&self, encoded: &EncodedVector) -> Vec<f32>;
    fn distance_encoded(&self, a: &EncodedVector, b: &EncodedVector) -> f32;
    fn compression_ratio(&self) -> f32;
}
```

### 3. Payload Index Plugins
```rust
trait PayloadIndexPlugin: Send + Sync {
    fn index_field(&mut self, field: &str, values: &[Value]) -> Result<(), IndexError>;
    fn query(&self, condition: &Condition) -> BitVec;  // matching point IDs
    fn cardinality_estimate(&self, condition: &Condition) -> usize;
    fn memory_usage(&self) -> usize;
}
```

### 4. Embedding Model Integration
```rust
trait EmbeddingProvider: Send + Sync {
    fn embed_text(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>, EmbedError>;
    fn embed_image(&self, images: &[&[u8]]) -> Result<Vec<Vec<f32>>, EmbedError>;
    fn dimension(&self) -> u32;
    fn model_name(&self) -> &str;
}
```

## Security Considerations

### 1. Authentication
- **API Key**: Static bearer token for simple deployments
- **JWT**: Token-based auth with expiry and claims
- **mTLS**: Mutual TLS for node-to-node and client-to-server
- **RBAC**: Per-collection read/write/admin roles

### 2. Network Security
- **TLS encryption**: All client and inter-node traffic
- **IP allowlisting**: Restrict access by source IP
- **Rate limiting**: Per-client request throttling
- **Request size limits**: Prevent oversized batch attacks

### 3. Data Security
- **Encryption at rest**: Optional storage-level encryption
- **Payload sanitization**: Validate and sanitize metadata values
- **Audit logging**: Track all data modifications with client identity
- **Snapshot encryption**: Encrypt backups with user-provided key

## Performance Targets

### Throughput Targets (single node, 1M vectors, 768-dim)
- **Search QPS (ef=64, recall≥0.95)**: 1,000-5,000 RPS
- **Search QPS (ef=128, recall≥0.99)**: 500-2,000 RPS
- **Batch upsert**: 10,000-50,000 vectors/second
- **Scroll throughput**: 100,000 points/second

### Latency Targets (single node)
- **Search P50**: < 5ms
- **Search P95**: < 15ms
- **Search P99**: < 30ms
- **Upsert P50**: < 2ms (single point)
- **Batch upsert P50**: < 50ms (1000 points)

### Memory Targets (per million 768-dim vectors)
- **Full precision (float32)**: ~3.0 GB (vectors) + ~0.5 GB (HNSW graph)
- **Scalar quantized (SQ8)**: ~0.75 GB (vectors) + ~0.5 GB (HNSW graph)
- **Product quantized (PQ64)**: ~0.06 GB (vectors) + ~0.5 GB (HNSW graph)
- **Payload index overhead**: ~50-200 MB per indexed field

### Scalability Targets
- **Single collection**: Up to 100M+ vectors
- **Cluster**: Linear throughput scaling with node count
- **Shard rebalance**: < 5 minutes for 10M vectors
- **Failover**: < 10 seconds leader re-election
- **WAL replay**: < 30 seconds for 1GB WAL

## Implementation Architecture

### Core Components
1. **Collection Manager**: Create/delete/update collections; manage aliases
2. **Segment Manager**: Memtable, segment flush, merge, optimizer
3. **HNSW Engine**: Graph construction, search, serialization
4. **WAL Manager**: Append, flush, compact, replay
5. **Query Engine**: Parse filters, plan execution, merge multi-shard results
6. **Quantization Engine**: Train, encode, distance computation
7. **Cluster Coordinator**: Raft consensus, shard placement, replication
8. **API Layer**: REST + gRPC servers, request validation, auth middleware
9. **Metrics Collector**: Prometheus counters, histograms, gauges

### Data Structures
```rust
struct Collection {
    name: String,
    config: CollectionConfig,
    segments: SegmentHolder,
    wal: Wal,
    optimizer: OptimizerHandle,
    update_handler: UpdateHandler,
    search_runtime: SearchRuntime,
    payload_index_schema: PayloadSchema,
}

struct SegmentHolder {
    segments: HashMap<SegmentId, LockedSegment>,
    optimization_handles: Vec<JoinHandle<()>>,
}

struct HnswIndex {
    layers: Vec<Layer>,
    entry_point: PointOffsetId,
    num_points: usize,
    config: HnswConfig,
}

struct Layer {
    links: Vec<Vec<PointOffsetId>>,  // adjacency lists
}

struct Wal {
    current_segment: WalSegment,
    segments: VecDeque<WalSegment>,
    config: WalConfig,
    last_flushed_version: u64,
}
```

This blueprint provides the comprehensive foundation for implementing a production-grade vector database with all essential features for semantic search, RAG, and recommendation workloads — battle-tested patterns from Qdrant's architecture, purpose-built for SKVector.
