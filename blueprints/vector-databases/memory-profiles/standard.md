# Standard Memory Profile for Vector Databases

## Overview
This document provides comprehensive memory management guidelines for vector database implementations. Memory efficiency is critical for handling billions of embeddings while maintaining sub-10ms query latency and manageable operational costs.

## Memory Architecture Principles

### 1. Vector Data Lifecycle Management
**Vector Storage**: The dominant memory consumer in vector databases
- **Creation**: Allocate vectors in contiguous segments for cache efficiency
- **Access**: Prefer memory-mapped storage for hot/cold data management  
- **Quantization**: Compress vectors aggressively while preserving search quality
- **Cleanup**: Zero-copy deletion using tombstone bitsets

### 2. HNSW Graph Memory Strategy
**Graph Structure**: Balance memory usage vs search performance
```rust
// Memory layout for HNSW node
struct HnswNode {
    layer_links: Vec<Vec<PointOffsetId>>, // 8 bytes per link
    // Total: ~8 * M * num_layers bytes per node
}
```

**Layer Distribution**:
- **Layer 0**: Contains all vectors (~100% of nodes)
- **Layer 1**: Contains ~6.25% of nodes (M=16)
- **Layer 2**: Contains ~0.39% of nodes
- **Higher layers**: Exponentially fewer nodes

**Memory Calculation**:
```
HNSW Memory = Points × (M × 8 bytes + overhead)
For 1M vectors, M=16: ~128MB graph overhead
For 10M vectors, M=16: ~1.3GB graph overhead  
For 100M vectors, M=16: ~13GB graph overhead
```

### 3. Segment-Based Storage
**Immutable Segments**: LSM-style storage for write efficiency
- **Memtable**: Hot write buffer (512MB - 2GB typical)
- **Plain Segments**: Flushed data without HNSW index
- **Indexed Segments**: Optimized segments with HNSW graphs

## Detailed Memory Breakdown

### 1. Vector Storage Memory

#### Full Precision Storage (float32)
```
Vector Memory = num_vectors × dimension × 4 bytes

Examples (768-dimensional embeddings):
- 1M vectors: 768 × 1M × 4 = ~3.0 GB
- 10M vectors: 768 × 10M × 4 = ~29 GB  
- 100M vectors: 768 × 100M × 4 = ~287 GB
```

#### Scalar Quantization (SQ8)
```rust
struct ScalarQuantizedStorage {
    vectors: Vec<u8>,              // dimension × num_vectors bytes
    min_max_values: Vec<(f32, f32)>, // 8 bytes per dimension
    scale_factors: Vec<f32>,        // 4 bytes per dimension  
}

// Memory calculation
SQ8 Memory = num_vectors × dimension × 1 byte + dimension × 12 bytes

Examples (768-dimensional):
- 1M vectors: 768MB + 9KB ≈ 768MB (4× compression)
- 10M vectors: 7.7GB + 9KB ≈ 7.7GB  
- 100M vectors: 76.8GB + 9KB ≈ 77GB
```

#### Product Quantization (PQ)
```rust
struct ProductQuantizedStorage {
    codes: Vec<Vec<u8>>,           // num_subquantizers bytes per vector
    codebooks: Vec<Vec<Vec<f32>>>, // subquant × 256 × sub_dim × 4 bytes
}

// For PQ64 (64 subquantizers, 256 centroids each):
// Codebook size = 64 × 256 × (768/64) × 4 = 2MB
// Vector codes = num_vectors × 64 bytes

PQ64 Memory = num_vectors × 64 bytes + 2MB

Examples:
- 1M vectors: 64MB + 2MB = 66MB (48× compression!)
- 10M vectors: 640MB + 2MB = 642MB
- 100M vectors: 6.4GB + 2MB = 6.4GB
```

#### Binary Quantization  
```rust
struct BinaryQuantizedStorage {
    binary_codes: Vec<Vec<u8>>,    // dimension/8 bytes per vector
    thresholds: Vec<f32>,          // dimension × 4 bytes
}

Binary Memory = num_vectors × (dimension / 8) + dimension × 4

Examples (768-dim):
- 1M vectors: 96MB + 3KB = 96MB (32× compression)
- 10M vectors: 960MB + 3KB = 960MB
- 100M vectors: 9.6GB + 3KB = 9.6GB
```

