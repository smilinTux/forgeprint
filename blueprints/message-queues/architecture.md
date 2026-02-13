# Message Queue Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing production-grade message queue systems. It covers broker design, storage engines, partitioning, replication, consumer coordination, serialization, and backpressure — the fundamental building blocks that determine throughput, latency, durability, and scalability characteristics.

## Architectural Foundations

### 1. Broker Architecture Patterns

#### Centralized Broker (Recommended for Most Use Cases)
**Messages routed through dedicated broker nodes that manage storage, replication, and delivery**

```rust
struct BrokerNode {
    node_id: u32,
    config: BrokerConfig,
    network_acceptor: NetworkAcceptor,       // NIO/epoll connection handling
    request_handler_pool: RequestHandlerPool, // Thread pool for request processing
    log_manager: LogManager,                  // Partition log management
    replica_manager: ReplicaManager,          // Leader/follower replication
    group_coordinator: GroupCoordinator,      // Consumer group management
    controller: Option<Controller>,           // Cluster metadata (if elected)
    fetch_purgatory: DelayedOperationPurgatory, // Delayed fetch responses
    produce_purgatory: DelayedOperationPurgatory, // Delayed produce acks
    quota_manager: QuotaManager,             // Client rate limiting
    metrics: BrokerMetrics,
}

impl BrokerNode {
    fn start(&mut self) -> Result<(), BrokerError> {
        // 1. Load partition logs from disk
        self.log_manager.load_logs()?;
        
        // 2. Start replication from leaders
        self.replica_manager.start_replica_fetchers()?;
        
        // 3. Start network acceptor
        self.network_acceptor.start()?;
        
        // 4. Start request handler threads
        self.request_handler_pool.start()?;
        
        // 5. Register with cluster controller
        self.register_with_controller()?;
        
        // 6. Start group coordinator
        self.group_coordinator.start()?;
        
        Ok(())
    }
}
```

**Benefits:**
- Centralized message storage simplifies durability guarantees
- Broker manages ordering, replication, and consumer state
- Well-understood operational model
- Rich feature set (transactions, compaction, exactly-once)

**Considerations:**
- Broker is a potential bottleneck
- Network hop adds latency vs brokerless
- Storage capacity bound by broker disk

#### Brokerless Architecture (ZeroMQ-style)
**Direct peer-to-peer messaging with no central broker**

```rust
struct BrokerlessNode {
    identity: NodeIdentity,
    sockets: HashMap<SocketType, Socket>,
    io_threads: Vec<IoThread>,
    message_patterns: Vec<Box<dyn MessagePattern>>,
}

enum SocketType {
    Publisher,    // PUB: one-to-many broadcast
    Subscriber,   // SUB: receive from publishers
    Push,         // PUSH: round-robin to workers
    Pull,         // PULL: receive from pushers
    Request,      // REQ: synchronous request
    Reply,        // REP: synchronous reply
    Dealer,       // DEALER: async request distribution
    Router,       // ROUTER: async reply routing
}
```

**Benefits:**
- No broker bottleneck; scales with number of peers
- Lowest possible latency (direct socket communication)
- No single point of failure
- Embeddable as a library

**Considerations:**
- No built-in persistence (messages lost on crash)
- No server-side filtering or routing
- Application responsible for discovery, ordering, delivery guarantees
- Complex topology management

#### Log-Based Broker (Kafka/Redpanda-style)
**Append-only commit log as the central data structure**

```rust
struct LogBasedBroker {
    node_id: u32,
    log_manager: CommitLogManager,
    partition_leaders: HashMap<TopicPartition, PartitionLeader>,
    partition_followers: HashMap<TopicPartition, PartitionFollower>,
    controller: KRaftController,  // Raft-based metadata
}

struct CommitLogManager {
    log_dirs: Vec<PathBuf>,
    logs: HashMap<TopicPartition, CommitLog>,
    cleaner: LogCleaner,
    recovery_point_checkpoint: RecoveryPointCheckpoint,
}

struct CommitLog {
    topic_partition: TopicPartition,
    segments: SegmentList,
    active_segment: LogSegment,
    next_offset: AtomicU64,
    high_watermark: AtomicU64,
    log_start_offset: u64,
    recovery_point: u64,
    config: LogConfig,
}
```

**Benefits:**
- Sequential disk I/O (extremely fast writes)
- Message replay from any offset
- Natural fit for event sourcing and stream processing
- Decouples producer speed from consumer speed

**Considerations:**
- Higher disk usage (retain all messages for retention period)
- Consumer manages own offset (more complex client)
- No per-message routing flexibility

#### Queue-Based Broker (RabbitMQ/ActiveMQ-style)
**Traditional message queue with exchanges, bindings, and acknowledgments**

```rust
struct QueueBasedBroker {
    vhosts: HashMap<String, VirtualHost>,
    connection_manager: ConnectionManager,
    channel_manager: ChannelManager,
    exchange_registry: ExchangeRegistry,
    queue_registry: QueueRegistry,
    binding_registry: BindingRegistry,
}

struct VirtualHost {
    name: String,
    exchanges: HashMap<String, Exchange>,
    queues: HashMap<String, MessageQueue>,
    bindings: Vec<Binding>,
    permissions: PermissionSet,
}

struct Exchange {
    name: String,
    exchange_type: ExchangeType,  // Direct, Fanout, Topic, Headers
    durable: bool,
    auto_delete: bool,
    bindings: Vec<Binding>,
}

enum ExchangeType {
    Direct,   // Route by exact routing key match
    Fanout,   // Broadcast to all bound queues
    Topic,    // Route by wildcard routing key pattern
    Headers,  // Route by header attribute matching
}

struct MessageQueue {
    name: String,
    durable: bool,
    exclusive: bool,
    auto_delete: bool,
    messages: VecDeque<QueuedMessage>,
    consumers: Vec<Consumer>,
    dead_letter_exchange: Option<String>,
    max_length: Option<u64>,
    max_length_bytes: Option<u64>,
    message_ttl: Option<Duration>,
    delivery_limit: Option<u32>,
}
```

**Benefits:**
- Rich routing via exchange types and bindings
- Per-message acknowledgment and redelivery
- Message-level TTL and priority
- Built-in dead letter exchanges

**Considerations:**
- Lower throughput than log-based (per-message tracking overhead)
- Message ordering can be affected by redelivery
- Harder to replay historical messages

