# Vector Database Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing a production-grade vector database (Qdrant/SKVector-style). It covers HNSW graph construction, segment management, WAL mechanics, quantization strategies, distributed consensus, shard routing, and performance optimization — everything needed to build a system that handles billions of embeddings with sub-10ms query latency.

## Architectural Foundations

### 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       API Layer                              │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│  │  REST/HTTP │  │   gRPC    │  │   Auth   │  │  Router  │ │
│  └───────────┘  └───────────┘  └──────────┘  └──────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Query Engine                              │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Planner  │  │  Executor │  │  Merger  │  │ Prefetch │ │
│  └───────────┘  └───────────┘  └──────────┘  └──────────┘ │
├─────────────────────────────────────────────────────────────┤
│                  Collection Manager                          │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Segments  │  │ Optimizer │  │   WAL    │  │ Payload  │ │
│  └───────────┘  └───────────┘  └──────────┘  └──────────┘ │
├─────────────────────────────────────────────────────────────┤
│                   Storage Engine                             │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Vectors  │  │   HNSW    │  │  mmap    │  │  Files   │ │
│  └───────────┘  └───────────┘  └──────────┘  └──────────┘ │
├─────────────────────────────────────────────────────────────┤
│                  Cluster Layer (Optional)                     │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│  │   Raft    │  │  Shards   │  │ Replicas │  │   P2P    │ │
│  └───────────┘  └───────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2. HNSW Graph Construction

#### Theoretical Foundation
HNSW (Hierarchical Navigable Small World) is a multi-layer proximity graph inspired by skip lists. Each layer is a navigable small-world graph where:
- **Top layers**: Sparse, with long-range connections for fast global navigation
- **Bottom layers**: Dense, with short-range connections for precise local search
- **Layer 0**: Contains all points; upper layers contain exponentially fewer points

#### Layer Assignment
```rust
impl HnswIndex {
    /// Assign a random layer for a new point using exponential distribution
    fn random_layer(&self) -> usize {
        let ml = 1.0 / (self.config.m as f64).ln();
        let random: f64 = rand::random();
        (-random.ln() * ml).floor() as usize
    }
}
```

The probability of a point existing on layer L is: P(L) = e^(-L/mL) where mL = 1/ln(M).
For M=16: ~6.25% of points on layer 1, ~0.39% on layer 2, ~0.024% on layer 3.

#### Insert Algorithm
```rust
impl HnswIndex {
    fn insert(&mut self, point_id: PointOffsetId, vector: &[f32]) -> Result<(), HnswError> {
        let target_layer = self.random_layer();
        
        // Ensure layers exist up to target_layer
        while self.layers.len() <= target_layer {
            self.layers.push(Layer::new());
        }
        
        // Phase 1: Greedy descent from top layer to target_layer + 1
        // Find the closest point to use as entry for lower layers
        let mut current_entry = self.entry_point;
        
        for layer_idx in (target_layer + 1..self.layers.len()).rev() {
            current_entry = self.greedy_search_layer(
                vector,
                current_entry,
                layer_idx,
                1,  // ef = 1 for greedy descent
            )[0];
        }
        
        // Phase 2: Insert into layers target_layer down to 0
        // At each layer, find ef_construction nearest neighbors, then select M best
        for layer_idx in (0..=target_layer.min(self.layers.len() - 1)).rev() {
            let ef = self.config.ef_construction;
            
            // Search for nearest neighbors at this layer
            let candidates = self.greedy_search_layer(
                vector,
                current_entry,
                layer_idx,
                ef,
            );
            
            // Select M best neighbors using heuristic
            let neighbors = self.select_neighbors_heuristic(
                vector,
                &candidates,
                self.config.m,
                layer_idx,
            );
            
            // Add bidirectional edges
            self.layers[layer_idx].add_point(point_id);
            for &neighbor_id in &neighbors {
                self.layers[layer_idx].connect(point_id, neighbor_id);
                self.layers[layer_idx].connect(neighbor_id, point_id);
                
                // Prune neighbor's connections if over M limit
                let neighbor_links = self.layers[layer_idx].get_links(neighbor_id);
                if neighbor_links.len() > self.max_connections(layer_idx) {
                    let pruned = self.select_neighbors_heuristic(
                        &self.get_vector(neighbor_id),
                        &neighbor_links,
                        self.max_connections(layer_idx),
                        layer_idx,
                    );
                    self.layers[layer_idx].set_links(neighbor_id, pruned);
                }
            }
            
            // Use first result as entry for next layer
            if !candidates.is_empty() {
                current_entry = candidates[0];
            }
        }
        
        // Update entry point if new point is on highest layer
        if target_layer >= self.layers.len() - 1 {
            self.entry_point = point_id;
        }
        
        self.num_points += 1;
        Ok(())
    }
    
    /// Max connections per node: M for layer 0 (often 2*M), M for higher layers
    fn max_connections(&self, layer: usize) -> usize {
        if layer == 0 {
            self.config.m * 2  // Layer 0 gets double connections
        } else {
            self.config.m
        }
    }
}
```

#### Neighbor Selection Heuristic
```rust
impl HnswIndex {
    /// Select neighbors using the heuristic from the HNSW paper
    /// Prefers diverse neighbors (different directions) over closest ones
    fn select_neighbors_heuristic(
        &self,
        query: &[f32],
        candidates: &[PointOffsetId],
        m: usize,
        _layer: usize,
    ) -> Vec<PointOffsetId> {
        if candidates.len() <= m {
            return candidates.to_vec();
        }
        
        // Sort candidates by distance to query
        let mut sorted: Vec<(PointOffsetId, f32)> = candidates.iter()
            .map(|&id| (id, self.distance(query, &self.get_vector(id))))
            .collect();
        sorted.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        
        let mut selected = Vec::with_capacity(m);
        
        for (candidate_id, candidate_dist) in sorted {
            if selected.len() >= m {
                break;
            }
            
            // Check if candidate is closer to query than to any already-selected neighbor
            // This heuristic promotes diversity in neighbor directions
            let is_good = selected.iter().all(|&(sel_id, _)| {
                let dist_to_selected = self.distance(
                    &self.get_vector(candidate_id),
                    &self.get_vector(sel_id),
                );
                candidate_dist <= dist_to_selected
            });
            
            // Always add closest; use heuristic for rest
            if selected.is_empty() || is_good {
                selected.push((candidate_id, candidate_dist));
            }
        }
        
        selected.into_iter().map(|(id, _)| id).collect()
    }
}
```

