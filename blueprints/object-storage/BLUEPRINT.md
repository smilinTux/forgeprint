# Object Storage Blueprint (S3-Compatible)

## Overview & Purpose

An S3-compatible object storage system is a distributed storage service that organizes data as objects within buckets, accessible via a RESTful HTTP API compatible with the Amazon S3 protocol. It provides virtually unlimited scalable storage with strong durability guarantees through erasure coding or replication, supporting workloads from single-node development to petabyte-scale multi-datacenter deployments.

### Core Responsibilities
- **Object CRUD**: Store, retrieve, delete, and list objects via S3-compatible REST API
- **Bucket Management**: Create, configure, and manage isolated storage namespaces
- **Data Durability**: Protect data through erasure coding (Reed-Solomon) or N-way replication
- **Access Control**: Enforce fine-grained access via IAM policies, bucket policies, ACLs, and presigned URLs
- **Encryption**: Encrypt data at rest (SSE-S3, SSE-KMS, SSE-C) and in transit (TLS/mTLS)
- **Lifecycle Management**: Automate data transitions between storage classes and expiration
- **Versioning**: Maintain full object version history with delete markers
- **Replication**: Synchronize data across regions for disaster recovery and low-latency access
- **Event Notifications**: Emit events on object mutations to downstream consumers
- **Multipart Upload**: Support parallel upload of large objects in discrete parts

## Core Concepts

### 1. Buckets
**Definition**: Top-level containers that hold objects. Each bucket has a globally unique name within the system, its own access policies, and configurable properties.

```
Bucket {
    name: Globally unique string (3-63 chars, DNS-compatible)
    region: Datacenter/region identifier
    creation_date: ISO 8601 timestamp
    owner: Account ID of the bucket creator
    versioning: Disabled | Enabled | Suspended
    encryption_config: Default encryption settings
    lifecycle_rules: List of lifecycle policies
    cors_config: Cross-Origin Resource Sharing rules
    notification_config: Event notification targets
    replication_config: Cross-region replication rules
    acl: Access control list
    policy: Bucket policy (JSON)
    object_lock_config: WORM retention settings
    tags: Key-value metadata (up to 50 tags)
    logging_config: Access log destination
    website_config: Static website hosting settings
    quota: Maximum storage bytes (optional)
}
```

**Constraints**:
- Bucket names must be DNS-compatible (lowercase, alphanumeric, hyphens, periods)
- Bucket names must be globally unique within the deployment
- Maximum 1,000 buckets per account (configurable)
- Buckets cannot be renamed after creation
- Buckets must be empty before deletion

### 2. Objects
**Definition**: The fundamental data entity stored in a bucket. Each object consists of data (up to 5TB), metadata, and a unique key within its bucket.

```
Object {
    key: UTF-8 string (up to 1024 bytes)
    data: Binary blob (0 bytes to 5 TB)
    size: Content-Length in bytes
    etag: MD5 hash or multipart composite hash
    content_type: MIME type
    content_encoding: Compression encoding
    content_disposition: Download behavior hint
    content_language: Language tag
    cache_control: Caching directives
    last_modified: ISO 8601 timestamp
    version_id: Version identifier (when versioning enabled)
    delete_marker: Boolean (versioning)
    storage_class: STANDARD | IA | GLACIER | DEEP_ARCHIVE
    server_side_encryption: Encryption algorithm and key info
    user_metadata: Map<String, String> (x-amz-meta-*, up to 2KB total)
    tags: Key-value pairs (up to 10 tags, 128+256 byte key+value)
    acl: Object-level access control list
    legal_hold: Boolean
    retention: { mode: GOVERNANCE | COMPLIANCE, retain_until: timestamp }
    replication_status: PENDING | COMPLETED | FAILED | REPLICA
    checksum: CRC32C | SHA1 | SHA256 (additional integrity)
}
```

**Key Naming**:
- Keys are flat strings; "/" prefix convention creates a virtual directory hierarchy
- Keys are stored and compared as UTF-8 byte sequences
- ListObjectsV2 uses prefix + delimiter for virtual directory listing

### 3. Multipart Uploads
**Definition**: A mechanism for uploading large objects in parts, enabling parallel uploads, resumable transfers, and efficient large-file handling.

```
MultipartUpload {
    upload_id: Unique identifier for this upload session
    bucket: Containing bucket name
    key: Target object key
    initiated: ISO 8601 timestamp
    initiator: Account that started the upload
    storage_class: Target storage class
    parts: List<UploadPart>
    server_side_encryption: Encryption config
    metadata: User metadata for the final object
}

UploadPart {
    part_number: 1-10000
    size: Part size in bytes (5MB minimum, except last part)
    etag: MD5 hash of the part data
    last_modified: ISO 8601 timestamp
    checksum: Optional additional checksum
}
```

