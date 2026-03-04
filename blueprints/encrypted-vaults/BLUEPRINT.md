# Encrypted Reference Vaults (SKRef) Blueprint

## Overview & Purpose

SKRef provides transparent FUSE-mounted encrypted file vaults for sovereign document storage. Files are encrypted at rest using GPG keys from CapAuth and served through a standard filesystem mount point -- applications see plaintext, disk stores ciphertext. Backend-agnostic design means the same vault can live on a local filesystem, a WebDAV server, S3, Google Drive, or any combination.

### Core Responsibilities
- **Transparent Encryption**: Encrypt on write, decrypt on read -- applications never see ciphertext
- **FUSE Mounting**: Standard filesystem interface mountable at any path
- **GPG Key Integration**: Use CapAuth sovereign keys for all cryptographic operations
- **Three-Tier Storage**: Separate vaults for auth seeds, GTD tasks, and reference material
- **Backend Abstraction**: Pluggable storage backends with identical vault semantics
- **Peer Sharing**: Share vault access by encrypting to multiple GPG recipients
- **Metadata Protection**: Encrypt filenames, directory structure, and file sizes (optional)
- **Offline-First**: Full vault access without network connectivity (with local cache)

## Core Concepts

### 1. Vault

**Definition**: A named, self-contained encrypted container with its own key set, backend, and mount configuration.

```
Vault {
    vault_id: UUID v4
    name: Human-readable identifier ("medical-records", "auth-seeds")
    tier: auth | gtd | reference | custom
    mount_point: Absolute path ("/home/user/Vaults/medical")
    backend: Backend configuration
    encryption: {
        primary_key: PGP fingerprint (owner)
        recipients: List[PGP fingerprint] (shared access)
        cipher: AES-256-GCM (content encryption)
        key_derivation: Argon2id (passphrase fallback)
    }
    manifest: {
        version: Protocol version ("1.0.0")
        created: ISO-8601 timestamp
        block_size: Bytes (default 4MB)
        filename_encryption: Boolean (default true)
        padding: Boolean (hide file sizes, default false)
    }
    state: locked | unlocked | mounted | syncing | error
}
```

### 2. Block

**Definition**: The atomic unit of encrypted storage. Files are split into fixed-size blocks, each independently encrypted.

```
Block {
    block_id: SHA-256 hash of plaintext content
    vault_id: Parent vault reference
    sequence: Integer (position in file)
    ciphertext: AES-256-GCM encrypted content
    nonce: 12-byte random nonce (unique per block)
    tag: 16-byte GCM authentication tag
    size: Original plaintext size
    compressed: Boolean
}
```

### 3. Metadata Index

**Definition**: Encrypted mapping from plaintext paths to block chains. The index itself is encrypted with the vault key.

```
MetadataIndex {
    entries: Map<plaintext_path, FileEntry>

    FileEntry {
        file_id: UUID
        plaintext_name: Original filename
        encrypted_name: Opaque identifier on backend
        size: Plaintext file size
        blocks: List[block_id] in order
        content_type: MIME type
        permissions: POSIX mode bits
        created: ISO-8601 timestamp
        modified: ISO-8601 timestamp
        accessed: ISO-8601 timestamp
        checksum: SHA-256 of complete plaintext
        tags: List[String] (user-defined)
    }
}
```

### 4. Backend

**Definition**: A pluggable storage provider that handles raw ciphertext block persistence.

```
Backend {
    type: local | webdav | s3 | gdrive | nextcloud | sftp
    config: Backend-specific configuration
    supports_streaming: Boolean
    supports_versioning: Boolean
    max_block_size: Bytes (-1 for unlimited)

    methods:
        put_block(block_id, ciphertext) -> Boolean
        get_block(block_id) -> bytes
        delete_block(block_id) -> Boolean
        list_blocks() -> List[block_id]
        exists(block_id) -> Boolean
        health_check() -> HealthStatus
}
```

### 5. FUSE Layer

**Definition**: The userspace filesystem driver translating VFS calls into vault operations.

