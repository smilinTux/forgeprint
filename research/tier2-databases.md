# Forgeprint Tier 2 Database Categories — Exhaustive Research

> Generated: 2026-02-13 | For SKVector, SKGraph, Redis-style, Document, TimeSeries, Search engine provider implementations

---

# 1. Vector Databases (Qdrant-style / SKVector)

## 1.1 Top 10 Open-Source Vector Databases

| # | Name | Language | GitHub Stars (approx) | License | Key Differentiator |
|---|------|----------|-----------------------|---------|--------------------|
| 1 | **Milvus** | Go/C++ | ~32k | Apache 2.0 | Most mature distributed vector DB; GPU-accelerated indexing |
| 2 | **Qdrant** | Rust | ~22k | Apache 2.0 | Rust performance + rich filtering; payload-first design |
| 3 | **Weaviate** | Go | ~12k | BSD-3 | Built-in vectorizer modules (transformers, OpenAI); GraphQL API |
| 4 | **ChromaDB** | Python | ~16k | Apache 2.0 | Developer-friendly embedding store; LangChain native |
| 5 | **pgvector** | C | ~13k | PostgreSQL | Vector search as Postgres extension; zero new infra |
| 6 | **LanceDB** | Rust | ~5k | Apache 2.0 | Serverless, Lance columnar format; embedded-first |
| 7 | **Vespa** | Java/C++ | ~6k | Apache 2.0 | Production search+recommendation+vector in one; Yahoo lineage |
| 8 | **Vald** | Go | ~1.5k | Apache 2.0 | Cloud-native distributed ANN; Kubernetes-native |
| 9 | **Marqo** | Python | ~5k | Apache 2.0 | Tensor search; auto-generates embeddings from text/images |
| 10 | **txtai** | Python | ~9k | Apache 2.0 | All-in-one embeddings DB + ML pipeline; lightweight |

## 1.2 Top 10 Proprietary / SaaS Vector Solutions

| # | Name | Vendor | Pricing (approx) |
|---|------|--------|-------------------|
| 1 | **Pinecone** | Pinecone | Free tier; Starter $70/mo; Enterprise custom |
| 2 | **Zilliz Cloud** | Zilliz (Milvus) | Free tier; Standard from $65/mo; Enterprise custom |
| 3 | **Weaviate Cloud** | Weaviate | Free sandbox; Standard ~$25/mo per 1M vectors |
| 4 | **Qdrant Cloud** | Qdrant | Free 1GB; from $25/mo for 4GB RAM |
| 5 | **MongoDB Atlas Vector Search** | MongoDB | Included in Atlas pricing; M10+ clusters |
| 6 | **SingleStore** | SingleStore | Free tier; Standard from $0.68/hr |
| 7 | **Supabase pgvector** | Supabase | Free tier; Pro $25/mo includes pgvector |
| 8 | **Elasticsearch kNN** | Elastic | Cloud from $95/mo; self-managed free (Basic) |
| 9 | **Redis Vector (Redis Stack)** | Redis Ltd | Cloud from $7/mo; Enterprise custom |
| 10 | **Deep Lake** | Activeloop | Free community; Teams $300/mo; Enterprise custom |

## 1.3 Features (85 features)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|--------------|
| 1 | Cosine Similarity | Normalized dot product distance | Low | Enabled | None |
| 2 | Euclidean (L2) Distance | Straight-line distance in vector space | Low | Enabled | None |
| 3 | Dot Product (Inner Product) | Raw dot product; for pre-normalized vectors | Low | Enabled | None |
| 4 | Manhattan (L1) Distance | Sum of absolute differences | Low | Disabled | None |
| 5 | Hamming Distance | Bit-level distance for binary vectors | Medium | Disabled | Binary quantization |
| 6 | Jaccard Distance | Set-based similarity metric | Medium | Disabled | Sparse vectors |
| 7 | HNSW Index | Hierarchical Navigable Small World graph | High | Primary index | None |
| 8 | HNSW ef_construction | Build-time search width (quality vs build speed) | Medium | 128 | HNSW |
| 9 | HNSW M parameter | Max edges per node (memory vs recall) | Medium | 16 | HNSW |
| 10 | HNSW ef_search | Query-time search width (speed vs recall) | Low | 64 | HNSW |
| 11 | IVF-Flat Index | Inverted file with flat (brute) search in clusters | Medium | Disabled | Training data |
| 12 | IVF-PQ Index | Inverted file + product quantization | High | Disabled | Training data |
| 13 | Scalar Quantization (SQ8) | Compress float32 → int8 per dimension | Medium | Disabled | None |
| 14 | Product Quantization (PQ) | Compress vectors via codebook sub-quantizers | High | Disabled | Training data |
| 15 | Binary Quantization | 1-bit per dimension compression | Medium | Disabled | None |
| 16 | Matryoshka Quantization | Truncate embedding dimensions adaptively | Medium | Disabled | Compatible embeddings |
| 17 | On-disk Index | Memory-map index to disk; RAM for hot data | Medium | Disabled | Sufficient disk |
| 18 | GPU-accelerated Indexing | Use GPU for index build (IVF/HNSW) | High | Disabled | NVIDIA GPU, CUDA |
| 19 | Collection Management | Create/delete/list/describe collections | Low | Enabled | None |
| 20 | Collection Aliases | Named pointers for blue-green deployments | Low | Disabled | Collection mgmt |
| 21 | Dynamic Schema | Add new payload fields without migration | Low | Enabled | None |
| 22 | Multi-tenancy | Isolate data per tenant within shared collection | Medium | Disabled | Payload filtering |
| 23 | Payload Indexing | Index metadata fields for filtered search | Medium | Auto | None |
| 24 | Payload Types | Support int, float, string, bool, geo, datetime | Low | All types | Payload indexing |
| 25 | Full-text Payload Index | Tokenized text index on payload fields | Medium | Disabled | Payload indexing |
| 26 | Metadata Filtering | Pre/post-filter vectors by payload conditions | Medium | Enabled | Payload indexing |
| 27 | Boolean Filter Expressions | AND/OR/NOT logic on metadata filters | Medium | Enabled | Metadata filtering |
| 28 | Range Filters | Numeric range conditions on payload | Low | Enabled | Payload indexing |
| 29 | Geo Filters | Radius/bounding-box geospatial filtering | Medium | Disabled | Geo payload index |
| 30 | Hybrid Search (Vector + Keyword) | Combine dense vector + sparse/BM25 scores | High | Disabled | Sparse vectors or FTS |
| 31 | Reciprocal Rank Fusion | Merge ranked lists from multiple searches | Medium | Disabled | Hybrid search |
| 32 | Multi-vector Search | Store/query multiple vectors per point | Medium | Disabled | Named vectors |
| 33 | Named Vectors | Label vectors within a single point (e.g., title_vec, body_vec) | Medium | Disabled | None |
| 34 | Sparse Vectors | Variable-length sparse vector storage (BM25/SPLADE) | High | Disabled | None |
| 35 | Batch Upsert | Insert/update multiple points atomically | Low | Enabled | None |
| 36 | Batch Size Tuning | Configure optimal batch sizes for throughput | Low | 100 | Batch upsert |
| 37 | Scroll / Pagination | Iterate through all points without search | Low | Enabled | None |
| 38 | Point Retrieval by ID | Fetch specific points by their IDs | Low | Enabled | None |
| 39 | Point Count | Count points matching a filter | Low | Enabled | None |
| 40 | Recommendation API | Find similar points given positive/negative examples | Medium | Disabled | None |
| 41 | Discovery API | Explore data with context pairs | Medium | Disabled | None |
| 42 | Grouping API | Group search results by payload field | Medium | Disabled | Payload indexing |
| 43 | Embedding Storage | Store raw vectors alongside index | Low | Enabled | None |
| 44 | Embedding Retrieval Toggle | Option to exclude vectors from response | Low | true | None |
| 45 | Dimensionality Validation | Enforce vector dimension at collection level | Low | Enabled | None |
| 46 | Multi-dimensional Support | 1 to 65536+ dimensions | Low | Varies | None |
| 47 | Float16 Storage | Store vectors as float16 to halve memory | Medium | Disabled | None |
| 48 | Write-Ahead Log (WAL) | Durability via sequential write log | Medium | Enabled | None |
| 49 | WAL Compaction | Periodic cleanup of consumed WAL segments | Medium | Auto | WAL |
| 50 | Segment Management | Organize data into optimized segments | Medium | Auto | None |
| 51 | Segment Merging | Merge small segments for query efficiency | Medium | Auto | Segment mgmt |
| 52 | Optimizer Triggers | Configure when re-indexing/merging kicks in | Medium | Auto | Segment mgmt |
| 53 | Snapshots | Point-in-time backup of collections | Medium | Disabled | None |
| 54 | Snapshot Restore | Restore collection from snapshot | Medium | Disabled | Snapshots |
| 55 | Sharding | Distribute collection across nodes | High | Auto (distributed) | Cluster mode |
| 56 | Shard Key Routing | Route queries to specific shards by key | High | Disabled | Sharding |
| 57 | Replication Factor | Number of data copies across nodes | Medium | 1 | Cluster mode |
| 58 | Read Consistency Levels | Quorum/all/local read consistency | Medium | Local | Replication |
| 59 | Write Consistency Levels | Quorum/all/local write ordering | Medium | Quorum | Replication |
| 60 | Distributed Consensus (Raft) | Leader election + log replication for metadata | High | Enabled (cluster) | Cluster mode |
| 61 | Node Discovery | Auto-discover cluster peers | Medium | Config-based | Cluster mode |
| 62 | Collection Migration | Move collection between nodes | High | Manual | Cluster mode |
| 63 | REST API | HTTP/JSON endpoint for all operations | Low | Enabled | None |
| 64 | gRPC API | High-performance binary RPC interface | Medium | Enabled | None |
| 65 | Client SDKs | Official Python, JS/TS, Rust, Go, Java, C# | Low | Available | None |
| 66 | OpenAPI Spec | Auto-generated API documentation | Low | Enabled | REST API |
| 67 | Authentication (API Key) | Static API key auth | Low | Disabled | None |
| 68 | RBAC | Role-based access per collection/action | Medium | Disabled | Auth |
| 69 | TLS / mTLS | Encrypted transport | Medium | Disabled | Certificates |
| 70 | JWT Token Auth | JSON Web Token authentication | Medium | Disabled | Auth |
| 71 | Telemetry / Metrics | Prometheus-compatible metrics export | Low | Enabled | None |
| 72 | Health Check Endpoint | Liveness/readiness probes | Low | Enabled | None |
| 73 | Resource Limits | Per-collection memory/disk limits | Medium | Disabled | None |
| 74 | Quantization Rescoring | Re-rank quantized results with full vectors | Medium | Enabled | Quantization |
| 75 | Oversampling | Fetch extra candidates before re-ranking | Medium | Auto | Quantization |
| 76 | Prefetch Pipeline | Multi-stage search (coarse → fine) | High | Disabled | None |
| 77 | Query Planning | Optimize filter + vector search order | High | Auto | Metadata filtering |
| 78 | Async Indexing | Build index in background while serving | Medium | Enabled | None |
| 79 | Index Warm-up | Pre-load index into RAM on startup | Medium | Auto | None |
| 80 | Embedding Model Integration | Built-in model inference (Weaviate-style) | High | Disabled | ML runtime |
| 81 | Multimodal Vectors | Image/audio/text vectors in same collection | Medium | Disabled | Named vectors |
| 82 | Versioned Points | Track point update history | Medium | Disabled | None |
| 83 | Conditional Updates | Update only if version/condition matches | Medium | Disabled | None |
| 84 | Bulk Delete by Filter | Delete all points matching a filter | Low | Enabled | Metadata filtering |
| 85 | Custom Distance Functions | User-defined distance metrics | High | Disabled | Plugin system |