#### Search Algorithm
```rust
impl HnswIndex {
    fn search(
        &self,
        query: &[f32],
        top_k: usize,
        ef: usize,
        filter: Option<&Filter>,
    ) -> Vec<ScoredPoint> {
        if self.num_points == 0 {
            return vec![];
        }
        
        let effective_ef = ef.max(top_k);
        let mut current_entry = self.entry_point;
        
        // Phase 1: Greedy descent through upper layers (ef=1)
        for layer_idx in (1..self.layers.len()).rev() {
            current_entry = self.greedy_search_layer(
                query,
                current_entry,
                layer_idx,
                1,
            )[0];
        }
        
        // Phase 2: Search at layer 0 with full ef
        let candidates = self.search_layer_with_filter(
            query,
            current_entry,
            0,
            effective_ef,
            filter,
        );
        
        // Return top-k from candidates
        candidates.into_iter()
            .take(top_k)
            .map(|(id, dist)| ScoredPoint { id, score: dist })
            .collect()
    }
    
    /// Priority-queue-based greedy search at a single layer
    fn search_layer_with_filter(
        &self,
        query: &[f32],
        entry: PointOffsetId,
        layer: usize,
        ef: usize,
        filter: Option<&Filter>,
    ) -> Vec<(PointOffsetId, f32)> {
        let mut visited = HashSet::new();
        let mut candidates = BinaryHeap::new();  // min-heap by distance
        let mut results = BinaryHeap::new();      // max-heap (worst result on top)
        
        let entry_dist = self.distance(query, &self.get_vector(entry));
        candidates.push(Reverse(OrderedFloat(entry_dist), entry));
        
        if self.passes_filter(entry, filter) {
            results.push((OrderedFloat(entry_dist), entry));
        }
        visited.insert(entry);
        
        while let Some(Reverse(OrderedFloat(candidate_dist), candidate_id)) = candidates.pop() {
            // If candidate is farther than worst result, stop
            let worst_result_dist = results.peek()
                .map(|(d, _)| d.0)
                .unwrap_or(f32::INFINITY);
            
            if candidate_dist > worst_result_dist && results.len() >= ef {
                break;
            }
            
            // Explore candidate's neighbors
            for &neighbor_id in self.layers[layer].get_links(candidate_id) {
                if visited.contains(&neighbor_id) {
                    continue;
                }
                visited.insert(neighbor_id);
                
                let neighbor_dist = self.distance(query, &self.get_vector(neighbor_id));
                
                let should_add = results.len() < ef
                    || neighbor_dist < results.peek().unwrap().0 .0;
                
                if should_add {
                    candidates.push(Reverse(OrderedFloat(neighbor_dist), neighbor_id));
                    
                    if self.passes_filter(neighbor_id, filter) {
                        results.push((OrderedFloat(neighbor_dist), neighbor_id));
                        if results.len() > ef {
                            results.pop(); // remove worst
                        }
                    }
                }
            }
        }
        
        // Sort results by distance (ascending)
        let mut result_vec: Vec<_> = results.into_iter()
            .map(|(d, id)| (id, d.0))
            .collect();
        result_vec.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        result_vec
    }
}
```

#### HNSW Graph Serialization
```rust
/// On-disk format for HNSW graph
/// Header: [magic:4][version:4][num_points:8][num_layers:4][m:4][entry_point:8]
/// Per layer: [num_nodes:8][offset_table:8*num_nodes][links_data:variable]
/// Links data per node: [num_links:2][link_ids:4*num_links]
struct HnswGraphFile {
    header: HnswHeader,
    layers: Vec<LayerFile>,
}

impl HnswIndex {
    fn serialize_to_file(&self, path: &Path) -> Result<(), IoError> {
        let mut writer = BufWriter::new(File::create(path)?);
        
        // Write header
        writer.write_all(b"HNSW")?;
        writer.write_all(&1u32.to_le_bytes())?; // version
        writer.write_all(&(self.num_points as u64).to_le_bytes())?;
        writer.write_all(&(self.layers.len() as u32).to_le_bytes())?;
        writer.write_all(&self.config.m.to_le_bytes())?;
        writer.write_all(&(self.entry_point as u64).to_le_bytes())?;
        
        // Write each layer
        for layer in &self.layers {
            self.serialize_layer(&mut writer, layer)?;
        }
        
        Ok(())
    }
    
    fn deserialize_from_file(path: &Path) -> Result<Self, IoError> {
        // Memory-map for zero-copy access to graph structure
        let mmap = unsafe { MmapOptions::new().map(&File::open(path)?)? };
        // Parse header, build layer structures pointing into mmap
        // ...
    }
}
```

### 3. Segment Management

#### Segment Architecture
```rust
/// A collection's data is organized into segments:
/// - One mutable segment (memtable) for incoming writes
/// - Multiple immutable segments (flushed, potentially indexed)
struct SegmentHolder {
    /// Active mutable segment receiving writes
    mutable_segment: RwLock<MutableSegment>,
    
    /// Immutable segments (plain or indexed)
    immutable_segments: RwLock<HashMap<SegmentId, Arc<dyn Segment>>>,
    
    /// Segments currently being optimized (built into indexed segments)
    optimizing_segments: RwLock<HashSet<SegmentId>>,
}

trait Segment: Send + Sync {
    fn search(&self, query: &[f32], filter: Option<&Filter>, top_k: usize, ef: usize)
        -> Vec<ScoredPoint>;
    fn upsert(&self, point: &PointStruct) -> Result<(), SegmentError>;
    fn delete(&self, point_id: PointId) -> Result<bool, SegmentError>;
    fn get_point(&self, point_id: PointId) -> Option<PointStruct>;
    fn point_count(&self) -> usize;
    fn deleted_count(&self) -> usize;
    fn memory_usage(&self) -> SegmentMemoryStats;
    fn segment_type(&self) -> SegmentType;
    fn flush(&self) -> Result<(), SegmentError>;
}

enum SegmentType {
    Mutable,       // In-memory, linear scan, receives writes
    PlainImmutable, // Flushed to disk, no HNSW index yet
    IndexedImmutable, // Has HNSW index, optimized for search
}
```

