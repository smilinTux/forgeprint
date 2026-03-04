# Encrypted Reference Vaults (SKRef) Architecture

## System Layers

```
┌────────────────────────────────────────────────────────────────┐
│                      Application Layer                         │
│  CLI (mount/unmount/create)  │  Python API  │  systemd service │
├────────────────────────────────────────────────────────────────┤
│                      FUSE Layer (pyfuse3)                      │
│  getattr │ readdir │ open │ read │ write │ create │ unlink     │
├────────────────────────────────────────────────────────────────┤
│                      Cache Layer                               │
│  LRU block cache (plaintext)  │  Write buffer  │  Read-ahead  │
├────────────────────────────────────────────────────────────────┤
│                      Block Engine                              │
│  Split/Merge │ Compress (zstd) │ Content-address (SHA-256)     │
├────────────────────────────────────────────────────────────────┤
│                      Crypto Layer                              │
│  AES-256-GCM  │  FEK management  │  PGP key envelope          │
├────────────────────────────────────────────────────────────────┤
│                      Metadata Layer                            │
│  Encrypted index  │  File entries  │  Block chains             │
├────────────────────────────────────────────────────────────────┤
│                      Backend Layer                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Local FS │ │ WebDAV   │ │ S3/MinIO │ │ GDrive   │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
├────────────────────────────────────────────────────────────────┤
│                      Sync Engine                               │
│  Change journal  │  Incremental sync  │  Conflict resolution   │
└────────────────────────────────────────────────────────────────┘
```

## Core Architecture Patterns

### Vault Lifecycle State Machine

```
                    ┌──────────┐
                    │ CREATING │
                    └────┬─────┘
                         │ create()
                         ▼
                    ┌──────────┐
         ┌────────>│  LOCKED  │<────────┐
         │         └────┬─────┘         │
         │              │ unlock()      │ lock()
         │              ▼               │
         │         ┌──────────┐         │
         │         │ UNLOCKED │─────────┘
         │         └────┬─────┘
         │              │ mount()
         │              ▼
         │         ┌──────────┐
         │         │ MOUNTED  │──── sync() ───> SYNCING ──> MOUNTED
         │         └────┬─────┘
         │              │ unmount()
         │              ▼
         │         ┌──────────┐
         └─────────│ UNLOCKED │
                   └──────────┘

Error from any state → ERROR → manual intervention → LOCKED
```

### FUSE Operations Implementation