## 1.4 Architecture Patterns

### HNSW Graph Construction
- Layered skip-list–inspired graph: top layers sparse (long-range links), bottom layers dense (local)
- Insert: find entry point at top layer, greedily descend, connect at each level with max M neighbors
- Build complexity: O(N·log(N)); query: O(log(N))
- Parameters: M (edges/node, typ. 16), ef_construction (search width, typ. 128-512)

### Segment Management
- Data organized into immutable segments (like LSM SSTables) + mutable memtable
- New writes go to WAL → memtable → flush to segment when threshold reached
- Background optimizer merges small segments, re-indexes with updated HNSW
- Deleted points marked as tombstones, cleaned on merge

### WAL + Memtable
- WAL: append-only sequential writes for crash recovery
- Memtable: in-memory buffer for recent writes; supports search immediately
- Flush: memtable → immutable segment on disk with full HNSW index
- Recovery: replay WAL entries not yet flushed

### Quantization Strategies
- **Scalar (SQ8)**: per-dimension min/max → int8; 4x compression; ~1-3% recall loss
- **Product (PQ)**: split vector into subspaces, cluster each, store centroid IDs; 10-50x compression; 5-10% recall loss
- **Binary**: sign bit per dimension; 32x compression; best for oversampling + rescore
- **Matryoshka**: progressive dimension truncation; works with MRL-trained embeddings

### Distributed Consensus
- Raft protocol for cluster metadata (collection configs, shard assignments)
- Data replication: synchronous or eventual per write concern
- Shard-level leader/follower; queries fan out to shard leaders

## 1.5 Memory Management
- HNSW index: ~(4·dim + 8·M) bytes per vector (float32, M=16 → ~512B overhead for 128-dim)
- Raw vectors: 4·dim bytes each (float32); 2·dim for float16
- Quantized: SQ8 = dim bytes; PQ = n_subquantizers bytes; Binary = dim/8 bytes
- Payload indexes: B-tree or hash; typically 50-200 bytes per indexed field per point
- Memory-mapped segments: OS page cache manages hot/cold data automatically
- Recommended: keep HNSW graph in RAM, vectors on mmap, payload indexes in RAM

## 1.6 Testing Criteria
- **Recall@K**: measure search accuracy at K=1,10,100 vs brute force
- **QPS (queries/sec)**: throughput at target recall (e.g., 0.95 recall)
- **Latency P50/P95/P99**: at various concurrency levels
- **Index build time**: time to index N vectors (1M, 10M, 100M benchmarks)
- **Memory efficiency**: RAM per million vectors at target recall
- **Filter performance**: speed degradation with selective metadata filters
- **Write throughput**: sustained upsert rate
- **Recovery time**: WAL replay + index warm-up duration
- **Cluster rebalance**: time to redistribute after node add/remove
- **ANN-benchmarks suite**: standardized comparison (ann-benchmarks.com datasets)

---

# 2. Graph Databases (FalkorDB-style / SKGraph)

## 2.1 Top 10 Open-Source Graph Databases

| # | Name | Language | GitHub Stars (approx) | License | Key Differentiator |
|---|------|----------|-----------------------|---------|--------------------|
| 1 | **Neo4j** | Java | ~13k | GPLv3 (Community) | Market leader; Cypher language inventor; richest ecosystem |
| 2 | **FalkorDB** | C | ~2.5k | Server Side Public License | Redis module; fastest Cypher-compatible; in-memory graph |
| 3 | **ArangoDB** | C++ | ~13.5k | Apache 2.0 | Multi-model (graph+doc+KV); AQL query language |
| 4 | **DGraph** | Go | ~20k | Apache 2.0 | GraphQL-native; distributed; written in Go |
| 5 | **JanusGraph** | Java | ~5.5k | Apache 2.0 | Pluggable backends (Cassandra, HBase, BerkeleyDB) |
| 6 | **Memgraph** | C++ | ~2k | BSL 1.1 → Apache 2.0 | Cypher-compatible; in-memory; real-time streaming |
| 7 | **SurrealDB** | Rust | ~28k | BSL 1.1 | Multi-model including graph; Rust; SQL-like syntax |
| 8 | **TerminusDB** | Prolog/Rust | ~2.5k | Apache 2.0 | Git-like versioning for graph data; immutable |
| 9 | **TypeDB** | Java/Rust | ~3.5k | MPL 2.0 | Type-theoretic knowledge graph; TypeQL language |
| 10 | **Cayley** | Go | ~14.5k | Apache 2.0 | Google-inspired; pluggable backends; Gizmo query |

## 2.2 Top 10 Proprietary / SaaS Graph Solutions

| # | Name | Vendor | Pricing (approx) |
|---|------|--------|-------------------|
| 1 | **Neo4j AuraDB** | Neo4j Inc | Free tier; Pro from $65/mo; Enterprise custom |
| 2 | **Amazon Neptune** | AWS | From $0.10/hr (~$73/mo) for db.t3.medium |
| 3 | **TigerGraph Cloud** | TigerGraph | Free tier; from $0.84/hr |
| 4 | **Azure Cosmos DB (Gremlin)** | Microsoft | RU-based; from ~$25/mo for 400 RU/s |
| 5 | **Stardog Cloud** | Stardog | Developer free; Enterprise from $36k/yr |
| 6 | **ArangoDB Oasis** | ArangoDB | From $0.189/hr; free trial |
| 7 | **Memgraph Cloud** | Memgraph | Free tier (1GB); Dev from $30/mo |
| 8 | **DGraph Cloud** | DGraph | Free tier; Shared from $39/mo; Dedicated custom |
| 9 | **FalkorDB Cloud** | FalkorDB | Free tier; pricing TBD (early cloud) |
| 10 | **IBM Graph (Compose)** | IBM | Deprecated → use JanusGraph on IBM Cloud; custom pricing |

## 2.3 Features (80 features)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|--------------|
| 1 | Property Graph Model | Nodes and edges with key-value properties | Low | Enabled | None |
| 2 | RDF Triple Model | Subject-predicate-object triples | Medium | Disabled | RDF engine |
| 3 | Cypher Query Language | Declarative pattern-matching graph query language | Medium | Enabled | None |
| 4 | Gremlin Traversal Language | Imperative graph traversal API (TinkerPop) | Medium | Disabled | TinkerPop |
| 5 | SPARQL | W3C standard RDF query language | Medium | Disabled | RDF model |
| 6 | GraphQL Integration | Native or adapter-based GraphQL endpoint | Medium | Disabled | None |
| 7 | Node Create/Update/Delete | CRUD operations on graph nodes | Low | Enabled | None |
| 8 | Edge Create/Update/Delete | CRUD operations on relationships | Low | Enabled | None |
| 9 | Node Labels / Types | Categorize nodes with one or more labels | Low | Enabled | None |
| 10 | Edge Types | Typed directed relationships | Low | Enabled | None |
| 11 | Property Types | String, int, float, bool, list, map, date, point | Low | All types | None |
| 12 | Schema Constraints (Unique) | Enforce unique property values per label | Medium | Disabled | Indexes |
| 13 | Schema Constraints (Existence) | Require properties on nodes/edges | Medium | Disabled | Enterprise |
| 14 | Schema Constraints (Node Key) | Composite unique + existence constraint | Medium | Disabled | Enterprise |
| 15 | Node Property Index | B-tree index on node properties | Low | Manual | None |
| 16 | Composite Index | Index on multiple properties together | Medium | Disabled | None |
| 17 | Full-text Index | Lucene-backed text search on properties | Medium | Disabled | None |
| 18 | Range Index | Optimized for range queries (>, <, BETWEEN) | Low | Auto | Property index |
| 19 | Point/Spatial Index | R-tree for geospatial data | Medium | Disabled | Point properties |
| 20 | Vector Index | Graph-native vector similarity search | High | Disabled | Neo4j 5.13+ |
| 21 | Pattern Matching | MATCH clauses to find subgraph patterns | Medium | Enabled | Cypher |
| 22 | Variable-length Paths | Match paths of variable hops (1..N) | Medium | Enabled | Cypher |
| 23 | Shortest Path | Find shortest path between two nodes | Medium | Enabled | None |
| 24 | All Shortest Paths | Find all equally-short paths | Medium | Enabled | None |
| 25 | Weighted Shortest Path (Dijkstra) | Shortest path considering edge weights | High | Enabled | GDS library |
| 26 | A* Pathfinding | Heuristic-guided shortest path | High | Disabled | GDS library |
| 27 | PageRank Algorithm | Node importance ranking | High | Disabled | GDS library |
| 28 | Community Detection (Louvain) | Detect densely-connected communities | High | Disabled | GDS library |
| 29 | Community Detection (Label Propagation) | Fast community assignment | Medium | Disabled | GDS library |
| 30 | Betweenness Centrality | Identify bridge nodes | High | Disabled | GDS library |
| 31 | Closeness Centrality | Measure node reach efficiency | Medium | Disabled | GDS library |
| 32 | Degree Centrality | Count connections per node | Low | Disabled | GDS library |
| 33 | Connected Components (WCC) | Find weakly connected subgraphs | Medium | Disabled | GDS library |
| 34 | Strongly Connected Components | Find strongly connected subgraphs (directed) | Medium | Disabled | GDS library |
| 35 | Triangle Count | Count triangles per node | Medium | Disabled | GDS library |
| 36 | Node Similarity | Jaccard/overlap similarity between nodes | Medium | Disabled | GDS library |
| 37 | K-Nearest Neighbors (Graph) | KNN based on graph topology | Medium | Disabled | GDS library |
| 38 | Node Embedding (FastRP) | Random projection embeddings | High | Disabled | GDS library |
| 39 | Node Embedding (Node2Vec) | Walk-based embeddings | High | Disabled | GDS library |
| 40 | Graph Projections | In-memory named graph for algorithms | Medium | Disabled | GDS library |
| 41 | Subgraph Extraction | Extract subgraph for isolated analysis | Medium | Disabled | None |
| 42 | ACID Transactions | Full transaction support with rollback | Medium | Enabled | None |
| 43 | Multi-statement Transactions | Group multiple operations in one tx | Medium | Enabled | Transactions |
| 44 | Read/Write Locking | Pessimistic locks on nodes/relationships | Medium | Auto | Transactions |
| 45 | Deadlock Detection | Automatic deadlock detection and resolution | Medium | Enabled | Transactions |
| 46 | Causal Clustering | Raft-based consensus for HA | High | Disabled | Enterprise |
| 47 | Leader-Follower Replication | Async replication for read scaling | Medium | Disabled | Clustering |
| 48 | Read Replicas | Scale reads horizontally | Medium | Disabled | Clustering |
| 49 | Sharding / Fabric | Distribute graph across instances | High | Disabled | Enterprise |
| 50 | Stored Procedures | Java/Python procedures callable from Cypher | Medium | Disabled | JVM |
| 51 | User-Defined Functions | Custom scalar functions in queries | Medium | Disabled | JVM |
| 52 | APOC Library | 450+ utility procedures (Neo4j) | Medium | Disabled | Plugin install |
| 53 | Triggers (Transaction Events) | Execute logic on commit | Medium | Disabled | APOC |
| 54 | Change Data Capture | Stream changes to external consumers | High | Disabled | Enterprise |
| 55 | Bulk Import (CSV) | High-speed initial data load | Low | Enabled | None |
| 56 | Bulk Import (JSON) | Load JSON graph data | Low | Enabled | None |
| 57 | Bulk Import (Admin tool) | Offline bulk import for billions of records | Medium | Enabled | None |
| 58 | Export (CSV/JSON/GraphML) | Export graph data in standard formats | Low | Enabled | None |
| 59 | Cypher LOAD CSV | Import CSV directly from Cypher | Low | Enabled | None |
| 60 | Graph Visualization | Built-in browser/UI for exploring graphs | Low | Enabled | None |
| 61 | Bloom Visualization | Business-friendly visual exploration | Medium | Disabled | Enterprise |
| 62 | REST API | HTTP endpoints for queries/management | Low | Enabled | None |
| 63 | Bolt Protocol | Binary protocol for client connections | Low | Enabled | None |
| 64 | WebSocket Support | Real-time connection via WebSocket | Low | Enabled | Bolt |
| 65 | Client Drivers | Official Java, Python, JS, .NET, Go drivers | Low | Available | None |
| 66 | Authentication | Username/password native auth | Low | Enabled | None |
| 67 | LDAP / SSO Integration | Enterprise directory authentication | Medium | Disabled | Enterprise |
| 68 | RBAC | Role-based access (reader, editor, admin, custom) | Medium | Basic roles | Auth |
| 69 | Property-level Security | Restrict access to specific properties | High | Disabled | Enterprise |
| 70 | Subgraph-level Security | Restrict access to labeled subgraphs | High | Disabled | Enterprise |
| 71 | Audit Logging | Log all queries and admin actions | Medium | Disabled | Enterprise |
| 72 | Query Logging / Profiling | EXPLAIN/PROFILE for query analysis | Low | Enabled | None |
| 73 | Query Caching | Cache compiled query plans | Medium | Enabled | None |
| 74 | Memory Configuration | Heap, page cache, transaction memory tuning | Medium | Auto | None |
| 75 | Online Backup | Hot backup without downtime | Medium | Enabled | None |
| 76 | Point-in-time Recovery | Restore to specific transaction | High | Disabled | Enterprise |
| 77 | Database Metrics | Prometheus/JMX metrics export | Low | Enabled | None |
| 78 | Multi-database | Multiple named databases in one instance | Medium | Disabled | Enterprise |
| 79 | Composite Databases (Federation) | Query across databases transparently | High | Disabled | Enterprise |
| 80 | Graph Data Science Library | 65+ algorithms as a plugin library | High | Disabled | Separate install |

