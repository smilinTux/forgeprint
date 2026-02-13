# Object Storage Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing a production-grade S3-compatible object storage system. It covers data durability through erasure coding, metadata management, consistent hashing for data placement, request routing, encryption pipelines, and the distributed systems patterns that underpin a reliable, performant storage platform.

## Architectural Foundations

### 1. System Architecture Overview

#### High-Level Component Diagram
```
                    ┌─────────────────────────────────┐
                    │        Load Balancer / DNS       │
                    └────────────────┬────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
    ┌─────────▼─────────┐ ┌─────────▼─────────┐ ┌─────────▼─────────┐
    │   API Gateway      │ │   API Gateway      │ │   API Gateway      │
    │   Node 1           │ │   Node 2           │ │   Node N           │
    │ ┌───────────────┐  │ │ ┌───────────────┐  │ │ ┌───────────────┐  │
    │ │ HTTP Router   │  │ │ │ HTTP Router   │  │ │ │ HTTP Router   │  │
    │ │ Auth Engine   │  │ │ │ Auth Engine   │  │ │ │ Auth Engine   │  │
    │ │ Policy Engine │  │ │ │ Policy Engine │  │ │ │ Policy Engine │  │
    │ └───────────────┘  │ │ └───────────────┘  │ │ └───────────────┘  │
    └─────────┬──────────┘ └─────────┬──────────┘ └─────────┬──────────┘
              │                      │                      │
    ┌─────────▼──────────────────────▼──────────────────────▼──────────┐
    │                     Internal RPC / gRPC Mesh                      │
    └─────────┬──────────────────────┬──────────────────────┬──────────┘
              │                      │                      │
    ┌─────────▼─────────┐ ┌─────────▼─────────┐ ┌─────────▼─────────┐
    │  Storage Node 1    │ │  Storage Node 2    │ │  Storage Node N    │
    │ ┌───────────────┐  │ │ ┌───────────────┐  │ │ ┌───────────────┐  │
    │ │ EC Engine     │  │ │ │ EC Engine     │  │ │ │ EC Engine     │  │
    │ │ Disk Manager  │  │ │ │ Disk Manager  │  │ │ │ Disk Manager  │  │
    │ │ Bitrot Scan   │  │ │ │ Bitrot Scan   │  │ │ │ Bitrot Scan   │  │
    │ │ Heal Worker   │  │ │ │ Heal Worker   │  │ │ │ Heal Worker   │  │
    │ └───────────────┘  │ │ └───────────────┘  │ │ └───────────────┘  │
    │ ┌──┐┌──┐┌──┐┌──┐  │ │ ┌──┐┌──┐┌──┐┌──┐  │ │ ┌──┐┌──┐┌──┐┌──┐  │
    │ │d1││d2││d3││d4│  │ │ │d1││d2││d3││d4│  │ │ │d1││d2││d3││d4│  │
    │ └──┘└──┘└──┘└──┘  │ │ └──┘└──┘└──┘└──┘  │ │ └──┘└──┘└──┘└──┘  │
    └────────────────────┘ └────────────────────┘ └────────────────────┘
```

#### Separation of Concerns
```
┌────────────────────────────────────────────────────────────────┐
│ API Layer: S3 protocol handling, auth, policy, routing         │
├────────────────────────────────────────────────────────────────┤
│ Metadata Layer: Bucket/object metadata, versioning, lifecycle  │
├────────────────────────────────────────────────────────────────┤
│ Data Layer: Erasure coding, encryption, shard placement        │
├────────────────────────────────────────────────────────────────┤
│ Storage Layer: Raw disk I/O, health monitoring, bitrot scan    │
└────────────────────────────────────────────────────────────────┘
```

### 2. Erasure Coding Deep Dive

#### Reed-Solomon Fundamentals
Erasure coding splits each object (or stripe) into `k` data shards and `m` parity shards, such that the original data can be reconstructed from any `k` of the `k+m` total shards. This provides fault tolerance for up to `m` simultaneous shard losses.

```
Original Data Block (e.g., 40 MB)
         │
         ▼
┌─────────────────────────────┐
│   Reed-Solomon Encoder       │
│   k=4 data, m=2 parity      │
└──┬──┬──┬──┬──┬──┬──────────┘
   │  │  │  │  │  │
   ▼  ▼  ▼  ▼  ▼  ▼
 ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐
 │D1││D2││D3││D4││P1││P2│    6 shards × 10 MB each
 └──┘└──┘└──┘└──┘└──┘└──┘
   │  │  │  │  │  │
   ▼  ▼  ▼  ▼  ▼  ▼
 Drive Drive Drive Drive Drive Drive
   1    2    3    4    5    6
```

**Storage Overhead**: For EC(k, m), overhead = (k+m)/k. EC(4,2) = 1.5x storage, vs 3.0x for 3-way replication.

#### Encoding Process
```go
// Reed-Solomon encoding pipeline
type ErasureCoder struct {
    dataShards   int        // k: number of data shards
    parityShards int        // m: number of parity shards
    shardSize    int64      // Size of each shard in bytes
    encoder      reedsolomon.Encoder
    bufferPool   *sync.Pool // Pre-allocated shard buffers
}

func (ec *ErasureCoder) Encode(data io.Reader, totalSize int64) ([][]byte, error) {
    // 1. Calculate shard size
    shardSize := ceilDiv(totalSize, int64(ec.dataShards))
    
    // 2. Allocate shard buffers from pool
    shards := make([][]byte, ec.dataShards + ec.parityShards)
    for i := range shards {
        buf := ec.bufferPool.Get().([]byte)
        if len(buf) < int(shardSize) {
            buf = make([]byte, shardSize)
        }
        shards[i] = buf[:shardSize]
    }
    
    // 3. Read data into data shards
    for i := 0; i < ec.dataShards; i++ {
        n, err := io.ReadFull(data, shards[i])
        if err == io.ErrUnexpectedEOF {
            // Last shard may be partial — zero-pad
            for j := n; j < int(shardSize); j++ {
                shards[i][j] = 0
            }
        } else if err != nil {
            return nil, fmt.Errorf("read data shard %d: %w", i, err)
        }
    }
    
    // 4. Compute parity shards (Galois Field arithmetic over GF(2^8))
    err := ec.encoder.Encode(shards)
    if err != nil {
        return nil, fmt.Errorf("reed-solomon encode: %w", err)
    }
    
    // 5. Compute per-shard checksums for bitrot detection
    checksums := make([][]byte, len(shards))
    for i, shard := range shards {
        h := highwayhash.New(checksumKey)
        h.Write(shard)
        checksums[i] = h.Sum(nil)
    }
    
    return shards, nil
}
```

#### Decoding and Reconstruction
```go
func (ec *ErasureCoder) Decode(shards [][]byte, shardAvailable []bool) (io.Reader, error) {
    // 1. Count available shards
    available := 0
    for _, ok := range shardAvailable {
        if ok {
            available++
        }
    }
    
    // Require at least k shards
    if available < ec.dataShards {
        return nil, ErrInsufficientShards{
            Available: available,
            Required:  ec.dataShards,
        }
    }
    
    // 2. Mark missing shards as nil for reconstruction
    for i, ok := range shardAvailable {
        if !ok {
            shards[i] = nil
        }
    }
    
    // 3. Reconstruct missing shards (if any missing)
    if available < ec.dataShards + ec.parityShards {
        err := ec.encoder.Reconstruct(shards)
        if err != nil {
            return nil, fmt.Errorf("reed-solomon reconstruct: %w", err)
        }
    }
    
    // 4. Verify reconstruction correctness
    ok, err := ec.encoder.Verify(shards)
    if err != nil || !ok {
        return nil, ErrReconstructionVerificationFailed
    }
    
    // 5. Return reader over data shards only (skip parity)
    return io.MultiReader(
        bytes.NewReader(shards[0]),
        bytes.NewReader(shards[1]),
        bytes.NewReader(shards[2]),
        bytes.NewReader(shards[3]),
    ), nil
}
```