```python
import pyfuse3
import os
import errno
import stat
from typing import Optional

from skref.vault import Vault
from skref.block_engine import BlockEngine
from skref.cache import BlockCache
from skref.metadata import MetadataIndex, FileEntry


class SKRefOperations(pyfuse3.Operations):
    """FUSE filesystem operations for encrypted vault access."""

    def __init__(self, vault: Vault):
        super().__init__()
        self.vault = vault
        self.block_engine = BlockEngine(vault)
        self.cache = BlockCache(
            max_size=vault.config.cache_size,
            memory_lock=vault.config.memory_locking,
        )
        self.metadata = MetadataIndex(vault)
        self._open_files: dict[int, FileHandle] = {}
        self._next_fh = 1
        self._inode_map: dict[int, str] = {pyfuse3.ROOT_INODE: "/"}
        self._path_inode: dict[str, int] = {"/": pyfuse3.ROOT_INODE}
        self._next_inode = pyfuse3.ROOT_INODE + 1

    def _path_to_inode(self, path: str) -> int:
        """Get or assign inode number for a path."""
        if path not in self._path_inode:
            inode = self._next_inode
            self._next_inode += 1
            self._path_inode[path] = inode
            self._inode_map[inode] = path
        return self._path_inode[path]

    def _inode_to_path(self, inode: int) -> str:
        """Resolve inode to plaintext path."""
        if inode not in self._inode_map:
            raise pyfuse3.FUSEError(errno.ENOENT)
        return self._inode_map[inode]

    async def getattr(self, inode: int, ctx=None) -> pyfuse3.EntryAttributes:
        """Get file/directory attributes."""
        path = self._inode_to_path(inode)
        entry = self.metadata.get(path)

        attrs = pyfuse3.EntryAttributes()
        attrs.st_ino = inode

        if entry is None and path == "/":
            # Root directory
            attrs.st_mode = stat.S_IFDIR | 0o755
            attrs.st_nlink = 2
            attrs.st_size = 0
        elif entry is None:
            raise pyfuse3.FUSEError(errno.ENOENT)
        elif entry.is_directory:
            attrs.st_mode = stat.S_IFDIR | entry.permissions
            attrs.st_nlink = 2
            attrs.st_size = 0
        else:
            attrs.st_mode = stat.S_IFREG | entry.permissions
            attrs.st_nlink = 1
            attrs.st_size = entry.size

        attrs.st_uid = os.getuid()
        attrs.st_gid = os.getgid()
        return attrs

    async def readdir(self, inode: int, off: int, token) -> None:
        """List directory contents."""
        path = self._inode_to_path(inode)
        entries = self.metadata.list_directory(path)

        for i, (name, entry) in enumerate(entries[off:], start=off):
            child_path = os.path.join(path, name)
            child_inode = self._path_to_inode(child_path)
            if not pyfuse3.readdir_reply(
                token, name.encode(), await self.getattr(child_inode), i + 1
            ):
                break

    async def open(self, inode: int, flags: int, ctx) -> pyfuse3.FileInfo:
        """Open a file and return file handle."""
        path = self._inode_to_path(inode)
        entry = self.metadata.get(path)

        if entry is None:
            raise pyfuse3.FUSEError(errno.ENOENT)

        fh = self._next_fh
        self._next_fh += 1
        self._open_files[fh] = FileHandle(
            path=path,
            entry=entry,
            flags=flags,
            write_buffer=bytearray(),
        )

        info = pyfuse3.FileInfo()
        info.fh = fh
        return info

    async def read(self, fh: int, offset: int, size: int) -> bytes:
        """Read data from an open file, decrypting blocks on the fly."""
        handle = self._open_files.get(fh)
        if handle is None:
            raise pyfuse3.FUSEError(errno.EBADF)

        entry = handle.entry
        if offset >= entry.size:
            return b""

        # Calculate which blocks we need
        block_size = self.vault.config.block_size
        start_block = offset // block_size
        end_block = (offset + size - 1) // block_size + 1

        result = bytearray()
        for block_idx in range(start_block, min(end_block, len(entry.blocks))):
            block_id = entry.blocks[block_idx]

            # Check cache first
            plaintext = self.cache.get(block_id)
            if plaintext is None:
                # Cache miss: fetch from backend and decrypt
                ciphertext = self.vault.backend.get_block(block_id)
                plaintext = self.block_engine.decrypt_block(ciphertext)
                self.cache.put(block_id, plaintext)

                # Read-ahead: prefetch next blocks
                self._prefetch(entry.blocks, block_idx + 1)

            result.extend(plaintext)

        # Slice to exact requested range
        block_offset = offset % block_size
        return bytes(result[block_offset : block_offset + size])

    async def write(self, fh: int, offset: int, data: bytes) -> int:
        """Write data to an open file, buffering until block-aligned."""
        handle = self._open_files.get(fh)
        if handle is None:
            raise pyfuse3.FUSEError(errno.EBADF)

        handle.write_buffer.extend(data)
        handle.dirty = True

        # Flush complete blocks
        block_size = self.vault.config.block_size
        while len(handle.write_buffer) >= block_size:
            chunk = bytes(handle.write_buffer[:block_size])
            handle.write_buffer = handle.write_buffer[block_size:]
            self._write_block(handle, chunk, offset)
            offset += block_size

        return len(data)

    async def create(
        self, parent_inode: int, name: bytes, mode: int, flags: int, ctx
    ) -> tuple[pyfuse3.FileInfo, pyfuse3.EntryAttributes]:
        """Create a new file."""
        parent_path = self._inode_to_path(parent_inode)
        path = os.path.join(parent_path, name.decode())

        entry = self.metadata.create_file(path, mode)
        inode = self._path_to_inode(path)

        fh = self._next_fh
        self._next_fh += 1
        self._open_files[fh] = FileHandle(
            path=path, entry=entry, flags=flags, write_buffer=bytearray()
        )

        info = pyfuse3.FileInfo()
        info.fh = fh
        attrs = await self.getattr(inode)
        return info, attrs

    async def unlink(self, parent_inode: int, name: bytes, ctx) -> None:
        """Delete a file and mark its blocks for garbage collection."""
        parent_path = self._inode_to_path(parent_inode)
        path = os.path.join(parent_path, name.decode())

        entry = self.metadata.get(path)
        if entry is None:
            raise pyfuse3.FUSEError(errno.ENOENT)

        # Mark blocks for GC (other files may reference same blocks)
        for block_id in entry.blocks:
            self.block_engine.mark_for_gc(block_id)

        self.metadata.delete(path)
        self.cache.invalidate_entry(entry)

    async def fsync(self, fh: int, datasync: bool) -> None:
        """Flush write buffers and persist to backend."""
        handle = self._open_files.get(fh)
        if handle and handle.dirty:
            self._flush_write_buffer(handle)
            self.metadata.persist()

    def _write_block(self, handle: "FileHandle", data: bytes, offset: int) -> None:
        """Compress, encrypt, and store a single block."""
        compressed = self.block_engine.compress(data)
        block_id, ciphertext = self.block_engine.encrypt_block(compressed)
        self.vault.backend.put_block(block_id, ciphertext)
        handle.entry.append_block(block_id, len(data))
        self.cache.put(block_id, data)

    def _flush_write_buffer(self, handle: "FileHandle") -> None:
        """Flush remaining write buffer as a partial block."""
        if handle.write_buffer:
            self._write_block(handle, bytes(handle.write_buffer), 0)
            handle.write_buffer.clear()
            handle.dirty = False

    def _prefetch(self, blocks: list[str], start: int) -> None:
        """Prefetch upcoming blocks into cache."""
        prefetch_count = self.vault.config.read_ahead_blocks
        for i in range(start, min(start + prefetch_count, len(blocks))):
            block_id = blocks[i]
            if not self.cache.contains(block_id):
                try:
                    ciphertext = self.vault.backend.get_block(block_id)
                    plaintext = self.block_engine.decrypt_block(ciphertext)
                    self.cache.put(block_id, plaintext)
                except Exception:
                    break  # Stop prefetching on error


class FileHandle:
    """In-memory state for an open file."""

    def __init__(self, path: str, entry: FileEntry, flags: int,
                 write_buffer: bytearray):
        self.path = path
        self.entry = entry
        self.flags = flags
        self.write_buffer = write_buffer
        self.dirty = False
```

