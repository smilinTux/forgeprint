# Sovereign Document Signing (SKSeal) Blueprint

## Overview & Purpose

SKSeal is a PGP-backed document signing system that provides sovereign, tamper-evident digital signatures without relying on third-party certificate authorities or cloud signing services. Documents are signed with the signer's own PGP key, producing detached signatures stored as structured metadata alongside the original. Every signing event is recorded in an append-only audit trail, creating an unbroken chain of provenance from creation to final countersignature.

### Core Responsibilities
- **PGP Signing**: Create detached PGP signatures over document hashes using sovereign keys
- **Signature Verification**: Validate signatures against the signer's public key and document integrity
- **Audit Trail**: Maintain append-only, tamper-evident logs of all signing operations per document
- **Template System**: Reusable field layout definitions for structured document signing workflows
- **Multi-Signature**: Coordinate sequential or parallel signing across multiple parties
- **Document Tracking**: Version and track documents through their signing lifecycle
- **Capability-Gated Access**: CapAuth integration for fine-grained access control on signing operations
- **REST + CLI Interface**: Headless FastAPI server and rich CLI for all operations

## Core Concepts

### 1. Detached Signature
**Definition**: A PGP signature stored separately from the document, preserving the original file untouched while providing cryptographic proof of authenticity.

```
DetachedSignature {
    signature_id: UUID v4 (unique per signing event)
    document_hash: SHA-256 hex digest of original file
    hash_algorithm: "sha256" | "sha512" | "sha3-256"
    fingerprint: PGP key fingerprint of signer (40-char hex)
    algorithm: "RSA" | "Ed25519" | "ECDSA"
    signature_data: Base64-encoded PGP detached signature bytes
    timestamp: ISO-8601 UTC (signing moment)
    signer_identity: {
        handle: "alice@smilintux.org"
        display_name: "Alice Sovereign"
        capauth_token: Optional capability token reference
    }
    template_id: Optional template used for this signing
    signer_notes: Optional free-text notes from signer
    metadata: {
        client_version: SKSeal version string
        key_algorithm: Key type and bit length
        signing_mode: "detached" | "embedded"
    }
}
```

### 2. Audit Trail Record
**Definition**: An immutable, append-only log entry recording a single signing event. Each record is itself PGP-signed by the system to prevent tampering.

```
AuditRecord {
    record_id: UUID v4
    document_id: UUID v4 (links to tracked document)
    event_type: "created" | "signed" | "countersigned" | "verified" |
                "rejected" | "revoked" | "template_applied" | "exported"
    actor: {
        fingerprint: PGP fingerprint
        handle: Actor identity string
        role: "author" | "signer" | "witness" | "auditor"
    }
    document_hash: SHA-256 at time of event
    previous_record_hash: SHA-256 of previous record (chain integrity)
    timestamp: ISO-8601 UTC
    details: Event-specific JSON payload
    system_signature: PGP signature over this record by SKSeal system key
}
```

### 3. Signing Template
**Definition**: A reusable field layout definition that specifies where signatures, dates, and custom fields appear on a document type.

```
Template {
    template_id: UUID v4
    name: Human-readable template name
    description: What this template is for
    version: Semantic version string
    document_type: "pdf" | "generic"
    fields: [
        {
            field_id: Unique identifier
            field_type: "signature" | "date" | "text" | "checkbox" | "initials"
            label: Display label
            page: Page number (1-indexed, PDF only)
            position: { x: float, y: float, width: float, height: float }
            required: Boolean
            signer_role: Which signer fills this field
            validation: Optional regex or constraint
        }
    ]
    signing_order: {
        mode: "sequential" | "parallel" | "any_order"
        roles: Ordered list of signer roles
    }
    created_by: PGP fingerprint
    created_at: ISO-8601 UTC
}
```

### 4. Document Record
**Definition**: Tracking metadata for a document throughout its signing lifecycle.

```
DocumentRecord {
    document_id: UUID v4
    filename: Original filename
    file_path: Storage path relative to documents/
    file_size: Bytes
    mime_type: "application/pdf" | "application/octet-stream"
    hash: SHA-256 of original document
    status: "draft" | "pending_signatures" | "partially_signed" |
            "fully_signed" | "expired" | "revoked"
    template_id: Optional applied template
    required_signers: [
        { fingerprint: str, role: str, signed: bool, signed_at: Optional }
    ]
    signatures: List<DetachedSignature>
    created_at: ISO-8601 UTC
    updated_at: ISO-8601 UTC
    expires_at: Optional ISO-8601 UTC
}
```