## 2.4 Architecture Patterns

### Adjacency List vs Matrix Storage
- **Adjacency List (dominant)**: Each node stores pointer-list to connected edges; O(degree) traversal per hop; memory-efficient for sparse graphs
- **Adjacency Matrix**: N×N matrix; O(1) lookup but O(N²) space; only viable for small dense graphs or GPU-accelerated analytics
- **Index-Free Adjacency** (Neo4j): Nodes contain direct physical pointers to relationships → O(1) per hop regardless of total graph size; eliminates index lookups during traversal

### Graph Partitioning
- **Hash partitioning**: distribute nodes by hash(id) → even distribution but cuts many edges
- **Label-based**: co-locate nodes with same label → good for label-specific queries
- **Community-based**: detect communities, keep them on same shard → minimal cross-shard traversals
- **Edge-cut vs Vertex-cut**: edge-cut splits nodes across partitions; vertex-cut replicates nodes at boundaries

### Query Execution
- Parse Cypher → AST → Logical Plan → Physical Plan → Execution
- Pattern matching via expand operators: start from anchored nodes (indexed), expand along relationships
- Cost-based optimizer chooses index scans, join strategies, expand directions
- Lazy/streaming execution: results emitted per row, not materialized fully
- Morsel-driven parallelism (Memgraph): work-stealing on chunks of data

### Transaction Management
- WAL for durability; page-level or record-level locking
- Neo4j: record-level locks, optimistic reads, deadlock detection with tx restart
- FalkorDB: single-writer (Redis threading model), readers don't block
- Multi-version concurrency (some): readers see consistent snapshot

## 2.5 Memory Management
- **Node storage**: fixed-size records (Neo4j: 15 bytes/node on disk) + property chains
- **Relationship storage**: fixed-size records (Neo4j: 34 bytes/rel) with doubly-linked per node
- **Property storage**: dynamic records; short strings inline, long strings in separate store
- **Page cache**: memory-mapped or custom page cache for store files; should fit working set
- **Index memory**: B-tree nodes in page cache; GDS projections in heap (can be large)
- **FalkorDB specifics**: entire graph in Redis memory; sparse matrix (GraphBLAS) ~40-80 bytes per edge
- **Estimation**: 1M nodes + 5M edges ≈ 0.5-2 GB RAM depending on property density

## 2.6 Testing Criteria
- **Traversal throughput**: hops/second for k-hop neighborhood queries
- **Path finding latency**: shortest path between random pairs at various graph sizes
- **Algorithm runtime**: PageRank/Community detection on standard benchmarks (LDBC SNB)
- **Write throughput**: nodes+edges/second for bulk and transactional writes
- **Concurrent query performance**: throughput under mixed read/write workload
- **LDBC Social Network Benchmark**: standardized graph DB benchmark
- **Deep traversal cost**: performance degradation at 4, 6, 8+ hops
- **Memory per million edges**: baseline memory consumption
- **Recovery time**: startup + cache warm-up after crash
- **Query plan stability**: consistent performance for repeated query patterns

---

# 3. Key-Value / In-Memory Stores (Redis-style)

## 3.1 Top 10 Open-Source Key-Value Stores

| # | Name | Language | GitHub Stars (approx) | License | Key Differentiator |
|---|------|----------|-----------------------|---------|--------------------|
| 1 | **Redis** | C | ~67k | RSALv2+SSPLv1 (post-7.4: dual) | Definitive in-memory data structure store |
| 2 | **Valkey** | C | ~18k | BSD-3 | Redis fork; Linux Foundation; truly open-source |
| 3 | **DragonflyDB** | C++ | ~27k | BSL 1.1 | Multi-threaded; 25x throughput vs Redis; drop-in compatible |
| 4 | **KeyDB** | C++ | ~11k | BSD-3 | Multi-threaded Redis fork; active replication |
| 5 | **etcd** | Go | ~48k | Apache 2.0 | Distributed consensus (Raft); Kubernetes backbone |
| 6 | **Memcached** | C | ~13k | BSD-3 | Simplest caching; multi-threaded from day one |
| 7 | **FoundationDB** | C++ | ~14.5k | Apache 2.0 | Distributed ACID KV; Apple's backbone |
| 8 | **TiKV** | Rust | ~15k | Apache 2.0 | Distributed transactional KV; Raft; TiDB's storage layer |
| 9 | **RocksDB** | C++ | ~29k | Apache 2.0/GPLv2 | Embeddable LSM-tree; Meta's storage engine |
| 10 | **BadgerDB** | Go | ~14k | Apache 2.0 | Pure Go LSM KV; SSD-optimized; value-log separation |

## 3.2 Top 10 Proprietary / SaaS Key-Value Solutions

| # | Name | Vendor | Pricing (approx) |
|---|------|--------|-------------------|
| 1 | **Amazon ElastiCache** | AWS | From $0.017/hr (t3.micro Redis) |
| 2 | **Redis Cloud** | Redis Ltd | Free 30MB; Essentials from $7/mo; Pro custom |
| 3 | **Upstash** | Upstash | Free 10k cmd/day; Pay-as-you-go $0.2/100k cmds |
| 4 | **Momento** | Momento | Free 5GB transfer; $0.50/GB transfer after |
| 5 | **Google Memorystore** | Google Cloud | From $0.016/hr (Redis Basic, M1) |
| 6 | **Azure Cache for Redis** | Microsoft | From $0.022/hr (Basic C0) |
| 7 | **DragonflyDB Cloud** | Dragonfly | From $0.045/hr |
| 8 | **Aerospike Cloud** | Aerospike | Usage-based; from ~$200/mo |
| 9 | **Hazelcast Cloud** | Hazelcast | Free tier (dev); from $0.44/hr (Starter) |
| 10 | **Amazon MemoryDB** | AWS | From $0.065/hr; Redis-compatible with durability |

