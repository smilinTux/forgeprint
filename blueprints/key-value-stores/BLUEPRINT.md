# Key-Value Store Blueprint (Redis/Valkey-style)

## Overview & Purpose

A key-value store is an in-memory data structure server that maps unique string keys to rich data types, providing sub-millisecond read/write performance. Unlike simple caches (Memcached), a Redis/Valkey-style KV store supports complex data structures, persistence, replication, clustering, scripting, and pub/sub — making it a versatile building block for caching, session management, real-time analytics, message brokering, rate limiting, leaderboards, and more.

### Why Forgeprint Needs This

The Redis licensing saga (BSD → RSALv2+SSPLv1 dual license in March 2024) triggered the creation of **Valkey** under the Linux Foundation, proving that open-source alternatives to dominant infrastructure software are critically needed. Forgeprint can generate truly open, BSD-licensed key-value stores that are protocol-compatible with the Redis ecosystem while being free from licensing encumbrances.

### Core Responsibilities
- **In-Memory Data Storage**: Store and retrieve data structures entirely in RAM for sub-millisecond latency
- **Rich Data Types**: Strings, lists, sets, sorted sets, hashes, streams, bitmaps, HyperLogLog, geospatial indexes
- **Persistence**: Durable storage via RDB snapshots and/or append-only file (AOF)
- **Replication**: Asynchronous master-replica replication for read scaling and high availability
- **Clustering**: Horizontal sharding via hash slots across multiple nodes
- **Pub/Sub**: Fire-and-forget publish/subscribe messaging
- **Atomic Scripting**: Server-side Lua scripting for complex atomic operations
- **Transactions**: Multi-command atomic execution with optimistic locking

### License Context
| Project | License | Status |
|---------|---------|--------|
| Redis (pre-7.4) | BSD-3-Clause | Historical |
| Redis (7.4+) | RSALv2 + SSPLv1 (dual) | Current — NOT open-source by OSI definition |
| Valkey | BSD-3-Clause | Linux Foundation fork, community-driven |
| KeyDB | BSD-3-Clause | Multi-threaded fork |
| DragonflyDB | BSL 1.1 | Source-available, not OSS |
| **Forgeprint Output** | **User's choice (BSD/MIT/Apache)** | **Truly open-source** |

## Core Concepts

### 1. The RESP Protocol (Redis Serialization Protocol)

**Definition**: The wire protocol used for client-server communication. RESP is text-based, simple to parse, and human-readable.

#### RESP2 (Default)
```
Type Prefixes:
  + Simple String    → +OK\r\n
  - Error            → -ERR unknown command\r\n
  : Integer          → :1000\r\n
  $ Bulk String      → $5\r\nHello\r\n
  * Array            → *2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n
  $-1                → Null Bulk String
  *-1                → Null Array
```

#### RESP3 (Redis 6.0+)
```
Additional Types:
  _ Null             → _\r\n
  # Boolean          → #t\r\n or #f\r\n
  , Double           → ,3.14\r\n
  ( Big Number       → (3492890328409238509324850943850943825024385\r\n
  ! Blob Error       → !21\r\nSYNTAX invalid syntax\r\n
  = Verbatim String  → =15\r\ntxt:Some string\r\n
  ~ Set              → ~2\r\n+orange\r\n+apple\r\n
  | Attribute        → |1\r\n+key\r\n+value\r\n
  % Map              → %2\r\n+first\r\n:1\r\n+second\r\n:2\r\n
  > Push             → >2\r\n+message\r\n+channel\r\n
```

**Implementation Requirements**:
```rust
enum RespValue {
    SimpleString(String),
    Error(String),
    Integer(i64),
    BulkString(Option<Vec<u8>>),
    Array(Option<Vec<RespValue>>),
    // RESP3 extensions
    Null,
    Boolean(bool),
    Double(f64),
    BigNumber(String),
    BlobError { code: String, message: Vec<u8> },
    VerbatimString { encoding: String, data: Vec<u8> },
    Set(Vec<RespValue>),
    Map(Vec<(RespValue, RespValue)>),
    Push(Vec<RespValue>),
    Attribute(Vec<(RespValue, RespValue)>),
}
```