### 2. Network Layer Architecture

#### Connection Management
```rust
struct NetworkAcceptor {
    listeners: Vec<Listener>,
    selector: Selector,        // epoll/kqueue wrapper
    processors: Vec<NetworkProcessor>,
    accept_queue: ConcurrentQueue<SocketChannel>,
}

struct Listener {
    endpoint: SocketAddr,
    security_protocol: SecurityProtocol,
    server_socket: TcpListener,
}

enum SecurityProtocol {
    Plaintext,
    Ssl,
    SaslPlaintext,
    SaslSsl,
}

struct NetworkProcessor {
    id: u32,
    selector: Selector,
    new_connections: ConcurrentQueue<SocketChannel>,
    inflight_requests: HashMap<ConnectionId, RequestContext>,
    response_queue: ConcurrentQueue<Response>,
}

impl NetworkProcessor {
    fn run(&mut self) {
        loop {
            // Register new connections
            self.register_new_connections();
            
            // Poll for I/O events
            let ready_keys = self.selector.poll(POLL_TIMEOUT_MS);
            
            for key in ready_keys {
                if key.is_readable() {
                    self.handle_read(key);
                }
                if key.is_writable() {
                    self.handle_write(key);
                }
            }
            
            // Send completed responses
            self.flush_responses();
        }
    }
    
    fn handle_read(&mut self, key: SelectionKey) {
        let channel = key.channel();
        
        // Read request header (size + api_key + version + correlation_id)
        let header = self.read_request_header(channel)?;
        
        // Read request body
        let body = self.read_request_body(channel, header.size)?;
        
        // Dispatch to request handler pool
        let request = Request { header, body, connection_id: key.connection_id() };
        self.request_queue.push(request);
    }
}
```

#### Request Processing Pipeline
```rust
struct RequestHandlerPool {
    threads: Vec<JoinHandle<()>>,
    request_queue: ConcurrentQueue<Request>,
    api_handlers: HashMap<ApiKey, Box<dyn ApiHandler>>,
}

trait ApiHandler: Send + Sync {
    fn handle(&self, request: &Request, context: &mut RequestContext) -> Response;
}

enum ApiKey {
    Produce = 0,
    Fetch = 1,
    ListOffsets = 2,
    Metadata = 3,
    OffsetCommit = 8,
    OffsetFetch = 9,
    FindCoordinator = 10,
    JoinGroup = 11,
    Heartbeat = 12,
    LeaveGroup = 13,
    SyncGroup = 14,
    CreateTopics = 19,
    DeleteTopics = 20,
    InitProducerId = 22,
    AddPartitionsToTxn = 24,
    EndTxn = 26,
    TxnOffsetCommit = 28,
    // ... more API keys
}

struct ProduceHandler {
    replica_manager: Arc<ReplicaManager>,
    purgatory: Arc<DelayedOperationPurgatory>,
}

impl ApiHandler for ProduceHandler {
    fn handle(&self, request: &Request, context: &mut RequestContext) -> Response {
        let produce_request = ProduceRequest::parse(&request.body);
        
        // Validate topic authorization
        self.check_authorization(context, &produce_request)?;
        
        // Append to local log
        let results = self.replica_manager.append_to_local_log(
            &produce_request.topic_data
        );
        
        match produce_request.acks {
            0 => {
                // Fire and forget — respond immediately
                Response::empty()
            },
            1 => {
                // Leader ACK — respond after local append
                self.build_produce_response(&results)
            },
            -1 => {
                // All ISR ACK — wait for replication
                let delayed_produce = DelayedProduce::new(
                    produce_request.timeout_ms,
                    results,
                );
                self.purgatory.try_complete_or_watch(delayed_produce)
            },
            _ => Response::error(ErrorCode::InvalidRequiredAcks),
        }
    }
}
```

### 3. Log-Based Storage Engine

#### Segment-Based Log Architecture
```rust
struct LogSegment {
    base_offset: u64,
    log: FileChannel,              // Message data file (.log)
    offset_index: OffsetIndex,     // Offset → position (.index)
    time_index: TimeIndex,         // Timestamp → offset (.timeindex)
    txn_index: TransactionIndex,   // Transaction state (.txnindex)
    
    size_bytes: AtomicU64,
    max_timestamp: AtomicI64,
    created_time: Instant,
    config: LogSegmentConfig,
}

struct LogSegmentConfig {
    max_segment_bytes: u64,       // Default: 1GB
    index_interval_bytes: u32,    // Default: 4096 (index entry every 4KB)
    max_index_size: u64,          // Default: 10MB
    segment_ms: Option<u64>,      // Time-based segment rolling
}

impl LogSegment {
    fn append(&mut self, records: &RecordBatch) -> Result<AppendResult, LogError> {
        // 1. Validate records
        self.validate_records(records)?;
        
        // 2. Assign offsets
        let first_offset = self.next_offset();
        records.set_base_offset(first_offset);
        
        // 3. Write to log file (sequential append)
        let position = self.log.position();
        let bytes_written = self.log.append(records.serialize())?;
        
        // 4. Update offset index (sparse — every index_interval_bytes)
        if self.bytes_since_last_index_entry >= self.config.index_interval_bytes {
            self.offset_index.append(first_offset, position)?;
            self.bytes_since_last_index_entry = 0;
        }
        self.bytes_since_last_index_entry += bytes_written as u32;
        
        // 5. Update time index
        let max_timestamp = records.max_timestamp();
        if max_timestamp > self.max_timestamp.load(Ordering::Acquire) {
            self.time_index.append(max_timestamp, first_offset)?;
            self.max_timestamp.store(max_timestamp, Ordering::Release);
        }
        
        // 6. Update size
        self.size_bytes.fetch_add(bytes_written as u64, Ordering::Release);
        
        Ok(AppendResult {
            first_offset,
            last_offset: first_offset + records.count() as u64 - 1,
            bytes_written,
        })
    }
    
    fn read(&self, start_offset: u64, max_bytes: u32) -> Result<FetchResult, LogError> {
        // 1. Look up physical position from offset index
        let position = self.offset_index.lookup(start_offset)?;
        
        // 2. Scan forward from indexed position to find exact offset
        let exact_position = self.scan_to_offset(position, start_offset)?;
        
        // 3. Read message data using zero-copy (sendfile)
        let data = self.log.read_from(exact_position, max_bytes)?;
        
        Ok(FetchResult {
            records: data,
            high_watermark: self.high_watermark(),
        })
    }
    
    fn should_roll(&self) -> bool {
        self.size_bytes.load(Ordering::Acquire) >= self.config.max_segment_bytes ||
        self.offset_index.is_full() ||
        self.time_index.is_full() ||
        self.config.segment_ms.map_or(false, |ms| {
            self.created_time.elapsed().as_millis() as u64 >= ms
        })
    }
}
```