## 3.3 Features (90 features)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|--------------|
| 1 | GET / SET / DEL | Basic key-value CRUD operations | Low | Enabled | None |
| 2 | MGET / MSET | Batch get/set multiple keys | Low | Enabled | None |
| 3 | SETNX / SET NX | Set only if key doesn't exist | Low | Enabled | None |
| 4 | SET EX/PX | Set with seconds/milliseconds expiry | Low | Enabled | None |
| 5 | GETSET / GETDEL | Atomic get-and-modify operations | Low | Enabled | None |
| 6 | INCR / DECR / INCRBY | Atomic integer increment/decrement | Low | Enabled | None |
| 7 | INCRBYFLOAT | Atomic float increment | Low | Enabled | None |
| 8 | APPEND | Append to string value | Low | Enabled | None |
| 9 | STRLEN / GETRANGE | String length and substring | Low | Enabled | None |
| 10 | TTL / Expiry | Automatic key expiration after timeout | Low | No TTL | None |
| 11 | PERSIST | Remove TTL from key | Low | Enabled | TTL |
| 12 | EXPIREAT / PEXPIREAT | Expire at absolute Unix timestamp | Low | Enabled | None |
| 13 | Lazy Expiry | Keys expired on access (passive) + periodic active scan | Medium | Enabled | None |
| 14 | Lists (LPUSH, RPUSH, LPOP, RPOP) | Doubly-linked list operations | Low | Enabled | None |
| 15 | List Blocking (BLPOP, BRPOP) | Blocking pop with timeout | Medium | Enabled | None |
| 16 | LRANGE / LINDEX | List range and index access | Low | Enabled | None |
| 17 | Sets (SADD, SREM, SMEMBERS) | Unordered unique element collection | Low | Enabled | None |
| 18 | Set Operations (SUNION, SINTER, SDIFF) | Set algebra operations | Low | Enabled | None |
| 19 | Sorted Sets (ZADD, ZRANGE, ZRANK) | Score-ordered unique elements | Medium | Enabled | None |
| 20 | ZRANGEBYSCORE / ZRANGEBYLEX | Range queries on sorted sets | Medium | Enabled | Sorted sets |
| 21 | Hashes (HSET, HGET, HGETALL) | Field-value maps per key | Low | Enabled | None |
| 22 | HSCAN / SSCAN / ZSCAN | Incremental cursor-based iteration | Low | Enabled | None |
| 23 | Streams (XADD, XREAD, XRANGE) | Append-only log with consumer groups | High | Enabled | None |
| 24 | Consumer Groups (XGROUP) | Distributed stream processing with ACK | High | Disabled | Streams |
| 25 | XREADGROUP | Read stream entries as group member | High | Disabled | Consumer groups |
| 26 | Bitmaps (SETBIT, GETBIT, BITCOUNT) | Bit-level operations on strings | Medium | Enabled | None |
| 27 | BITOP / BITFIELD | Bitwise AND/OR/XOR; arbitrary bit fields | Medium | Enabled | None |
| 28 | HyperLogLog (PFADD, PFCOUNT) | Probabilistic cardinality estimation | Medium | Enabled | None |
| 29 | Geospatial (GEOADD, GEODIST, GEORADIUS) | Geo-indexed location data | Medium | Enabled | Sorted sets |
| 30 | GEOSEARCH / GEOSEARCHSTORE | Radius and box geo queries | Medium | Enabled | Geospatial |
| 31 | Pub/Sub (PUBLISH, SUBSCRIBE) | Fire-and-forget message broadcasting | Medium | Enabled | None |
| 32 | Pattern Subscribe (PSUBSCRIBE) | Subscribe to channel patterns with globs | Medium | Enabled | Pub/Sub |
| 33 | Sharded Pub/Sub | Pub/Sub scoped to hash slot (Cluster) | Medium | Disabled | Cluster mode |
| 34 | Lua Scripting (EVAL) | Atomic server-side Lua script execution | Medium | Enabled | None |
| 35 | Functions (FUNCTION LOAD) | Named persistent server-side functions | Medium | Enabled (7.0+) | None |
| 36 | Transactions (MULTI/EXEC) | Batch commands atomically | Medium | Enabled | None |
| 37 | WATCH (Optimistic Locking) | CAS-style transactions | Medium | Enabled | Transactions |
| 38 | Pipelining | Send multiple commands without waiting | Low | Client-side | None |
| 39 | RESP Protocol (v2/v3) | Redis Serialization Protocol | Low | RESP2 | None |
| 40 | RDB Snapshots | Point-in-time binary dump to disk | Medium | Enabled | None |
| 41 | RDB Save Triggers | Configure save frequency (e.g., 900 1, 300 10) | Low | Default rules | RDB |
| 42 | AOF (Append-Only File) | Log every write for replay recovery | Medium | Disabled | None |
| 43 | AOF Rewrite | Compact AOF by regenerating from memory | Medium | Auto | AOF |
| 44 | AOF fsync Policies | always / everysec / no | Low | everysec | AOF |
| 45 | RDB+AOF Combined | Use both for best durability + fast restart | Medium | Disabled | RDB + AOF |
| 46 | Master-Replica Replication | Async replication to read replicas | Medium | Disabled | None |
| 47 | Replication Backlog | Buffer for partial resync after disconnect | Medium | 1MB | Replication |
| 48 | WAIT Command | Synchronous replication acknowledgment | Medium | Disabled | Replication |
| 49 | Sentinel (HA) | Automatic failover monitoring | High | Disabled | Replication |
| 50 | Sentinel Quorum | Min sentinels to agree on failover | Medium | Majority | Sentinel |
| 51 | Cluster Mode | Hash-slot based sharding (16384 slots) | High | Disabled | 3+ masters |
| 52 | Cluster Resharding | Move hash slots between nodes online | High | Manual | Cluster mode |
| 53 | Cluster Auto-failover | Promote replica on master failure | High | Enabled | Cluster mode |
| 54 | Gossip Protocol | Cluster node discovery and health | High | Auto | Cluster mode |
| 55 | Hash Tags | Force keys to same slot with {tag} | Low | Disabled | Cluster mode |
| 56 | Modules API | Extend Redis with C modules | High | Enabled | None |
| 57 | RedisJSON Module | Native JSON document storage/querying | Medium | Disabled | Module install |
| 58 | RediSearch Module | Full-text search + secondary indexing | High | Disabled | Module install |
| 59 | RedisTimeSeries Module | Time series data type with aggregation | Medium | Disabled | Module install |
| 60 | RedisBloom Module | Bloom filters, cuckoo filters, CMS, top-K | Medium | Disabled | Module install |
| 61 | RedisGraph Module | Graph data processing (deprecated) | High | Deprecated | N/A |
| 62 | Keyspace Notifications | Pub/Sub events on key modifications | Medium | Disabled | Configuration |
| 63 | Key Event Types | Set which events trigger notifications (KEA, KEx, etc.) | Medium | "" (none) | Keyspace notifications |
| 64 | Client Tracking | Server-assisted client-side caching | Medium | Disabled | RESP3 |
| 65 | RESP3 Push Notifications | Server-initiated messages to clients | Medium | Disabled | RESP3 client |
| 66 | Memory Eviction (maxmemory) | Evict keys when memory limit reached | Medium | noeviction | maxmemory set |
| 67 | LRU Eviction | Least-recently-used approximation | Medium | Disabled | Eviction policy |
| 68 | LFU Eviction | Least-frequently-used with decay | Medium | Disabled | Eviction policy |
| 69 | Volatile Eviction | Only evict keys with TTL | Medium | Disabled | Eviction policy |
| 70 | Allkeys Eviction | Evict any key | Medium | Disabled | Eviction policy |
| 71 | ACL (Access Control Lists) | Per-user command/key/channel permissions | Medium | Default user | None |
| 72 | ACL Categories | Group commands for easier permission mgmt | Medium | Available | ACL |
| 73 | ACL Selectors | Multiple permission sets per user (7.2+) | Medium | Disabled | ACL |
| 74 | TLS/SSL | Encrypted client and replication connections | Medium | Disabled | Certificates |
| 75 | OBJECT ENCODING | Inspect internal encoding of a key | Low | Enabled | None |
| 76 | OBJECT IDLETIME | Check idle time of a key (LRU) | Low | Enabled | None |
| 77 | MEMORY USAGE | Estimate memory for a specific key | Low | Enabled | None |
| 78 | MEMORY DOCTOR | Diagnose memory issues | Low | Enabled | None |
| 79 | DEBUG SLEEP / JMAP | Diagnostic commands (admin) | Low | Enabled | None |
| 80 | SLOWLOG | Log slow commands above threshold | Low | 10ms | None |
| 81 | LATENCY MONITOR | Track latency sources | Low | Disabled | Configuration |
| 82 | INFO Command | Comprehensive server statistics | Low | Enabled | None |
| 83 | CONFIG SET/GET | Runtime configuration changes | Low | Enabled | None |
| 84 | CLIENT LIST / KILL | Manage connected clients | Low | Enabled | None |
| 85 | SCAN (Cursor Iteration) | Non-blocking key-space iteration | Low | Enabled | None |
| 86 | WAIT / WAITAOF | Wait for replication/AOF sync confirmation | Medium | Disabled | Replication/AOF |
| 87 | OBJECT FREQ | Access frequency for LFU | Low | Enabled | LFU policy |
| 88 | COPY Command | Copy key to another key (6.2+) | Low | Enabled | None |
| 89 | LMPOP / ZMPOP | Pop from multiple lists/sorted sets | Low | Enabled (7.0+) | None |
| 90 | CLIENT NO-EVICT | Protect client's connection from eviction | Low | Disabled | ACL |

## 3.4 Architecture Patterns

### Single-threaded Event Loop (Redis)
- One main thread handles all commands sequentially → no locks, no race conditions
- I/O multiplexing via epoll/kqueue; I/O threads (6.0+) handle read/write, main thread executes
- Guarantees atomicity of individual commands without explicit locking
- Throughput: ~100k-300k ops/sec single-thread; I/O threads help with large payloads

### Multi-threaded (DragonflyDB, KeyDB)
- DragonflyDB: shared-nothing architecture per core; each thread owns a shard of keyspace
- KeyDB: multiple worker threads with per-key locking; same data visible to all threads
- Both: 10-25x throughput over Redis for multi-core machines

### Memory Allocator
- jemalloc (default): arena-based, reduces fragmentation; thread-local caches
- Allocator stats via `MEMORY STATS`; fragmentation ratio = RSS / used_memory
- DragonflyDB uses mimalloc; competitive fragmentation characteristics

### Fork-based Persistence
- RDB: fork() → child process writes consistent snapshot while parent continues serving
- Copy-on-write: child shares memory pages; only modified pages get duplicated
- Risk: 2x memory usage peak during save if heavy writes during snapshot
- AOF rewrite: similar fork; child writes compacted AOF, parent appends new ops to buffer

### Gossip Protocol (Cluster)
- Each node pings random nodes every 100ms with cluster state (slots, epochs, health)
- Failure detection: node marked PFAIL (suspected) → FAIL (confirmed by majority)
- Config epochs: monotonically increasing; resolves split-brain slot ownership
- Slot migration: IMPORTING/MIGRATING states; ASK/MOVED redirects during transition

## 3.5 Memory Management
- **String encoding**: int (8 bytes) for integers; embstr (<44 bytes inline); raw (SDS dynamic string)
- **List encoding**: listpack (small) → quicklist (linked list of zipped chunks)
- **Set encoding**: listpack (small int sets) → hashtable
- **Sorted set encoding**: listpack (small) → skiplist + hashtable
- **Hash encoding**: listpack (small) → hashtable
- **Overhead**: ~70 bytes per key (dict entry + SDS key + expiry + type) + value encoding
- **maxmemory**: set hard limit; choose eviction policy; monitor via `INFO memory`
- **1M string keys (100B values)**: ~200-250 MB total (keys + values + overhead)

## 3.6 Testing Criteria
- **Throughput**: ops/sec via redis-benchmark or memtier_benchmark
- **Latency**: P50/P99/P999 at various concurrency (1, 10, 100, 1000 clients)
- **Memory efficiency**: bytes per key-value pair vs theoretical minimum
- **Persistence impact**: throughput drop during RDB save / AOF rewrite
- **Failover time**: Sentinel/Cluster failover latency (detection + promotion)
- **Cluster rebalance**: time to migrate N slots between nodes
- **Large key handling**: performance with 1MB, 10MB, 100MB values
- **Pub/Sub fan-out**: latency with 1k, 10k, 100k subscribers
- **Lua script overhead**: per-script invocation cost
- **Data structure operations**: O(1) vs O(N) behavior validation at scale

