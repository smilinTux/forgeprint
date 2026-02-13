# Object Storage Unit Tests Specification

## Overview
This document defines comprehensive unit test requirements for S3-compatible object storage implementations. Every test MUST pass for the implementation to be considered complete and production-ready. Tests are organized by functional areas and cover both happy path and error conditions.

## Test Categories

### 1. S3 API Conformance Tests

#### 1.1 Bucket Operations
**Test: `test_create_bucket_success`**
- **Purpose**: Verify bucket creation with valid names
- **Setup**: Clean object storage instance
- **Action**: `PUT /{bucket}` with valid DNS-compatible bucket name
- **Assert**: 
  - HTTP 200 OK response
  - Bucket appears in ListBuckets
  - Bucket accessible via HeadBucket
- **Cleanup**: Delete bucket

**Test: `test_create_bucket_invalid_name`**
- **Purpose**: Verify rejection of invalid bucket names
- **Test Cases**:
  - Too short (< 3 chars): `PUT /ab`
  - Too long (> 63 chars): `PUT /` + 64-char string
  - Invalid characters: `PUT /My_Bucket` (uppercase, underscore)
  - Starts with hyphen: `PUT /-bucket`
  - Ends with hyphen: `PUT /bucket-`
  - IP address format: `PUT /192.168.1.1`
- **Assert**: HTTP 400 InvalidBucketName for all cases

**Test: `test_create_bucket_already_exists`**
- **Purpose**: Verify handling of duplicate bucket creation
- **Setup**: Create bucket "test-bucket"
- **Action**: Attempt to create bucket "test-bucket" again
- **Assert**: 
  - HTTP 409 BucketAlreadyExists
  - Original bucket unchanged

**Test: `test_delete_bucket_empty`**
- **Purpose**: Verify deletion of empty buckets
- **Setup**: Create bucket with no objects
- **Action**: `DELETE /{bucket}`
- **Assert**: 
  - HTTP 204 No Content
  - Bucket no longer appears in ListBuckets
  - HeadBucket returns 404

**Test: `test_delete_bucket_not_empty`**
- **Purpose**: Verify rejection of non-empty bucket deletion
- **Setup**: Create bucket with one object
- **Action**: `DELETE /{bucket}`
- **Assert**: HTTP 409 BucketNotEmpty

**Test: `test_list_buckets`**
- **Purpose**: Verify bucket listing functionality
- **Setup**: Create 3 buckets with different names
- **Action**: `GET /`
- **Assert**:
  - HTTP 200 OK
  - Response contains all 3 buckets
  - Each bucket has name and creation date
  - Buckets sorted alphabetically

**Test: `test_head_bucket_exists`**
- **Purpose**: Verify bucket existence check
- **Setup**: Create bucket "test-bucket"
- **Action**: `HEAD /test-bucket`
- **Assert**: HTTP 200 OK with appropriate headers

**Test: `test_head_bucket_not_exists`**
- **Purpose**: Verify non-existent bucket handling
- **Action**: `HEAD /nonexistent-bucket`
- **Assert**: HTTP 404 NoSuchBucket

#### 1.2 Object Operations
**Test: `test_put_object_basic`**
- **Purpose**: Verify basic object upload
- **Setup**: Create bucket "test-bucket"
- **Action**: `PUT /test-bucket/hello.txt` with body "Hello, World!"
- **Assert**:
  - HTTP 200 OK
  - Response includes ETag header
  - Object retrievable via GET
- **Cleanup**: Delete object and bucket

**Test: `test_put_object_with_metadata`**
- **Purpose**: Verify object upload with user metadata
- **Setup**: Create bucket
- **Action**: PUT object with headers:
  ```
  Content-Type: text/plain
  x-amz-meta-author: John Doe
  x-amz-meta-purpose: testing
  Cache-Control: max-age=3600
  ```
- **Assert**: 
  - Object uploaded successfully
  - HEAD request returns all metadata headers
  - GET request includes metadata in response