#### Record Batch Format
```rust
// On-disk record batch format (Kafka v2 compatible)
struct RecordBatch {
    base_offset: i64,           // 8 bytes
    batch_length: i32,          // 4 bytes
    partition_leader_epoch: i32, // 4 bytes
    magic: i8,                  // 1 byte (version = 2)
    crc: u32,                   // 4 bytes (CRC32-C of remaining)
    attributes: i16,            // 2 bytes (compression, timestamp type, transactional, control)
    last_offset_delta: i32,     // 4 bytes
    base_timestamp: i64,        // 8 bytes
    max_timestamp: i64,         // 8 bytes
    producer_id: i64,           // 8 bytes
    producer_epoch: i16,        // 2 bytes
    base_sequence: i32,         // 4 bytes
    records_count: i32,         // 4 bytes
    records: Vec<Record>,       // Variable length
}

struct Record {
    length: VarInt,
    attributes: i8,
    timestamp_delta: VarInt,
    offset_delta: VarInt,
    key_length: VarInt,
    key: Option<Vec<u8>>,
    value_length: VarInt,
    value: Option<Vec<u8>>,
    headers: Vec<RecordHeader>,
}

impl RecordBatch {
    fn compression_type(&self) -> CompressionType {
        match self.attributes & 0x07 {
            0 => CompressionType::None,
            1 => CompressionType::Gzip,
            2 => CompressionType::Snappy,
            3 => CompressionType::Lz4,
            4 => CompressionType::Zstd,
            _ => CompressionType::None,
        }
    }
    
    fn is_transactional(&self) -> bool {
        (self.attributes & 0x10) != 0
    }
    
    fn is_control_batch(&self) -> bool {
        (self.attributes & 0x20) != 0
    }
}
```

#### Offset Index Implementation
```rust
struct OffsetIndex {
    file: MappedFile,           // Memory-mapped index file
    entries: u32,               // Current number of entries
    max_entries: u32,           // Maximum entries based on file size
    base_offset: u64,           // Base offset of the corresponding log segment
    entry_size: u32,            // 8 bytes per entry (4 relative offset + 4 position)
}

impl OffsetIndex {
    fn lookup(&self, target_offset: u64) -> Result<u64, IndexError> {
        let relative_offset = (target_offset - self.base_offset) as u32;
        
        // Binary search for largest offset ≤ target
        let mut low = 0u32;
        let mut high = self.entries;
        
        while low < high {
            let mid = low + (high - low) / 2;
            let entry = self.read_entry(mid);
            
            if entry.relative_offset <= relative_offset {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        
        if low == 0 {
            Ok(0) // Start of segment
        } else {
            let entry = self.read_entry(low - 1);
            Ok(entry.physical_position as u64)
        }
    }
    
    fn append(&mut self, offset: u64, position: u64) -> Result<(), IndexError> {
        if self.entries >= self.max_entries {
            return Err(IndexError::Full);
        }
        
        let relative_offset = (offset - self.base_offset) as u32;
        let position = position as u32;
        
        let idx = self.entries as usize * 8;
        self.file.write_u32(idx, relative_offset);
        self.file.write_u32(idx + 4, position);
        self.entries += 1;
        
        Ok(())
    }
}
```

### 4. Topic Partitioning

#### Partition Architecture
```rust
struct Partition {
    topic: String,
    partition_id: u32,
    
    // Log state
    log: CommitLog,
    
    // Replication state
    leader_epoch: u32,
    leader_replica_id: Option<u32>,
    assigned_replicas: Vec<u32>,
    isr: Vec<u32>,                    // In-sync replica set
    
    // Watermarks
    high_watermark: AtomicU64,        // Last fully-replicated offset
    log_end_offset: AtomicU64,        // Last written offset (leader only)
    log_start_offset: u64,            // Earliest available offset
    
    // Follower state (when this broker is a follower)
    fetch_state: Option<FollowerFetchState>,
}

struct FollowerFetchState {
    leader_id: u32,
    leader_epoch: u32,
    fetch_offset: u64,
    last_fetched_epoch: u32,
}

impl Partition {
    fn append_as_leader(&mut self, records: &RecordBatch, 
                        required_acks: i16) -> Result<ProduceResult, ProduceError> {
        // 1. Verify this broker is the current leader
        if !self.is_leader() {
            return Err(ProduceError::NotLeader);
        }
        
        // 2. Verify ISR meets min.insync.replicas
        if required_acks == -1 && self.isr.len() < self.min_isr() {
            return Err(ProduceError::NotEnoughReplicas);
        }
        
        // 3. Validate and assign offsets
        let base_offset = self.log_end_offset.load(Ordering::Acquire);
        
        // 4. Append to local log
        let result = self.log.append(records)?;
        
        // 5. Update log end offset
        self.log_end_offset.store(
            base_offset + records.count() as u64, 
            Ordering::Release
        );
        
        // 6. Try to advance high watermark
        self.maybe_increment_high_watermark();
        
        Ok(ProduceResult {
            base_offset,
            log_append_time: result.log_append_time,
        })
    }
    
    fn maybe_increment_high_watermark(&mut self) {
        // High watermark = minimum LEO across all ISR members
        let new_hw = self.isr.iter()
            .map(|replica_id| self.get_replica_leo(*replica_id))
            .min()
            .unwrap_or(0);
        
        let current_hw = self.high_watermark.load(Ordering::Acquire);
        if new_hw > current_hw {
            self.high_watermark.store(new_hw, Ordering::Release);
        }
    }
}
```