#### Stripe Layout on Disk
```
Object: bucket/photos/sunset.jpg (150 MB)

Stripe 0 (0-39 MB):
  Drive 1: /data/disk1/bucket/photos/sunset.jpg/part.1 (D1, 10MB)
  Drive 2: /data/disk2/bucket/photos/sunset.jpg/part.1 (D2, 10MB)
  Drive 3: /data/disk3/bucket/photos/sunset.jpg/part.1 (D3, 10MB)
  Drive 4: /data/disk4/bucket/photos/sunset.jpg/part.1 (D4, 10MB)
  Drive 5: /data/disk5/bucket/photos/sunset.jpg/part.1 (P1, 10MB)
  Drive 6: /data/disk6/bucket/photos/sunset.jpg/part.1 (P2, 10MB)

Stripe 1 (40-79 MB):
  Drive 3: /data/disk3/bucket/photos/sunset.jpg/part.2 (D1, 10MB)  ← rotation
  Drive 4: /data/disk4/bucket/photos/sunset.jpg/part.2 (D2, 10MB)
  Drive 5: /data/disk5/bucket/photos/sunset.jpg/part.2 (D3, 10MB)
  Drive 6: /data/disk6/bucket/photos/sunset.jpg/part.2 (D4, 10MB)
  Drive 1: /data/disk1/bucket/photos/sunset.jpg/part.2 (P1, 10MB)
  Drive 2: /data/disk2/bucket/photos/sunset.jpg/part.2 (P2, 10MB)

  ... (stripe rotation distributes I/O load across drives)
```

**Shard Rotation**: Each stripe rotates the shard-to-drive mapping so that no single drive is always responsible for parity (which would create a write hotspot). The mapping is deterministic based on object hash + stripe index.

#### EC Scheme Selection Guide
```
| Scheme    | Drives | Tolerance | Overhead | Use Case                        |
|-----------|--------|-----------|----------|---------------------------------|
| EC:2+1    | 3      | 1 drive   | 1.50x    | Minimum viable, small clusters  |
| EC:2+2    | 4      | 2 drives  | 2.00x    | Small cluster, high durability  |
| EC:4+2    | 6      | 2 drives  | 1.50x    | Balanced (MinIO default)        |
| EC:4+4    | 8      | 4 drives  | 2.00x    | High durability, medium cluster |
| EC:8+4    | 12     | 4 drives  | 1.50x    | Large cluster, efficient        |
| EC:8+8    | 16     | 8 drives  | 2.00x    | Maximum durability              |
| EC:14+4   | 18     | 4 drives  | 1.29x    | Maximum storage efficiency      |
```

### 3. Consistent Hashing and Data Placement

#### Placement Algorithm Overview
The data placement system determines which drives/nodes store each shard of each object. The algorithm must be:
1. **Deterministic**: Same input always produces same placement
2. **Balanced**: Distribute data evenly across drives
3. **Stable**: Adding/removing drives causes minimal data movement
4. **Topology-aware**: Respect failure domain hierarchy (drive → node → rack → DC)

#### Hash-Based Placement (MinIO Model)
```go
// MinIO-style placement: hash object key to determine drive set
type PlacementEngine struct {
    drives     []DriveInfo
    setSize    int           // Number of drives per erasure set (k+m)
    sets       [][]DriveInfo // Pre-computed erasure sets
    hashFunc   func([]byte) uint64
}

func (pe *PlacementEngine) GetPlacement(bucket, key string) ErasureSet {
    // 1. Hash the object key
    h := pe.hashFunc([]byte(bucket + "/" + key))
    
    // 2. Select erasure set
    setIndex := h % uint64(len(pe.sets))
    set := pe.sets[setIndex]
    
    // 3. Determine shard-to-drive mapping within the set
    // Rotate based on hash to distribute parity across drives
    rotation := int(h / uint64(len(pe.sets))) % len(set)
    mapping := make([]DriveInfo, len(set))
    for i := range set {
        mapping[i] = set[(i+rotation)%len(set)]
    }
    
    return ErasureSet{
        Drives:  mapping,
        DataN:   pe.dataShards,
        ParityN: pe.parityShards,
    }
}

// Set formation: group drives into erasure sets respecting topology
func FormErasureSets(drives []DriveInfo, setSize int) [][]DriveInfo {
    // Sort drives by: zone → node → drive path (for deterministic grouping)
    sort.Slice(drives, func(i, j int) bool {
        if drives[i].Zone != drives[j].Zone {
            return drives[i].Zone < drives[j].Zone
        }
        if drives[i].Node != drives[j].Node {
            return drives[i].Node < drives[j].Node
        }
        return drives[i].Path < drives[j].Path
    })
    
    // Distribute drives from different nodes into each set for fault tolerance
    sets := make([][]DriveInfo, 0)
    numSets := len(drives) / setSize
    
    for s := 0; s < numSets; s++ {
        set := make([]DriveInfo, setSize)
        for d := 0; d < setSize; d++ {
            // Interleave drives from different nodes
            idx := d*numSets + s
            set[d] = drives[idx]
        }
        sets = append(sets, set)
    }
    
    return sets
}
```

#### CRUSH-Style Placement (Ceph Model)
```go
// Topology-aware placement using CRUSH-like algorithm
type CRUSHPlacement struct {
    topology TopologyTree  // Root → DC → Rack → Node → Drive
    rules    []PlacementRule
}

type TopologyTree struct {
    Root *TopologyNode
}

type TopologyNode struct {
    ID       string
    Type     NodeType // Root, Datacenter, Rack, Host, Drive
    Weight   float64  // Proportional capacity
    Children []*TopologyNode
}

type PlacementRule struct {
    Steps []PlacementStep
}

type PlacementStep struct {
    Op       string // "take", "chooseleaf_firstn", "emit"
    Arg      int    // Number of items to choose
    ItemType NodeType // Type of item to choose (e.g., Host, Drive)
}

func (c *CRUSHPlacement) Select(pgID uint64, rule PlacementRule) []DriveInfo {
    var selected []*TopologyNode
    current := []*TopologyNode{c.topology.Root}
    
    for _, step := range rule.Steps {
        switch step.Op {
        case "take":
            current = []*TopologyNode{c.topology.Root}
            
        case "chooseleaf_firstn":
            // For each item in current, choose N distinct children
            // at the specified topology level
            for _, parent := range current {
                for r := 0; r < step.Arg; r++ {
                    // Straw2 bucket selection: weighted random
                    chosen := c.straw2Select(parent, pgID, r, step.ItemType)
                    if chosen != nil {
                        selected = append(selected, chosen)
                    }
                }
            }
            
        case "emit":
            // Finalize selection
        }
    }
    
    return toDriveInfos(selected)
}

// Straw2: deterministic weighted selection
func (c *CRUSHPlacement) straw2Select(
    parent *TopologyNode, 
    pgID uint64, 
    replica int,
    targetType NodeType,
) *TopologyNode {
    var bestNode *TopologyNode
    var bestDraw float64 = -1
    
    for _, child := range parent.Children {
        // Hash(pgID, child.ID, replica) → deterministic draw
        draw := hash64(pgID, hashString(child.ID), uint64(replica))
        // Weight the draw by node capacity
        weightedDraw := math.Log(float64(draw)/math.MaxFloat64) / child.Weight
        
        if weightedDraw > bestDraw {
            bestDraw = weightedDraw
            bestNode = child
        }
    }
    
    if bestNode.Type == targetType {
        return bestNode
    }
    // Recurse to find leaf at target level
    return c.straw2Select(bestNode, pgID, replica, targetType)
}
```