### 2. Key Space

**Definition**: The flat namespace where all keys reside. Keys are binary-safe strings.

```
Key Properties:
  - Maximum size: 512 MB (practical limit: keep short)
  - Binary-safe: any byte sequence
  - Naming convention: "object-type:id:field" (e.g., "user:1000:email")
  - Databases: 16 logical databases (SELECT 0-15), default db 0
  - Cluster mode: single db (db 0) only
```

**Key Expiry Model**:
- **Passive expiry**: Check TTL on access; delete if expired
- **Active expiry**: Periodic scan samples random keys; delete expired ones
- **Active cycle**: 10 times/sec → sample 20 keys → if >25% expired, repeat

```rust
struct KeyEntry {
    key: Vec<u8>,
    value: DataObject,
    expire_at: Option<u64>,      // Absolute millisecond timestamp
    lru_clock: u32,              // LRU approximation (24-bit clock)
    lfu_counter: u8,             // LFU logarithmic counter
    encoding: ObjectEncoding,    // Internal encoding type
}
```

### 3. Data Structures

#### Strings
The simplest type — binary-safe byte sequences up to 512 MB.

**Internal Encodings**:
- **int**: Values representable as 64-bit signed integer (8 bytes)
- **embstr**: Strings ≤ 44 bytes (single allocation, immutable SDS)
- **raw**: Strings > 44 bytes (separate SDS allocation)

**Core Commands**: `GET`, `SET`, `MGET`, `MSET`, `SETNX`, `SETEX`, `INCR`, `DECR`, `INCRBY`, `DECRBY`, `INCRBYFLOAT`, `APPEND`, `STRLEN`, `GETRANGE`, `SETRANGE`, `GETSET`, `GETDEL`

#### Lists
Ordered sequences of strings. Doubly-linked with fast head/tail operations.

**Internal Encodings**:
- **listpack** (formerly ziplist): Small lists (≤128 elements, each ≤64 bytes)
- **quicklist**: Linked list of listpack nodes (larger lists)

**Core Commands**: `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LLEN`, `LRANGE`, `LINDEX`, `LSET`, `LINSERT`, `LREM`, `LTRIM`, `LPOS`, `LMPOP`, `BLPOP`, `BRPOP`, `BLMOVE`, `LMOVE`

#### Sets
Unordered collections of unique strings.

**Internal Encodings**:
- **listpack**: Small sets (≤128 elements, each ≤64 bytes)
- **intset**: Sets of integers only (up to 512 elements)
- **hashtable**: General case

**Core Commands**: `SADD`, `SREM`, `SMEMBERS`, `SISMEMBER`, `SMISMEMBER`, `SCARD`, `SPOP`, `SRANDMEMBER`, `SUNION`, `SINTER`, `SDIFF`, `SUNIONSTORE`, `SINTERSTORE`, `SDIFFSTORE`, `SINTERCARD`, `SSCAN`

#### Sorted Sets (ZSets)
Sets where each element has an associated floating-point score, maintained in sorted order.

**Internal Encodings**:
- **listpack**: Small sorted sets (≤128 elements, each ≤64 bytes)
- **skiplist + hashtable**: General case (skiplist for range queries, hashtable for O(1) lookups)

**Core Commands**: `ZADD`, `ZREM`, `ZSCORE`, `ZRANK`, `ZREVRANK`, `ZRANGE`, `ZREVRANGE`, `ZRANGEBYSCORE`, `ZREVRANGEBYSCORE`, `ZRANGEBYLEX`, `ZRANGESTORE`, `ZCARD`, `ZCOUNT`, `ZLEXCOUNT`, `ZINCRBY`, `ZUNIONSTORE`, `ZINTERSTORE`, `ZDIFFSTORE`, `ZMPOP`, `BZMPOP`, `ZPOPMIN`, `ZPOPMAX`, `BZPOPMIN`, `BZPOPMAX`, `ZRANDMEMBER`, `ZMSCORE`, `ZSCAN`