### Block Engine with Encryption

```python
import hashlib
import os
from dataclasses import dataclass

import zstandard as zstd
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@dataclass
class BlockHeader:
    """Metadata prepended to each encrypted block."""
    version: int = 1
    compressed: bool = True
    original_size: int = 0
    nonce: bytes = b""
    tag_offset: int = 0


class BlockEngine:
    """Split files into blocks, compress, encrypt, and content-address."""

    NONCE_SIZE = 12         # GCM standard nonce
    TAG_SIZE = 16           # GCM authentication tag
    HEADER_SIZE = 32        # Fixed header size

    def __init__(self, vault: "Vault"):
        self.vault = vault
        self.block_size = vault.config.block_size
        self.compressor = zstd.ZstdCompressor(
            level=vault.config.compression_level
        )
        self.decompressor = zstd.ZstdDecompressor()
        self._fek: bytes | None = None
        self._gc_queue: list[str] = []

    @property
    def fek(self) -> bytes:
        """File Encryption Key -- loaded lazily from key envelope."""
        if self._fek is None:
            self._fek = self.vault.key_envelope.decrypt_fek(
                self.vault.identity.private_key
            )
        return self._fek

    def content_address(self, plaintext: bytes) -> str:
        """Compute content-addressed block ID from plaintext."""
        # Salt with vault ID to prevent cross-vault block matching
        salted = self.vault.vault_id.encode() + plaintext
        return hashlib.sha256(salted).hexdigest()

    def compress(self, data: bytes) -> bytes:
        """Compress data with zstd."""
        return self.compressor.compress(data)

    def decompress(self, data: bytes) -> bytes:
        """Decompress zstd data."""
        return self.decompressor.decompress(data)

    def encrypt_block(self, plaintext: bytes) -> tuple[str, bytes]:
        """
        Encrypt a block with AES-256-GCM.

        Returns:
            (block_id, ciphertext_with_header)
        """
        block_id = self.content_address(plaintext)

        # Generate unique nonce per block
        nonce = os.urandom(self.NONCE_SIZE)

        # Encrypt
        aesgcm = AESGCM(self.fek)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        # ciphertext includes GCM tag appended by cryptography library

        # Build header
        header = BlockHeader(
            version=1,
            compressed=True,
            original_size=len(plaintext),
            nonce=nonce,
        )

        # Serialize: header_bytes + ciphertext
        header_bytes = self._serialize_header(header)
        return block_id, header_bytes + ciphertext

    def decrypt_block(self, data: bytes) -> bytes:
        """
        Decrypt a block from ciphertext with header.

        Returns:
            Decompressed plaintext
        """
        # Parse header
        header = self._parse_header(data[:self.HEADER_SIZE])
        ciphertext = data[self.HEADER_SIZE:]

        # Decrypt
        aesgcm = AESGCM(self.fek)
        plaintext = aesgcm.decrypt(header.nonce, ciphertext, None)

        # Decompress if needed
        if header.compressed:
            plaintext = self.decompress(plaintext)

        return plaintext

    def split_file(self, data: bytes) -> list[bytes]:
        """Split file data into block-sized chunks."""
        chunks = []
        for i in range(0, len(data), self.block_size):
            chunks.append(data[i : i + self.block_size])
        return chunks

    def mark_for_gc(self, block_id: str) -> None:
        """Mark a block for garbage collection."""
        self._gc_queue.append(block_id)

    def run_gc(self) -> int:
        """
        Remove orphaned blocks.
        Returns number of blocks reclaimed.
        """
        # Check which blocks are still referenced
        referenced = self.vault.metadata.all_referenced_blocks()
        reclaimed = 0
        for block_id in self._gc_queue:
            if block_id not in referenced:
                self.vault.backend.delete_block(block_id)
                reclaimed += 1
        self._gc_queue.clear()
        return reclaimed

    def _serialize_header(self, header: BlockHeader) -> bytes:
        """Serialize block header to fixed-size bytes."""
        buf = bytearray(self.HEADER_SIZE)
        buf[0] = header.version
        buf[1] = 1 if header.compressed else 0
        buf[2:6] = header.original_size.to_bytes(4, "big")
        buf[6:18] = header.nonce
        # Remaining bytes reserved for future use
        return bytes(buf)

    def _parse_header(self, data: bytes) -> BlockHeader:
        """Parse block header from bytes."""
        return BlockHeader(
            version=data[0],
            compressed=bool(data[1]),
            original_size=int.from_bytes(data[2:6], "big"),
            nonce=data[6:18],
        )
```