#### Rendezvous Hashing (Garage Model)
```go
// Rendezvous hashing for geo-distributed placement
type RendezvousPlacement struct {
    nodes  []NodeInfo
    zones  map[string][]NodeInfo // Zone → nodes mapping
}

func (rp *RendezvousPlacement) Place(key string, replicas int) []NodeInfo {
    type scored struct {
        node  NodeInfo
        score uint64
    }
    
    scores := make([]scored, len(rp.nodes))
    for i, node := range rp.nodes {
        // Rendezvous hash: score = hash(key + nodeID)
        h := xxhash.Sum64String(key + "|" + node.ID)
        scores[i] = scored{node: node, score: h}
    }
    
    // Sort by score descending
    sort.Slice(scores, func(i, j int) bool {
        return scores[i].score > scores[j].score
    })
    
    // Select top replicas, ensuring zone diversity
    selected := make([]NodeInfo, 0, replicas)
    usedZones := make(map[string]bool)
    
    // First pass: one per zone
    for _, s := range scores {
        if len(selected) >= replicas {
            break
        }
        if !usedZones[s.node.Zone] {
            selected = append(selected, s.node)
            usedZones[s.node.Zone] = true
        }
    }
    
    // Second pass: fill remaining if not enough zones
    for _, s := range scores {
        if len(selected) >= replicas {
            break
        }
        found := false
        for _, sel := range selected {
            if sel.ID == s.node.ID {
                found = true
                break
            }
        }
        if !found {
            selected = append(selected, s.node)
        }
    }
    
    return selected
}
```

### 4. Metadata Management

#### Metadata Store Architecture
The metadata store is the most critical component — it maps every object key to its physical location (shard placement, encryption info, version chain, etc.). The choice of metadata architecture has profound implications for scalability, consistency, and failure handling.

#### Approach 1: Per-Disk XL Metadata (MinIO Model)
```
Each drive stores metadata alongside data for objects assigned to it.

/data/disk1/
├── .minio.sys/                    # System metadata
│   ├── config/                    # Server configuration
│   ├── buckets/                   # Bucket configurations
│   │   ├── my-bucket/
│   │   │   ├── .metadata.bin      # Bucket policy, versioning, etc.
│   │   │   └── .usage-cache.bin   # Usage statistics cache
│   └── tmp/                       # Temporary upload staging
├── my-bucket/
│   ├── photos/
│   │   ├── sunset.jpg/
│   │   │   ├── xl.meta            # Object metadata (XL format)
│   │   │   ├── part.1             # Erasure-coded shard data
│   │   │   └── part.2
│   │   └── sunrise.png/
│   │       ├── xl.meta
│   │       └── part.1
```

```go
// XL metadata format (stored on each drive in the erasure set)
type XLMetaV2 struct {
    Versions []ObjectVersion `msg:"versions"`
}

type ObjectVersion struct {
    Type         VersionType      `msg:"type"`    // Object, DeleteMarker
    VersionID    [16]byte         `msg:"vid"`
    ModTime      int64            `msg:"mtime"`
    
    // Object data (only for Type=Object)
    ObjectMeta   *ObjectMetaV2    `msg:"meta,omitempty"`
}

type ObjectMetaV2 struct {
    Size            int64                `msg:"size"`
    ETag            string               `msg:"etag"`
    ContentType     string               `msg:"ct"`
    UserMetadata    map[string]string    `msg:"um"`
    PartNumbers     []int                `msg:"pn"`
    PartSizes       []int64              `msg:"ps"`
    PartETags       []string             `msg:"pe"`
    
    // Erasure coding info
    ErasureAlgorithm string              `msg:"ea"`
    ErasureM         int                 `msg:"em"`  // data shards
    ErasureN         int                 `msg:"en"`  // parity shards
    ErasureBlockSize int64               `msg:"eb"`
    ErasureIndex     int                 `msg:"ei"`  // This shard's index
    ErasureDist      []int               `msg:"ed"`  // Shard distribution
    
    // Checksums
    PartChecksums    [][]byte            `msg:"pc"`
    BitrotAlgorithm  string              `msg:"ba"`
    
    // Encryption
    Encryption       *EncryptionInfo      `msg:"enc,omitempty"`
    
    // Storage class
    StorageClass     string               `msg:"sc"`
    
    // Replication
    ReplicationStatus string              `msg:"rs,omitempty"`
}
```

**Advantages**: No external dependency. Metadata travels with data. Self-contained per erasure set.
**Disadvantages**: Listing requires scanning all drives. No global index.

#### Approach 2: Centralized Metadata (SeaweedFS Model)
```go
// Centralized metadata service with volume-based data placement
type MetadataServer struct {
    db            *leveldb.DB          // Embedded KV store
    volumeLayout  *VolumeLayout        // Volume → server mapping
    lock          sync.RWMutex
}

type FileEntry struct {
    Key           string
    VolumeID      uint32
    FileOffset    uint64
    FileSize      uint32
    ModTime       time.Time
    ETag          string
    ContentType   string
    UserMetadata  map[string]string
    Encryption    *EncryptionInfo
}

// Volume-based data placement
type VolumeLayout struct {
    volumes       map[uint32]*VolumeInfo
    writableVols  []uint32  // Volumes accepting writes
    readOnlyVols  []uint32  // Full volumes
}

type VolumeInfo struct {
    ID         uint32
    Server     string    // Node address
    DiskPath   string
    Size       uint64    // Current size
    MaxSize    uint64    // Capacity
    FileCount  uint32
    Replicas   []string  // Replica server addresses
}

func (ms *MetadataServer) LookupObject(bucket, key string) (*FileEntry, error) {
    fullKey := bucket + "/" + key
    data, err := ms.db.Get([]byte(fullKey), nil)
    if err == leveldb.ErrNotFound {
        return nil, ErrNoSuchKey
    }
    
    entry := &FileEntry{}
    err = msgpack.Unmarshal(data, entry)
    return entry, err
}
```

**Advantages**: Fast listing (scan KV store). Global view. Efficient small-object storage.
**Disadvantages**: Single point of failure (mitigate with Raft replication). Bottleneck at scale.