#### Hashes
Maps of field-value pairs, ideal for representing objects.

**Internal Encodings**:
- **listpack**: Small hashes (≤128 fields, each field/value ≤64 bytes)
- **hashtable**: General case

**Core Commands**: `HSET`, `HGET`, `HMGET`, `HGETALL`, `HDEL`, `HEXISTS`, `HLEN`, `HKEYS`, `HVALS`, `HINCRBY`, `HINCRBYFLOAT`, `HSETNX`, `HRANDFIELD`, `HSCAN`

#### Streams
Append-only log data structure with consumer group support, designed for event sourcing and message brokering.

**Structure**:
```
Stream {
    entries: RadixTree<StreamId, HashMap<Field, Value>>,
    length: u64,
    last_id: StreamId,          // "timestamp-sequence"
    consumer_groups: Vec<ConsumerGroup>,
}

ConsumerGroup {
    name: String,
    last_delivered_id: StreamId,
    pending_entries: PendingEntryList,  // PEL
    consumers: HashMap<String, Consumer>,
}

Consumer {
    name: String,
    seen_time: u64,
    pending_entries: Vec<StreamId>,
}
```

**Core Commands**: `XADD`, `XREAD`, `XRANGE`, `XREVRANGE`, `XLEN`, `XTRIM`, `XDEL`, `XINFO`, `XGROUP CREATE`, `XGROUP DESTROY`, `XGROUP DELCONSUMER`, `XGROUP SETID`, `XREADGROUP`, `XACK`, `XCLAIM`, `XAUTOCLAIM`, `XPENDING`

#### Bitmaps
Bit-level operations on string values, treating strings as arrays of bits.

**Core Commands**: `SETBIT`, `GETBIT`, `BITCOUNT`, `BITPOS`, `BITOP` (AND/OR/XOR/NOT), `BITFIELD`, `BITFIELD_RO`

**Use Cases**: Feature flags, bloom filters, user online status, daily active users

#### HyperLogLog
Probabilistic data structure for cardinality estimation (count distinct elements) with ~0.81% standard error using ~12 KB regardless of set size.

**Core Commands**: `PFADD`, `PFCOUNT`, `PFMERGE`, `PFDEBUG`

**Implementation**: Uses 16384 registers (6 bits each), sparse representation for small cardinalities

#### Geospatial
Location-based indexing using sorted sets with geohash-encoded scores.

**Core Commands**: `GEOADD`, `GEODIST`, `GEOHASH`, `GEOPOS`, `GEORADIUS` (deprecated), `GEORADIUSBYMEMBER` (deprecated), `GEOSEARCH`, `GEOSEARCHSTORE`

### 4. Persistence

#### RDB (Redis Database) Snapshots
Point-in-time binary dump of the entire dataset.

```
RDB Process:
1. Parent process calls fork()
2. Child process inherits copy-on-write memory pages
3. Child writes all data to temp RDB file
4. Child renames temp file to dump.rdb (atomic)
5. Child exits

Trigger Conditions (configurable):
  save 900 1      # After 900 sec if at least 1 key changed
  save 300 10     # After 300 sec if at least 10 keys changed
  save 60 10000   # After 60 sec if at least 10000 keys changed
```

**RDB File Format**:
```
REDIS<version>     # Magic string + RDB version (e.g., "REDIS0011")
FA <aux-field>     # Auxiliary fields (redis-ver, redis-bits, ctime, used-mem)
FE <db-number>     # Database selector
FB <db-size> <expire-size>  # Hash table sizes
<key-value pairs>  # Type byte + optional expire + key + value
FF                 # EOF marker
<8-byte checksum>  # CRC-64 checksum
```

**Pros**: Compact, fast restore, good for backups/disaster recovery
**Cons**: Data loss between snapshots, fork() memory spike on large datasets