**Constraints**:
- Part numbers: 1 to 10,000
- Minimum part size: 5 MB (except last part)
- Maximum part size: 5 GB
- Maximum object size via multipart: 5 TB
- Incomplete uploads consume storage and should be cleaned via lifecycle rules

### 4. Presigned URLs
**Definition**: Time-limited, pre-authenticated URLs that grant temporary access to specific S3 operations without requiring the requester to have credentials.

```
PresignedURL {
    method: GET | PUT | DELETE | HEAD
    bucket: Target bucket
    key: Target object key
    expiration: Duration (1 second to 7 days)
    signature: HMAC-SHA256 signature
    conditions: Optional upload constraints (for POST)
    headers: Required headers (content-type, content-length, etc.)
}
```

**Presigned POST**: Browser-based upload with server-enforced conditions:
```json
{
    "expiration": "2026-02-14T00:00:00Z",
    "conditions": [
        {"bucket": "my-bucket"},
        ["starts-with", "$key", "uploads/"],
        ["content-length-range", 0, 10485760],
        {"Content-Type": "image/png"}
    ]
}
```

### 5. Storage Classes
**Definition**: Tiers of storage with different durability, availability, retrieval latency, and cost characteristics.

| Storage Class | Availability | Min Duration | Retrieval | Use Case |
|--------------|-------------|-------------|-----------|----------|
| **STANDARD** | 99.99% | None | Immediate | Frequently accessed data |
| **INFREQUENT_ACCESS** | 99.9% | 30 days | Immediate | Infrequent but immediate access |
| **ONE_ZONE_IA** | 99.5% | 30 days | Immediate | Reproducible infrequent data |
| **GLACIER** | 99.99% | 90 days | Minutes-hours | Archival with occasional retrieval |
| **DEEP_ARCHIVE** | 99.99% | 180 days | 12-48 hours | Compliance archives, rarely accessed |

**Transition Rules**: STANDARD → IA → ONE_ZONE_IA → GLACIER → DEEP_ARCHIVE (one-way transitions only)

### 6. Versioning
**Definition**: Mechanism to keep multiple variants of an object in the same bucket, enabling recovery from accidental deletions and overwrites.

**States**:
- **Unversioned** (default): Only one version exists; overwrites replace; deletes remove permanently
- **Enabled**: Every PUT creates a new version; DELETE creates a delete marker; all versions retained
- **Suspended**: New PUTs create null version ID; existing versions preserved; DELETE creates null delete marker

**Version Operations**:
```
PUT object        → Creates new version with unique version_id
GET object        → Returns latest (non-delete-marker) version
GET ?versionId=X  → Returns specific version
DELETE object     → Creates delete marker (latest version)
DELETE ?versionId=X → Permanently deletes specific version
LIST ?versions    → Lists all versions and delete markers
```

**Delete Markers**: Lightweight placeholders that act as the "current version" after a delete on a versioned bucket. A GET on a key whose latest version is a delete marker returns 404.

### 7. Server-Side Encryption

#### SSE-S3 (S3-Managed Keys)
- System generates and manages a unique data encryption key (DEK) per object
- DEKs encrypted with a master key managed by the system
- Encryption: AES-256-GCM
- Transparent to the client (no key management required)

#### SSE-KMS (Key Management Service)
- Client specifies a KMS key ID; system uses KMS to generate/decrypt DEKs
- Supports key rotation; KMS audit trail for key usage
- Per-request context for additional authorization
- Encryption: AES-256-GCM with KMS-wrapped DEK

#### SSE-C (Customer-Provided Keys)
- Client provides encryption key with each PUT/GET request
- System uses client key for encryption/decryption, never stores the key
- Client must manage key storage and rotation
- Key provided as Base64-encoded AES-256 key + MD5 hash in request headers

**Encryption at Rest Architecture**:
```
Object Data → AES-256-GCM(DEK) → Encrypted Object Data → Stored on disk
DEK → Encrypt(Master Key or KMS Key) → Encrypted DEK → Stored in metadata
```

### 8. Lifecycle Management
**Definition**: Automated rules that transition objects between storage classes or expire them based on age, prefix, tags, or version status.

