# Vector Database Unit Tests Specification

## Overview
This document defines comprehensive unit test requirements for vector database implementations. Every test MUST pass for the implementation to be considered production-ready for semantic search, RAG pipelines, and recommendation systems.

## Test Categories

### 1. Vector Similarity Search Tests

#### 1.1 Basic Distance Metric Tests
**Test: `test_cosine_similarity_accuracy`**
- **Purpose**: Verify cosine similarity calculation accuracy
- **Setup**: Known test vectors with pre-computed expected distances
- **Test Data**: 
  ```
  Vector A = [1.0, 0.0, 0.0]
  Vector B = [0.0, 1.0, 0.0]  
  Expected cosine distance = 1.0 (orthogonal)
  
  Vector C = [1.0, 1.0, 0.0] (normalized)
  Vector D = [1.0, 1.0, 0.0] (normalized)
  Expected cosine distance = 0.0 (identical)
  ```
- **Action**: Compute cosine distances using implementation
- **Assert**: Results match expected within 1e-6 tolerance
- **Cleanup**: None required

**Test: `test_euclidean_distance_accuracy`**  
- **Purpose**: Verify L2 Euclidean distance calculation
- **Test Data**:
  ```
  Vector A = [0.0, 0.0]
  Vector B = [3.0, 4.0]
  Expected L2 distance = 5.0
  
  Vector C = [1.0, 2.0, 3.0]  
  Vector D = [4.0, 6.0, 8.0]
  Expected L2 distance = sqrt((4-1)² + (6-2)² + (8-3)²) = sqrt(50) ≈ 7.071
  ```
- **Assert**: L2 distances accurate within 1e-6 tolerance

**Test: `test_dot_product_distance_accuracy`**
- **Purpose**: Verify dot product (inner product) distance
- **Test Data**:
  ```
  Vector A = [1.0, 2.0, 3.0]
  Vector B = [4.0, 5.0, 6.0]  
  Expected dot product = 32.0
  Expected distance = -32.0 (negative for min-distance convention)
  ```
- **Assert**: Dot product distances match expected values

#### 1.2 Vector Search Functionality
**Test: `test_basic_knn_search`**
- **Purpose**: Verify k-nearest-neighbor search returns correct results
- **Setup**: Insert 1000 random 128-dimensional vectors
- **Action**: 
  1. Insert one known query vector at position [1000, 0, 0, ..., 0]
  2. Insert one known similar vector at [999, 1, 0, ..., 0]  
  3. Search for k=5 nearest neighbors to query vector
- **Assert**: Known similar vector appears in top-5 results
- **Assert**: Returned distances are monotonically non-decreasing
- **Cleanup**: Clear collection

**Test: `test_search_recall_accuracy`**
- **Purpose**: Verify HNSW search achieves target recall vs brute force
- **Setup**: 
  - Insert 10,000 random 768-dimensional vectors
  - Configure HNSW with ef_construction=200, M=16
- **Action**: 
  1. Run 100 random search queries with ef_search=64, k=10
  2. For each query, compute brute-force ground truth
  3. Measure recall@10 = |HNSW_results ∩ BruteForce_results| / 10
- **Assert**: Mean recall@10 ≥ 95%
- **Assert**: Worst query recall@10 ≥ 80%
- **Cleanup**: Clear collection

**Test: `test_search_with_empty_collection`**
- **Purpose**: Verify graceful handling of empty collection search
- **Setup**: Empty collection
- **Action**: Search for k=10 nearest neighbors
- **Assert**: Returns empty result set, no errors thrown
- **Cleanup**: None required

**Test: `test_search_k_larger_than_collection`**
- **Purpose**: Verify search when k > total vectors in collection
- **Setup**: Insert 5 vectors
- **Action**: Search for k=10 nearest neighbors  
- **Assert**: Returns exactly 5 results (all vectors)
- **Assert**: Results ordered by distance
- **Cleanup**: Clear collection

#### 1.3 Batch Operations
**Test: `test_batch_upsert_consistency`**
- **Purpose**: Verify batch upsert maintains data consistency
- **Setup**: Prepare batch of 1000 vectors with known IDs
- **Action**: 
  1. Batch upsert all 1000 vectors
  2. Retrieve each vector by ID individually
