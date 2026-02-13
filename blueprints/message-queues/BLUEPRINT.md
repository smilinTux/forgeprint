# Message Queue Blueprint

## Overview & Purpose

A message queue is a middleware system that enables asynchronous communication between distributed components by temporarily storing messages in transit. It decouples producers (senders) from consumers (receivers), allowing systems to operate independently while ensuring reliable message delivery across service boundaries.

### Core Responsibilities
- **Message Acceptance**: Receive messages from producers with delivery guarantees
- **Message Storage**: Durably persist messages until successfully consumed
- **Message Routing**: Direct messages to appropriate queues, topics, or consumers
- **Delivery Guarantees**: Ensure at-most-once, at-least-once, or exactly-once delivery
- **Consumer Coordination**: Manage consumer groups, offsets, and rebalancing
- **Backpressure Management**: Control flow when consumers lag behind producers

## Core Concepts

### 1. Messages
**Definition**: The fundamental unit of data exchanged between producers and consumers.

```
Message {
    id: Unique message identifier (UUID or sequence number)
    key: Optional partitioning key
    value: Message payload (bytes)
    headers: Key-value metadata pairs
    timestamp: Production or broker timestamp
    topic: Destination topic or queue name
    partition: Target partition (if applicable)
    offset: Position within partition (broker-assigned)
    ttl: Time-to-live before expiration
    priority: Optional priority level (0-9)
    correlation_id: For request-reply patterns
}
```

**Serialization Formats**:
- **JSON**: Human-readable, widely supported, larger size
- **Avro**: Schema evolution, compact binary, schema registry
- **Protobuf**: Strongly typed, compact, language-neutral
- **MessagePack**: Binary JSON, compact, fast
- **Raw Bytes**: No serialization overhead, application-managed

### 2. Topics and Queues
**Definition**: Named channels for organizing and routing messages.

```
Topic {
    name: Unique identifier (e.g., "orders.created")
    partitions: Number of parallel partitions
    replication_factor: Number of replica copies
    retention_policy: Time-based or size-based retention
    compaction_policy: Log compaction settings
    schema: Optional message schema enforcement
    access_control: Producer/consumer permissions
}

Queue {
    name: Unique identifier
    type: standard | fifo | priority | delay
    max_size: Maximum queue depth
    dead_letter_queue: DLQ configuration
    visibility_timeout: Message lock duration
    delivery_delay: Default message delay
    max_receive_count: Before DLQ redirect
}
```

**Topic vs Queue Semantics**:
- **Queue (Point-to-Point)**: Each message consumed by exactly one consumer
- **Topic (Pub/Sub)**: Each message delivered to all subscribed consumers
- **Partitioned Topic**: Ordered within partitions, parallel across partitions
- **Virtual Topic**: Combines pub/sub and point-to-point patterns

### 3. Producers
**Definition**: Components that publish messages to topics or queues.

```
Producer {
    client_id: Unique producer identifier
    acks: Acknowledgment level (0, 1, all)
    retries: Number of send retries
    batch_size: Messages per batch
    linger_ms: Batching delay
    compression: none | gzip | snappy | lz4 | zstd
    idempotent: Enable exactly-once production
    transactional_id: For transactional messaging
    partitioner: Partitioning strategy
    max_in_flight: Maximum unacknowledged batches
}
```

**Partitioning Strategies**:
- **Key-based**: Hash message key to determine partition
- **Round-robin**: Distribute evenly across partitions
- **Sticky**: Batch to same partition until batch full
- **Custom**: Application-defined partitioning logic

### 4. Consumers and Consumer Groups
**Definition**: Components that read and process messages from topics or queues.

```
Consumer {
    client_id: Unique consumer identifier
    group_id: Consumer group membership
    auto_commit: Automatic offset commits
    commit_interval: Auto-commit frequency
    max_poll_records: Messages per poll batch
    session_timeout: Group membership timeout
    heartbeat_interval: Liveness signal frequency
    max_poll_interval: Processing time limit
    offset_reset: earliest | latest | none
    isolation_level: read_uncommitted | read_committed
}

ConsumerGroup {
    group_id: Unique group identifier
    members: List of consumer instances
    partition_assignment: Consumer-to-partition mapping
    coordinator: Broker managing this group
    generation_id: Rebalance generation counter
    protocol: range | round_robin | sticky | cooperative_sticky
}
```

### 5. Delivery Guarantees