### Multi-Recipient Key Envelope

```python
from dataclasses import dataclass, field

import pgpy
from pgpy.constants import (
    PubKeyAlgorithm,
    SymmetricKeyAlgorithm,
)


@dataclass
class RecipientEntry:
    """FEK encrypted to a single recipient."""
    fingerprint: str
    encrypted_fek: bytes  # PGP-encrypted FEK


@dataclass
class KeyEnvelope:
    """
    Wraps the File Encryption Key (FEK) for multiple PGP recipients.
    Each recipient can independently decrypt the FEK using their private key.
    """
    vault_id: str
    version: int = 1
    recipients: list[RecipientEntry] = field(default_factory=list)
    _fek_cache: bytes | None = field(default=None, repr=False)

    @classmethod
    def create(cls, vault_id: str, fek: bytes,
               public_keys: list[pgpy.PGPKey]) -> "KeyEnvelope":
        """
        Create a new key envelope encrypting FEK to all recipients.

        Args:
            vault_id: Vault identifier
            fek: 32-byte AES-256 file encryption key
            public_keys: List of recipient PGP public keys
        """
        envelope = cls(vault_id=vault_id)
        for pubkey in public_keys:
            encrypted = cls._encrypt_fek_to_key(fek, pubkey)
            envelope.recipients.append(
                RecipientEntry(
                    fingerprint=str(pubkey.fingerprint),
                    encrypted_fek=bytes(encrypted),
                )
            )
        return envelope

    def decrypt_fek(self, private_key: pgpy.PGPKey) -> bytes:
        """
        Decrypt the FEK using a recipient's private key.

        Raises:
            PermissionError: If the private key is not a vault recipient.
            ValueError: If decryption fails.
        """
        if self._fek_cache is not None:
            return self._fek_cache

        fingerprint = str(private_key.fingerprint)
        for recipient in self.recipients:
            if recipient.fingerprint == fingerprint:
                fek = self._decrypt_fek_from_entry(
                    recipient.encrypted_fek, private_key
                )
                self._fek_cache = fek
                return fek

        raise PermissionError(
            f"Key {fingerprint} is not a recipient of vault {self.vault_id}"
        )

    def add_recipient(self, fek: bytes, public_key: pgpy.PGPKey) -> None:
        """Add a new recipient to the envelope."""
        fingerprint = str(public_key.fingerprint)
        # Prevent duplicates
        for r in self.recipients:
            if r.fingerprint == fingerprint:
                return

        encrypted = self._encrypt_fek_to_key(fek, public_key)
        self.recipients.append(
            RecipientEntry(fingerprint=fingerprint, encrypted_fek=bytes(encrypted))
        )

    def remove_recipient(self, fingerprint: str) -> bool:
        """
        Remove a recipient from the envelope.
        WARNING: This does NOT rotate the FEK. Call rotate_fek() after removal.
        """
        before = len(self.recipients)
        self.recipients = [
            r for r in self.recipients if r.fingerprint != fingerprint
        ]
        return len(self.recipients) < before

    def rotate_fek(self, new_fek: bytes,
                   public_keys: list[pgpy.PGPKey]) -> "KeyEnvelope":
        """
        Rotate the FEK by creating a new envelope with the new key.
        All blocks must be re-encrypted with the new FEK externally.
        """
        return KeyEnvelope.create(self.vault_id, new_fek, public_keys)

    @staticmethod
    def _encrypt_fek_to_key(fek: bytes, public_key: pgpy.PGPKey) -> bytes:
        """Encrypt FEK to a single PGP public key."""
        message = pgpy.PGPMessage.new(fek, encoding=None)
        encrypted = public_key.encrypt(message)
        return bytes(encrypted)

    @staticmethod
    def _decrypt_fek_from_entry(encrypted: bytes,
                                 private_key: pgpy.PGPKey) -> bytes:
        """Decrypt FEK from a PGP-encrypted blob."""
        message = pgpy.PGPMessage.from_blob(encrypted)
        decrypted = private_key.decrypt(message)
        return decrypted.message

    def serialize(self) -> bytes:
        """Serialize envelope to bytes for storage."""
        import json
        data = {
            "vault_id": self.vault_id,
            "version": self.version,
            "recipients": [
                {
                    "fingerprint": r.fingerprint,
                    "encrypted_fek": r.encrypted_fek.hex(),
                }
                for r in self.recipients
            ],
        }
        return json.dumps(data).encode()

    @classmethod
    def deserialize(cls, data: bytes) -> "KeyEnvelope":
        """Deserialize envelope from bytes."""
        import json
        d = json.loads(data)
        envelope = cls(vault_id=d["vault_id"], version=d["version"])
        for r in d["recipients"]:
            envelope.recipients.append(
                RecipientEntry(
                    fingerprint=r["fingerprint"],
                    encrypted_fek=bytes.fromhex(r["encrypted_fek"]),
                )
            )
        return envelope
```