#### Approach 3: Distributed KV Metadata (Ceph/etcd Model)
```go
// Distributed metadata using etcd or similar consensus-based KV
type DistributedMetadata struct {
    client    *etcd.Client
    cache     *lru.Cache   // Local metadata cache
    cacheTTL  time.Duration
}

func (dm *DistributedMetadata) GetObjectMeta(bucket, key string) (*ObjectMetadata, error) {
    cacheKey := bucket + "/" + key
    
    // Check local cache
    if cached, ok := dm.cache.Get(cacheKey); ok {
        return cached.(*ObjectMetadata), nil
    }
    
    // Fetch from distributed KV
    resp, err := dm.client.Get(context.Background(), 
        fmt.Sprintf("/objects/%s/%s", bucket, key),
        etcd.WithSerializable(), // Read from local node for performance
    )
    if err != nil {
        return nil, err
    }
    if len(resp.Kvs) == 0 {
        return nil, ErrNoSuchKey
    }
    
    meta := &ObjectMetadata{}
    err = proto.Unmarshal(resp.Kvs[0].Value, meta)
    if err != nil {
        return nil, err
    }
    
    // Populate cache
    dm.cache.Add(cacheKey, meta)
    return meta, nil
}
```

#### Listing Optimization
Object listing (ListObjectsV2) is one of the most performance-critical operations. The key challenge is efficiently supporting prefix + delimiter queries over potentially billions of keys.

```go
// Efficient listing with B-tree/LSM-tree backed metadata
type ListEngine struct {
    store MetadataStore
}

type ListObjectsRequest struct {
    Bucket            string
    Prefix            string
    Delimiter         string
    ContinuationToken string
    MaxKeys           int
}

type ListObjectsResponse struct {
    Objects            []ObjectInfo
    CommonPrefixes     []string     // "directories" when delimiter="/"
    IsTruncated        bool
    NextContinuationToken string
}

func (le *ListEngine) ListObjectsV2(req ListObjectsRequest) (*ListObjectsResponse, error) {
    if req.MaxKeys == 0 {
        req.MaxKeys = 1000
    }
    
    response := &ListObjectsResponse{}
    prefixSet := make(map[string]bool)
    
    // Seek to start position
    startKey := req.Prefix
    if req.ContinuationToken != "" {
        startKey = decodeContinuationToken(req.ContinuationToken)
    }
    
    // Iterate through metadata store
    iter := le.store.NewIterator(req.Bucket, startKey)
    defer iter.Close()
    
    count := 0
    for iter.Valid() && count < req.MaxKeys+1 {
        key := iter.Key()
        
        // Check prefix match
        if !strings.HasPrefix(key, req.Prefix) {
            break
        }
        
        // Handle delimiter (virtual directories)
        if req.Delimiter != "" {
            afterPrefix := key[len(req.Prefix):]
            delimIdx := strings.Index(afterPrefix, req.Delimiter)
            if delimIdx >= 0 {
                // This key is "inside a directory" — collect as common prefix
                commonPrefix := req.Prefix + afterPrefix[:delimIdx+len(req.Delimiter)]
                if !prefixSet[commonPrefix] {
                    prefixSet[commonPrefix] = true
                    response.CommonPrefixes = append(response.CommonPrefixes, commonPrefix)
                    count++
                }
                // Skip all keys with this prefix
                iter.Seek(commonPrefix + "\xff")
                continue
            }
        }
        
        // Regular object
        meta := iter.Value()
        if !meta.DeleteMarker {
            response.Objects = append(response.Objects, meta.ToObjectInfo())
            count++
        }
        
        iter.Next()
    }
    
    // Handle truncation
    if count > req.MaxKeys {
        response.IsTruncated = true
        // Trim to MaxKeys
        if len(response.Objects) > req.MaxKeys {
            lastKey := response.Objects[req.MaxKeys-1].Key
            response.Objects = response.Objects[:req.MaxKeys]
            response.NextContinuationToken = encodeContinuationToken(lastKey)
        }
    }
    
    return response, nil
}
```

### 5. Request Routing and Processing

#### API Gateway Architecture
```go
type APIGateway struct {
    router         *HTTPRouter
    authEngine     *AuthEngine
    policyEngine   *PolicyEngine
    rateLimiter    *RateLimiter
    objectHandler  *ObjectHandler
    bucketHandler  *BucketHandler
    multipartHandler *MultipartHandler
    metricsCollector *MetricsCollector
}

func (gw *APIGateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    startTime := time.Now()
    requestID := generateRequestID()
    
    // 1. Rate limiting
    if !gw.rateLimiter.Allow(r.RemoteAddr) {
        writeS3Error(w, SlowDown, requestID)
        return
    }
    
    // 2. Parse S3 request (bucket, key, operation)
    s3req, err := ParseS3Request(r)
    if err != nil {
        writeS3Error(w, InvalidRequest, requestID)
        return
    }
    
    // 3. Authenticate (AWS Signature V4)
    identity, err := gw.authEngine.Authenticate(r, s3req)
    if err != nil {
        writeS3Error(w, AccessDenied, requestID)
        return
    }
    
    // 4. Authorize (evaluate IAM + bucket + ACL policies)
    allowed, err := gw.policyEngine.Evaluate(identity, s3req)
    if err != nil || !allowed {
        writeS3Error(w, AccessDenied, requestID)
        return
    }
    
    // 5. Route to handler
    switch s3req.Operation {
    case OpPutObject:
        gw.objectHandler.PutObject(w, r, s3req, identity)
    case OpGetObject:
        gw.objectHandler.GetObject(w, r, s3req, identity)
    case OpDeleteObject:
        gw.objectHandler.DeleteObject(w, r, s3req, identity)
    case OpListObjectsV2:
        gw.bucketHandler.ListObjects(w, r, s3req, identity)
    case OpCreateMultipartUpload:
        gw.multipartHandler.Initiate(w, r, s3req, identity)
    case OpUploadPart:
        gw.multipartHandler.UploadPart(w, r, s3req, identity)
    case OpCompleteMultipartUpload:
        gw.multipartHandler.Complete(w, r, s3req, identity)
    // ... other operations
    }
    
    // 6. Record metrics
    gw.metricsCollector.RecordRequest(s3req.Operation, time.Since(startTime), err)
}
```

#### AWS Signature V4 Verification
```go
type AuthEngine struct {
    credentialStore CredentialStore
    regionName      string
    serviceName     string // "s3"
}

func (ae *AuthEngine) Authenticate(r *http.Request, s3req *S3Request) (*Identity, error) {
    // Parse Authorization header
    authHeader := r.Header.Get("Authorization")
    if authHeader == "" {
        // Check for query string auth (presigned URL)
        return ae.authenticatePresigned(r, s3req)
    }
    
    // Parse: AWS4-HMAC-SHA256 Credential=.../scope, SignedHeaders=..., Signature=...
    parsed, err := parseAuthHeader(authHeader)
    if err != nil {
        return nil, ErrMalformedAuth
    }
    
    // Look up access key
    credential, err := ae.credentialStore.GetCredential(parsed.AccessKeyID)
    if err != nil {
        return nil, ErrInvalidAccessKey
    }
    
    // Reconstruct canonical request
    canonicalRequest := buildCanonicalRequest(r, parsed.SignedHeaders, s3req)
    
    // Build string to sign
    scope := fmt.Sprintf("%s/%s/%s/aws4_request", 
        parsed.Date, ae.regionName, ae.serviceName)
    stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s",
        r.Header.Get("X-Amz-Date"),
        scope,
        sha256Hex(canonicalRequest))
    
    // Derive signing key
    signingKey := deriveSigningKey(
        credential.SecretKey,
        parsed.Date,
        ae.regionName,
        ae.serviceName,
    )
    
    // Compute expected signature
    expectedSignature := hmacSHA256Hex(signingKey, stringToSign)
    
    // Constant-time comparison
    if !hmac.Equal([]byte(parsed.Signature), []byte(expectedSignature)) {
        return nil, ErrSignatureDoesNotMatch
    }
    
    return &Identity{
        AccessKey: parsed.AccessKeyID,
        AccountID: credential.AccountID,
        Policies:  credential.Policies,
    }, nil
}

func deriveSigningKey(secretKey, date, region, service string) []byte {
    kDate := hmacSHA256([]byte("AWS4"+secretKey), []byte(date))
    kRegion := hmacSHA256(kDate, []byte(region))
    kService := hmacSHA256(kRegion, []byte(service))
    kSigning := hmacSHA256(kService, []byte("aws4_request"))
    return kSigning
}
```