### 5. Capability Token (CapAuth Integration)
**Definition**: Access control tokens that gate who can sign, verify, or manage documents.

```
SigningCapability {
    token_id: UUID v4
    issuer_fingerprint: PGP fingerprint of token creator
    grantee_fingerprint: PGP fingerprint of authorized party
    permissions: ["sign", "verify", "audit:read", "template:create",
                  "document:upload", "document:delete"]
    scope: {
        document_ids: Optional list of specific documents
        template_ids: Optional list of specific templates
        expires_at: Optional expiration timestamp
    }
    signature: PGP signature from issuer over token body
}
```

## Architecture Patterns

### 1. Layered Processing Pipeline

```
┌─────────────────────────────────────────────────────┐
│                   Interface Layer                     │
│   CLI (click+rich)  │  REST API (FastAPI)  │  SDK    │
├─────────────────────────────────────────────────────┤
│                   Service Layer                       │
│   SigningService  │  VerifyService  │  TemplateService│
│   AuditService    │  DocumentService│  ExportService  │
├─────────────────────────────────────────────────────┤
│                   Security Layer                      │
│   PGP Engine (pgpy)  │  CapAuth Client  │  Hash Engine│
├─────────────────────────────────────────────────────┤
│                   Storage Layer                       │
│   DocumentStore  │  AuditStore  │  TemplateStore      │
│   (files + SQLite)│  (.audit.jsonl)│  (YAML files)    │
└─────────────────────────────────────────────────────┘
```

**Benefits:**
- Clean separation of concerns enables independent testing per layer
- Security layer is a mandatory gateway -- no bypass paths
- Storage layer is pluggable (filesystem, S3, database)

**Limitations:**
- Additional latency from layer traversal on every operation
- Cross-layer transactions require careful coordination

### 2. Append-Only Audit with Hash Chaining

```
Record 1          Record 2          Record 3
┌──────────┐     ┌──────────┐     ┌──────────┐
│ event:   │     │ event:   │     │ event:   │
│ created  │     │ signed   │     │ counter- │
│          │     │          │     │ signed   │
│ prev: ∅  │────▶│ prev:    │────▶│ prev:    │
│          │     │ hash(R1) │     │ hash(R2) │
│ sig: PGP │     │ sig: PGP │     │ sig: PGP │
└──────────┘     └──────────┘     └──────────┘
```

**Benefits:**
- Tampering with any record breaks the hash chain
- Each record independently verifiable via PGP signature
- Simple append-only file format (.jsonl) survives corruption

**Limitations:**
- Hash chain verification is O(n) for full audit
- Cannot delete or amend historical records (by design)

## Data Flow Diagrams

### Signing Flow
```
User/Agent submits signing request
        │
        ▼
Interface Layer: Parse request, validate parameters
        │
        ▼
CapAuth Check: Verify capability token grants "sign" permission
        │
        ├── Denied → Return 403 with reason
        │
        ▼ Allowed
Document Service: Load document from store
        │
        ▼
Hash Engine: Compute SHA-256 over document bytes
        │
        ▼
PGP Engine: Load signer's private key from keyring
        │
        ▼
PGP Engine: Create detached signature over document hash
        │
        ▼
Storage Layer: Write .sig.json alongside document
        │
        ▼
Audit Service: Append "signed" record to .audit.jsonl
  - Include document hash, signer fingerprint, timestamp
  - Chain to previous record via prev_hash
  - PGP-sign the audit record itself
        │
        ▼
Template Engine (optional): Embed visual signature in PDF fields
        │
        ▼
Return: SignatureResult with signature_id, document_hash, timestamp
```

### Verification Flow
```
User/Agent submits verification request (document + signature)
        │
        ▼
Hash Engine: Compute SHA-256 of provided document
        │
        ▼
Compare: Does computed hash match signature's document_hash?
        │
        ├── NO → Return INVALID (document modified since signing)
        │
        ▼ YES
PGP Engine: Load signer's public key by fingerprint
        │
        ├── NOT FOUND → Return UNVERIFIABLE (unknown signer)
        │
        ▼ FOUND
PGP Engine: Verify detached signature against document hash
        │
        ├── INVALID → Return INVALID (signature does not match)
        │
        ▼ VALID
Audit Service: Check audit trail for revocation events
        │
        ├── REVOKED → Return REVOKED (signature was revoked)
        │
        ▼ NOT REVOKED
Timestamp Check: Is signature within acceptable time window?
        │
        ▼
Return: VerificationResult { valid: true, signer, timestamp, trust_level }
```