### 2. HNSW Graph Memory

#### Graph Structure Memory
```rust
struct HnswGraph {
    layers: Vec<Layer>,            // Number of layers (typically 4-6)
    entry_point: PointOffsetId,    // 4 bytes
    point_count: usize,            // 8 bytes
}

struct Layer {
    // Adjacency lists: point_id -> [neighbor_ids]
    links: Vec<Vec<PointOffsetId>>, // 8 bytes per link
}
```

**Memory Analysis**:
- **Layer 0**: Each point has up to 2×M links (16 bytes each for M=16)
- **Higher layers**: Each point has up to M links (8 bytes each)
- **Layer assignment**: Exponential distribution with parameter 1/ln(M)

```
Layer 0 memory = points × M × 2 × 8 bytes
Upper layers memory = points × M × 8 bytes × ∑(layer_probability)

Total HNSW = points × M × 8 × (2 + sparse_factor)
Where sparse_factor ≈ 1/(M-1) ≈ 0.067 for M=16

Simplified: HNSW Memory ≈ points × M × 16.5 bytes
```

**Examples (M=16)**:
```
1M vectors: 1M × 16 × 16.5 = 264MB
10M vectors: 10M × 16 × 16.5 = 2.6GB  
100M vectors: 100M × 16 × 16.5 = 26GB
1B vectors: 1B × 16 × 16.5 = 264GB
```

#### On-Disk vs In-Memory HNSW
```yaml
# Memory-resident (fast search)
hnsw_config:
  on_disk: false
  memory_usage: "full"    # Keep entire graph in RAM

# Disk-resident (memory-efficient)  
hnsw_config:
  on_disk: true
  mmap_enabled: true     # OS manages hot/cold pages
  memory_usage: "minimal" # Only graph metadata in RAM
```

**Memory Savings**:
- **Memory-resident**: 100% graph in RAM, ~2-5ms P95 latency
- **mmap-resident**: ~20-40% graph in RAM (hot pages), ~5-15ms P95 latency
- **Disk-resident**: ~5-10% graph in RAM (metadata only), ~15-50ms P95 latency

### 3. Payload Index Memory

#### Field Index Structures
```rust
enum PayloadIndex {
    Keyword(KeywordIndex),         // HashMap: value -> bitset
    Numeric(NumericIndex),         // BTree: value -> bitset  
    FullText(FullTextIndex),       // Inverted: term -> bitset
    Geo(GeoIndex),                 // R-tree: region -> points
}

struct KeywordIndex {
    index: HashMap<String, RoaringBitmap>,
    // Memory: unique_values × (key_size + 32 bytes + bitmap_size)
}
```

**Memory Estimates per Field**:
```
Keyword fields:
- Low cardinality (100 values): ~50KB + bitmaps
- Medium cardinality (10K values): ~5MB + bitmaps  
- High cardinality (1M values): ~500MB + bitmaps

Numeric fields:
- BTree overhead: ~32 bytes per unique value
- Range queries: Minimal extra memory

Full-text fields:  
- Vocabulary size × (term_size + bitmap_size)
- Typical: 50K-500K terms = 50-500MB per field

Geo fields:
- R-tree: ~64 bytes per point + spatial index overhead
- ~100-200MB for 1M geo points
```

**Bitmap Memory** (RoaringBitmap compression):
- **Dense bitmaps** (>50% set): ~bitset_size/8 bytes
- **Sparse bitmaps** (<10% set): ~num_set_bits × 4 bytes  
- **Medium density**: Hybrid compression, varies

```
Example: 10M points, 5% match filter
Sparse bitmap: 500K set bits × 4 = 2MB per filter value
Dense bitmap: 10M bits / 8 = 1.25MB per filter value
```

#### Index Memory per Collection
```yaml
# Example collection: 10M vectors with metadata
collection_memory:
  vectors: "29GB"           # 768-dim float32
  hnsw_graph: "2.6GB"       # M=16
  payload_indexes:
    category: "50MB"        # 1K unique categories
    timestamp: "40MB"       # Numeric range index
    user_id: "200MB"        # 2M unique users
    description: "300MB"    # Full-text index
  total_payload: "590MB"
  
total_collection: "32.8GB"
```