### 6. PutObject Pipeline

#### Complete Write Path
```go
func (oh *ObjectHandler) PutObject(
    w http.ResponseWriter, 
    r *http.Request, 
    s3req *S3Request,
    identity *Identity,
) {
    bucket := s3req.Bucket
    key := s3req.Key
    size := r.ContentLength
    
    // 1. Validate request
    if size > MaxObjectSize {
        writeS3Error(w, EntityTooLarge, s3req.RequestID)
        return
    }
    
    // 2. Check bucket exists and get config
    bucketConfig, err := oh.metadataStore.GetBucketConfig(bucket)
    if err != nil {
        writeS3Error(w, NoSuchBucket, s3req.RequestID)
        return
    }
    
    // 3. Check quota
    if bucketConfig.Quota > 0 {
        usage, _ := oh.metadataStore.GetBucketUsage(bucket)
        if usage+size > bucketConfig.Quota {
            writeS3Error(w, QuotaExceeded, s3req.RequestID)
            return
        }
    }
    
    // 4. Determine encryption
    encConfig, err := oh.resolveEncryption(r, bucketConfig)
    if err != nil {
        writeS3Error(w, InvalidEncryptionConfig, s3req.RequestID)
        return
    }
    
    // 5. Get data placement (which drives/nodes store this object)
    placement := oh.placementEngine.GetPlacement(bucket, key)
    
    // 6. Create data pipeline: reader → encrypt → erasure encode → write shards
    var dataReader io.Reader = r.Body
    var dataEncKey []byte
    
    // Encrypt if configured
    if encConfig != nil {
        dataEncKey, err = oh.encryptionProvider.GenerateDataKey(encConfig.KeyID)
        if err != nil {
            writeS3Error(w, InternalError, s3req.RequestID)
            return
        }
        dataReader, err = newEncryptingReader(dataReader, dataEncKey, encConfig.Algorithm)
        if err != nil {
            writeS3Error(w, InternalError, s3req.RequestID)
            return
        }
    }
    
    // 7. Stream through erasure coder to drives in parallel
    md5Hash := md5.New()
    sha256Hash := sha256.New()
    dataReader = io.TeeReader(dataReader, io.MultiWriter(md5Hash, sha256Hash))
    
    erasureInfo, err := oh.erasureCoder.EncodeAndWrite(
        dataReader, 
        size,
        placement,
    )
    if err != nil {
        // Cleanup partial writes
        oh.erasureCoder.CleanupPartialWrite(placement, key)
        writeS3Error(w, InternalError, s3req.RequestID)
        return
    }
    
    // 8. Compute ETag
    etag := hex.EncodeToString(md5Hash.Sum(nil))
    
    // 9. Build metadata
    objMeta := &ObjectMetadata{
        Bucket:       bucket,
        Key:          key,
        Size:         size,
        ETag:         etag,
        ContentType:  r.Header.Get("Content-Type"),
        Modified:     time.Now(),
        StorageClass: resolveStorageClass(r, bucketConfig),
        ErasureInfo:  erasureInfo,
        UserMetadata: extractUserMetadata(r),
        Checksum: ChecksumInfo{
            SHA256: sha256Hash.Sum(nil),
        },
    }
    
    // Handle versioning
    if bucketConfig.Versioning == VersioningEnabled {
        objMeta.VersionID = generateVersionID()
        objMeta.IsLatest = true
    }
    
    // Store encryption metadata (never the key itself for SSE-C)
    if encConfig != nil {
        objMeta.Encryption = &EncryptionInfo{
            Algorithm:      encConfig.Algorithm,
            WrappedDataKey: oh.encryptionProvider.WrapKey(dataEncKey, encConfig.KeyID),
            KeyID:          encConfig.KeyID,
        }
    }
    
    // 10. Write metadata to all drives in erasure set (quorum write)
    err = oh.metadataStore.PutObjectMeta(objMeta)
    if err != nil {
        oh.erasureCoder.CleanupPartialWrite(placement, key)
        writeS3Error(w, InternalError, s3req.RequestID)
        return
    }
    
    // 11. Send event notification
    if bucketConfig.NotificationConfig != nil {
        oh.notifier.Emit(Event{
            Type:   "s3:ObjectCreated:Put",
            Bucket: bucket,
            Key:    key,
            Size:   size,
            ETag:   etag,
        })
    }
    
    // 12. Queue for replication if configured
    if bucketConfig.ReplicationConfig != nil {
        oh.replicationQueue.Enqueue(ReplicationTask{
            Bucket:    bucket,
            Key:       key,
            VersionID: objMeta.VersionID,
        })
    }
    
    // 13. Return success
    w.Header().Set("ETag", `"`+etag+`"`)
    if objMeta.VersionID != "" {
        w.Header().Set("x-amz-version-id", objMeta.VersionID)
    }
    w.WriteHeader(http.StatusOK)
}
```

### 7. GetObject Pipeline