**Test: `test_put_object_overwrite`**
- **Purpose**: Verify object overwrite behavior
- **Setup**: Upload object "test.txt" with content "version 1"
- **Action**: Upload same key with content "version 2"
- **Assert**: 
  - Second upload succeeds
  - GET retrieves "version 2" content
  - ETag changes between uploads

**Test: `test_get_object_basic`**
- **Purpose**: Verify basic object download
- **Setup**: Upload test object with known content
- **Action**: `GET /bucket/object`
- **Assert**:
  - HTTP 200 OK
  - Response body matches uploaded content
  - Content-Length header correct
  - ETag header present

**Test: `test_get_object_range`**
- **Purpose**: Verify byte-range requests
- **Setup**: Upload 1KB test file
- **Action**: `GET /bucket/object` with Range: bytes=100-199
- **Assert**:
  - HTTP 206 Partial Content
  - Content-Range header: bytes 100-199/1024
  - Response body is exactly 100 bytes
  - Content is correct subset of original

**Test: `test_get_object_not_exists`**
- **Purpose**: Verify handling of non-existent objects
- **Action**: `GET /bucket/nonexistent-object`
- **Assert**: HTTP 404 NoSuchKey

**Test: `test_head_object_basic`**
- **Purpose**: Verify object metadata retrieval without body
- **Setup**: Upload object with metadata
- **Action**: `HEAD /bucket/object`
- **Assert**:
  - HTTP 200 OK
  - All metadata headers present
  - No response body
  - Content-Length header accurate

**Test: `test_delete_object_exists`**
- **Purpose**: Verify deletion of existing objects
- **Setup**: Upload test object
- **Action**: `DELETE /bucket/object`
- **Assert**:
  - HTTP 204 No Content
  - Object no longer accessible via GET (404)

**Test: `test_delete_object_not_exists`**
- **Purpose**: Verify deletion of non-existent objects
- **Action**: `DELETE /bucket/nonexistent-object`
- **Assert**: HTTP 204 No Content (S3 idempotency)

**Test: `test_copy_object_same_bucket`**
- **Purpose**: Verify server-side copy within bucket
- **Setup**: Upload source object
- **Action**: `PUT /bucket/dest` with header `x-amz-copy-source: /bucket/source`
- **Assert**:
  - HTTP 200 OK
  - Destination object exists with identical content
  - Source object unchanged
  - Copy has new ETag

**Test: `test_copy_object_cross_bucket`**
- **Purpose**: Verify server-side copy across buckets
- **Setup**: Create two buckets, upload to first
- **Action**: Copy from bucket1/object to bucket2/object
- **Assert**:
  - Copy succeeds
  - Content identical
  - Metadata preserved (unless overridden)

#### 1.3 Object Listing
**Test: `test_list_objects_v2_basic`**
- **Purpose**: Verify basic object listing
- **Setup**: Upload 5 objects with different keys
- **Action**: `GET /bucket?list-type=2`
- **Assert**:
  - HTTP 200 OK
  - Response contains all 5 objects
  - Objects sorted by key (lexicographic)
  - Each object has Key, Size, LastModified, ETag

**Test: `test_list_objects_v2_prefix`**
- **Purpose**: Verify prefix filtering
- **Setup**: Upload objects: "dir1/file1", "dir1/file2", "dir2/file1"
- **Action**: `GET /bucket?list-type=2&prefix=dir1/`
- **Assert**:
  - Response contains only "dir1/file1" and "dir1/file2"
  - Objects with different prefixes not included

**Test: `test_list_objects_v2_delimiter`**
- **Purpose**: Verify delimiter-based virtual directory listing
- **Setup**: Upload objects: "dir1/file1", "dir1/sub/file2", "dir2/file3"
- **Action**: `GET /bucket?list-type=2&delimiter=/`
- **Assert**:
  - CommonPrefixes contains "dir1/" and "dir2/"
  - No individual files in response

