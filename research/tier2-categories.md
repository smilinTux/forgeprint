# Forgeprint Tier 2 — Software Category Research

> Generated: 2026-02-13 | Status: Comprehensive draft (web search unavailable — star counts approximate as of late 2025)

---

## 1. Object Storage / Data Stores (S3-Compatible)

### Top 10 Open-Source

| # | Name | Language | Stars (≈) | Key Differentiator | License |
|---|------|----------|-----------|-------------------|---------|
| 1 | **MinIO** | Go | 48k | Fastest S3-compatible, single-binary | AGPL-3.0 |
| 2 | **Ceph (RADOS Gateway)** | C++ | 14k | Unified block/file/object, battle-tested at scale | LGPL-2.1 |
| 3 | **SeaweedFS** | Go | 23k | Simple architecture, fast small-file handling | Apache-2.0 |
| 4 | **Garage** | Rust | 4k | Lightweight, geo-distributed, self-hosting friendly | AGPL-3.0 |
| 5 | **LakeFS** | Go | 4.5k | Git-like branching for data lakes | Apache-2.0 |
| 6 | **OpenIO** | C/Python | 800 | Conscience-based placement, grid computing heritage | LGPL-3.0 |
| 7 | **Swift (OpenStack)** | Python | 2.6k | Proven at massive scale (Rackspace heritage) | Apache-2.0 |
| 8 | **Zenko CloudServer** | JS | 1.7k | Multi-cloud data management, S3 frontend | Apache-2.0 |
| 9 | **Apache Ozone** | Java | 1.8k | Hadoop-native object store, scales to billions of keys | Apache-2.0 |
| 10 | **JuiceFS** | Go | 11k | POSIX + S3 gateway, metadata in Redis/TiKV/PostgreSQL | Apache-2.0 |

### Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing Model |
|---|------|--------|---------------|
| 1 | **Amazon S3** | AWS | Pay-per-GB stored + requests + egress |
| 2 | **Google Cloud Storage** | Google | Per-GB + operations + egress, multi storage classes |
| 3 | **Azure Blob Storage** | Microsoft | Tiered per-GB + operations + egress |
| 4 | **Cloudflare R2** | Cloudflare | Per-GB stored, **zero egress fees** |
| 5 | **Backblaze B2** | Backblaze | $6/TB/mo stored, $0.01/10k requests, cheap egress |
| 6 | **Wasabi** | Wasabi | $6.99/TB/mo flat, no egress fees, 90-day minimum |
| 7 | **DigitalOcean Spaces** | DigitalOcean | $5/mo for 250GB + 1TB egress |
| 8 | **Linode Object Storage** | Akamai/Linode | $5/mo for 250GB |
| 9 | **IBM Cloud Object Storage** | IBM | Per-GB tiered, Smart Tier auto-tiering |
| 10 | **Oracle Cloud Object Storage** | Oracle | Per-GB stored, generous free tier (10GB) |

### Exhaustive Feature List (75 features)

**Core S3 API Operations**
1. CreateBucket / DeleteBucket
2. PutObject / GetObject / DeleteObject
3. HeadObject / HeadBucket
4. ListObjectsV2 (continuation tokens)
5. CopyObject (server-side copy)
6. Multipart upload (initiate, upload part, complete, abort)
7. Presigned URLs (GET/PUT with expiry)
8. Presigned POST (browser-based upload)
9. Byte-range fetches (partial object reads)
10. Conditional reads (If-Match, If-None-Match, If-Modified-Since)

**Bucket Configuration**
11. Bucket policies (JSON-based access control)
12. Bucket ACLs (canned + custom)
13. CORS configuration
14. Bucket website hosting (index/error documents)
15. Bucket logging (access logs to target bucket)
16. Bucket tagging
17. Bucket notifications (SNS, SQS, Lambda, webhook, Kafka, AMQP, NATS, MQTT, Redis)
18. Bucket transfer acceleration
19. Requester-pays buckets

**Versioning & Lifecycle**
20. Object versioning (enable/suspend per bucket)
21. Version listing / delete markers
22. MFA Delete (require MFA to delete versions)
23. Lifecycle rules (transition between storage classes)
24. Lifecycle expiration (auto-delete after N days)
25. Lifecycle abort incomplete multipart uploads
26. Noncurrent version expiration
27. Intelligent tiering / auto-tiering

**Storage Classes**
28. Standard (hot)
29. Infrequent Access
30. One Zone IA
31. Glacier / Archive
32. Deep Archive
33. Custom storage class definition

**Security & Encryption**
34. Server-side encryption with managed keys (SSE-S3)
35. Server-side encryption with KMS (SSE-KMS)
36. Server-side encryption with customer-provided keys (SSE-C)
37. Client-side encryption
38. Encryption at rest (AES-256 or customer-managed)
39. TLS/mTLS for in-transit encryption
40. Bucket encryption default policy
41. Key rotation for KMS-managed keys

**Access Control**
42. IAM policies (user/group/role-based)
43. Bucket policies (resource-based)
44. Access points (named network endpoints with policies)
45. VPC endpoint / private link access
46. Block public access settings
47. Object ACLs (legacy, per-object)
48. STS (Security Token Service) for temporary credentials
49. AssumeRole for cross-account access

**Replication & Durability**
50. Same-region replication (SRR)
51. Cross-region replication (CRR)
52. Bi-directional replication
53. Replication time control (SLA-based)
54. Erasure coding (Reed-Solomon, configurable data/parity shards)
55. Replication factor (configurable N-way copy)
56. Bitrot detection (background scrubbing / checksums)
57. Healing (automatic repair of degraded objects)

**Compliance & Retention**
58. Object Lock (WORM — Write Once Read Many)
59. Governance mode (removable by privileged users)
60. Compliance mode (immutable until retention expires)
61. Legal hold (indefinite retain, toggleable)
62. Retention period (per-object or default)

**Analytics & Operations**
63. Storage inventory (scheduled CSV/Parquet/ORC reports)
64. Storage analytics (access pattern analysis)
65. Storage metrics (CloudWatch / Prometheus integration)
66. S3 Select / Query-in-place (SQL over CSV/JSON/Parquet)
67. Batch operations (bulk copy, tag, invoke lambda)
68. Object metadata (system + user-defined x-amz-meta-*)
69. Object tagging (key-value, up to 10 tags per object)
70. Event notifications (object created/removed/restored)

**Advanced / Platform**
71. S3-compatible API gateway (proxy for multi-backend)
72. Quota management (per-bucket or per-user limits)
73. Multi-tenancy (namespace isolation)
74. Tiered caching (SSD cache tier in front of HDD/archive)
75. Deduplication (content-addressable storage)

### Architecture Patterns

**Erasure Coding vs Replication**
- **Replication (N-way copy):** Simple, fast reads, high storage overhead (3x for 3 replicas). Ceph default, SeaweedFS default.
- **Erasure coding (Reed-Solomon):** Lower storage overhead (e.g., 1.5x for EC 4+2), CPU-intensive encode/decode. MinIO default (EC:4), Ceph can enable per-pool.
- **Hybrid:** Hot data replicated for speed, cold data erasure-coded for density.

**Metadata Management**
- **Centralized DB:** LakeFS (PostgreSQL), SeaweedFS (separate master with LevelDB/etcd). Fast lookups, single bottleneck risk.
- **Distributed KV:** Ceph (RADOS), MinIO (per-disk metadata on XL format). Scales linearly.
- **LSM-tree / B-tree:** Apache Ozone uses RocksDB for container metadata.

**Consistent Hashing & Data Placement**
- **CRUSH algorithm (Ceph):** Pseudo-random deterministic placement, topology-aware (rack/DC/region).
- **Consistent hashing ring:** Swift uses modified ring with partition-to-device mapping.
- **Rendezvous hashing:** Garage uses for geo-aware placement across zones.
- **Volume-based:** SeaweedFS assigns objects to volumes; volumes placed on nodes.

### Memory Management