#### Complete Read Path with Byte-Range Support
```go
func (oh *ObjectHandler) GetObject(
    w http.ResponseWriter,
    r *http.Request,
    s3req *S3Request,
    identity *Identity,
) {
    bucket := s3req.Bucket
    key := s3req.Key
    
    // 1. Resolve version
    versionID := r.URL.Query().Get("versionId")
    meta, err := oh.metadataStore.GetObjectMeta(bucket, key, versionID)
    if err != nil {
        writeS3Error(w, NoSuchKey, s3req.RequestID)
        return
    }
    
    // Check delete marker
    if meta.DeleteMarker {
        w.Header().Set("x-amz-delete-marker", "true")
        writeS3Error(w, NoSuchKey, s3req.RequestID)
        return
    }
    
    // 2. Evaluate conditional headers
    if !evaluateConditionals(r, meta) {
        w.WriteHeader(http.StatusNotModified)
        return
    }
    
    // 3. Parse Range header
    rangeHeader := r.Header.Get("Range")
    var byteRange *ByteRange
    if rangeHeader != "" {
        byteRange, err = parseRangeHeader(rangeHeader, meta.Size)
        if err != nil {
            writeS3Error(w, InvalidRange, s3req.RequestID)
            return
        }
    }
    
    // 4. Get data placement
    placement := oh.placementEngine.GetPlacement(bucket, key)
    
    // 5. Read shards from drives (parallel)
    // For range reads, calculate which stripes and offsets are needed
    var dataReader io.ReadCloser
    if byteRange != nil {
        dataReader, err = oh.erasureCoder.ReadRange(
            placement, 
            meta.ErasureInfo,
            byteRange.Start,
            byteRange.End - byteRange.Start + 1,
        )
    } else {
        dataReader, err = oh.erasureCoder.Read(placement, meta.ErasureInfo)
    }
    if err != nil {
        writeS3Error(w, InternalError, s3req.RequestID)
        return
    }
    defer dataReader.Close()
    
    // 6. Decrypt if encrypted
    if meta.Encryption != nil {
        dataKey, err := oh.resolveDecryptionKey(r, meta.Encryption)
        if err != nil {
            writeS3Error(w, AccessDenied, s3req.RequestID)
            return
        }
        dataReader, err = newDecryptingReader(dataReader, dataKey, meta.Encryption.Algorithm)
        if err != nil {
            writeS3Error(w, InternalError, s3req.RequestID)
            return
        }
    }
    
    // 7. Set response headers
    w.Header().Set("Content-Type", meta.ContentType)
    w.Header().Set("ETag", `"`+meta.ETag+`"`)
    w.Header().Set("Last-Modified", meta.Modified.Format(http.TimeFormat))
    w.Header().Set("x-amz-server-side-encryption", meta.Encryption.Algorithm)
    
    if meta.VersionID != "" {
        w.Header().Set("x-amz-version-id", meta.VersionID)
    }
    for k, v := range meta.UserMetadata {
        w.Header().Set("x-amz-meta-"+k, v)
    }
    
    if byteRange != nil {
        w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d",
            byteRange.Start, byteRange.End, meta.Size))
        w.Header().Set("Content-Length", strconv.FormatInt(byteRange.End-byteRange.Start+1, 10))
        w.WriteHeader(http.StatusPartialContent)
    } else {
        w.Header().Set("Content-Length", strconv.FormatInt(meta.Size, 10))
        w.WriteHeader(http.StatusOK)
    }
    
    // 8. Stream data to client
    io.Copy(w, dataReader)
}
```

#### Parallel Shard Read
```go
// Read shards in parallel from the erasure set
func (ec *ErasureCoder) Read(placement ErasureSet, info ErasureInfo) (io.ReadCloser, error) {
    k := info.DataShards
    m := info.ParityShards
    total := k + m
    
    // Launch parallel reads
    type shardResult struct {
        index int
        data  []byte
        err   error
    }
    
    results := make(chan shardResult, total)
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    
    for i := 0; i < total; i++ {
        go func(idx int) {
            drive := placement.Drives[idx]
            data, err := drive.ReadShard(ctx, info.DataDir, idx)
            
            // Verify checksum (bitrot detection on read)
            if err == nil && info.Checksums[idx] != nil {
                h := highwayhash.New(checksumKey)
                h.Write(data)
                if !bytes.Equal(h.Sum(nil), info.Checksums[idx]) {
                    err = ErrBitrotDetected{Drive: drive.Path, ShardIndex: idx}
                }
            }
            
            results <- shardResult{index: idx, data: data, err: err}
        }(i)
    }
    
    // Collect results — we need k good shards
    shards := make([][]byte, total)
    available := make([]bool, total)
    goodCount := 0
    
    for i := 0; i < total && goodCount < k; i++ {
        result := <-results
        if result.err == nil {
            shards[result.index] = result.data
            available[result.index] = true
            goodCount++
        } else {
            // Log degraded read
            log.Warn("shard read failed",
                "index", result.index,
                "error", result.err)
        }
    }
    
    if goodCount < k {
        return nil, ErrInsufficientShards{Available: goodCount, Required: k}
    }
    
    // Decode (reconstruct if needed)
    reader, err := ec.Decode(shards, available)
    return io.NopCloser(reader), err
}
```

### 8. Multipart Upload Architecture

```go
type MultipartManager struct {
    metadataStore  MetadataStore
    erasureCoder   *ErasureCoder
    placement      *PlacementEngine
    uploadTimeout  time.Duration
}

// Track in-progress uploads
type MultipartUploadState struct {
    UploadID      string
    Bucket        string
    Key           string
    Initiated     time.Time
    Metadata      map[string]string
    Encryption    *EncryptionInfo
    StorageClass  string
    Parts         map[int]*PartInfo   // partNumber → info
    mutex         sync.Mutex
}

type PartInfo struct {
    PartNumber   int
    Size         int64
    ETag         string
    ErasureInfo  ErasureInfo
    LastModified time.Time
}

func (mm *MultipartManager) InitiateUpload(
    bucket, key string,
    metadata map[string]string,
    encryption *EncryptionInfo,
) (string, error) {
    uploadID := generateUploadID()
    
    state := &MultipartUploadState{
        UploadID:     uploadID,
        Bucket:       bucket,
        Key:          key,
        Initiated:    time.Now(),
        Metadata:     metadata,
        Encryption:   encryption,
        Parts:        make(map[int]*PartInfo),
    }
    
    // Persist upload state
    err := mm.metadataStore.PutMultipartState(uploadID, state)
    return uploadID, err
}

func (mm *MultipartManager) UploadPart(
    uploadID string,
    partNumber int,
    data io.Reader,
    size int64,
) (string, error) {
    // Validate
    if partNumber < 1 || partNumber > 10000 {
        return "", ErrInvalidPartNumber
    }
    if size < MinPartSize && partNumber != -1 { // -1 = last part
        return "", ErrEntityTooSmall
    }
    
    // Get upload state
    state, err := mm.metadataStore.GetMultipartState(uploadID)
    if err != nil {
        return "", ErrNoSuchUpload
    }
    
    // Determine placement for this part
    partKey := fmt.Sprintf("%s/%s/.parts/%s/%05d",
        state.Bucket, state.Key, uploadID, partNumber)
    placement := mm.placement.GetPlacement(state.Bucket, partKey)
    
    // Encrypt part data if needed
    if state.Encryption != nil {
        data, err = encryptPartData(data, state.Encryption)
        if err != nil {
            return "", err
        }
    }
    
    // Erasure encode and write
    md5Hash := md5.New()
    data = io.TeeReader(data, md5Hash)
    
    erasureInfo, err := mm.erasureCoder.EncodeAndWrite(data, size, placement)
    if err != nil {
        return "", err
    }
    
    etag := hex.EncodeToString(md5Hash.Sum(nil))
    
    // Record part
    state.mutex.Lock()
    state.Parts[partNumber] = &PartInfo{
        PartNumber:   partNumber,
        Size:         size,
        ETag:         etag,
        ErasureInfo:  erasureInfo,
        LastModified: time.Now(),
    }
    state.mutex.Unlock()
    
    mm.metadataStore.PutMultipartState(uploadID, state)
    
    return etag, nil
}

func (mm *MultipartManager) CompleteUpload(
    uploadID string,
    completeParts []CompletePart, // [{PartNumber, ETag}]
) (*ObjectMetadata, error) {
    state, err := mm.metadataStore.GetMultipartState(uploadID)
    if err != nil {
        return nil, ErrNoSuchUpload
    }
    
    // Validate all parts exist and ETags match
    totalSize := int64(0)
    partInfos := make([]PartInfo, len(completeParts))
    md5Concat := md5.New()
    
    for i, cp := range completeParts {
        part, exists := state.Parts[cp.PartNumber]
        if !exists {
            return nil, ErrInvalidPart
        }
        if part.ETag != cp.ETag {
            return nil, ErrInvalidPart
        }
        // Validate part ordering
        if i > 0 && cp.PartNumber <= completeParts[i-1].PartNumber {
            return nil, ErrInvalidPartOrder
        }
        // Validate minimum part size (except last)
        if i < len(completeParts)-1 && part.Size < MinPartSize {
            return nil, ErrEntityTooSmall
        }
        
        totalSize += part.Size
        partInfos[i] = *part
        
        // Compute composite ETag: MD5(concat(part MD5s))-N
        etagBytes, _ := hex.DecodeString(part.ETag)
        md5Concat.Write(etagBytes)
    }
    
    // Composite ETag: md5(md5(part1) + md5(part2) + ...)-N
    compositeETag := fmt.Sprintf("%s-%d",
        hex.EncodeToString(md5Concat.Sum(nil)),
        len(completeParts))
    
    // Create final object metadata
    objMeta := &ObjectMetadata{
        Bucket:       state.Bucket,
        Key:          state.Key,
        Size:         totalSize,
        ETag:         compositeETag,
        Modified:     time.Now(),
        UserMetadata: state.Metadata,
        Encryption:   state.Encryption,
        StorageClass: state.StorageClass,
        Parts:        partInfos,
    }
    
    // Write final metadata
    err = mm.metadataStore.PutObjectMeta(objMeta)
    if err != nil {
        return nil, err
    }
    
    // Cleanup upload state
    mm.metadataStore.DeleteMultipartState(uploadID)
    
    return objMeta, nil
}
```