```yaml
lifecycle_rules:
  - id: "archive-old-logs"
    prefix: "logs/"
    status: Enabled
    transitions:
      - days: 30
        storage_class: INFREQUENT_ACCESS
      - days: 90
        storage_class: GLACIER
      - days: 365
        storage_class: DEEP_ARCHIVE
    expiration:
      days: 730
    noncurrent_version_transitions:
      - noncurrent_days: 30
        storage_class: GLACIER
    noncurrent_version_expiration:
      noncurrent_days: 90
    abort_incomplete_multipart_upload:
      days_after_initiation: 7
    filter:
      and:
        prefix: "logs/"
        tags:
          - key: "environment"
            value: "production"
```

**Evaluation**: Lifecycle rules evaluated daily (configurable). Objects matching filter conditions are transitioned or expired. Transitions are irreversible (cannot move back to a hotter storage class via lifecycle).

### 9. Bucket Policies & Access Control
**Definition**: JSON-based resource policies attached to buckets that define who can perform what actions on which resources.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowPublicRead",
            "Effect": "Allow",
            "Principal": "*",
            "Action": ["s3:GetObject"],
            "Resource": "arn:aws:s3:::my-bucket/public/*",
            "Condition": {
                "IpAddress": {
                    "aws:SourceIp": "203.0.113.0/24"
                }
            }
        },
        {
            "Sid": "DenyUnencryptedUploads",
            "Effect": "Deny",
            "Principal": "*",
            "Action": "s3:PutObject",
            "Resource": "arn:aws:s3:::my-bucket/*",
            "Condition": {
                "StringNotEquals": {
                    "s3:x-amz-server-side-encryption": "aws:kms"
                }
            }
        }
    ]
}
```

**Evaluation Order**: Explicit Deny → Explicit Allow → Implicit Deny. Bucket policies, IAM policies, ACLs, and Block Public Access settings all contribute to the final access decision.

### 10. Cross-Region Replication (CRR)
**Definition**: Automatic, asynchronous copying of objects from a source bucket to one or more destination buckets in different regions.

```yaml
replication_config:
  role: "arn:aws:iam::ACCOUNT:role/replication-role"
  rules:
    - id: "replicate-all"
      status: Enabled
      priority: 1
      filter:
        prefix: ""
      destination:
        bucket: "arn:aws:s3:::destination-bucket"
        storage_class: STANDARD
        encryption:
          replica_kms_key_id: "arn:aws:kms:us-west-2:ACCOUNT:key/KEY_ID"
        access_control_translation:
          owner: Destination
        metrics:
          status: Enabled
          event_threshold_minutes: 15
      delete_marker_replication:
        status: Enabled
      existing_object_replication:
        status: Enabled
```

**Replication Types**:
- **Same-Region Replication (SRR)**: Within the same region for compliance or aggregation
- **Cross-Region Replication (CRR)**: Across regions for disaster recovery and latency
- **Bi-directional Replication**: Two-way sync between regions with conflict resolution
- **Replication Time Control (RTC)**: SLA-backed replication within 15 minutes

### 11. Event Notifications
**Definition**: Push-based notifications emitted when objects are created, deleted, restored, or modified.

```yaml
notification_config:
  queue_configurations:
    - id: "new-objects"
      queue_arn: "arn:aws:sqs:us-east-1:ACCOUNT:new-objects-queue"
      events:
        - "s3:ObjectCreated:*"
      filter:
        key:
          filter_rules:
            - name: prefix
              value: "uploads/"
            - name: suffix
              value: ".jpg"
  
  topic_configurations:
    - id: "delete-notifications"
      topic_arn: "arn:aws:sns:us-east-1:ACCOUNT:delete-topic"
      events:
        - "s3:ObjectRemoved:*"
  
  webhook_configurations:
    - id: "webhook-all"
      url: "https://api.example.com/s3-events"
      events:
        - "s3:ObjectCreated:*"
        - "s3:ObjectRemoved:*"
      filter:
        key:
          filter_rules:
            - name: prefix
              value: "data/"