**Test: `test_list_objects_v2_max_keys`**
- **Purpose**: Verify pagination with max-keys
- **Setup**: Upload 10 objects
- **Action**: `GET /bucket?list-type=2&max-keys=3`
- **Assert**:
  - Response contains exactly 3 objects
  - IsTruncated = true
  - NextContinuationToken present

**Test: `test_list_objects_v2_continuation`**
- **Purpose**: Verify pagination continuation
- **Setup**: Upload 10 objects, get first page with max-keys=3
- **Action**: Request next page using continuation token
- **Assert**:
  - Second page contains next 3 objects
  - No overlap with first page
  - Continuation works through entire listing

#### 1.4 Conditional Operations
**Test: `test_conditional_get_if_match`**
- **Purpose**: Verify If-Match conditional GET
- **Setup**: Upload object, record ETag
- **Action**: `GET /bucket/object` with `If-Match: "{etag}"`
- **Assert**: HTTP 200 OK with object content

**Test: `test_conditional_get_if_match_fail`**
- **Purpose**: Verify If-Match failure
- **Setup**: Upload object
- **Action**: `GET /bucket/object` with `If-Match: "wrong-etag"`
- **Assert**: HTTP 412 PreconditionFailed

**Test: `test_conditional_get_if_none_match`**
- **Purpose**: Verify If-None-Match conditional GET
- **Setup**: Upload object, record ETag
- **Action**: `GET /bucket/object` with `If-None-Match: "{etag}"`
- **Assert**: HTTP 304 Not Modified

**Test: `test_conditional_get_if_modified_since`**
- **Purpose**: Verify If-Modified-Since conditional GET
- **Setup**: Upload object, record Last-Modified
- **Action**: GET with `If-Modified-Since: {timestamp in past}`
- **Assert**: HTTP 200 OK with object content

**Test: `test_conditional_get_if_unmodified_since`**
- **Purpose**: Verify If-Unmodified-Since conditional GET
- **Setup**: Upload object, wait 1 second, modify object
- **Action**: GET with `If-Unmodified-Since: {timestamp between uploads}`
- **Assert**: HTTP 412 PreconditionFailed

### 2. Multipart Upload Tests

#### 2.1 Multipart Upload Lifecycle
**Test: `test_multipart_upload_initiate`**
- **Purpose**: Verify multipart upload initiation
- **Setup**: Create bucket
- **Action**: `POST /bucket/large-file?uploads`
- **Assert**:
  - HTTP 200 OK
  - Response contains UploadId
  - Upload appears in ListMultipartUploads

**Test: `test_multipart_upload_part`**
- **Purpose**: Verify part upload
- **Setup**: Initiate multipart upload
- **Action**: `PUT /bucket/large-file?partNumber=1&uploadId=X` with 5MB data
- **Assert**:
  - HTTP 200 OK
  - Response contains ETag
  - Part appears in ListParts

**Test: `test_multipart_upload_complete`**
- **Purpose**: Verify multipart upload completion
- **Setup**: Upload 3 parts (5MB + 5MB + 1MB)
- **Action**: `POST /bucket/large-file?uploadId=X` with parts list
- **Assert**:
  - HTTP 200 OK
  - Complete object retrievable via GET
  - Object size equals sum of part sizes
  - ETag is composite (has hyphen)

**Test: `test_multipart_upload_abort`**
- **Purpose**: Verify multipart upload abortion
- **Setup**: Initiate upload and upload 2 parts
- **Action**: `DELETE /bucket/large-file?uploadId=X`
- **Assert**:
  - HTTP 204 No Content
  - Upload no longer appears in ListMultipartUploads
  - Uploaded parts cleaned up

#### 2.2 Multipart Upload Validation
**Test: `test_multipart_part_too_small`**
- **Purpose**: Verify minimum part size enforcement (except last part)
- **Setup**: Initiate multipart upload
- **Action**: Upload part with 1MB data (below 5MB minimum)
- **Assert**: HTTP 400 EntityTooSmall