### Multi-Signature Flow
```
Initiator creates signing request with template
        │
        ▼
Template defines required signers and order
        │
        ├── Sequential: Signer 1 → Signer 2 → Signer 3
        │   Each signer unlocked only after previous completes
        │
        ├── Parallel: All signers can sign independently
        │   Document marked complete when all have signed
        │
        └── Any Order: Like parallel but with role constraints
            Certain fields only fillable by specific roles
        │
        ▼
Each signer receives notification (via SKComm or webhook)
        │
        ▼
Each signer signs their assigned fields
        │
        ▼
All signatures collected → Document status: "fully_signed"
        │
        ▼
Audit trail records each signing event independently
```

## Configuration Model

```yaml
# ~/.skseal/config.yml

identity:
  keyring: "~/.capauth/identity/"      # CapAuth-managed PGP keys
  default_key: "auto"                   # "auto" uses first available, or fingerprint

storage:
  base_path: "~/.skseal/"
  documents_dir: "documents/"
  templates_dir: "templates/"
  audit_dir: "audit/"
  keys_cache_dir: "keys/"
  database: "skseal.db"                 # SQLite for document tracking

signing:
  hash_algorithm: "sha256"              # sha256 | sha512 | sha3-256
  default_mode: "detached"              # detached | embedded
  timestamp_authority: null              # Optional RFC 3161 TSA URL
  require_capability_token: false        # Enforce CapAuth for all operations
  signature_expiry_days: null            # Optional auto-expiry

templates:
  default_signature_size:
    width: 200
    height: 60
  date_format: "%Y-%m-%d %H:%M UTC"
  allow_custom_fields: true

server:
  host: "127.0.0.1"
  port: 8084
  cors_origins: ["http://localhost:*"]
  max_upload_size: "100MB"
  rate_limit: "100/minute"

audit:
  chain_algorithm: "sha256"
  sign_records: true                     # PGP-sign each audit record
  system_key: "auto"                     # Key used for audit record signing
  export_format: "jsonl"                 # jsonl | csv

notifications:
  enabled: false
  transport: "skcomm"                    # skcomm | webhook | email
  webhook_url: null
  on_events: ["signed", "countersigned", "revoked"]

logging:
  level: "info"
  file: "~/.skseal/logs/skseal.log"
  max_size: "50MB"
  rotate: 7
```

## Security Considerations

### 1. Key Management
- Private keys NEVER leave the signer's device
- Key access delegated to CapAuth keyring -- SKSeal never stores private keys
- Public keys cached locally for verification, refreshed from keyservers
- Key revocation propagated via CapAuth and checked before verification

### 2. Document Integrity
- SHA-256 hash computed before and after every operation
- Hash mismatch at any stage aborts the operation
- Original documents stored read-only after initial import
- Detached signatures preserve original file byte-for-byte

### 3. Audit Tamper-Evidence
- Hash chain links each record to its predecessor
- Each audit record independently PGP-signed by system key
- Append-only .jsonl format -- no in-place edits possible
- Optional RFC 3161 timestamping for legal non-repudiation

### 4. Access Control
- CapAuth capability tokens gate all operations (optional, recommended)
- Per-document and per-template permission scoping
- Token expiry prevents stale access
- All access attempts logged in audit trail

### 5. Transport Security
- REST API served over TLS only (enforced in production)
- File paths validated against path traversal attacks
- Upload size limits prevent resource exhaustion
- Rate limiting on all API endpoints

## Performance Targets

| Metric | Target |
|--------|--------|
| Sign a 10MB PDF | < 500ms |
| Verify a signature | < 200ms |
| Hash a 100MB document | < 2s |
| Audit trail append | < 10ms |
| Template rendering (PDF) | < 1s |
| Full audit chain verification | < 5s for 1000 records |
| REST API response (sign) | < 1s p95 |
| REST API response (verify) | < 500ms p95 |
| Concurrent signing sessions | 50+ |
| Document storage overhead | < 5% (signature metadata) |

## Extension Points