#### AOF (Append-Only File)
Logs every write command for replay recovery.

```
AOF Modes:
  appendfsync always    # fsync after every write (safest, slowest)
  appendfsync everysec  # fsync every second (good tradeoff) — DEFAULT
  appendfsync no        # OS-controlled fsync (fastest, least safe)

AOF Rewrite Process:
1. Parent forks child
2. Child writes compact AOF from current memory state
3. Parent buffers new writes to AOF rewrite buffer
4. Child finishes → parent appends buffer to new AOF
5. Atomic rename of new AOF over old
```

**Multi-Part AOF (Redis 7.0+)**:
```
appendonlydir/
├── appendonly.aof.1.base.rdb    # Base RDB snapshot
├── appendonly.aof.1.incr.aof    # Incremental AOF commands
├── appendonly.aof.2.incr.aof    # More incremental commands
└── appendonly.aof.manifest      # Manifest tracking all parts
```

#### Combined Persistence (RDB + AOF)
- AOF for durability (minimal data loss)
- RDB for fast restarts and backups
- When both enabled, AOF is used for recovery (more complete)

### 5. Replication

**Asynchronous master-replica replication** for read scaling and high availability.

```
Replication Flow:
1. Replica sends REPLCONF and PSYNC to master
2. Master starts BGSAVE (if needed) → sends RDB to replica
3. Master streams buffered commands to replica
4. Ongoing: master propagates every write to all replicas

Partial Resync (PSYNC2):
  - Master maintains replication backlog (circular buffer, default 1MB)
  - Each master has a replication ID + offset
  - On reconnect, replica sends last replication ID + offset
  - If offset is in backlog → partial resync (fast)
  - Otherwise → full resync (slow)
```

**Replication Configuration**:
```
replicaof <master-host> <master-port>
masterauth <password>
replica-read-only yes
repl-backlog-size 1mb
repl-backlog-ttl 3600
min-replicas-to-write 1
min-replicas-max-lag 10
```

**WAIT Command**: Synchronous replication — block until N replicas acknowledge writes

### 6. Sentinel (High Availability)

Automatic failover monitoring system running as separate processes.

```
Sentinel Responsibilities:
  - Monitor master and replicas for health
  - Notify administrators via pub/sub or scripts
  - Automatic failover: promote replica to master
  - Configuration provider: clients query Sentinel for current master

Quorum Mechanism:
  - sentinel monitor mymaster 127.0.0.1 6379 2
  - Quorum = 2: need 2 Sentinels to agree master is down
  - Majority required to authorize failover
  - Recommended: 3+ Sentinels in separate failure domains
```

### 7. Cluster Mode

Horizontal sharding across multiple nodes using hash slots.

```
Hash Slot System:
  - 16384 hash slots (0-16383)
  - Key's slot = CRC16(key) % 16384
  - Each master node owns a subset of slots
  - Hash tags: {user}.name → slot calculated from "user" only

Minimum Cluster: 3 master nodes (each with 1 replica = 6 nodes total)

Node Communication: Gossip protocol
  - Each node sends PING to random node every 100ms
  - PING contains: node state, slot assignments, config epoch
  - Failure detection: PFAIL → FAIL (majority agreement)
  - Config epochs resolve split-brain slot ownership

Client Redirection:
  MOVED 3999 127.0.0.1:6381    # Permanent redirect (slot migrated)
  ASK 3999 127.0.0.1:6381      # Temporary redirect (slot migrating)
```

**Cluster Commands**: `CLUSTER INFO`, `CLUSTER NODES`, `CLUSTER MEET`, `CLUSTER ADDSLOTS`, `CLUSTER DELSLOTS`, `CLUSTER SETSLOT`, `CLUSTER REPLICATE`, `CLUSTER FAILOVER`, `CLUSTER RESET`, `CLUSTER SLOTS`, `CLUSTER SHARDS`

### 8. Pub/Sub

Fire-and-forget publish/subscribe messaging.