**Test: `test_multipart_part_number_invalid`**
- **Purpose**: Verify part number validation
- **Setup**: Initiate multipart upload
- **Test Cases**:
  - Part number 0: `PUT ...?partNumber=0`
  - Part number 10001: `PUT ...?partNumber=10001`
- **Assert**: HTTP 400 InvalidRequest for both

**Test: `test_multipart_complete_wrong_etag`**
- **Purpose**: Verify ETag validation during completion
- **Setup**: Upload parts, record ETags
- **Action**: Complete with incorrect ETag for one part
- **Assert**: HTTP 400 InvalidPart

**Test: `test_multipart_complete_missing_part`**
- **Purpose**: Verify all parts present during completion
- **Setup**: Upload parts 1 and 3, skip part 2
- **Action**: Complete upload with parts 1, 2, 3 in completion request
- **Assert**: HTTP 400 InvalidPart

**Test: `test_multipart_complete_out_of_order`**
- **Purpose**: Verify part order validation
- **Setup**: Upload parts 1, 2, 3
- **Action**: Complete with parts listed as 1, 3, 2
- **Assert**: HTTP 400 InvalidPartOrder

#### 2.3 Multipart Upload Limits
**Test: `test_multipart_max_parts`**
- **Purpose**: Verify maximum part count enforcement
- **Setup**: Initiate upload, upload 10000 parts successfully
- **Action**: Attempt to upload part 10001
- **Assert**: HTTP 400 TooManyParts

**Test: `test_multipart_large_object`**
- **Purpose**: Verify large object assembly (> 5GB)
- **Setup**: Upload 1000 parts of 10MB each
- **Action**: Complete multipart upload
- **Assert**:
  - Upload completes successfully
  - Final object is 10GB
  - Object downloadable in chunks

### 3. Versioning Tests

#### 3.1 Versioning State Management
**Test: `test_versioning_enable`**
- **Purpose**: Verify versioning enablement
- **Setup**: Create bucket with versioning disabled
- **Action**: `PUT /bucket?versioning` with Status=Enabled
- **Assert**:
  - HTTP 200 OK
  - GET versioning returns Status=Enabled
  - Subsequent uploads create versions

**Test: `test_versioning_suspend`**
- **Purpose**: Verify versioning suspension
- **Setup**: Enable versioning on bucket
- **Action**: `PUT /bucket?versioning` with Status=Suspended
- **Assert**:
  - HTTP 200 OK
  - GET versioning returns Status=Suspended
  - New uploads create null version

#### 3.2 Version Creation and Retrieval
**Test: `test_versioning_multiple_versions`**
- **Purpose**: Verify multiple version creation
- **Setup**: Enable versioning on bucket
- **Action**: 
  1. Upload object "test.txt" v1
  2. Upload object "test.txt" v2
  3. Upload object "test.txt" v3
- **Assert**:
  - Each upload returns unique version ID
  - GET without version ID returns v3 (latest)
  - ListObjectVersions shows all 3 versions

**Test: `test_versioning_get_specific_version`**
- **Purpose**: Verify specific version retrieval
- **Setup**: Upload 3 versions of same object
- **Action**: `GET /bucket/object?versionId={v2_id}`
- **Assert**:
  - Returns v2 content specifically
  - Response includes x-amz-version-id header

#### 3.3 Delete Markers
**Test: `test_versioning_delete_marker_creation`**
- **Purpose**: Verify delete marker creation
- **Setup**: Versioned bucket with object versions
- **Action**: `DELETE /bucket/object` (without version ID)
- **Assert**:
  - HTTP 204 No Content
  - Response includes x-amz-delete-marker and x-amz-version-id
  - GET object returns 404 NoSuchKey
  - ListObjectVersions shows delete marker as latest