---

# 4. Document Databases (MongoDB-style)

## 4.1 Top 10 Open-Source Document Databases

| # | Name | Language | GitHub Stars (approx) | License | Key Differentiator |
|---|------|----------|-----------------------|---------|--------------------|
| 1 | **MongoDB** | C++ | ~27k | SSPL | Market leader; richest ecosystem; aggregation pipeline |
| 2 | **CouchDB** | Erlang | ~6.5k | Apache 2.0 | Multi-master replication; HTTP/REST native; offline-first |
| 3 | **Couchbase** | C/C++/Go | ~1.5k (server) | Apache 2.0 (Community) | Document + KV + SQL++ + full-text; mobile sync |
| 4 | **RethinkDB** | C++ | ~26.5k | Apache 2.0 | Real-time push (changefeeds); ReQL query language |
| 5 | **FerretDB** | Go | ~9.5k | Apache 2.0 | MongoDB wire protocol on PostgreSQL/SQLite backend |
| 6 | **RavenDB** | C# | ~3.5k | AGPLv3 (Community) | .NET native; ACID; auto-indexing; multi-model |
| 7 | **SurrealDB** | Rust | ~28k | BSL 1.1 | Multi-model (doc+graph+KV); Rust; SurrealQL |
| 8 | **ArangoDB** | C++ | ~13.5k | Apache 2.0 | Multi-model (doc+graph+KV); AQL; joins across models |
| 9 | **Elasticsearch** | Java | ~72k | SSPL/Elastic License | Document store + search; best for search-heavy workloads |
| 10 | **PouchDB** | JavaScript | ~16.5k | Apache 2.0 | Browser-based; syncs with CouchDB; offline-first |

## 4.2 Top 10 Proprietary / SaaS Document Solutions

| # | Name | Vendor | Pricing (approx) |
|---|------|--------|-------------------|
| 1 | **MongoDB Atlas** | MongoDB | Free (512MB); Serverless from $0.10/M reads; Dedicated from $57/mo |
| 2 | **Amazon DocumentDB** | AWS | From $0.075/hr (db.t3.medium) |
| 3 | **Azure Cosmos DB** | Microsoft | From $0.008/hr (400 RU/s serverless); dedicated from ~$25/mo |
| 4 | **Firebase Firestore** | Google | Free tier (1GB); $0.18/100k reads; $0.18/100k writes |
| 5 | **Fauna** | Fauna Inc | Free tier; Pay-as-you-go from $0.45/M read ops |
| 6 | **Couchbase Capella** | Couchbase | Free trial; Developer from $0/mo (limited); Pro from ~$0.34/hr |
| 7 | **RavenDB Cloud** | Hibernating Rhinos | Free (dev); Production from $65/mo |
| 8 | **MarkLogic** | Progress Software | Enterprise license; ~$10k+/yr per node |
| 9 | **Rockset** | Rockset (acquired by OpenAI) | Converged indexing; usage-based pricing |
| 10 | **CockroachDB** (JSON) | Cockroach Labs | Free (5GB); Standard from $0.50/vCPU-hr |

## 4.3 Features (80 features)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|--------------|
| 1 | JSON/BSON Document Model | Store nested documents with dynamic schema | Low | Enabled | None |
| 2 | Flexible Schema | No predefined schema required; documents vary | Low | Enabled | None |
| 3 | Schema Validation (JSON Schema) | Enforce document structure with validation rules | Medium | Disabled | None |
| 4 | Document ID (_id) | Auto-generated or user-specified unique identifier | Low | Auto (ObjectId) | None |
| 5 | ObjectId Generation | 12-byte unique ID with timestamp, machine, counter | Low | Auto | None |
| 6 | Insert (insertOne/insertMany) | Create single or batch documents | Low | Enabled | None |
| 7 | Find (find/findOne) | Query documents with filter expressions | Low | Enabled | None |
| 8 | Update (updateOne/updateMany) | Modify documents with update operators | Low | Enabled | None |
| 9 | Replace (replaceOne) | Full document replacement | Low | Enabled | None |
| 10 | Delete (deleteOne/deleteMany) | Remove documents by filter | Low | Enabled | None |
| 11 | Upsert | Insert if not exists, update if exists | Low | Disabled (per op) | None |
| 12 | Bulk Write Operations | Batch multiple write operations | Medium | Enabled | None |
| 13 | Dot Notation (Nested Queries) | Query and update nested document fields | Low | Enabled | None |
| 14 | Array Query Operators | $elemMatch, $all, $size for array fields | Medium | Enabled | None |
| 15 | Comparison Operators | $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin | Low | Enabled | None |
| 16 | Logical Operators | $and, $or, $not, $nor | Low | Enabled | None |
| 17 | Element Operators | $exists, $type for field existence/type checks | Low | Enabled | None |
| 18 | Evaluation Operators | $regex, $expr, $jsonSchema, $mod | Medium | Enabled | None |
| 19 | Update Operators | $set, $unset, $inc, $push, $pull, $addToSet, $rename | Low | Enabled | None |
| 20 | Array Update Operators | $push with $each/$sort/$slice, $pop, positional $ | Medium | Enabled | None |
| 21 | Aggregation Pipeline | Multi-stage data transformation and analysis | High | Enabled | None |
| 22 | $match Stage | Filter documents (like find) | Low | Enabled | Aggregation |
| 23 | $group Stage | Group by fields with accumulators ($sum, $avg, etc.) | Medium | Enabled | Aggregation |
| 24 | $project Stage | Reshape documents, include/exclude fields | Low | Enabled | Aggregation |
| 25 | $sort / $limit / $skip | Ordering and pagination in pipeline | Low | Enabled | Aggregation |
| 26 | $lookup Stage | Left outer join with another collection | Medium | Enabled | Aggregation |
| 27 | $unwind Stage | Deconstruct array field into multiple documents | Medium | Enabled | Aggregation |
| 28 | $facet Stage | Multiple parallel sub-pipelines | Medium | Enabled | Aggregation |
| 29 | $bucket / $bucketAuto | Group documents into value ranges | Medium | Enabled | Aggregation |
| 30 | $graphLookup | Recursive graph-style lookup | High | Enabled | Aggregation |
| 31 | $merge / $out | Write aggregation results to collection | Medium | Enabled | Aggregation |
| 32 | $unionWith | Combine results from two collections | Medium | Enabled | Aggregation |
| 33 | B-tree Index | Default index type on any field(s) | Low | _id auto-indexed | None |
| 34 | Compound Index | Multi-field index | Medium | Manual | None |
| 35 | Multikey Index | Auto-index array elements | Medium | Auto | Array fields |
| 36 | Text Index | Full-text search with stemming, stop words | Medium | Manual | None |
| 37 | Geospatial Index (2dsphere) | Earth-sphere geo queries (near, within, intersects) | Medium | Manual | GeoJSON fields |
| 38 | Geospatial Index (2d) | Flat-plane geo queries | Medium | Manual | Coordinate pairs |
| 39 | Hashed Index | Hash-based equality lookups; shard key support | Medium | Manual | None |
| 40 | Wildcard Index | Index all fields or all subfields dynamically | Medium | Manual | None |
| 41 | TTL Index | Auto-delete documents after expiry time | Medium | Manual | Date field |
| 42 | Unique Index | Enforce uniqueness constraint | Low | Manual | None |
| 43 | Partial Index | Index only documents matching filter | Medium | Manual | None |
| 44 | Sparse Index | Skip documents missing the indexed field | Medium | Manual | None |
| 45 | Hidden Index | Index exists but planner ignores it (testing) | Low | Visible | None |
| 46 | Collation | Locale-aware string comparison and sorting | Medium | Simple binary | None |
| 47 | Change Streams | Real-time event stream of data changes | High | Enabled | Replica set/sharded |
| 48 | Change Stream Filters | Filter change events by operation type, fields | Medium | All changes | Change streams |
| 49 | Resume Tokens | Resume change stream from specific point | Medium | Auto | Change streams |
| 50 | Multi-Document ACID Transactions | Cross-document, cross-collection atomicity | High | Enabled (4.0+) | Replica set |
| 51 | Transaction Timeout | Max transaction execution time | Medium | 60s | Transactions |
| 52 | Read Concern (local, majority, snapshot, linearizable) | Consistency level for reads | Medium | local | Replica set |
| 53 | Write Concern (w, j, wtimeout) | Durability guarantee for writes | Medium | w:1 | Replica set |
| 54 | Read Preference | Route reads to primary/secondary/nearest | Medium | primary | Replica set |
| 55 | Replica Sets | 3+ node replication with auto-failover | High | Disabled | None |
| 56 | Oplog | Capped collection of all write operations | Medium | Auto | Replica set |
| 57 | Arbiter Nodes | Vote-only members (no data) | Low | Disabled | Replica set |
| 58 | Priority-based Election | Control which node becomes primary | Medium | All priority 1 | Replica set |
| 59 | Sharding | Horizontal partitioning across shard servers | High | Disabled | Config servers + mongos |
| 60 | Shard Key (Ranged/Hashed) | Determine data distribution strategy | High | Manual | Sharding |
| 61 | Zone Sharding | Pin data ranges to specific shards (geo-aware) | High | Disabled | Sharding |
| 62 | Mongos Router | Query router for sharded clusters | High | Required | Sharding |
| 63 | Config Servers | Store cluster metadata (replica set) | High | Required | Sharding |
| 64 | Chunk Splitting / Migration | Auto-balance data across shards | High | Auto | Sharding |
| 65 | GridFS | Store files > 16MB as chunks | Medium | Disabled | None |
| 66 | Time Series Collections | Optimized storage for time-series data | Medium | Manual | None |
| 67 | Capped Collections | Fixed-size, insertion-order collections | Low | Manual | None |
| 68 | Views | Read-only computed collections (aggregation-based) | Medium | Manual | Aggregation |
| 69 | On-Demand Materialized Views | $merge results into collection on schedule | Medium | Manual | Aggregation |
| 70 | Field-Level Encryption (CSFLE) | Client-side encrypt sensitive fields | High | Disabled | Driver support |
| 71 | Queryable Encryption | Query encrypted fields server-side | High | Disabled | Enterprise (7.0+) |
| 72 | Atlas Search (Lucene) | Full-text search powered by Lucene | High | Atlas only | MongoDB Atlas |
| 73 | Atlas Vector Search | Vector similarity search in Atlas | High | Atlas only | MongoDB Atlas |
| 74 | Map-Reduce | Legacy aggregation (deprecated in favor of pipeline) | High | Enabled | None |
| 75 | Server-Side JavaScript | Execute JS in $where / mapReduce (deprecated) | Medium | Disabled (5.0+) | None |
| 76 | Profiler | Log slow operations above threshold | Low | Off | None |
| 77 | Explain Plans | Query execution plan analysis | Low | Enabled | None |
| 78 | currentOp / killOp | Monitor and kill running operations | Low | Enabled | Admin |
| 79 | Authentication (SCRAM/x509/LDAP) | Multiple auth mechanisms | Medium | SCRAM-SHA-256 | None |
| 80 | Role-Based Access Control | Built-in and custom roles per database | Medium | Enabled | Auth |