#### At-Most-Once Delivery
- **Behavior**: Messages may be lost but never redelivered
- **Mechanism**: Consumer commits offset before processing
- **Use Case**: Metrics, logging where occasional loss is acceptable
- **Trade-off**: Highest throughput, lowest latency, potential data loss

#### At-Least-Once Delivery
- **Behavior**: Messages never lost but may be delivered multiple times
- **Mechanism**: Consumer commits offset after processing
- **Use Case**: Most business applications with idempotent processing
- **Trade-off**: No data loss, requires deduplication logic

#### Exactly-Once Delivery
- **Behavior**: Each message processed exactly one time
- **Mechanism**: Transactional produce + consume with idempotent writes
- **Use Case**: Financial transactions, inventory management
- **Trade-off**: Highest correctness, significant performance overhead

### 6. Dead Letter Queues (DLQ)
**Definition**: Special queues that capture messages that fail processing.

```
DeadLetterQueue {
    source_queue: Original queue name
    dlq_name: Dead letter queue name
    max_receive_count: Failures before DLQ redirect
    retention_days: How long to keep DLQ messages
    alerting: Notification on DLQ arrival
    reprocessing: Manual or automatic retry policy
}
```

**DLQ Flow**:
```
Producer → Queue → Consumer (attempt 1: FAIL)
                 → Consumer (attempt 2: FAIL)
                 → Consumer (attempt 3: FAIL)
                 → Dead Letter Queue → Alert → Manual Review
```

## Messaging Patterns

### 1. Publish/Subscribe
```
                    ┌──────────────┐
                    │   Consumer A │ (Subscription: orders.*)
                    └──────────────┘
                           ▲
┌──────────┐    ┌─────────┴────────┐
│ Producer │───▶│   Topic: orders  │
└──────────┘    └─────────┬────────┘
                           │
                    ┌──────┴───────┐
                    │   Consumer B │ (Subscription: orders.*)
                    └──────────────┘
```

### 2. Point-to-Point (Competing Consumers)
```
                    ┌──────────────┐
               ┌───▶│  Consumer 1  │
               │    └──────────────┘
┌──────────┐   │    ┌──────────────┐
│ Producer │───┼───▶│  Consumer 2  │  (only ONE receives each message)
└──────────┘   │    └──────────────┘
               │    ┌──────────────┐
               └───▶│  Consumer 3  │
                    └──────────────┘
```

### 3. Fan-Out
```
┌──────────┐    ┌──────────────┐    ┌────────────────┐
│ Producer │───▶│   Exchange   │───▶│ Queue: email    │───▶ Email Service
└──────────┘    │  (fanout)    │───▶│ Queue: sms      │───▶ SMS Service
                │              │───▶│ Queue: push      │───▶ Push Service
                └──────────────┘    └────────────────┘
```

### 4. Request-Reply
```
┌──────────┐   Request    ┌──────────┐   Request    ┌──────────┐
│ Client   │─────────────▶│  Queue   │─────────────▶│ Service  │
│          │◀─────────────│  Broker  │◀─────────────│          │
└──────────┘   Reply      └──────────┘   Reply      └──────────┘
  (correlation_id matches request to reply)
```

### 5. Event Sourcing with Message Queue
```
┌──────────┐    ┌─────────────────┐    ┌──────────────┐
│ Command  │───▶│  Event Log      │───▶│  Projection  │
│ Handler  │    │  (Topic)        │    │  Builder     │
└──────────┘    │                 │    └──────────────┘
                │  Event 1: Created│          │
                │  Event 2: Updated│          ▼
                │  Event 3: Shipped│    ┌──────────────┐
                │  Event 4: Paid   │    │  Read Model  │
                └─────────────────┘    │  (Database)  │
                                       └──────────────┘
```

## Data Flow Diagrams

### Producer-to-Consumer Flow
```
┌──────────┐    ┌───────────────┐    ┌─────────────┐    ┌──────────────┐
│ Producer │───▶│  Serializer   │───▶│ Partitioner │───▶│   Network    │
│          │    │ (Avro/Proto)  │    │ (key hash)  │    │   Buffer     │
└──────────┘    └───────────────┘    └─────────────┘    └──────┬───────┘
                                                               │
                                                               ▼
┌──────────┐    ┌───────────────┐    ┌─────────────┐    ┌──────────────┐
│ Consumer │◀───│ Deserializer  │◀───│   Fetcher   │◀───│   Broker     │
│          │    │               │    │             │    │   (Leader)   │
└──────────┘    └───────────────┘    └─────────────┘    └──────────────┘
```