```
FUSELayer {
    vault: Vault reference
    cache: LRU block cache (plaintext, memory-resident)
    read_ahead: Prefetch next N blocks on sequential read
    write_buffer: Coalesce small writes into full blocks

    vfs_operations:
        getattr(path) -> stat
        readdir(path) -> List[entry]
        open(path, flags) -> file_handle
        read(path, size, offset) -> bytes
        write(path, data, offset) -> bytes_written
        create(path, mode) -> file_handle
        unlink(path) -> None
        rename(old, new) -> None
        truncate(path, size) -> None
        fsync(path) -> None
}
```

## Architecture Patterns

### 1. Layered Encryption Pipeline

```
Application (plaintext I/O)
        |
   FUSE Layer (VFS translation)
        |
   Block Engine (split/merge, compress)
        |
   Crypto Layer (AES-256-GCM per block)
        |
   Backend Adapter (put/get ciphertext)
        |
   Storage (local FS / WebDAV / S3 / GDrive)
```

**Benefits:**
- Each layer is independently testable
- Crypto layer swap without touching FUSE or backends
- Backend failures do not corrupt plaintext cache

**Limitations:**
- FUSE overhead adds ~5-15% latency vs native FS
- Large file random reads require full block decryption

### 2. Content-Addressed Block Storage

```
File: report.pdf (12MB)
        |
   Split into 4MB blocks:
   ┌──────────┬──────────┬──────────┐
   │ Block 0  │ Block 1  │ Block 2  │
   │ sha256:  │ sha256:  │ sha256:  │
   │ a3f2...  │ 7b1c...  │ e9d0...  │
   └──────────┴──────────┴──────────┘
        |            |           |
   Encrypt each:  AES-256-GCM with unique nonce
        |            |           |
   Store on backend as: a3f2...enc, 7b1c...enc, e9d0...enc
```

**Benefits:**
- Automatic deduplication -- identical blocks stored once
- Parallel encrypt/decrypt of independent blocks
- Corruption isolated to single block, not entire file

**Limitations:**
- Content-addressing leaks block equality (mitigated by per-vault salt)
- Block index required to reconstruct file order

### 3. Multi-Recipient Key Envelope

```
File encryption key (FEK): random AES-256 key per vault session

   FEK encrypted to each recipient's PGP key:
   ┌─────────────────────────────────────────────┐
   │ Envelope:                                    │
   │   recipient_1: PGP_encrypt(FEK, pubkey_1)   │
   │   recipient_2: PGP_encrypt(FEK, pubkey_2)   │
   │   recipient_3: PGP_encrypt(FEK, pubkey_3)   │
   └─────────────────────────────────────────────┘

   Any recipient can decrypt FEK with their private key,
   then use FEK to decrypt all blocks.
```

**Benefits:**
- Adding/removing recipients does not re-encrypt all data
- Each recipient uses their own PGP key (no shared secrets)
- Revocation = remove recipient + rotate FEK

**Limitations:**
- Envelope size grows linearly with recipient count
- FEK rotation requires re-encrypting all blocks

## Data Flow Diagrams

### Write Flow

```
Application writes file to mount point
        |
        v
FUSE: create(path) -> allocate file_id
        |
        v
FUSE: write(data) -> buffer in write_buffer
        |
        v
Block Engine: flush when buffer >= block_size
   |
   ├── Compress block (zstd level 3)
   ├── Generate random nonce (12 bytes)
   ├── Encrypt: AES-256-GCM(FEK, nonce, plaintext)
   ├── Compute block_id = SHA-256(plaintext)
   |
   v
Backend: put_block(block_id, ciphertext + nonce + tag)
   |
   v
MetadataIndex: update file entry with new block chain
   |
   v
MetadataIndex: encrypt and persist index to backend
```

### Read Flow

```
Application reads file from mount point
        |
        v
FUSE: open(path) -> lookup in MetadataIndex
        |
        v
FUSE: read(offset, size) -> calculate block range
        |
        v
Cache: check LRU for required blocks
   |
   ├── Cache HIT -> return plaintext directly
   |
   └── Cache MISS:
        |
        v
   Backend: get_block(block_id)
        |
        v
   Crypto: decrypt AES-256-GCM(FEK, nonce, ciphertext)
        |
        v
   Block Engine: decompress if compressed
        |
        v
   Cache: store plaintext block in LRU
        |
        v
   Return requested byte range to application
```