```
Channel Types:
  - Regular channels: SUBSCRIBE channel1 channel2
  - Pattern channels: PSUBSCRIBE news.* sports.*
  - Sharded channels (Cluster): SSUBSCRIBE {shard}channel

Semantics:
  - At-most-once delivery (fire and forget)
  - No persistence — messages lost if no subscriber connected
  - No acknowledgment mechanism
  - Subscribers receive messages in real-time only
```

**Commands**: `SUBSCRIBE`, `UNSUBSCRIBE`, `PUBLISH`, `PSUBSCRIBE`, `PUNSUBSCRIBE`, `PUBSUB CHANNELS`, `PUBSUB NUMSUB`, `PUBSUB NUMPAT`, `PUBSUB SHARDCHANNELS`, `PUBSUB SHARDNUMSUB`, `SSUBSCRIBE`, `SUNSUBSCRIBE`, `SPUBLISH`

### 9. Transactions

```
MULTI/EXEC Transaction:
  MULTI           # Start transaction
  SET key1 "a"    # Queued
  SET key2 "b"    # Queued
  INCR key3       # Queued
  EXEC            # Execute all atomically

WATCH (Optimistic Locking):
  WATCH key1      # Watch for changes
  val = GET key1
  MULTI
  SET key1 (val + 1)
  EXEC            # Fails if key1 changed since WATCH

Semantics:
  - All-or-nothing execution (no partial failures)
  - Commands execute sequentially, no interleaving
  - No rollback — if a command fails, others still execute
  - DISCARD aborts transaction
```

### 10. Lua Scripting

```lua
-- EVAL script numkeys key [key ...] arg [arg ...]
-- Scripts execute atomically (block all other commands)

-- Example: Rate limiter
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = tonumber(redis.call('GET', key) or '0')
if current >= limit then
    return 0  -- Rate limited
end

redis.call('INCR', key)
if current == 0 then
    redis.call('EXPIRE', key, window)
end
return 1  -- Allowed
```

**Script Commands**: `EVAL`, `EVALSHA`, `EVALRO`, `EVALSHA_RO`, `SCRIPT LOAD`, `SCRIPT EXISTS`, `SCRIPT FLUSH`, `SCRIPT DEBUG`

**Functions (Redis 7.0+)**: Named, persistent server-side functions
```
FUNCTION LOAD "#!lua name=mylib\nredis.register_function('myfunc', function(keys, args) ... end)"
FCALL myfunc 1 key1 arg1
```

### 11. Modules API

Extend the server with dynamically loaded C modules.

```
Notable Modules:
  - RedisJSON: Native JSON document operations (JSONPath queries)
  - RediSearch: Full-text search, secondary indexing, aggregation
  - RedisTimeSeries: Time-series data with downsampling/aggregation
  - RedisBloom: Bloom filters, cuckoo filters, count-min sketch, top-K
  - RedisGraph: Graph database with Cypher queries (DEPRECATED)
  - RedisAI: Tensor operations and ML model serving

Module API Capabilities:
  - Register new commands and data types
  - Hook into key-space notifications
  - Create background threads
  - Block clients waiting for events
  - Cluster-aware command routing
```

### 12. Security

#### ACL (Access Control Lists) — Redis 6.0+
```
ACL SETUSER myuser on >password ~cached:* &* +get +set +del -@dangerous
  on            → Enable the user
  >password     → Set password
  ~cached:*     → Allow keys matching pattern
  &*            → Allow all pub/sub channels
  +get +set     → Allow specific commands
  -@dangerous   → Deny dangerous command category

ACL Categories: @read, @write, @set, @sortedset, @list, @hash, @string,
  @bitmap, @hyperloglog, @geo, @stream, @pubsub, @admin, @fast, @slow,
  @blocking, @dangerous, @connection, @transaction, @scripting, @keyspace
```

#### TLS/SSL
```
tls-port 6380
tls-cert-file /path/to/cert.pem
tls-key-file /path/to/key.pem
tls-ca-cert-file /path/to/ca.pem
tls-auth-clients optional
tls-replication yes
tls-cluster yes
```