- **Assert**: All 1000 vectors retrievable with correct data
- **Assert**: Vector dimensions and values match input exactly
- **Cleanup**: Clear collection

**Test: `test_batch_search_consistency`**
- **Purpose**: Verify batch search produces same results as individual searches
- **Setup**: Insert 5000 test vectors
- **Action**: 
  1. Run 20 individual searches, record results
  2. Run same 20 searches as single batch request
- **Assert**: Batch results exactly match individual search results
- **Cleanup**: Clear collection

### 2. HNSW Index Construction Tests

#### 2.1 Graph Building Tests
**Test: `test_hnsw_layer_assignment`**
- **Purpose**: Verify HNSW layer assignment follows exponential distribution
- **Setup**: Build HNSW with M=16, insert 10,000 vectors
- **Action**: Record layer assignment for each vector
- **Assert**: 
  - ~93.75% of vectors on layer 0 only (6.25% probability for layer ≥1)
  - ~6.25% of vectors on layer 1+
  - ~0.39% of vectors on layer 2+
  - Distribution matches expected exponential with mL = 1/ln(M)
- **Cleanup**: Clear collection

**Test: `test_hnsw_connectivity`**
- **Purpose**: Verify HNSW graph maintains required connectivity
- **Setup**: Build HNSW with M=16, insert 1000 vectors
- **Action**: Analyze graph structure
- **Assert**: 
  - Each node in layer 0 has ≤ 2×M = 32 connections
  - Each node in layer 1+ has ≤ M = 16 connections
  - Graph is connected (all nodes reachable from entry point)
  - No isolated nodes exist
- **Cleanup**: Clear collection

**Test: `test_hnsw_entry_point_selection`**
- **Purpose**: Verify HNSW entry point is correctly maintained
- **Setup**: Build empty HNSW index
- **Action**: 
  1. Insert vector with layer assignment = 3 (should become entry point)
  2. Insert vector with layer assignment = 2 (should not change entry point)
  3. Insert vector with layer assignment = 4 (should become new entry point)
- **Assert**: Entry point always points to vector on highest layer
- **Cleanup**: Clear collection

#### 2.2 Search Algorithm Tests
**Test: `test_hnsw_greedy_search_layers`**
- **Purpose**: Verify HNSW search correctly traverses layers
- **Setup**: Build HNSW with known structure, 1000 vectors
- **Action**: 
  1. Instrument search to track layer traversal
  2. Run search queries starting from different entry points
- **Assert**: 
  - Search starts at top layer of entry point
  - Search descends through layers sequentially  
  - Search explores ef_search candidates at layer 0
- **Cleanup**: Clear collection

**Test: `test_hnsw_ef_parameter_impact`**
- **Purpose**: Verify ef_search parameter affects search accuracy
- **Setup**: Build HNSW with 5000 vectors, compute ground truth
- **Action**: 
  1. Search same queries with ef_search = [16, 64, 256]
  2. Measure recall@10 for each ef value
- **Assert**: 
  - Higher ef_search → higher recall
  - ef_search=256 achieves >99% recall
  - ef_search=16 achieves >85% recall
- **Cleanup**: Clear collection

#### 2.3 Index Persistence Tests
**Test: `test_hnsw_serialization_roundtrip`**
- **Purpose**: Verify HNSW index can be saved and loaded without data loss
- **Setup**: Build HNSW with 1000 vectors, run test queries
- **Action**: 
  1. Record search results for 20 test queries
  2. Serialize HNSW index to disk
  3. Load index from disk
  4. Run same 20 queries on loaded index
- **Assert**: 
  - Loaded index produces identical search results
  - All graph connectivity preserved
  - Entry point correctly restored
- **Cleanup**: Delete serialized files, clear collection

### 3. Payload Filtering Tests

#### 3.1 Metadata Index Tests
**Test: `test_keyword_filter_accuracy`**
- **Purpose**: Verify keyword filtering returns correct point subset
- **Setup**: 
  - Insert 1000 vectors with payload: {"category": "A|B|C", "active": true/false}
  - 333 vectors with category="A", 333 with "B", 334 with "C"
