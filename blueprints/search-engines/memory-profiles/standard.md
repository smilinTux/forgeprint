# Standard Memory Profile for Search Engines

## Overview
This document provides comprehensive memory management guidelines for search engine implementations. Memory efficiency is critical for handling millions of documents while maintaining sub-second query response times and supporting concurrent indexing/search operations.

## Memory Architecture Principles

### 1. Memory Hierarchy and Data Locality
**Segment-based Architecture**: Organizes data for optimal memory access patterns
- **Hot data**: Recently accessed segments in OS page cache
- **Warm data**: Older segments accessed occasionally
- **Cold data**: Historical segments stored compressed on disk

### 2. Zero-Copy and Memory Mapping Philosophy
**Memory-mapped Files**: Leverage OS virtual memory for efficient data access
```rust
// Memory-mapped segment access
struct SegmentReader {
    // Memory-mapped inverted index
    terms_index: Mmap,          // FST for term dictionary
    postings_data: Mmap,        // Postings lists (doc IDs, frequencies, positions)
    
    // Memory-mapped column store
    doc_values: Mmap,           // Sorted field values for aggregations
    stored_fields: Mmap,        // Compressed _source documents
    
    // Memory-mapped point data
    points_index: Mmap,         // BKD tree for numeric/geo fields
    points_data: Mmap,          // Leaf data blocks
}
```

### 3. Cache-Conscious Data Structures
**Sequential Access Patterns**: Optimize for cache line usage (64 bytes)
```
Cache-Friendly Layout Example:

Postings list with delta-encoded doc IDs:
┌─────────────────────────────────────────────────────────────────┐
│ [100] [3] [4] [8] [5] [8] [72] [5] [2] [11] [45] [33] [7] [12]   │ ← 64 bytes
└─────────────────────────────────────────────────────────────────┘
   ↑                                                              ↑
   Single cache line fetch loads many consecutive document IDs
   
Bad Layout (random access):
   docID 100 → cache miss → load cache line A
   docID 103 → cache miss → load cache line B  
   docID 107 → cache miss → load cache line C
   
Good Layout (sequential scan):
   Start at base → load cache line A
   Process 16 docIDs from same cache line
```

---

## Core Memory Components

### 1. Segment Memory Management

#### 1.1 Inverted Index Memory
**FST Term Dictionary**: Compressed finite state transducer
```rust
struct FSTMemoryUsage {
    /// Raw term data storage
    bytes_per_term: f64,        // Average: 8-15 bytes per unique term
    /// FST compression ratio
    compression_ratio: f64,     // Typical: 0.3-0.7 vs raw trie
    /// Total memory formula
    estimated_mb: f64,          // unique_terms * bytes_per_term * compression_ratio
}

// Example calculation for 1M unique terms:
// Raw storage: 1M terms × 12 bytes average = 12 MB
// FST storage: 12 MB × 0.4 compression = 4.8 MB
```

**Postings Lists**: Delta-encoded document references
```rust
struct PostingsMemory {
    /// Base memory per posting
    bytes_per_posting: f64,     // 2-4 bytes (delta + VByte encoding)
    /// Position data overhead
    position_overhead: f64,     // +50% if positions stored for phrase queries
    /// Frequency overhead  
    frequency_overhead: f64,    // +25% for term frequency data
}

// Memory calculation:
// Base: total_term_occurrences × 3 bytes average
// With positions: × 1.5
// With frequencies: × 1.25
// 
// Example: 100M term occurrences
// Base: 100M × 3 = 300 MB
// Full features: 300 MB × 1.5 × 1.25 = 562 MB
```

