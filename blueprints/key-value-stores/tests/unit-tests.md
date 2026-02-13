# Key-Value Store Unit Tests Specification

## Overview
This document defines comprehensive unit test requirements for any generated key-value store implementation. Every test MUST pass for the implementation to be considered complete and production-ready. These tests ensure Redis/Valkey protocol compatibility, data structure correctness, persistence reliability, replication consistency, and cluster functionality.

## Test Categories

### 1. RESP Protocol Tests

#### 1.1 RESP2 Protocol Compliance
**Test: `test_resp2_simple_strings`**
- **Purpose**: Verify parsing and generation of RESP2 simple strings
- **Action**: Parse `+OK\r\n` and `+PONG\r\n`
- **Assert**: Correct RespValue::SimpleString("OK") and RespValue::SimpleString("PONG")
- **Generation**: Verify encoding back to exact wire format

**Test: `test_resp2_errors`**
- **Purpose**: Verify error message parsing
- **Action**: Parse `-ERR unknown command 'foobar'\r\n`
- **Assert**: RespValue::Error("ERR unknown command 'foobar'")
- **Edge cases**: Empty error message, special characters

**Test: `test_resp2_integers`**
- **Purpose**: Verify integer parsing and range handling
- **Action**: Parse `:0\r\n`, `:1000\r\n`, `:-1000\r\n`, `:9223372036854775807\r\n`
- **Assert**: Correct i64 values including i64::MAX and i64::MIN
- **Error cases**: Overflow, invalid format

**Test: `test_resp2_bulk_strings`**
- **Purpose**: Verify bulk string parsing including binary data
- **Action**: Parse `$5\r\nhello\r\n`, `$0\r\n\r\n`, `$-1\r\n`
- **Assert**: 
  - Valid strings parsed correctly
  - Empty string handling
  - Null bulk string handling
- **Binary test**: `$3\r\n\x00\x01\x02\r\n`

**Test: `test_resp2_arrays`**
- **Purpose**: Verify array parsing including nested structures
- **Action**: Parse `*2\r\n$5\r\nhello\r\n$5\r\nworld\r\n`
- **Assert**: Array with two bulk strings
- **Edge cases**: Empty arrays (`*0\r\n`), null arrays (`*-1\r\n`)
- **Nested**: Arrays containing arrays, mixed types

#### 1.2 RESP3 Protocol Extensions
**Test: `test_resp3_null_type`**
- **Purpose**: Verify RESP3 null type
- **Action**: Parse `_\r\n`
- **Assert**: RespValue::Null
- **Compatibility**: Ensure backward compatibility with RESP2 null representations

**Test: `test_resp3_boolean_type`**
- **Purpose**: Verify boolean parsing
- **Action**: Parse `#t\r\n` and `#f\r\n`
- **Assert**: RespValue::Boolean(true) and RespValue::Boolean(false)

**Test: `test_resp3_double_type`**
- **Purpose**: Verify double/float parsing
- **Action**: Parse `,3.14\r\n`, `,inf\r\n`, `,-inf\r\n`, `,nan\r\n`
- **Assert**: Correct f64 values including special values
- **Precision**: Verify round-trip accuracy

**Test: `test_resp3_maps`**
- **Purpose**: Verify map/dictionary parsing
- **Action**: Parse `%2\r\n+first\r\n:1\r\n+second\r\n:2\r\n`
- **Assert**: Map with two key-value pairs
- **Edge cases**: Empty maps, nested maps

### 2. Core Command Tests

#### 2.1 String Operations
**Test: `test_get_set_commands`**
- **Purpose**: Verify basic GET/SET functionality
- **Action**: 
  ```
  SET key1 "hello"
  GET key1
  GET nonexistent
  ```
- **Assert**: 
  - SET returns +OK
  - GET returns "hello"
  - GET nonexistent returns null

**Test: `test_set_options`**
- **Purpose**: Verify SET command options
- **Action**:
  ```
  SET key1 "value1" EX 10
  SET key2 "value2" NX
  SET key2 "value3" NX
  SET key2 "value3" XX
  ```
- **Assert**:
  - EX sets expiry correctly
  - NX only sets if key doesn't exist
  - XX only sets if key exists