## 4.4 Architecture Patterns

### Storage Engine (WiredTiger)
- Default since MongoDB 3.2; B-tree for indexes, page-based storage for documents
- MVCC: readers see consistent snapshot; no read locks
- Compression: snappy (default), zlib, zstd for documents; prefix compression for indexes
- Internal page cache (separate from OS file cache): default 50% of (RAM - 1GB)
- Checkpoint: every 60s; write dirty pages to disk; journal for crash recovery between checkpoints

### Oplog Replication
- Oplog: capped collection on primary recording every write as an idempotent operation
- Secondaries tail the oplog and apply operations in order
- Initial sync: full copy from a sync source, then switch to oplog tailing
- Replication lag: seconds typically; monitor with `rs.printReplicationInfo()`

### Chunk-based Sharding
- Collection divided into chunks (default 128MB) based on shard key range
- Balancer: background process migrates chunks from overloaded to underloaded shards
- Targeted queries: if query includes shard key, route to single shard
- Scatter-gather: if query doesn't include shard key, broadcast to all shards

### Mongos Routing
- Stateless query router; caches config metadata
- Client connects to mongos, not directly to shards
- Multiple mongos instances for HA (behind load balancer)

## 4.5 Memory Management
- **WiredTiger cache**: default max(50% of (RAM - 1GB), 256MB); stores decompressed pages
- **Index memory**: B-tree internal nodes ideally fit in cache; compound indexes larger
- **Document size limit**: 16MB per document
- **Connection overhead**: ~1MB per connection (thread stack); use connection pooling
- **Working set**: ideally fits in WiredTiger cache; disk-bound if exceeded
- **Estimation**: 1M documents (1KB avg) ≈ 1GB data + 500MB-2GB indexes depending on index count
- **Sharding**: distributes memory requirements across nodes

## 4.6 Testing Criteria
- **YCSB benchmark**: standardized workloads A-F (read-heavy to scan-heavy)
- **Write throughput**: inserts/sec for single doc, bulk, and with indexes
- **Read latency**: P50/P99 for point lookups, range queries, aggregations
- **Aggregation pipeline**: complex multi-stage pipeline execution time
- **Index build time**: foreground vs background index creation
- **Replication lag**: under sustained write load
- **Failover time**: primary failure detection → election → new primary serving
- **Sharded query routing**: targeted vs scatter-gather latency difference
- **Transaction overhead**: multi-doc transaction latency vs single-doc
- **Change stream throughput**: events/sec delivery to consumers

---

# 5. Time-Series Databases

## 5.1 Top 10 Open-Source Time-Series Databases

| # | Name | Language | GitHub Stars (approx) | License | Key Differentiator |
|---|------|----------|-----------------------|---------|--------------------|
| 1 | **InfluxDB** | Go/Rust | ~30k | MIT (OSS) / Proprietary (Cloud) | Most popular TSDB; Flux + InfluxQL; IOx engine (Arrow/Parquet) |
| 2 | **Prometheus** | Go | ~57k | Apache 2.0 | Pull-based metrics; PromQL; Kubernetes native monitoring |
| 3 | **TimescaleDB** | C (PG ext) | ~18k | Apache 2.0 (Community) | Full PostgreSQL + time-series hypertables; SQL native |
| 4 | **VictoriaMetrics** | Go | ~13k | Apache 2.0 | Long-term Prometheus storage; high compression; fast |
| 5 | **QuestDB** | Java/C++ | ~15k | Apache 2.0 | Column-oriented; fastest ingestion (millions rows/sec); SQL |
| 6 | **TDengine** | C | ~24k | AGPLv3 | Built for IoT; super tables; SQL-like; clustering built-in |
| 7 | **ClickHouse** | C++ | ~39k | Apache 2.0 | Column-store OLAP; sub-second analytics on billions of rows |
| 8 | **Apache IoTDB** | Java | ~4k | Apache 2.0 | Tree-model schema; IoT edge-to-cloud; TsFile format |
| 9 | **Grafana Mimir** | Go | ~4.5k | AGPLv3 | Horizontally-scalable Prometheus long-term storage |
| 10 | **Druid** | Java | ~13.5k | Apache 2.0 | Real-time analytics; sub-second OLAP; bitmap indexing |

## 5.2 Top 10 Proprietary / SaaS Time-Series Solutions

| # | Name | Vendor | Pricing (approx) |
|---|------|--------|-------------------|
| 1 | **InfluxDB Cloud** | InfluxData | Free tier (limited); Usage-based from $0.002/MB written |
| 2 | **Amazon Timestream** | AWS | $0.50/GB write; $0.01/GB scanned (memory); $0.03/GB scanned (magnetic) |
| 3 | **Timescale Cloud** | Timescale | Free 30 days; from $0.023/hr (compute) + storage |
| 4 | **Google Cloud Bigtable** | Google | From $0.65/hr per node + $0.026/GB storage |
| 5 | **Datadog Metrics** | Datadog | From $0.05/custom metric/mo (Pro plan) |
| 6 | **Grafana Cloud** | Grafana Labs | Free tier (10k metrics); Pro from $8/user/mo |
| 7 | **VictoriaMetrics Cloud** | VictoriaMetrics | From $0.01/1k active series/mo |
| 8 | **CrateDB Cloud** | CrateDB | From $0.246/hr (2 vCPU) |
| 9 | **KDB+ (kdb Insights)** | KX Systems | Enterprise license; ~$100k+/yr per core |
| 10 | **New Relic Metrics** | New Relic | Free tier (100GB/mo); Standard from $0.35/GB |

## 5.3 Features (80 features)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|--------------|
| 1 | Time-bucketed Storage | Organize data into time-bounded chunks/partitions | Medium | Enabled | None |
| 2 | Auto-partitioning by Time | Automatically create new partitions/chunks | Medium | Enabled | None |
| 3 | Chunk Interval Configuration | Set partition time range (1h, 1d, 1w, etc.) | Low | 7 days | Time-bucketed storage |
| 4 | Measurement / Metric Name | Top-level metric identifier | Low | Required | None |
| 5 | Tags / Labels | Indexed metadata dimensions (host, region, etc.) | Low | Required | None |
| 6 | Fields / Values | Actual metric values (float, int, string, bool) | Low | Required | None |
| 7 | Timestamp Precision | ns, μs, ms, or s timestamp resolution | Low | ns (InfluxDB) / ms (others) | None |
| 8 | Write Protocol (Line Protocol) | Simple text-based ingestion format | Low | Enabled (InfluxDB) | None |
| 9 | Prometheus Remote Write | Standard push protocol for metrics | Medium | Disabled | Prometheus-compatible |
| 10 | Prometheus Remote Read | Query back-end as Prometheus data source | Medium | Disabled | Prometheus-compatible |
| 11 | SQL Query Language | Standard SQL for querying time-series | Medium | Varies | None |
| 12 | PromQL | Prometheus-native query language | Medium | Prometheus/VM | None |
| 13 | Flux Query Language | Functional data scripting language (InfluxDB) | High | InfluxDB only | None |
| 14 | InfluxQL | SQL-like language for InfluxDB 1.x compatibility | Medium | InfluxDB only | None |
| 15 | Time-range Queries | Efficient range scans over time windows | Low | Enabled | None |
| 16 | Downsampling | Reduce granularity of old data (1s → 1m → 1h) | Medium | Disabled | Retention policies |
| 17 | Continuous Aggregation | Materialized views that auto-refresh on new data | High | Disabled | None |
| 18 | Retention Policies | Auto-delete data older than configured period | Medium | Infinite | None |
| 19 | Multiple Retention Policies | Different retention per measurement or tag | Medium | Single | Retention policies |
| 20 | Tiered Storage | Hot (memory/SSD) → warm (SSD) → cold (object storage) | High | Disabled | Storage config |
| 21 | Compression (Gorilla) | Facebook's streaming timestamp+value compression | High | Enabled | None |
| 22 | Delta-of-Delta Encoding | Compress timestamps via double differencing | Medium | Enabled | None |
| 23 | XOR Encoding | Compress floating-point values via XOR of consecutive | Medium | Enabled | None |
| 24 | Dictionary Encoding | Compress repeated tag values | Medium | Enabled | None |
| 25 | Snappy/LZ4/Zstd Compression | Block-level compression for cold data | Medium | Varies | None |
| 26 | Aggregation Functions | sum, avg, min, max, count, stddev, percentile | Low | Enabled | None |
| 27 | Windowing Functions | time_bucket, moving_avg, rate, increase | Medium | Enabled | None |
| 28 | Rate / Increase Calculation | Compute per-second rate from counter metrics | Medium | Enabled | None |
| 29 | Histogram Quantiles | Compute quantiles from histogram buckets | Medium | Enabled | PromQL/query lang |
| 30 | Gap Filling | Interpolate or fill missing time intervals | Medium | Disabled | None |
| 31 | Interpolation (linear, locf) | Fill gaps with linear interpolation or last observation | Medium | Disabled | Gap filling |
| 32 | Delta / Derivative | Compute rate of change | Medium | Enabled | None |
| 33 | Cumulative Sum | Running total over time | Low | Enabled | None |
| 34 | Top-N Queries | Find top N time series by aggregate value | Medium | Enabled | None |
| 35 | Group By Tags | Aggregate across tag dimensions | Low | Enabled | None |
| 36 | Subqueries | Nest queries for multi-step analysis | Medium | Varies | None |
| 37 | Recording Rules | Pre-compute and store frequently-needed queries | Medium | Disabled | Prometheus-style |
| 38 | Alerting Rules | Trigger alerts based on query conditions | Medium | Disabled | None |
| 39 | Alert Notification Channels | Route alerts to email, Slack, PagerDuty, webhook | Medium | Disabled | Alerting |
| 40 | Exemplars | Link metric samples to trace IDs | Medium | Disabled | Tracing system |
| 41 | Write-Ahead Log (WAL) | Durability via sequential writes before commit | Medium | Enabled | None |
| 42 | WAL Checkpoint / Flush | Periodic flush WAL to permanent storage | Medium | Auto | WAL |
| 43 | TSM Storage Engine | Time-Structured Merge tree (InfluxDB) | High | InfluxDB | None |
| 44 | LSM Storage Engine | Log-Structured Merge tree (VictoriaMetrics) | High | Various | None |
| 45 | Columnar Storage | Column-oriented layout for efficient scans/compression | High | ClickHouse/QuestDB | None |
| 46 | Parquet/Arrow Backend | Apache Arrow + Parquet for storage (InfluxDB IOx) | High | InfluxDB 3.0 | None |
| 47 | Inverted Index for Tags | Fast lookup of series by tag combinations | High | Enabled | None |
| 48 | Cardinality Management | Monitor and limit high-cardinality series | Medium | Monitoring only | None |
| 49 | High Cardinality Limits | Cap maximum series count to prevent OOM | Medium | Disabled | None |
| 50 | Series Deletion | Delete time series by label matcher | Medium | Enabled | None |
| 51 | Compaction | Merge and optimize storage blocks over time | High | Auto | None |
| 52 | Block-based Storage | Organize data into fixed-time blocks (2h default in Prometheus) | Medium | Enabled | None |
| 53 | Replication | Copy data across nodes for durability | High | Disabled | Cluster mode |
| 54 | Sharding by Metric | Distribute metrics across nodes by name/hash | High | Disabled | Cluster mode |
| 55 | Sharding by Time | Distribute time ranges across nodes | High | Disabled | Cluster mode |
| 56 | Federation | Query across multiple instances | Medium | Disabled | None |
| 57 | Multi-tenancy | Isolate data and queries per tenant | Medium | Disabled | None |
| 58 | Tenant-based Limits | Per-tenant rate limits, series limits, retention | Medium | Disabled | Multi-tenancy |
| 59 | HTTP API | REST-based write and query endpoints | Low | Enabled | None |
| 60 | gRPC API | Binary protocol for high-throughput writes | Medium | Some systems | None |
| 61 | OpenTelemetry Ingest | Accept OTLP metrics natively | Medium | Disabled | OTEL collector |
| 62 | Graphite Protocol Support | Accept Graphite plaintext/pickle metrics | Medium | Disabled | None |
| 63 | StatsD Protocol Support | Accept StatsD metrics | Medium | Disabled | None |
| 64 | Batch Write API | Ingest multiple data points in single request | Low | Enabled | None |
| 65 | Back-pressure / Rate Limiting | Protect against write overload | Medium | Disabled | None |
| 66 | Out-of-order Writes | Accept data points arriving out of time order | Medium | Limited | WAL |
| 67 | Authentication | User/password or token-based auth | Medium | Disabled | None |
| 68 | Authorization / RBAC | Per-database or per-org access control | Medium | Disabled | Auth |
| 69 | TLS | Encrypted connections | Medium | Disabled | Certificates |
| 70 | Grafana Integration | Native data source plugin for Grafana | Low | Available | Grafana |
| 71 | Dashboard Templates | Pre-built dashboards for common metrics | Low | Available | Grafana |
| 72 | Label Matchers | Filter series by label equality/regex | Low | Enabled | None |
| 73 | Metric Relabeling | Transform labels on ingest or query | Medium | Disabled | Prometheus-style |
| 74 | Deduplication | Remove duplicate samples across replicas | Medium | Disabled | Replication |
| 75 | Cross-datacenter Replication | Replicate across geographic regions | High | Disabled | Enterprise |
| 76 | Object Storage Backend | Use S3/GCS/Azure Blob for long-term data | High | Disabled | Cloud storage |
| 77 | Query Caching | Cache frequent query results | Medium | Disabled | None |
| 78 | Streaming Ingestion | Real-time low-latency write pipeline | Medium | Enabled | None |
| 79 | Backup/Restore | Snapshot and restore database | Medium | Enabled | None |
| 80 | Prometheus Scrape Config | Auto-discover and pull metrics from targets | Medium | Prometheus native | Service discovery |