### Sync Flow (Multi-Backend)

```
Local vault modified
        |
        v
Change Journal: log block_id + operation (put/delete)
        |
        v
Sync Engine: poll journal every N seconds
        |
        v
For each remote backend:
   |
   ├── Compare block manifest (local vs remote)
   ├── Upload new/modified blocks
   ├── Download blocks present only on remote
   ├── Conflict resolution: last-writer-wins or manual
   |
   v
Update local MetadataIndex with merged state
```

## Configuration Model

```yaml
# ~/.skref/config.yml

identity:
  keyring: "~/.capauth/identity/"
  default_key: "CCBE9306410CF8CD5E393D6DEC31663B95230684"

defaults:
  block_size: 4194304          # 4MB
  compression: zstd
  compression_level: 3
  filename_encryption: true
  padding: false
  cache_size: 536870912        # 512MB LRU cache
  read_ahead_blocks: 4
  write_buffer_size: 8388608   # 8MB

vaults:
  auth-seeds:
    tier: auth
    mount: "~/Vaults/Auth"
    backend:
      type: local
      path: "~/.skref/vaults/auth-seeds/"
    recipients:
      - "CCBE9306410CF8CD5E393D6DEC31663B95230684"
    auto_mount: true
    read_only: false

  reference:
    tier: reference
    mount: "~/Vaults/Reference"
    backend:
      type: webdav
      url: "https://cloud.example.com/remote.php/dav/files/user/vaults/reference/"
      username: "${WEBDAV_USER}"
      password: "${WEBDAV_PASS}"
    recipients:
      - "CCBE9306410CF8CD5E393D6DEC31663B95230684"
      - "AABB112233445566778899AABB112233445566FF"
    sync:
      interval: 300
      conflict: last-writer-wins

  team-shared:
    tier: custom
    mount: "~/Vaults/Team"
    encrypted: false           # Unencrypted team vault
    backend:
      type: s3
      bucket: "team-vault-prod"
      region: "us-east-1"
      prefix: "shared/"

logging:
  level: info
  file: "~/.skref/logs/skref.log"
  max_size: 50MB
  rotate: 7
```

## Security Considerations

### 1. Key Management
- Private keys NEVER leave the CapAuth keyring
- File Encryption Keys (FEK) are random 256-bit AES keys, one per vault session
- FEK encrypted to each recipient's PGP public key (multi-recipient envelope)
- Key rotation: generate new FEK, re-encrypt all blocks, update envelopes
- Emergency lockout: wipe FEK envelope from backend, blocks become unreadable

### 2. Encryption Guarantees
- AES-256-GCM provides authenticated encryption (confidentiality + integrity)
- Each block gets a unique 12-byte random nonce -- no nonce reuse
- GCM authentication tag detects any tampering or corruption
- Compressed before encrypted (never compress ciphertext)
- Optional padding hides true file sizes from backend operator

### 3. Metadata Protection
- Filenames encrypted by default (XChaCha20-Poly1305 deterministic mode for lookup)
- Directory structure flattened to backend -- no hierarchy leaks
- File sizes obscured with optional block padding
- Access timestamps not persisted to backend (local-only)

### 4. Backend Trust Model
- Backends are UNTRUSTED -- they see only ciphertext blocks with opaque IDs
- Backend operator cannot determine file count, names, types, or contents
- Block deduplication within a vault (not across vaults) to prevent cross-vault inference
- Deletion from backend is advisory -- assume blocks may persist

### 5. Access Control
- Mount requires PGP private key decryption (passphrase or hardware token)
- FUSE mount runs as user process (no root required for user mounts)
- Shared vaults: recipients can read, only owner can modify recipient list
- Audit log of all mount/unmount/share operations

### 6. Threat Model
- **Compromised backend**: Attacker sees only opaque ciphertext blocks
- **Stolen device (locked vault)**: FEK protected by PGP, blocks are AES-256
- **Stolen device (mounted vault)**: Plaintext in memory cache -- mitigated by memory locking
- **Malicious peer**: Cannot access vault without being added as recipient
- **Key compromise**: Rotate FEK + re-encrypt, revoke compromised key from all vaults

## Performance Targets