#### 1.2 Doc Values (Column Store) Memory
**Sorted Numeric Fields**: Bit-packed with compression
```rust
struct DocValuesMemory {
    /// Documents in segment
    doc_count: u32,
    /// Bits per value after compression
    bits_per_value: u8,         // 1-64 bits depending on value range
    /// Additional overhead
    overhead_ratio: f64,        // 10-15% for metadata, dictionaries
}

impl DocValuesMemory {
    fn calculate_numeric_field(&self, field_name: &str) -> u64 {
        // Example: price field with values 0.99 to 999.99
        // Range: 99999 distinct values → 17 bits per value
        // Memory: doc_count × 17 bits / 8 + overhead
        
        let bytes_raw = (self.doc_count as u64 * self.bits_per_value as u64 + 7) / 8;
        let bytes_with_overhead = (bytes_raw as f64 * (1.0 + self.overhead_ratio)) as u64;
        bytes_with_overhead
    }
    
    fn calculate_keyword_field(&self, unique_values: u32, avg_value_length: f64) -> u64 {
        // Keyword fields use ordinal encoding:
        // Dictionary: unique_values × avg_value_length
        // Ordinals: doc_count × ceil(log2(unique_values)) bits
        
        let dictionary_bytes = unique_values as f64 * avg_value_length;
        let bits_per_ordinal = (unique_values as f64).log2().ceil() as u8;
        let ordinals_bytes = (self.doc_count as u64 * bits_per_ordinal as u64 + 7) / 8;
        
        (dictionary_bytes + ordinals_bytes as f64 * (1.0 + self.overhead_ratio)) as u64
    }
}
```

#### 1.3 Stored Fields Memory
**Compressed Source Documents**: Block-based compression
```rust
struct StoredFieldsMemory {
    /// Average document size in bytes
    avg_doc_size: f64,
    /// Compression ratio (LZ4/Snappy)
    compression_ratio: f64,     // Typical: 0.2-0.6 depending on content
    /// Block size for compression
    compression_block_size: u32, // Default: 16KB blocks
}

impl StoredFieldsMemory {
    fn estimate(&self, doc_count: u32) -> u64 {
        let raw_size = doc_count as f64 * self.avg_doc_size;
        let compressed_size = raw_size * self.compression_ratio;
        
        // Add block overhead (~5% for block headers and padding)
        (compressed_size * 1.05) as u64
    }
}

// Example calculation:
// 1M documents × 2KB average × 0.3 compression = 600 MB
// Block overhead: 600 MB × 1.05 = 630 MB
```

#### 1.4 Vector Index Memory (HNSW)
**Hierarchical Navigation Graph**: Memory-intensive for large vector dimensions
```rust
struct HNSWMemory {
    /// Number of vectors
    vector_count: u32,
    /// Vector dimensions
    dimensions: u32,
    /// HNSW parameters
    max_connections: u16,       // M parameter, default: 16
    levels: u8,                 // Log layers, typical: 4-6
    /// Bytes per vector component
    bytes_per_component: u8,    // 4 for float32, 2 for float16, 1 for int8
}

impl HNSWMemory {
    fn calculate(&self) -> u64 {
        // Vector data: vectors × dimensions × bytes_per_component
        let vector_data = self.vector_count as u64 * self.dimensions as u64 * self.bytes_per_component as u64;
        
        // Graph edges: ~vector_count × max_connections × 4 bytes per edge
        let graph_edges = self.vector_count as u64 * self.max_connections as u64 * 4;
        
        // Level assignments and metadata
        let metadata = self.vector_count as u64 * 8; // 8 bytes per vector
        
        vector_data + graph_edges + metadata
    }
}

// Example: 1M vectors × 768 dimensions (BERT embedding)
// Float32: 1M × 768 × 4 = 3.07 GB (vector data)
// Edges: 1M × 16 × 4 = 64 MB (graph structure)  
// Total: ~3.13 GB
//
// Float16 optimization: 1M × 768 × 2 = 1.54 GB (50% savings)
```

### 2. Query-Time Memory Caches

#### 2.1 Query Cache
**Filter Result Caching**: LRU cache for frequently used filters
```rust
struct QueryCache {
    /// Maximum memory allocation
    max_size_mb: u64,           // Default: 10% of heap or 1GB max
    /// Cache entry structure
    entries: LRUCache<QueryCacheKey, DocIdBitSet>,
    /// Eviction policy
    eviction_policy: EvictionPolicy,
}

struct QueryCacheKey {
    segment_id: SegmentId,
    query_hash: u64,            // Hash of query structure
    reader_context: u64,        // Invalidates on segment changes
}

struct DocIdBitSet {
    /// Compressed bitset (RoaringBitmap)
    bitset: RoaringBitmap,      // ~1 bit per document in segment
    /// Creation metadata
    creation_time: Instant,
    access_count: u32,
}

impl QueryCache {
    fn memory_per_cached_filter(&self, segment_doc_count: u32) -> usize {
        // RoaringBitmap compression: 
        // Dense (>12.5% set): ~1 bit per doc
        // Sparse: ~6 bytes per set bit
        // Very sparse: ~2 bytes per 16-doc run
        
        if segment_doc_count < 100_000 {
            segment_doc_count as usize / 8  // Simple bitset
        } else {
            // Assume 10% filter selectivity → roaring compression
            (segment_doc_count as f64 * 0.1 * 6.0) as usize
        }
    }
}
```