### 4. WAL and Write Buffer Memory

#### Write-Ahead Log Memory
```rust
struct WalManager {
    current_segment: WalSegment,    // Active write buffer
    segment_buffer: Vec<u8>,        // 32MB typical
    flush_queue: VecDeque<WalRecord>,
}

struct WalSegment {
    buffer: Vec<u8>,               // segment_size (default: 32MB)
    compressed_buffer: Vec<u8>,    // Optional compression
    pending_records: u32,
}
```

**WAL Memory Usage**:
```
Per WAL segment: segment_size (32MB default)
Total WAL memory: num_segments × segment_size + compression_buffer

Typical configuration:
- Active segment: 32MB
- Flush queue: 4-16MB  
- Compression buffer: 8-32MB (if enabled)
- Total WAL memory: 50-100MB
```

#### Memtable Memory (Mutable Segment)
```rust
struct MemtableSegment {
    vectors: Vec<Vec<f32>>,              // Raw vector storage
    payloads: Vec<HashMap<String, Value>>, // Payload storage
    id_mapping: HashMap<PointId, usize>, // ID -> offset mapping
    deleted_bitset: BitVec,              // Tombstone tracking
}

// Memory calculation
Memtable Memory = vectors + payloads + id_mapping + overhead

Example (100K vectors in memtable):
- Vectors: 100K × 768 × 4 = 307MB
- Payloads: 100K × ~500 bytes = 50MB (varies by schema)
- ID mapping: 100K × 16 bytes = 1.6MB  
- Deleted bitset: 100K bits = 12.5KB
- Total: ~360MB per 100K vectors
```

#### Memtable Flush Triggers
```yaml
flush_config:
  max_points: 200000           # Flush after 200K vectors
  max_memory: "1GB"            # Or after 1GB memory usage  
  max_age: "300s"              # Or after 5 minutes
  
# Memory usage grows until flush trigger hit
# Peak memory = normal + unflushed_memtable
```

### 5. Query Execution Memory

#### Search Memory Usage
```rust
struct SearchExecution {
    candidates_heap: BinaryHeap<ScoredPoint>, // ef × 16 bytes
    visited_set: HashSet<PointOffsetId>,      // ef × 8 bytes  
    distance_table: Vec<Vec<f32>>,           // PQ distance tables
    prefetch_buffer: Vec<Vec<f32>>,          // Multi-stage pipeline
}
```

**Memory per Query**:
```
Basic search (ef=128, k=10):
- Candidates heap: 128 × 16 = 2KB
- Visited set: 128 × 8 = 1KB
- Distance computations: negligible
- Total per query: ~5-10KB

Large search (ef=2048, k=100):  
- Candidates heap: 2048 × 16 = 32KB
- Visited set: 2048 × 8 = 16KB
- Total per query: ~50-100KB

Batch search (32 queries, ef=128):
- Total: 32 × 10KB = 320KB
```

#### Concurrent Search Memory
```yaml
search_config:
  max_concurrent_queries: 100
  per_query_memory: "50KB"      # Conservative estimate
  
# Peak search memory = max_concurrent × per_query_memory
# Example: 100 queries × 50KB = 5MB search overhead
```

#### Quantized Search Tables
```rust
// Product Quantization distance tables
struct PqSearchMemory {
    distance_tables: Vec<Vec<f32>>, // subquant × 256 × 4 bytes
    // PQ64: 64 × 256 × 4 = 64KB per query
}

// Binary quantization popcount tables  
struct BinarySearchMemory {
    popcount_lut: [u8; 256],       // 256 bytes (shared)
    query_binary: Vec<u8>,         // dimension/8 bytes  
}
```

## Memory Scaling Guidelines

### 1. Small Collections (1K-1M vectors)
```yaml
small_collection_profile:
  target_memory: "1-10GB"
  vector_storage: "in_memory"      # Full precision
  hnsw_index: "in_memory"          # Fast search
  payload_indexes: "all_indexed"   # Index all fields
  quantization: "disabled"         # Not needed
  wal_buffer: "32MB"
  
memory_breakdown:
  vectors: "70-80%"               # Dominant component
  hnsw: "15-20%"                  # Graph overhead
  payload: "3-8%"                 # Metadata indexes
  system: "2-5%"                  # WAL, buffers, etc.
```