**Test: `test_versioning_delete_specific_version`**
- **Purpose**: Verify permanent version deletion
- **Setup**: Versioned bucket with multiple versions
- **Action**: `DELETE /bucket/object?versionId={specific_version}`
- **Assert**:
  - HTTP 204 No Content
  - Specific version permanently removed
  - Other versions remain accessible

**Test: `test_versioning_delete_marker_removal`**
- **Purpose**: Verify delete marker deletion
- **Setup**: Create delete marker
- **Action**: `DELETE /bucket/object?versionId={delete_marker_id}`
- **Assert**:
  - Delete marker removed
  - Object becomes accessible again if other versions exist

### 4. Server-Side Encryption Tests

#### 4.1 SSE-S3 Encryption
**Test: `test_sse_s3_basic`**
- **Purpose**: Verify SSE-S3 encryption
- **Setup**: Create bucket
- **Action**: PUT object with header `x-amz-server-side-encryption: AES256`
- **Assert**:
  - Object uploaded successfully
  - Response includes encryption headers
  - Object content encrypted on disk

**Test: `test_sse_s3_default_encryption`**
- **Purpose**: Verify bucket default encryption
- **Setup**: Set bucket default encryption to SSE-S3
- **Action**: PUT object without encryption headers
- **Assert**:
  - Object automatically encrypted
  - GET response includes encryption headers

#### 4.2 SSE-KMS Encryption
**Test: `test_sse_kms_basic`**
- **Purpose**: Verify SSE-KMS encryption
- **Setup**: Create KMS key, create bucket
- **Action**: PUT object with headers:
  ```
  x-amz-server-side-encryption: aws:kms
  x-amz-server-side-encryption-aws-kms-key-id: {key-id}
  ```
- **Assert**:
  - Object uploaded successfully
  - GET returns KMS encryption headers
  - Correct key ID in response

#### 4.3 SSE-C Encryption
**Test: `test_sse_c_basic`**
- **Purpose**: Verify customer-provided key encryption
- **Setup**: Generate 32-byte AES key
- **Action**: PUT object with headers:
  ```
  x-amz-server-side-encryption-customer-algorithm: AES256
  x-amz-server-side-encryption-customer-key: {base64-key}
  x-amz-server-side-encryption-customer-key-MD5: {md5-hash}
  ```
- **Assert**: Object uploaded with customer key encryption

**Test: `test_sse_c_get_requires_key`**
- **Purpose**: Verify SSE-C requires key for retrieval
- **Setup**: Upload object with SSE-C
- **Action**: GET object without providing customer key
- **Assert**: HTTP 400 InvalidRequest

**Test: `test_sse_c_get_wrong_key`**
- **Purpose**: Verify SSE-C rejects wrong key
- **Setup**: Upload object with SSE-C using key A
- **Action**: GET object providing different key B
- **Assert**: HTTP 403 AccessDenied

### 5. Bucket Policy and ACL Tests

#### 5.1 Bucket Policy Evaluation
**Test: `test_bucket_policy_public_read`**
- **Purpose**: Verify public read bucket policy
- **Setup**: Create bucket, set policy allowing anonymous GetObject
- **Action**: GET object without authentication
- **Assert**: Object accessible to anonymous user

**Test: `test_bucket_policy_deny_override`**
- **Purpose**: Verify explicit Deny overrides Allow
- **Setup**: Set bucket policy with conflicting Allow and Deny statements
- **Action**: Attempt access that matches Deny rule
- **Assert**: Access denied despite Allow rule

**Test: `test_bucket_policy_condition_ip`**
- **Purpose**: Verify IP address conditions
- **Setup**: Set policy allowing access only from specific IP range
- **Action**: Access from allowed and disallowed IPs
- **Assert**: 
  - Allowed IP: access granted
  - Disallowed IP: access denied