## 5.4 Architecture Patterns

### Time-Structured Merge Tree (TSM — InfluxDB)
- Similar to LSM but optimized for time-ordered data
- WAL → in-memory cache → flush to TSM files (sorted by time + series key)
- TSM files: header + index block (min/max time per series) + data blocks (compressed)
- Compaction: level-based; merge overlapping TSM files; reduce file count
- Shard groups: each covers a time range; old shards become read-only

### Inverted Index for Tags (Prometheus/VM)
- Map label → list of series IDs containing that label
- Posting lists: sorted arrays of series IDs; intersect for multi-label queries
- Memory-mapped for fast access; built during block compaction
- High cardinality risk: millions of unique label values = huge index

### Chunk-based Storage (Prometheus)
- Head block: current ~2h in-memory (gorilla-compressed)
- Every 2h: cut block → write to disk as immutable block with index
- Compaction: merge small blocks into larger ones (up to retention limit)
- Each block: chunks/ (compressed samples), index (label→series), meta.json, tombstones

### Write-Ahead Log
- Every incoming sample written to WAL segment before in-memory
- WAL segments: fixed size (~128MB); sequential writes for throughput
- On recovery: replay WAL segments to rebuild head block
- Checkpoint: periodically truncate WAL by writing head state to disk

## 5.5 Memory Management
- **Prometheus head block**: ~3 bytes per sample (gorilla); 120 samples per series per 2h block
- **Series memory**: ~2-5KB per active series (labels + chunk references + indexes)
- **Rule**: RAM ≈ (active_series × 5KB) + (ingestion_rate × 2h × 3B) + index overhead
- **VictoriaMetrics**: ~1KB per active series; merge-tree with aggressive compression
- **InfluxDB IOx**: leverages Apache Arrow memory model; columnar batches
- **Cardinality is key**: 1M active series ≈ 5-10 GB RAM in Prometheus; reduce labels to control

## 5.6 Testing Criteria
- **Write throughput**: data points/sec (target: millions/sec for modern TSDBs)
- **Query latency**: range query over 1h/1d/7d/30d windows at various resolutions
- **Compression ratio**: bytes per data point on disk
- **Compaction overhead**: CPU/IO impact during background compaction
- **Cardinality scaling**: performance at 100k, 1M, 10M active series
- **Out-of-order ingestion**: handling late-arriving data
- **HA failover time**: replica promotion or catchup delay
- **Long-term query**: performance querying months/years of historical data
- **Resource usage**: CPU and memory per million samples ingested
- **TSBS benchmark**: Time Series Benchmark Suite (standardized workloads)

---

# 6. Search Engines / Full-Text Search

## 6.1 Top 10 Open-Source Search Engines

| # | Name | Language | GitHub Stars (approx) | License | Key Differentiator |
|---|------|----------|-----------------------|---------|--------------------|
| 1 | **Elasticsearch** | Java | ~72k | SSPL / Elastic License 2.0 | De facto standard; richest feature set; ELK ecosystem |
| 2 | **OpenSearch** | Java | ~10k | Apache 2.0 | AWS-backed Elasticsearch fork; truly open-source |
| 3 | **Apache Solr** | Java | ~1k (mirror) | Apache 2.0 | Mature Lucene-based; SolrCloud distributed; enterprise |
| 4 | **Meilisearch** | Rust | ~49k | MIT | Instant typo-tolerant search; dead-simple API; dev-friendly |
| 5 | **Typesense** | C++ | ~22k | GPLv3 | Fast, typo-tolerant; RAM-first; simple operations |
| 6 | **Manticore Search** | C++ | ~4.5k | GPLv2 | Sphinx fork; SQL-native; fast full-text; columnar storage |
| 7 | **Quickwit** | Rust | ~8k | AGPLv3 | Cloud-native search on object storage (S3); log analytics |
| 8 | **Zinc** | Go | ~17k | Apache 2.0 | Lightweight Elasticsearch alternative; single binary; Bluge |
| 9 | **Tantivy** | Rust | ~12.5k | MIT | Rust search library (like Lucene for Rust); embeddable |
| 10 | **Sonic** | Rust | ~20k | MPL 2.0 | Ultra-lightweight search backend; schema-less; fast |

## 6.2 Top 10 Proprietary / SaaS Search Solutions

| # | Name | Vendor | Pricing (approx) |
|---|------|--------|-------------------|
| 1 | **Algolia** | Algolia | Free 10k searches/mo; Grow from $0.50/1k requests |
| 2 | **Elastic Cloud** | Elastic | From $95/mo (Standard); custom for Enterprise |
| 3 | **Amazon OpenSearch Service** | AWS | From $0.036/hr (t3.small) |
| 4 | **Splunk** | Cisco/Splunk | From $15/user/mo (Observability); Enterprise custom |
| 5 | **Meilisearch Cloud** | Meilisearch | Free (100k docs); Pro from $30/mo |
| 6 | **Typesense Cloud** | Typesense | From $0.015/hr per node |
| 7 | **Bonsai** | Bonsai (managed ES) | From $25/mo (Sandbox) |
| 8 | **Searchly** | SearchBox | From $19/mo |
| 9 | **Coveo** | Coveo | Enterprise; custom pricing (~$50k+/yr) |
| 10 | **Swiftype** | Elastic (acquired) | From $79/mo (Site Search) |