```

**Event Types**:
- `s3:ObjectCreated:Put` / `Post` / `Copy` / `CompleteMultipartUpload`
- `s3:ObjectRemoved:Delete` / `DeleteMarkerCreated`
- `s3:ObjectRestore:Post` / `Completed`
- `s3:Replication:OperationFailedReplication` / `OperationMissedThreshold`
- `s3:LifecycleTransition`
- `s3:LifecycleExpiration:*`

**Event Payload**:
```json
{
    "Records": [
        {
            "eventVersion": "2.1",
            "eventSource": "aws:s3",
            "eventTime": "2026-02-13T18:00:00.000Z",
            "eventName": "ObjectCreated:Put",
            "s3": {
                "bucket": {"name": "my-bucket", "arn": "arn:aws:s3:::my-bucket"},
                "object": {
                    "key": "uploads/photo.jpg",
                    "size": 1048576,
                    "eTag": "d41d8cd98f00b204e9800998ecf8427e",
                    "versionId": "096fKKXTRTtl3on89fVO.nfljtsv6qko",
                    "sequencer": "0055AED6DCD90281E5"
                }
            },
            "requestParameters": {"sourceIPAddress": "192.0.2.1"},
            "responseElements": {
                "x-amz-request-id": "C3D13FE58DE4C810",
                "x-amz-id-2": "FMyUVURIY8/IgAtTv8xRjskZQpcIZ9KG4V5Wp6S7S/JRWeUWerMUE5JgHvANOjpD"
            },
            "userIdentity": {"principalId": "AIDACKCEVSQ6C2EXAMPLE"}
        }
    ]
}
```

### 12. Object Lock (WORM)
**Definition**: Write Once Read Many protection that prevents objects from being deleted or overwritten for a fixed retention period.

**Modes**:
- **Governance Mode**: Most users cannot overwrite or delete; privileged users with `s3:BypassGovernanceRetention` can
- **Compliance Mode**: No user, including root, can overwrite or delete until retention expires
- **Legal Hold**: Independent toggle that prevents deletion regardless of retention period; can be applied/removed by any user with `s3:PutObjectLegalHold`

**Retention Configuration**:
```
ObjectLock {
    enabled: Boolean (set at bucket creation, cannot be disabled)
    default_retention: {
        mode: GOVERNANCE | COMPLIANCE
        days: Integer | years: Integer
    }
    per_object_retention: {
        mode: GOVERNANCE | COMPLIANCE
        retain_until_date: ISO 8601 timestamp
    }
    legal_hold: { status: ON | OFF }
}
```

### 13. S3 Select (Query-in-Place)
**Definition**: Server-side SQL query engine that filters and projects data within CSV, JSON, or Parquet objects before returning results, reducing data transfer.

```sql
SELECT s.name, s.age FROM s3object s WHERE s.age > 25 AND s.city = 'Seattle'
```

**Supported Formats**: CSV, JSON (document and lines), Apache Parquet
**Supported SQL**: SELECT, WHERE, LIMIT, aggregate functions (COUNT, SUM, AVG, MIN, MAX), CAST, COALESCE, NULLIF, string functions, date functions

### 14. Batch Operations
**Definition**: Perform bulk operations on large numbers of objects using manifests.

**Operations**:
- Copy objects between buckets
- Set/replace object tags
- Set/replace object ACLs
- Invoke serverless function per object
- Restore from Glacier
- Apply Object Lock retention

```
BatchJob {
    job_id: UUID
    manifest: { bucket, key, format: CSV | S3InventoryReport }
    operation: Copy | Tag | ACL | Lambda | Restore | Retention
    report: { bucket, prefix, format, scope: AllTasks | FailedTasksOnly }
    priority: Integer
    role_arn: IAM role for execution
    status: New | Preparing | Ready | Active | Pausing | Paused | Complete | Cancelling | Cancelled | Failing | Failed
}
```

## S3 API Specification

### Core Operations

| Operation | Method | Path | Description |
|-----------|--------|------|-------------|
| ListBuckets | GET | / | List all buckets owned by the authenticated sender |
| CreateBucket | PUT | /{bucket} | Create a new bucket |
| DeleteBucket | DELETE | /{bucket} | Delete an empty bucket |
| HeadBucket | HEAD | /{bucket} | Check bucket existence and access |
| GetBucketLocation | GET | /{bucket}?location | Get bucket region |
| PutObject | PUT | /{bucket}/{key} | Store an object |
| GetObject | GET | /{bucket}/{key} | Retrieve an object |
| HeadObject | HEAD | /{bucket}/{key} | Retrieve object metadata |
| DeleteObject | DELETE | /{bucket}/{key} | Delete an object |
| DeleteObjects | POST | /{bucket}?delete | Bulk delete up to 1000 objects |
| CopyObject | PUT | /{bucket}/{key} + x-amz-copy-source | Server-side copy |
| ListObjectsV2 | GET | /{bucket}?list-type=2 | List objects with pagination |
| ListObjectVersions | GET | /{bucket}?versions | List all object versions |

### Multipart Operations

| Operation | Method | Path | Description |
|-----------|--------|------|-------------|
| CreateMultipartUpload | POST | /{bucket}/{key}?uploads | Initiate multipart upload |
| UploadPart | PUT | /{bucket}/{key}?partNumber=N&uploadId=X | Upload a part |
| UploadPartCopy | PUT | /{bucket}/{key}?partNumber=N&uploadId=X + x-amz-copy-source | Copy part from existing object |
| CompleteMultipartUpload | POST | /{bucket}/{key}?uploadId=X | Complete multipart upload |
| AbortMultipartUpload | DELETE | /{bucket}/{key}?uploadId=X | Abort and cleanup |
| ListParts | GET | /{bucket}/{key}?uploadId=X | List uploaded parts |
| ListMultipartUploads | GET | /{bucket}?uploads | List in-progress uploads |

### Bucket Configuration Operations

| Operation | Method | Path | Description |
|-----------|--------|------|-------------|
| PutBucketVersioning | PUT | /{bucket}?versioning | Enable/suspend versioning |
| GetBucketVersioning | GET | /{bucket}?versioning | Get versioning state |
| PutBucketLifecycle | PUT | /{bucket}?lifecycle | Set lifecycle rules |
| GetBucketLifecycle | GET | /{bucket}?lifecycle | Get lifecycle rules |
| PutBucketPolicy | PUT | /{bucket}?policy | Set bucket policy |
| GetBucketPolicy | GET | /{bucket}?policy | Get bucket policy |
| PutBucketCors | PUT | /{bucket}?cors | Set CORS configuration |
| GetBucketCors | GET | /{bucket}?cors | Get CORS configuration |
| PutBucketNotification | PUT | /{bucket}?notification | Set event notifications |
| GetBucketNotification | GET | /{bucket}?notification | Get notification config |
| PutBucketReplication | PUT | /{bucket}?replication | Set replication rules |
| GetBucketReplication | GET | /{bucket}?replication | Get replication config |
| PutBucketEncryption | PUT | /{bucket}?encryption | Set default encryption |
| GetBucketEncryption | GET | /{bucket}?encryption | Get encryption config |
| PutBucketTagging | PUT | /{bucket}?tagging | Set bucket tags |
| GetBucketTagging | GET | /{bucket}?tagging | Get bucket tags |
| PutBucketLogging | PUT | /{bucket}?logging | Set access logging |
| GetBucketLogging | GET | /{bucket}?logging | Get logging config |
| PutBucketWebsite | PUT | /{bucket}?website | Set website hosting config |
| GetBucketWebsite | GET | /{bucket}?website | Get website config |
| PutObjectLockConfiguration | PUT | /{bucket}?object-lock | Set Object Lock config |
| GetObjectLockConfiguration | GET | /{bucket}?object-lock | Get Object Lock config |
| PutPublicAccessBlock | PUT | /{bucket}?publicAccessBlock | Block public access |
| GetPublicAccessBlock | GET | /{bucket}?publicAccessBlock | Get public access settings |

### Authentication

**AWS Signature Version 4**:
```
Authorization: AWS4-HMAC-SHA256
  Credential=AKIAIOSFODNN7EXAMPLE/20260213/us-east-1/s3/aws4_request,
  SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,
  Signature=fe5f80f77d5fa3beca038a248ff027d0445342fe2855ddc963176630326f1024