### LRU Block Cache with Memory Locking

```python
import ctypes
import ctypes.util
from collections import OrderedDict
from dataclasses import dataclass


# libc mlock for preventing swap
_libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)


@dataclass
class CacheEntry:
    """Cached plaintext block with usage tracking."""
    block_id: str
    data: bytes
    size: int
    access_count: int = 0
    locked: bool = False


class BlockCache:
    """
    LRU cache for decrypted plaintext blocks.
    Optionally locks pages in memory to prevent swap-to-disk.
    """

    def __init__(self, max_size: int = 512 * 1024 * 1024,
                 memory_lock: bool = True):
        self.max_size = max_size
        self.memory_lock = memory_lock
        self.current_size = 0
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._stats = {"hits": 0, "misses": 0, "evictions": 0}

    def get(self, block_id: str) -> bytes | None:
        """Get a block from cache. Returns None on miss."""
        if block_id in self._cache:
            self._stats["hits"] += 1
            entry = self._cache[block_id]
            entry.access_count += 1
            self._cache.move_to_end(block_id)
            return entry.data
        self._stats["misses"] += 1
        return None

    def put(self, block_id: str, data: bytes) -> None:
        """Store a plaintext block in cache, evicting LRU if needed."""
        if block_id in self._cache:
            # Update existing
            old_entry = self._cache[block_id]
            self.current_size -= old_entry.size
            self._unlock_memory(old_entry)

        # Evict until we have room
        while self.current_size + len(data) > self.max_size and self._cache:
            self._evict_lru()

        entry = CacheEntry(
            block_id=block_id,
            data=data,
            size=len(data),
        )

        if self.memory_lock:
            self._lock_memory(entry)

        self._cache[block_id] = entry
        self._cache.move_to_end(block_id)
        self.current_size += entry.size

    def contains(self, block_id: str) -> bool:
        """Check if block is in cache without updating LRU order."""
        return block_id in self._cache

    def invalidate(self, block_id: str) -> None:
        """Remove a specific block from cache."""
        if block_id in self._cache:
            entry = self._cache.pop(block_id)
            self.current_size -= entry.size
            self._unlock_memory(entry)

    def invalidate_entry(self, file_entry: "FileEntry") -> None:
        """Remove all blocks belonging to a file entry."""
        for block_id in file_entry.blocks:
            self.invalidate(block_id)

    def clear(self) -> None:
        """Clear entire cache, unlocking all memory."""
        for entry in self._cache.values():
            self._unlock_memory(entry)
        self._cache.clear()
        self.current_size = 0

    @property
    def hit_rate(self) -> float:
        """Cache hit rate as a percentage."""
        total = self._stats["hits"] + self._stats["misses"]
        return (self._stats["hits"] / total * 100) if total > 0 else 0.0

    @property
    def stats(self) -> dict:
        """Return cache statistics."""
        return {
            **self._stats,
            "entries": len(self._cache),
            "size_bytes": self.current_size,
            "max_size_bytes": self.max_size,
            "utilization": self.current_size / self.max_size * 100,
            "hit_rate": self.hit_rate,
        }

    def _evict_lru(self) -> None:
        """Evict the least recently used entry."""
        if not self._cache:
            return
        block_id, entry = self._cache.popitem(last=False)
        self.current_size -= entry.size
        self._unlock_memory(entry)
        self._stats["evictions"] += 1

    def _lock_memory(self, entry: CacheEntry) -> None:
        """Lock memory pages to prevent swapping."""
        if not self.memory_lock:
            return
        try:
            buf = ctypes.c_char_p(entry.data)
            result = _libc.mlock(buf, len(entry.data))
            if result == 0:
                entry.locked = True
        except Exception:
            pass  # Best-effort, non-fatal

    def _unlock_memory(self, entry: CacheEntry) -> None:
        """Unlock previously locked memory pages."""
        if not entry.locked:
            return
        try:
            buf = ctypes.c_char_p(entry.data)
            _libc.munlock(buf, len(entry.data))
            entry.locked = False
        except Exception:
            pass
```