#### 2.2 Field Data Cache (Deprecated)
**Legacy Text Field Aggregations**: High memory risk
```rust
// NOTE: Modern search engines use doc values instead of field data cache
// This is kept for compatibility with older Elasticsearch APIs

struct FieldDataCache {
    /// Per-field memory tracking
    field_memory: HashMap<String, FieldMemoryTracker>,
    /// Circuit breaker threshold
    max_memory: u64,            // Default: 40% of heap
    /// Eviction on memory pressure
    eviction_policy: LRUEviction,
}

struct FieldMemoryTracker {
    /// Uninverted text field data
    terms_dictionary: Vec<String>,     // All unique terms
    term_ordinals: Vec<u32>,          // Per-doc ordinal arrays  
    memory_bytes: u64,
}

// Example memory explosion:
// Text field: "description" with high cardinality
// 1M docs × 50 unique terms per doc × 8 bytes per term = 400 MB
// For a single field! This is why doc values are mandatory.
```

#### 2.3 Request Cache
**Search Result Caching**: Cache complete search responses
```rust
struct RequestCache {
    /// Shard-level cache (independent per shard)
    shard_caches: HashMap<ShardId, ShardRequestCache>,
    /// Global memory limit
    max_memory_mb: u64,         // Default: 1% of heap
}

struct ShardRequestCache {
    /// LRU cache of request → response
    cache: LRUCache<RequestCacheKey, CachedResponse>,
    /// Invalidation tracking
    last_refresh_time: Instant,
}

struct RequestCacheKey {
    query_hash: u64,
    sort_hash: u64,
    aggregation_hash: u64,
    size: u32,
    from: u32,
    preference: String,         // Routing preference
}

struct CachedResponse {
    /// JSON response bytes
    response_bytes: Vec<u8>,
    /// Memory tracking
    estimated_size: usize,
    /// Cache metadata
    hit_count: u32,
    created_at: Instant,
}

impl RequestCache {
    fn should_cache(&self, request: &SearchRequest, response_size: usize) -> bool {
        // Cache eligibility criteria:
        request.size == 0 ||                    // Aggregation-only queries
        (request.size <= 100 && 
         response_size <= 1024 * 1024) ||      // Small result sets
        request.contains_expensive_aggs()       // Complex aggregations
    }
    
    fn memory_estimate(response: &SearchResponse) -> usize {
        // Conservative estimate: 2x serialized size for overhead
        response.to_json().len() * 2
    }
}
```

### 3. Indexing Memory Management

#### 3.1 Indexing Buffer
**In-Memory Segment Construction**: Controls flush frequency
```rust
struct IndexingBuffer {
    /// Maximum memory before flush
    max_buffer_size: u64,       // Default: 10% of heap
    /// Current buffer usage
    current_usage: u64,
    /// Per-field memory tracking
    field_buffers: HashMap<String, FieldBuffer>,
}

struct FieldBuffer {
    /// In-memory inverted index
    term_hash: HashMap<String, TermBuffer>,
    /// Memory estimation
    estimated_bytes: u64,
}

struct TermBuffer {
    /// Document list for this term
    doc_list: Vec<u32>,
    /// Frequency list
    freq_list: Vec<u32>, 
    /// Position lists (optional)
    position_lists: Vec<Vec<u32>>,
    /// Memory footprint
    memory_bytes: u64,
}

impl IndexingBuffer {
    fn add_document(&mut self, doc_id: u32, field: &str, tokens: &[Token]) -> Result<(), FlushRequired> {
        let field_buffer = self.field_buffers.entry(field.to_string()).or_default();
        
        for token in tokens {
            let term_buffer = field_buffer.term_hash.entry(token.text.clone()).or_default();
            term_buffer.add_occurrence(doc_id, token.position);
            
            // Update memory estimates
            term_buffer.update_memory_estimate();
        }
        
        field_buffer.estimated_bytes = field_buffer.term_hash.values()
            .map(|t| t.memory_bytes)
            .sum();
        
        self.current_usage = self.field_buffers.values()
            .map(|f| f.estimated_bytes)
            .sum();
        
        if self.current_usage > self.max_buffer_size {
            Err(FlushRequired)
        } else {
            Ok(())
        }
    }
    
    fn memory_pressure_ratio(&self) -> f64 {
        self.current_usage as f64 / self.max_buffer_size as f64
    }
}
```