#### Mutable Segment (Memtable)
```rust
struct MutableSegment {
    id: SegmentId,
    vectors: Vec<Vec<f32>>,              // append-only vector storage
    payloads: Vec<HashMap<String, Value>>, // payload per point
    id_map: HashMap<PointId, PointOffsetId>, // external ID → internal offset
    deleted: BitVec,                      // tombstone bitset
    version_map: HashMap<PointId, u64>,   // per-point version tracking
    point_count: usize,
    dimension: usize,
}

impl Segment for MutableSegment {
    fn search(&self, query: &[f32], filter: Option<&Filter>, top_k: usize, _ef: usize)
        -> Vec<ScoredPoint> {
        // Linear brute-force scan (no HNSW in mutable segment)
        let mut results: BinaryHeap<Reverse<ScoredPoint>> = BinaryHeap::new();
        
        for offset in 0..self.vectors.len() {
            if self.deleted[offset] {
                continue;
            }
            
            if let Some(filter) = filter {
                if !self.check_payload_filter(offset, filter) {
                    continue;
                }
            }
            
            let distance = compute_distance(query, &self.vectors[offset]);
            
            if results.len() < top_k {
                results.push(Reverse(ScoredPoint { 
                    id: self.offset_to_id(offset), 
                    score: distance 
                }));
            } else if distance < results.peek().unwrap().0.score {
                results.pop();
                results.push(Reverse(ScoredPoint { 
                    id: self.offset_to_id(offset), 
                    score: distance 
                }));
            }
        }
        
        results.into_sorted_vec().into_iter().map(|r| r.0).collect()
    }
    
    fn upsert(&self, point: &PointStruct) -> Result<(), SegmentError> {
        // Check for existing point (update case)
        if let Some(&existing_offset) = self.id_map.get(&point.id) {
            self.deleted.set(existing_offset, true); // mark old version deleted
        }
        
        let offset = self.vectors.len();
        self.vectors.push(point.vector.clone());
        self.payloads.push(point.payload.clone());
        self.id_map.insert(point.id, offset);
        self.deleted.push(false);
        self.point_count += 1;
        
        Ok(())
    }
}
```

#### Segment Flush Process
```rust
struct SegmentFlusher {
    config: FlushConfig,
}

struct FlushConfig {
    flush_threshold_points: usize,   // Flush when memtable exceeds this
    flush_threshold_bytes: usize,    // Or when memory exceeds this
    flush_interval: Duration,        // Or after this time period
}

impl SegmentFlusher {
    fn should_flush(&self, mutable_segment: &MutableSegment) -> bool {
        mutable_segment.point_count >= self.config.flush_threshold_points
            || mutable_segment.memory_usage() >= self.config.flush_threshold_bytes
    }
    
    /// Flush memtable to immutable plain segment on disk
    fn flush_to_disk(&self, 
                     segment: &MutableSegment,
                     storage_path: &Path) -> Result<PlainSegment, FlushError> {
        let segment_id = SegmentId::new();
        let segment_path = storage_path.join(format!("segment_{}", segment_id));
        fs::create_dir_all(&segment_path)?;
        
        // Write vectors to binary file
        let vector_file = segment_path.join("vectors.bin");
        let mut writer = BufWriter::new(File::create(&vector_file)?);
        for (offset, vector) in segment.vectors.iter().enumerate() {
            if !segment.deleted[offset] {
                for &val in vector {
                    writer.write_all(&val.to_le_bytes())?;
                }
            }
        }
        writer.flush()?;
        
        // Write payload index
        let payload_file = segment_path.join("payload.cbor");
        self.write_payload_index(&payload_file, segment)?;
        
        // Write ID mapping
        let id_file = segment_path.join("id_tracker.bin");
        self.write_id_tracker(&id_file, segment)?;
        
        // Write deleted bitset
        let deleted_file = segment_path.join("deleted.bin");
        self.write_deleted_bitset(&deleted_file, segment)?;
        
        Ok(PlainSegment::open(segment_path)?)
    }
}
```

#### Segment Optimizer
```rust
struct SegmentOptimizer {
    config: OptimizerConfig,
    thread_pool: ThreadPool,
}

struct OptimizerConfig {
    indexing_threshold: usize,       // Build HNSW after this many points
    max_segment_size: usize,         // Merge target size
    memmap_threshold: usize,         // Switch to mmap above this size
    max_optimization_threads: usize,
    flush_interval: Duration,
}

impl SegmentOptimizer {
    /// Main optimization loop — runs in background
    fn optimization_loop(&self, segment_holder: Arc<SegmentHolder>) {
        loop {
            // Check if any plain segments need HNSW indexing
            let segments_to_index = self.find_segments_needing_index(&segment_holder);
            for segment_id in segments_to_index {
                self.build_hnsw_index(segment_id, &segment_holder);
            }
            
            // Check if small segments should be merged
            let merge_candidates = self.find_merge_candidates(&segment_holder);
            if let Some((seg_a, seg_b)) = merge_candidates {
                self.merge_segments(seg_a, seg_b, &segment_holder);
            }
            
            // Check if mutable segment needs flushing
            if self.should_flush(&segment_holder) {
                self.flush_mutable_segment(&segment_holder);
            }
            
            thread::sleep(self.config.flush_interval);
        }
    }
    
    /// Build HNSW index for a plain segment → produce indexed segment
    fn build_hnsw_index(
        &self,
        segment_id: SegmentId,
        holder: &SegmentHolder,
    ) -> Result<(), OptimizerError> {
        // Mark segment as being optimized (prevent concurrent optimization)
        holder.optimizing_segments.write().insert(segment_id);
        
        // Read vectors from plain segment
        let segment = holder.immutable_segments.read().get(&segment_id).cloned()
            .ok_or(OptimizerError::SegmentNotFound)?;
        
        // Build HNSW index (CPU-intensive, runs on thread pool)
        let hnsw_config = self.get_hnsw_config();
        let mut hnsw = HnswIndex::new(hnsw_config);
        
        let vectors = segment.all_vectors();
        for (offset, vector) in vectors.iter().enumerate() {
            hnsw.insert(offset as PointOffsetId, vector)?;
        }
        
        // Create indexed segment with HNSW
        let indexed_segment = IndexedSegment {
            id: segment_id,
            vector_storage: segment.vector_storage().clone(),
            hnsw_index: hnsw,
            payload_index: segment.payload_index().clone(),
            id_tracker: segment.id_tracker().clone(),
            deleted_bitset: segment.deleted_bitset().clone(),
        };
        
        // Atomic swap: replace plain segment with indexed segment
        {
            let mut segments = holder.immutable_segments.write();
            segments.insert(segment_id, Arc::new(indexed_segment));
        }
        
        holder.optimizing_segments.write().remove(&segment_id);
        Ok(())
    }
    
    /// Merge two small segments into one, cleaning tombstones
    fn merge_segments(
        &self,
        seg_a: SegmentId,
        seg_b: SegmentId,
        holder: &SegmentHolder,
    ) -> Result<SegmentId, OptimizerError> {
        let segments = holder.immutable_segments.read();
        let a = segments.get(&seg_a).ok_or(OptimizerError::SegmentNotFound)?;
        let b = segments.get(&seg_b).ok_or(OptimizerError::SegmentNotFound)?;
        
        // Create new merged segment, skipping deleted points
        let mut merged_vectors = Vec::new();
        let mut merged_payloads = Vec::new();
        let mut merged_ids = HashMap::new();
        
        for segment in [a, b] {
            for (point_id, vector, payload) in segment.live_points() {
                let offset = merged_vectors.len();
                merged_vectors.push(vector);
                merged_payloads.push(payload);
                merged_ids.insert(point_id, offset as PointOffsetId);
            }
        }
        
        // Build new indexed segment with HNSW
        let new_segment_id = SegmentId::new();
        let mut hnsw = HnswIndex::new(self.get_hnsw_config());
        for (offset, vector) in merged_vectors.iter().enumerate() {
            hnsw.insert(offset as PointOffsetId, vector)?;
        }
        
        let new_segment = Arc::new(IndexedSegment::new(
            new_segment_id,
            merged_vectors,
            merged_payloads,
            merged_ids,
            hnsw,
        ));
        
        // Atomic swap: add new segment, remove old ones
        drop(segments); // release read lock
        let mut segments = holder.immutable_segments.write();
        segments.insert(new_segment_id, new_segment);
        segments.remove(&seg_a);
        segments.remove(&seg_b);
        
        Ok(new_segment_id)
    }
}
```