### Backend Abstraction

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass
class BackendHealth:
    """Health status of a storage backend."""
    healthy: bool
    latency_ms: float
    storage_used: int
    storage_available: int
    error: str | None = None


class VaultBackend(ABC):
    """Abstract base class for vault storage backends."""

    @abstractmethod
    def put_block(self, block_id: str, data: bytes) -> bool:
        """Store a ciphertext block. Returns True on success."""

    @abstractmethod
    def get_block(self, block_id: str) -> bytes:
        """Retrieve a ciphertext block by ID. Raises FileNotFoundError."""

    @abstractmethod
    def delete_block(self, block_id: str) -> bool:
        """Delete a block. Returns True if deleted."""

    @abstractmethod
    def list_blocks(self) -> list[str]:
        """List all block IDs on this backend."""

    @abstractmethod
    def exists(self, block_id: str) -> bool:
        """Check if a block exists."""

    @abstractmethod
    def health_check(self) -> BackendHealth:
        """Return backend health status."""


class LocalBackend(VaultBackend):
    """Local filesystem storage backend."""

    def __init__(self, path: str):
        self.root = Path(path)
        self.root.mkdir(parents=True, exist_ok=True)

    def _block_path(self, block_id: str) -> Path:
        """Content-addressed path with 2-level directory sharding."""
        return self.root / block_id[:2] / block_id[2:4] / f"{block_id}.enc"

    def put_block(self, block_id: str, data: bytes) -> bool:
        path = self._block_path(block_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return True

    def get_block(self, block_id: str) -> bytes:
        path = self._block_path(block_id)
        if not path.exists():
            raise FileNotFoundError(f"Block {block_id} not found")
        return path.read_bytes()

    def delete_block(self, block_id: str) -> bool:
        path = self._block_path(block_id)
        if path.exists():
            path.unlink()
            return True
        return False

    def list_blocks(self) -> list[str]:
        blocks = []
        for enc_file in self.root.rglob("*.enc"):
            blocks.append(enc_file.stem)
        return blocks

    def exists(self, block_id: str) -> bool:
        return self._block_path(block_id).exists()

    def health_check(self) -> BackendHealth:
        import time
        import shutil
        start = time.monotonic()
        test_data = b"health_check"
        self.put_block("__health__", test_data)
        self.delete_block("__health__")
        latency = (time.monotonic() - start) * 1000

        usage = shutil.disk_usage(self.root)
        return BackendHealth(
            healthy=True,
            latency_ms=latency,
            storage_used=usage.used,
            storage_available=usage.free,
        )


class WebDAVBackend(VaultBackend):
    """WebDAV storage backend for Nextcloud/ownCloud."""

    def __init__(self, url: str, username: str, password: str):
        from webdav3.client import Client
        self.client = Client({
            "webdav_hostname": url,
            "webdav_login": username,
            "webdav_password": password,
        })
        self.prefix = "blocks/"

    def put_block(self, block_id: str, data: bytes) -> bool:
        import io
        remote_path = f"{self.prefix}{block_id[:2]}/{block_id}.enc"
        self.client.mkdir(f"{self.prefix}{block_id[:2]}")
        self.client.upload_to(io.BytesIO(data), remote_path)
        return True

    def get_block(self, block_id: str) -> bytes:
        import io
        remote_path = f"{self.prefix}{block_id[:2]}/{block_id}.enc"
        buffer = io.BytesIO()
        self.client.download_from(buffer, remote_path)
        return buffer.getvalue()

    def delete_block(self, block_id: str) -> bool:
        remote_path = f"{self.prefix}{block_id[:2]}/{block_id}.enc"
        try:
            self.client.clean(remote_path)
            return True
        except Exception:
            return False

    def list_blocks(self) -> list[str]:
        blocks = []
        for item in self.client.list(self.prefix, get_info=True):
            if item["path"].endswith(".enc"):
                name = item["path"].rsplit("/", 1)[-1]
                blocks.append(name.replace(".enc", ""))
        return blocks

    def exists(self, block_id: str) -> bool:
        remote_path = f"{self.prefix}{block_id[:2]}/{block_id}.enc"
        return self.client.check(remote_path)

    def health_check(self) -> BackendHealth:
        import time
        start = time.monotonic()
        try:
            self.client.list(self.prefix)
            latency = (time.monotonic() - start) * 1000
            return BackendHealth(healthy=True, latency_ms=latency,
                                 storage_used=0, storage_available=0)
        except Exception as e:
            return BackendHealth(healthy=False, latency_ms=0,
                                 storage_used=0, storage_available=0,
                                 error=str(e))
```

### Sync Engine

```python
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class SyncOp(str, Enum):
    PUT = "put"
    DELETE = "delete"


@dataclass
class ChangeEntry:
    """A single change in the vault change journal."""
    timestamp: float
    block_id: str
    operation: SyncOp
    synced_to: list[str] = field(default_factory=list)


class ConflictStrategy(str, Enum):
    LAST_WRITER_WINS = "last-writer-wins"
    MANUAL = "manual"
    LOCAL_WINS = "local-wins"
    REMOTE_WINS = "remote-wins"


class SyncEngine:
    """
    Synchronize vault blocks between local and remote backends.
    Uses a change journal for incremental sync.
    """

    def __init__(self, vault: "Vault", strategy: ConflictStrategy):
        self.vault = vault
        self.strategy = strategy
        self.journal_path = Path(vault.path) / "journal" / "changes.log"
        self.journal_path.parent.mkdir(parents=True, exist_ok=True)
        self._journal: list[ChangeEntry] = self._load_journal()

    def record_change(self, block_id: str, op: SyncOp) -> None:
        """Record a block change in the journal."""
        entry = ChangeEntry(
            timestamp=time.time(),
            block_id=block_id,
            operation=op,
        )
        self._journal.append(entry)
        self._persist_entry(entry)

    def sync(self, remote_backend: "VaultBackend") -> "SyncResult":
        """
        Perform incremental sync with a remote backend.

        Returns sync result with counts and conflicts.
        """
        backend_name = type(remote_backend).__name__

        # Get unsynchronized changes
        pending = [
            e for e in self._journal
            if backend_name not in e.synced_to
        ]

        # Get remote block manifest
        remote_blocks = set(remote_backend.list_blocks())
        local_blocks = set(self.vault.backend.list_blocks())

        uploaded = 0
        downloaded = 0
        conflicts = []

        # Upload local changes
        for entry in pending:
            if entry.operation == SyncOp.PUT:
                if entry.block_id in remote_blocks:
                    # Conflict: block exists on both sides
                    resolution = self._resolve_conflict(
                        entry.block_id, remote_backend
                    )
                    conflicts.append(resolution)
                else:
                    data = self.vault.backend.get_block(entry.block_id)
                    remote_backend.put_block(entry.block_id, data)
                    uploaded += 1

            elif entry.operation == SyncOp.DELETE:
                if entry.block_id in remote_blocks:
                    remote_backend.delete_block(entry.block_id)

            entry.synced_to.append(backend_name)

        # Download remote-only blocks
        remote_only = remote_blocks - local_blocks
        for block_id in remote_only:
            data = remote_backend.get_block(block_id)
            self.vault.backend.put_block(block_id, data)
            downloaded += 1

        # Persist journal updates
        self._save_journal()

        return SyncResult(
            uploaded=uploaded,
            downloaded=downloaded,
            conflicts=len(conflicts),
            backend=backend_name,
        )

    def _resolve_conflict(self, block_id: str,
                          remote: "VaultBackend") -> "ConflictResolution":
        """Resolve a block conflict based on configured strategy."""
        if self.strategy == ConflictStrategy.LAST_WRITER_WINS:
            # Compare timestamps (local journal vs remote metadata)
            # Default to local if we can't determine remote time
            local_data = self.vault.backend.get_block(block_id)
            remote.put_block(block_id, local_data)
            return ConflictResolution(block_id, "local_wins", "lww")

        elif self.strategy == ConflictStrategy.LOCAL_WINS:
            local_data = self.vault.backend.get_block(block_id)
            remote.put_block(block_id, local_data)
            return ConflictResolution(block_id, "local_wins", "policy")

        elif self.strategy == ConflictStrategy.REMOTE_WINS:
            remote_data = remote.get_block(block_id)
            self.vault.backend.put_block(block_id, remote_data)
            return ConflictResolution(block_id, "remote_wins", "policy")

        else:
            # Manual: save both versions, flag for user
            return ConflictResolution(block_id, "manual_required", "flagged")

    def _load_journal(self) -> list[ChangeEntry]:
        """Load change journal from disk."""
        if not self.journal_path.exists():
            return []
        entries = []
        for line in self.journal_path.read_text().strip().split("\n"):
            if line:
                d = json.loads(line)
                entries.append(ChangeEntry(**d))
        return entries

    def _persist_entry(self, entry: ChangeEntry) -> None:
        """Append a single entry to the journal file."""
        with open(self.journal_path, "a") as f:
            f.write(json.dumps({
                "timestamp": entry.timestamp,
                "block_id": entry.block_id,
                "operation": entry.operation.value,
                "synced_to": entry.synced_to,
            }) + "\n")

    def _save_journal(self) -> None:
        """Rewrite full journal (after updating synced_to fields)."""
        with open(self.journal_path, "w") as f:
            for entry in self._journal:
                f.write(json.dumps({
                    "timestamp": entry.timestamp,
                    "block_id": entry.block_id,
                    "operation": entry.operation.value,
                    "synced_to": entry.synced_to,
                }) + "\n")


@dataclass
class SyncResult:
    uploaded: int
    downloaded: int
    conflicts: int
    backend: str


@dataclass
class ConflictResolution:
    block_id: str
    winner: str
    reason: str
```

## Performance Optimization Strategies

### Block-Level Parallelism

```python
from concurrent.futures import ThreadPoolExecutor, as_completed


def parallel_encrypt_blocks(
    block_engine: BlockEngine,
    chunks: list[bytes],
    max_workers: int = 4,
) -> list[tuple[str, bytes]]:
    """Encrypt multiple blocks in parallel."""
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(block_engine.encrypt_block, chunk): i
            for i, chunk in enumerate(chunks)
        }
        for future in as_completed(futures):
            idx = futures[future]
            block_id, ciphertext = future.result()
            results.append((idx, block_id, ciphertext))

    # Sort by original order
    results.sort(key=lambda x: x[0])
    return [(r[1], r[2]) for r in results]
