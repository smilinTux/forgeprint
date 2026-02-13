# Search Engine Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing a production-grade full-text search engine. It covers the foundational data structures (inverted indexes, skip lists, FSTs), segment-based storage inspired by Apache Lucene, near-real-time search mechanics, distributed query execution, merge policies, and the scoring pipeline that transforms raw term statistics into relevance rankings.

## Table of Contents
1. [Core Data Structures](#1-core-data-structures)
2. [Segment Architecture](#2-segment-architecture)
3. [Indexing Pipeline](#3-indexing-pipeline)
4. [Near-Real-Time Search](#4-near-real-time-search)
5. [Query Execution Engine](#5-query-execution-engine)
6. [Scoring Pipeline](#6-scoring-pipeline)
7. [Aggregation Engine](#7-aggregation-engine)
8. [Distributed Architecture](#8-distributed-architecture)
9. [Merge Policies](#9-merge-policies)
10. [Memory Management](#10-memory-management)
11. [Vector Search Architecture](#11-vector-search-architecture)
12. [Geospatial Indexing](#12-geospatial-indexing)

---

## 1. Core Data Structures

### 1.1 Inverted Index

The inverted index is the fundamental data structure enabling fast full-text search. It maps every unique term to the list of documents containing that term.

```
Architecture:
┌─────────────────────────────────────────────────────────────┐
│                     INVERTED INDEX                          │
│                                                             │
│  Term Dictionary (FST)          Postings Lists              │
│  ┌──────────────────┐          ┌──────────────────────────┐ │
│  │ "bluetooth" ─────┼────────→ │ [1:2:(3,15), 7:1:(8)]   │ │
│  │ "cancel"   ─────┼────────→ │ [1:1:(9), 3:2:(5,21)]   │ │
│  │ "headphone" ────┼────────→ │ [1:3:(5,18,30), 7:1:(2)] │ │
│  │ "noise"    ─────┼────────→ │ [1:1:(7), 3:1:(3)]      │ │
│  │ "wireless" ─────┼────────→ │ [1:1:(1), 5:2:(4,12)]   │ │
│  └──────────────────┘          └──────────────────────────┘ │
│                                                             │
│  Format: [DocID:Freq:(Positions...)]                        │
└─────────────────────────────────────────────────────────────┘
```

#### Inverted Index Construction

```rust
struct InvertedIndexWriter {
    /// In-memory buffer: term → postings accumulator
    term_postings: BTreeMap<String, PostingsAccumulator>,
    /// Current document ID being indexed
    current_doc_id: u32,
    /// Field-level statistics
    field_stats: FieldStatistics,
}

struct PostingsAccumulator {
    /// Document IDs (sorted, delta-encoded on flush)
    doc_ids: Vec<u32>,
    /// Per-document term frequency
    frequencies: Vec<u32>,
    /// Per-document position lists (optional, for phrase queries)
    positions: Vec<Vec<u32>>,
    /// Per-document offsets (optional, for highlighting)
    offsets: Vec<Vec<(u32, u32)>>,
    /// Total documents containing this term
    doc_freq: u32,
    /// Total occurrences across all documents
    total_term_freq: u64,
}

impl InvertedIndexWriter {
    fn add_document(&mut self, doc_id: u32, field: &str, tokens: &[Token]) {
        self.current_doc_id = doc_id;
        
        // Group tokens by term, tracking positions
        let mut term_positions: HashMap<&str, Vec<u32>> = HashMap::new();
        for (position, token) in tokens.iter().enumerate() {
            term_positions
                .entry(&token.text)
                .or_default()
                .push(position as u32);
        }
        
        // Add to postings accumulator
        for (term, positions) in term_positions {
            let postings = self.term_postings
                .entry(term.to_string())
                .or_insert_with(PostingsAccumulator::new);
            
            postings.doc_ids.push(doc_id);
            postings.frequencies.push(positions.len() as u32);
            postings.positions.push(positions);
            postings.doc_freq += 1;
            postings.total_term_freq += positions.len() as u64;
        }
        
        // Track field length for BM25 normalization
        self.field_stats.add_field_length(doc_id, tokens.len() as u32);
    }
    
    fn flush_to_segment(&self) -> Segment {
        // 1. Build term dictionary (FST)
        // 2. Write postings lists with delta + VByte encoding
        // 3. Build skip lists over postings
        // 4. Write field statistics (norms)
        // 5. Return immutable segment
        todo!()
    }
}
```

#### Delta Encoding for Postings

Postings lists store sorted document IDs. Delta encoding dramatically reduces storage:

```
Raw doc IDs:    [100, 103, 107, 115, 120, 128, 200, 205]
Delta encoded:  [100,   3,   4,   8,   5,   8,  72,   5]
                 ↑ first value stored raw, rest as deltas
```

Variable-byte (VByte) encoding further compresses small deltas:
```
Value    Binary              VByte Bytes
3        00000011            1 byte  (0x03)
100      01100100            1 byte  (0x64)
128      10000000            2 bytes (0x80, 0x01)
16384    ‭100000000000000‬    3 bytes (0x80, 0x80, 0x01)
```

### 1.2 Finite State Transducer (FST) — Term Dictionary

The term dictionary maps terms to their postings list offset. An FST provides O(term_length) lookup with minimal memory by sharing prefixes and suffixes:

```
FST for terms: ["bluetooth", "blue", "blueberry", "cancel", "can"]

        ┌─b─┐
   START│   ▼
        │  ┌─l─u─e─┐──────────→ (ACCEPT: "blue", offset=100)
        │  │        ├─t─o─o─t─h→ (ACCEPT: "bluetooth", offset=200)
        │  │        └─b─e─r─r─y→ (ACCEPT: "blueberry", offset=300)
        │  │
        └─c─a─n─┐──────────────→ (ACCEPT: "can", offset=400)
                 └─c─e─l────────→ (ACCEPT: "cancel", offset=500)

Memory: O(total_unique_chars) — much smaller than a hash map
Lookup: O(term_length) — follow edges character by character
Prefix iteration: Efficiently enumerate all terms with a given prefix
```

```rust
struct FST {
    /// Compiled byte array representation
    data: Vec<u8>,
    /// Root node offset
    root_offset: usize,
}

impl FST {
    /// Exact lookup: returns the associated value (postings offset) or None
    fn get(&self, key: &[u8]) -> Option<u64> {
        let mut node = self.root_node();
        for &byte in key {
            match node.find_transition(byte) {
                Some(transition) => {
                    node = self.node_at(transition.target);
                }
                None => return None,
            }
        }
        node.final_output()
    }
    
    /// Prefix iterator: enumerate all terms starting with prefix
    fn prefix_iter(&self, prefix: &[u8]) -> FSTIterator {
        let mut node = self.root_node();
        for &byte in prefix {
            match node.find_transition(byte) {
                Some(transition) => node = self.node_at(transition.target),
                None => return FSTIterator::empty(),
            }
        }
        FSTIterator::from_node(self, node, prefix.to_vec())
    }
    
    /// Automaton-based search: fuzzy, regex, wildcard
    fn search<A: Automaton>(&self, automaton: &A) -> Vec<(Vec<u8>, u64)> {
        // Intersect FST with automaton (e.g., Levenshtein for fuzzy)
        let mut results = Vec::new();
        self.intersect_recursive(self.root_node(), automaton.start(), &mut vec![], &mut results);
        results
    }
}
```

**FST Construction** (from sorted terms):
1. Sort all unique terms lexicographically
2. Process terms in reverse order, identifying shared suffixes
3. Build nodes bottom-up, sharing suffix subgraphs
4. Compile to compact byte array

**Memory comparison** for 10M unique terms:
- HashMap: ~500MB (keys + pointers + overhead)
- FST: ~30-50MB (shared prefix/suffix compression)

### 1.3 Skip Lists

Skip lists accelerate postings list intersection by enabling O(log n) skipping:

```
Level 3:  [100] ─────────────────────────────────→ [500] ─────────→ [900]
Level 2:  [100] ──────────→ [250] ──────────→ [500] ──→ [700] ──→ [900]
Level 1:  [100] → [150] → [250] → [300] → [500] → [600] → [700] → [850] → [900]
Level 0:  [100,103,107,115,120,128,150,155,170,...,250,...,300,...,500,...,900,910,950]
           ^-- actual postings entries
```

```rust
struct SkipList {
    /// Skip interval (e.g., every 128 postings)
    skip_interval: usize,
    /// Multi-level skip data
    levels: Vec<SkipLevel>,
}

struct SkipLevel {
    /// (doc_id, offset_in_postings) pairs
    entries: Vec<(u32, u64)>,
}

impl SkipList {
    /// Advance to first doc_id >= target, returning number of entries skipped
    fn advance_to(&self, target: u32, current_pos: &mut usize) -> Option<u32> {
        // Start from highest level, descend
        for level in (0..self.levels.len()).rev() {
            while let Some(&(doc_id, offset)) = self.levels[level].entries.get(*current_pos) {
                if doc_id < target {
                    *current_pos = offset as usize;
                } else {
                    break;
                }
            }
        }
        // Linear scan from current position at level 0
        self.scan_from(*current_pos, target)
    }
}
```

**Skip list usage in boolean queries**:
```
AND query: "wireless" AND "headphone"
  postings("wireless"):  [1, 5, 12, 45, 67, 100, 234, 500, 789, ...]
  postings("headphone"): [1, 7, 12, 33, 67, 88, 100, 445, 789, ...]
  
Algorithm (zipper merge with skip):
  1. Start at beginning of both lists
  2. wireless=1, headphone=1 → MATCH (doc 1)
  3. wireless=5, headphone=7 → skip wireless to ≥7 → wireless=12
  4. headphone=7, wireless=12 → skip headphone to ≥12 → headphone=12 → MATCH (doc 12)
  5. ... continue with skip acceleration
  
Without skips: O(n + m) linear scan
With skips: O(√(n × m)) for typical distributions
```

### 1.4 BKD Trees (Block KD-Trees)

For numeric, date, and geo_point fields, BKD trees provide efficient range queries:

```
BKD Tree for price field:
                    [split: price=150.00]
                   /                      \
          [≤150.00]                        [>150.00]
         /         \                      /          \
   [≤75.00]    [75-150]           [150-300]      [>300]
     /    \      /    \             /    \         /   \
  [leaf] [leaf] [leaf] [leaf]  [leaf] [leaf]  [leaf] [leaf]
  
Leaf nodes: packed arrays of (doc_id, value) sorted by value
Inner nodes: split dimension + split value

Range query "price: [50, 200]":
  1. Root: 150 — both subtrees may contain matches
  2. Left child (≤150): check [75-150] subtree fully, [≤75] partially
  3. Right child (>150): check [150-300] partially
  4. Collect matching doc IDs from qualifying leaf blocks
```

```rust
struct BKDTree {
    /// Number of dimensions (1 for simple numeric, 2 for geo_point)
    num_dims: usize,
    /// Bytes per dimension value
    bytes_per_dim: usize,
    /// Leaf block size (default: 512-1024 points)
    max_points_per_leaf: usize,
    /// Serialized tree data
    data: Vec<u8>,
}

impl BKDTree {
    fn range_query(&self, min: &[u8], max: &[u8]) -> DocIdSet {
        let mut collector = DocIdCollector::new();
        self.visit_range(self.root_offset(), min, max, &mut collector);
        collector.into_docid_set()
    }
    
    fn visit_range(
        &self,
        node_offset: usize,
        min: &[u8],
        max: &[u8],
        collector: &mut DocIdCollector,
    ) {
        if self.is_leaf(node_offset) {
            // Scan leaf block, collect matching doc IDs
            self.scan_leaf(node_offset, min, max, collector);
        } else {
            let (split_dim, split_value) = self.read_split(node_offset);
            
            // Check if left subtree may contain matches
            if min[split_dim..split_dim + self.bytes_per_dim] <= split_value {
                self.visit_range(self.left_child(node_offset), min, max, collector);
            }
            // Check if right subtree may contain matches
            if max[split_dim..split_dim + self.bytes_per_dim] > split_value {
                self.visit_range(self.right_child(node_offset), min, max, collector);
            }
        }
    }
}
```

### 1.5 Doc Values (Column Store)

Doc values provide column-oriented access for sorting and aggregations without loading the inverted index:

```
Row-oriented (stored fields):
  Doc 1: { brand: "Sony",    price: 149.99, rating: 4.7 }
  Doc 2: { brand: "Bose",    price: 299.99, rating: 4.5 }
  Doc 3: { brand: "Sony",    price: 79.99,  rating: 4.2 }

Column-oriented (doc values):
  brand:  ["Sony", "Bose", "Sony"]     → ordinal encoding: [0, 1, 0] + dict: {0:"Sony", 1:"Bose"}
  price:  [149.99, 299.99, 79.99]      → sorted numeric, delta + zigzag + bit-packing
  rating: [4.7, 4.5, 4.2]             → sorted numeric
```

```rust
enum DocValuesFormat {
    /// Sorted numeric: for integers, floats, dates
    SortedNumeric {
        min_value: i64,
        gcd: i64,              // greatest common divisor for compression
        bits_per_value: u8,    // after removing min and GCD
        data: Vec<u8>,         // packed values
    },
    /// Sorted set: for keyword fields (ordinal → term mapping)
    SortedSet {
        ordinals: Vec<u32>,           // per-doc ordinal (or ordinal list)
        term_dictionary: Vec<Vec<u8>>, // ordinal → term bytes
    },
    /// Binary: for arbitrary byte arrays
    Binary {
        lengths: Vec<u32>,
        data: Vec<u8>,
    },
}

impl DocValues {
    /// Get numeric value for a document (O(1) access)
    fn get_numeric(&self, doc_id: u32) -> i64 {
        let packed = self.read_packed(doc_id);
        self.min_value + packed * self.gcd
    }
    
    /// Iterate all values for aggregation (sequential scan, cache-friendly)
    fn iterate_numeric(&self) -> DocValuesIterator {
        DocValuesIterator::new(&self.data, self.min_value, self.gcd, self.bits_per_value)
    }
}
```

---

## 2. Segment Architecture

### 2.1 What is a Segment?

A segment is a self-contained, immutable search index. Each shard consists of multiple segments that are merged over time.

```
Shard Directory Layout:
├── segments_N              # Segment infos file (commit point — lists active segments)
├── _0/                     # Segment 0 (oldest)
│   ├── _0.si              # Segment info (doc count, codec, diagnostics)
│   ├── _0.fnm             # Field names and metadata
│   ├── _0.fdx             # Stored fields index (offsets)
│   ├── _0.fdt             # Stored fields data (compressed _source)
│   ├── _0.tim             # Term dictionary (FST)
│   ├── _0.tip             # Term index (FST root pointers per field)
│   ├── _0.doc             # Postings: doc IDs + frequencies
│   ├── _0.pos             # Postings: positions (for phrase queries)
│   ├── _0.pay             # Postings: payloads + offsets (for highlighting)
│   ├── _0.nvd             # Norms data (field length normalization)
│   ├── _0.nvm             # Norms metadata
│   ├── _0.dvd             # Doc values data
│   ├── _0.dvm             # Doc values metadata
│   ├── _0.kdd             # BKD tree data (points)
│   ├── _0.kdi             # BKD tree index
│   ├── _0.kdm             # BKD tree metadata
│   ├── _0.liv             # Live docs bitset (tracks deletes)
│   └── _0.vec             # Vector index (HNSW graph)
├── _1/                     # Segment 1
│   └── ...
├── _2/                     # Segment 2 (newest — recently flushed)
│   └── ...
└── translog/               # Write-ahead log
    ├── translog-1.tlog
    ├── translog-2.tlog
    └── translog.ckp        # Checkpoint (last committed generation)
```

### 2.2 Segment Immutability

Segments are **write-once, read-many**:

```
Index Operation Flow:
  
  New Document → [In-Memory Buffer] → (flush) → [New Immutable Segment]
  
  Delete Document → [.liv bitset updated] → (merge) → [New Segment without deleted docs]
  
  Update Document → [Delete old] + [Index new] → Two operations

Why Immutability?
  ✓ No locking needed for concurrent reads
  ✓ OS page cache works perfectly (data never changes)
  ✓ Segments can be memory-mapped safely
  ✓ Crash recovery is simple (either segment exists or it doesn't)
  ✓ Enables efficient compression (data is final)
  
Tradeoffs:
  ✗ Deletes waste space until merge
  ✗ Multiple segments must be searched (merged at query time)
  ✗ Updates are expensive (delete + re-index)
```

### 2.3 Segment Lifecycle

```
                    ┌───────────────────────────────┐
                    │       SEGMENT LIFECYCLE        │
                    └───────────────────────────────┘
                    
  Documents arrive → [In-Memory Buffer]
                         │
                         │ (buffer full OR refresh timer)
                         ▼
                    [Uncommitted Segment]  ← searchable but not durable
                         │
                         │ (flush/commit — fsync to disk)
                         ▼
                    [Committed Segment]    ← searchable AND durable
                         │
                         │ (merge policy selects candidates)
                         ▼
                    [Merge: Seg_A + Seg_B + Seg_C → Seg_D]
                         │
                         │ (merged segment replaces originals)
                         ▼
                    [Merged Segment]       ← larger, fewer deleted docs
                         │
                         │ (may participate in future merges)
                         ▼
                    [Eventually: single large segment per tier]
```

### 2.4 Live Docs Bitset (Deletion Tracking)

```rust
struct LiveDocs {
    /// Bitset: 1 = alive, 0 = deleted
    bits: Vec<u64>,
    /// Number of live (non-deleted) documents
    num_live_docs: u32,
    /// Total documents in segment
    num_total_docs: u32,
}

impl LiveDocs {
    fn is_live(&self, doc_id: u32) -> bool {
        let word_index = (doc_id / 64) as usize;
        let bit_index = doc_id % 64;
        (self.bits[word_index] >> bit_index) & 1 == 1
    }
    
    fn delete(&mut self, doc_id: u32) {
        let word_index = (doc_id / 64) as usize;
        let bit_index = doc_id % 64;
        if self.is_live(doc_id) {
            self.bits[word_index] &= !(1u64 << bit_index);
            self.num_live_docs -= 1;
        }
    }
    
    fn delete_ratio(&self) -> f32 {
        1.0 - (self.num_live_docs as f32 / self.num_total_docs as f32)
    }
}
```

---

## 3. Indexing Pipeline

### 3.1 Document Indexing Flow

```
Client Request (JSON)
    │
    ▼
┌─────────────────────┐
│  1. PARSE & VALIDATE │ — Validate against mapping, reject unknown fields (strict mode)
│     JSON Document    │   or auto-map new fields (dynamic mode)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  2. INGEST PIPELINE  │ — Run processors: grok, geoip, set, script, inference, etc.
│     (if configured)  │   Transform document before indexing
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  3. ROUTING          │ — Determine target shard: hash(_routing || _id) % num_shards
│     Shard Selection  │   Forward to primary shard owner node
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  4. TRANSLOG WRITE   │ — Append operation to write-ahead log for durability
│     (WAL)            │   fsync based on durability setting (request/async)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  5. ANALYSIS         │ — Per-field: run analyzer pipeline
│     Per Field        │   text → char_filter → tokenizer → token_filter → tokens
│                      │   Generate: terms, positions, offsets, payloads
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  6. IN-MEMORY INDEX  │ — Add to in-memory segment buffer:
│     Buffer           │   - Inverted index entries (term → postings)
│                      │   - Stored fields (_source)
│                      │   - Doc values (columnar)
│                      │   - Points (BKD for numerics)
│                      │   - Vectors (HNSW graph)
└─────────┬───────────┘
          │
          ├──── (refresh) ───→ New searchable segment (not yet fsync'd)
          │
          └──── (flush) ────→ fsync segment to disk, clear translog
```

### 3.2 Analyzer Pipeline Detail

```rust
struct AnalyzerPipeline {
    char_filters: Vec<Box<dyn CharFilter>>,
    tokenizer: Box<dyn Tokenizer>,
    token_filters: Vec<Box<dyn TokenFilter>>,
}

struct Token {
    text: String,
    position: u32,
    start_offset: u32,
    end_offset: u32,
    position_length: u32,  // for synonyms spanning multiple positions
    token_type: TokenType,
}

impl AnalyzerPipeline {
    fn analyze(&self, input: &str) -> Vec<Token> {
        // Phase 1: Character filtering
        let mut text = input.to_string();
        for filter in &self.char_filters {
            text = filter.filter(&text);
        }
        
        // Phase 2: Tokenization
        let mut tokens = self.tokenizer.tokenize(&text);
        
        // Phase 3: Token filtering
        for filter in &self.token_filters {
            tokens = filter.filter(tokens);
        }
        
        tokens
    }
}

// Example: English analyzer
// Input: "<p>The Quick-Brown Foxes are running!</p>"
// 
// CharFilter (html_strip):  "The Quick-Brown Foxes are running!"
// Tokenizer (standard):     ["The", "Quick", "Brown", "Foxes", "are", "running"]
// TokenFilter (lowercase):  ["the", "quick", "brown", "foxes", "are", "running"]
// TokenFilter (stop):       ["quick", "brown", "foxes", "running"]
// TokenFilter (stemmer):    ["quick", "brown", "fox", "run"]
```

### 3.3 Bulk Indexing Optimization

```rust
struct BulkProcessor {
    /// Maximum actions per bulk request
    bulk_size: usize,
    /// Maximum bytes per bulk request
    max_bytes: usize,
    /// Flush interval
    flush_interval: Duration,
    /// Per-shard action buffers
    shard_buffers: HashMap<ShardId, Vec<BulkAction>>,
}

impl BulkProcessor {
    fn process_bulk_request(&mut self, actions: Vec<BulkAction>) -> BulkResponse {
        // 1. Route each action to its target shard
        for action in actions {
            let shard_id = self.route_action(&action);
            self.shard_buffers.entry(shard_id).or_default().push(action);
        }
        
        // 2. Execute per-shard batches in parallel
        let mut responses = Vec::new();
        for (shard_id, shard_actions) in &self.shard_buffers {
            let result = self.execute_shard_batch(shard_id, shard_actions);
            responses.push(result);
        }
        
        // 3. Merge responses
        BulkResponse::merge(responses)
    }
}
```

### 3.4 Translog (Write-Ahead Log)

```rust
struct Translog {
    /// Current generation being written to
    current_generation: u64,
    /// Active file writer
    writer: BufWriter<File>,
    /// Total size of current generation
    current_size: u64,
    /// Durability mode
    durability: TranslogDurability,
    /// Generation threshold for rolling to new file
    generation_threshold_size: u64,  // default: 512MB
}

enum TranslogDurability {
    /// fsync after every operation (default) — strongest durability
    Request,
    /// fsync on interval (e.g., 5s) — better throughput, risk of data loss
    Async { sync_interval: Duration },
}

struct TranslogEntry {
    /// Operation sequence number (monotonically increasing)
    seq_no: u64,
    /// Primary term (leader election epoch)
    primary_term: u64,
    /// Operation type and data
    operation: TranslogOperation,
}

enum TranslogOperation {
    Index { id: String, source: Vec<u8>, routing: Option<String> },
    Delete { id: String },
    NoOp { reason: String },
}

impl Translog {
    fn add(&mut self, entry: TranslogEntry) -> io::Result<()> {
        // Serialize entry
        let bytes = entry.serialize();
        
        // Write to current generation file
        self.writer.write_all(&bytes)?;
        self.current_size += bytes.len() as u64;
        
        // fsync if durability requires it
        if matches!(self.durability, TranslogDurability::Request) {
            self.writer.get_ref().sync_data()?;
        }
        
        // Roll to new generation if threshold exceeded
        if self.current_size >= self.generation_threshold_size {
            self.roll_generation()?;
        }
        
        Ok(())
    }
    
    /// Replay translog for crash recovery
    fn replay(&self, from_seq_no: u64) -> impl Iterator<Item = TranslogEntry> {
        // Read all generations from checkpoint, yield entries >= from_seq_no
        TranslogReplayIterator::new(self.checkpoint(), from_seq_no)
    }
    
    /// Trim translog after successful flush (segments committed to disk)
    fn trim_below(&mut self, seq_no: u64) -> io::Result<()> {
        // Delete generations fully below seq_no
        // Update checkpoint
        self.update_checkpoint(seq_no)
    }
}
```

---

## 4. Near-Real-Time Search

### 4.1 Refresh Mechanism

Near-real-time (NRT) search makes newly indexed documents searchable without a full commit (fsync):

```
Timeline:
  t=0.0s  Document indexed → in-memory buffer (NOT searchable)
  t=0.5s  More documents arrive → buffer grows
  t=1.0s  REFRESH (default interval) →
          1. Flush in-memory buffer to new in-memory segment
          2. Open segment reader (memory-mapped)
          3. Add to searcher's segment list
          4. Document now SEARCHABLE (but not fsync'd to disk)
  t=1.0s  Search request → sees the new document
  ...
  t=30min FLUSH/COMMIT →
          1. fsync all unflushed segments to disk
          2. Write new segments_N commit point
          3. Trim translog
          4. Data now DURABLE (survives crash)
```

```rust
struct IndexWriter {
    /// In-memory buffer for current segment being built
    ram_buffer: RamBuffer,
    /// Maximum RAM buffer size before auto-flush
    ram_buffer_size_mb: f64,  // default: indexing_pressure 10% of heap
    /// List of segment readers (searchable segments)
    segment_readers: Arc<RwLock<Vec<SegmentReader>>>,
    /// Refresh interval
    refresh_interval: Duration,  // default: 1 second
}

impl IndexWriter {
    /// Refresh: make buffered documents searchable
    fn refresh(&mut self) -> Result<(), Error> {
        if self.ram_buffer.is_empty() {
            return Ok(());  // Nothing to refresh
        }
        
        // 1. Flush buffer to in-memory segment
        let new_segment = self.ram_buffer.flush_to_segment()?;
        
        // 2. Open reader for the new segment
        let reader = SegmentReader::open(new_segment)?;
        
        // 3. Atomically update the searcher's segment list
        let mut readers = self.segment_readers.write().unwrap();
        readers.push(reader);
        
        // 4. Reset the buffer
        self.ram_buffer = RamBuffer::new(self.ram_buffer_size_mb);
        
        Ok(())
    }
    
    /// Flush/commit: fsync to disk for durability
    fn flush(&mut self) -> Result<(), Error> {
        // 1. Refresh first (make everything searchable)
        self.refresh()?;
        
        // 2. fsync all uncommitted segments to disk
        for reader in self.segment_readers.read().unwrap().iter() {
            if !reader.is_committed() {
                reader.commit()?;  // fsync segment files
            }
        }
        
        // 3. Write commit point (segments_N file)
        self.write_commit_point()?;
        
        // 4. Trim translog
        self.translog.trim_below(self.last_committed_seq_no)?;
        
        Ok(())
    }
}
```

### 4.2 Searcher Management

```rust
struct SearcherManager {
    /// Current searcher (reference-counted for safe concurrent use)
    current_searcher: Arc<IndexSearcher>,
    /// Pending searcher refresh
    refresh_lock: Mutex<()>,
}

struct IndexSearcher {
    /// Snapshot of segment readers at searcher creation time
    segment_readers: Vec<SegmentReader>,
    /// Per-segment delete bitsets
    live_docs: Vec<Option<LiveDocs>>,
    /// Global statistics for scoring
    collection_stats: CollectionStatistics,
}

impl SearcherManager {
    /// Get current searcher (non-blocking, reference counted)
    fn acquire(&self) -> Arc<IndexSearcher> {
        Arc::clone(&self.current_searcher)
    }
    
    /// Refresh: create new searcher with latest segments
    fn maybe_refresh(&self) -> Result<bool, Error> {
        let _guard = self.refresh_lock.lock().unwrap();
        
        let old_searcher = &self.current_searcher;
        let new_readers = self.get_updated_readers(old_searcher)?;
        
        if new_readers.is_empty() {
            return Ok(false);  // No changes
        }
        
        // Build new searcher with combined old + new readers
        let new_searcher = Arc::new(IndexSearcher::new(new_readers));
        
        // Atomic swap — old searcher stays alive until all references dropped
        self.current_searcher = new_searcher;
        
        Ok(true)
    }
}
```

---

## 5. Query Execution Engine

### 5.1 Query Parsing and Optimization

```rust
enum Query {
    // Leaf queries
    Term { field: String, term: String },
    Phrase { field: String, terms: Vec<String>, slop: u32 },
    Fuzzy { field: String, term: String, max_edits: u8, prefix_length: u32 },
    Prefix { field: String, prefix: String },
    Wildcard { field: String, pattern: String },
    Regexp { field: String, pattern: String },
    Range { field: String, min: Option<Bound>, max: Option<Bound> },
    MatchAll,
    
    // Compound queries
    Bool { must: Vec<Query>, should: Vec<Query>, must_not: Vec<Query>, filter: Vec<Query>, min_should_match: u32 },
    
    // Specialized
    Nested { path: String, query: Box<Query> },
    FunctionScore { query: Box<Query>, functions: Vec<ScoreFunction> },
    Knn { field: String, vector: Vec<f32>, k: usize, num_candidates: usize, filter: Option<Box<Query>> },
}

struct QueryOptimizer;

impl QueryOptimizer {
    fn optimize(&self, query: Query) -> Query {
        match query {
            // Flatten nested booleans
            Query::Bool { must, should, must_not, filter, min_should_match } => {
                let must = self.flatten_bool_clauses(must, BoolClause::Must);
                let should = self.flatten_bool_clauses(should, BoolClause::Should);
                
                // Move non-scoring must clauses to filter (enables caching)
                let (scoring_must, cacheable_filter) = self.extract_cacheable(must);
                let combined_filter = [filter, cacheable_filter].concat();
                
                Query::Bool {
                    must: scoring_must,
                    should,
                    must_not,
                    filter: combined_filter,
                    min_should_match,
                }
            }
            
            // Convert single-term match to term query
            Query::Term { .. } => query,
            
            other => other,
        }
    }
}
```

### 5.2 Query Execution

```rust
struct QueryExecutor {
    searcher: Arc<IndexSearcher>,
    query_cache: Arc<QueryCache>,
}

impl QueryExecutor {
    fn search(&self, query: &Query, size: usize) -> SearchResults {
        // 1. Rewrite query (expand fuzzy/wildcard/prefix to term disjunctions)
        let rewritten = self.rewrite(query);
        
        // 2. Create Weight (per-segment scoring context)
        let weight = self.create_weight(&rewritten);
        
        // 3. Search each segment
        let mut top_docs = TopDocsCollector::new(size);
        
        for (seg_ord, reader) in self.searcher.segment_readers.iter().enumerate() {
            // Check query cache for filter clauses
            let cached_filter = self.query_cache.get(&rewritten, seg_ord);
            
            // Create per-segment scorer
            let scorer = weight.scorer(reader, cached_filter)?;
            
            // Collect top documents
            scorer.score_all(&mut top_docs, reader.live_docs());
        }
        
        // 4. Build results with highlights, aggregations, etc.
        self.build_results(top_docs)
    }
}

/// Weight: query bound to a specific searcher (carries collection-level stats)
trait Weight {
    fn scorer(&self, reader: &SegmentReader, filter: Option<&DocIdSet>) -> Option<Box<dyn Scorer>>;
}

/// Scorer: iterates matching documents in a segment, producing scores
trait Scorer {
    /// Advance to next matching document
    fn next_doc(&mut self) -> Option<u32>;
    /// Advance to first doc >= target
    fn advance(&mut self, target: u32) -> Option<u32>;
    /// Score current document
    fn score(&self) -> f32;
    /// Score all documents, collecting into collector
    fn score_all(&mut self, collector: &mut dyn Collector, live_docs: Option<&LiveDocs>);
}
```

### 5.3 Boolean Query Execution

```rust
struct BooleanScorer {
    must_scorers: Vec<Box<dyn Scorer>>,
    should_scorers: Vec<Box<dyn Scorer>>,
    must_not_set: Option<DocIdSet>,  // pre-computed bitset
    filter_set: Option<DocIdSet>,    // pre-computed bitset (cached)
    min_should_match: u32,
}

impl Scorer for BooleanScorer {
    fn score_all(&mut self, collector: &mut dyn Collector, live_docs: Option<&LiveDocs>) {
        if self.must_scorers.is_empty() && self.min_should_match <= 1 {
            // Disjunction: use block-max WAND for top-k optimization
            self.score_disjunction_wand(collector, live_docs);
        } else {
            // Conjunction: use leader-driven intersection
            self.score_conjunction(collector, live_docs);
        }
    }
    
    fn score_conjunction(&mut self, collector: &mut dyn Collector, live_docs: Option<&LiveDocs>) {
        // Sort must_scorers by estimated cost (ascending)
        self.must_scorers.sort_by_key(|s| s.cost());
        
        let lead = &mut self.must_scorers[0];
        
        'outer: while let Some(doc) = lead.next_doc() {
            // Check live docs
            if let Some(ld) = live_docs {
                if !ld.is_live(doc) { continue; }
            }
            
            // Check must_not
            if let Some(ref exclude) = self.must_not_set {
                if exclude.contains(doc) { continue; }
            }
            
            // Check filter
            if let Some(ref filter) = self.filter_set {
                if !filter.contains(doc) { continue; }
            }
            
            // Verify all other must scorers match this doc
            for other in &mut self.must_scorers[1..] {
                if other.advance(doc) != Some(doc) {
                    continue 'outer;
                }
            }
            
            // Count matching should clauses
            let mut should_count = 0u32;
            let mut score = 0.0f32;
            
            // Score must clauses
            score += lead.score();
            for s in &self.must_scorers[1..] {
                score += s.score();
            }
            
            // Score matching should clauses
            for s in &mut self.should_scorers {
                if s.advance(doc) == Some(doc) {
                    score += s.score();
                    should_count += 1;
                }
            }
            
            if should_count >= self.min_should_match {
                collector.collect(doc, score);
            }
        }
    }
}
```

### 5.4 Fuzzy Search (Levenshtein Automaton)

```rust
struct FuzzyQuery {
    field: String,
    term: String,
    max_edits: u8,      // 0, 1, or 2
    prefix_length: u32,  // exact prefix match before fuzzy kicks in
    max_expansions: u32, // limit number of matching terms
}

impl FuzzyQuery {
    fn rewrite(&self, reader: &SegmentReader) -> Query {
        // 1. Build Levenshtein automaton for the term
        let automaton = LevenshteinAutomaton::new(&self.term, self.max_edits);
        
        // 2. Intersect automaton with the term dictionary (FST)
        let matching_terms = reader
            .term_dictionary(&self.field)
            .intersect(&automaton, self.prefix_length, self.max_expansions);
        
        // 3. Build disjunction of matching terms, weighted by edit distance
        let mut term_queries = Vec::new();
        for (term, edit_distance) in matching_terms {
            let boost = 1.0 - (edit_distance as f32 / self.max_edits as f32);
            term_queries.push(Query::Term {
                field: self.field.clone(),
                term: String::from_utf8(term).unwrap(),
            });
        }
        
        Query::Bool {
            should: term_queries,
            must: vec![],
            must_not: vec![],
            filter: vec![],
            min_should_match: 1,
        }
    }
}

struct LevenshteinAutomaton {
    /// Parametric states (Schulz & Mihov construction)
    /// Pre-computed for edit distances 1 and 2
    states: Vec<AutomatonState>,
}

impl LevenshteinAutomaton {
    fn new(term: &str, max_edits: u8) -> Self {
        // Use pre-computed parametric descriptions for efficiency
        // Edit distance 1: ~70 parametric states
        // Edit distance 2: ~2000 parametric states
        // Runtime: O(term_length) to match each candidate term
        todo!()
    }
}
```

### 5.5 Phrase Query Execution

```rust
struct PhraseScorer {
    /// Per-term postings readers with position data
    postings_readers: Vec<PostingsReaderWithPositions>,
    /// Maximum word distance between terms (0 = exact phrase)
    slop: u32,
}

impl PhraseScorer {
    fn check_phrase_match(&self, doc_id: u32) -> Option<f32> {
        // 1. Load positions for each term in this document
        let mut position_lists: Vec<Vec<u32>> = Vec::new();
        for reader in &self.postings_readers {
            position_lists.push(reader.positions(doc_id));
        }
        
        // 2. Check for phrase match with slop
        if self.slop == 0 {
            self.exact_phrase_check(&position_lists)
        } else {
            self.sloppy_phrase_check(&position_lists, self.slop)
        }
    }
    
    fn exact_phrase_check(&self, positions: &[Vec<u32>]) -> Option<f32> {
        // For each position of term[0], check if term[1] is at pos+1,
        // term[2] at pos+2, etc.
        let mut freq = 0u32;
        for &start_pos in &positions[0] {
            let mut matched = true;
            for (i, term_positions) in positions[1..].iter().enumerate() {
                let expected = start_pos + (i + 1) as u32;
                if !term_positions.contains(&expected) {
                    matched = false;
                    break;
                }
            }
            if matched { freq += 1; }
        }
        if freq > 0 { Some(freq as f32) } else { None }
    }
    
    fn sloppy_phrase_check(&self, positions: &[Vec<u32>], slop: u32) -> Option<f32> {
        // Allow up to `slop` total position moves to form the phrase
        // Uses minimum-interval algorithm for efficiency
        todo!()
    }
}
```

---

## 6. Scoring Pipeline

### 6.1 BM25 Implementation

```rust
struct BM25Similarity {
    k1: f32,  // default: 1.2
    b: f32,   // default: 0.75
}

struct BM25Scorer {
    /// Precomputed IDF for each query term
    idf: f32,
    /// Average document length for this field
    avg_dl: f32,
    /// k1 parameter
    k1: f32,
    /// b parameter  
    b: f32,
    /// Precomputed: k1 * (1 - b)
    cache_k1_times_1_minus_b: f32,
    /// Precomputed: k1 * b / avg_dl
    cache_k1_times_b_div_avgdl: f32,
}

impl BM25Scorer {
    fn new(similarity: &BM25Similarity, collection_stats: &CollectionStatistics, term_stats: &TermStatistics) -> Self {
        let n = collection_stats.doc_count as f32;
        let df = term_stats.doc_freq as f32;
        
        // IDF: ln(1 + (N - df + 0.5) / (df + 0.5))
        let idf = ((n - df + 0.5) / (df + 0.5) + 1.0).ln();
        
        let avg_dl = collection_stats.sum_total_term_freq as f32 / n;
        
        BM25Scorer {
            idf,
            avg_dl,
            k1: similarity.k1,
            b: similarity.b,
            cache_k1_times_1_minus_b: similarity.k1 * (1.0 - similarity.b),
            cache_k1_times_b_div_avgdl: similarity.k1 * similarity.b / avg_dl,
        }
    }
    
    fn score(&self, freq: f32, doc_length: u32) -> f32 {
        let tf_norm = freq / (freq + self.cache_k1_times_1_minus_b + self.cache_k1_times_b_div_avgdl * doc_length as f32);
        self.idf * tf_norm * (self.k1 + 1.0)
    }
}
```

### 6.2 Multi-Field Scoring

```rust
enum MultiMatchType {
    /// Score = max(field_scores) + tie_breaker * sum(other_field_scores)
    BestFields { tie_breaker: f32 },
    /// Score = sum(field_scores)
    MostFields,
    /// Treat all fields as one combined field
    CrossFields,
}

struct MultiMatchScorer {
    field_scorers: Vec<(String, f32, Box<dyn Scorer>)>,  // (field, boost, scorer)
    match_type: MultiMatchType,
}

impl MultiMatchScorer {
    fn score_document(&self, doc_id: u32) -> f32 {
        let field_scores: Vec<f32> = self.field_scorers.iter()
            .filter_map(|(_, boost, scorer)| {
                scorer.score_for(doc_id).map(|s| s * boost)
            })
            .collect();
        
        match &self.match_type {
            MultiMatchType::BestFields { tie_breaker } => {
                let max = field_scores.iter().cloned().fold(0.0f32, f32::max);
                let rest_sum: f32 = field_scores.iter().sum::<f32>() - max;
                max + tie_breaker * rest_sum
            }
            MultiMatchType::MostFields => {
                field_scores.iter().sum()
            }
            MultiMatchType::CrossFields => {
                // Blend field-level statistics, score as if one field
                todo!()
            }
        }
    }
}
```

### 6.3 Function Score Pipeline

```rust
enum ScoreFunction {
    FieldValueFactor {
        field: String,
        factor: f32,
        modifier: Modifier, // none, log, log1p, log2p, ln, ln1p, ln2p, square, sqrt, reciprocal
        missing: f32,
    },
    DecayFunction {
        field: String,
        function_type: DecayType, // gauss, exp, linear
        origin: Value,
        scale: Value,
        offset: Value,
        decay: f32,
    },
    ScriptScore {
        script: CompiledScript,
    },
    Weight {
        weight: f32,
    },
    RandomScore {
        seed: u64,
        field: String,
    },
}

enum ScoreMode {
    Multiply, // default
    Sum,
    Avg,
    First,
    Max,
    Min,
}

enum BoostMode {
    Multiply, // default: query_score * function_score
    Replace,  // function_score only
    Sum,
    Avg,
    Max,
    Min,
}

fn compute_function_score(
    query_score: f32,
    doc_id: u32,
    functions: &[ScoreFunction],
    score_mode: &ScoreMode,
    boost_mode: &BoostMode,
) -> f32 {
    let func_scores: Vec<f32> = functions.iter()
        .map(|f| evaluate_function(f, doc_id))
        .collect();
    
    let combined = match score_mode {
        ScoreMode::Multiply => func_scores.iter().product(),
        ScoreMode::Sum => func_scores.iter().sum(),
        ScoreMode::Avg => func_scores.iter().sum::<f32>() / func_scores.len() as f32,
        ScoreMode::Max => func_scores.iter().cloned().fold(f32::MIN, f32::max),
        ScoreMode::Min => func_scores.iter().cloned().fold(f32::MAX, f32::min),
        ScoreMode::First => func_scores.first().copied().unwrap_or(1.0),
    };
    
    match boost_mode {
        BoostMode::Multiply => query_score * combined,
        BoostMode::Replace => combined,
        BoostMode::Sum => query_score + combined,
        BoostMode::Avg => (query_score + combined) / 2.0,
        BoostMode::Max => query_score.max(combined),
        BoostMode::Min => query_score.min(combined),
    }
}
```

---

## 7. Aggregation Engine

### 7.1 Aggregation Execution Flow

```
Search Request with Aggregations
    │
    ├─── Query Phase (collect matching doc IDs)
    │         │
    │         ▼
    │    [DocID Bitset] (matching documents)
    │
    └─── Aggregation Phase
              │
              ▼
         For each segment:
         ┌─────────────────────────────────┐
         │  1. Load doc values for fields   │ ← column-oriented, sequential I/O
         │  2. Iterate matching doc IDs     │
         │  3. For each doc:                │
         │     - Read field values           │
         │     - Route to bucket(s)          │
         │     - Update metric accumulators  │
         │  4. Return partial aggregation    │
         └─────────────────────────────────┘
              │
              ▼
         Merge partial results across segments
              │
              ▼
         Execute pipeline aggregations (derivative, moving_avg, etc.)
              │
              ▼
         Return final aggregation result
```

### 7.2 Terms Aggregation (Faceting)

```rust
struct TermsAggregator {
    field: String,
    size: usize,
    min_doc_count: u64,
    /// Per-bucket counters
    buckets: HashMap<OrdinalOrValue, BucketAccumulator>,
    /// Shard-level oversampling for accuracy
    shard_size: usize,  // default: size * 1.5 + 10
}

struct BucketAccumulator {
    doc_count: u64,
    sub_aggregations: Vec<Box<dyn Aggregator>>,
}

impl TermsAggregator {
    fn collect(&mut self, doc_id: u32, doc_values: &DocValues) {
        // Read ordinal(s) for this document
        let ordinals = doc_values.get_sorted_set_ordinals(doc_id);
        
        for ordinal in ordinals {
            let bucket = self.buckets
                .entry(OrdinalOrValue::Ordinal(ordinal))
                .or_insert_with(|| BucketAccumulator::new(&self.sub_agg_factories));
            
            bucket.doc_count += 1;
            
            // Collect into sub-aggregations
            for sub_agg in &mut bucket.sub_aggregations {
                sub_agg.collect(doc_id, doc_values);
            }
        }
    }
    
    fn finalize(&mut self) -> TermsAggResult {
        // Sort buckets by doc_count (or custom order)
        let mut sorted: Vec<_> = self.buckets.drain()
            .filter(|(_, b)| b.doc_count >= self.min_doc_count)
            .collect();
        sorted.sort_by(|a, b| b.1.doc_count.cmp(&a.1.doc_count));
        sorted.truncate(self.size);
        
        // Resolve ordinals to actual term values
        TermsAggResult {
            buckets: sorted.into_iter().map(|(ord, acc)| {
                TermsBucket {
                    key: self.resolve_ordinal(ord),
                    doc_count: acc.doc_count,
                    sub_results: acc.sub_aggregations.into_iter()
                        .map(|a| a.finalize())
                        .collect(),
                }
            }).collect(),
        }
    }
}
```

### 7.3 Cardinality Aggregation (HyperLogLog++)

```rust
struct HyperLogLogPlusPlus {
    /// Precision parameter (4-18, default: 14 → ~16K registers)
    precision: u8,
    /// Registers array
    registers: Vec<u8>,
    /// Number of registers: 2^precision
    num_registers: usize,
}

impl HyperLogLogPlusPlus {
    fn add(&mut self, value: u64) {
        let hash = murmur3_hash(value);
        let register_index = (hash >> (64 - self.precision)) as usize;
        let remaining = (hash << self.precision) | (1u64 << (self.precision - 1));
        let leading_zeros = remaining.leading_zeros() as u8 + 1;
        
        self.registers[register_index] = self.registers[register_index].max(leading_zeros);
    }
    
    fn cardinality(&self) -> u64 {
        let m = self.num_registers as f64;
        let sum: f64 = self.registers.iter()
            .map(|&r| 2.0f64.powi(-(r as i32)))
            .sum();
        
        let raw_estimate = ALPHA_M * m * m / sum;
        
        // Apply bias correction
        if raw_estimate <= 2.5 * m {
            // Small range correction
            let zeros = self.registers.iter().filter(|&&r| r == 0).count() as f64;
            if zeros > 0.0 {
                (m * (m / zeros).ln()) as u64
            } else {
                raw_estimate as u64
            }
        } else {
            raw_estimate as u64
        }
    }
    
    /// Merge with another HLL++ (for distributed aggregation)
    fn merge(&mut self, other: &HyperLogLogPlusPlus) {
        for i in 0..self.num_registers {
            self.registers[i] = self.registers[i].max(other.registers[i]);
        }
    }
}
```

### 7.4 Percentiles Aggregation (t-digest)

```rust
struct TDigest {
    centroids: Vec<Centroid>,
    total_weight: f64,
    compression: f64,  // default: 100
    max_centroids: usize,
}

struct Centroid {
    mean: f64,
    weight: f64,
}

impl TDigest {
    fn add(&mut self, value: f64) {
        self.centroids.push(Centroid { mean: value, weight: 1.0 });
        self.total_weight += 1.0;
        
        if self.centroids.len() > self.max_centroids * 2 {
            self.compress();
        }
    }
    
    fn quantile(&self, q: f64) -> f64 {
        let target_weight = q * self.total_weight;
        let mut cumulative = 0.0;
        
        for (i, centroid) in self.centroids.iter().enumerate() {
            let next_cumulative = cumulative + centroid.weight;
            if next_cumulative >= target_weight {
                // Interpolate between centroids
                if i == 0 || i == self.centroids.len() - 1 {
                    return centroid.mean;
                }
                let fraction = (target_weight - cumulative) / centroid.weight;
                let prev = &self.centroids[i - 1];
                return prev.mean + fraction * (centroid.mean - prev.mean);
            }
            cumulative = next_cumulative;
        }
        
        self.centroids.last().map(|c| c.mean).unwrap_or(0.0)
    }
    
    /// Merge for distributed aggregation
    fn merge(&mut self, other: &TDigest) {
        self.centroids.extend(other.centroids.iter().cloned());
        self.total_weight += other.total_weight;
        self.compress();
    }
}
```

### 7.5 Distributed Aggregation (Scatter-Gather)

```
Distributed Aggregation Flow:

  Coordinating Node
  ┌─────────────────────────────────────────────┐
  │ 1. Parse aggregation request                │
  │ 2. Fan out to all shards                    │
  │                                             │
  │    ┌─── Shard 0 ────┐  ┌─── Shard 1 ────┐ │
  │    │ Local agg       │  │ Local agg       │ │
  │    │ (shard_size     │  │ (shard_size     │ │
  │    │  buckets)       │  │  buckets)       │ │
  │    └────────┬────────┘  └────────┬────────┘ │
  │             │                    │           │
  │             ▼                    ▼           │
  │ 3. Merge partial aggregations:              │
  │    - Terms: merge bucket counts,            │
  │      take global top-N                      │
  │    - Stats: combine min/max/sum/count       │
  │    - Cardinality: merge HLL++ registers     │
  │    - Percentiles: merge t-digests           │
  │                                             │
  │ 4. Execute pipeline aggregations            │
  │    (derivative, moving_avg, bucket_selector)│
  │    These run ONLY on coordinator node       │
  │                                             │
  │ 5. Return final result                      │
  └─────────────────────────────────────────────┘

Accuracy considerations for terms aggregation:
  - Each shard returns shard_size (> requested size) buckets
  - Coordinating node merges, but rare terms on few shards may be missed
  - Higher shard_size = better accuracy but more network/memory
  - sum_other_doc_count indicates potential missed buckets
```

---

## 8. Distributed Architecture

### 8.1 Cluster Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLUSTER STATE                               │
│  (Master node manages; replicated to all nodes)                  │
│  - Index metadata (mappings, settings, aliases)                  │
│  - Shard allocation table (which shards on which nodes)          │
│  - Node membership                                               │
│  - Persistent cluster settings                                   │
└─────────────────────────────────────────────────────────────────┘

Node Types:
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Master Node