### Broker Internal Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                        BROKER NODE                          │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Network      │    │  Request     │    │  Purgatory   │  │
│  │  Acceptor     │───▶│  Handler     │───▶│  (Delayed    │  │
│  │  (NIO/Epoll)  │    │  Pool       │    │   Responses)  │  │
│  └──────────────┘    └──────┬───────┘    └──────────────┘  │
│                             │                               │
│  ┌──────────────┐    ┌──────▼───────┐    ┌──────────────┐  │
│  │  Replication  │◀───│  Log         │───▶│  Index       │  │
│  │  Manager      │    │  Manager     │    │  Manager     │  │
│  │              │    │  (Segments)   │    │  (Offset/    │  │
│  │              │    │              │    │   Time)      │  │
│  └──────────────┘    └──────┬───────┘    └──────────────┘  │
│                             │                               │
│  ┌──────────────┐    ┌──────▼───────┐    ┌──────────────┐  │
│  │  Group        │    │  Page Cache  │    │  OS Disk     │  │
│  │  Coordinator  │    │  (OS-level)  │    │  I/O         │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Consumer Group Rebalance Flow
```
┌───────────┐  JoinGroup   ┌─────────────┐
│Consumer 1 │─────────────▶│             │
│           │              │  Group      │
│Consumer 2 │─────────────▶│  Coordinator│
│           │              │  (Broker)   │
│Consumer 3 │─────────────▶│             │
└───────────┘              └──────┬──────┘
                                  │
                           ┌──────▼──────┐
                           │  Leader     │
                           │  Assignment │
                           │  Strategy   │
                           └──────┬──────┘
                                  │
                           ┌──────▼──────┐
                           │ SyncGroup   │
                           │ Response    │
                           └──────┬──────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
     ┌────────────┐      ┌────────────┐      ┌────────────┐
     │Consumer 1  │      │Consumer 2  │      │Consumer 3  │
     │P0, P1      │      │P2, P3      │      │P4, P5      │
     └────────────┘      └────────────┘      └────────────┘
```

### Replication Flow
```
┌──────────┐   Produce    ┌──────────────┐
│ Producer │─────────────▶│   Leader     │
│ (acks=all)│             │   Replica    │
└──────────┘              └──────┬───────┘
                                 │ Replicate
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
             ┌───────────┐ ┌───────────┐ ┌───────────┐
             │ Follower  │ │ Follower  │ │ Observer  │
             │ Replica 1 │ │ Replica 2 │ │ Replica   │
             └─────┬─────┘ └─────┬─────┘ └───────────┘
                   │             │
                   └──────┬──────┘
                          ▼
                   ┌─────────────┐
                   │  ACK to     │
                   │  Leader     │
                   └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  ACK to     │
                   │  Producer   │
                   └─────────────┘
```

### Message Lifecycle State Machine
```
┌───────────┐
│ PRODUCED  │──┐
└───────────┘  │
      │        │  Rejected (validation fail)
      ▼        │
┌───────────┐  │
│ PERSISTED │  │
└───────────┘  │
      │        │
      ▼        │
┌───────────┐  │
│ REPLICATED│  │
└───────────┘  │
      │        │
      ▼        │
┌───────────┐  │
│ AVAILABLE │  │
└───────────┘  │
      │        │
      ├────────┼──────────────────────┐
      ▼        │                      ▼
┌───────────┐  │               ┌───────────┐
│ DELIVERED │  │               │  EXPIRED  │ (TTL exceeded)
└───────────┘  │               └───────────┘
      │        │
      ├────────┤
      ▼        ▼
┌───────────┐ ┌───────────┐
│   ACKED   │ │  NACKED   │
└───────────┘ └───────────┘
      │              │
      ▼              ▼ (retry count exceeded)
┌───────────┐ ┌───────────┐
│ COMPLETED │ │  DLQ'ed   │
└───────────┘ └───────────┘
```

## Protocol Support Matrix