### 2. Medium Collections (1M-50M vectors)  
```yaml
medium_collection_profile:
  target_memory: "10-200GB"
  vector_storage: "scalar_quantized" # 4× compression
  hnsw_index: "in_memory"           # Keep graph fast
  payload_indexes: "selective"      # Index key fields only
  quantization: "sq8"
  wal_buffer: "64MB"
  
memory_breakdown:
  vectors: "60-70%"               # Still dominant
  hnsw: "20-25%"                  # Larger relative overhead
  payload: "5-10%"                # More selective indexing  
  system: "3-7%"
```

### 3. Large Collections (50M-1B vectors)
```yaml
large_collection_profile:
  target_memory: "200GB-2TB"
  vector_storage: "product_quantized" # 20-50× compression  
  hnsw_index: "mmap_disk"           # Memory-map for size
  payload_indexes: "minimal"        # Critical fields only
  quantization: "pq64"
  wal_buffer: "128MB"
  prefetch_pipeline: "enabled"     # Multi-stage search
  
memory_breakdown:
  vectors: "40-50%"               # Reduced by quantization
  hnsw: "30-40%"                  # Graph still significant
  payload: "5-15%"                # Selective indexing
  system: "5-10%"                 # Larger buffers
```

### 4. Extreme Collections (1B+ vectors)
```yaml
extreme_collection_profile:
  target_memory: "1-10TB"
  vector_storage: "hierarchical_quantized" 
  hnsw_index: "disk_resident"      # Minimal RAM usage
  payload_indexes: "external"      # Separate index servers
  quantization: "multi_stage"     # Binary + PQ pipeline
  sharding: "required"             # Distributed storage
  
memory_breakdown:
  vectors: "30-40%"               # Aggressive compression
  hnsw: "20-30%"                  # Partial in-memory
  payload: "10-20%"               # External systems
  system: "20-30%"                # Coordination overhead
```

## Memory Optimization Strategies

### 1. Quantization Selection Matrix
```yaml
quantization_decision_matrix:
  
  # < 10M vectors, memory abundant
  no_quantization:
    recall_loss: "0%"
    memory_usage: "100%"
    search_latency: "1.0x"
    use_when: "memory_budget > 4× vector_size"
  
  # 10M-100M vectors, moderate memory pressure  
  scalar_quantization:
    recall_loss: "1-3%"
    memory_usage: "25%"       # 4× compression
    search_latency: "1.1x"    # Slight overhead
    use_when: "memory_budget = 1-4× vector_size"
  
  # 100M-1B vectors, high memory pressure
  product_quantization:
    recall_loss: "5-10%"
    memory_usage: "2-10%"     # 10-50× compression  
    search_latency: "1.3x"    # Rescoring overhead
    use_when: "memory_budget < 1× vector_size"
  
  # 1B+ vectors, extreme memory pressure
  binary_quantization:
    recall_loss: "15-25%"
    memory_usage: "3%"        # 32× compression
    search_latency: "2.0x"    # Multi-stage pipeline
    use_when: "memory_budget << vector_size"
```

### 2. Memory-Conscious Configuration
```rust
// Adaptive memory management
struct MemoryManager {
    total_budget: usize,
    current_usage: AtomicUsize,
    pressure_threshold: f32,    // 0.8 = 80% memory usage
}

impl MemoryManager {
    fn suggest_quantization(&self, collection_size: usize) -> QuantizationStrategy {
        let vector_memory = collection_size * self.dimension * 4;
        let available = self.total_budget - self.current_usage.load(Ordering::Relaxed);
        
        if available > vector_memory * 2 {
            QuantizationStrategy::None  // Plenty of memory
        } else if available > vector_memory / 2 {
            QuantizationStrategy::Scalar // Moderate memory  
        } else if available > vector_memory / 10 {
            QuantizationStrategy::Product // Tight memory
        } else {
            QuantizationStrategy::Binary  // Very tight memory
        }
    }
}
```