#### Partitioner Implementations
```rust
trait Partitioner: Send + Sync {
    fn partition(&self, topic: &str, key: Option<&[u8]>, 
                 value: &[u8], num_partitions: u32) -> u32;
}

// Default: murmur2 hash of key, round-robin if no key
struct DefaultPartitioner {
    counter: AtomicU32,
}

impl Partitioner for DefaultPartitioner {
    fn partition(&self, _topic: &str, key: Option<&[u8]>, 
                 _value: &[u8], num_partitions: u32) -> u32 {
        match key {
            Some(key) => {
                // Murmur2 hash (positive) mod partitions
                let hash = murmur2(key) & 0x7fffffff;
                hash % num_partitions
            },
            None => {
                // Round-robin for keyless messages
                self.counter.fetch_add(1, Ordering::Relaxed) % num_partitions
            }
        }
    }
}

// Sticky partitioner: batch to same partition until batch full
struct StickyPartitioner {
    current_partition: AtomicU32,
    batch_size: AtomicU32,
    max_batch_size: u32,
}

impl Partitioner for StickyPartitioner {
    fn partition(&self, _topic: &str, key: Option<&[u8]>, 
                 _value: &[u8], num_partitions: u32) -> u32 {
        if let Some(key) = key {
            return murmur2(key) & 0x7fffffff % num_partitions;
        }
        
        let batch = self.batch_size.fetch_add(1, Ordering::Relaxed);
        if batch >= self.max_batch_size {
            self.batch_size.store(0, Ordering::Relaxed);
            let next = self.current_partition.fetch_add(1, Ordering::Relaxed);
            (next + 1) % num_partitions
        } else {
            self.current_partition.load(Ordering::Relaxed) % num_partitions
        }
    }
}
```

### 5. Consumer Group Coordination

#### Group Coordinator
```rust
struct GroupCoordinator {
    groups: HashMap<String, ConsumerGroup>,
    offset_storage: OffsetStorage,
    heartbeat_manager: HeartbeatManager,
    rebalance_timeout: Duration,
}

struct ConsumerGroup {
    group_id: String,
    state: GroupState,
    generation_id: u32,
    protocol_type: String,         // "consumer"
    protocol_name: String,         // "range", "roundrobin", "sticky"
    leader_id: Option<MemberId>,
    members: HashMap<MemberId, GroupMember>,
    pending_members: HashSet<MemberId>,
    assignment: HashMap<MemberId, Vec<TopicPartition>>,
}

#[derive(Debug, Clone, PartialEq)]
enum GroupState {
    Empty,                // No members
    PreparingRebalance,   // Waiting for members to join
    CompletingRebalance,  // Leader computing assignment
    Stable,               // All members have assignments
    Dead,                 // Group is being removed
}

struct GroupMember {
    member_id: MemberId,
    client_id: String,
    client_host: String,
    session_timeout: Duration,
    rebalance_timeout: Duration,
    subscriptions: Vec<String>,      // Subscribed topics
    assignment: Option<Vec<u8>>,     // Serialized partition assignment
    last_heartbeat: Instant,
}

impl GroupCoordinator {
    fn handle_join_group(&mut self, request: JoinGroupRequest) -> JoinGroupResponse {
        let group = self.groups.entry(request.group_id.clone())
            .or_insert_with(|| ConsumerGroup::new(&request.group_id));
        
        match group.state {
            GroupState::Empty | GroupState::Stable => {
                // Add member and trigger rebalance
                let member_id = self.generate_member_id(&request);
                group.add_member(member_id.clone(), GroupMember {
                    member_id: member_id.clone(),
                    client_id: request.client_id,
                    client_host: request.client_host,
                    session_timeout: request.session_timeout,
                    rebalance_timeout: request.rebalance_timeout,
                    subscriptions: request.subscriptions,
                    assignment: None,
                    last_heartbeat: Instant::now(),
                });
                
                group.state = GroupState::PreparingRebalance;
                
                // If first member, elect as leader
                if group.leader_id.is_none() {
                    group.leader_id = Some(member_id.clone());
                }
                
                // Wait for rebalance timeout for other members to join
                self.schedule_rebalance_completion(group);
                
                JoinGroupResponse {
                    error: ErrorCode::None,
                    generation_id: group.generation_id,
                    protocol_name: group.protocol_name.clone(),
                    leader: group.leader_id.clone().unwrap(),
                    member_id,
                    members: if group.leader_id.as_ref() == Some(&member_id) {
                        group.members.values().cloned().collect()
                    } else {
                        vec![]
                    },
                }
            },
            
            GroupState::PreparingRebalance => {
                // Add to pending and wait
                let member_id = self.generate_member_id(&request);
                group.pending_members.insert(member_id.clone());
                // Will be added when rebalance completes
                JoinGroupResponse::pending(member_id)
            },
            
            GroupState::Dead => {
                JoinGroupResponse::error(ErrorCode::CoordinatorNotAvailable)
            },
            
            _ => JoinGroupResponse::error(ErrorCode::RebalanceInProgress),
        }
    }
    
    fn handle_sync_group(&mut self, request: SyncGroupRequest) -> SyncGroupResponse {
        let group = self.groups.get_mut(&request.group_id)
            .ok_or(ErrorCode::GroupIdNotFound)?;
        
        if request.member_id == group.leader_id.as_ref().unwrap() {
            // Leader provides assignment for all members
            group.generation_id += 1;
            
            for (member_id, assignment) in &request.assignments {
                if let Some(member) = group.members.get_mut(member_id) {
                    member.assignment = Some(assignment.clone());
                }
            }
            
            group.state = GroupState::Stable;
        }
        
        // Return this member's assignment
        let assignment = group.members.get(&request.member_id)
            .and_then(|m| m.assignment.clone())
            .unwrap_or_default();
        
        SyncGroupResponse {
            error: ErrorCode::None,
            assignment,
        }
    }
    
    fn handle_heartbeat(&mut self, request: HeartbeatRequest) -> HeartbeatResponse {
        let group = self.groups.get_mut(&request.group_id)
            .ok_or(ErrorCode::GroupIdNotFound)?;
        
        if let Some(member) = group.members.get_mut(&request.member_id) {
            member.last_heartbeat = Instant::now();
        }
        
        // If rebalancing, tell consumer to rejoin
        if group.state == GroupState::PreparingRebalance {
            return HeartbeatResponse::error(ErrorCode::RebalanceInProgress);
        }
        
        HeartbeatResponse::ok()
    }
    
    fn expire_sessions(&mut self) {
        let now = Instant::now();
        
        for group in self.groups.values_mut() {
            let expired: Vec<MemberId> = group.members.iter()
                .filter(|(_, m)| now.duration_since(m.last_heartbeat) > m.session_timeout)
                .map(|(id, _)| id.clone())
                .collect();
            
            for member_id in expired {
                group.members.remove(&member_id);
                // Trigger rebalance
                if !group.members.is_empty() {
                    group.state = GroupState::PreparingRebalance;
                } else {
                    group.state = GroupState::Empty;
                }
            }
        }
    }
}
```