## Architecture Patterns

### Single-Threaded Event Loop (Core Model)
```
Main Thread:
├── Event Loop (epoll/kqueue)
│   ├── Accept new client connections
│   ├── Read client commands
│   ├── Execute commands (single-threaded — atomic)
│   ├── Write responses
│   └── Process timers (expiry, cron jobs)
├── I/O Threads (Redis 6.0+, optional)
│   ├── Read client input (parse RESP)
│   └── Write client output (serialize RESP)
│   └── NOTE: Command execution still single-threaded
├── Background Threads
│   ├── BIO_CLOSE_FILE: Close file descriptors
│   ├── BIO_AOF_FSYNC: Flush AOF to disk
│   └── BIO_LAZY_FREE: Async memory deallocation (UNLINK, FLUSHDB ASYNC)
└── Fork Processes
    ├── RDB snapshot child
    └── AOF rewrite child
```

### Multi-Threaded Alternative (DragonflyDB-style)
```
Shared-Nothing Architecture:
├── Thread 0 → owns keys hashing to shard 0
├── Thread 1 → owns keys hashing to shard 1
├── ...
├── Thread N → owns keys hashing to shard N
└── No locks needed — each thread is independent

Benefits: 10-25x throughput on multi-core machines
Tradeoff: Multi-key commands crossing shards require coordination
```

## Data Flow Diagrams

### Command Execution Flow
```
Client                    Server
  │                         │
  │──── RESP Request ──────▶│
  │   *3\r\n$3\r\nSET\r\n  │
  │   $3\r\nkey\r\n         │──▶ Parse RESP
  │   $5\r\nvalue\r\n       │──▶ Lookup command table
  │                         │──▶ Check ACL permissions
  │                         │──▶ Execute command handler
  │                         │──▶ Propagate to AOF (if enabled)
  │                         │──▶ Propagate to replicas
  │◀── RESP Response ───────│
  │   +OK\r\n               │
```

### Replication Data Flow
```
┌──────────┐    Full Sync    ┌──────────┐
│  Master  │────RDB file────▶│ Replica  │
└──────────┘                 └──────────┘
      │         Partial        │
      │──── Backlog stream ───▶│
      │                        │
      │    Ongoing writes      │
      │──── Command stream ───▶│
      │                        │
      │         WAIT           │
      │◀── ACK (offset) ──────│
```

### Cluster Slot Routing
```
Client                  Node A (slots 0-5460)     Node B (slots 5461-10922)
  │                            │                          │
  │── GET key1 ──────────────▶ │                          │
  │   (slot 9189)              │                          │
  │◀── MOVED 9189 NodeB ──────│                          │
  │                            │                          │
  │── GET key1 ─────────────────────────────────────────▶ │
  │◀── "value1" ──────────────────────────────────────────│
```

## Configuration Model

### Core Configuration
```yaml
# Server
bind 0.0.0.0
port 6379
protected-mode yes
tcp-backlog 511
timeout 0
tcp-keepalive 300

# Memory
maxmemory 4gb
maxmemory-policy allkeys-lfu
maxmemory-samples 10

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Replication
replicaof <masterip> <masterport>
replica-read-only yes
repl-backlog-size 1mb

# Security
requirepass <password>
aclfile /etc/redis/users.acl

# Cluster
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 15000

# Performance
io-threads 4
io-threads-do-reads yes
lazyfree-lazy-eviction yes
lazyfree-lazy-expire yes
lazyfree-lazy-server-del yes
lazyfree-lazy-user-del yes
```

## Extension Points

