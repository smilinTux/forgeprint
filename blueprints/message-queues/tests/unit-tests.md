# Message Queue Unit Tests Specification

## Overview
This document defines comprehensive unit test requirements for any generated message queue implementation. Every test MUST pass for the implementation to be considered complete and production-ready.

## Test Categories

### 1. Message Production Tests

#### 1.1 Basic Message Publishing
**Test: `test_publish_single_message`**
- **Purpose**: Verify basic message publishing functionality
- **Action**: Publish message with key="user-1", value="hello world", topic="test-topic"
- **Assert**: Message accepted, returns message ID or offset

**Test: `test_publish_message_with_headers`**
- **Purpose**: Verify header support in messages
- **Action**: Publish message with headers {correlation-id: "abc123", source: "api"}
- **Assert**: Headers preserved and accessible to consumers

**Test: `test_publish_binary_message`**
- **Purpose**: Verify binary payload support
- **Action**: Publish message with binary data (protobuf, avro, raw bytes)
- **Assert**: Binary data preserved without corruption

**Test: `test_publish_to_nonexistent_topic_creates_topic`**
- **Setup**: auto.create.topics.enable = true
- **Action**: Publish to topic "auto-created"
- **Assert**: Topic created automatically with default configuration

**Test: `test_publish_to_nonexistent_topic_fails`**
- **Setup**: auto.create.topics.enable = false
- **Action**: Publish to topic "nonexistent"
- **Assert**: Publishing fails with TopicNotFound error

**Test: `test_publish_message_too_large`**
- **Setup**: max.message.bytes = 1MB
- **Action**: Publish 2MB message
- **Assert**: Publishing fails with MessageTooLarge error

#### 1.2 Message Keys and Partitioning
**Test: `test_message_with_null_key`**
- **Action**: Publish message with key=null
- **Assert**: Message assigned to partition via round-robin or random

**Test: `test_message_with_key_consistent_partitioning`**
- **Setup**: Topic with 3 partitions
- **Action**: Publish 10 messages with key="user-123"
- **Assert**: All messages land in same partition

**Test: `test_different_keys_distribute_partitions`**
- **Setup**: Topic with 3 partitions
- **Action**: Publish messages with keys "A", "B", "C" (designed to hash to different partitions)
- **Assert**: Messages distributed across different partitions

**Test: `test_custom_partitioner`**
- **Setup**: Custom partitioner that routes "VIP" prefix to partition 0
- **Action**: Publish messages with keys "VIP-user1", "regular-user2"
- **Assert**: VIP message in partition 0, regular message elsewhere

#### 1.3 Producer Acknowledgments
**Test: `test_acks_none_fire_and_forget`**
- **Setup**: Producer with acks=0
- **Action**: Publish message
- **Assert**: Producer returns immediately without waiting for broker acknowledgment

**Test: `test_acks_leader_waits_for_leader_write`**
- **Setup**: Producer with acks=1, topic with replication factor=3
- **Action**: Publish message
- **Assert**: Producer waits for leader write, returns before follower replication

**Test: `test_acks_all_waits_for_isr`**
- **Setup**: Producer with acks=all, min.insync.replicas=2
- **Action**: Publish message
- **Assert**: Producer waits for leader + 1 follower acknowledgment

**Test: `test_producer_timeout_on_slow_broker`**
- **Setup**: Producer timeout = 5 seconds, simulate slow broker
- **Action**: Publish message to slow broker
- **Assert**: Producer times out after 5 seconds with TimeoutException

#### 1.4 Batching and Buffering
**Test: `test_message_batching`**
- **Setup**: Producer with batch.size=16KB, linger.ms=100
- **Action**: Send 10 small messages quickly
- **Assert**: Messages batched together in single broker request

**Test: `test_linger_timeout_forces_send`**
- **Setup**: linger.ms=50, single small message
- **Action**: Send message, wait 100ms
- **Assert**: Message sent after linger timeout even if batch not full

**Test: `test_batch_size_limit_forces_send`**
- **Setup**: batch.size=1KB
- **Action**: Send 2KB message
- **Assert**: Batch sent immediately when size limit reached

### 2. Message Consumption Tests

#### 2.1 Basic Message Consumption
**Test: `test_consume_single_message`**
- **Setup**: Topic with 1 published message
- **Action**: Consumer polls topic
- **Assert**: Receives the message with correct key, value, headers, timestamp

**Test: `test_consume_multiple_messages_in_order`**
- **Setup**: Publish 5 messages to same partition in sequence
- **Action**: Consumer polls repeatedly
- **Assert**: Messages received in FIFO order

**Test: `test_consume_from_specific_partition`**
- **Action**: Consumer subscribes to partition 2 only
- **Assert**: Receives only messages from partition 2