| Protocol | Layer | Features | Use Cases |
|----------|-------|----------|-----------|
| **AMQP 0-9-1** | Application | Exchanges, bindings, flexible routing | RabbitMQ, enterprise messaging |
| **AMQP 1.0** | Application | Link-based flow control, OASIS standard | Azure Service Bus, ActiveMQ |
| **MQTT 3.1/5.0** | Application | Lightweight pub/sub, QoS levels, retained | IoT devices, mobile, edge |
| **STOMP** | Application | Text-based, simple, interoperable | Web clients, simple integrations |
| **Kafka Protocol** | Application | Binary, batched, partition-aware | Kafka, Redpanda, streaming |
| **NATS Protocol** | Application | Text-based, simple pub/sub, JetStream | Cloud-native, microservices |
| **HTTP/REST** | Application | Universal access, webhooks | SQS, Pub/Sub, simple clients |
| **gRPC** | Application | Streaming, protobuf, bi-directional | Pulsar, high-perf clients |
| **WebSocket** | Application | Browser pub/sub, real-time | Web clients, dashboards |

## Configuration Model

### Hierarchical Structure
```yaml
message_queue:
  cluster:
    node_id: 1
    cluster_name: "production"
    metadata_store: "zookeeper://zk1:2181,zk2:2181"
    
  broker:
    listeners:
      - protocol: kafka
        host: "0.0.0.0"
        port: 9092
      - protocol: amqp
        host: "0.0.0.0"
        port: 5672
    
    storage:
      log_dir: "/data/message-logs"
      segment_size: "1GB"
      retention_hours: 168
      retention_bytes: -1  # unlimited
      compaction_enabled: false
    
    replication:
      default_replication_factor: 3
      min_insync_replicas: 2
      unclean_leader_election: false
    
    performance:
      num_network_threads: 8
      num_io_threads: 16
      socket_send_buffer: "1MB"
      socket_receive_buffer: "1MB"
      max_message_size: "10MB"
    
  topics:
    auto_create: true
    default_partitions: 12
    default_replication: 3
    
  consumer_groups:
    session_timeout: "30s"
    heartbeat_interval: "3s"
    rebalance_timeout: "60s"
    
  security:
    authentication: "SASL_SSL"
    authorization: "ACL"
    ssl_keystore: "/etc/certs/broker.jks"
    
  monitoring:
    jmx_port: 9999
    metrics_reporter: "prometheus"
    metrics_port: 9090
```

## Message Ordering Guarantees

### Partition-Level Ordering
- **Guarantee**: Messages within a single partition are strictly ordered
- **Mechanism**: Append-only log with monotonically increasing offsets
- **Constraint**: Single producer per partition for strict ordering
- **Use Case**: Order processing, event sourcing per entity

### Global Ordering
- **Guarantee**: All messages across all partitions are totally ordered
- **Mechanism**: Single partition topic or coordination protocol
- **Constraint**: Severely limits throughput and parallelism
- **Use Case**: Audit logs, regulatory compliance

### Causal Ordering
- **Guarantee**: Causally related messages maintain order
- **Mechanism**: Vector clocks or causal metadata
- **Constraint**: Requires tracking causal dependencies
- **Use Case**: Distributed workflows, saga patterns

## Transaction Support

### Producer Transactions
```
BEGIN TRANSACTION
  → Produce to Topic A, Partition 0
  → Produce to Topic B, Partition 1
  → Produce to Topic C, Partition 2
COMMIT TRANSACTION (atomic: all or nothing)
```

### Consume-Transform-Produce (Exactly-Once)
```
POLL messages from input topic
BEGIN TRANSACTION
  → Process messages
  → Produce results to output topic
  → Commit consumer offsets
COMMIT TRANSACTION
```

### Distributed Transactions (XA)
- Two-phase commit across message broker and external systems
- Prepare phase: all participants lock resources
- Commit phase: all participants finalize changes
- Use sparingly due to performance and availability trade-offs

## Priority Queues

### Priority Levels
```
Priority Queue Architecture:
┌──────────┐    ┌─────────────────────────────┐
│ Producer │───▶│   Priority Queue             │
│ (P=HIGH) │    │  ┌─────────┐                │
└──────────┘    │  │ HIGH(9) │ → Consumer (first) │
┌──────────┐    │  ├─────────┤                │
│ Producer │───▶│  │ MED(5)  │ → Consumer (second)│
│ (P=MED)  │    │  ├─────────┤                │
└──────────┘    │  │ LOW(1)  │ → Consumer (last)  │
┌──────────┐    │  └─────────┘                │
│ Producer │───▶│                              │
│ (P=LOW)  │    └─────────────────────────────┘
└──────────┘
```

### Implementation Approaches
- **Separate queues per priority**: Simplest, consumer polls high-priority first
- **Heap-based ordering**: Single queue with internal priority heap
- **Weighted fair queuing**: Proportional delivery based on priority weights