```

**Signing Steps**:
1. Create canonical request (method + URI + query + headers + signed headers + payload hash)
2. Create string to sign (algorithm + timestamp + scope + canonical request hash)
3. Derive signing key (HMAC-SHA256 chain: secret → date → region → service → aws4_request)
4. Calculate signature (HMAC-SHA256(signing key, string to sign))

**Chunked Upload Signing**: For streaming uploads, each chunk is individually signed with seed signature from initial headers.

### Error Responses
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>NoSuchBucket</Code>
    <Message>The specified bucket does not exist</Message>
    <Resource>/mybucket</Resource>
    <RequestId>4442587FB7D0A2F9</RequestId>
</Error>
```

**Common Error Codes**:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| AccessDenied | 403 | Access denied |
| BucketAlreadyExists | 409 | Bucket name taken |
| BucketNotEmpty | 409 | Cannot delete non-empty bucket |
| EntityTooLarge | 400 | Upload exceeds maximum size |
| InvalidArgument | 400 | Invalid request parameter |
| InvalidBucketName | 400 | Invalid bucket name |
| InvalidPart | 400 | Invalid multipart part |
| InvalidPartOrder | 400 | Parts not in ascending order |
| NoSuchBucket | 404 | Bucket does not exist |
| NoSuchKey | 404 | Object does not exist |
| NoSuchUpload | 404 | Multipart upload does not exist |
| NoSuchVersion | 404 | Version does not exist |
| PreconditionFailed | 412 | Conditional request failed |
| ServiceUnavailable | 503 | System temporarily unavailable |
| SlowDown | 503 | Rate limit exceeded |
| TooManyBuckets | 400 | Bucket limit exceeded |

## Data Flow Diagrams