#### 3.2 Merge Memory Impact
**Segment Merging**: Temporary memory spikes during merge operations
```rust
struct MergeMemoryManager {
    /// Concurrent merge limit
    max_concurrent_merges: u32,     // Default: max(1, CPU_cores / 2)
    /// Memory per merge
    merge_memory_budget: u64,       // ~2x largest segment size
    /// Current active merges
    active_merges: Vec<MergeOperation>,
}

struct MergeOperation {
    /// Segments being merged
    input_segments: Vec<SegmentId>,
    /// Estimated memory usage
    memory_usage: u64,
    /// I/O stats
    bytes_read: u64,
    bytes_written: u64,
    /// Progress tracking
    completion_ratio: f64,
}

impl MergeMemoryManager {
    fn estimate_merge_memory(&self, segments: &[SegmentInfo]) -> u64 {
        let total_size: u64 = segments.iter().map(|s| s.size_bytes).sum();
        
        // Memory components:
        // 1. Input segment readers (memory-mapped, minimal RAM)
        // 2. Output buffers for each data structure
        // 3. Temporary sort buffers for doc values
        
        let output_buffers = total_size / 4;        // 25% for output buffering
        let sort_buffers = total_size / 8;          // 12.5% for sorting
        let overhead = total_size / 16;             // 6.25% overhead
        
        output_buffers + sort_buffers + overhead
    }
    
    fn can_start_merge(&self, estimated_memory: u64) -> bool {
        let current_merge_memory: u64 = self.active_merges.iter()
            .map(|m| m.memory_usage)
            .sum();
        
        current_merge_memory + estimated_memory <= self.merge_memory_budget &&
        self.active_merges.len() < self.max_concurrent_merges as usize
    }
}
```

---

## OS Page Cache Integration

### 1. Memory-Mapped I/O Strategy
**Leverage OS Virtual Memory**: Let the kernel manage hot/cold data
```bash
# Optimal OS configuration for search engines
echo 'vm.swappiness = 1'              >> /etc/sysctl.conf  # Avoid swap
echo 'vm.dirty_ratio = 5'             >> /etc/sysctl.conf  # Fast writeback
echo 'vm.dirty_background_ratio = 2'  >> /etc/sysctl.conf  # Background writeback
echo 'vm.vfs_cache_pressure = 50'     >> /etc/sysctl.conf  # Balance cache pressure
```

```rust
struct PageCacheOptimization {
    /// Memory mapping strategy
    mmap_strategy: MmapStrategy,
    /// Read-ahead configuration
    readahead: ReadAheadPolicy,
    /// Memory locking for hot data
    mlock_policy: MemoryLockPolicy,
}

enum MmapStrategy {
    /// Map entire segment (good for small segments)
    FullMapping,
    /// Map on demand (good for large segments)
    OnDemandMapping { window_size: usize },
    /// Hybrid approach based on segment size
    Adaptive { threshold_mb: u64 },
}

impl PageCacheOptimization {
    fn configure_segment_mapping(&self, segment: &SegmentInfo) -> MmapConfig {
        match self.mmap_strategy {
            MmapStrategy::Adaptive { threshold_mb } => {
                if segment.size_bytes < threshold_mb * 1024 * 1024 {
                    MmapConfig {
                        mode: MmapMode::FullMapping,
                        advice: MemoryAdvice::WillNeed,  // Hint: likely to access
                        lock_in_memory: segment.is_hot(),
                    }
                } else {
                    MmapConfig {
                        mode: MmapMode::OnDemand,
                        advice: MemoryAdvice::Random,    // No predictable pattern
                        lock_in_memory: false,
                    }
                }
            }
        }
    }
}
```