### 4. Write-Ahead Log (WAL)

#### WAL Architecture
```rust
struct Wal {
    /// Current WAL segment being written to
    current_segment: WalSegment,
    /// Completed segments awaiting cleanup
    completed_segments: VecDeque<WalSegment>,
    /// Configuration
    config: WalConfig,
    /// Last version that has been flushed to segments
    last_flushed_version: u64,
    /// Current monotonic version counter
    current_version: u64,
    /// Directory for WAL files
    wal_dir: PathBuf,
}

struct WalConfig {
    segment_size: usize,        // Max bytes per WAL file (default: 32MB)
    flush_interval: Duration,   // How often to fsync (default: 1s)
    retention_count: u32,       // Completed segments to retain
}

struct WalSegment {
    file: File,
    path: PathBuf,
    first_version: u64,
    last_version: u64,
    bytes_written: usize,
}

/// WAL record format: [length:4][version:8][op_type:1][data:variable][crc32:4]
#[derive(Serialize, Deserialize)]
enum WalRecord {
    Upsert {
        version: u64,
        collection: String,
        points: Vec<PointStruct>,
    },
    Delete {
        version: u64,
        collection: String,
        point_ids: Vec<PointId>,
    },
    DeleteByFilter {
        version: u64,
        collection: String,
        filter: Filter,
    },
    SetPayload {
        version: u64,
        collection: String,
        point_id: PointId,
        payload: HashMap<String, Value>,
    },
}

impl Wal {
    fn append(&mut self, record: WalRecord) -> Result<u64, WalError> {
        let version = self.current_version + 1;
        
        // Serialize record
        let data = bincode::serialize(&record)?;
        let crc = crc32fast::hash(&data);
        
        // Write to current segment: [len][data][crc]
        let len = data.len() as u32;
        self.current_segment.file.write_all(&len.to_le_bytes())?;
        self.current_segment.file.write_all(&data)?;
        self.current_segment.file.write_all(&crc.to_le_bytes())?;
        
        self.current_segment.last_version = version;
        self.current_segment.bytes_written += 4 + data.len() + 4;
        self.current_version = version;
        
        // Rotate segment if full
        if self.current_segment.bytes_written >= self.config.segment_size {
            self.rotate_segment()?;
        }
        
        Ok(version)
    }
    
    fn rotate_segment(&mut self) -> Result<(), WalError> {
        // Fsync current segment
        self.current_segment.file.sync_all()?;
        
        // Move to completed
        let old_segment = std::mem::replace(
            &mut self.current_segment,
            WalSegment::create_new(&self.wal_dir, self.current_version + 1)?,
        );
        self.completed_segments.push_back(old_segment);
        
        Ok(())
    }
    
    /// Compact: remove segments whose data has been flushed to storage
    fn compact(&mut self) -> Result<usize, WalError> {
        let mut removed = 0;
        while let Some(segment) = self.completed_segments.front() {
            if segment.last_version <= self.last_flushed_version {
                let segment = self.completed_segments.pop_front().unwrap();
                fs::remove_file(&segment.path)?;
                removed += 1;
            } else {
                break;
            }
        }
        Ok(removed)
    }
    
    /// Replay WAL for crash recovery
    fn replay(&self, start_version: u64) -> Result<Vec<WalRecord>, WalError> {
        let mut records = Vec::new();
        
        // Find first segment containing start_version
        let all_segments = self.completed_segments.iter()
            .chain(std::iter::once(&self.current_segment));
        
        for segment in all_segments {
            if segment.last_version < start_version {
                continue;
            }
            
            let mut reader = BufReader::new(File::open(&segment.path)?);
            
            loop {
                // Read record: [len:4][data:len][crc:4]
                let mut len_buf = [0u8; 4];
                if reader.read_exact(&mut len_buf).is_err() {
                    break; // EOF
                }
                let len = u32::from_le_bytes(len_buf) as usize;
                
                let mut data = vec![0u8; len];
                reader.read_exact(&mut data)?;
                
                let mut crc_buf = [0u8; 4];
                reader.read_exact(&mut crc_buf)?;
                let expected_crc = u32::from_le_bytes(crc_buf);
                
                // Verify CRC
                let actual_crc = crc32fast::hash(&data);
                if actual_crc != expected_crc {
                    return Err(WalError::CorruptRecord);
                }
                
                let record: WalRecord = bincode::deserialize(&data)?;
                if record.version() >= start_version {
                    records.push(record);
                }
            }
        }
        
        Ok(records)
    }
}
```

### 5. Quantization Strategies