### PutObject Flow
```
Client PUT Request
┌────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Client │───▶│  API Gateway │───▶│ Auth & Policy│───▶│  Metadata   │
└────────┘    └─────────────┘    │  Evaluator   │    │   Service   │
                                 └──────────────┘    └─────────────┘
                                                           │
                                                           ▼
                                                     ┌─────────────┐
                                                     │  Encryption │
                                                     │   Engine    │
                                                     └─────────────┘
                                                           │
                                                           ▼
                                                     ┌─────────────┐
                                                     │   Erasure   │
                                                     │   Coding    │
                                                     └─────────────┘
                                                           │
                                                     ┌─────┼─────┐
                                                     ▼     ▼     ▼
                                                  ┌────┐┌────┐┌────┐
                                                  │Disk││Disk││Disk│ (data + parity shards)
                                                  └────┘└────┘└────┘
                                                           │
                                                           ▼
                                                     ┌─────────────┐
                                                     │   Event     │
                                                     │ Notification│
                                                     └─────────────┘
```

### GetObject Flow
```
Client GET Request
┌────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Client │───▶│  API Gateway │───▶│ Auth & Policy│───▶│  Metadata   │
└────────┘    └─────────────┘    │  Evaluator   │    │  Lookup     │
                                 └──────────────┘    └─────────────┘
                                                           │
                                                           ▼
                                                     ┌─────────────┐
                                                     │  Data       │
                                                     │  Placement  │
                                                     │  Resolver   │
                                                     └─────────────┘
                                                           │
                                                     ┌─────┼─────┐
                                                     ▼     ▼     ▼
                                                  ┌────┐┌────┐┌────┐
                                                  │Disk││Disk││Disk│ (read data shards)
                                                  └────┘└────┘└────┘
                                                           │
                                                           ▼
                                                     ┌─────────────┐
                                                     │   Erasure   │
                                                     │  Decoding   │
                                                     └─────────────┘
                                                           │
                                                           ▼
                                                     ┌─────────────┐
                                                     │  Decryption │
                                                     └─────────────┘
                                                           │
                                                           ▼
                                                     ┌─────────────┐
                                                     │   Stream    │
                                                     │  to Client  │
                                                     └─────────────┘
```

### Multipart Upload Flow
```
Phase 1: Initiate
Client ──POST /{key}?uploads──▶ API ──▶ Metadata ──▶ Return upload_id

Phase 2: Upload Parts (parallel)
Client ──PUT part1──▶ API ──▶ EC Encode ──▶ Store shards ──▶ Return ETag
Client ──PUT part2──▶ API ──▶ EC Encode ──▶ Store shards ──▶ Return ETag
Client ──PUT partN──▶ API ──▶ EC Encode ──▶ Store shards ──▶ Return ETag

Phase 3: Complete
Client ──POST ?uploadId=X──▶ API ──▶ Validate parts ──▶ Assemble metadata
                                          │
                                          ▼
                                    Create final object entry
                                    Emit s3:ObjectCreated:CompleteMultipartUpload
```

## Architecture Patterns

### Distributed Architecture (Recommended)
```
┌──────────────────────────────────────────────────────────────┐
│                     API Gateway Layer                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │ S3 API   │  │ S3 API   │  │ S3 API   │  │ S3 API   │   │
│   │ Node 1   │  │ Node 2   │  │ Node 3   │  │ Node N   │   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└──────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────────────────────────────────────────┐
│                    Metadata Layer                              │
│   ┌──────────────────────────────────────────────────────┐   │
│   │  Distributed KV Store (etcd / RocksDB / PostgreSQL)  │   │
│   └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────────────────────────────────────────┐
│                     Storage Layer                              │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │ Storage  │  │ Storage  │  │ Storage  │  │ Storage  │   │
│   │ Node 1   │  │ Node 2   │  │ Node 3   │  │ Node N   │   │
│   │ ┌──────┐ │  │ ┌──────┐ │  │ ┌──────┐ │  │ ┌──────┐ │   │
│   │ │ Disk │ │  │ │ Disk │ │  │ │ Disk │ │  │ │ Disk │ │   │
│   │ │ Pool │ │  │ │ Pool │ │  │ │ Pool │ │  │ │ Pool │ │   │
│   │ └──────┘ │  │ └──────┘ │  │ └──────┘ │  │ └──────┘ │   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Single-Node Architecture (Development/Edge)
```
┌──────────────────────────────────────┐
│           Single Binary              │
│  ┌────────────┐  ┌───────────────┐   │
│  │  S3 API    │  │   Metadata    │   │
│  │  Handler   │  │  (RocksDB /   │   │
│  │            │  │   LevelDB)    │   │
│  └────────────┘  └───────────────┘   │
│  ┌────────────┐  ┌───────────────┐   │
│  │  Erasure   │  │   Lifecycle   │   │
│  │  Coding    │  │   Scheduler   │   │
│  └────────────┘  └───────────────┘   │
│  ┌──────────────────────────────┐    │
│  │        Local Disk Pool       │    │
│  │  /data/disk1  /data/disk2 ...│    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