#### 5.2 Access Control Lists (ACLs)
**Test: `test_bucket_acl_canned`**
- **Purpose**: Verify canned ACL application
- **Action**: `PUT /bucket?acl` with canned ACL "public-read"
- **Assert**:
  - Bucket accessible to anonymous read
  - List and write operations still restricted

**Test: `test_object_acl_override`**
- **Purpose**: Verify object ACL overrides bucket ACL
- **Setup**: Private bucket with one public object
- **Action**: Anonymous GET on public object
- **Assert**: Object accessible despite private bucket

### 6. Lifecycle Management Tests

#### 6.1 Lifecycle Rule Evaluation
**Test: `test_lifecycle_expiration`**
- **Purpose**: Verify object expiration rules
- **Setup**: 
  - Create bucket with lifecycle rule: expire objects after 1 day
  - Upload object with timestamp 2 days ago (simulate aging)
- **Action**: Run lifecycle evaluation
- **Assert**: Object deleted by lifecycle engine

**Test: `test_lifecycle_transition`**
- **Purpose**: Verify storage class transitions
- **Setup**: 
  - Create lifecycle rule: transition to IA after 30 days
  - Upload object with timestamp 31 days ago
- **Action**: Run lifecycle evaluation  
- **Assert**: Object storage class changed to IA

**Test: `test_lifecycle_prefix_filter`**
- **Purpose**: Verify prefix-based lifecycle rules
- **Setup**: 
  - Rule: expire objects with prefix "logs/" after 1 day
  - Upload "logs/file1" and "data/file2" 2 days ago
- **Action**: Run lifecycle evaluation
- **Assert**: Only "logs/file1" deleted, "data/file2" unchanged

**Test: `test_lifecycle_tag_filter`**
- **Purpose**: Verify tag-based lifecycle rules
- **Setup**: 
  - Rule: expire objects with tag "environment=temp" after 1 day
  - Upload objects with and without tag 2 days ago
- **Action**: Run lifecycle evaluation
- **Assert**: Only tagged objects deleted

#### 6.2 Multipart Upload Cleanup
**Test: `test_lifecycle_abort_incomplete_multipart`**
- **Purpose**: Verify incomplete multipart upload cleanup
- **Setup**: 
  - Rule: abort incomplete uploads after 1 day
  - Create multipart upload 2 days ago, don't complete
- **Action**: Run lifecycle evaluation
- **Assert**: Incomplete upload removed

### 7. Data Durability Tests

#### 7.1 Erasure Coding Validation
**Test: `test_erasure_coding_basic`**
- **Purpose**: Verify basic erasure coding functionality
- **Setup**: Configure EC:4+2 (4 data, 2 parity shards)
- **Action**: Upload 10MB object
- **Assert**:
  - Object split into 6 shards
  - Each shard approximately 1.67MB
  - Object fully retrievable
  - Metadata records EC configuration

**Test: `test_erasure_coding_single_drive_failure`**
- **Purpose**: Verify resilience to single drive failure
- **Setup**: Upload object with EC:4+2, simulate 1 drive failure
- **Action**: Retrieve object with 1 shard unavailable
- **Assert**:
  - Object retrieval succeeds
  - Data integrity preserved
  - Performance degradation acceptable

**Test: `test_erasure_coding_double_drive_failure`**
- **Purpose**: Verify resilience to double drive failure
- **Setup**: Upload object with EC:4+2, simulate 2 drive failures
- **Action**: Retrieve object with 2 shards unavailable
- **Assert**:
  - Object retrieval succeeds (4 data shards available)
  - Data integrity preserved

**Test: `test_erasure_coding_too_many_failures`**
- **Purpose**: Verify graceful failure when too many drives fail
- **Setup**: Upload object with EC:4+2, simulate 3 drive failures
- **Action**: Attempt to retrieve object with only 3 shards available
- **Assert**: 
  - Object retrieval fails with clear error
  - System reports insufficient replicas