- **Action**: 
  1. Filter by category="A" 
  2. Filter by active=true
  3. Filter by category="B" AND active=true
- **Assert**: 
  - category="A" returns exactly 333 results
  - Boolean filters work correctly
  - Combined filters return intersection
- **Cleanup**: Clear collection

**Test: `test_range_filter_accuracy`**
- **Purpose**: Verify numeric range filtering
- **Setup**: Insert 1000 vectors with payload: {"price": 1.0 to 1000.0, "rating": 1-5}
- **Action**: 
  1. Filter price > 500.0
  2. Filter rating >= 4  
  3. Filter price BETWEEN 100 AND 200
  4. Filter price > 500 AND rating >= 4
- **Assert**: 
  - Range filters return correct counts
  - Combined filters work as expected
  - Boundary conditions handled correctly
- **Cleanup**: Clear collection

**Test: `test_geo_filter_accuracy`** 
- **Purpose**: Verify geospatial filtering (if supported)
- **Setup**: Insert vectors with geo coordinates around known cities
- **Action**: 
  1. Filter by radius: 50km from San Francisco  
  2. Filter by bounding box: San Francisco Bay Area
- **Assert**: Points within geographic boundaries are returned
- **Cleanup**: Clear collection

#### 3.2 Filter + Vector Search Integration
**Test: `test_filtered_vector_search_accuracy`**
- **Purpose**: Verify filtering integrates correctly with vector search
- **Setup**: 
  - Insert 10,000 vectors with categories A (30%), B (50%), C (20%)
  - Ensure each category has similar vectors clustered together
- **Action**: 
  1. Search without filter, record top-10 results
  2. Search with filter category="A", record top-10 results  
  3. Search with filter category="B", record top-10 results
- **Assert**: 
  - Filtered searches only return vectors matching filter
  - Results still ordered by vector similarity
  - Search quality (recall) not significantly degraded
- **Cleanup**: Clear collection

**Test: `test_filter_query_planning`**
- **Purpose**: Verify query planner optimizes filter execution order
- **Setup**: 
  - Insert 100,000 vectors 
  - 1% have rare_field="rare_value" (very selective)
  - 90% have common_field="common_value" (low selectivity)
- **Action**: 
  1. Search with filter: rare_field="rare_value" (expect filter-first strategy)
  2. Search with filter: common_field="common_value" (expect vector-first strategy)
- **Assert**: 
  - Selective filters execute efficiently (< 50ms)
  - Non-selective filters don't severely impact performance (< 200ms vs baseline)
- **Cleanup**: Clear collection

### 4. Quantization Tests

#### 4.1 Scalar Quantization Tests
**Test: `test_scalar_quantization_compression`**
- **Purpose**: Verify scalar quantization achieves target compression ratio
- **Setup**: 1000 random float32 vectors, 768 dimensions
- **Action**: 
  1. Train scalar quantizer on data
  2. Encode all vectors to int8
  3. Measure storage sizes
- **Assert**: 
  - Quantized storage = original_size / 4 (±5%)
  - All values in [0, 255] range
  - Min/max values preserved per dimension
- **Cleanup**: Clear collection

**Test: `test_scalar_quantization_accuracy`**
- **Purpose**: Verify scalar quantization preserves search quality
- **Setup**: 
  - Insert 5000 vectors, build HNSW on full precision
  - Compute ground truth for 100 test queries
- **Action**: 
  1. Train scalar quantizer, rebuild index with quantized vectors
  2. Run same 100 queries on quantized index
  3. Measure recall@10 vs ground truth
- **Assert**: 
  - Recall@10 ≥ 95% for scalar quantization
  - Search latency not significantly worse (< 1.5× baseline)
- **Cleanup**: Clear collection

#### 4.2 Product Quantization Tests
**Test: `test_product_quantization_training`**
- **Purpose**: Verify product quantizer training converges correctly
- **Setup**: 5000 training vectors, 768 dimensions
- **Action**: 
  1. Train PQ with 64 subquantizers, 256 centroids each
  2. Check codebook convergence over iterations