**Test: `test_incr_decr_commands`**
- **Purpose**: Verify atomic increment/decrement
- **Action**:
  ```
  SET counter "10"
  INCR counter
  INCRBY counter 5
  DECR counter
  DECRBY counter 3
  ```
- **Assert**: Values are 11, 16, 15, 12 respectively
- **Error cases**: INCR on non-integer string

**Test: `test_mget_mset_commands`**
- **Purpose**: Verify multi-key operations
- **Action**:
  ```
  MSET key1 "val1" key2 "val2" key3 "val3"
  MGET key1 key2 key3 nonexistent
  ```
- **Assert**: MGET returns array with three values plus null

#### 2.2 Key Management
**Test: `test_del_command`**
- **Purpose**: Verify key deletion
- **Action**:
  ```
  SET key1 "value1"
  SET key2 "value2"
  DEL key1 key2 nonexistent
  GET key1
  ```
- **Assert**: DEL returns 2 (deleted count), GET key1 returns null

**Test: `test_exists_command`**
- **Purpose**: Verify key existence checking
- **Action**:
  ```
  SET key1 "value"
  EXISTS key1 nonexistent
  EXISTS key1 key1 nonexistent
  ```
- **Assert**: First EXISTS returns 1, second returns 2

**Test: `test_type_command`**
- **Purpose**: Verify type detection
- **Action**:
  ```
  SET string_key "value"
  LPUSH list_key "item"
  SADD set_key "member"
  TYPE string_key
  TYPE list_key
  TYPE set_key
  TYPE nonexistent
  ```
- **Assert**: Returns "string", "list", "set", "none" respectively

**Test: `test_rename_commands`**
- **Purpose**: Verify key renaming
- **Action**:
  ```
  SET oldkey "value"
  RENAME oldkey newkey
  GET oldkey
  GET newkey
  RENAMENX newkey existingkey
  ```
- **Assert**: oldkey deleted, newkey has value, RENAMENX behavior correct

### 3. Data Structure Tests

#### 3.1 List Operations
**Test: `test_list_push_pop`**
- **Purpose**: Verify basic list operations
- **Action**:
  ```
  LPUSH mylist "a" "b" "c"
  RPUSH mylist "d" "e"
  LPOP mylist
  RPOP mylist
  LLEN mylist
  ```
- **Assert**: Length is 3, popped values are "c" and "e"

**Test: `test_list_range`**
- **Purpose**: Verify list range operations
- **Action**:
  ```
  RPUSH mylist "a" "b" "c" "d" "e"
  LRANGE mylist 0 2
  LRANGE mylist -2 -1
  LRANGE mylist 0 -1
  ```
- **Assert**: Returns ["a","b","c"], ["d","e"], and full list

**Test: `test_list_index_set`**
- **Purpose**: Verify list indexing and modification
- **Action**:
  ```
  RPUSH mylist "a" "b" "c"
  LINDEX mylist 1
  LSET mylist 1 "modified"
  LINDEX mylist 1
  ```
- **Assert**: Original value "b", after LSET returns "modified"

**Test: `test_blocking_list_operations`**
- **Purpose**: Verify blocking pop operations
- **Setup**: Two clients, one blocks on empty list
- **Action**:
  ```
  Client 1: BLPOP mylist 5
  Client 2: RPUSH mylist "item"
  ```
- **Assert**: Client 1 receives ["mylist", "item"]
- **Timeout**: Verify timeout behavior after 5 seconds

#### 3.2 Set Operations
**Test: `test_set_basic_operations`**
- **Purpose**: Verify set membership operations
- **Action**:
  ```
  SADD myset "a" "b" "c"
  SISMEMBER myset "b"
  SISMEMBER myset "d"
  SCARD myset
  SMEMBERS myset
  ```
- **Assert**: Membership returns 1/0, cardinality is 3, members correct

**Test: `test_set_operations`**
- **Purpose**: Verify set algebra
- **Action**:
  ```
  SADD set1 "a" "b" "c"
  SADD set2 "b" "c" "d"
  SUNION set1 set2
  SINTER set1 set2
  SDIFF set1 set2
  ```