### 1. Custom Commands (Module API)
```c
int MyCommand_RedisCommand(RedisModuleCtx *ctx, RedisModuleString **argv, int argc) {
    RedisModule_AutoMemory(ctx);
    if (argc != 3) return RedisModule_WrongArity(ctx);
    
    RedisModuleKey *key = RedisModule_OpenKey(ctx, argv[1], REDISMODULE_READ|REDISMODULE_WRITE);
    // Custom logic here
    RedisModule_ReplyWithSimpleString(ctx, "OK");
    return REDISMODULE_OK;
}

int RedisModule_OnLoad(RedisModuleCtx *ctx, RedisModuleString **argv, int argc) {
    if (RedisModule_Init(ctx, "mymodule", 1, REDISMODULE_APIVER_1) == REDISMODULE_ERR)
        return REDISMODULE_ERR;
    RedisModule_CreateCommand(ctx, "mymodule.mycommand", MyCommand_RedisCommand,
                              "write deny-oom", 1, 1, 1);
    return REDISMODULE_OK;
}
```

### 2. Custom Data Types
```c
static RedisModuleType *MyType;

RedisModuleTypeMethods tm = {
    .version = REDISMODULE_TYPE_METHOD_VERSION,
    .rdb_load = MyTypeRdbLoad,
    .rdb_save = MyTypeRdbSave,
    .aof_rewrite = MyTypeAofRewrite,
    .free = MyTypeFree,
    .digest = MyTypeDigest,
    .mem_usage = MyTypeMemUsage,
};

MyType = RedisModule_CreateDataType(ctx, "mytype-ab", 1, &tm);
```

### 3. Keyspace Notifications
```
CONFIG SET notify-keyspace-events KEA

Event Types:
  K → Keyspace events (__keyspace@<db>__:<key>)
  E → Keyevent events (__keyevent@<db>__:<event>)
  g → Generic: DEL, EXPIRE, RENAME, ...
  $ → String commands
  l → List commands
  s → Set commands
  z → Sorted set commands
  h → Hash commands
  t → Stream commands
  x → Expired events
  e → Evicted events
  A → Alias for "g$lszhxet"
```

### 4. Client-Side Caching (RESP3)
```
CLIENT TRACKING ON REDIRECT <client-id>
CLIENT TRACKING ON BCAST PREFIX user: PREFIX session:

Server pushes invalidation:
  > Invalidation notification
  > 2
  > invalidate
  > 1
  > user:1000
```

## Security Considerations

### 1. Authentication & Authorization
- **Legacy**: Single password via `requirepass`
- **Modern**: ACL system with per-user permissions (commands, keys, channels)
- **ACL Selectors** (7.2+): Multiple permission sets per user for complex access patterns
- **Default user**: Full access — must be restricted in production

### 2. Network Security
- **Protected mode**: Reject external connections without auth (default)
- **Bind address**: Restrict listening interfaces
- **TLS/SSL**: Encrypt client, replication, and cluster bus traffic
- **Rename dangerous commands**: `rename-command FLUSHALL ""`

### 3. Attack Surface
- **DEBUG/CONFIG/EVAL**: Restrict to admin users only
- **Lua sandbox**: Limited library access (no I/O, no os.execute)
- **Module loading**: Restrict `MODULE LOAD` to trusted paths
- **KEYS command**: Avoid in production (O(N), blocks event loop) — use SCAN instead

### 4. Data Protection
- **RDB/AOF encryption**: Not built-in — use filesystem-level encryption
- **Memory scrubbing**: Sensitive data persists in RAM after deletion
- **Password hashing**: ACL passwords stored as SHA-256 hashes

## Performance Targets

### Throughput (single node, single thread)
| Operation | Target | Minimum |
|-----------|--------|---------|
| GET (small value) | 150,000 ops/sec | 100,000 ops/sec |
| SET (small value) | 150,000 ops/sec | 100,000 ops/sec |
| LPUSH | 150,000 ops/sec | 100,000 ops/sec |
| ZADD | 120,000 ops/sec | 80,000 ops/sec |
| HSET | 130,000 ops/sec | 90,000 ops/sec |
| Pipeline (16 commands) | 500,000+ ops/sec | 300,000 ops/sec |
| PUBLISH (100 subscribers) | 100,000 msgs/sec | 60,000 msgs/sec |