- **Assert**: 
  - Codebooks have expected shape: [64, 256, 12] (768/64=12 sub-dim)
  - Training converges (reconstruction error decreases)
  - All centroids have valid values (no NaN/infinity)
- **Cleanup**: Clear quantizer

**Test: `test_product_quantization_reconstruction`**
- **Purpose**: Verify PQ encoding/decoding roundtrip
- **Setup**: Trained PQ quantizer, 1000 test vectors
- **Action**: 
  1. Encode vectors to PQ codes
  2. Decode PQ codes back to approximate vectors
  3. Measure reconstruction error vs original
- **Assert**: 
  - Reconstruction MSE < 0.1 (acceptable quality loss)
  - Codes use expected storage: 64 bytes per vector
- **Cleanup**: Clear quantizer

#### 4.3 Binary Quantization Tests
**Test: `test_binary_quantization_encoding`**
- **Purpose**: Verify binary quantization correctness
- **Setup**: Known vectors with clear positive/negative values
- **Action**: 
  1. Train binary quantizer (compute thresholds)
  2. Encode test vectors to binary codes
  3. Verify bit patterns match expected
- **Assert**: 
  - Values above threshold → bit = 1
  - Values below threshold → bit = 0
  - Storage = dimension / 8 bytes per vector
- **Cleanup**: Clear quantizer

**Test: `test_binary_quantization_distance`**
- **Purpose**: Verify binary Hamming distance computation
- **Setup**: Known binary vectors with computed Hamming distances
- **Test Data**: 
  ```
  Vector A = [1,0,1,1,0,0,1,0] (binary)
  Vector B = [1,1,1,0,0,0,1,1] (binary)
  Expected Hamming distance = 3 (3 bits differ)
  ```
- **Assert**: Hamming distance calculations match expected
- **Cleanup**: Clear quantizer

#### 4.4 Quantization Rescoring Tests
**Test: `test_quantized_search_with_rescoring`**
- **Purpose**: Verify rescoring improves quantized search accuracy
- **Setup**: 
  - 10,000 vectors with ground truth
  - PQ quantizer with aggressive compression
- **Action**: 
  1. Search with PQ distance only (no rescoring)
  2. Search with PQ + full-precision rescoring
  3. Measure recall@10 for both approaches
- **Assert**: 
  - Rescoring significantly improves recall (+10% typical)
  - Rescoring latency acceptable (< 3× PQ-only)
- **Cleanup**: Clear collection

### 5. WAL and Durability Tests

#### 5.1 Write-Ahead Log Tests
**Test: `test_wal_record_persistence`**
- **Purpose**: Verify WAL correctly persists write operations
- **Setup**: Fresh database with empty WAL
- **Action**: 
  1. Insert 100 vectors
  2. Update 50 vectors
  3. Delete 25 vectors
  4. Inspect WAL files on disk
- **Assert**: 
  - All operations recorded in WAL with correct sequence
  - WAL records are durable (survive process restart)
  - Record checksums validate correctly
- **Cleanup**: Clear WAL files

**Test: `test_wal_crash_recovery`**
- **Purpose**: Verify crash recovery replays WAL correctly
- **Setup**: Database with some flushed data
- **Action**: 
  1. Insert 200 vectors (some flushed, some in WAL only)
  2. Simulate crash (force restart without clean shutdown)
  3. Restart database, trigger WAL replay
  4. Verify all vectors are accessible
- **Assert**: 
  - All vectors present after recovery
  - Vector data integrity maintained
  - Collection state fully restored
- **Cleanup**: Clear database

#### 5.2 WAL Compaction Tests
**Test: `test_wal_segment_rotation`**
- **Purpose**: Verify WAL segments rotate at configured thresholds
- **Setup**: Configure WAL segment size = 1MB
- **Action**: 
  1. Insert vectors until WAL exceeds 1MB
  2. Monitor WAL file creation
- **Assert**: 
  - New WAL segment created when threshold exceeded
  - Old segments preserved until flush
  - No data loss during rotation
- **Cleanup**: Clear WAL files