#### Partition Assignment Strategies
```rust
trait PartitionAssignor: Send + Sync {
    fn name(&self) -> &str;
    fn assign(&self, 
              members: &[GroupMember],
              topic_partitions: &HashMap<String, Vec<u32>>) -> HashMap<MemberId, Vec<TopicPartition>>;
}

// Range assignor: assign contiguous partition ranges
struct RangeAssignor;

impl PartitionAssignor for RangeAssignor {
    fn name(&self) -> &str { "range" }
    
    fn assign(&self, members: &[GroupMember],
              topic_partitions: &HashMap<String, Vec<u32>>) -> HashMap<MemberId, Vec<TopicPartition>> {
        let mut assignment: HashMap<MemberId, Vec<TopicPartition>> = HashMap::new();
        
        for (topic, partitions) in topic_partitions {
            // Filter members subscribed to this topic
            let subscribed: Vec<&GroupMember> = members.iter()
                .filter(|m| m.subscriptions.contains(topic))
                .collect();
            
            let num_partitions = partitions.len();
            let num_consumers = subscribed.len();
            let partitions_per_consumer = num_partitions / num_consumers;
            let extra = num_partitions % num_consumers;
            
            let mut partition_idx = 0;
            for (i, member) in subscribed.iter().enumerate() {
                let count = partitions_per_consumer + if i < extra { 1 } else { 0 };
                let member_partitions: Vec<TopicPartition> = (partition_idx..partition_idx + count)
                    .map(|p| TopicPartition::new(topic.clone(), partitions[p]))
                    .collect();
                
                assignment.entry(member.member_id.clone())
                    .or_default()
                    .extend(member_partitions);
                
                partition_idx += count;
            }
        }
        
        assignment
    }
}

// Cooperative sticky assignor: minimize partition movement
struct CooperativeStickyAssignor;

impl PartitionAssignor for CooperativeStickyAssignor {
    fn name(&self) -> &str { "cooperative-sticky" }
    
    fn assign(&self, members: &[GroupMember],
              topic_partitions: &HashMap<String, Vec<u32>>) -> HashMap<MemberId, Vec<TopicPartition>> {
        // 1. Collect current assignments from members
        let current_assignments = self.collect_current_assignments(members);
        
        // 2. Compute ideal balanced assignment
        let ideal = self.compute_balanced_assignment(members, topic_partitions);
        
        // 3. Only revoke partitions that need to move
        let mut result = current_assignments.clone();
        let revocations = self.compute_revocations(&current_assignments, &ideal);
        
        for (member, partitions) in &revocations {
            if let Some(assigned) = result.get_mut(member) {
                assigned.retain(|tp| !partitions.contains(tp));
            }
        }
        
        // 4. Assign newly available partitions
        let unassigned = self.find_unassigned(&result, topic_partitions);
        self.assign_unassigned(&mut result, &unassigned, members, topic_partitions);
        
        result
    }
}
```

### 6. Replication Protocol

#### Leader-Follower Replication
```rust
struct ReplicaManager {
    local_broker_id: u32,
    partition_leaders: HashMap<TopicPartition, Partition>,
    partition_followers: HashMap<TopicPartition, Partition>,
    replica_fetchers: HashMap<u32, ReplicaFetcherThread>,
    isr_change_listener: Box<dyn IsrChangeListener>,
}

struct ReplicaFetcherThread {
    leader_broker_id: u32,
    leader_endpoint: SocketAddr,
    partitions: HashMap<TopicPartition, FetchPosition>,
    fetch_size: u32,
    max_wait_ms: u32,
    min_bytes: u32,
}

impl ReplicaFetcherThread {
    fn run(&mut self) {
        loop {
            // 1. Build fetch request for all assigned partitions
            let fetch_request = self.build_fetch_request();
            
            // 2. Send fetch to leader
            let fetch_response = self.send_fetch(fetch_request);
            
            // 3. Process fetched data
            for (tp, partition_data) in fetch_response.partition_data {
                if let Some(records) = partition_data.records {
                    // Append to local follower log
                    let partition = self.partitions.get_mut(&tp).unwrap();
                    partition.log.append(&records);
                    
                    // Update fetch position
                    self.update_fetch_position(&tp, records.last_offset() + 1);
                }
                
                // Update high watermark from leader
                if partition_data.high_watermark > self.get_high_watermark(&tp) {
                    self.update_high_watermark(&tp, partition_data.high_watermark);
                }
            }
        }
    }
    
    fn build_fetch_request(&self) -> FetchRequest {
        FetchRequest {
            replica_id: self.local_broker_id as i32,
            max_wait_ms: self.max_wait_ms,
            min_bytes: self.min_bytes,
            partitions: self.partitions.iter()
                .map(|(tp, pos)| FetchPartition {
                    topic: tp.topic.clone(),
                    partition: tp.partition,
                    fetch_offset: pos.offset,
                    max_bytes: self.fetch_size,
                })
                .collect(),
        }
    }
}

impl ReplicaManager {
    fn update_follower_leo(&mut self, tp: &TopicPartition, 
                           follower_id: u32, leo: u64) {
        if let Some(partition) = self.partition_leaders.get_mut(tp) {
            // Update follower's log end offset
            partition.update_replica_leo(follower_id, leo);
            
            // Check if follower should be in ISR
            let leader_leo = partition.log_end_offset.load(Ordering::Acquire);
            let lag = leader_leo - leo;
            
            if lag <= partition.config.replica_lag_max_messages as u64 {
                // Follower is caught up, add to ISR if not already
                if !partition.isr.contains(&follower_id) {
                    partition.isr.push(follower_id);
                    self.isr_change_listener.on_isr_change(tp, &partition.isr);
                }
            }
            
            // Try to advance high watermark
            partition.maybe_increment_high_watermark();
        }
    }
    
    fn shrink_isr(&mut self, tp: &TopicPartition, 
                  out_of_sync_replica: u32) {
        if let Some(partition) = self.partition_leaders.get_mut(tp) {
            partition.isr.retain(|id| *id != out_of_sync_replica);
            
            // Persist ISR change to metadata store
            self.isr_change_listener.on_isr_change(tp, &partition.isr);
            
            // Advance high watermark (fewer replicas to wait for)
            partition.maybe_increment_high_watermark();
        }
    }
}
```