### 3. Hot/Cold Data Strategies
```yaml
# Memory-map with kernel page management
storage_tiers:
  
  hot_data:
    location: "ram"
    contains: 
      - "recent_vectors"      # Last 1M inserted
      - "hnsw_top_layers"     # Layers 1-3 for fast navigation
      - "active_payload_indexes"
    memory_budget: "60%"
  
  warm_data:  
    location: "mmap_ssd"
    contains:
      - "older_vectors"       # Bulk of collection
      - "hnsw_layer_0"        # Detailed layer, paged in
      - "infrequent_indexes"
    memory_budget: "30%"     # OS page cache
  
  cold_data:
    location: "disk"  
    contains:
      - "archived_vectors"    # Rarely accessed
      - "deleted_segments"    # Tombstoned data
    memory_budget: "5%"      # Minimal caching
```

### 4. Memory Leak Prevention
```rust
/// Memory monitoring for leak detection
struct MemoryTracker {
    allocation_tracker: HashMap<TypeId, usize>,
    peak_usage: AtomicUsize,
    leak_threshold: Duration,
}

impl MemoryTracker {
    fn track_allocation(&self, type_id: TypeId, size: usize) {
        let current = self.allocation_tracker.entry(type_id)
            .or_insert(0);
        *current += size;
        
        let total: usize = self.allocation_tracker.values().sum();
        self.peak_usage.fetch_max(total, Ordering::Relaxed);
    }
    
    fn check_for_leaks(&self) -> Vec<MemoryLeak> {
        // Identify components using excessive memory
        self.allocation_tracker.iter()
            .filter(|(&type_id, &size)| {
                size > self.expected_size_for_type(type_id) * 2
            })
            .map(|(&type_id, &size)| MemoryLeak { type_id, size })
            .collect()
    }
}
```

## Resource Monitoring and Alerts

### 1. Memory Metrics Collection
```yaml
memory_metrics:
  
  collection_level:
    - "vectors_memory_bytes"
    - "hnsw_memory_bytes"  
    - "payload_indexes_memory_bytes"
    - "memtable_memory_bytes"
    - "wal_memory_bytes"
    
  system_level:
    - "total_memory_usage_bytes"
    - "available_memory_bytes"
    - "memory_pressure_ratio"
    - "swap_usage_bytes"
    - "page_fault_rate"
    
  performance_impact:
    - "memory_allocation_latency_p95"
    - "gc_pause_duration_p95"          # If using GC
    - "mmap_page_fault_rate"
    - "disk_io_wait_ratio"
```

### 2. Memory Alerting Thresholds
```yaml
memory_alerts:
  
  warning_level:
    memory_usage: "> 75%"
    allocation_rate: "> 1GB/min"
    page_fault_rate: "> 1000/sec"
    action: "log_warning"
    
  critical_level:
    memory_usage: "> 90%"  
    swap_usage: "> 10%"
    available_memory: "< 2GB"
    action: ["reject_writes", "trigger_compaction", "alert_ops"]
    
  emergency_level:
    memory_usage: "> 95%"
    oom_risk: "high"
    action: ["stop_accepting_connections", "emergency_flush", "page_ops"]
```

### 3. Adaptive Memory Management
```rust
struct AdaptiveMemoryController {
    current_pressure: f32,
    trend_direction: TrendDirection,
    last_action: Instant,
}

impl AdaptiveMemoryController {
    fn handle_memory_pressure(&mut self, pressure: f32) -> Vec<MemoryAction> {
        let mut actions = Vec::new();
        
        if pressure > 0.9 {
            // Emergency actions
            actions.push(MemoryAction::FlushAllMemtables);
            actions.push(MemoryAction::TriggerCompaction);
            actions.push(MemoryAction::EvictCaches);
        } else if pressure > 0.8 {
            // Preventive actions
            actions.push(MemoryAction::FlushOldestMemtable);
            actions.push(MemoryAction::CompactSmallSegments);
        } else if pressure > 0.7 {
            // Optimization actions
            actions.push(MemoryAction::OptimizeIndexes);
        }
        
        actions
    }
}
```

This memory profile provides comprehensive guidance for managing vector database memory efficiently across different scales — from startup-friendly single-node deployments to enterprise-scale distributed clusters handling billions of embeddings.