**Test: `test_wal_compaction_after_flush`**
- **Purpose**: Verify WAL segments are cleaned up after data flush
- **Setup**: WAL with multiple segments
- **Action**: 
  1. Force memtable flush to disk
  2. Trigger WAL compaction
- **Assert**: 
  - Flushed WAL segments are deleted
  - Unflushed segments remain
  - Data consistency maintained
- **Cleanup**: Clear WAL files

### 6. Segment Management Tests

#### 6.1 Memtable Tests
**Test: `test_memtable_point_operations`**
- **Purpose**: Verify memtable handles basic point operations correctly
- **Setup**: Empty memtable
- **Action**: 
  1. Insert 100 points with known IDs and vectors
  2. Update 50 points with new vector data
  3. Delete 25 points
  4. Retrieve all points by ID
- **Assert**: 
  - Active points return correct data
  - Updated points return new vector data
  - Deleted points return not found
  - Point count tracking accurate
- **Cleanup**: Clear memtable

**Test: `test_memtable_search_correctness`**
- **Purpose**: Verify memtable search uses linear scan correctly
- **Setup**: Memtable with 1000 vectors
- **Action**: 
  1. Search for k=10 nearest neighbors
  2. Compare results with brute-force reference
- **Assert**: 
  - Memtable search results match brute-force exactly
  - Deleted points excluded from results
  - Results ordered by distance correctly
- **Cleanup**: Clear memtable

#### 6.2 Segment Flush Tests  
**Test: `test_segment_flush_triggers`**
- **Purpose**: Verify segment flush triggers work as configured
- **Setup**: Configure flush thresholds (point count, memory size, time)
- **Action**: 
  1. Insert vectors until point threshold reached
  2. Verify flush triggered automatically
  3. Wait for time threshold with small data
  4. Verify time-based flush triggered
- **Assert**: 
  - All flush triggers work correctly
  - Flushed segment is immutable
  - New memtable created for subsequent writes
- **Cleanup**: Clear segments

**Test: `test_segment_flush_atomicity`**
- **Purpose**: Verify segment flush is atomic (all-or-nothing)
- **Setup**: Memtable with 1000 vectors
- **Action**: 
  1. Start segment flush operation
  2. Simulate interruption during flush (if possible)
  3. Check data consistency
- **Assert**: 
  - Either flush completes fully or rolls back cleanly
  - No partial/corrupted segments created
  - Data remains accessible during flush
- **Cleanup**: Clear segments

#### 6.3 Segment Optimization Tests
**Test: `test_segment_hnsw_building`**
- **Purpose**: Verify HNSW index building on plain segments
- **Setup**: Plain segment with 10,000 vectors (no HNSW yet)
- **Action**: 
  1. Trigger HNSW index building
  2. Monitor optimization progress
  3. Compare search performance before/after
- **Assert**: 
  - HNSW index built successfully
  - Search latency improves significantly (10× or more)
  - Search accuracy maintained (recall ≥ 95%)
- **Cleanup**: Clear segments

**Test: `test_segment_merging`**
- **Purpose**: Verify small segment merging works correctly
- **Setup**: Multiple small segments (< merge threshold)
- **Action**: 
  1. Trigger segment merge operation
  2. Verify merged segment creation
  3. Check data availability during merge
- **Assert**: 
  - Small segments merged into larger segment
  - All data accessible after merge
  - Deleted points (tombstones) cleaned up
  - Search performance improved
- **Cleanup**: Clear segments

### 7. Distributed Consensus Tests (Cluster Mode)

#### 7.1 Raft Consensus Tests
**Test: `test_raft_leader_election`**
- **Purpose**: Verify Raft leader election works correctly
- **Setup**: 3-node cluster, all nodes initially followers
- **Action**: 
  1. Start all nodes simultaneously
  2. Monitor leader election process
  3. Verify single leader elected
- **Assert**: 
  - Exactly one leader elected within timeout (5 seconds)
  - All nodes agree on leader identity
  - Leader begins processing operations
- **Cleanup**: Stop cluster nodes

**Test: `test_raft_log_replication`**
- **Purpose**: Verify Raft log entries replicate correctly
- **Setup**: 3-node cluster with established leader
- **Action**: 
  1. Submit collection creation request to leader
  2. Monitor log replication to followers
  3. Verify all nodes apply the operation