**Test: `test_consume_from_specific_offset`**
- **Setup**: Topic with 100 messages
- **Action**: Consumer seeks to offset 50 and polls
- **Assert**: Receives messages starting from offset 50

**Test: `test_consume_with_max_poll_records`**
- **Setup**: max.poll.records = 10, topic with 50 messages
- **Action**: Single poll() call
- **Assert**: Returns maximum 10 messages

#### 2.2 Consumer Groups
**Test: `test_consumer_group_partition_assignment`**
- **Setup**: Topic with 6 partitions, consumer group with 3 members
- **Action**: All consumers join group
- **Assert**: Each consumer assigned 2 partitions

**Test: `test_consumer_group_rebalancing_on_new_member`**
- **Setup**: 3 consumers, 6 partitions (2 partitions each)
- **Action**: Add 4th consumer to group
- **Assert**: Partitions rebalanced, each consumer gets 1-2 partitions

**Test: `test_consumer_group_rebalancing_on_member_leave`**
- **Setup**: 3 consumers, 6 partitions
- **Action**: Stop 1 consumer (graceful shutdown)
- **Assert**: Remaining 2 consumers get 3 partitions each

**Test: `test_consumer_group_rebalancing_on_member_timeout`**
- **Setup**: session.timeout.ms = 30s, max.poll.interval.ms = 5 minutes
- **Action**: Consumer stops polling for 6 minutes
- **Assert**: Consumer kicked out, partitions reassigned to other members

**Test: `test_consumer_group_coordinator_failover`**
- **Action**: Restart broker acting as group coordinator
- **Assert**: Group automatically reassigns to new coordinator, continues functioning

#### 2.3 Offset Management
**Test: `test_auto_commit_offsets`**
- **Setup**: enable.auto.commit=true, auto.commit.interval.ms=1000
- **Action**: Consume messages, wait 1.5 seconds
- **Assert**: Offsets automatically committed to __consumer_offsets topic

**Test: `test_manual_commit_sync`**
- **Setup**: enable.auto.commit=false
- **Action**: Consume messages, call commitSync()
- **Assert**: Offsets committed synchronously, call blocks until complete

**Test: `test_manual_commit_async`**
- **Action**: Consume messages, call commitAsync()
- **Assert**: Offsets committed asynchronously, call returns immediately

**Test: `test_commit_specific_offsets`**
- **Action**: commitSync(Map<TopicPartition, OffsetAndMetadata>)
- **Assert**: Only specified partition offsets committed

**Test: `test_offset_reset_earliest`**
- **Setup**: auto.offset.reset=earliest, no committed offset
- **Action**: Consumer starts consuming
- **Assert**: Starts from beginning of partition (offset 0)

**Test: `test_offset_reset_latest`**
- **Setup**: auto.offset.reset=latest, no committed offset
- **Action**: Consumer starts consuming
- **Assert**: Starts from end of partition (latest offset)

**Test: `test_offset_reset_none_throws_exception`**
- **Setup**: auto.offset.reset=none, no committed offset
- **Action**: Consumer attempts to consume
- **Assert**: Throws NoOffsetForPartitionException

### 3. Message Ordering Tests

#### 3.1 Partition-Level Ordering
**Test: `test_single_partition_strict_ordering`**
- **Setup**: Topic with 1 partition
- **Action**: Publish 100 messages with sequential IDs
- **Assert**: Consumer receives all messages in exact sequential order

**Test: `test_multiple_partition_per_partition_ordering`**
- **Setup**: Topic with 3 partitions
- **Action**: Publish 30 messages with same key (all to same partition)
- **Assert**: All messages received in order within that partition

**Test: `test_different_partitions_no_global_order`**
- **Setup**: Topic with 3 partitions
- **Action**: Publish messages to different partitions simultaneously
- **Assert**: No ordering guarantee across partitions

#### 3.2 Producer Ordering Guarantees
**Test: `test_producer_max_in_flight_1_ordering`**
- **Setup**: max.in.flight.requests.per.connection=1
- **Action**: Send messages with retries enabled
- **Assert**: Even with retries, messages remain in send order

**Test: `test_producer_max_in_flight_multiple_potential_reordering`**
- **Setup**: max.in.flight.requests.per.connection=5, enable.idempotence=false
- **Action**: Send messages with simulated retry
- **Assert**: Message order may not be preserved due to retries

**Test: `test_idempotent_producer_maintains_order`**
- **Setup**: enable.idempotence=true, max.in.flight.requests.per.connection=5
- **Action**: Send messages with retries
- **Assert**: Order preserved even with multiple in-flight requests

### 4. Delivery Guarantees Tests

#### 4.1 At-Most-Once Delivery
**Test: `test_at_most_once_producer`**
- **Setup**: Producer with acks=0, retries=0
- **Action**: Send message to failing broker
- **Assert**: Message may be lost, never duplicated