## Configuration Model

### Hierarchical Structure
```yaml
object_storage:
  global:
    region: us-east-1
    domain: s3.example.com
    max_buckets_per_account: 1000
    max_object_size: 5TB
    default_storage_class: STANDARD
    api_request_max: 1000            # concurrent requests
    default_encryption: AES256
    
  storage:
    erasure_coding:
      data_shards: 4
      parity_shards: 2
      shard_size: 10MB               # stripe unit
    drives:
      - /data/disk1
      - /data/disk2
      - /data/disk3
      - /data/disk4
      - /data/disk5
      - /data/disk6
    healing:
      enabled: true
      interval: 30m
      bitrot_detection: true
      
  network:
    listen_address: "0.0.0.0"
    api_port: 9000
    console_port: 9001
    tls:
      enabled: true
      cert_file: /etc/certs/server.crt
      key_file: /etc/certs/server.key
      min_version: TLS1.2
      
  identity:
    admin_access_key: "minioadmin"
    admin_secret_key: "minioadmin"
    iam_backend: internal            # internal | ldap | openid
    sts_enabled: true
    
  replication:
    sites:
      - name: "us-west-2"
        endpoint: "https://s3-west.example.com"
        access_key: "repl-user"
        secret_key: "repl-secret"
    sync_mode: async                 # async | sync
    
  notifications:
    kafka:
      - brokers: ["kafka:9092"]
        topic: "s3-events"
    webhook:
      - endpoint: "https://api.example.com/webhook"
        auth_token: "secret"
    amqp:
      - url: "amqp://guest:guest@rabbitmq:5672"
        exchange: "s3-events"
        
  lifecycle:
    enabled: true
    evaluation_interval: 24h
    worker_count: 4
    
  metrics:
    prometheus:
      enabled: true
      path: /minio/v2/metrics/cluster
    audit_log:
      enabled: true
      target: /var/log/object-storage/audit.log
```

## Security Considerations

### 1. Data Protection
- **Encryption at rest**: All objects encrypted with AES-256-GCM by default
- **Encryption in transit**: TLS 1.2+ for all API traffic; mTLS for inter-node communication
- **Key management**: Integration with external KMS (Vault, AWS KMS, GCP KMS) for key hierarchy
- **Key rotation**: Automatic periodic rotation of master keys; re-encryption of DEKs without re-encrypting data
- **Secure deletion**: Overwrite and cryptographic erasure for deleted objects on supported media

### 2. Access Control
- **IAM**: User/group/role-based identity with policy attachment
- **Bucket policies**: Resource-based JSON policies with conditions
- **ACLs**: Legacy per-object access control (prefer policies)
- **Block Public Access**: Account-level and bucket-level public access prevention
- **STS**: Temporary credentials with scoped permissions via AssumeRole
- **Presigned URLs**: Time-limited access without credential sharing

### 3. Network Security
- **VPC/private endpoints**: Restrict access to private networks
- **IP allowlisting**: Condition keys in policies for source IP restrictions
- **Rate limiting**: Per-IP and per-account request rate limits
- **Request throttling**: 503 SlowDown when limits exceeded

### 4. Audit & Compliance
- **Server access logging**: Per-request access logs to a target bucket
- **Audit events**: Structured audit log for all API operations
- **Object Lock**: WORM compliance for SEC 17a-4, FINRA, HIPAA
- **Versioning**: Full audit trail of all object mutations
- **Inventory reports**: Scheduled CSV/Parquet inventory of all objects

## Performance Targets

### Throughput Targets (per storage node)
- **PUT (small, <1MB)**: 5,000 objects/second
- **PUT (large, 64MB)**: 2 GB/s aggregate throughput
- **GET (small, <1MB)**: 10,000 objects/second
- **GET (large, 64MB)**: 4 GB/s aggregate throughput
- **DELETE**: 10,000 objects/second
- **LIST (1000 objects)**: 500 requests/second

### Latency Targets
- **PUT P50**: < 10ms (small objects)
- **PUT P99**: < 100ms (small objects)
- **GET P50**: < 5ms (small objects, cached metadata)
- **GET P99**: < 50ms (small objects)
- **HEAD P50**: < 2ms
- **HEAD P99**: < 20ms
- **Time to First Byte (GET)**: < 50ms P99