- **Assert**: 
  - Log entry replicated to majority (≥2/3 nodes)
  - All nodes apply entry in correct order
  - Collection visible on all nodes
- **Cleanup**: Delete collection, stop cluster

**Test: `test_raft_leader_failover`**
- **Purpose**: Verify automatic failover when leader fails
- **Setup**: 3-node cluster with active leader
- **Action**: 
  1. Identify current leader node
  2. Stop leader node (simulate failure)
  3. Monitor follower behavior
- **Assert**: 
  - New leader elected within timeout (10 seconds)
  - Cluster continues processing operations
  - Failed node can rejoin and sync up
- **Cleanup**: Restart failed node, stop cluster

#### 7.2 Shard Management Tests
**Test: `test_shard_assignment_consistency`**
- **Purpose**: Verify consistent shard assignment across nodes
- **Setup**: 3-node cluster, create collection with 6 shards
- **Action**: 
  1. Insert 1000 vectors with known IDs
  2. Verify each vector routes to consistent shard
  3. Check shard distribution across nodes
- **Assert**: 
  - Same point ID always routes to same shard
  - Shards distributed evenly across nodes
  - Shard assignments persist across restarts
- **Cleanup**: Delete collection, stop cluster

**Test: `test_shard_rebalancing`**
- **Purpose**: Verify shard rebalancing when nodes added/removed
- **Setup**: 2-node cluster with collection
- **Action**: 
  1. Add 3rd node to cluster
  2. Trigger shard rebalancing
  3. Verify shards redistribute
- **Assert**: 
  - Shards move to balance load
  - Data remains available during rebalance
  - Search results consistent after rebalance
- **Cleanup**: Stop cluster nodes

#### 7.3 Replication Tests
**Test: `test_shard_replication`**
- **Purpose**: Verify data replication across shard replicas
- **Setup**: 3-node cluster, replication factor = 2
- **Action**: 
  1. Insert vectors into collection
  2. Verify data replicated to configured replicas
  3. Query from different replica nodes
- **Assert**: 
  - Data present on exact number of replicas
  - Replica data identical to primary
  - Reads work from any replica
- **Cleanup**: Delete collection, stop cluster

**Test: `test_replica_failover`**
- **Purpose**: Verify failover when shard replica fails
- **Setup**: 3-node cluster, replication factor = 2
- **Action**: 
  1. Identify primary and replica for a shard
  2. Stop node hosting primary replica
  3. Continue querying the shard
- **Assert**: 
  - Queries automatically route to remaining replica
  - Write operations continue (if quorum available)
  - Failed replica can resync when node returns
- **Cleanup**: Restart failed node, stop cluster

### 8. API Integration Tests

#### 8.1 REST API Tests
**Test: `test_rest_collection_lifecycle`**
- **Purpose**: Verify REST API collection management
- **Action**: 
  1. POST /collections to create collection
  2. GET /collections/{name} to verify creation
  3. PATCH /collections/{name} to update configuration
  4. DELETE /collections/{name} to delete
- **Assert**: 
  - All operations return expected HTTP status codes
  - Response payloads match OpenAPI specification
  - Error responses include descriptive messages
- **Cleanup**: Ensure collection deleted

**Test: `test_rest_vector_operations`**
- **Purpose**: Verify REST API vector operations
- **Action**: 
  1. PUT /collections/{name}/points to upsert vectors
  2. POST /collections/{name}/points/search to search
  3. GET /collections/{name}/points/{id} to retrieve
  4. POST /collections/{name}/points/delete to delete
- **Assert**: 
  - All CRUD operations work correctly
  - Batch operations handle arrays properly
  - Search results format matches specification
- **Cleanup**: Clear collection points

#### 8.2 gRPC API Tests
**Test: `test_grpc_performance_vs_rest`**
- **Purpose**: Verify gRPC API provides performance benefits
- **Setup**: Collection with 10,000 vectors
- **Action**: 
  1. Run 100 search requests via REST API, measure latency
  2. Run identical 100 searches via gRPC, measure latency