### 9. Replication Engine

```go
type ReplicationEngine struct {
    queue           *ReplicationQueue    // Persistent queue (WAL-backed)
    targets         map[string]*ReplicationTarget
    workerCount     int
    metrics         *ReplicationMetrics
    retryPolicy     RetryPolicy
}

type ReplicationTask struct {
    Bucket      string
    Key         string
    VersionID   string
    Operation   string // "PUT", "DELETE"
    QueuedAt    time.Time
    Attempts    int
    LastError   string
}

type ReplicationTarget struct {
    Name        string
    Endpoint    string
    AccessKey   string
    SecretKey   string
    BucketMap   map[string]string // source bucket → destination bucket
    client      *s3.Client
}

func (re *ReplicationEngine) Start() {
    for i := 0; i < re.workerCount; i++ {
        go re.replicationWorker(i)
    }
}

func (re *ReplicationEngine) replicationWorker(id int) {
    for {
        task, err := re.queue.Dequeue(context.Background())
        if err != nil {
            time.Sleep(time.Second)
            continue
        }
        
        startTime := time.Now()
        err = re.replicateObject(task)
        duration := time.Since(startTime)
        
        if err != nil {
            re.metrics.ReplicationFailures.Inc()
            task.Attempts++
            task.LastError = err.Error()
            
            if task.Attempts < re.retryPolicy.MaxAttempts {
                // Re-queue with exponential backoff
                delay := re.retryPolicy.BaseDelay * time.Duration(1<<uint(task.Attempts))
                re.queue.EnqueueDelayed(task, delay)
            } else {
                // Mark as failed in metadata
                re.metadataStore.SetReplicationStatus(
                    task.Bucket, task.Key, task.VersionID, "FAILED")
                re.metrics.ReplicationPermanentFailures.Inc()
            }
        } else {
            re.metrics.ReplicationSuccesses.Inc()
            re.metrics.ReplicationLatency.Observe(duration.Seconds())
            re.metadataStore.SetReplicationStatus(
                task.Bucket, task.Key, task.VersionID, "COMPLETED")
        }
    }
}

func (re *ReplicationEngine) replicateObject(task ReplicationTask) error {
    for _, target := range re.targets {
        destBucket, ok := target.BucketMap[task.Bucket]
        if !ok {
            continue
        }
        
        switch task.Operation {
        case "PUT":
            // Read object from local storage
            reader, meta, err := re.localStorage.GetObject(task.Bucket, task.Key, task.VersionID)
            if err != nil {
                return fmt.Errorf("read source: %w", err)
            }
            defer reader.Close()
            
            // Upload to remote
            _, err = target.client.PutObject(context.Background(), &s3.PutObjectInput{
                Bucket:      aws.String(destBucket),
                Key:         aws.String(task.Key),
                Body:        reader,
                ContentType: aws.String(meta.ContentType),
                Metadata:    meta.UserMetadata,
            })
            if err != nil {
                return fmt.Errorf("upload to %s: %w", target.Name, err)
            }
            
        case "DELETE":
            _, err := target.client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
                Bucket:    aws.String(destBucket),
                Key:       aws.String(task.Key),
                VersionId: aws.String(task.VersionID),
            })
            if err != nil {
                return fmt.Errorf("delete on %s: %w", target.Name, err)
            }
        }
    }
    
    return nil
}
```

### 10. Lifecycle Engine

```go
type LifecycleEngine struct {
    metadataStore  MetadataStore
    storageEngine  StorageEngine
    evaluationInterval time.Duration
    workerCount    int
}

func (le *LifecycleEngine) EvaluationLoop() {
    ticker := time.NewTicker(le.evaluationInterval)
    for range ticker.C {
        le.evaluateAllBuckets()
    }
}

func (le *LifecycleEngine) evaluateAllBuckets() {
    buckets, _ := le.metadataStore.ListBuckets()
    
    for _, bucket := range buckets {
        rules, err := le.metadataStore.GetLifecycleRules(bucket.Name)
        if err != nil || len(rules) == 0 {
            continue
        }
        
        // Scan all objects in the bucket
        var continuationToken string
        for {
            objects, nextToken, err := le.metadataStore.ListObjectsInternal(
                bucket.Name, "", "", continuationToken, 1000)
            if err != nil {
                break
            }
            
            for _, obj := range objects {
                le.evaluateObjectRules(bucket.Name, obj, rules)
            }
            
            if nextToken == "" {
                break
            }
            continuationToken = nextToken
        }
    }
}

func (le *LifecycleEngine) evaluateObjectRules(
    bucket string,
    obj ObjectMetadata,
    rules []LifecycleRule,
) {
    now := time.Now()
    
    for _, rule := range rules {
        if rule.Status != "Enabled" {
            continue
        }
        
        // Check filter (prefix + tags)
        if !rule.Filter.Matches(obj) {
            continue
        }
        
        age := now.Sub(obj.Modified)
        
        // Expiration
        if rule.Expiration != nil && rule.Expiration.Days > 0 {
            if age > time.Duration(rule.Expiration.Days)*24*time.Hour {
                // Check Object Lock before deleting
                if !le.isRetentionActive(bucket, obj) {
                    le.deleteObject(bucket, obj)
                    continue
                }
            }
        }
        
        // Transitions (from warmest to coldest)
        for _, transition := range rule.Transitions {
            if age > time.Duration(transition.Days)*24*time.Hour {
                if obj.StorageClass != transition.StorageClass {
                    le.transitionObject(bucket, obj, transition.StorageClass)
                    break // Only apply first matching transition
                }
            }
        }
        
        // Abort incomplete multipart uploads
        if rule.AbortIncompleteMultipart != nil {
            le.cleanupStaleMultipartUploads(bucket, rule.AbortIncompleteMultipart.DaysAfterInitiation)
        }
    }
}
```

### 11. Bitrot Detection and Healing