#### Raft-Based Replication (KRaft / Redpanda-style)
```rust
struct RaftPartition {
    partition_id: u32,
    raft_group: RaftGroup,
    log: RaftLog,
}

struct RaftGroup {
    node_id: u32,
    state: RaftState,
    current_term: u64,
    voted_for: Option<u32>,
    leader_id: Option<u32>,
    commit_index: u64,
    last_applied: u64,
    peers: Vec<RaftPeer>,
    election_timer: Timer,
    heartbeat_timer: Timer,
}

enum RaftState {
    Follower,
    Candidate,
    Leader,
}

struct RaftPeer {
    node_id: u32,
    next_index: u64,   // Next log index to send
    match_index: u64,  // Highest replicated index
    endpoint: SocketAddr,
}

impl RaftGroup {
    fn handle_append_entries(&mut self, request: AppendEntriesRequest) -> AppendEntriesResponse {
        // 1. Check term
        if request.term < self.current_term {
            return AppendEntriesResponse::reject(self.current_term);
        }
        
        if request.term > self.current_term {
            self.step_down(request.term);
        }
        
        // 2. Reset election timer (leader is alive)
        self.election_timer.reset();
        self.leader_id = Some(request.leader_id);
        
        // 3. Check log consistency
        if !self.log_matches(request.prev_log_index, request.prev_log_term) {
            return AppendEntriesResponse::reject(self.current_term);
        }
        
        // 4. Append entries
        self.log.append_entries(request.prev_log_index + 1, &request.entries);
        
        // 5. Update commit index
        if request.leader_commit > self.commit_index {
            self.commit_index = std::cmp::min(
                request.leader_commit, 
                self.log.last_index()
            );
        }
        
        AppendEntriesResponse::accept(self.current_term, self.log.last_index())
    }
    
    fn as_leader_replicate(&mut self, entries: &[LogEntry]) -> Result<(), RaftError> {
        // 1. Append to local log
        self.log.append(entries);
        
        // 2. Send AppendEntries to all peers
        for peer in &mut self.peers {
            let request = AppendEntriesRequest {
                term: self.current_term,
                leader_id: self.node_id,
                prev_log_index: peer.next_index - 1,
                prev_log_term: self.log.term_at(peer.next_index - 1),
                entries: self.log.entries_from(peer.next_index),
                leader_commit: self.commit_index,
            };
            
            self.send_to_peer(peer, request);
        }
        
        // 3. Check if majority has replicated (in response handler)
        self.try_advance_commit_index();
        
        Ok(())
    }
    
    fn try_advance_commit_index(&mut self) {
        // Find the highest index replicated by majority
        let mut match_indices: Vec<u64> = self.peers.iter()
            .map(|p| p.match_index)
            .collect();
        match_indices.push(self.log.last_index()); // Include self
        match_indices.sort_unstable();
        
        let majority_index = match_indices[match_indices.len() / 2];
        
        if majority_index > self.commit_index &&
           self.log.term_at(majority_index) == self.current_term {
            self.commit_index = majority_index;
        }
    }
}
```

### 7. Message Serialization

#### Schema-Aware Serialization
```rust
trait MessageSerializer: Send + Sync {
    fn serialize(&self, topic: &str, value: &dyn Any) -> Result<Vec<u8>, SerError>;
    fn deserialize(&self, topic: &str, bytes: &[u8]) -> Result<Box<dyn Any>, SerError>;
    fn content_type(&self) -> &str;
}

struct AvroSerializer {
    schema_registry: SchemaRegistryClient,
    writer_schemas: HashMap<String, Schema>,
    schema_id_cache: HashMap<String, u32>,
}

impl AvroSerializer {
    fn serialize_with_schema(&self, topic: &str, value: &Value) -> Result<Vec<u8>, SerError> {
        // 1. Get or register schema
        let schema = self.writer_schemas.get(topic)
            .ok_or(SerError::NoSchema)?;
        let schema_id = self.get_or_register_schema(topic, schema)?;
        
        // 2. Serialize: magic byte + schema_id + avro_bytes
        let mut buffer = Vec::new();
        buffer.push(0x00);  // Magic byte
        buffer.extend_from_slice(&schema_id.to_be_bytes());
        
        // 3. Avro binary encoding
        let avro_bytes = avro_encode(value, schema)?;
        buffer.extend_from_slice(&avro_bytes);
        
        Ok(buffer)
    }
}

struct SchemaRegistryClient {
    base_url: String,
    cache: HashMap<(String, Schema), u32>,
}

impl SchemaRegistryClient {
    fn register_schema(&mut self, subject: &str, schema: &Schema) -> Result<u32, SchemaError> {
        // POST /subjects/{subject}/versions
        let response = self.http_post(
            &format!("{}/subjects/{}/versions", self.base_url, subject),
            &json!({ "schema": schema.to_string() }),
        )?;
        
        let schema_id = response.json::<SchemaIdResponse>()?.id;
        self.cache.insert((subject.to_string(), schema.clone()), schema_id);
        Ok(schema_id)
    }
    
    fn check_compatibility(&self, subject: &str, schema: &Schema) -> Result<bool, SchemaError> {
        // POST /compatibility/subjects/{subject}/versions/latest
        let response = self.http_post(
            &format!("{}/compatibility/subjects/{}/versions/latest", self.base_url, subject),
            &json!({ "schema": schema.to_string() }),
        )?;
        
        Ok(response.json::<CompatibilityResponse>()?.is_compatible)
    }
}
```

### 8. Backpressure Mechanisms