## Delayed Messages

### Delay Mechanisms
- **Broker-level delay**: Messages stored in delay buffer, delivered after TTL
- **Scheduled delivery**: Messages with future delivery timestamp
- **Retry with backoff**: Exponential backoff for failed messages

```
Delayed Message Flow:
┌──────────┐    ┌───────────────┐    ┌───────────────┐    ┌──────────┐
│ Producer │───▶│  Delay Buffer │───▶│  Ready Queue  │───▶│ Consumer │
│(delay=5m)│    │  (Timer Wheel)│    │               │    │          │
└──────────┘    └───────────────┘    └───────────────┘    └──────────┘
                      │
                  5 minutes later
                      │
                      ▼
                 Move to Ready Queue
```

## Partitioning and Scalability

### Topic Partitioning
```
Topic: orders (6 partitions)
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│  P0     │  │  P1     │  │  P2     │  │  P3     │  │  P4     │  │  P5     │
│ Broker1 │  │ Broker2 │  │ Broker3 │  │ Broker1 │  │ Broker2 │  │ Broker3 │
│ (Leader)│  │ (Leader)│  │ (Leader)│  │ (Leader)│  │ (Leader)│  │ (Leader)│
└─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘

Consumer Group (3 consumers):
  Consumer 1 → P0, P1
  Consumer 2 → P2, P3
  Consumer 3 → P4, P5
```

### Partition Assignment Strategies
- **Range**: Assign contiguous partition ranges to consumers
- **Round-Robin**: Distribute partitions evenly across consumers
- **Sticky**: Minimize reassignment during rebalance
- **Cooperative Sticky**: Incremental rebalance without stop-the-world

## Replication

### Leader-Follower Replication
```
Write Path (acks=all):
Producer → Leader → Follower1 (sync) → Follower2 (sync) → ACK to Producer

Read Path:
Consumer → Leader (or any ISR member for read replicas)

ISR (In-Sync Replica) Set:
  Leader: Broker 1 (offset 1000)
  Follower 1: Broker 2 (offset 998) ← In ISR (within threshold)
  Follower 2: Broker 3 (offset 1000) ← In ISR
  Follower 3: Broker 4 (offset 950) ← OUT of ISR (lagging)
```

### Quorum-Based Replication (Raft)
- Used by Kafka KRaft, Redpanda, NATS JetStream
- No external coordination service needed
- Leader election via Raft consensus
- Committed when majority acknowledges

## Extension Points

### 1. Message Interceptors
```rust
trait MessageInterceptor {
    fn on_produce(&self, message: &mut Message) -> InterceptResult;
    fn on_consume(&self, message: &mut Message) -> InterceptResult;
    fn on_acknowledge(&self, message: &Message, success: bool);
}
```

### 2. Custom Partitioners
```rust
trait Partitioner {
    fn partition(&self, key: &[u8], num_partitions: u32) -> u32;
}
```

### 3. Serialization Plugins
```rust
trait MessageSerializer {
    fn serialize(&self, value: &dyn Any) -> Result<Vec<u8>, SerError>;
    fn deserialize(&self, bytes: &[u8]) -> Result<Box<dyn Any>, SerError>;
    fn content_type(&self) -> &str;
}
```

### 4. Authentication Plugins
```rust
trait AuthenticationProvider {
    fn authenticate(&self, credentials: &Credentials) -> Result<Principal, AuthError>;
    fn supported_mechanisms(&self) -> Vec<String>;
}
```

### 5. Storage Backends
```rust
trait StorageEngine {
    fn append(&self, topic: &str, partition: u32, messages: &[Message]) -> Result<Vec<Offset>>;
    fn read(&self, topic: &str, partition: u32, offset: Offset, max: usize) -> Result<Vec<Message>>;
    fn truncate(&self, topic: &str, partition: u32, before_offset: Offset) -> Result<()>;
    fn get_high_watermark(&self, topic: &str, partition: u32) -> Result<Offset>;
}
```

## Security Considerations

### 1. Authentication
- **SASL/PLAIN**: Username/password over TLS
- **SASL/SCRAM**: Challenge-response, no plaintext passwords
- **SASL/GSSAPI (Kerberos)**: Enterprise SSO integration
- **mTLS**: Mutual TLS with client certificates
- **OAuth 2.0 / OIDC**: Token-based authentication
- **API Keys**: Simple key-based access