- **Buffer pools:** MinIO uses `sync.Pool` for upload/download buffers; configurable with `MINIO_API_REQUESTS_MAX`. Ceph OSD uses `bluestore_cache_size` (default 1GB per OSD).
- **Metadata caching:** Ceph MDS caches inodes; RGW caches bucket info in memcached/Redis. SeaweedFS master caches volume locations in memory.
- **Erasure coding overhead:** EC encode/decode requires holding data + parity shards in memory simultaneously. For a 10+4 EC scheme with 64MB shards, ~896MB per concurrent encode operation.
- **Multipart upload state:** Each in-progress multipart upload holds part metadata in memory/DB until completed or aborted. Systems should enforce `max_concurrent_multipart`.

### Testing Criteria

1. **S3 API conformance:** Run [s3-tests](https://github.com/ceph/s3-tests) (Ceph's comprehensive S3 test suite, 400+ tests). Also: AWS SDK integration tests, Mint test suite (MinIO).
2. **Data durability:** Write objects, kill nodes/disks, verify reads succeed. Inject bitrot, verify scrubbing detects and heals.
3. **Performance under load:** COSBench or warp (MinIO's benchmark) — measure throughput (MB/s), IOPS, latency at p50/p95/p99 across varying object sizes (4KB–1GB) and concurrency.
4. **Encryption verification:** Verify on-disk data is encrypted (raw disk read should be ciphertext). Verify TLS for all API calls. Test key rotation doesn't break existing objects.
5. **Multipart upload correctness:** Upload large object in parts, verify ETag matches. Abort mid-upload, verify cleanup. Resume after failure.
6. **Versioning & lifecycle:** Enable versioning, overwrite object, verify all versions retrievable. Set lifecycle rule, verify transition/expiration fires on schedule.
7. **Replication lag:** Measure time-to-consistency for cross-region replication under load. Verify eventual consistency guarantees.

---

## 2. Secret Management / Vault Systems

### Top 10 Open-Source

| # | Name | Language | Stars (≈) | Key Differentiator | License |
|---|------|----------|-----------|-------------------|---------|
| 1 | **HashiCorp Vault** | Go | 31k | Industry standard, pluggable everything | BSL-1.1 (was MPL-2.0) |
| 2 | **Infisical** | TypeScript | 16k | Developer-friendly, .env sync, beautiful UI | MIT |
| 3 | **Mozilla SOPS** | Go | 17k | Encrypt files in-place (YAML/JSON/ENV), git-friendly | MPL-2.0 |
| 4 | **age** | Go | 17k | Simple file encryption, modern replacement for PGP | BSD-3 |
| 5 | **CyberArk Conjur (OSS)** | Ruby | 800 | Enterprise PAM heritage, RBAC-first | LGPL-3.0 |
| 6 | **Bitwarden / Vaultwarden** | Rust (vw) | 40k/39k | Password manager with API, self-hosted | AGPL-3.0 / GPL-3.0 |
| 7 | **OpenBao** | Go | 3k | Community fork of Vault after BSL change | MPL-2.0 |
| 8 | **Teller** | Go | 2.3k | Universal secret manager CLI, multi-provider sync | Apache-2.0 |
| 9 | **Sealed Secrets** | Go | 7.5k | Kubernetes-native encrypted secrets in git | Apache-2.0 |
| 10 | **External Secrets Operator** | Go | 4.5k | Sync external vaults → K8s Secrets | Apache-2.0 |

### Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing Model |
|---|------|--------|---------------|
| 1 | **AWS Secrets Manager** | AWS | $0.40/secret/month + $0.05/10k API calls |
| 2 | **GCP Secret Manager** | Google | $0.06/version/month + $0.03/10k access ops |
| 3 | **Azure Key Vault** | Microsoft | Per-operation pricing (HSM or software keys) |
| 4 | **HashiCorp Vault Enterprise** | HashiCorp | Per-node annual subscription |
| 5 | **1Password Connect** | 1Password | Business plan ($7.99/user/mo) + Connect server |
| 6 | **Doppler** | Doppler | Free tier → $4/user/mo (Team) → Enterprise |
| 7 | **Akeyless** | Akeyless | SaaS per-secret pricing, zero-knowledge DFC |
| 8 | **Delinea (Thycotic)** | Delinea | Enterprise licensing, PAM-focused |
| 9 | **Thales CipherTrust** | Thales | Appliance + per-node licensing |
| 10 | **Fortanix DSM** | Fortanix | SaaS or on-prem, HSM-grade, per-key pricing |

### Exhaustive Feature List (78 features)

**Secret Storage & Types**
1. Static key-value secrets (v1 — no versioning)
2. Versioned key-value secrets (v2 — full version history)
3. Dynamic secrets (generate on-demand, auto-revoke)
4. Database credential generation (PostgreSQL, MySQL, MongoDB, MSSQL, Oracle, Cassandra, Elasticsearch, Redis, Snowflake)
5. Cloud credential generation (AWS IAM, GCP service accounts, Azure AD)
6. SSH key signing (CA-based SSH certificates)
7. SSH OTP (one-time passwords for SSH)
8. TOTP generation/validation
9. PKI / Certificate Authority (root + intermediate CAs, cert issuance)
10. Transit encryption (encrypt/decrypt as a service, no secret exposure)
11. Transit key types (AES-GCM, ChaCha20, RSA, ECDSA, ED25519)
12. Transit key versioning and rotation
13. Transit re-wrapping (re-encrypt with new key version without exposing plaintext)
14. KMIP server (interop with enterprise key management)
15. Transform (tokenization, FPE — format-preserving encryption)
16. Random bytes generation (cryptographic RNG endpoint)

**Lease & Lifecycle Management**
17. Secret leases (TTL-based automatic expiration)
18. Lease renewal
19. Lease revocation (manual + automatic)
20. Max TTL enforcement
21. Secret rotation (automated, scheduled)
22. Rotation windows and schedules
23. Force rotation on demand
24. Lazy rotation (rotate on next access)

**Authentication Methods**
25. Token auth (root, batch, service, periodic, orphan tokens)
26. Username/password (userpass)
27. LDAP / Active Directory
28. OIDC / JWT
29. SAML
30. Kubernetes auth (service account JWT validation)
31. AppRole (machine-to-machine, RoleID + SecretID)
32. AWS auth (IAM role, EC2 instance identity)
33. GCP auth (IAM, GCE)
34. Azure auth (MSI)
35. TLS certificate auth (mTLS)
36. GitHub auth (org/team membership)
37. RADIUS auth
38. Kerberos auth
39. Cloud Foundry auth
40. MFA (multi-factor, TOTP or Duo, enforceable per policy)

**Access Control & Policy**
41. ACL policies (HCL or JSON, path-based)
42. Sentinel policies (enterprise — code-based policy enforcement)
43. Policy templating (identity-based dynamic paths)
44. Namespaces (multi-tenancy, hierarchical isolation)
45. Identity groups (internal + external group mapping)
46. Entity aliases (map multiple auth identities to one entity)
47. Control groups (multi-person approval for sensitive operations)

**Audit & Compliance**
48. Audit logging (file, syslog, socket backends)
49. Audit log HMAC (hash sensitive fields for forensic comparison)
50. Audit log filtering
51. Request/response logging separation
52. Compliance frameworks (SOC2, PCI-DSS, HIPAA, FedRAMP)

**High Availability & Disaster Recovery**
53. Seal/unseal mechanism (Shamir's Secret Sharing — split master key into N shares, require M threshold)
54. Auto-unseal (AWS KMS, GCP CKMS, Azure Key Vault, Transit, HSM PKCS#11)
55. Raft integrated storage (built-in HA consensus)
56. Consul storage backend
57. External storage backends (PostgreSQL, MySQL, DynamoDB, S3, etcd, Zookeeper, CockroachDB, Spanner)
58. Performance replication (read replicas across regions)
59. Disaster recovery replication (warm standby)
60. Performance standby nodes (read-only forwarding)
61. Snapshots (Raft snapshot backup/restore)

**Secrets Injection & Integration**
62. Agent sidecar (Vault Agent — auto-auth, template rendering, caching)
63. CSI provider (Container Storage Interface — mount secrets as files in K8s)
64. Kubernetes sidecar injector (mutating webhook)
65. Env var injection (via CLI, agent, or operator)
66. File template rendering (Consul-template syntax)
67. Terraform provider
68. Ansible lookup plugin
69. CI/CD integration (GitHub Actions, GitLab CI, Jenkins, CircleCI)
70. SDK support (Go, Python, Java, Ruby, C#, Node.js)

**Developer Experience**
71. Web UI dashboard
72. CLI tool
73. HTTP REST API
74. Plugin system (custom auth/secret engines)
75. Secrets sync to external providers
76. .env file sync (Infisical, Doppler)
77. Git-based secret management (SOPS + age/GPG)
78. Secret referencing / aliasing (symbolic links between paths)

### Architecture Patterns

**Seal/Unseal Mechanism**
- Master encryption key encrypts all data at rest. Master key itself is encrypted by the unseal key.
- **Shamir's Secret Sharing:** Unseal key split into N shares (default 5), require threshold M (default 3). No single person can unseal alone.
- **Auto-unseal:** Delegate unseal key protection to external KMS (AWS KMS, GCP, Azure, Transit). Vault starts sealed, auto-unseals by calling KMS to decrypt the master key.

**Storage Backends**
- **Integrated Raft:** Recommended. Built-in consensus, no external dependencies. Leader election, log replication, snapshots.
- **Consul:** Legacy HA option. Consul handles leader election; Vault is stateless above it.
- **Database (PostgreSQL, MySQL):** Simple, but no built-in HA at Vault layer (use DB replication + single active Vault).

**Auth Methods Architecture**
- Each auth method is a plugin (built-in or external). Authenticates identity → returns Vault token with attached policies.
- **Identity system:** All auth methods map to a single canonical Entity with Aliases. Enables cross-method policy inheritance.

**Secret Engines Architecture**
- Each engine is a plugin mounted at a path. Engines are isolated — no cross-engine access.
- **Static engines (KV):** Simple CRUD on encrypted data.
- **Dynamic engines (database, cloud):** Generate ephemeral credentials on read, revoke on lease expiry. Require privileged root credential stored in engine config.

### Memory & Security

- **mlock:** Vault uses `mlock()` / `mlockall()` to prevent secrets from being swapped to disk. Must run with `IPC_LOCK` capability or as root.
- **Encrypted memory:** All secrets encrypted with the barrier key before writing to storage. In-memory, secrets exist as plaintext only during active request processing.
- **Key derivation:** Master key → derived keys per-backend using HKDF. Key rotation re-wraps existing data incrementally.
- **Zeroing:** Secret buffers zeroed after use (Go runtime limitations noted — GC may copy before zeroing).

### Testing Criteria

1. **Secret lifecycle:** Create → read → update → list versions → delete → undelete → destroy. Verify each state transition.
2. **Dynamic secret rotation:** Generate DB creds, verify they work, wait for TTL expiry, verify revoked. Force rotate, verify old creds invalid.
3. **Audit completeness:** Every API call must produce an audit log entry. Tamper with audit backend, verify Vault refuses to serve requests (audit required mode).
4. **HA failover:** Kill active node, verify standby promotes within SLA (<30s). Verify no secret loss. Verify clients automatically reconnect.
5. **Seal/unseal:** Verify sealed Vault refuses all operations. Test partial unseal (below threshold). Test auto-unseal recovery after KMS outage.
6. **Policy enforcement:** Verify deny-by-default. Test path-based policies with glob patterns. Verify namespace isolation.
7. **Transit correctness:** Encrypt with key v1, rotate to v2, verify decrypt still works. Re-wrap, verify re-wrapped ciphertext decrypts correctly. Verify minimum decryption version enforcement.

---

## 3. Workflow Orchestrators / Automation Engines

### Top 10 Open-Source

| # | Name | Language | Stars (≈) | Key Differentiator | License |
|---|------|----------|-----------|-------------------|---------|
| 1 | **Apache Airflow** | Python | 37k | Industry standard for data pipelines, massive ecosystem | Apache-2.0 |
| 2 | **n8n** | TypeScript | 50k | Visual builder + code, 400+ integrations, self-hosted | Sustainable Use (fair-code) |
| 3 | **Temporal** | Go | 12k | Durable execution, fault-tolerant by design, code-first | MIT |
| 4 | **Prefect** | Python | 17k | Pythonic, dynamic DAGs, hybrid execution model | Apache-2.0 |
| 5 | **Dagster** | Python | 12k | Software-defined assets, type system, observability | Apache-2.0 |
| 6 | **Argo Workflows** | Go | 15k | Kubernetes-native, container-per-step, GitOps-ready | Apache-2.0 |
| 7 | **Windmill** | Rust/TS | 10k | Scripts as workflows, polyglot (Python/TS/Go/Bash/SQL), fast | AGPL-3.0 |
| 8 | **Kestra** | Java | 12k | Declarative YAML, event-driven, language-agnostic | Apache-2.0 |
| 9 | **Conductor** | Java | 17k | Netflix-born, microservice orchestration | Apache-2.0 |
| 10 | **Camunda** (community) | Java | 4k | BPMN 2.0 standard, process modeling, decision tables | Apache-2.0 |

### Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing Model |
|---|------|--------|---------------|
| 1 | **Zapier** | Zapier | Free (100 tasks/mo) → $19.99/mo → Enterprise |
| 2 | **Make (Integromat)** | Make | Free (1k ops) → $9/mo → Enterprise |
| 3 | **AWS Step Functions** | AWS | $0.025/1k state transitions |
| 4 | **Azure Logic Apps** | Microsoft | Per-action pricing ($0.000125/action) |
| 5 | **Google Cloud Workflows** | Google | $0.01/1k steps |
| 6 | **Retool Workflows** | Retool | Included in Retool plans |
| 7 | **Tray.io** | Tray | Enterprise pricing, iPaaS focus |
| 8 | **Workato** | Workato | Enterprise, recipe-based pricing |
| 9 | **Power Automate** | Microsoft | $15/user/mo (per-user) or $0.60/flow-run (per-flow) |
| 10 | **Pipedream** | Pipedream | Free tier → $19/mo, code-first + visual |

### Exhaustive Feature List (86 features)

**Workflow Definition**
1. Visual drag-and-drop workflow builder
2. Code-first workflow definition (Python, TypeScript, Go, Java)
3. YAML/JSON declarative workflow definition
4. BPMN 2.0 standard support
5. DAG (Directed Acyclic Graph) execution model
6. State machine execution model
7. Event-driven workflows (trigger on event)
8. Sequential workflow chains
9. Workflow versioning (immutable versions)
10. Workflow templates / marketplace
11. Workflow import/export
12. Workflow diff / changelog

**Triggers**
13. Cron / schedule-based triggers
14. Webhook triggers (HTTP POST/GET)
15. Event triggers (message queue, pub/sub)
16. File/storage triggers (new file, modified)
17. Database triggers (row change, CDC)
18. Email triggers (incoming email parsing)
19. Manual / on-demand triggers
20. API polling triggers (configurable interval)
21. Trigger filters / conditions

**Execution Control**
22. Conditional branching (if/else/switch)
23. Parallel execution (fan-out)
24. Fan-in / join (wait for all parallel branches)
25. Loop / iteration (for-each over collections)
26. Sub-workflows / child workflows
27. Dynamic sub-workflow invocation
28. Retry policies (fixed, exponential backoff, max attempts)
29. Error handling (try/catch/finally)
30. Error routing (send to dead-letter queue)
31. Timeout per step / per workflow
32. Concurrency limits (max parallel executions)
33. Rate limiting (per workflow or global)
34. Priority queues (high/low priority execution)
35. Workflow cancellation / abort
36. Pause and resume (manual or programmatic)
37. Continue-as-new (long-running workflow reset)

**Human-in-the-Loop**
38. Approval gates (pause until human approves)
39. Manual review steps
40. Form inputs (collect data mid-workflow)
41. Notification integration (email, Slack, webhook on pending approval)
42. Escalation policies (auto-approve after timeout)

**Data & State**
43. Variable management (workflow-scoped, step-scoped)
44. Input/output mapping between steps
45. Data transformation (JQ, JSONPath, JavaScript expressions)
46. Secret injection (reference secrets by name, never logged)
47. Credential management (OAuth tokens, API keys, stored securely)
48. Execution context / metadata access
49. State persistence (durable execution — survive crashes)
50. Checkpoint / savepoint support
51. Payload size limits and streaming

**Integration & Connectivity**
52. Pre-built integrations / connectors (100-400+ depending on platform)
53. Custom node / plugin development
54. HTTP/REST API calls (generic)
55. GraphQL support
56. Database queries (SQL, NoSQL)
57. Message queue integration (Kafka, RabbitMQ, SQS, NATS)
58. File system / S3 / cloud storage operations
59. Shell/script execution (Bash, Python, PowerShell)
60. Docker container execution (run step in container)
61. Kubernetes pod execution (Argo-style)
62. SDK / client libraries (invoke workflows programmatically)
63. gRPC support

**Observability & Audit**
64. Execution history (searchable, filterable)
65. Execution timeline / Gantt visualization
66. Step-level logging (stdout/stderr capture)
67. Execution replay / re-run from failed step
68. Metrics export (Prometheus, StatsD, CloudWatch)
69. Tracing integration (OpenTelemetry, Jaeger)
70. Audit trail (who triggered, who approved, what changed)
71. Alerting (on failure, SLA breach, stuck workflows)
72. Dashboard / analytics (success rates, duration trends)

**Scalability & Infrastructure**
73. Horizontal worker scaling
74. Worker pools (dedicated workers per queue/task type)
75. Queue management (task queues, priority, sticky queues)
76. Multi-region execution
77. Cluster mode / HA (multiple scheduler/server instances)
78. Database backends (PostgreSQL, MySQL, SQLite, Cassandra)
79. Kubernetes-native deployment (Helm charts, operators)
80. Auto-scaling workers based on queue depth

**Developer Experience**
81. Web UI for building, monitoring, debugging
82. CLI tools (deploy, trigger, inspect)
83. REST API (full CRUD on workflows and executions)
84. TypeScript/Python/Go SDKs
85. Local development / testing mode
86. Unit testing framework for workflows

### Architecture Patterns

**Task Queue Model (Temporal, Conductor)**
- Workflow definitions stored centrally. Workers poll task queues for work. Separation of orchestration (server) from execution (worker). Durable execution — server persists every state transition; workers are stateless and can crash/restart freely.

**DAG Scheduler Model (Airflow, Dagster, Prefect)**
- Workflows defined as DAGs. Scheduler parses DAGs, creates task instances, assigns to executor (local, Celery, Kubernetes). Scheduler is the bottleneck — multiple schedulers supported in Airflow 2.x+.

**Event-Driven Model (Kestra, n8n)**
- Triggers produce events → engine matches to workflow → execution starts. Naturally reactive. Good for integration/automation use cases.

**State Machine Model (Step Functions, Camunda)**
- Workflows as state machines with explicit transitions. Each state has input/output processing, error handling, choice rules. Well-suited for approval flows and business processes.

### Memory Management

- **Workflow state persistence:** Temporal uses Cassandra/PostgreSQL/MySQL to persist every workflow event (event sourcing). History grows linearly — use `ContinueAsNew` for long-running workflows to reset history.
- **Execution history retention:** Configurable retention period (e.g., Airflow default 30 days). Older executions archived or deleted. Trade-off: debugging vs storage.
- **Worker memory limits:** Workers should set max memory per task execution. Airflow Kubernetes executor sets per-pod resource limits. Temporal activities can be configured with heartbeats and timeouts to detect stuck/OOM workers.
- **Queue depth backpressure:** When task queues grow beyond threshold, systems should signal workers to scale up or reject new submissions.

### Testing Criteria

1. **Workflow correctness:** Define deterministic workflow, execute, verify final state matches expected output. Test with various input combinations.
2. **Retry behavior:** Inject transient failures (HTTP 500, timeout), verify retries fire with correct backoff. Verify max retry limit respected. Verify idempotency.
3. **Parallel execution safety:** Fan-out to N parallel branches, verify all complete. Test with shared mutable state — verify race conditions handled. Verify join waits for all branches.
4. **Webhook reliability:** Send webhook, verify workflow triggers within SLA. Send duplicate webhook, verify idempotency key prevents double-execution. Test webhook with invalid payload — verify error handling.
5. **Long-running workflow durability:** Start workflow, kill server, restart, verify workflow resumes from last checkpoint. Test with Temporal's replay mechanism.
6. **Schedule accuracy:** Set cron trigger, verify execution times match schedule within acceptable drift (<1 minute). Test DST transitions. Test overlapping executions (allow/disallow).
7. **Credential security:** Verify secrets are never logged in execution history. Verify credential rotation doesn't break running workflows.

---

## 4. Container Orchestrators / Infrastructure Platforms

### Top 10 Open-Source

| # | Name | Language | Stars (≈) | Key Differentiator | License |
|---|------|----------|-----------|-------------------|---------|
| 1 | **Kubernetes** | Go | 112k | Industry standard, massive ecosystem, extensible via CRDs | Apache-2.0 |
| 2 | **K3s** | Go | 28k | Lightweight K8s (<100MB binary), IoT/edge | Apache-2.0 |
| 3 | **Nomad** | Go | 15k | Multi-workload (containers + VMs + binaries), simple HA | BSL-1.1 (was MPL) |
| 4 | **Docker Swarm** | Go | (in Docker Engine) | Built into Docker, simplest orchestration | Apache-2.0 |
| 5 | **Podman** | Go | 24k | Daemonless, rootless, OCI-native, Docker CLI-compatible | Apache-2.0 |
| 6 | **containerd** | Go | 17k | Industry-standard container runtime (CRI) | Apache-2.0 |
| 7 | **MicroK8s** | Go/Python | 8.5k | Single-node K8s, snap-based, addon system | Apache-2.0 |
| 8 | **LXC/Incus** | Go | 2.5k | System containers (full OS), VM-like but lightweight | Apache-2.0 |
| 9 | **Portainer** | Go/TS | 31k | Container management UI for Docker/Swarm/K8s | Zlib |
| 10 | **Coolify** | PHP/TS | 35k | Self-hosted Heroku/Vercel alternative, git push deploy | Apache-2.0 |

### Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing Model |
|---|------|--------|---------------|
| 1 | **Amazon EKS** | AWS | $0.10/hr per cluster + EC2/Fargate for nodes |
| 2 | **Google GKE** | Google | Free control plane (Autopilot) or $0.10/hr (Standard) + nodes |
| 3 | **Azure AKS** | Microsoft | Free control plane + VM node costs |
| 4 | **Red Hat OpenShift** | Red Hat | Subscription per-core or managed (ROSA, ARO) |
| 5 | **Rancher (SUSE)** | SUSE | Free (community) → Enterprise subscription |
| 6 | **Amazon ECS** | AWS | No cluster charge, pay for Fargate/EC2 tasks |
| 7 | **Google Cloud Run** | Google | Per-request + per-vCPU-second + per-GiB-second |
| 8 | **Azure Container Apps** | Microsoft | Consumption-based (vCPU/s + memory/s + requests) |
| 9 | **DigitalOcean Kubernetes** | DigitalOcean | Free control plane + droplet costs |
| 10 | **Fly.io** | Fly.io | Per-VM pricing (shared/dedicated CPU, RAM, storage) |

### Exhaustive Feature List (95 features)

**Container Runtime**
1. OCI container image support
2. Container image pull (registry auth, pull policies)
3. Container image caching
4. Multi-architecture images (amd64, arm64)
5. Rootless container execution
6. Privileged container mode
7. Container runtime interface (CRI) — pluggable runtimes
8. gVisor / Kata Containers (sandboxed runtimes)
9. Init containers (run-to-completion before main)
10. Sidecar containers (lifecycle-aware sidecars)
11. Ephemeral containers (debugging)

**Scheduling & Placement**
12. Resource-aware scheduling (CPU, memory, GPU requests/limits)
13. Node selectors (label-based placement)
14. Node affinity / anti-affinity (required vs preferred)
15. Pod affinity / anti-affinity (co-locate or spread)
16. Taints and tolerations (repel/attract workloads)
17. Topology spread constraints (even distribution across zones/nodes)
18. Priority classes and preemption
19. Custom schedulers (pluggable scheduler framework)
20. Bin-packing vs spreading strategies
21. GPU scheduling (NVIDIA, AMD device plugins)
22. DaemonSets (one pod per node)
23. StatefulSets (ordered, stable network identity)
24. Jobs (run-to-completion) and CronJobs

**Networking**
25. Service discovery (DNS-based, environment variables)
26. ClusterIP services (internal)
27. NodePort services (external via node ports)
28. LoadBalancer services (cloud provider integration)
29. ExternalName services (DNS CNAME)
30. Headless services (direct pod DNS)
31. Ingress controllers (NGINX, Traefik, HAProxy, Envoy, Caddy)
32. Gateway API (next-gen ingress, HTTPRoute, TCPRoute, GRPCRoute)
33. Network policies (L3/L4 pod-to-pod firewall rules)
34. CNI plugins (Calico, Cilium, Flannel, Weave, Multus)
35. Service mesh integration (Istio, Linkerd, Consul Connect)
36. DNS policy and config (CoreDNS customization)
37. IPv4/IPv6 dual-stack
38. Host networking mode
39. Multi-cluster networking (Submariner, Cilium ClusterMesh)

**Storage**
40. Persistent Volumes (PV) and Persistent Volume Claims (PVC)
41. Storage classes (dynamic provisioning)
42. CSI drivers (pluggable storage: EBS, GCE-PD, Ceph, NFS, Longhorn, OpenEBS)
43. Volume snapshots and restore
44. Volume cloning
45. Ephemeral volumes (emptyDir, configMap, secret, projected)
46. Volume expansion (online resize)
47. ReadWriteOnce / ReadOnlyMany / ReadWriteMany access modes
48. Local persistent volumes (node-local SSD)
49. Volume mount subpath

**Configuration & Secrets**
50. ConfigMaps (key-value configuration injection)
51. Secrets (base64-encoded, mountable as files or env vars)
52. Sealed Secrets / External Secrets Operator (encrypted in git)
53. Environment variable injection (from configmap, secret, field ref, resource ref)
54. Downward API (inject pod metadata into containers)
55. Projected volumes (combine multiple sources)

**Scaling**
56. Horizontal Pod Autoscaler (HPA) — CPU, memory, custom metrics
57. Vertical Pod Autoscaler (VPA) — right-size resource requests
58. Cluster Autoscaler (add/remove nodes based on pending pods)
59. Karpenter (fast, flexible node provisioning)
60. KEDA (event-driven autoscaling — scale on queue depth, etc.)
61. Manual scaling (kubectl scale)

**Deployment Strategies**
62. Rolling updates (maxSurge, maxUnavailable)
63. Recreate (kill all, then create new)
64. Blue-green deployments (via service switching)
65. Canary deployments (progressive traffic shifting)
66. A/B testing (header/cookie-based routing via service mesh)
67. Rollback (automatic on failure or manual)
68. Deployment history and revision tracking

**Access Control & Security**
69. RBAC (Role, ClusterRole, RoleBinding, ClusterRoleBinding)
70. Service accounts (per-pod identity)
71. Pod security standards (restricted, baseline, privileged)
72. Pod security admission controller
73. Seccomp profiles (syscall filtering)
74. AppArmor / SELinux integration
75. Network policies (namespace isolation)
76. Namespace resource quotas and limit ranges
77. Admission webhooks (mutating + validating)
78. OPA Gatekeeper / Kyverno (policy engines)
79. Image signing and verification (Cosign, Notary)

**Observability**
80. Container logs (kubectl logs, log aggregation)
81. Metrics Server (CPU/memory metrics for HPA)
82. Prometheus integration (ServiceMonitor, PodMonitor)
83. Container health checks (liveness, readiness, startup probes)
84. Events (object lifecycle events)
85. Audit logging (API server audit)
86. Distributed tracing (OpenTelemetry integration)
87. Kubernetes dashboard (web UI)

**Extensibility**
88. Custom Resource Definitions (CRDs)
89. Operators (controller pattern for custom resources)
90. Helm charts (package manager for K8s manifests)
91. Kustomize (overlay-based manifest customization)
92. GitOps (ArgoCD, Flux — git as source of truth)
93. Webhooks (admission, conversion, authorization)
94. Aggregated API servers (custom API extensions)
95. Multi-cluster management (fleet, KubeFed, Rancher)

### Architecture Patterns

**Control Plane vs Data Plane**
- **Control plane:** API Server (REST gateway, admission control), etcd (consensus store), Scheduler (pod placement), Controller Manager (reconciliation loops). Runs on dedicated nodes or managed by cloud.
- **Data plane:** kubelet (node agent, pod lifecycle), kube-proxy (service networking rules), container runtime (containerd/CRI-O). Runs on every worker node.

**etcd Consensus**
- Raft consensus protocol. Minimum 3 nodes for HA (tolerates 1 failure). Recommended 5 for production (tolerates 2). All K8s state stored in etcd — it is the single source of truth.

**CNI / CSI / CRI Plugin Architecture**
- **CRI (Container Runtime Interface):** Standardized gRPC API between kubelet and container runtime. containerd and CRI-O are primary implementations.
- **CNI (Container Network Interface):** Pluggable networking. Each plugin implements pod IP allocation, routing, network policy enforcement. Calico (BGP), Cilium (eBPF), Flannel (VXLAN).
- **CSI (Container Storage Interface):** Pluggable storage provisioning. Each driver implements create/delete/attach/mount for its storage backend.

**Simplified Alternatives**
- **K3s:** Replaces etcd with SQLite (single-node) or embedded etcd. Bundles Traefik, CoreDNS, local-path provisioner. Single binary <100MB.
- **Docker Swarm:** Manager nodes use Raft consensus directly. No separate etcd. Simpler networking (overlay). Limited to Docker containers only.
- **Nomad:** Single binary, Raft consensus built-in. Supports containers, VMs, Java, exec, raw binaries. Simpler than K8s but fewer integrations.

### Memory Management

- **etcd memory:** Typically 2-8GB for clusters <10k objects. `--quota-backend-bytes` controls DB size (default 2GB, max 8GB). Compaction and defragmentation required to reclaim space.
- **API server caching:** Watch cache stores recent events in memory. `--watch-cache-sizes` tunable. Informer caches on clients can be significant (large clusters: 100s of MB per controller).
- **Container memory limits:** `resources.limits.memory` enforced by cgroup v2. Exceeding limit triggers OOM kill. `resources.requests.memory` used for scheduling decisions.
- **OOM handling:** Kubelet monitors node memory via `eviction-hard` thresholds (default 100Mi). Evicts pods in priority order (BestEffort → Burstable → Guaranteed). OOM killer (kernel) kills the container process with highest OOM score.

### Testing Criteria

1. **Scheduling correctness:** Deploy pod with resource requests, affinity rules, tolerations — verify placed on correct node. Test with insufficient resources — verify pod remains Pending.
2. **Failover behavior:** Kill a node, verify pods rescheduled to healthy nodes within toleration seconds. Test etcd member failure, verify cluster continues operating.
3. **Rolling update safety:** Deploy v1, trigger rolling update to v2, verify zero-downtime (no 5xx during transition). Kill pod mid-update, verify rollback works.
4. **Resource limit enforcement:** Deploy pod with memory limit, have it allocate beyond limit — verify OOM killed. Deploy with CPU limit, verify throttling (not kill).
5. **Network policy:** Apply deny-all policy, verify pod-to-pod traffic blocked. Add allow rule, verify specific traffic flows.
6. **RBAC:** Create restricted ServiceAccount, attempt unauthorized API calls — verify 403. Test namespace isolation.
7. **Persistent volume lifecycle:** Create PVC, write data, delete pod, recreate pod, verify data persists. Test volume snapshot and restore.
8. **Auto-scaling:** Generate CPU load, verify HPA scales up. Remove load, verify scale-down after stabilization window.

---

## 5. Backend-as-a-Service (BaaS) / Full Platforms

### Top 10 Open-Source

| # | Name | Language | Stars (≈) | Key Differentiator | License |
|---|------|----------|-----------|-------------------|---------|
| 1 | **Supabase** | TypeScript/Elixir | 74k | Open-source Firebase alternative, PostgreSQL-based | Apache-2.0 |
| 2 | **Appwrite** | TypeScript | 46k | Self-hosted BaaS, multi-runtime functions, clean SDKs | BSD-3 |
| 3 | **PocketBase** | Go | 42k | Single-binary BaaS, SQLite-based, embedded, real-time | MIT |
| 4 | **Directus** | TypeScript | 28k | Headless CMS + BaaS, wraps any SQL database | GPL-3.0 (BSL for cloud) |
| 5 | **Strapi** | TypeScript | 64k | Leading headless CMS, plugin marketplace, content API | MIT (EE features proprietary) |
| 6 | **Hasura** | Haskell | 32k | Instant GraphQL on PostgreSQL, event triggers | Apache-2.0 |
| 7 | **NocoDB** | TypeScript | 50k | Open-source Airtable alternative, database-as-spreadsheet | AGPL-3.0 |
| 8 | **Parse (parse-server)** | JavaScript | 21k | Original BaaS (Facebook), mature, self-hosted | Apache-2.0 |
| 9 | **Nhost** | TypeScript | 8k | Supabase alternative with Hasura GraphQL | MIT |
| 10 | **Payload CMS** | TypeScript | 28k | Code-first headless CMS, Next.js native, TypeScript API | MIT |

### Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing Model |
|---|------|--------|---------------|
| 1 | **Firebase** | Google | Spark (free) → Blaze (pay-as-you-go per resource) |
| 2 | **Supabase Cloud** | Supabase | Free → $25/mo (Pro) → $599/mo (Team) → Enterprise |
| 3 | **AWS Amplify** | AWS | Pay-per-use (build min, storage, data transfer, hosting) |
| 4 | **Convex** | Convex | Free → $25/mo (Pro) → Enterprise |
| 5 | **Back4App** | Back4App | Free tier → $25/mo → Enterprise (Parse-based) |
| 6 | **Appwrite Cloud** | Appwrite | Free → $15/mo (Pro) → Enterprise |
| 7 | **Nhost Cloud** | Nhost | Free → $25/mo (Pro) → Enterprise |
| 8 | **Xano** | Xano | $99/mo → $225/mo (no-code backend builder) |
| 9 | **Backendless** | Backendless | Free → $25/mo → Enterprise (visual backend) |
| 10 | **8base** | 8base | Developer → Pro → Enterprise (GraphQL platform) |

### Exhaustive Feature List (98 features)

**Database**
1. PostgreSQL database (managed, per-project)
2. MySQL / MariaDB support
3. SQLite embedded database
4. MongoDB support
5. Real-time database (live queries, change streams)
6. Database branching (preview environments with DB copies)
7. Database migrations (schema versioning)
8. Schema designer / visual schema editor
9. SQL editor (web-based query tool)
10. Read replicas (horizontal read scaling)
11. Connection pooling (PgBouncer, built-in poolers)
12. Point-in-time recovery (PITR)
13. Automated backups (daily, configurable retention)
14. Database extensions (PostGIS, pgvector, pg_trgm, uuid-ossp, etc.)
15. Foreign data wrappers (query external data sources)
16. Database webhooks (trigger on row changes)
17. Full-text search (built-in or via extensions)
18. Vector embeddings storage and search (pgvector)

**API Generation**
19. Auto-generated REST API (CRUD from schema)
20. Auto-generated GraphQL API
21. OpenAPI / Swagger documentation
22. API rate limiting
23. API key management
24. API versioning
25. Custom endpoints / routes
26. Request/response validation
27. Filtering, sorting, pagination (cursor + offset)
28. Field selection / sparse fieldsets
29. Nested relations / population
30. Bulk operations (batch insert/update/delete)
31. Computed / virtual fields
32. API middleware / hooks (before/after)

**Authentication & Authorization**
33. Email/password authentication
34. OAuth 2.0 providers (Google, GitHub, Apple, Facebook, Twitter, Discord, etc.)
35. Magic link (passwordless email)
36. Phone/SMS authentication (OTP)
37. Anonymous authentication
38. Multi-factor authentication (TOTP, SMS)
39. SSO / SAML / OIDC enterprise auth
40. JWT token management (access + refresh tokens)
41. Session management
42. User management dashboard
43. User metadata (custom user fields)
44. Row-level security (RLS) policies
45. Role-based access control (RBAC)
46. Custom claims / permissions
47. Auth hooks / triggers (on signup, login, etc.)
48. Account linking (merge multiple auth providers)
49. Password policies (complexity, expiry, breach detection)
50. Captcha integration (hCaptcha, Turnstile)

**File Storage**
51. File upload API (REST, multipart, resumable)
52. Image transformations (resize, crop, format conversion)
53. CDN integration (global edge caching)
54. Presigned URLs (time-limited direct access)
55. Storage buckets with access policies
56. File metadata and custom attributes
57. Virus scanning / content moderation
58. Storage quotas (per-bucket, per-user)
59. S3-compatible storage backend

**Realtime**
60. WebSocket connections
61. Realtime database subscriptions (table/row-level)
62. Presence tracking (online/offline users)
63. Broadcast channels (pub/sub messaging)
64. Realtime authorization (respect RLS in subscriptions)
65. Multiplayer / collaborative state (CRDTs or OT)
66. Typing indicators
67. Realtime filtering (subscribe to filtered queries)

**Serverless Functions**
68. Edge Functions (Deno/V8 runtime, globally distributed)
69. Server-side functions (Node.js, Python, Go, Rust, etc.)
70. Function triggers (HTTP, database events, cron, auth events)
71. Function environment variables / secrets
72. Function logging and monitoring
73. Cold start optimization
74. Function versioning
75. Local function development and testing
76. Multi-runtime support (polyglot)

**Developer Experience**
77. Dashboard / Admin UI (web-based project management)
78. CLI tools (project init, deploy, migrate, generate types)
79. TypeScript SDK (type-safe client)
80. JavaScript SDK
81. Python SDK
82. Flutter / Dart SDK
83. Swift (iOS) SDK
84. Kotlin (Android) SDK
85. C# / .NET SDK
86. REST client (curl-compatible, standard HTTP)
87. Local development environment (Docker compose, CLI dev mode)
88. Type generation from schema (TypeScript types, Zod schemas)

**Platform & Operations**
89. Team management (roles: owner, admin, developer, viewer)
90. Project settings / configuration UI
91. Custom domains
92. SSL/TLS certificates (auto-provisioned)
93. Environment variables management
94. Webhooks (outbound on events)
95. Cron jobs / scheduled functions
96. Logging and observability (structured logs, metrics)
97. Audit logs (who did what when)
98. Self-hosting support (Docker, Kubernetes, single binary)

### Architecture Patterns

**Composable Service Architecture (Supabase model)**
- Each concern is a separate service: **Auth** (GoTrue/Gotrue-based), **REST API** (PostgREST — auto-generates REST from PostgreSQL schema), **Realtime** (Elixir Phoenix — WebSocket server listening to PostgreSQL WAL), **Storage** (S3-compatible API over any object store), **Edge Functions** (Deno runtime), **Database** (PostgreSQL with extensions). API Gateway (Kong or custom) routes requests.

**Monolithic BaaS (PocketBase model)**
- Single Go binary embeds SQLite, auth, REST API, realtime subscriptions, file storage, admin UI. Zero external dependencies. Ideal for small-medium apps, rapid prototyping. Limitation: single-node (no horizontal scaling without app-level sharding).

**GraphQL-First (Hasura/Nhost model)**
- Database introspection generates GraphQL schema automatically. Subscriptions via WebSocket for realtime. Event triggers for async processing. Actions for custom business logic (call external HTTP endpoints from GraphQL mutations).

**Headless CMS + API (Strapi/Directus/Payload model)**
- Content modeling via admin UI or code. Auto-generated REST + GraphQL APIs. Plugin system for extensibility. Focus on content management with developer-friendly APIs. Can function as BaaS with auth and custom logic plugins.

### Memory Management

- **Connection pooling:** PgBouncer (Supabase default) limits concurrent PostgreSQL connections. Transaction-mode pooling: each query gets a connection, returns immediately. Typical: 200 PgBouncer connections → 15-25 actual PostgreSQL connections. Memory: ~2KB per PgBouncer connection vs ~10MB per PostgreSQL backend.
- **Realtime subscription state:** Each active WebSocket subscription holds state in memory (channel, filters, auth context). At scale: 10k subscriptions × ~1KB state = ~10MB. Phoenix (Supabase Realtime) uses ETS tables for presence tracking. Backpressure needed when subscription count exceeds threshold.
- **File upload buffering:** Multipart uploads buffered to disk (not memory) for large files. Resumable uploads (tus protocol) store partial upload state. Typical buffer: 5-10MB chunks.
- **Query result caching:** Some platforms cache hot query results (PostgREST doesn't by default — relies on PostgreSQL's own cache). Hasura has query response caching with configurable TTL.

### Testing Criteria

1. **Auth flow correctness:** Test full signup → verify email → login → refresh token → logout cycle. Test OAuth flows with mock providers. Verify JWT claims match user data. Test MFA enrollment and verification. Test rate limiting on login attempts.
2. **RLS policy enforcement:** Create policies, verify authenticated user sees only their rows. Verify unauthenticated access blocked. Test policy with joins. Test policy bypass via service role key. Verify RLS applies to realtime subscriptions too.
3. **Realtime delivery:** Subscribe to table changes, insert/update/delete rows, verify events received within 500ms. Test with 100+ concurrent subscribers. Verify late joiners receive current state (not stale). Test WebSocket reconnection and resubscription.
4. **API generation accuracy:** Create table with all PostgreSQL types, verify REST API handles each correctly. Test filtering operators (eq, neq, gt, lt, like, in, is). Test nested relation queries. Test bulk operations. Verify OpenAPI spec matches actual behavior.
5. **Edge function correctness:** Deploy function, invoke via HTTP, verify response. Test function accessing database, auth context, environment variables. Test cold start latency (<500ms target). Test function timeouts.
6. **Storage security:** Upload file with bucket policy, verify access control. Test presigned URL expiry. Verify unauthorized users cannot access private files. Test upload size limits.
7. **Migration safety:** Apply migration, verify schema changes. Rollback migration, verify clean revert. Test migration on production-like data volume. Verify zero-downtime migration support.
8. **SDK type safety:** Generate TypeScript types from schema, verify compile-time errors for invalid queries. Test SDK against all CRUD operations. Verify error handling returns meaningful errors.

---

## Appendix: Cross-Category Considerations for Forgeprint Blueprints

### Common Blueprint Requirements
- **Configuration templating:** All categories need parameterized configuration (database URLs, API keys, ports, resource limits).
- **Health checks:** Every component needs liveness and readiness probes.
- **Logging:** Structured JSON logging to stdout, aggregatable by any log collector.
- **Metrics:** Prometheus-compatible `/metrics` endpoints.
- **Backup/restore:** Every stateful component needs automated backup and tested restore procedures.
- **TLS everywhere:** Inter-service communication should default to mTLS.

### Recommended Pairings
| Primary | Pairs Well With |
|---------|----------------|
| Object Storage | Secret Management (for encryption keys), Container Orchestrator (for deployment) |
| Secret Management | Everything (foundational infrastructure) |
| Workflow Orchestrator | Container Orchestrator (for execution), BaaS (for triggers/webhooks) |
| Container Orchestrator | Object Storage (for persistent data), Secret Management (for credentials) |
| BaaS | Object Storage (file storage backend), Secret Management (API keys), Container Orchestrator (deployment) |
| Knowledge Platform | Object Storage (attachments), BaaS (auth + API), Secret Management (API keys) |

---

## 6. Knowledge / Workspace Platforms (Notion-style)

### Top 10 Open-Source

| # | Name | Language | Stars (≈) | Key Differentiator | License |
|---|------|----------|-----------|-------------------|---------|
| 1 | **AppFlowy** | Rust/Dart | 58k | Open-source Notion alternative, local-first, Rust backend | AGPL-3.0 |
| 2 | **AFFiNE** | TypeScript | 42k | Block-based + whiteboard hybrid, local-first, CRDT-native | MIT |
| 3 | **Outline** | TypeScript | 29k | Clean wiki/knowledge base, Markdown-native, team-focused | BSL-1.1 |
| 4 | **Wiki.js** | TypeScript | 25k | Powerful wiki engine, multi-storage backends, beautiful UI | AGPL-3.0 |
| 5 | **BookStack** | PHP | 15k | Simple structured wiki (shelves → books → chapters → pages) | MIT |
| 6 | **Anytype** | Go/TypeScript | 22k | Local-first, encrypted, P2P sync, object-graph model | Any Source Available |
| 7 | **Docmost** | TypeScript | 8k | Notion/Confluence alternative, collaborative, real-time | AGPL-3.0 |
| 8 | **Trilium** | TypeScript | 28k | Personal knowledge base, hierarchical notes, scripting | AGPL-3.0 |
| 9 | **Logseq** | Clojure | 33k | Outliner + graph, local-first, block-level linking | AGPL-3.0 |
| 10 | **SiYuan** | Go/TypeScript | 22k | Block-based, local-first, end-to-end encrypted sync, Chinese origin | AGPL-3.0 |

### Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing Model |
|---|------|--------|---------------|
| 1 | **Notion** | Notion Labs | Free (personal) → $10/user/mo (Plus) → $18 (Business) → Enterprise |
| 2 | **Confluence** | Atlassian | Free (10 users) → $6.05/user/mo (Standard) → $11.55 (Premium) |
| 3 | **Coda** | Coda | Free → $10/user/mo (Pro) → $30 (Team) → Enterprise |
| 4 | **Obsidian** | Obsidian | Free (personal) → $50/yr (Sync) → $8/mo (Publish) → $50/user/yr (Commercial) |
| 5 | **Slite** | Slite | Free → $10/user/mo (Standard) → $15 (Premium) |
| 6 | **Nuclino** | Nuclino | Free (50 items) → $6/user/mo (Standard) → $12 (Premium) |
| 7 | **Slab** | Slab | Free (10 users) → $8/user/mo (Startup) → $15 (Business) |
| 8 | **GitBook** | GitBook | Free (personal) → $8/user/mo (Plus) → $12 (Pro) → Enterprise |
| 9 | **Tettra** | Tettra | $8.33/user/mo (Starting) → $16.66 (Scaling) → Enterprise |
| 10 | **ClickUp Docs** | ClickUp | Free → $7/user/mo (Unlimited) → $12 (Business) → Enterprise |

### Exhaustive Feature List (88 features)

**Block-Based Editor**
1. Block-based content model (every element is a block)
2. Paragraph blocks
3. Heading blocks (H1–H6)
4. Bulleted lists / numbered lists / checklists (to-do)
5. Toggle / collapsible blocks
6. Code blocks (syntax highlighting, 100+ languages)
7. Math / LaTeX blocks (KaTeX or MathJax)
8. Callout / admonition blocks (info, warning, tip, danger)
9. Quote / blockquote blocks
10. Divider / separator blocks
11. Table of contents block (auto-generated from headings)
12. Embed blocks (iframe — YouTube, Figma, Miro, Google Maps, Loom, etc.)
13. File attachment blocks (upload and display any file type)
14. Image blocks (upload, URL, resize, alignment, caption)
15. Video / audio blocks (upload, embed, inline playback)
16. Bookmark blocks (URL preview with title, description, image)
17. Synced / mirrored blocks (edit once, reflected everywhere)
18. Column / multi-column layout blocks
19. Button / action blocks (trigger automations on click)
20. Drawing / whiteboard / canvas blocks
21. Mermaid / diagram blocks (flowcharts, sequence diagrams)
22. Drag-and-drop block reordering
23. Block-level comments and discussions
24. Block-level permissions (restrict specific blocks)
25. Nested / child blocks (infinite hierarchy)
26. Slash commands (/ menu for quick block insertion)
27. Markdown input shortcuts (type `##` for H2, `-` for bullet, etc.)
28. Rich text formatting (bold, italic, underline, strikethrough, code, highlight, color)

**Database / Structured Data**
29. Inline databases (table, board, list, calendar, gallery, timeline views)
30. Full-page databases
31. Table view (spreadsheet-like grid)
32. Kanban board view (drag cards between columns)
33. Calendar view (date-based card layout)
34. Gallery view (card grid with cover images)
35. Timeline / Gantt view (date ranges on horizontal axis)
36. List view (compact row listing)
37. Chart view (bar, line, pie from database data)
38. Property types: text, number, select, multi-select, date, person, files, checkbox, URL, email, phone, formula, relation, rollup, created time, last edited time, created by, last edited by, status, unique ID
39. Formulas (computed properties with expression language)
40. Relations (link rows between databases)
41. Rollups (aggregate related records — count, sum, average, etc.)
42. Filters (compound AND/OR conditions per property)
43. Sorts (multi-level, per-view)
44. Group-by (collapse rows by property value)
45. Sub-items / sub-tasks (hierarchical records)
46. Database templates (pre-filled row templates)
47. Linked / referenced databases (same data, different view)
48. Database automations (when property changes → action)

**Pages & Organization**
49. Nested pages (infinite depth page tree)
50. Page icons (emoji or custom image)
51. Page cover images
52. Breadcrumb navigation
53. Sidebar / page tree navigation
54. Favorites / bookmarks
55. Recently viewed pages
56. Backlinks (see all pages linking to this page)
57. Page templates (reusable page structures)
58. Template buttons (one-click create from template)
59. Trash / recycle bin (soft delete with restore)

**Collaboration**
60. Real-time multi-user editing (see cursors and selections)
61. Inline comments (on any text selection or block)
62. Page-level discussion threads
63. @mentions (notify users inline)
64. Page history / version history (view and restore any version)
65. Diff view (compare versions)
66. Suggested edits / change requests
67. Lock pages (prevent further edits)
68. Notifications (in-app, email, mobile push)

**Sharing & Permissions**
69. Workspace-level roles (owner, admin, member, guest)
70. Page-level permissions (full access, can edit, can comment, can view)
71. Team spaces / groups (permission inheritance)
72. Share to web (public page with custom URL)
73. Guest / external user access (per-page invite)
74. Link sharing (anyone with link, password-protected)
75. Domain-restricted sharing (only @company.com users)

**Search & Discovery**
76. Full-text search (across all pages and databases)
77. Semantic / AI-powered search (natural language queries)
78. Quick find / command palette (Cmd+K / Ctrl+K)
79. Search filters (by workspace, date, author, type)
80. Recent searches / search history

**Import / Export & Interoperability**
81. Markdown import / export
82. HTML import / export
83. CSV import / export (for databases)
84. Notion import
85. Confluence import
86. PDF export
87. API access (REST, full CRUD on pages, databases, blocks, users)
88. Webhooks (page created, updated, deleted events)

### Architecture Patterns

**Block-Based Document Model**
- Every piece of content is a **block** with a unique ID, type, properties, and ordered children. A page is a root block whose children are content blocks. Databases are special blocks containing **row blocks** with typed properties.
- **Block tree:** Stored as ordered tree (parent_id + position). Operations: insert, move, delete, update properties. Efficient subtree queries needed for page rendering.
- **Storage:** Typically PostgreSQL (Outline, Docmost) or SQLite (PocketBase-style). Block-per-row or document-per-row with JSON block tree. Notion uses a custom sharded store.

**CRDT for Real-Time Collaboration**
- **Yjs** (most popular): CRDT library used by AFFiNE, Outline, Docmost. Yjs documents encode shared types (YText, YArray, YMap). Merges concurrent edits automatically without central coordination.
- **Automerge:** Alternative CRDT library (Rust + WASM). Used by some local-first apps.
- **OT (Operational Transformation):** Legacy approach (Google Docs, Confluence). Requires central server to transform operations. Simpler but doesn't work offline/P2P.
- **Sync protocol:** Yjs uses awareness protocol (cursor positions, user presence) + sync protocol (state vectors + update deltas). WebSocket server relays updates between clients. Can use y-redis, y-sweet, or Hocuspocus as sync backend.

**Database Engine (Structured + Unstructured)**
- Pages are unstructured (rich text blocks). Databases are structured (typed properties, filterable, sortable).
- **Unified model (Notion approach):** Everything is a block. Database rows are pages with extra properties. Allows mixing structured and unstructured content seamlessly.
- **Separate models:** Some platforms keep documents and databases separate (Coda uses a doc + table split). Simpler but less flexible.
- **Query engine:** Database views require filtering, sorting, grouping, aggregation, and formula evaluation. Can be client-side (for small datasets) or server-side (for large datasets).

**Permission System**
- **Hierarchical inheritance:** Workspace → Team Space → Page → Child Page. Permissions cascade down unless overridden.
- **Object-level permissions:** Each page/database can have its own ACL (user + role → permission level).
- **Row-level security:** Some platforms support per-row visibility in databases (based on person property or group membership).
- **Share tokens:** Public sharing via signed tokens/slugs with optional password and expiry.

**Plugin / Integration Framework**
- **Slash command extensions:** Custom block types registered via plugins.
- **API-first:** Full REST/GraphQL API enables external integrations. Webhooks for event-driven automation.
- **OAuth app marketplace:** Third-party apps can read/write pages and databases (Notion Connections, Confluence Apps).
- **Embeds:** iframe-based embedding of external content. oEmbed protocol for auto-discovery.

### Memory Management

- **Document tree memory:** Entire page block tree loaded into memory on open. Typical page: 50-500 blocks × ~1KB each = 50KB-500KB. Very large pages (10k+ blocks) can cause client-side rendering issues — pagination or virtualized rendering needed.
- **CRDT state:** Yjs document state grows with edit history (tombstones for deleted content). A heavily-edited document can have CRDT state 10-50x the visible content size. **Garbage collection** (Yjs GC mode) reclaims tombstones but loses undo history. Periodic **snapshots** reduce state size.
- **Collaboration session state:** Each connected user holds: awareness state (~200 bytes), pending updates buffer, subscription list. Server-side: 1000 concurrent editors on 100 documents × ~5KB each ≈ 500KB. Manageable, but WebSocket connection overhead (kernel buffers ~87KB per connection) dominates.
- **Search index:** Full-text search index (Elasticsearch, MeiliSearch, or PostgreSQL tsvector). Index size typically 30-50% of raw content size. Semantic/vector search index (pgvector, Pinecone) adds embedding vectors (~6KB per page for 1536-dim float32). For 100k pages: ~600MB vector index.

### Testing Criteria

1. **Editor correctness:** Create blocks of every type, verify rendering. Test nested blocks (5+ levels deep). Test drag-and-drop reordering. Test undo/redo (Cmd+Z) across all operations. Test Markdown shortcuts. Test copy-paste from external sources (Word, Google Docs, HTML, plain text) — verify clean conversion.
2. **CRDT conflict resolution:** Two users simultaneously edit the same paragraph — verify both edits preserved (no data loss). Two users move the same block to different positions — verify deterministic resolution. Test offline editing: disconnect user A, both A and B edit, reconnect — verify clean merge. Stress test: 10 users editing same page concurrently for 5 minutes — verify no corruption.
3. **Permission enforcement:** Set page to "view only" for user B — verify B cannot edit via UI or API. Test inheritance: restrict parent page, verify child pages inherit restriction. Test guest access: invite external user to specific page, verify no access to other pages. Test public sharing: enable share-to-web, verify anonymous access works, verify private content not leaked. Test API permissions: verify API key respects same permissions as UI.
4. **API completeness:** Test CRUD on all object types (pages, databases, blocks, users, comments). Test database queries via API (filter, sort, paginate). Test block operations (insert, update, delete, move, append children). Test search API. Verify API responses match documented schema. Test rate limiting behavior.
5. **Search accuracy:** Index 1000 pages with diverse content. Test exact match queries. Test partial / fuzzy matches. Test search within databases (property values). Test search across workspaces (verify isolation). Measure search latency (<200ms target). Test re-indexing after content update (eventual consistency window).
6. **Database features:** Create database with all property types, verify CRUD. Test formulas with edge cases (division by zero, null references, circular relations). Test rollups across related databases. Test filter combinations (AND/OR/nested). Test sort stability. Test group-by with large datasets. Test timeline view date rendering. Test kanban drag-and-drop updates property correctly.
7. **Performance:** Load page with 1000 blocks — measure render time (<2s target). Load database with 10k rows — measure initial query time. Test real-time sync latency (edit appears on other client within 500ms). Test search index update latency (new page searchable within 5s). Test concurrent page creation (100 pages/second via API).