#### Scalar Quantization (SQ8)
```rust
struct ScalarQuantizer {
    /// Per-dimension min values (learned from data)
    mins: Vec<f32>,
    /// Per-dimension max values
    maxs: Vec<f32>,
    /// Pre-computed scale factors: 255.0 / (max - min)
    scales: Vec<f32>,
    dimension: usize,
}

impl ScalarQuantizer {
    fn train(&mut self, vectors: &[&[f32]]) {
        self.mins = vec![f32::INFINITY; self.dimension];
        self.maxs = vec![f32::NEG_INFINITY; self.dimension];
        
        for vector in vectors {
            for (i, &val) in vector.iter().enumerate() {
                self.mins[i] = self.mins[i].min(val);
                self.maxs[i] = self.maxs[i].max(val);
            }
        }
        
        self.scales = self.mins.iter().zip(&self.maxs)
            .map(|(&min, &max)| {
                let range = max - min;
                if range > f32::EPSILON { 255.0 / range } else { 0.0 }
            })
            .collect();
    }
    
    fn encode(&self, vector: &[f32]) -> Vec<u8> {
        vector.iter().enumerate()
            .map(|(i, &val)| {
                ((val - self.mins[i]) * self.scales[i]).round().clamp(0.0, 255.0) as u8
            })
            .collect()
    }
    
    fn decode(&self, encoded: &[u8]) -> Vec<f32> {
        encoded.iter().enumerate()
            .map(|(i, &val)| {
                val as f32 / self.scales[i] + self.mins[i]
            })
            .collect()
    }
    
    /// Fast distance computation on quantized vectors (avoids full decode)
    fn distance_quantized(&self, a: &[u8], b: &[u8], metric: DistanceType) -> f32 {
        match metric {
            DistanceType::Euclidean => {
                // Sum of squared differences in quantized space, then rescale
                let mut sum: u32 = 0;
                for i in 0..a.len() {
                    let diff = a[i] as i32 - b[i] as i32;
                    sum += (diff * diff) as u32;
                }
                // Approximate: actual distance ≈ sum / scale_factor²
                (sum as f32).sqrt() // simplified
            },
            DistanceType::DotProduct => {
                let mut sum: u32 = 0;
                for i in 0..a.len() {
                    sum += (a[i] as u32) * (b[i] as u32);
                }
                -(sum as f32) // negate for min-distance convention
            },
            _ => {
                // Fall back to decode + full precision
                let a_decoded = self.decode(a);
                let b_decoded = self.decode(b);
                compute_distance(&a_decoded, &b_decoded)
            }
        }
    }
}
```

#### Product Quantization (PQ)
```rust
struct ProductQuantizer {
    /// Number of subspaces to split vector into
    num_subquantizers: usize,
    /// Dimensions per subspace
    sub_dimension: usize,
    /// Number of centroids per subspace (typically 256 = 1 byte per sub)
    num_centroids: usize,
    /// Codebooks: [num_subquantizers][num_centroids][sub_dimension]
    codebooks: Vec<Vec<Vec<f32>>>,
    /// Total vector dimension
    dimension: usize,
}

impl ProductQuantizer {
    fn train(&mut self, vectors: &[&[f32]], iterations: usize) {
        self.sub_dimension = self.dimension / self.num_subquantizers;
        self.codebooks = Vec::with_capacity(self.num_subquantizers);
        
        for sq in 0..self.num_subquantizers {
            let start = sq * self.sub_dimension;
            let end = start + self.sub_dimension;
            
            // Extract sub-vectors for this subspace
            let sub_vectors: Vec<Vec<f32>> = vectors.iter()
                .map(|v| v[start..end].to_vec())
                .collect();
            
            // Run k-means clustering
            let centroids = kmeans(
                &sub_vectors,
                self.num_centroids,
                iterations,
            );
            
            self.codebooks.push(centroids);
        }
    }
    
    /// Encode vector to PQ codes (1 byte per subquantizer)
    fn encode(&self, vector: &[f32]) -> Vec<u8> {
        let mut codes = Vec::with_capacity(self.num_subquantizers);
        
        for sq in 0..self.num_subquantizers {
            let start = sq * self.sub_dimension;
            let end = start + self.sub_dimension;
            let sub_vector = &vector[start..end];
            
            // Find nearest centroid
            let nearest = self.codebooks[sq].iter().enumerate()
                .min_by(|(_, a), (_, b)| {
                    let dist_a = euclidean_distance(sub_vector, a);
                    let dist_b = euclidean_distance(sub_vector, b);
                    dist_a.partial_cmp(&dist_b).unwrap()
                })
                .map(|(idx, _)| idx as u8)
                .unwrap();
            
            codes.push(nearest);
        }
        
        codes
    }
    
    /// Asymmetric distance: query (full precision) vs database (PQ codes)
    /// Pre-compute distance table for O(1) lookups per subspace
    fn build_distance_table(&self, query: &[f32]) -> Vec<Vec<f32>> {
        let mut table = Vec::with_capacity(self.num_subquantizers);
        
        for sq in 0..self.num_subquantizers {
            let start = sq * self.sub_dimension;
            let end = start + self.sub_dimension;
            let sub_query = &query[start..end];
            
            let distances: Vec<f32> = self.codebooks[sq].iter()
                .map(|centroid| euclidean_distance(sub_query, centroid))
                .collect();
            
            table.push(distances);
        }
        
        table
    }
    
    /// Fast distance using pre-computed table
    fn distance_with_table(&self, codes: &[u8], table: &[Vec<f32>]) -> f32 {
        codes.iter().enumerate()
            .map(|(sq, &code)| table[sq][code as usize])
            .sum()
    }
}
```

#### Binary Quantization
```rust
struct BinaryQuantizer {
    /// Optional thresholds per dimension (default: 0.0)
    thresholds: Vec<f32>,
}

impl BinaryQuantizer {
    fn train(&mut self, vectors: &[&[f32]]) {
        let dim = vectors[0].len();
        // Threshold = mean value per dimension
        self.thresholds = (0..dim).map(|d| {
            let sum: f32 = vectors.iter().map(|v| v[d]).sum();
            sum / vectors.len() as f32
        }).collect();
    }
    
    /// Encode to binary: 1 bit per dimension, packed into bytes
    fn encode(&self, vector: &[f32]) -> Vec<u8> {
        let num_bytes = (vector.len() + 7) / 8;
        let mut encoded = vec![0u8; num_bytes];
        
        for (i, &val) in vector.iter().enumerate() {
            if val >= self.thresholds[i] {
                encoded[i / 8] |= 1 << (i % 8);
            }
        }
        
        encoded
    }
    
    /// Hamming distance between binary vectors
    fn hamming_distance(&self, a: &[u8], b: &[u8]) -> u32 {
        a.iter().zip(b.iter())
            .map(|(&x, &y)| (x ^ y).count_ones())
            .sum()
    }
}
```