### 2. Cache Warming Strategy
**Preload Critical Data**: Warm up frequently accessed segments
```rust
struct CacheWarming {
    /// Warming policy
    warming_policy: WarmingPolicy,
    /// Background warming thread pool
    warming_executor: ThreadPool,
}

enum WarmingPolicy {
    /// Warm on index open
    EagerWarming { 
        warm_segments: usize,       // Top N most recent segments
        warm_fields: Vec<String>,   // Critical fields only
    },
    /// Warm on first access  
    LazyWarming,
    /// Query-driven warming
    AdaptiveWarming {
        access_threshold: u32,      // Access count before warming
        time_window: Duration,      // Reset access counts periodically
    },
}

impl CacheWarming {
    fn warm_segment(&self, segment: &SegmentReader, fields: &[String]) {
        self.warming_executor.spawn(move || {
            for field in fields {
                // Warm inverted index
                if let Some(terms_dict) = segment.terms_dict(field) {
                    self.warm_terms_dictionary(terms_dict);
                }
                
                // Warm doc values
                if let Some(doc_values) = segment.doc_values(field) {
                    self.warm_doc_values(doc_values);
                }
                
                // Warm BKD tree for numeric fields
                if segment.has_points(field) {
                    self.warm_points_index(segment.points_reader(field));
                }
            }
        });
    }
    
    fn warm_terms_dictionary(&self, terms: &TermsDictionary) {
        // Sequential read through FST structure
        let mut buffer = vec![0u8; 64 * 1024]; // 64KB buffer
        let _ = terms.read_sequential(&mut buffer);
    }
}
```

---

## Memory Monitoring and Alerting

### 1. Circuit Breakers
**Prevent OOM Conditions**: Fail fast when memory pressure builds
```rust
struct CircuitBreakerSystem {
    breakers: HashMap<String, CircuitBreaker>,
}

struct CircuitBreaker {
    name: String,
    threshold_bytes: u64,
    current_usage: AtomicU64,
    trips: AtomicU32,
    state: AtomicU8,            // 0=Closed, 1=Open, 2=Half-Open
}

impl CircuitBreaker {
    /// Check if operation should be allowed
    fn check_and_reserve(&self, estimated_bytes: u64) -> Result<BreakerGuard, CircuitBreakerError> {
        let current = self.current_usage.load(Ordering::Relaxed);
        let after_operation = current + estimated_bytes;
        
        if after_operation > self.threshold_bytes {
            self.trips.fetch_add(1, Ordering::Relaxed);
            self.state.store(1, Ordering::Relaxed); // Open circuit
            
            Err(CircuitBreakerError::MemoryLimitExceeded {
                operation_memory: estimated_bytes,
                current_memory: current,
                limit: self.threshold_bytes,
            })
        } else {
            // Reserve memory
            self.current_usage.store(after_operation, Ordering::Relaxed);
            Ok(BreakerGuard { breaker: self, reserved: estimated_bytes })
        }
    }
}

// Standard circuit breaker configuration
struct StandardBreakerConfig {
    /// Total memory available to search engine
    total_memory_gb: u64,
    
    /// Breaker thresholds
    indexing_threshold: f64,        // 10% - indexing buffer + merge memory
    fielddata_threshold: f64,       // 40% - legacy fielddata cache (dangerous)
    request_threshold: f64,         // 60% - query execution memory
    parent_threshold: f64,          // 70% - combined limit across all breakers
}
```

### 2. Memory Profiling and Metrics
**Runtime Memory Tracking**: Monitor allocation patterns and hotspots
```rust
struct MemoryProfiler {
    /// Per-component memory tracking
    component_usage: HashMap<MemoryComponent, MemoryUsage>,
    /// Historical data for trend analysis
    usage_history: VecDeque<MemorySnapshot>,
    /// Sampling configuration
    sampling_config: SamplingConfig,
}

enum MemoryComponent {
    SegmentData { segment_id: SegmentId },
    QueryCache,
    RequestCache,
    IndexingBuffer,
    MergeOperations,
    VectorIndex { index_name: String },
}

struct MemoryUsage {
    allocated_bytes: u64,
    peak_bytes: u64,
    allocations_count: u64,
    deallocations_count: u64,
    last_updated: Instant,
}

impl MemoryProfiler {
    fn record_allocation(&mut self, component: MemoryComponent, bytes: u64) {
        let usage = self.component_usage.entry(component).or_default();
        usage.allocated_bytes += bytes;
        usage.allocations_count += 1;
        usage.peak_bytes = usage.peak_bytes.max(usage.allocated_bytes);
        usage.last_updated = Instant::now();
        
        // Sample for historical tracking
        if self.should_sample() {
            self.take_snapshot();
        }
    }
    
    fn generate_report(&self) -> MemoryReport {
        let total_usage: u64 = self.component_usage.values()
            .map(|u| u.allocated_bytes)
            .sum();
        
        let top_consumers: Vec<_> = self.component_usage.iter()
            .map(|(comp, usage)| (comp.clone(), usage.allocated_bytes))
            .collect();
        
        MemoryReport {
            total_allocated: total_usage,
            component_breakdown: top_consumers,
            growth_trend: self.calculate_growth_trend(),
            recommendations: self.generate_recommendations(),
        }
    }
}
```