#### 7.2 Bitrot Detection
**Test: `test_bitrot_detection_on_read`**
- **Purpose**: Verify bitrot detection during reads
- **Setup**: Upload object, corrupt one shard on disk
- **Action**: Retrieve object
- **Assert**:
  - System detects corruption via checksum mismatch
  - Object reconstruction attempted from other shards
  - Read succeeds if sufficient healthy shards

**Test: `test_bitrot_healing`**
- **Purpose**: Verify automatic healing of corrupted data
- **Setup**: Upload object, corrupt one shard, configure auto-healing
- **Action**: Wait for healing process to run
- **Assert**:
  - Corrupted shard reconstructed from healthy shards
  - New checksum calculated and stored
  - All subsequent reads fast (no reconstruction needed)

#### 7.3 Replication Validation
**Test: `test_cross_region_replication`**
- **Purpose**: Verify cross-region replication functionality
- **Setup**: Configure replication between regions
- **Action**: Upload object in source region
- **Assert**:
  - Object appears in destination region within SLA
  - Content and metadata identical
  - Replication status marked as COMPLETED

**Test: `test_replication_delete_marker`**
- **Purpose**: Verify delete marker replication
- **Setup**: Enable delete marker replication
- **Action**: Delete object in source region (creating delete marker)
- **Assert**: 
  - Delete marker replicated to destination
  - Object inaccessible in both regions

### 8. Event Notification Tests

#### 8.1 Event Generation
**Test: `test_event_object_created_put`**
- **Purpose**: Verify ObjectCreated:Put events
- **Setup**: Configure webhook notification for s3:ObjectCreated:Put
- **Action**: Upload object via PUT
- **Assert**:
  - Event notification sent to configured endpoint
  - Event payload contains correct metadata
  - Event type is s3:ObjectCreated:Put

**Test: `test_event_object_removed_delete`**
- **Purpose**: Verify ObjectRemoved:Delete events
- **Setup**: Configure notification for s3:ObjectRemoved:Delete
- **Action**: Delete object
- **Assert**:
  - Event notification sent
  - Event type is s3:ObjectRemoved:Delete
  - Event includes version ID if versioning enabled

**Test: `test_event_multipart_complete`**
- **Purpose**: Verify multipart completion events
- **Setup**: Configure notification for s3:ObjectCreated:CompleteMultipartUpload
- **Action**: Complete multipart upload
- **Assert**:
  - Event type is s3:ObjectCreated:CompleteMultipartUpload
  - Event payload includes final object size

#### 8.2 Event Filtering
**Test: `test_event_prefix_filter`**
- **Purpose**: Verify prefix-based event filtering
- **Setup**: Configure notifications for prefix "logs/" only
- **Action**: Upload "logs/file1" and "data/file2"
- **Assert**: Only event for "logs/file1" sent

**Test: `test_event_suffix_filter`**
- **Purpose**: Verify suffix-based event filtering
- **Setup**: Configure notifications for suffix ".jpg" only
- **Action**: Upload "photo.jpg" and "document.pdf"
- **Assert**: Only event for "photo.jpg" sent

### 9. Presigned URL Tests

#### 9.1 Presigned URL Generation and Usage
**Test: `test_presigned_url_get`**
- **Purpose**: Verify presigned URL for GET operations
- **Setup**: Upload object, generate presigned GET URL (1 hour expiry)
- **Action**: Use presigned URL to download object without credentials
- **Assert**:
  - Object downloaded successfully
  - No authentication headers required
  - URL works before expiry, fails after expiry

**Test: `test_presigned_url_put`**
- **Purpose**: Verify presigned URL for PUT operations
- **Setup**: Generate presigned PUT URL for non-existent object
- **Action**: Upload object using presigned URL
- **Assert**:
  - Object uploaded successfully
  - Object accessible via normal GET
  - PUT works only for specified key