```

### Adaptive Read-Ahead

```
Sequential access pattern detected:
  read(offset=0, size=4096)
  read(offset=4096, size=4096)
  read(offset=8192, size=4096)
  → Pattern: sequential → increase prefetch to 8 blocks

Random access pattern detected:
  read(offset=1048576, size=4096)
  read(offset=0, size=4096)
  read(offset=524288, size=4096)
  → Pattern: random → disable prefetch (waste of bandwidth)
```

## Deployment Patterns

### Standalone Mount

```bash
# Create vault
skref create medical-records --tier reference \
    --backend local --path ~/.skref/vaults/medical/ \
    --key CCBE9306410CF8CD5E393D6DEC31663B95230684

# Mount
skref mount medical-records ~/Vaults/Medical

# Use normally
cp scan.pdf ~/Vaults/Medical/
ls ~/Vaults/Medical/

# Unmount
skref unmount medical-records
```

### Systemd Auto-Mount

```ini
# ~/.config/systemd/user/skref-medical.service
[Unit]
Description=SKRef Medical Records Vault
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/skref mount medical-records %h/Vaults/Medical --foreground
ExecStop=/usr/bin/skref unmount medical-records
Restart=on-failure

[Install]
WantedBy=default.target
```

### Multi-Backend Mirror

```yaml
# Config for mirrored vault
vaults:
  critical-docs:
    tier: auth
    mount: "~/Vaults/Critical"
    backend:
      primary:
        type: local
        path: "~/.skref/vaults/critical/"
      mirrors:
        - type: webdav
          url: "https://cloud.example.com/dav/"
        - type: s3
          bucket: "backup-critical"
    sync:
      interval: 60
      conflict: local-wins
```

## Security Architecture

### Threat Model Summary

```
┌─────────────────────────────────────────────────────────────┐
│ Threat                  │ Mitigation                        │
├─────────────────────────┼───────────────────────────────────┤
│ Backend compromise      │ AES-256-GCM, encrypted filenames  │
│ Memory dump             │ mlock cache, clear on unmount     │
│ Block correlation       │ Per-vault salt in content address  │
│ File size inference     │ Optional block padding            │
│ Directory enumeration   │ Flattened backend layout          │
│ Unauthorized access     │ PGP key required for FEK          │
│ Key compromise          │ FEK rotation, recipient removal   │
│ Replay / tampering      │ GCM auth tags per block           │
│ Deleted file recovery   │ Secure delete (overwrite) option  │
└─────────────────────────┴───────────────────────────────────┘
```