### Custom Hash Algorithms
```python
class HashAlgorithm(ABC):
    @abstractmethod
    def name(self) -> str:
        """Algorithm identifier string."""

    @abstractmethod
    def digest(self, data: bytes) -> str:
        """Compute hex digest of data."""

    @abstractmethod
    def verify(self, data: bytes, expected: str) -> bool:
        """Verify data matches expected digest."""
```

### Custom Storage Backends
```python
class StorageBackend(ABC):
    @abstractmethod
    def store_document(self, doc_id: str, data: bytes, metadata: dict) -> str:
        """Store document bytes, return storage path."""

    @abstractmethod
    def retrieve_document(self, doc_id: str) -> tuple[bytes, dict]:
        """Retrieve document bytes and metadata."""

    @abstractmethod
    def store_signature(self, doc_id: str, sig: dict) -> None:
        """Store signature metadata for a document."""

    @abstractmethod
    def list_signatures(self, doc_id: str) -> list[dict]:
        """List all signatures for a document."""
```

### Custom Notification Transports
```python
class NotificationTransport(ABC):
    @abstractmethod
    def notify(self, event: str, recipients: list[str], payload: dict) -> bool:
        """Send signing event notification to recipients."""
```

## Implementation Architecture

### Core Components

| Component | Responsibility | Dependencies |
|-----------|---------------|--------------|
| `SigningEngine` | PGP signing and verification operations | pgpy, CapAuth client |
| `DocumentManager` | Document lifecycle, storage, versioning | pypdf, SQLite |
| `AuditChain` | Append-only audit trail with hash chaining | pgpy (for record signing) |
| `TemplateEngine` | Template CRUD, field layout, PDF rendering | pypdf, Pillow |
| `CapabilityGate` | CapAuth token validation middleware | CapAuth SDK |
| `APIServer` | FastAPI REST endpoints | FastAPI, uvicorn |
| `CLIApp` | Command-line interface | click, rich |
| `NotificationService` | Event-driven signing notifications | SKComm client |

### Data Structures

```
~/.skseal/
├── config.yml                          # Global configuration
├── skseal.db                           # SQLite document tracking DB
├── documents/
│   ├── {doc_id}/
│   │   ├── original.pdf                # Untouched original
│   │   ├── signed.pdf                  # PDF with embedded signature fields (optional)
│   │   └── signatures/
│   │       ├── {sig_id}.sig.json       # Detached signature metadata
│   │       └── {sig_id}.sig.pgp        # Raw PGP detached signature
├── templates/
│   ├── nda-standard.yml                # Template definition
│   ├── contract-two-party.yml
│   └── custom/                         # User-created templates
├── audit/
│   ├── {doc_id}.audit.jsonl            # Per-document audit trail
│   └── global.audit.jsonl              # Cross-document system audit
├── keys/
│   └── cache/                          # Cached public keys for verification
└── logs/
    └── skseal.log                      # Application log
```

### REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sign` | Sign a document (upload or reference) |
| POST | `/verify` | Verify a document's signature(s) |
| GET | `/documents` | List tracked documents with status |
| GET | `/documents/{doc_id}` | Get document details and signatures |
| POST | `/documents` | Upload and register a new document |
| DELETE | `/documents/{doc_id}` | Remove document (audit record preserved) |
| GET | `/audit/{doc_id}` | Get full audit trail for a document |
| GET | `/audit/{doc_id}/verify` | Verify audit chain integrity |
| GET | `/templates` | List available templates |
| POST | `/templates` | Create a new template |
| GET | `/templates/{template_id}` | Get template details |
| PUT | `/templates/{template_id}` | Update a template |
| POST | `/sign/multi` | Initiate multi-signature workflow |
| GET | `/sign/multi/{session_id}` | Check multi-signature progress |
| POST | `/sign/multi/{session_id}/sign` | Submit signature for multi-sign session |

### CLI Commands

| Command | Description |
|---------|-------------|
| `skseal sign <file>` | Sign a document with default key |
| `skseal verify <file>` | Verify all signatures on a document |
| `skseal audit <file>` | Show audit trail for a document |
| `skseal audit --verify <file>` | Verify audit chain integrity |
| `skseal documents` | List tracked documents |
| `skseal templates` | List available templates |
| `skseal templates create <name>` | Interactive template builder |
| `skseal serve` | Start the REST API server |
| `skseal export <file> --format pdf` | Export signed document with embedded sigs |
| `skseal init` | Initialize ~/.skseal/ directory structure |