**Test: `test_at_most_once_consumer`**
- **Setup**: Consumer commits offset before processing
- **Action**: Process message, simulate crash before processing complete
- **Assert**: Message lost but not reprocessed

#### 4.2 At-Least-Once Delivery
**Test: `test_at_least_once_producer_retry`**
- **Setup**: Producer with retries > 0, acks=all
- **Action**: Simulate network failure during send
- **Assert**: Message eventually delivered, possibly duplicated

**Test: `test_at_least_once_consumer_commit_after_processing`**
- **Setup**: Consumer commits offset after processing
- **Action**: Process message, simulate crash before commit
- **Assert**: Message redelivered on restart (potential duplication)

#### 4.3 Exactly-Once Delivery
**Test: `test_exactly_once_idempotent_producer`**
- **Setup**: enable.idempotence=true, transactional.id set
- **Action**: Send same message multiple times due to retries
- **Assert**: Only one copy stored in partition

**Test: `test_exactly_once_transactional_consume_transform_produce`**
- **Setup**: Consumer and producer in same transaction
- **Action**: Read from input topic, transform, write to output topic, commit transaction
- **Assert**: Each input message processed exactly once to output

**Test: `test_exactly_once_transaction_abort`**
- **Setup**: Transactional producer
- **Action**: Begin transaction, send messages, abort transaction
- **Assert**: Messages not visible to consumers

### 5. Dead Letter Queue Tests

#### 5.1 DLQ Configuration
**Test: `test_dlq_after_max_retries`**
- **Setup**: Consumer with max.retries=3, DLQ configured
- **Action**: Message processing fails 4 times
- **Assert**: Message sent to DLQ after 3 retries

**Test: `test_dlq_preserves_original_message`**
- **Action**: Message sent to DLQ
- **Assert**: Original message payload, headers, and metadata preserved in DLQ

**Test: `test_dlq_adds_failure_metadata`**
- **Action**: Message sent to DLQ due to processing failure
- **Assert**: DLQ message includes failure reason, retry count, timestamps

#### 5.2 DLQ Processing Patterns
**Test: `test_dlq_manual_reprocessing`**
- **Setup**: Messages in DLQ
- **Action**: Manual consumer reads from DLQ, reprocesses, republishes
- **Assert**: Messages successfully reprocessed from DLQ

**Test: `test_dlq_automatic_retry_with_backoff`**
- **Setup**: DLQ with automatic retry after delay
- **Action**: Message in DLQ for 1 hour
- **Assert**: Message automatically republished to original topic after delay

### 6. TTL (Time-To-Live) Tests

**Test: `test_message_ttl_expiration`**
- **Setup**: Topic with message.ttl.ms=5000 (5 seconds)
- **Action**: Publish message, wait 10 seconds, try to consume
- **Assert**: Message expired, not returned to consumer

**Test: `test_message_ttl_before_expiration`**
- **Setup**: Same TTL configuration
- **Action**: Publish message, consume within 3 seconds
- **Assert**: Message delivered successfully

**Test: `test_queue_ttl_auto_deletion`**
- **Setup**: Queue with queue.ttl.ms=60000, no consumers or producers
- **Action**: Wait 65 seconds
- **Assert**: Queue automatically deleted

**Test: `test_per_message_ttl`**
- **Setup**: Per-message TTL override
- **Action**: Publish message with TTL=2000ms
- **Assert**: Message expires after 2 seconds regardless of topic default

### 7. Partitioning Tests

#### 7.1 Partition Management
**Test: `test_partition_assignment_round_robin`**
- **Setup**: Topic with 3 partitions, producer with round-robin partitioner
- **Action**: Send 9 messages with null keys
- **Assert**: 3 messages in each partition

**Test: `test_partition_assignment_key_hash`**
- **Setup**: Topic with 3 partitions, hash partitioner
- **Action**: Send messages with keys that hash consistently
- **Assert**: Same key always routes to same partition

**Test: `test_add_partitions_online`**
- **Setup**: Topic with 3 partitions, active producers/consumers
- **Action**: Add 2 more partitions
- **Assert**: New partitions available, existing data unchanged

**Test: `test_consumer_rebalance_after_partition_addition`**
- **Setup**: 2 consumers, 3 partitions (uneven assignment)
- **Action**: Add partition, trigger rebalance
- **Assert**: Partitions redistributed more evenly

#### 7.2 Partition Failure Handling
**Test: `test_partition_leader_failover`**
- **Setup**: Multi-broker cluster, topic with replication
- **Action**: Stop leader broker for partition
- **Assert**: Follower promoted to leader, producers/consumers continue

**Test: `test_partition_leader_election_preferred_replica`**
- **Setup**: Preferred leader returns after failure
- **Action**: Start preferred leader broker
- **Assert**: Leadership moves back to preferred replica