#### Producer-Side Backpressure
```rust
struct ProducerBufferPool {
    total_memory: usize,
    available_memory: AtomicUsize,
    free_buffers: ConcurrentQueue<ByteBuffer>,
    buffer_size: usize,
    waiters: Mutex<VecDeque<Waker>>,
    max_block_ms: Duration,
}

impl ProducerBufferPool {
    fn allocate(&self, size: usize) -> Result<ByteBuffer, BufferError> {
        // Try to get a free buffer
        if let Some(buffer) = self.free_buffers.pop() {
            return Ok(buffer);
        }
        
        // Try to allocate from available memory
        let available = self.available_memory.load(Ordering::Acquire);
        if available >= size {
            if self.available_memory.compare_exchange(
                available, available - size, 
                Ordering::AcqRel, Ordering::Relaxed
            ).is_ok() {
                return Ok(ByteBuffer::allocate(size));
            }
        }
        
        // Block until memory available (with timeout)
        self.wait_for_memory(size, self.max_block_ms)
    }
    
    fn deallocate(&self, buffer: ByteBuffer) {
        buffer.clear();
        
        if buffer.capacity() == self.buffer_size {
            // Return standard-size buffer to pool
            self.free_buffers.push(buffer);
        } else {
            // Non-standard size, just free
            self.available_memory.fetch_add(buffer.capacity(), Ordering::Release);
        }
        
        // Wake up waiting producers
        if let Ok(mut waiters) = self.waiters.lock() {
            if let Some(waker) = waiters.pop_front() {
                waker.wake();
            }
        }
    }
}
```

#### Broker-Side Backpressure
```rust
struct BrokerBackpressure {
    request_queue_size: AtomicUsize,
    max_request_queue_size: usize,
    disk_usage_percent: AtomicU32,
    memory_usage_percent: AtomicU32,
}

impl BrokerBackpressure {
    fn should_throttle(&self, client_id: &str) -> Option<Duration> {
        // Check request queue depth
        let queue_size = self.request_queue_size.load(Ordering::Acquire);
        if queue_size > self.max_request_queue_size {
            return Some(Duration::from_millis(100));
        }
        
        // Check disk usage
        let disk_usage = self.disk_usage_percent.load(Ordering::Acquire);
        if disk_usage > 90 {
            return Some(Duration::from_millis(500));
        }
        
        // Check memory
        let mem_usage = self.memory_usage_percent.load(Ordering::Acquire);
        if mem_usage > 85 {
            return Some(Duration::from_millis(200));
        }
        
        None
    }
}
```

#### Consumer-Side Flow Control
```rust
struct ConsumerFetchManager {
    max_poll_records: u32,
    fetch_min_bytes: u32,
    fetch_max_bytes: u32,
    fetch_max_wait_ms: u32,
    max_partition_fetch_bytes: u32,
    
    // Adaptive fetch sizing
    adaptive: bool,
    partition_fetch_sizes: HashMap<TopicPartition, u32>,
}

impl ConsumerFetchManager {
    fn build_fetch_request(&self, assignments: &[TopicPartition],
                           positions: &HashMap<TopicPartition, u64>) -> FetchRequest {
        FetchRequest {
            max_wait_ms: self.fetch_max_wait_ms,
            min_bytes: self.fetch_min_bytes,
            max_bytes: self.fetch_max_bytes,
            partitions: assignments.iter()
                .map(|tp| {
                    let fetch_size = if self.adaptive {
                        *self.partition_fetch_sizes.get(tp)
                            .unwrap_or(&self.max_partition_fetch_bytes)
                    } else {
                        self.max_partition_fetch_bytes
                    };
                    
                    FetchPartition {
                        topic: tp.topic.clone(),
                        partition: tp.partition,
                        fetch_offset: positions[tp],
                        max_bytes: fetch_size,
                    }
                })
                .collect(),
        }
    }
    
    fn adjust_fetch_size(&mut self, tp: &TopicPartition, 
                         records_received: u32, fetch_time_ms: u64) {
        if !self.adaptive { return; }
        
        let current = self.partition_fetch_sizes.entry(tp.clone())
            .or_insert(self.max_partition_fetch_bytes);
        
        if records_received == 0 && fetch_time_ms > self.fetch_max_wait_ms as u64 {
            // No data, reduce fetch size to avoid long waits
            *current = (*current / 2).max(1024);
        } else if records_received >= self.max_poll_records {
            // Lots of data, increase fetch size
            *current = (*current * 2).min(self.fetch_max_bytes);
        }
    }
}
```

### 9. Transaction Management

#### Transaction Coordinator
```rust
struct TransactionCoordinator {
    transaction_state_manager: TransactionStateManager,
    producer_id_manager: ProducerIdManager,
}

struct TransactionState {
    transactional_id: String,
    producer_id: i64,
    producer_epoch: i16,
    state: TxnState,
    partitions: HashSet<TopicPartition>,
    timeout_ms: u64,
    last_update: Instant,
}

enum TxnState {
    Empty,
    Ongoing,
    PrepareCommit,
    PrepareAbort,
    CompleteCommit,
    CompleteAbort,
    Dead,
}

impl TransactionCoordinator {
    fn init_producer_id(&mut self, transactional_id: &str, 
                        timeout_ms: u64) -> Result<(i64, i16), TxnError> {
        // Fence previous producer with same transactional_id
        if let Some(existing) = self.transaction_state_manager.get(transactional_id) {
            // Abort any ongoing transaction
            if existing.state == TxnState::Ongoing {
                self.abort_transaction(transactional_id)?;
            }
            
            // Bump epoch to fence old producer
            let new_epoch = existing.producer_epoch + 1;
            return Ok((existing.producer_id, new_epoch));
        }
        
        // Generate new producer ID
        let producer_id = self.producer_id_manager.generate_id()?;
        let epoch = 0i16;
        
        self.transaction_state_manager.create(TransactionState {
            transactional_id: transactional_id.to_string(),
            producer_id,
            producer_epoch: epoch,
            state: TxnState::Empty,
            partitions: HashSet::new(),
            timeout_ms,
            last_update: Instant::now(),
        });
        
        Ok((producer_id, epoch))
    }
    
    fn add_partitions_to_txn(&mut self, transactional_id: &str,
                              partitions: &[TopicPartition]) -> Result<(), TxnError> {
        let txn = self.transaction_state_manager.get_mut(transactional_id)
            .ok_or(TxnError::InvalidProducerIdMapping)?;
        
        txn.state = TxnState::Ongoing;
        txn.partitions.extend(partitions.iter().cloned());
        txn.last_update = Instant::now();
        
        Ok(())
    }
    
    fn end_transaction(&mut self, transactional_id: &str, 
                       commit: bool) -> Result<(), TxnError> {
        let txn = self.transaction_state_manager.get_mut(transactional_id)
            .ok_or(TxnError::InvalidProducerIdMapping)?;
        
        // 1. Transition to prepare state
        txn.state = if commit { TxnState::PrepareCommit } else { TxnState::PrepareAbort };
        
        // 2. Write transaction markers to all participating partitions
        for partition in &txn.partitions {
            self.write_transaction_marker(partition, txn.producer_id, 
                                          txn.producer_epoch, commit)?;
        }
        
        // 3. Transition to complete state
        txn.state = if commit { TxnState::CompleteCommit } else { TxnState::CompleteAbort };
        txn.partitions.clear();
        txn.last_update = Instant::now();
        
        Ok(())
    }
}
```