### 2. Authorization
- **ACLs**: Per-topic, per-consumer-group access control lists
- **RBAC**: Role-based access (admin, producer, consumer, read-only)
- **Resource Patterns**: Wildcards for topic name patterns
- **Operation Permissions**: Read, Write, Create, Delete, Alter, Describe

### 3. Encryption
- **In-Transit**: TLS 1.2+ for all client-broker and inter-broker traffic
- **At-Rest**: Encrypted log segments on disk (AES-256)
- **End-to-End**: Application-level payload encryption

### 4. Audit Logging
- **Producer Actions**: Who published what, when
- **Consumer Actions**: Who consumed what, offset commits
- **Administrative Actions**: Topic creation, ACL changes, config updates
- **Authentication Events**: Login success/failure, token refresh

## Performance Targets

### Throughput Targets (per broker)
- **Produce**: 500,000 messages/second (1KB messages)
- **Consume**: 1,000,000 messages/second (1KB messages)
- **Produce (batched)**: 2,000,000 messages/second
- **Network throughput**: 1 GB/sec sustained

### Latency Targets
- **P50 produce latency (acks=1)**: < 2ms
- **P99 produce latency (acks=1)**: < 10ms
- **P50 produce latency (acks=all)**: < 5ms
- **P99 produce latency (acks=all)**: < 25ms
- **P50 end-to-end latency**: < 5ms
- **P99 end-to-end latency**: < 50ms

### Scalability Targets
- **Partitions per broker**: 10,000+
- **Topics per cluster**: 100,000+
- **Consumer groups**: 10,000+
- **Brokers per cluster**: 100+
- **Message retention**: Weeks to years
- **Message size**: Up to 10MB (configurable)

### Reliability Targets
- **Durability**: Zero message loss with acks=all and min.insync.replicas=2
- **Availability**: 99.99% with 3+ replica factor
- **Recovery time**: < 30 seconds for leader election
- **Rebalance time**: < 60 seconds for consumer group rebalance

## Implementation Architecture

### Core Components
1. **Network Layer**: Accept connections, manage I/O (NIO/epoll)
2. **Protocol Handler**: Parse and validate wire protocol messages
3. **Request Processor**: Route requests to appropriate handlers
4. **Log Manager**: Manage append-only log segments per partition
5. **Replication Manager**: Coordinate leader-follower replication
6. **Group Coordinator**: Manage consumer group membership and rebalance
7. **Controller**: Cluster metadata management and leader election
8. **Index Manager**: Maintain offset and timestamp indices
9. **Compaction Manager**: Background log compaction for compacted topics
10. **Quota Manager**: Enforce producer/consumer rate limits

### Data Structures
```rust
// Core log segment
struct LogSegment {
    base_offset: u64,
    log_file: File,          // Append-only message data
    index_file: File,        // Sparse offset-to-position index
    time_index_file: File,   // Timestamp-to-offset index
    max_segment_size: u64,
    created_at: Timestamp,
}

// Partition state
struct Partition {
    topic: String,
    partition_id: u32,
    leader_epoch: u32,
    segments: Vec<LogSegment>,
    active_segment: LogSegment,
    high_watermark: AtomicU64,      // Last replicated offset
    log_end_offset: AtomicU64,      // Last written offset
    replica_set: Vec<BrokerId>,
    isr: Vec<BrokerId>,             // In-sync replicas
}

// Consumer group state
struct ConsumerGroupState {
    group_id: String,
    generation_id: u32,
    state: GroupState,  // Empty, PreparingRebalance, CompletingRebalance, Stable, Dead
    leader: Option<MemberId>,
    members: HashMap<MemberId, MemberMetadata>,
    offsets: HashMap<TopicPartition, OffsetAndMetadata>,
    assignment_strategy: String,
}

// Broker configuration
struct BrokerConfig {
    node_id: u32,
    listeners: Vec<ListenerConfig>,
    log_dirs: Vec<PathBuf>,
    num_partitions: u32,
    replication_factor: u16,
    min_insync_replicas: u16,
    log_segment_bytes: u64,
    log_retention_hours: u32,
    log_retention_bytes: i64,
    message_max_bytes: u32,
    num_network_threads: u32,
    num_io_threads: u32,
}
```

This blueprint provides the comprehensive foundation needed to implement a production-grade message queue system with all essential features, delivery guarantees, security considerations, and performance requirements clearly defined.