- **Assert**: Union has 4 elements, intersection has 2, difference has 1

**Test: `test_set_random_operations`**
- **Purpose**: Verify random element operations
- **Action**:
  ```
  SADD myset "a" "b" "c" "d" "e"
  SRANDMEMBER myset
  SRANDMEMBER myset 3
  SPOP myset
  SCARD myset
  ```
- **Assert**: Random operations return valid members, pop reduces size

#### 3.3 Sorted Set Operations
**Test: `test_zset_basic_operations`**
- **Purpose**: Verify sorted set scoring
- **Action**:
  ```
  ZADD myzset 1 "one" 2 "two" 3 "three"
  ZSCORE myzset "two"
  ZRANK myzset "two"
  ZREVRANK myzset "two"
  ZCARD myzset
  ```
- **Assert**: Score is 2, rank is 1, reverse rank is 1, cardinality is 3

**Test: `test_zset_range_operations`**
- **Purpose**: Verify sorted set range queries
- **Action**:
  ```
  ZADD myzset 1 "one" 2 "two" 3 "three" 4 "four" 5 "five"
  ZRANGE myzset 0 2
  ZREVRANGE myzset 0 2
  ZRANGEBYSCORE myzset 2 4
  ZRANGEBYSCORE myzset "(2" "4"
  ```
- **Assert**: Ranges return correct elements in order, score filtering works

**Test: `test_zset_aggregation`**
- **Purpose**: Verify sorted set unions and intersections
- **Action**:
  ```
  ZADD zset1 1 "one" 2 "two"
  ZADD zset2 1 "one" 2 "two" 3 "three"
  ZUNIONSTORE result 2 zset1 zset2
  ZINTERSTORE result2 2 zset1 zset2
  ```
- **Assert**: Union combines scores, intersection finds common elements

#### 3.4 Hash Operations
**Test: `test_hash_basic_operations`**
- **Purpose**: Verify hash field operations
- **Action**:
  ```
  HSET myhash field1 "value1" field2 "value2"
  HGET myhash field1
  HEXISTS myhash field1
  HEXISTS myhash nonexistent
  HLEN myhash
  ```
- **Assert**: Get returns value, exists returns 1/0, length is 2

**Test: `test_hash_multi_operations`**
- **Purpose**: Verify multi-field hash operations
- **Action**:
  ```
  HMSET myhash f1 "v1" f2 "v2" f3 "v3"
  HMGET myhash f1 f2 nonexistent
  HGETALL myhash
  HKEYS myhash
  HVALS myhash
  ```
- **Assert**: Multi-get returns values plus null, all operations correct

**Test: `test_hash_increment`**
- **Purpose**: Verify hash field increment operations
- **Action**:
  ```
  HSET myhash counter "10"
  HINCRBY myhash counter 5
  HINCRBYFLOAT myhash pi 3.14
  ```
- **Assert**: Counter becomes 15, pi is 3.14

#### 3.5 Stream Operations
**Test: `test_stream_basic_operations`**
- **Purpose**: Verify stream append and read
- **Action**:
  ```
  XADD mystream * field1 value1 field2 value2
  XADD mystream * field3 value3
  XLEN mystream
  XRANGE mystream - +
  ```
- **Assert**: Stream has 2 entries, range returns all entries with auto-generated IDs

**Test: `test_stream_consumer_groups`**
- **Purpose**: Verify consumer group functionality
- **Action**:
  ```
  XADD mystream * msg "hello"
  XADD mystream * msg "world"
  XGROUP CREATE mystream mygroup 0
  XREADGROUP GROUP mygroup consumer1 COUNT 1 STREAMS mystream >
  XACK mystream mygroup <entry-id>
  ```
- **Assert**: Consumer group created, read returns one message, ACK succeeds

### 4. TTL and Expiry Tests

#### 4.1 Expiry Commands
**Test: `test_expire_commands`**
- **Purpose**: Verify expiry setting and checking
- **Action**:
  ```
  SET mykey "value"
  EXPIRE mykey 10
  TTL mykey
  PTTL mykey
  PERSIST mykey
  TTL mykey
  ```