**Test: `test_presigned_url_expiry`**
- **Purpose**: Verify URL expiration enforcement
- **Setup**: Generate presigned URL with 1-second expiry
- **Action**: Wait 2 seconds, attempt to use URL
- **Assert**: HTTP 403 AccessDenied due to expired signature

**Test: `test_presigned_url_conditions`**
- **Purpose**: Verify presigned POST with conditions
- **Setup**: Generate presigned POST with content-type restriction
- **Action**: Attempt upload with wrong content-type
- **Assert**: Upload rejected due to policy violation

### 10. Performance and Concurrency Tests

#### 10.1 Concurrent Operations
**Test: `test_concurrent_uploads_same_key`**
- **Purpose**: Verify handling of concurrent uploads to same key
- **Setup**: Start 10 concurrent PUTs to same object key
- **Action**: Wait for all uploads to complete
- **Assert**:
  - All uploads complete without error
  - Final object represents one of the uploads (last write wins)
  - No corruption or partial writes

**Test: `test_concurrent_multipart_upload`**
- **Purpose**: Verify concurrent part uploads
- **Setup**: Initiate multipart upload
- **Action**: Upload 10 parts concurrently
- **Assert**:
  - All parts upload successfully
  - Parts can be completed in any order
  - Final object assembled correctly

#### 10.2 High Load Scenarios
**Test: `test_many_small_objects`**
- **Purpose**: Verify handling of many small objects
- **Action**: Upload 10,000 objects of 1KB each
- **Assert**:
  - All uploads succeed
  - Metadata storage scales appropriately
  - List operations perform adequately

**Test: `test_large_object_streaming`**
- **Purpose**: Verify large object upload without memory issues
- **Action**: Upload 1GB object via multipart
- **Assert**:
  - Upload completes successfully
  - Memory usage remains bounded during upload
  - Download streaming works correctly

## Test Execution Framework

### Test Environment Requirements
- **Isolation**: Each test runs against clean storage state
- **Cleanup**: All created resources cleaned up after test
- **Deterministic**: Tests produce same results on repeated runs
- **Parallel Safe**: Tests can run concurrently without interference

### Test Data Management
- **Predictable Data**: Use fixed seeds for random data generation
- **Size Variants**: Test with various object sizes (0B, 1KB, 1MB, 100MB, 1GB+)
- **Character Sets**: Test with ASCII, Unicode, binary data
- **Edge Cases**: Empty objects, maximum size objects

### Error Injection Framework
```python
class ErrorInjector:
    def inject_disk_failure(self, disk_id: str):
        """Simulate disk failure for testing resilience"""
    
    def inject_network_partition(self, node1: str, node2: str):
        """Simulate network partition between nodes"""
    
    def inject_corruption(self, shard_path: str, corruption_type: str):
        """Inject data corruption for bitrot testing"""
    
    def inject_slow_disk(self, disk_id: str, latency_ms: int):
        """Simulate slow disk responses"""
```

### S3 API Compatibility Validation
- **s3-tests Integration**: Run Ceph's s3-tests suite (400+ tests) for comprehensive S3 compatibility
- **AWS SDK Compatibility**: Test with official AWS SDKs in multiple languages
- **Real-world Application Testing**: Test with applications like MinIO Client, aws-cli, s3cmd

### Test Result Validation
- **100% Pass Rate**: All applicable tests must pass
- **Performance Benchmarks**: Basic performance targets met
- **Memory Leak Detection**: No memory leaks detected over 1-hour test run
- **Data Integrity**: All data integrity tests pass (checksum validation, reconstruction)
- **Consistency**: All consistency tests pass (read-after-write, list-after-write)

## Success Criteria
An object storage implementation passes unit tests if:
1. **100% S3 API compliance** on all implemented features
2. **Zero data loss** in all durability tests
3. **Correct behavior** under all failure scenarios
4. **Clean resource management** with no leaks
5. **Performance** meets minimum thresholds for deployment size
6. **Security** correctly enforces all access control mechanisms