#### Quantization Rescoring Pipeline
```rust
struct QuantizedSearchPipeline {
    quantizer: Box<dyn Quantizer>,
    oversampling_factor: f32,       // e.g., 3.0 = fetch 3x candidates
    rescore_with_original: bool,
}

impl QuantizedSearchPipeline {
    fn search(
        &self,
        query: &[f32],
        hnsw: &HnswIndex,
        vector_storage: &VectorStorage,
        top_k: usize,
        ef: usize,
    ) -> Vec<ScoredPoint> {
        // Stage 1: Search HNSW using quantized distances (fast, approximate)
        let oversample_k = (top_k as f32 * self.oversampling_factor) as usize;
        let candidates = hnsw.search_quantized(query, oversample_k, ef);
        
        if !self.rescore_with_original {
            return candidates.into_iter().take(top_k).collect();
        }
        
        // Stage 2: Rescore candidates using full-precision vectors (accurate)
        let mut rescored: Vec<ScoredPoint> = candidates.into_iter()
            .map(|candidate| {
                let original_vector = vector_storage.get(candidate.id);
                let precise_score = compute_distance(query, &original_vector);
                ScoredPoint { id: candidate.id, score: precise_score }
            })
            .collect();
        
        // Sort by precise score and take top-k
        rescored.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap());
        rescored.truncate(top_k);
        rescored
    }
}
```

### 6. Distributed Consensus (Raft)

#### Cluster Architecture
```rust
struct ClusterNode {
    node_id: NodeId,
    raft: RaftState,
    shard_manager: ShardManager,
    replication_manager: ReplicationManager,
    p2p_transport: P2pTransport,
}

struct RaftState {
    current_term: u64,
    voted_for: Option<NodeId>,
    log: Vec<RaftLogEntry>,
    commit_index: u64,
    last_applied: u64,
    role: RaftRole,
    
    // Leader-only state
    next_index: HashMap<NodeId, u64>,
    match_index: HashMap<NodeId, u64>,
}

#[derive(Debug)]
enum RaftRole {
    Follower { leader_id: Option<NodeId> },
    Candidate { votes_received: HashSet<NodeId> },
    Leader,
}

/// Raft log entries for cluster metadata operations
#[derive(Serialize, Deserialize)]
enum RaftLogEntry {
    CreateCollection { config: CollectionConfig },
    DeleteCollection { name: String },
    UpdateCollection { name: String, config: CollectionConfig },
    AssignShard { collection: String, shard_id: ShardId, node_id: NodeId },
    MoveShard { collection: String, shard_id: ShardId, from: NodeId, to: NodeId },
    AddNode { node_id: NodeId, address: SocketAddr },
    RemoveNode { node_id: NodeId },
}
```

#### Shard Routing
```rust
struct ShardManager {
    /// Shard assignments: collection → [(shard_id, leader_node, replica_nodes)]
    shard_table: HashMap<String, Vec<ShardAssignment>>,
    local_shards: HashMap<ShardId, LocalShard>,
}

struct ShardAssignment {
    shard_id: ShardId,
    leader: NodeId,
    replicas: Vec<NodeId>,
    state: ShardState,
}

enum ShardState {
    Active,
    Migrating { from: NodeId, to: NodeId, progress: f32 },
    Recovery,
    Dead,
}

impl ShardManager {
    /// Route a point to its shard (hash-based)
    fn route_point(&self, collection: &str, point_id: &PointId) -> Option<ShardId> {
        let shards = self.shard_table.get(collection)?;
        let hash = point_id.hash();
        let shard_idx = (hash % shards.len() as u64) as usize;
        Some(shards[shard_idx].shard_id)
    }
    
    /// Route a search query — fan out to all shards
    fn route_search(&self, collection: &str) -> Vec<(ShardId, NodeId)> {
        self.shard_table.get(collection)
            .map(|shards| {
                shards.iter()
                    .map(|s| (s.shard_id, s.leader))
                    .collect()
            })
            .unwrap_or_default()
    }
    
    /// Route with custom shard key
    fn route_by_key(&self, collection: &str, shard_key: &str) -> Option<ShardId> {
        let shards = self.shard_table.get(collection)?;
        let hash = hash_shard_key(shard_key);
        let shard_idx = (hash % shards.len() as u64) as usize;
        Some(shards[shard_idx].shard_id)
    }
}
```

#### Multi-Shard Search Merge
```rust
struct DistributedSearchExecutor {
    shard_manager: Arc<ShardManager>,
    p2p_client: P2pClient,
    local_executor: LocalSearchExecutor,
}

impl DistributedSearchExecutor {
    async fn search(
        &self,
        collection: &str,
        query: &[f32],
        filter: Option<&Filter>,
        top_k: usize,
        consistency: ConsistencyLevel,
    ) -> Result<Vec<ScoredPoint>, SearchError> {
        let shard_targets = self.shard_manager.route_search(collection);
        
        // Fan out search to all shards in parallel
        let mut futures = Vec::new();
        for (shard_id, node_id) in shard_targets {
            if self.is_local(node_id) {
                // Local shard search
                let fut = self.local_executor.search(shard_id, query, filter, top_k);
                futures.push(fut);
            } else {
                // Remote shard search via P2P
                let fut = self.p2p_client.search(node_id, shard_id, query, filter, top_k);
                futures.push(fut);
            }
        }
        
        // Wait for all shard results
        let shard_results = join_all(futures).await;
        
        // Merge results from all shards
        let mut merged = BinaryHeap::new();
        for result in shard_results {
            let points = result?;
            for point in points {
                merged.push(Reverse(point));
                if merged.len() > top_k {
                    merged.pop(); // keep only top-k
                }
            }
        }
        
        // Return sorted results
        let mut final_results: Vec<ScoredPoint> = merged.into_iter()
            .map(|Reverse(p)| p)
            .collect();
        final_results.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap());
        Ok(final_results)
    }
}
```

### 7. Payload Index Architecture