| Metric | Target |
|--------|--------|
| Sequential read throughput | > 200 MB/s (local backend) |
| Sequential write throughput | > 150 MB/s (local backend) |
| Random read (4KB) latency | < 5ms (cached), < 50ms (uncached local) |
| FUSE overhead vs native FS | < 15% throughput reduction |
| Block encrypt (4MB, AES-256-GCM) | < 10ms |
| Block decrypt (4MB, AES-256-GCM) | < 8ms |
| Mount time (10K files) | < 2s |
| Metadata index load (100K files) | < 5s |
| WebDAV block fetch (4MB) | < 500ms (100Mbps link) |
| S3 block fetch (4MB) | < 300ms (same region) |
| Memory footprint (idle) | < 50MB |
| Memory footprint (512MB cache) | < 600MB |

## Extension Points

### Backend Interface

```python
from abc import ABC, abstractmethod

class VaultBackend(ABC):
    """Implement this to add a new storage backend."""

    @abstractmethod
    def put_block(self, block_id: str, data: bytes) -> bool:
        """Store a ciphertext block. Returns True on success."""

    @abstractmethod
    def get_block(self, block_id: str) -> bytes:
        """Retrieve a ciphertext block by ID."""

    @abstractmethod
    def delete_block(self, block_id: str) -> bool:
        """Delete a block. Returns True on success."""

    @abstractmethod
    def list_blocks(self) -> list[str]:
        """List all block IDs on this backend."""

    @abstractmethod
    def exists(self, block_id: str) -> bool:
        """Check if a block exists."""

    @abstractmethod
    def health_check(self) -> dict:
        """Return backend health status."""
```

### Compression Interface

```python
class Compressor(ABC):
    """Implement this to add a new compression algorithm."""

    @abstractmethod
    def compress(self, data: bytes, level: int) -> bytes:
        """Compress plaintext before encryption."""

    @abstractmethod
    def decompress(self, data: bytes) -> bytes:
        """Decompress after decryption."""

    @abstractmethod
    def name(self) -> str:
        """Algorithm identifier stored in block metadata."""
```

### FUSE Middleware

```python
class FUSEMiddleware(ABC):
    """Intercept FUSE operations for logging, auditing, or access control."""

    @abstractmethod
    def before_read(self, path: str, size: int, offset: int) -> bool:
        """Return False to deny the read operation."""

    @abstractmethod
    def after_write(self, path: str, size: int) -> None:
        """Called after successful write for audit/notification."""

    @abstractmethod
    def on_mount(self, vault_name: str, mount_point: str) -> None:
        """Called when vault is mounted."""
```

## Implementation Architecture

### Core Components

```
skref/
  __init__.py           # Package entry, version
  cli.py                # Click CLI (mount, unmount, create, share, status)
  vault.py              # Vault lifecycle (create, open, lock, unlock)
  fuse_ops.py           # pyfuse3 Operations subclass
  block_engine.py       # Split, merge, compress, pad
  crypto.py             # AES-256-GCM encrypt/decrypt, FEK management
  key_envelope.py       # Multi-recipient PGP key wrapping
  metadata.py           # MetadataIndex CRUD, encrypted persistence
  cache.py              # LRU block cache with memory locking
  sync_engine.py        # Multi-backend synchronization
  config.py             # YAML config loader with env var interpolation
  backends/
    __init__.py
    base.py             # VaultBackend ABC
    local.py            # Local filesystem backend
    webdav.py           # WebDAV (Nextcloud, ownCloud)
    s3.py               # AWS S3 / MinIO
    gdrive.py           # Google Drive API
    sftp.py             # SFTP/SCP backend
  middleware/
    __init__.py
    audit.py            # Audit log middleware
    quota.py            # Storage quota enforcement
```

### Data Structures

```
~/.skref/
  config.yml                           # Global configuration
  logs/
    skref.log                          # Runtime logs
  vaults/
    <vault-name>/
      manifest.yml                     # Vault metadata (encrypted)
      key-envelope.gpg                 # FEK encrypted to recipients
      index.enc                        # MetadataIndex (AES-256-GCM)
      blocks/
        a3f2...enc                     # Ciphertext blocks (content-addressed)
        7b1c...enc
        e9d0...enc
      journal/
        changes.log                    # Change journal for sync
```