---

## Memory Optimization Guidelines

### 1. Segment Size Optimization
**Target Segment Sizes**: Balance between memory efficiency and merge overhead

| Use Case | Target Size | Reasoning |
|----------|------------|-----------|
| **High-frequency updates** | 100-500 MB | Faster merges, more responsive to deletes |
| **Stable datasets** | 1-5 GB | Better compression, fewer segments to search |
| **Archive data** | 5-20 GB | Maximum compression, minimal merge activity |
| **Vector-heavy indices** | 200 MB - 2 GB | Balance vector memory with search performance |

### 2. Field Type Selection
**Choose appropriate field types** to minimize memory overhead:

```yaml
# Good: Efficient field mapping
mappings:
  properties:
    id:
      type: keyword
      index: false          # Don't index if only used for retrieval
      doc_values: false     # Don't store doc values if not aggregating
      
    title:
      type: text
      analyzer: standard
      fields:
        raw:
          type: keyword
          ignore_above: 256   # Prevent extremely long strings
          
    price:
      type: scaled_float      # More memory-efficient than float
      scaling_factor: 100     # Store as integer pennies
      
    timestamp:
      type: date
      format: epoch_millis    # Most compact date format
      
    tags:
      type: keyword
      # Automatically builds doc values for aggregations
```

### 3. Index Settings Optimization
**Configure settings** for memory-conscious operation:

```json
{
  "settings": {
    "refresh_interval": "30s",              // Reduce refresh frequency
    "number_of_shards": 1,                  // Avoid over-sharding
    "number_of_replicas": 1,                // Balance availability vs memory
    "codec": "best_compression",            // Trade CPU for memory/disk
    
    "merge.policy.max_merged_segment": "5gb",
    "merge.policy.segments_per_tier": 4,    // Fewer segments = less memory
    
    "translog.durability": "async",         // Reduce fsync frequency
    "translog.sync_interval": "30s",
    
    "indexing_pressure.memory.limit": "10%"
  }
}
```

### 4. Query Optimization for Memory
**Write memory-conscious queries**:

```json
{
  "query": {
    "bool": {
      "filter": [
        {"term": {"status": "active"}},     // Use filter context (cacheable)
        {"range": {"timestamp": {"gte": "now-7d"}}}
      ],
      "must": {
        "match": {"title": "search query"}  // Scoring only where needed
      }
    }
  },
  "size": 20,                               // Reasonable page size
  "_source": ["title", "url"],              // Fetch only needed fields
  "aggregations": {
    "categories": {
      "terms": {
        "field": "category.keyword",
        "size": 10,                         // Limit aggregation buckets
        "shard_size": 25                    // Control shard-level precision
      }
    }
  }
}
```

---

## Memory Profile Summary

### Standard Configuration (16 GB RAM)
```
Total System Memory: 16 GB
├── OS + Other Processes: 4 GB (25%)
└── Search Engine: 12 GB (75%)
    ├── JVM Heap: 6 GB (50% of available)
    │   ├── Indexing Buffer: 600 MB (10%)
    │   ├── Query Cache: 600 MB (10%)
    │   ├── Request Cache: 60 MB (1%)
    │   ├── Field Data Cache: 2.4 GB (40%)
    │   └── Application: 2.34 GB (remaining)
    └── Off-Heap: 6 GB (50% of available)
        ├── OS Page Cache: 4.8 GB (80% - for segments)
        ├── Direct Memory: 600 MB (10% - for vectors)
        └── OS Overhead: 600 MB (10%)
```

### Memory Pressure Thresholds
- **Green**: < 70% memory usage
- **Yellow**: 70-85% memory usage → Enable aggressive caching eviction
- **Red**: > 85% memory usage → Reject new indexing, enable circuit breakers
- **Critical**: > 95% memory usage → Emergency segment merging, query throttling

This memory profile ensures optimal performance while preventing out-of-memory conditions in production search engine deployments.