#### Index Types
```rust
enum PayloadFieldIndex {
    /// B-tree index for numeric and datetime ranges
    Numeric(BTreeIndex<f64>),
    /// HashMap index for keyword/exact match
    Keyword(KeywordIndex),
    /// Full-text index with tokenizer
    FullText(FullTextIndex),
    /// R-tree index for geospatial queries
    Geo(GeoIndex),
    /// Boolean index
    Bool(BoolIndex),
}

struct KeywordIndex {
    /// value → set of point offsets
    inverted_index: HashMap<String, RoaringBitmap>,
}

struct BTreeIndex<T: Ord> {
    /// B-tree for range queries
    tree: BTreeMap<T, RoaringBitmap>,
}

struct FullTextIndex {
    /// Tokenized inverted index
    terms: HashMap<String, RoaringBitmap>,
    tokenizer: Tokenizer,
}

struct GeoIndex {
    /// R-tree for spatial queries
    rtree: RTree<GeoPoint>,
    /// Point offset → geo coordinates
    coordinates: HashMap<PointOffsetId, GeoPoint>,
}

impl PayloadFieldIndex {
    fn query(&self, condition: &Condition) -> RoaringBitmap {
        match (self, condition) {
            (PayloadFieldIndex::Keyword(idx), Condition::Match { value }) => {
                idx.inverted_index.get(value)
                    .cloned()
                    .unwrap_or_default()
            },
            (PayloadFieldIndex::Numeric(idx), Condition::Range { gte, lte, .. }) => {
                let range = match (gte, lte) {
                    (Some(lo), Some(hi)) => idx.tree.range(lo..=hi),
                    (Some(lo), None) => idx.tree.range(lo..),
                    (None, Some(hi)) => idx.tree.range(..=hi),
                    (None, None) => idx.tree.range(..),
                };
                let mut result = RoaringBitmap::new();
                for (_, bitmap) in range {
                    result |= bitmap;
                }
                result
            },
            (PayloadFieldIndex::Geo(idx), Condition::GeoRadius { center, radius_m }) => {
                idx.query_radius(center, *radius_m)
            },
            (PayloadFieldIndex::FullText(idx), Condition::FullTextMatch { text }) => {
                let tokens = idx.tokenizer.tokenize(text);
                let mut result: Option<RoaringBitmap> = None;
                for token in tokens {
                    if let Some(bitmap) = idx.terms.get(&token) {
                        result = Some(match result {
                            Some(r) => r & bitmap, // AND semantics
                            None => bitmap.clone(),
                        });
                    } else {
                        return RoaringBitmap::new(); // token not found
                    }
                }
                result.unwrap_or_default()
            },
            _ => RoaringBitmap::new(),
        }
    }
    
    /// Estimate cardinality for query planning
    fn cardinality_estimate(&self, condition: &Condition) -> usize {
        match (self, condition) {
            (PayloadFieldIndex::Keyword(idx), Condition::Match { value }) => {
                idx.inverted_index.get(value)
                    .map(|b| b.len() as usize)
                    .unwrap_or(0)
            },
            _ => usize::MAX, // conservative estimate
        }
    }
}
```

#### Query Planner
```rust
struct QueryPlanner {
    payload_indexes: HashMap<String, PayloadFieldIndex>,
    total_points: usize,
}

enum SearchStrategy {
    /// Run HNSW search, then filter results (good for low-selectivity filters)
    VectorFirst { ef_boost: usize },
    /// Run filter first to get candidate set, then brute-force on candidates
    FilterFirst { candidate_bitmap: RoaringBitmap },
    /// Use HNSW with inline filter checking during graph traversal
    FilteredHnsw,
}

impl QueryPlanner {
    fn plan(&self, filter: &Filter, top_k: usize) -> SearchStrategy {
        // Estimate how many points match the filter
        let estimated_matches = self.estimate_filter_cardinality(filter);
        let selectivity = estimated_matches as f64 / self.total_points as f64;
        
        if selectivity < 0.01 {
            // Very selective filter (< 1% of data matches)
            // Filter first, then brute-force on small candidate set
            let bitmap = self.evaluate_filter(filter);
            SearchStrategy::FilterFirst { candidate_bitmap: bitmap }
        } else if selectivity < 0.2 {
            // Moderate selectivity — use filtered HNSW traversal
            SearchStrategy::FilteredHnsw
        } else {
            // Low selectivity (most points match) — search first, filter after
            // Boost ef to compensate for filtered-out results
            let ef_boost = ((1.0 / selectivity) * top_k as f64 * 1.5) as usize;
            SearchStrategy::VectorFirst { ef_boost }
        }
    }
}
```

### 8. Multi-Stage Prefetch Pipeline

```rust
/// Multi-stage search: coarse quantized search → refined search → full rescore
struct PrefetchPipeline {
    stages: Vec<PrefetchStage>,
}

struct PrefetchStage {
    /// Query vector (may differ per stage for multi-vector)
    query: QuerySource,
    /// How many candidates to fetch at this stage
    limit: usize,
    /// Which index/quantization to use
    using: SearchUsing,
    /// Optional filter at this stage
    filter: Option<Filter>,
    /// Score fusion with previous stage
    fusion: Option<FusionMethod>,
}

enum SearchUsing {
    BinaryQuantized,
    ScalarQuantized,
    ProductQuantized,
    FullPrecision,
    SparseIndex,
}

enum FusionMethod {
    ReciprocalRankFusion { k: u32 },
    WeightedSum { weights: Vec<f32> },
}

impl PrefetchPipeline {
    fn execute(
        &self,
        collection: &Collection,
    ) -> Vec<ScoredPoint> {
        let mut candidate_set: Option<Vec<ScoredPoint>> = None;
        
        for stage in &self.stages {
            let results = match (&candidate_set, &stage.using) {
                // First stage: search full index
                (None, SearchUsing::BinaryQuantized) => {
                    collection.search_binary_quantized(&stage.query, stage.limit)
                },
                // Subsequent stages: rescore previous candidates
                (Some(candidates), SearchUsing::ScalarQuantized) => {
                    collection.rescore_scalar_quantized(candidates, &stage.query, stage.limit)
                },
                (Some(candidates), SearchUsing::FullPrecision) => {
                    collection.rescore_full_precision(candidates, &stage.query, stage.limit)
                },
                // Sparse vector stage for hybrid search
                (_, SearchUsing::SparseIndex) => {
                    collection.search_sparse(&stage.query, stage.limit)
                },
                _ => unimplemented!(),
            };
            
            // Apply fusion if configured
            candidate_set = Some(match (&candidate_set, &stage.fusion) {
                (Some(prev), Some(FusionMethod::ReciprocalRankFusion { k })) => {
                    reciprocal_rank_fusion(prev, &results, *k)
                },
                (Some(prev), Some(FusionMethod::WeightedSum { weights })) => {
                    weighted_sum_fusion(prev, &results, weights)
                },
                _ => results,
            });
        }
        
        candidate_set.unwrap_or_default()
    }
}

fn reciprocal_rank_fusion(
    list_a: &[ScoredPoint],
    list_b: &[ScoredPoint],
    k: u32,
) -> Vec<ScoredPoint> {
    let mut scores: HashMap<PointId, f32> = HashMap::new();
    
    for (rank, point) in list_a.iter().enumerate() {
        *scores.entry(point.id).or_default() += 1.0 / (k as f32 + rank as f32 + 1.0);
    }
    for (rank, point) in list_b.iter().enumerate() {
        *scores.entry(point.id).or_default() += 1.0 / (k as f32 + rank as f32 + 1.0);
    }
    
    let mut results: Vec<ScoredPoint> = scores.into_iter()
        .map(|(id, score)| ScoredPoint { id, score })
        .collect();
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap()); // higher RRF = better
    results
}
```

## Performance Optimization Strategies