- **Assert**: 
  - gRPC latency < REST latency (at least 10% improvement)
  - gRPC and REST return identical results
  - gRPC handles concurrent requests correctly
- **Cleanup**: Clear collection

**Test: `test_grpc_streaming`**
- **Purpose**: Verify gRPC streaming operations work correctly
- **Setup**: Collection ready for streaming operations
- **Action**: 
  1. Use streaming upsert to insert 1000 vectors
  2. Use streaming search for batch queries
- **Assert**: 
  - Streaming operations complete successfully
  - Results match non-streaming equivalents
  - Memory usage remains bounded during streaming
- **Cleanup**: Clear collection

### 9. Error Handling and Edge Cases

#### 9.1 Data Validation Tests
**Test: `test_invalid_vector_dimensions`**
- **Purpose**: Verify handling of mismatched vector dimensions
- **Setup**: Collection configured for 768-dimensional vectors
- **Action**: 
  1. Attempt to insert 512-dimensional vector
  2. Attempt to insert 1024-dimensional vector
- **Assert**: 
  - Operations rejected with clear error messages
  - Collection state remains consistent
  - Valid vectors continue to work
- **Cleanup**: Clear collection

**Test: `test_invalid_payload_types`**
- **Purpose**: Verify payload validation
- **Action**: 
  1. Insert vector with extremely large payload (>10MB)
  2. Insert vector with unsupported payload types
  3. Insert vector with deeply nested payload (>50 levels)
- **Assert**: 
  - Invalid payloads rejected appropriately
  - Validation errors provide helpful messages
  - Valid payloads continue to work
- **Cleanup**: Clear collection

#### 9.2 Resource Limit Tests
**Test: `test_collection_size_limits`**
- **Purpose**: Verify behavior at configured collection limits
- **Setup**: Configure collection with max_vectors = 1000
- **Action**: 
  1. Insert exactly 1000 vectors
  2. Attempt to insert 1001st vector
- **Assert**: 
  - 1000th vector inserts successfully
  - 1001st vector rejected with appropriate error
  - Search/retrieval continue working on existing vectors
- **Cleanup**: Clear collection

**Test: `test_memory_pressure_handling`**
- **Purpose**: Verify graceful degradation under memory pressure
- **Setup**: Configure small memory limits
- **Action**: 
  1. Insert vectors until memory pressure detected
  2. Monitor system behavior under pressure
- **Assert**: 
  - System continues operating (doesn't crash)
  - New operations may be rejected/throttled gracefully
  - Existing data remains accessible
- **Cleanup**: Clear collections to reduce pressure

## Test Execution Requirements

### Test Environment
- **Isolation**: Each test runs in clean database state
- **Repeatability**: Tests produce identical results on multiple runs
- **Performance**: Full test suite completes in < 30 minutes
- **Resource cleanup**: All test data cleaned up automatically

### Test Data
- **Deterministic**: Use seeded random generators for reproducible vectors
- **Realistic**: Test with typical embedding dimensions (128, 384, 768, 1536)
- **Scale appropriate**: Small tests (1K vectors), medium (10K), large (100K+)

### Failure Reporting
- **Detailed diagnostics**: Include vector data, configuration, system state
- **Performance metrics**: Record latency, memory usage, accuracy measurements
- **Log capture**: Collect relevant log entries around failures

### Coverage Requirements
- **Functional**: All API endpoints and features tested
- **Error paths**: All error conditions and edge cases covered
- **Performance**: Basic performance characteristics validated
- **Integration**: Multi-component interactions tested

## Success Criteria
A vector database implementation passes unit tests if:
1. **100% test pass rate** on all applicable tests
2. **Accuracy targets met**: Recall@10 ≥ 95% for HNSW, quantization recall loss ≤ 10%
3. **No data corruption** detected in durability/crash recovery tests
4. **API compliance**: All REST/gRPC endpoints behave per specification
5. **Graceful error handling**: No crashes or data loss under error conditions
6. **Performance baseline**: Basic operations complete within expected time bounds

This comprehensive test suite ensures vector database implementations are production-ready for demanding semantic search, RAG, and recommendation workloads.