### Scalability Targets
- **Objects per bucket**: Unlimited (billions)
- **Buckets per account**: 1,000 (configurable)
- **Object size**: 0 bytes to 5 TB
- **Concurrent multipart uploads**: 10,000 per bucket
- **Parts per multipart upload**: 10,000
- **Storage capacity**: Petabyte-scale across cluster

### Durability & Availability
- **Durability**: 99.999999999% (11 nines) with erasure coding across 4+ nodes
- **Availability**: 99.99% for STANDARD storage class
- **Data repair**: Automatic healing within 30 minutes of drive failure detection
- **Read availability during failures**: Continue serving reads with k of n data shards

## Extension Points

### 1. Storage Backend Plugins
```go
type StorageBackend interface {
    PutObject(ctx context.Context, bucket, key string, data io.Reader, size int64, opts PutOptions) (ObjectInfo, error)
    GetObject(ctx context.Context, bucket, key string, opts GetOptions) (io.ReadCloser, ObjectInfo, error)
    DeleteObject(ctx context.Context, bucket, key string, opts DeleteOptions) error
    ListObjects(ctx context.Context, bucket string, opts ListOptions) ([]ObjectInfo, error)
    StatObject(ctx context.Context, bucket, key string, opts StatOptions) (ObjectInfo, error)
}
```

### 2. Identity Provider Plugins
```go
type IdentityProvider interface {
    Authenticate(accessKey, secretKey string) (Identity, error)
    GetPolicies(identity Identity) ([]Policy, error)
    ValidateToken(token string) (Claims, error)
    AssumeRole(roleARN string, sessionPolicy *Policy, duration time.Duration) (Credentials, error)
}
```

### 3. Notification Target Plugins
```go
type NotificationTarget interface {
    ID() string
    Send(event Event) error
    Close() error
    IsActive() bool
}
```

### 4. Encryption Provider Plugins
```go
type EncryptionProvider interface {
    GenerateDataKey(ctx context.Context, keyID string) (plaintext, ciphertext []byte, err error)
    DecryptDataKey(ctx context.Context, keyID string, ciphertext []byte) (plaintext []byte, err error)
    RotateKey(ctx context.Context, keyID string) error
    ListKeys(ctx context.Context) ([]KeyInfo, error)
}
```

### 5. Lifecycle Action Plugins
```go
type LifecycleAction interface {
    Name() string
    Evaluate(object ObjectInfo, rule LifecycleRule) (bool, error)
    Execute(ctx context.Context, object ObjectInfo, rule LifecycleRule) error
}
```

## Implementation Data Structures

```go
// Core metadata for a stored object
type ObjectMetadata struct {
    Bucket          string
    Key             string
    VersionID       string
    IsLatest        bool
    DeleteMarker    bool
    Size            int64
    ETag            string
    ContentType     string
    ContentEncoding string
    UserMetadata    map[string]string
    Tags            map[string]string
    StorageClass    StorageClass
    Created         time.Time
    Modified        time.Time
    Encryption      EncryptionInfo
    Checksum        ChecksumInfo
    ReplicationStatus ReplicationStatus
    LegalHold       bool
    Retention       *RetentionInfo
    
    // Internal placement info
    ErasureInfo     ErasureInfo
    DataDir         string   // Directory containing erasure-coded shards
    Parts           []PartInfo // For multipart objects
}

// Erasure coding placement metadata
type ErasureInfo struct {
    Algorithm       string   // "reed-solomon"
    DataShards      int      // e.g., 4
    ParityShards    int      // e.g., 2
    BlockSize       int64    // Stripe unit size
    ShardSize       int64    // Size of each shard
    Distribution    []int    // Shard-to-drive mapping
    Checksums       [][]byte // Per-shard checksums for bitrot detection
}

// Bucket configuration
type BucketConfig struct {
    Name               string
    Region             string
    Owner              string
    Created            time.Time
    Versioning         VersioningState
    EncryptionConfig   *EncryptionConfig
    LifecycleRules     []LifecycleRule
    CORSConfig         *CORSConfig
    NotificationConfig *NotificationConfig
    ReplicationConfig  *ReplicationConfig
    PolicyJSON         []byte
    ACL                *AccessControlList
    ObjectLockConfig   *ObjectLockConfig
    Tags               map[string]string
    LoggingConfig      *LoggingConfig
    WebsiteConfig      *WebsiteConfig
    Quota              int64 // -1 for unlimited
    PublicAccessBlock  *PublicAccessBlockConfig
}
```

This blueprint provides the comprehensive foundation needed to implement a production-grade, S3-compatible object storage system with all essential features, security considerations, durability guarantees, and performance requirements clearly defined.