### 1. SIMD-Accelerated Distance Computation
```rust
#[cfg(target_arch = "x86_64")]
use std::arch::x86_64::*;

/// AVX2-accelerated L2 distance (8 floats at a time)
#[cfg(target_arch = "x86_64")]
unsafe fn l2_distance_avx2(a: &[f32], b: &[f32]) -> f32 {
    let len = a.len();
    let mut sum = _mm256_setzero_ps();
    
    let chunks = len / 8;
    for i in 0..chunks {
        let va = _mm256_loadu_ps(a.as_ptr().add(i * 8));
        let vb = _mm256_loadu_ps(b.as_ptr().add(i * 8));
        let diff = _mm256_sub_ps(va, vb);
        sum = _mm256_fmadd_ps(diff, diff, sum); // FMA: sum += diff * diff
    }
    
    // Horizontal sum of 8 floats
    let hi = _mm256_extractf128_ps(sum, 1);
    let lo = _mm256_castps256_ps128(sum);
    let sum128 = _mm_add_ps(lo, hi);
    let sum64 = _mm_add_ps(sum128, _mm_movehl_ps(sum128, sum128));
    let sum32 = _mm_add_ss(sum64, _mm_shuffle_ps(sum64, sum64, 1));
    
    let mut result: f32 = 0.0;
    _mm_store_ss(&mut result, sum32);
    
    // Handle remaining dimensions
    for i in (chunks * 8)..len {
        let diff = a[i] - b[i];
        result += diff * diff;
    }
    
    result.sqrt()
}

/// Cosine similarity using dot product + norms
#[cfg(target_arch = "x86_64")]
unsafe fn cosine_similarity_avx2(a: &[f32], b: &[f32]) -> f32 {
    let len = a.len();
    let mut dot = _mm256_setzero_ps();
    let mut norm_a = _mm256_setzero_ps();
    let mut norm_b = _mm256_setzero_ps();
    
    let chunks = len / 8;
    for i in 0..chunks {
        let va = _mm256_loadu_ps(a.as_ptr().add(i * 8));
        let vb = _mm256_loadu_ps(b.as_ptr().add(i * 8));
        dot = _mm256_fmadd_ps(va, vb, dot);
        norm_a = _mm256_fmadd_ps(va, va, norm_a);
        norm_b = _mm256_fmadd_ps(vb, vb, norm_b);
    }
    
    let dot_sum = hsum_avx2(dot);
    let norm_a_sum = hsum_avx2(norm_a);
    let norm_b_sum = hsum_avx2(norm_b);
    
    1.0 - dot_sum / (norm_a_sum.sqrt() * norm_b_sum.sqrt())
}
```

### 2. Memory-Mapped Storage
```rust
struct MmapVectorStorage {
    mmap: Mmap,
    dimension: usize,
    num_vectors: usize,
    deleted_bitset: BitVec,
}

impl MmapVectorStorage {
    fn open(path: &Path, dimension: usize) -> Result<Self, IoError> {
        let file = File::open(path)?;
        let mmap = unsafe { MmapOptions::new().map(&file)? };
        let num_vectors = mmap.len() / (dimension * 4); // 4 bytes per f32
        
        Ok(Self {
            mmap,
            dimension,
            num_vectors,
            deleted_bitset: BitVec::from_elem(num_vectors, false),
        })
    }
    
    /// Zero-copy vector access — returns slice into mmap'd region
    fn get_vector(&self, offset: PointOffsetId) -> &[f32] {
        let byte_offset = offset as usize * self.dimension * 4;
        let byte_end = byte_offset + self.dimension * 4;
        let bytes = &self.mmap[byte_offset..byte_end];
        
        // Safe because mmap alignment is guaranteed and f32 has no invalid bit patterns
        unsafe {
            std::slice::from_raw_parts(
                bytes.as_ptr() as *const f32,
                self.dimension,
            )
        }
    }
    
    /// Advise kernel to pre-fault pages for batch operations
    fn prefetch_range(&self, start_offset: usize, count: usize) {
        let byte_start = start_offset * self.dimension * 4;
        let byte_len = count * self.dimension * 4;
        unsafe {
            libc::madvise(
                self.mmap.as_ptr().add(byte_start) as *mut libc::c_void,
                byte_len,
                libc::MADV_WILLNEED,
            );
        }
    }
}
```

### 3. Concurrent Search Execution
```rust
struct SearchRuntime {
    /// Thread pool for parallel segment search
    search_pool: rayon::ThreadPool,
    /// Number of segments to search in parallel
    max_parallel_segments: usize,
}

impl SearchRuntime {
    fn search_all_segments(
        &self,
        segments: &[Arc<dyn Segment>],
        query: &[f32],
        filter: Option<&Filter>,
        top_k: usize,
        ef: usize,
    ) -> Vec<ScoredPoint> {
        // Search each segment in parallel
        let segment_results: Vec<Vec<ScoredPoint>> = self.search_pool.install(|| {
            segments.par_iter()
                .map(|segment| segment.search(query, filter, top_k, ef))
                .collect()
        });
        
        // Merge results from all segments
        let mut merged = BinaryHeap::new();
        for results in segment_results {
            for point in results {
                if merged.len() < top_k {
                    merged.push(point);
                } else if point.score < merged.peek().unwrap().score {
                    merged.pop();
                    merged.push(point);
                }
            }
        }
        
        let mut final_results: Vec<_> = merged.into_vec();
        final_results.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap());
        final_results
    }
}
```

## Deployment Architecture Patterns

### 1. Single-Node Deployment
```yaml
deployment:
  type: single_node
  resources:
    cpu_cores: 8
    memory: "32GB"
    storage: "500GB SSD"
  config:
    collections_limit: 100
    max_vectors: 50_000_000
    wal_segment_size: "32MB"
    optimizer_threads: 4
    search_threads: 8
```

### 2. Distributed Cluster
```yaml
deployment:
  type: distributed
  nodes: 3
  config:
    replication_factor: 2
    shard_count: 6
    consensus: raft
    write_consistency: quorum
    read_consistency: local
  
  node_spec:
    cpu_cores: 16
    memory: "64GB"
    storage: "1TB NVMe"
    
  networking:
    p2p_port: 6335
    grpc_port: 6334
    http_port: 6333
```

### 3. Memory-Optimized (Quantized)
```yaml
deployment:
  type: single_node
  resources:
    memory: "16GB"
  config:
    quantization:
      scalar:
        type: "int8"
        always_ram: true
    vectors_on_disk: true
    hnsw_on_disk: false
    # 100M 768-dim vectors in ~16GB RAM with SQ8 + mmap
```

This comprehensive architecture guide provides the detailed implementation patterns for building a production-grade vector database — from HNSW graph construction through distributed consensus — optimized for the workloads SKVector serves in production with Qdrant.