- **Assert**: TTL returns ~10, PTTL returns ~10000ms, after PERSIST TTL is -1

**Test: `test_expiry_accuracy`**
- **Purpose**: Verify expiry timing accuracy
- **Action**:
  ```
  SET mykey "value"
  PEXPIRE mykey 100
  # Sleep 150ms
  GET mykey
  ```
- **Assert**: Key should be expired and return null

**Test: `test_lazy_expiry`**
- **Purpose**: Verify passive expiry on access
- **Setup**: Set key with short TTL, don't access until expired
- **Action**:
  ```
  SET mykey "value"
  PEXPIRE mykey 50
  # Sleep 100ms
  GET mykey
  EXISTS mykey
  ```
- **Assert**: Both commands should trigger expiry and return null/0

### 5. Persistence Tests

#### 5.1 RDB Snapshot Tests
**Test: `test_rdb_save_load`**
- **Purpose**: Verify RDB snapshot creation and loading
- **Action**:
  ```
  SET key1 "value1"
  LPUSH list1 "item1" "item2"
  SADD set1 "member1"
  BGSAVE
  # Wait for completion
  FLUSHALL
  # Load RDB file
  ```
- **Assert**: After load, all data restored correctly

**Test: `test_rdb_expiry_preservation`**
- **Purpose**: Verify TTL preservation in RDB
- **Action**:
  ```
  SET key1 "value1"
  EXPIRE key1 3600
  BGSAVE
  # Load RDB
  TTL key1
  ```
- **Assert**: TTL approximately preserved (within reasonable margin)

**Test: `test_rdb_encoding_preservation`**
- **Purpose**: Verify object encodings preserved/optimized
- **Action**:
  ```
  SET int_key "123"        # Should be integer encoding
  SET small_str "hello"    # Should be embstr
  LPUSH small_list "a"     # Should be listpack
  BGSAVE
  # Load and check OBJECT ENCODING
  ```
- **Assert**: Appropriate encodings maintained after load

#### 5.2 AOF Tests
**Test: `test_aof_command_logging`**
- **Purpose**: Verify AOF logs all write commands
- **Setup**: Enable AOF with fsync always
- **Action**:
  ```
  SET key1 "value1"
  LPUSH list1 "item"
  DEL key1
  ```
- **Assert**: AOF file contains exact RESP commands

**Test: `test_aof_recovery`**
- **Purpose**: Verify AOF replay recovery
- **Action**:
  ```
  # Execute commands with AOF enabled
  SET key1 "value1"
  INCR counter
  LPUSH list1 "item"
  # Restart server with AOF replay
  ```
- **Assert**: All commands replayed correctly

**Test: `test_aof_rewrite`**
- **Purpose**: Verify AOF rewrite compaction
- **Action**:
  ```
  SET key1 "value1"
  SET key1 "value2"  # Overwrites previous
  SET key1 "value3"  # Overwrites again
  BGREWRITEAOF
  # Check rewritten AOF
  ```
- **Assert**: Rewritten AOF contains only final SET command

### 6. Replication Tests

#### 6.1 Master-Replica Sync
**Test: `test_replica_full_sync`**
- **Purpose**: Verify initial replication sync
- **Setup**: Master with data, clean replica
- **Action**:
  ```
  # On master
  SET key1 "value1"
  LPUSH list1 "item1"
  # Start replication
  # On replica
  GET key1
  LLEN list1
  ```
- **Assert**: Replica has exact copy of master data

**Test: `test_replica_incremental_sync`**
- **Purpose**: Verify incremental replication
- **Setup**: Replica connected to master
- **Action**:
  ```
  # On master (while replica connected)
  SET key2 "value2"
  INCR counter
  # Check replica
  ```
- **Assert**: Replica receives incremental updates in real-time

**Test: `test_replica_partial_resync`**
- **Purpose**: Verify partial resync after disconnect
- **Setup**: Replica with replication backlog
- **Action**:
  ```
  # Disconnect replica temporarily
  # Write to master
  SET temp_key "temp_value"
  # Reconnect replica
  ```
- **Assert**: PSYNC succeeds with partial resync, no full RDB transfer