### 8. Consumer Rebalancing Tests

#### 8.1 Rebalance Strategies
**Test: `test_range_assignment_strategy`**
- **Setup**: 7 partitions, 3 consumers, range assignment
- **Expected**: Consumer1: [0,1,2], Consumer2: [3,4], Consumer3: [5,6]

**Test: `test_round_robin_assignment_strategy`**
- **Setup**: 7 partitions, 3 consumers, round-robin assignment
- **Expected**: More even distribution: [0,3,6], [1,4], [2,5]

**Test: `test_sticky_assignment_minimizes_movement`**
- **Setup**: Established assignments, new consumer joins
- **Action**: Trigger rebalance with sticky assignment
- **Assert**: Minimal partition movement between existing consumers

#### 8.2 Rebalance Lifecycle
**Test: `test_rebalance_listener_callbacks`**
- **Setup**: Consumer with rebalance listener
- **Action**: Trigger rebalance by adding consumer
- **Assert**: onPartitionsRevoked() called before, onPartitionsAssigned() after

**Test: `test_commit_offsets_on_rebalance`**
- **Setup**: Consumer with manual offset commits
- **Action**: Trigger rebalance via onPartitionsRevoked()
- **Assert**: Consumer commits current offsets before giving up partitions

**Test: `test_cooperative_rebalance_incremental`**
- **Setup**: Cooperative rebalance protocol
- **Action**: Add new consumer
- **Assert**: Only subset of partitions reassigned, not all consumers stopped

### 9. Flow Control and Backpressure Tests

**Test: `test_producer_buffer_full_blocks`**
- **Setup**: Producer with small buffer.memory, fast message production
- **Action**: Produce messages faster than network can send
- **Assert**: Producer blocks when buffer full (or fails if block.on.buffer.full=false)

**Test: `test_consumer_max_poll_records_limit`**
- **Setup**: Large message backlog, max.poll.records=100
- **Action**: Consumer poll()
- **Assert**: Returns exactly 100 messages max, not entire partition

**Test: `test_consumer_pause_resume_partitions`**
- **Setup**: Consumer assigned multiple partitions
- **Action**: Pause partition 0, poll(), resume partition 0
- **Assert**: No messages from partition 0 while paused, resume works

### 10. Schema Evolution Tests

**Test: `test_producer_consumer_schema_compatibility`**
- **Setup**: Producer with schema v1, consumer expecting v1
- **Action**: Send and consume message
- **Assert**: Successful deserialization

**Test: `test_backward_compatible_schema_evolution`**
- **Setup**: Producer with schema v2 (adds optional field), consumer with v1
- **Action**: Send v2 message, consume with v1 deserializer
- **Assert**: Successfully ignores unknown fields

**Test: `test_forward_compatible_schema_evolution`**
- **Setup**: Producer with schema v1, consumer with v2 (has default for new field)
- **Action**: Send v1 message, consume with v2 deserializer
- **Assert**: Successfully applies defaults for missing fields

**Test: `test_incompatible_schema_fails`**
- **Setup**: Producer with breaking schema change (remove required field)
- **Action**: Attempt to deserialize old messages
- **Assert**: Deserialization fails with clear schema mismatch error

### 11. Security Tests

**Test: `test_acl_topic_access_control`**
- **Setup**: User "producer" has WRITE access, user "consumer" has READ access
- **Action**: Producer publishes, consumer reads
- **Assert**: Both succeed; unauthorized operations fail

**Test: `test_acl_consumer_group_isolation`**
- **Setup**: User1 can access group1, User2 can access group2
- **Action**: User1 tries to join group2
- **Assert**: Access denied with authorization error

**Test: `test_ssl_encryption_in_transit`**
- **Setup**: Broker and clients configured for SSL
- **Action**: Produce and consume messages
- **Assert**: All network traffic encrypted, performance overhead measured

## Test Execution Requirements

### Test Environment
- **Isolation**: Each test uses separate topics or runs in isolated environment
- **Cleanup**: Topics, consumer groups cleaned up after each test
- **Repeatability**: Tests produce same results on multiple runs
- **Speed**: Full test suite completes in < 10 minutes

### Coverage Requirements
- **Functionality**: All delivery guarantees and ordering semantics tested
- **Error Conditions**: Network failures, broker restarts, invalid operations
- **Edge Cases**: Empty topics, single message, very large messages
- **Concurrency**: Multiple producers/consumers, rebalancing scenarios

### Success Criteria
A message queue implementation passes unit tests if:
1. **100% test pass rate** on all applicable tests
2. **Message ordering** preserved within partitions
3. **Delivery guarantees** working as configured
4. **Consumer group** coordination and rebalancing functional
5. **No message loss** in at-least-once and exactly-once modes
6. **Clean shutdown** without losing uncommitted messages