### 10. Delayed Operation Purgatory

#### Timer-Based Delayed Operations
```rust
struct DelayedOperationPurgatory {
    operation_map: HashMap<OperationKey, Vec<Arc<dyn DelayedOperation>>>,
    timer: TimerWheel,
    expiration_reaper: Timer,
}

trait DelayedOperation: Send + Sync {
    fn try_complete(&self) -> bool;
    fn on_complete(&self);
    fn on_expiration(&self);
    fn delay_ms(&self) -> u64;
}

struct DelayedProduce {
    timeout_ms: u64,
    created_at: Instant,
    produce_status: HashMap<TopicPartition, ProducePartitionStatus>,
    response_callback: Box<dyn FnOnce(ProduceResponse) + Send>,
}

impl DelayedOperation for DelayedProduce {
    fn try_complete(&self) -> bool {
        // Check if all partitions have been replicated to min ISR
        self.produce_status.values().all(|status| {
            status.required_offset <= status.partition_high_watermark()
        })
    }
    
    fn on_complete(&self) {
        let response = self.build_success_response();
        (self.response_callback)(response);
    }
    
    fn on_expiration(&self) {
        let response = self.build_timeout_response();
        (self.response_callback)(response);
    }
    
    fn delay_ms(&self) -> u64 {
        self.timeout_ms
    }
}

struct DelayedFetch {
    timeout_ms: u64,
    min_bytes: u32,
    fetch_partitions: HashMap<TopicPartition, FetchPartitionStatus>,
    response_callback: Box<dyn FnOnce(FetchResponse) + Send>,
}

impl DelayedOperation for DelayedFetch {
    fn try_complete(&self) -> bool {
        // Check if enough data is available
        let total_bytes: u32 = self.fetch_partitions.values()
            .map(|status| status.available_bytes())
            .sum();
        
        total_bytes >= self.min_bytes
    }
    
    fn on_complete(&self) {
        let response = self.build_response_with_data();
        (self.response_callback)(response);
    }
    
    fn on_expiration(&self) {
        // Return whatever data is available
        let response = self.build_response_with_data();
        (self.response_callback)(response);
    }
    
    fn delay_ms(&self) -> u64 {
        self.timeout_ms
    }
}

// Hierarchical timer wheel for efficient delayed operations
struct TimerWheel {
    tick_ms: u64,
    wheel_size: u32,
    buckets: Vec<Vec<Arc<dyn DelayedOperation>>>,
    current_time: u64,
    overflow_wheel: Option<Box<TimerWheel>>,
}

impl TimerWheel {
    fn add(&mut self, operation: Arc<dyn DelayedOperation>) {
        let delay = operation.delay_ms();
        let expiration = self.current_time + delay;
        
        if delay < self.tick_ms * self.wheel_size as u64 {
            // Fits in this wheel
            let bucket = ((expiration / self.tick_ms) % self.wheel_size as u64) as usize;
            self.buckets[bucket].push(operation);
        } else {
            // Overflow to next wheel level
            if self.overflow_wheel.is_none() {
                self.overflow_wheel = Some(Box::new(TimerWheel::new(
                    self.tick_ms * self.wheel_size as u64,
                    self.wheel_size,
                )));
            }
            self.overflow_wheel.as_mut().unwrap().add(operation);
        }
    }
    
    fn advance_clock(&mut self, time_ms: u64) -> Vec<Arc<dyn DelayedOperation>> {
        let mut expired = Vec::new();
        
        while self.current_time < time_ms {
            self.current_time += self.tick_ms;
            let bucket = ((self.current_time / self.tick_ms) % self.wheel_size as u64) as usize;
            
            expired.extend(self.buckets[bucket].drain(..));
        }
        
        expired
    }
}
```

## Deployment Architecture Patterns

### 1. Single Broker Deployment
```yaml
deployment:
  type: single_broker
  resources:
    cpu_cores: 4
    memory: "8GB"
    disk: "500GB SSD"
  features:
    - single_partition_topics
    - no_replication
    - basic_consumer_groups
  limits:
    max_throughput: "100K msg/sec"
    max_topics: 1000
    max_partitions: 4000
```

### 2. Multi-Broker Cluster
```yaml
deployment:
  type: cluster
  brokers: 5
  replication_factor: 3
  min_insync_replicas: 2
  
  broker_config:
    resources:
      cpu_cores: 16
      memory: "64GB"
      disk: "2TB NVMe x 4"  # Multiple log dirs
    
    network:
      inter_broker_listener: "PLAINTEXT://0.0.0.0:9093"
      client_listener: "SASL_SSL://0.0.0.0:9092"
  
  metadata:
    type: "kraft"    # No ZooKeeper dependency
    controller_quorum: 3
    
  limits:
    max_throughput: "2M msg/sec"
    max_topics: 100000
    max_partitions: 200000
```

### 3. Multi-Region Deployment
```yaml
deployment:
  type: multi_region
  regions:
    - name: "us-east-1"
      brokers: 5
      role: "primary"
    - name: "eu-west-1"
      brokers: 5
      role: "replica"
    - name: "ap-southeast-1"
      brokers: 3
      role: "replica"
  
  replication:
    type: "async_geo_replication"
    replication_lag_target: "< 5 seconds"
    conflict_resolution: "last_write_wins"
  
  failover:
    automatic: true
    detection_timeout: "30s"
    promotion_timeout: "60s"
```

This comprehensive architecture guide provides the foundation for implementing scalable, performant, and reliable message queue systems that can handle production workloads across diverse deployment scenarios.