## 6.3 Features (90 features)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|--------------|
| 1 | Inverted Index | Core data structure mapping terms → document IDs | Low | Enabled | None |
| 2 | BM25 Scoring | Probabilistic relevance scoring (default ranking) | Low | Default | Inverted index |
| 3 | TF-IDF Scoring | Classic term frequency × inverse doc frequency | Low | Available | Inverted index |
| 4 | Custom Scoring (Function Score) | Combine relevance + custom factors (recency, popularity) | High | Disabled | None |
| 5 | Script-based Scoring | Compute scores with scripting language (Painless) | High | Disabled | Scripting |
| 6 | Boosting | Increase/decrease field or query weight | Medium | Manual | None |
| 7 | Index Mappings | Define field types and analysis settings | Medium | Dynamic | None |
| 8 | Dynamic Mapping | Auto-detect and map new fields | Low | Enabled | None |
| 9 | Explicit Mapping | Manually define field types and properties | Medium | Manual | None |
| 10 | Field Types | text, keyword, integer, float, date, boolean, geo_point, nested, object | Low | Dynamic | Mappings |
| 11 | Multi-fields | Index same field differently (text + keyword) | Medium | Manual | Mappings |
| 12 | Analyzers | Chain of char_filter → tokenizer → token_filters | Medium | standard | None |
| 13 | Standard Analyzer | Default: Unicode text segmentation + lowercase | Low | Default | None |
| 14 | Language Analyzers | Stemming, stop words per language (30+ languages) | Medium | Disabled | None |
| 15 | Custom Analyzer | Build analyzer from component parts | Medium | Manual | None |
| 16 | Tokenizers | standard, whitespace, keyword, pattern, ngram, edge_ngram, etc. | Medium | standard | Analyzers |
| 17 | Token Filters | lowercase, stemmer, synonym, stop, ngram, shingle, etc. | Medium | lowercase | Analyzers |
| 18 | Char Filters | html_strip, pattern_replace, mapping | Medium | None | Analyzers |
| 19 | Synonym Support | Expand queries with synonyms (inline or file) | Medium | Disabled | Token filter |
| 20 | Stop Words | Remove common words from index/queries | Low | Language-specific | Token filter |
| 21 | Stemming | Reduce words to root form (running → run) | Medium | Disabled | Token filter |
| 22 | Ngram Tokenization | Substring matching via ngram tokens | Medium | Disabled | Tokenizer |
| 23 | Edge Ngram | Prefix matching via edge ngrams (autocomplete) | Medium | Disabled | Tokenizer |
| 24 | Full-text Match Query | Find documents matching analyzed text | Low | Enabled | None |
| 25 | Multi-match Query | Search across multiple fields | Low | Enabled | None |
| 26 | Phrase Match | Exact phrase matching with slop tolerance | Medium | Enabled | None |
| 27 | Fuzzy Search | Levenshtein distance–based typo tolerance | Medium | Enabled | None |
| 28 | Wildcard Query | Pattern matching with * and ? | Medium | Enabled | None |
| 29 | Prefix Query | Match documents with field prefix | Low | Enabled | None |
| 30 | Regexp Query | Regular expression matching | Medium | Enabled | None |
| 31 | Range Query | Numeric/date range filtering | Low | Enabled | None |
| 32 | Bool Query (must/should/must_not/filter) | Compound query with boolean logic | Medium | Enabled | None |
| 33 | Nested Query | Query nested objects maintaining relationships | Medium | Enabled | Nested mapping |
| 34 | Has Child / Has Parent | Join-style queries across parent-child documents | High | Disabled | Parent-child mapping |
| 35 | Exists Query | Filter by field existence | Low | Enabled | None |
| 36 | Terms Set Query | Match if min N of listed terms appear | Medium | Enabled | None |
| 37 | More Like This | Find similar documents to a given document | Medium | Enabled | None |
| 38 | Percolate Query | Reverse search: match stored queries against documents | High | Disabled | Percolator mapping |
| 39 | Terms Aggregation | Bucket by unique field values (faceting) | Medium | Enabled | None |
| 40 | Histogram Aggregation | Bucket by numeric intervals | Medium | Enabled | None |
| 41 | Date Histogram Aggregation | Bucket by time intervals (1h, 1d, 1w, etc.) | Medium | Enabled | None |
| 42 | Range Aggregation | Custom range buckets | Medium | Enabled | None |
| 43 | Stats Aggregation | min, max, avg, sum, count in one pass | Low | Enabled | None |
| 44 | Extended Stats | variance, std_deviation, sum_of_squares | Low | Enabled | None |
| 45 | Percentiles Aggregation | Approximate percentile computation | Medium | Enabled | None |
| 46 | Cardinality Aggregation | Approximate distinct count (HyperLogLog++) | Medium | Enabled | None |
| 47 | Nested Aggregation | Aggregate on nested documents | Medium | Enabled | Nested mapping |
| 48 | Pipeline Aggregations | Compute on results of other aggregations | High | Enabled | None |
| 49 | Significant Terms | Find statistically unusual terms in result set | Medium | Enabled | None |
| 50 | Composite Aggregation | Paginate through aggregation buckets | Medium | Enabled | None |
| 51 | Highlighting | Return matched text snippets with markup | Medium | Enabled | None |
| 52 | Suggest / Autocomplete | Term and phrase suggestions as-you-type | Medium | Enabled | None |
| 53 | Completion Suggester | FST-based prefix autocomplete | Medium | Disabled | Special mapping |
| 54 | Did-you-mean (Phrase Suggest) | Suggest corrected phrases | Medium | Enabled | None |
| 55 | Faceted Search | Combine search results with aggregation counts | Medium | Enabled | Aggregations |
| 56 | Geo Point Queries | Distance, bounding box, polygon geo queries | Medium | Enabled | geo_point mapping |
| 57 | Geo Shape Queries | Complex geometry intersection queries | Medium | Enabled | geo_shape mapping |
| 58 | Vector Search (kNN) | Dense vector approximate nearest neighbor | High | Disabled (8.0+) | dense_vector mapping |
| 59 | Hybrid Search (kNN + text) | Combine vector similarity with BM25 text search | High | Disabled | Vector search + text |
| 60 | Index Lifecycle Management (ILM) | Automate hot → warm → cold → delete phases | High | Disabled | None |
| 61 | Rollover | Auto-create new index when size/age/doc count threshold met | Medium | Disabled | ILM |
| 62 | Index Templates | Pre-define mappings/settings for new indices | Medium | Disabled | None |
| 63 | Component Templates | Reusable mapping/settings blocks | Medium | Disabled | None |
| 64 | Index Aliases | Named references to one or more indices | Low | Manual | None |
| 65 | Reindex API | Copy documents between indices with transformation | Medium | Enabled | None |
| 66 | Ingest Pipelines | Transform documents on write (enrich, grok, etc.) | Medium | Disabled | None |
| 67 | Ingest Processors | grok, date, geoip, enrich, set, rename, script, etc. | Medium | Available | Ingest pipelines |
| 68 | Enrich Processor | Lookup and add data from another index on ingest | High | Disabled | Enrich policy |
| 69 | Snapshots | Backup indices to S3/GCS/Azure/NFS | Medium | Disabled | Repository config |
| 70 | Snapshot Lifecycle Management | Automated snapshot schedules | Medium | Disabled | Snapshots |
| 71 | Cross-Cluster Replication (CCR) | Replicate indices across clusters (DR) | High | Disabled | Platinum license |
| 72 | Cross-Cluster Search (CCS) | Query remote clusters from local | Medium | Disabled | Remote cluster config |
| 73 | Sharding | Distribute index across multiple shards | Medium | 1 shard default | None |
| 74 | Shard Allocation Awareness | Place shards considering rack/zone | Medium | Disabled | Node attributes |
| 75 | Replicas | Shard copies for HA and read throughput | Medium | 1 replica | None |
| 76 | Scripting (Painless) | Built-in scripting for queries, aggs, updates | Medium | Enabled | None |
| 77 | Runtime Fields | Define fields at query time without reindexing | Medium | Disabled | None |
| 78 | Data Streams | Append-only time-series index pattern | Medium | Disabled | Index templates |
| 79 | Transforms | Pivot or latest entity-centric indices from time-series | High | Disabled | None |
| 80 | Machine Learning (Anomaly Detection) | Auto-detect anomalies in time-series data | High | Disabled | ML node + license |
| 81 | ML Inference Pipelines | Run ML models on ingest (NER, classification, etc.) | High | Disabled | Trained models |
| 82 | Alerting / Watcher | Rule-based alerting on query conditions | Medium | Disabled | None |
| 83 | Authentication (Native/LDAP/SAML) | User authentication mechanisms | Medium | Basic (free) | Security |
| 84 | RBAC | Role-based access per index/field/document | Medium | Basic roles | Security |
| 85 | Field-level Security | Restrict access to specific fields | High | Disabled | Platinum |
| 86 | Document-level Security | Filter documents per user/role | High | Disabled | Platinum |
| 87 | Audit Logging | Log security-relevant events | Medium | Disabled | Security |
| 88 | Frozen Tier | Searchable snapshots on cheapest storage | High | Disabled | ILM + Snapshots |
| 89 | Scroll API / Search After | Deep pagination through large result sets | Medium | Enabled | None |
| 90 | Point in Time (PIT) | Consistent view for paginated search | Medium | Enabled (7.10+) | None |

## 6.4 Architecture Patterns

### Lucene Segments
- Each shard is a Lucene index: collection of immutable segments
- Segment: self-contained inverted index + stored fields + doc values + term vectors
- New documents: buffered in memory → flushed as new segment
- Segments are immutable; deletes marked as tombstones; actual removal on merge

### Near-Real-Time Search
- Refresh: make newly indexed docs searchable (default: every 1 second)
- Refresh creates new Lucene segment from in-memory buffer (no fsync yet)
- Flush/commit: fsync segments to disk for durability (default: every 30 min or translog size)
- Translog: per-shard write-ahead log for crash recovery between flushes

### Shard Routing
- Index = N primary shards + R replica shards
- Document → shard: `shard = hash(routing) % num_primary_shards`
- Query: coordinating node fans out to all shards → merge results
- Custom routing: co-locate related documents on same shard

### Distributed Aggregation
- Scatter: each shard computes local aggregation
- Gather: coordinating node merges shard-level aggregation results
- For terms aggs: `shard_size` controls per-shard bucket count for accuracy
- Pipeline aggs: computed only on coordinating node after gather

### Merge Policies
- Tiered Merge Policy (default): group segments by size tier; merge within tiers
- Log Byte Size: merge when total segment size exceeds threshold
- Force Merge: manual merge to N segments (optimize for read-heavy indices)
- Merge impacts: I/O spike during merge; throttled by `max_merge_at_once`, `max_merged_segment`

## 6.5 Memory Management
- **Heap**: JVM heap for field data cache, query cache, indexing buffers; typically 50% RAM (max ~31GB for compressed oops)
- **Off-heap**: Lucene segments memory-mapped; OS page cache critical
- **Field data cache**: loaded on first aggregation/sort on text field; can be huge
- **Doc values**: columnar on-disk format for aggs/sort (default for most fields); minimal heap
- **Query cache**: LRU cache of filter results (bitsets); 10% of heap default
- **Request cache**: shard-level cache of aggregation results; invalidated on refresh
- **Indexing buffer**: 10% of heap default; controls segment flush frequency
- **Rule of thumb**: 50% RAM to JVM heap (≤31GB), 50% to OS for page cache

## 6.6 Testing Criteria
- **Indexing throughput**: documents/sec (bulk API, varying document sizes)
- **Search latency**: P50/P99 for term, phrase, fuzzy, bool queries
- **Aggregation latency**: terms, histogram, nested aggs on varying cardinality
- **Relevance quality**: nDCG, MAP scores against labeled test set
- **Autocomplete latency**: P99 for prefix completion queries
- **Index size on disk**: compression ratio vs raw JSON
- **Refresh impact**: search latency degradation during heavy indexing
- **Merge impact**: I/O and latency during segment merges
- **Cluster scaling**: linear throughput increase with added nodes
- **Rally benchmark**: official Elasticsearch benchmarking tool with standard tracks

---

# Appendix: Cross-Category Comparison Matrix

| Aspect | Vector DB | Graph DB | Key-Value | Document DB | Time-Series | Search Engine |
|--------|-----------|----------|-----------|-------------|-------------|---------------|
| **Primary Model** | Vectors + metadata | Nodes + edges | Key → value | JSON documents | Timestamp + metrics | Inverted index + docs |
| **Query Pattern** | Similarity search | Traversal/pattern | Point lookup | Filter + aggregate | Time-range scan | Full-text + facets |
| **Consistency** | Eventual/tunable | ACID | Varies (AP or CP) | Tunable (R/W concern) | Eventual | Near-real-time |
| **Scaling** | Shard by collection | Graph partitioning | Hash slots/ranges | Chunk-based sharding | Time + metric sharding | Index sharding |
| **Typical Latency** | 1-50ms (search) | 1-100ms (traversal) | <1ms (cache hit) | 1-10ms (indexed) | 1-50ms (range query) | 5-50ms (search) |
| **Compression** | Quantization (4-32x) | Property compression | In-memory (none) | Snappy/Zstd (2-5x) | Gorilla (10-15x) | Lucene (2-4x) |
| **Forgeprint Provider** | SKVector | SKGraph | SKCache | SKDocument | SKTimeSeries | SKSearch |

---

*This document serves as the definitive reference for Forgeprint Tier 2 database provider implementations. Each category's features inform the provider interface, configuration schema, and test harness design.*