#### 6.2 Replication Consistency
**Test: `test_replication_command_propagation`**
- **Purpose**: Verify all write commands propagate
- **Action**:
  ```
  # On master
  MULTI
  SET key1 "value1"
  INCR counter
  EXEC
  # Check replica
  ```
- **Assert**: Transaction commands propagated atomically

**Test: `test_wait_command`**
- **Purpose**: Verify synchronous replication acknowledgment
- **Setup**: Master with 2 replicas
- **Action**:
  ```
  SET key1 "value1"
  WAIT 2 1000
  ```
- **Assert**: WAIT blocks until both replicas acknowledge

### 7. Transactions and Scripting Tests

#### 7.1 MULTI/EXEC Transactions
**Test: `test_transaction_atomicity`**
- **Purpose**: Verify transaction atomicity
- **Action**:
  ```
  SET counter "10"
  MULTI
  INCR counter
  INCR counter
  INCR counter
  EXEC
  GET counter
  ```
- **Assert**: All increments execute atomically, result is 13

**Test: `test_watch_optimistic_locking`**
- **Purpose**: Verify optimistic locking with WATCH
- **Setup**: Two clients watching same key
- **Action**:
  ```
  Client 1: WATCH mykey
  Client 2: SET mykey "changed"
  Client 1: MULTI
  Client 1: SET mykey "transaction"
  Client 1: EXEC
  ```
- **Assert**: Client 1 transaction aborts, returns null

**Test: `test_transaction_error_handling`**
- **Purpose**: Verify transaction continues after command errors
- **Action**:
  ```
  MULTI
  SET key1 "value1"
  INCR key1           # Error: wrong type
  SET key2 "value2"
  EXEC
  ```
- **Assert**: SET commands succeed, INCR returns error, transaction completes

#### 7.2 Lua Scripting
**Test: `test_lua_basic_execution`**
- **Purpose**: Verify basic Lua script execution
- **Action**:
  ```
  EVAL "return {KEYS[1], ARGV[1]}" 1 mykey myarg
  ```
- **Assert**: Returns array ["mykey", "myarg"]

**Test: `test_lua_redis_calls`**
- **Purpose**: Verify Lua scripts can call Redis commands
- **Action**:
  ```
  EVAL "
    redis.call('SET', KEYS[1], ARGV[1])
    return redis.call('GET', KEYS[1])
  " 1 mykey myvalue
  ```
- **Assert**: Returns "myvalue", key is actually set

**Test: `test_script_caching`**
- **Purpose**: Verify script SHA1 caching
- **Action**:
  ```
  SCRIPT LOAD "return 'hello'"
  EVALSHA <sha1> 0
  ```
- **Assert**: EVALSHA returns "hello" using cached script

### 8. Pub/Sub Tests

#### 8.1 Channel Pub/Sub
**Test: `test_channel_pubsub`**
- **Purpose**: Verify basic publish/subscribe
- **Setup**: Two clients, one subscribes
- **Action**:
  ```
  Client 1: SUBSCRIBE channel1
  Client 2: PUBLISH channel1 "message1"
  Client 1: # Should receive message
  ```
- **Assert**: Subscriber receives ["message", "channel1", "message1"]

**Test: `test_pattern_subscribe`**
- **Purpose**: Verify pattern-based subscriptions
- **Action**:
  ```
  Client 1: PSUBSCRIBE news.*
  Client 2: PUBLISH news.sports "Sports news"
  Client 2: PUBLISH news.tech "Tech news"
  ```
- **Assert**: Subscriber receives both messages with pattern info

**Test: `test_pubsub_unsubscribe`**
- **Purpose**: Verify unsubscribe functionality
- **Action**:
  ```
  SUBSCRIBE channel1 channel2
  UNSUBSCRIBE channel1
  PUBLISH channel1 "message"  # Should not receive
  PUBLISH channel2 "message"  # Should receive
  ```
- **Assert**: Only subscribed channels receive messages

### 9. Cluster Tests