### Latency
| Metric | Target | Maximum |
|--------|--------|---------|
| P50 (GET/SET) | < 0.1ms | < 0.5ms |
| P99 (GET/SET) | < 0.5ms | < 1ms |
| P99.9 (GET/SET) | < 1ms | < 5ms |
| P99 during RDB save | < 2ms | < 10ms |
| Cluster redirect overhead | < 0.2ms | < 1ms |

### Memory Efficiency
| Scenario | Target Overhead |
|----------|----------------|
| Small string (≤44 bytes) | ≤ 90 bytes per key |
| Integer value | ≤ 72 bytes per key |
| Hash (10 fields, small values) | ≤ 200 bytes per key |
| Sorted set (100 elements) | ≤ 8 KB per key |
| 1M string keys (100-byte values) | ≤ 250 MB total |

### Replication & Cluster
| Metric | Target |
|--------|--------|
| Replication lag (steady state) | < 1ms |
| Full resync time (1GB dataset) | < 10 seconds |
| Sentinel failover time | < 15 seconds |
| Cluster failover time | < 5 seconds |
| Cluster slot migration (1000 keys) | < 2 seconds |

## Implementation Architecture

### Core Components
1. **RESP Parser/Serializer**: Wire protocol encoding/decoding
2. **Command Table**: Command dispatch, arity checking, ACL flags
3. **Data Structure Engine**: All data type implementations
4. **Memory Allocator Interface**: jemalloc/mimalloc abstraction
5. **Event Loop**: I/O multiplexing, timer management
6. **Persistence Engine**: RDB snapshots and AOF logging
7. **Replication Engine**: Master/replica sync protocol
8. **Cluster Engine**: Gossip protocol, hash slot routing, resharding
9. **Pub/Sub Engine**: Channel management, message routing
10. **Scripting Engine**: Lua VM integration, function registry
11. **ACL Engine**: User management, permission evaluation
12. **Metrics Collector**: INFO stats, latency tracking, slowlog

### Core Data Structures (Implementation)
```rust
// Main database
struct Database {
    id: u8,
    keyspace: HashMap<Vec<u8>, DataObject>,
    expires: HashMap<Vec<u8>, u64>,   // key → expire timestamp
    blocking_keys: HashMap<Vec<u8>, Vec<ClientId>>,  // for BLPOP etc.
    watched_keys: HashMap<Vec<u8>, Vec<ClientId>>,   // for WATCH
}

// Data object with type and encoding
struct DataObject {
    obj_type: DataType,
    encoding: ObjectEncoding,
    data: DataValue,
    lru_clock: u32,
    ref_count: u32,
}

enum DataType {
    String, List, Set, ZSet, Hash, Stream,
    // Module-defined types
    Module(ModuleTypeId),
}

enum ObjectEncoding {
    Raw, Int, EmbStr,           // String encodings
    ListPack, QuickList,        // List encodings
    IntSet, HT,                 // Set encodings
    SkipList,                   // ZSet encoding (+ HT)
    Stream,                     // Stream (radix tree)
}

enum DataValue {
    String(SDS),
    Integer(i64),
    List(QuickList),
    Set(SetInner),
    ZSet(ZSetInner),
    Hash(HashInner),
    Stream(StreamInner),
}

// Client connection
struct Client {
    id: u64,
    fd: i32,
    db: u8,
    name: Option<String>,
    flags: ClientFlags,
    query_buf: Vec<u8>,
    reply_buf: VecDeque<Vec<u8>>,
    reply_bytes: usize,
    authenticated: bool,
    user: AclUser,
    multi_state: Option<MultiState>,   // Transaction state
    watched_keys: Vec<WatchedKey>,
    blocked_state: Option<BlockedState>,
    resp_version: u8,                  // 2 or 3
    tracking: Option<TrackingState>,   // Client-side caching
}
```

This blueprint provides the comprehensive specification for implementing a production-grade, Redis/Valkey-compatible key-value store with all essential features, rich data structures, persistence, clustering, and extensibility clearly defined.