```go
type HealingEngine struct {
    metadataStore  MetadataStore
    erasureCoder   *ErasureCoder
    placement      *PlacementEngine
    scanInterval   time.Duration
    metrics        *HealingMetrics
}

func (he *HealingEngine) BackgroundScan() {
    ticker := time.NewTicker(he.scanInterval)
    for range ticker.C {
        he.scanAllDrives()
    }
}

func (he *HealingEngine) scanAllDrives() {
    drives := he.placement.GetAllDrives()
    
    for _, drive := range drives {
        // Walk all objects on this drive
        err := drive.Walk(func(objectPath string, info os.FileInfo) error {
            return he.verifyShard(drive, objectPath)
        })
        if err != nil {
            log.Error("drive scan failed", "drive", drive.Path, "error", err)
        }
    }
}

func (he *HealingEngine) verifyShard(drive DriveInfo, shardPath string) error {
    // Read shard data
    data, err := os.ReadFile(shardPath)
    if err != nil {
        he.metrics.ReadErrors.Inc()
        return he.healObject(drive, shardPath, err)
    }
    
    // Read stored checksum from metadata
    meta, err := he.metadataStore.GetShardChecksum(drive.Path, shardPath)
    if err != nil {
        return err
    }
    
    // Compute current checksum
    h := highwayhash.New(checksumKey)
    h.Write(data)
    currentChecksum := h.Sum(nil)
    
    // Compare
    if !bytes.Equal(currentChecksum, meta.Checksum) {
        he.metrics.BitrotDetected.Inc()
        log.Warn("bitrot detected",
            "drive", drive.Path,
            "shard", shardPath,
            "expected", hex.EncodeToString(meta.Checksum),
            "actual", hex.EncodeToString(currentChecksum))
        return he.healObject(drive, shardPath, ErrBitrotDetected{})
    }
    
    he.metrics.ShardsVerified.Inc()
    return nil
}

func (he *HealingEngine) healObject(drive DriveInfo, shardPath string, originalErr error) error {
    // Parse bucket/key from shard path
    bucket, key, shardIndex := parseShardPath(shardPath)
    
    // Get full object metadata
    meta, err := he.metadataStore.GetObjectMeta(bucket, key, "")
    if err != nil {
        return fmt.Errorf("get metadata for healing: %w", err)
    }
    
    // Get placement for this object
    placement := he.placement.GetPlacement(bucket, key)
    
    // Read all available shards
    k := meta.ErasureInfo.DataShards
    m := meta.ErasureInfo.ParityShards
    total := k + m
    
    shards := make([][]byte, total)
    available := make([]bool, total)
    
    for i := 0; i < total; i++ {
        if i == shardIndex {
            continue // Skip corrupted shard
        }
        data, readErr := placement.Drives[i].ReadShard(context.Background(), meta.ErasureInfo.DataDir, i)
        if readErr == nil {
            chk := highwayhash.New(checksumKey)
            chk.Write(data)
            if bytes.Equal(chk.Sum(nil), meta.ErasureInfo.Checksums[i]) {
                shards[i] = data
                available[i] = true
            }
        }
    }
    
    goodCount := 0
    for _, ok := range available {
        if ok {
            goodCount++
        }
    }
    if goodCount < k {
        he.metrics.UnhealableObjects.Inc()
        return fmt.Errorf("cannot heal %s/%s: only %d/%d shards available", bucket, key, goodCount, k)
    }
    
    // Reconstruct
    encoder, _ := reedsolomon.New(k, m)
    if err := encoder.Reconstruct(shards); err != nil {
        return fmt.Errorf("reconstruction failed: %w", err)
    }
    
    // Write repaired shard
    err = placement.Drives[shardIndex].WriteShard(
        context.Background(), meta.ErasureInfo.DataDir, shardIndex, shards[shardIndex])
    if err != nil {
        return fmt.Errorf("write repaired shard: %w", err)
    }
    
    // Update checksum
    repairHash := highwayhash.New(checksumKey)
    repairHash.Write(shards[shardIndex])
    he.metadataStore.UpdateShardChecksum(drive.Path, shardPath, repairHash.Sum(nil))
    
    he.metrics.ShardsHealed.Inc()
    log.Info("shard healed", "bucket", bucket, "key", key, "shard", shardIndex, "drive", drive.Path)
    return nil
}
```

### 12. Encryption Pipeline Architecture

```go
type EncryptionPipeline struct {
    kmsProvider   EncryptionProvider
    defaultKeyID  string
}

func (ep *EncryptionPipeline) EncryptSSES3(data io.Reader, size int64) (io.Reader, *EncryptionInfo, error) {
    dek := make([]byte, 32)
    io.ReadFull(rand.Reader, dek)
    
    wrappedDEK, err := ep.kmsProvider.GenerateDataKey(ep.defaultKeyID)
    if err != nil {
        return nil, nil, err
    }
    
    block, _ := aes.NewCipher(dek)
    gcm, _ := cipher.NewGCM(block)
    nonce := make([]byte, gcm.NonceSize())
    io.ReadFull(rand.Reader, nonce)
    
    encReader := &encryptingReader{source: data, gcm: gcm, nonce: nonce, buffer: make([]byte, 64*1024)}
    info := &EncryptionInfo{Algorithm: "AES256", WrappedDEK: wrappedDEK, KeyID: ep.defaultKeyID, Nonce: nonce}
    
    // Zero DEK from memory
    for i := range dek { dek[i] = 0 }
    
    return encReader, info, nil
}
```

### 13. Event Notification Dispatch

```go
type NotificationDispatcher struct {
    targets  map[string]NotificationTarget
    queue    chan Event
    filters  map[string][]EventFilter
}

func (nd *NotificationDispatcher) Emit(event Event) {
    select {
    case nd.queue <- event:
    default:
        nd.metrics.DroppedEvents.Inc()
    }
}

func (nd *NotificationDispatcher) worker() {
    for event := range nd.queue {
        for targetID, target := range nd.targets {
            if nd.matchesFilter(event, nd.filters[targetID]) {
                if err := target.Send(nd.formatPayload(event)); err != nil {
                    nd.metrics.DeliveryFailures.WithLabelValues(targetID).Inc()
                }
            }
        }
    }
}
```

## Deployment Patterns

### Single-Node Development
```yaml
deployment:
  type: single_node
  drives: ["/data/disk1", "/data/disk2", "/data/disk3", "/data/disk4"]
  erasure_coding: "EC:2+2"
```

### Multi-Node Production
```yaml
deployment:
  type: distributed
  nodes:
    - host: storage-01
      drives: ["/data/ssd1", "/data/ssd2", "/data/hdd1", "/data/hdd2"]
      zone: "us-east-1a"
    - host: storage-02
      drives: ["/data/ssd1", "/data/ssd2", "/data/hdd1", "/data/hdd2"]
      zone: "us-east-1b"
    - host: storage-03
      drives: ["/data/ssd1", "/data/ssd2", "/data/hdd1", "/data/hdd2"]
      zone: "us-east-1c"
  erasure_coding: "EC:4+2"
  internode_tls: true
```

### Geo-Distributed Multi-Site
```yaml
deployment:
  type: multi_site
  sites:
    - name: us-east
      endpoint: "https://s3-east.example.com"
      nodes: 4
    - name: eu-central
      endpoint: "https://s3-eu.example.com"
      nodes: 4
  replication:
    mode: active-active
    conflict_resolution: last_write_wins
```

This architecture guide provides the foundation for implementing a scalable, durable, and performant S3-compatible object storage system.