#### 9.1 Slot Assignment
**Test: `test_crc16_slot_calculation`**
- **Purpose**: Verify hash slot calculation
- **Action**: Calculate slots for known keys
- **Assert**: 
  - CRC16("key") % 16384 matches expected slot
  - Hash tags work: "{user}.name" and "{user}.email" same slot

**Test: `test_cluster_keyslot_command`**
- **Purpose**: Verify CLUSTER KEYSLOT command
- **Action**:
  ```
  CLUSTER KEYSLOT "mykey"
  CLUSTER KEYSLOT "{user}.name"
  CLUSTER KEYSLOT "{user}.email"
  ```
- **Assert**: Returns correct slot numbers, hash tags work

#### 9.2 Cluster Routing
**Test: `test_cluster_moved_redirect`**
- **Purpose**: Verify MOVED redirects for wrong slots
- **Setup**: 3-node cluster, client connects to wrong node
- **Action**: 
  ```
  SET key_on_different_node "value"
  ```
- **Assert**: Returns MOVED error with correct node info

**Test: `test_cluster_ask_redirect`**
- **Purpose**: Verify ASK redirects during migration
- **Setup**: Slot migration in progress
- **Action**: Access key during migration
- **Assert**: Returns ASK error when appropriate

#### 9.3 Cluster Failover
**Test: `test_cluster_failover`**
- **Purpose**: Verify automatic failover
- **Setup**: 3 master + 3 replica cluster
- **Action**: Kill one master node
- **Assert**: 
  - Replica promoted to master within 15 seconds
  - Cluster continues serving requests
  - Failed node marked as FAIL

### 10. Memory and Performance Tests

#### 10.1 Memory Eviction
**Test: `test_maxmemory_eviction`**
- **Purpose**: Verify memory eviction policies
- **Setup**: Set maxmemory to small value
- **Action**:
  ```
  # Fill memory beyond limit
  for i in 1..1000:
      SET key{i} "value{i}"
  ```
- **Assert**: Eviction occurs, memory stays under limit

**Test: `test_lru_eviction_accuracy`**
- **Purpose**: Verify LRU eviction selects least recently used
- **Setup**: maxmemory-policy allkeys-lru
- **Action**:
  ```
  SET key1 "value1"
  SET key2 "value2"  
  SET key3 "value3"
  GET key1  # Access key1 (most recent)
  # Add keys until eviction occurs
  ```
- **Assert**: key2 or key3 evicted before key1

#### 10.2 Large Data Handling
**Test: `test_large_string_handling`**
- **Purpose**: Verify handling of large string values
- **Action**:
  ```
  SET large_key <1MB string>
  GET large_key
  APPEND large_key <additional data>
  ```
- **Assert**: Large strings stored and retrieved correctly

**Test: `test_many_small_keys`**
- **Purpose**: Verify handling of many small keys
- **Action**: Insert 100,000 small keys
- **Assert**: 
  - All keys accessible
  - Memory usage reasonable
  - Performance remains acceptable

## Test Execution Requirements

### Test Environment
- **Isolation**: Each test runs with clean server state
- **Determinism**: Tests produce consistent results
- **Concurrency**: Multi-client tests use actual connections
- **Timing**: Time-sensitive tests account for scheduling delays

### Test Data
- **Protocol compliance**: Use exact RESP wire format
- **Binary safety**: Include null bytes, special characters
- **Edge cases**: Empty strings, maximum values, boundary conditions
- **Unicode**: UTF-8 strings, emoji, various encodings

### Performance Requirements
- **Test speed**: Full suite completes in under 10 minutes
- **Resource usage**: Tests don't exhaust system resources
- **Cleanup**: Proper cleanup prevents resource leaks

### Compatibility Testing
- **Client libraries**: Test with multiple client implementations
- **Redis compatibility**: Commands behave identically to Redis
- **Version compatibility**: Support both RESP2 and RESP3

## Success Criteria
A key-value store implementation passes unit tests if:
1. **100% test pass rate** across all categories
2. **Protocol compliance** with RESP specification
3. **Data structure correctness** for all operations
4. **Persistence reliability** with no data loss
5. **Replication consistency** with master-replica sync
6. **Cluster functionality** with proper slot routing
7. **Memory management** with correct eviction behavior
8. **Performance stability** under test loads