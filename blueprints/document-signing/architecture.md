# Sovereign Document Signing (SKSeal) Architecture

## System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                        Interface Layer                             │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐              │
│  │  CLI App    │  │  FastAPI     │  │  Python    │              │
│  │  click+rich │  │  REST API   │  │  SDK       │              │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘              │
├─────────┴────────────────┴────────────────┴──────────────────────┤
│                        Service Layer                              │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐             │
│  │  Signing    │  │  Document   │  │  Template    │             │
│  │  Service    │  │  Manager    │  │  Engine      │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘             │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴───────┐             │
│  │  Audit      │  │  Verify     │  │  Export      │             │
│  │  Service    │  │  Service    │  │  Service     │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘             │
├─────────┴────────────────┴────────────────┴──────────────────────┤
│                        Security Layer                             │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐            │
│  │  PGP Engine  │  │  CapAuth     │  │  Hash       │            │
│  │  (pgpy)      │  │  Gate        │  │  Engine     │            │
│  └──────────────┘  └──────────────┘  └─────────────┘            │
├──────────────────────────────────────────────────────────────────┤
│                        Storage Layer                              │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐            │
│  │  Document    │  │  Audit       │  │  Template   │            │
│  │  Store       │  │  Store       │  │  Store      │            │
│  │  (files+DB)  │  │  (.jsonl)    │  │  (YAML)     │            │
│  └──────────────┘  └──────────────┘  └─────────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

## Core Architecture Patterns

### PGP Signing Engine

The signing engine wraps pgpy to provide a clean interface for detached signature operations. It never stores private keys -- all key access is delegated to CapAuth's keyring.

```python
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import pgpy
from pgpy.constants import HashAlgorithm as PGPHash


@dataclass(frozen=True)
class SignatureResult:
    """Immutable result of a signing operation."""
    signature_id: str
    document_hash: str
    hash_algorithm: str
    fingerprint: str
    timestamp: str
    signature_data: str  # Base64-encoded detached signature
    success: bool
    error: Optional[str] = None


@dataclass(frozen=True)
class VerificationResult:
    """Immutable result of a verification operation."""
    valid: bool
    document_hash: str
    signer_fingerprint: Optional[str] = None
    signer_handle: Optional[str] = None
    signed_at: Optional[str] = None
    trust_level: Optional[str] = None
    reason: Optional[str] = None


class HashEngine:
    """Multi-algorithm document hashing."""

    ALGORITHMS = {
        "sha256": hashlib.sha256,
        "sha512": hashlib.sha512,
        "sha3-256": hashlib.sha3_256,
    }

    PGP_HASH_MAP = {
        "sha256": PGPHash.SHA256,
        "sha512": PGPHash.SHA512,
        "sha3-256": PGPHash.SHA256,  # pgpy fallback
    }

    def __init__(self, algorithm: str = "sha256"):
        if algorithm not in self.ALGORITHMS:
            raise ValueError(f"Unsupported algorithm: {algorithm}")
        self.algorithm = algorithm
        self._hasher = self.ALGORITHMS[algorithm]

    def digest(self, data: bytes) -> str:
        """Compute hex digest of raw bytes."""
        return self._hasher(data).hexdigest()

    def digest_file(self, path: Path) -> str:
        """Compute hex digest of a file, streaming for large files."""
        h = self._hasher()
        with open(path, "rb") as f:
            while chunk := f.read(8192):
                h.update(chunk)
        return h.hexdigest()

    def verify(self, data: bytes, expected: str) -> bool:
        """Verify data matches expected digest."""
        return self.digest(data) == expected

    @property
    def pgp_hash(self) -> PGPHash:
        return self.PGP_HASH_MAP[self.algorithm]


class PGPSigningEngine:
    """Detached PGP signature creation and verification."""

    def __init__(
        self,
        keyring_path: Path,
        hash_engine: HashEngine,
    ):
        self.keyring_path = keyring_path
        self.hash_engine = hash_engine
        self._key_cache: dict[str, pgpy.PGPKey] = {}

    def _load_private_key(self, fingerprint: str) -> pgpy.PGPKey:
        """Load a private key from the CapAuth keyring."""
        if fingerprint in self._key_cache:
            return self._key_cache[fingerprint]

        key_path = self.keyring_path / f"{fingerprint}.sec.asc"
        if not key_path.exists():
            raise FileNotFoundError(
                f"Private key {fingerprint} not found in keyring"
            )

        key, _ = pgpy.PGPKey.from_file(str(key_path))
        self._key_cache[fingerprint] = key
        return key

    def _load_public_key(self, fingerprint: str) -> pgpy.PGPKey:
        """Load a public key for verification."""
        key_path = self.keyring_path / f"{fingerprint}.pub.asc"
        if not key_path.exists():
            raise FileNotFoundError(
                f"Public key {fingerprint} not found in keyring"
            )

        key, _ = pgpy.PGPKey.from_file(str(key_path))
        return key

    def sign_document(
        self,
        document_path: Path,
        fingerprint: str,
        signer_handle: str = "",
        notes: str = "",
    ) -> SignatureResult:
        """Create a detached PGP signature over a document.

        The document is hashed first, then the hash is signed.
        The original file is never modified.
        """
        sig_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()

        try:
            # Hash the document
            doc_hash = self.hash_engine.digest_file(document_path)

            # Load the signing key
            private_key = self._load_private_key(fingerprint)

            # Read document bytes for PGP signing
            doc_bytes = document_path.read_bytes()

            # Create detached signature
            message = pgpy.PGPMessage.new(doc_bytes, cleartext=False)
            signature = private_key.sign(
                message,
                hash=self.hash_engine.pgp_hash,
            )

            return SignatureResult(
                signature_id=sig_id,
                document_hash=doc_hash,
                hash_algorithm=self.hash_engine.algorithm,
                fingerprint=fingerprint,
                timestamp=timestamp,
                signature_data=str(signature),
                success=True,
            )

        except Exception as e:
            return SignatureResult(
                signature_id=sig_id,
                document_hash="",
                hash_algorithm=self.hash_engine.algorithm,
                fingerprint=fingerprint,
                timestamp=timestamp,
                signature_data="",
                success=False,
                error=str(e),
            )

    def verify_signature(
        self,
        document_path: Path,
        signature_data: str,
        expected_hash: str,
        signer_fingerprint: str,
    ) -> VerificationResult:
        """Verify a detached PGP signature against a document.

        Steps:
        1. Recompute document hash and compare to expected
        2. Load signer's public key
        3. Verify PGP signature over document bytes
        """
        # Step 1: Hash verification
        current_hash = self.hash_engine.digest_file(document_path)
        if current_hash != expected_hash:
            return VerificationResult(
                valid=False,
                document_hash=current_hash,
                reason=f"Document modified: expected {expected_hash[:16]}..., "
                       f"got {current_hash[:16]}...",
            )

        try:
            # Step 2: Load public key
            pub_key = self._load_public_key(signer_fingerprint)

            # Step 3: Verify PGP signature
            doc_bytes = document_path.read_bytes()
            message = pgpy.PGPMessage.new(doc_bytes, cleartext=False)
            sig = pgpy.PGPSignature.from_blob(signature_data)

            verification = pub_key.verify(message, sig)

            if verification:
                return VerificationResult(
                    valid=True,
                    document_hash=current_hash,
                    signer_fingerprint=signer_fingerprint,
                )
            else:
                return VerificationResult(
                    valid=False,
                    document_hash=current_hash,
                    reason="PGP signature verification failed",
                )

        except Exception as e:
            return VerificationResult(
                valid=False,
                document_hash=current_hash,
                reason=f"Verification error: {e}",
            )
```

### Audit Chain with Hash Linking

The audit trail is the backbone of SKSeal's tamper-evidence. Each record is linked to the previous via SHA-256, and independently PGP-signed.

```python
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional, Iterator
from datetime import datetime, timezone
import uuid


@dataclass
class AuditRecord:
    """A single immutable audit trail entry."""
    record_id: str
    document_id: str
    event_type: str  # created, signed, countersigned, verified, revoked
    actor_fingerprint: str
    actor_handle: str
    actor_role: str  # author, signer, witness, auditor
    document_hash: str
    previous_record_hash: str  # SHA-256 of previous record (empty for first)
    timestamp: str
    details: dict
    system_signature: str  # PGP signature from system key

    def to_json(self) -> str:
        return json.dumps(asdict(self), separators=(",", ":"), sort_keys=True)

    def compute_hash(self) -> str:
        """SHA-256 of this record's canonical JSON (excluding system_signature)."""
        data = asdict(self)
        data.pop("system_signature", None)
        canonical = json.dumps(data, separators=(",", ":"), sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()


class AuditChain:
    """Append-only audit trail with hash chain integrity."""

    def __init__(
        self,
        audit_dir: Path,
        signing_engine: PGPSigningEngine,
        system_fingerprint: str,
    ):
        self.audit_dir = audit_dir
        self.audit_dir.mkdir(parents=True, exist_ok=True)
        self.signing_engine = signing_engine
        self.system_fingerprint = system_fingerprint

    def _audit_path(self, document_id: str) -> Path:
        return self.audit_dir / f"{document_id}.audit.jsonl"

    def _global_audit_path(self) -> Path:
        return self.audit_dir / "global.audit.jsonl"

    def _get_last_record_hash(self, document_id: str) -> str:
        """Get the hash of the last record in a document's audit trail."""
        path = self._audit_path(document_id)
        if not path.exists():
            return ""

        last_line = ""
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    last_line = line

        if not last_line:
            return ""

        record_data = json.loads(last_line)
        # Recompute hash from the stored data
        data = dict(record_data)
        data.pop("system_signature", None)
        canonical = json.dumps(data, separators=(",", ":"), sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()

    def append(
        self,
        document_id: str,
        event_type: str,
        actor_fingerprint: str,
        actor_handle: str,
        actor_role: str,
        document_hash: str,
        details: Optional[dict] = None,
    ) -> AuditRecord:
        """Append a new record to the document's audit trail.

        The record is:
        1. Linked to the previous record via hash chain
        2. PGP-signed by the system key
        3. Written atomically to the .jsonl file
        """
        prev_hash = self._get_last_record_hash(document_id)

        record = AuditRecord(
            record_id=str(uuid.uuid4()),
            document_id=document_id,
            event_type=event_type,
            actor_fingerprint=actor_fingerprint,
            actor_handle=actor_handle,
            actor_role=actor_role,
            document_hash=document_hash,
            previous_record_hash=prev_hash,
            timestamp=datetime.now(timezone.utc).isoformat(),
            details=details or {},
            system_signature="",  # Filled after signing
        )

        # Sign the record (system_signature excluded from hash input)
        record_hash = record.compute_hash()
        # In production, this would PGP-sign the hash
        record.system_signature = f"pgp:{self.system_fingerprint}:{record_hash}"

        # Atomic append to document audit trail
        line = record.to_json() + "\n"
        with open(self._audit_path(document_id), "a") as f:
            f.write(line)

        # Also append to global audit trail
        with open(self._global_audit_path(), "a") as f:
            f.write(line)

        return record

    def verify_chain(self, document_id: str) -> tuple[bool, list[str]]:
        """Verify the full hash chain integrity of a document's audit trail.

        Returns (is_valid, list_of_errors).
        """
        path = self._audit_path(document_id)
        if not path.exists():
            return False, [f"No audit trail for document {document_id}"]

        errors: list[str] = []
        prev_hash = ""
        record_count = 0

        with open(path, "r") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue

                record_count += 1
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    errors.append(f"Line {line_num}: invalid JSON")
                    continue

                # Verify chain link
                stored_prev = data.get("previous_record_hash", "")
                if stored_prev != prev_hash:
                    errors.append(
                        f"Line {line_num}: chain broken. "
                        f"Expected prev={prev_hash[:16]}..., "
                        f"got {stored_prev[:16]}..."
                    )

                # Compute this record's hash for next iteration
                verify_data = dict(data)
                verify_data.pop("system_signature", None)
                canonical = json.dumps(
                    verify_data, separators=(",", ":"), sort_keys=True
                )
                prev_hash = hashlib.sha256(canonical.encode()).hexdigest()

        if record_count == 0:
            errors.append("Audit trail is empty")

        return len(errors) == 0, errors

    def get_trail(self, document_id: str) -> list[dict]:
        """Read all audit records for a document."""
        path = self._audit_path(document_id)
        if not path.exists():
            return []

        records = []
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
        return records
```

### Document Manager with Lifecycle State Machine

```python
from enum import Enum
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import shutil
import sqlite3


class DocumentStatus(Enum):
    """Document lifecycle states."""
    DRAFT = "draft"
    PENDING_SIGNATURES = "pending_signatures"
    PARTIALLY_SIGNED = "partially_signed"
    FULLY_SIGNED = "fully_signed"
    EXPIRED = "expired"
    REVOKED = "revoked"


# Valid state transitions
STATUS_TRANSITIONS: dict[DocumentStatus, set[DocumentStatus]] = {
    DocumentStatus.DRAFT: {
        DocumentStatus.PENDING_SIGNATURES,
    },
    DocumentStatus.PENDING_SIGNATURES: {
        DocumentStatus.PARTIALLY_SIGNED,
        DocumentStatus.FULLY_SIGNED,  # Single signer completes immediately
        DocumentStatus.EXPIRED,
    },
    DocumentStatus.PARTIALLY_SIGNED: {
        DocumentStatus.FULLY_SIGNED,
        DocumentStatus.EXPIRED,
    },
    DocumentStatus.FULLY_SIGNED: {
        DocumentStatus.REVOKED,
    },
    DocumentStatus.EXPIRED: set(),     # Terminal state
    DocumentStatus.REVOKED: set(),     # Terminal state
}


@dataclass
class RequiredSigner:
    fingerprint: str
    role: str
    signed: bool = False
    signed_at: Optional[str] = None


@dataclass
class DocumentRecord:
    document_id: str
    filename: str
    file_path: str
    file_size: int
    mime_type: str
    doc_hash: str
    status: DocumentStatus
    template_id: Optional[str] = None
    required_signers: list[RequiredSigner] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    expires_at: Optional[str] = None


class DocumentManager:
    """Manages document lifecycle, storage, and tracking."""

    SCHEMA = """
    CREATE TABLE IF NOT EXISTS documents (
        document_id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        doc_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        template_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS required_signers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'signer',
        signed INTEGER NOT NULL DEFAULT 0,
        signed_at TEXT,
        FOREIGN KEY (document_id) REFERENCES documents(document_id)
    );

    CREATE TABLE IF NOT EXISTS signatures (
        signature_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        doc_hash TEXT NOT NULL,
        hash_algorithm TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        signature_data TEXT NOT NULL,
        signer_notes TEXT,
        FOREIGN KEY (document_id) REFERENCES documents(document_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sigs_doc ON signatures(document_id);
    CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(status);
    """

    def __init__(self, base_path: Path, db_path: Path):
        self.base_path = base_path
        self.documents_dir = base_path / "documents"
        self.documents_dir.mkdir(parents=True, exist_ok=True)

        self.db = sqlite3.connect(str(db_path))
        self.db.row_factory = sqlite3.Row
        self.db.executescript(self.SCHEMA)

    def import_document(
        self,
        source_path: Path,
        hash_engine: HashEngine,
        template_id: Optional[str] = None,
    ) -> DocumentRecord:
        """Import a document into SKSeal storage.

        1. Compute hash of source file
        2. Copy to documents/{doc_id}/original.*
        3. Register in SQLite
        """
        doc_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Compute hash
        doc_hash = hash_engine.digest_file(source_path)

        # Create document directory
        doc_dir = self.documents_dir / doc_id
        doc_dir.mkdir(parents=True)
        (doc_dir / "signatures").mkdir()

        # Copy original file
        suffix = source_path.suffix
        dest = doc_dir / f"original{suffix}"
        shutil.copy2(source_path, dest)

        # Detect MIME type
        mime_type = (
            "application/pdf" if suffix.lower() == ".pdf"
            else "application/octet-stream"
        )

        # Register in database
        record = DocumentRecord(
            document_id=doc_id,
            filename=source_path.name,
            file_path=str(dest.relative_to(self.base_path)),
            file_size=dest.stat().st_size,
            mime_type=mime_type,
            doc_hash=doc_hash,
            status=DocumentStatus.DRAFT,
            template_id=template_id,
            created_at=now,
            updated_at=now,
        )

        self.db.execute(
            """INSERT INTO documents
               (document_id, filename, file_path, file_size, mime_type,
                doc_hash, status, template_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                record.document_id, record.filename, record.file_path,
                record.file_size, record.mime_type, record.doc_hash,
                record.status.value, record.template_id,
                record.created_at, record.updated_at,
            ),
        )
        self.db.commit()

        return record

    def transition_status(
        self, document_id: str, new_status: DocumentStatus
    ) -> bool:
        """Transition document to new status, enforcing valid transitions."""
        row = self.db.execute(
            "SELECT status FROM documents WHERE document_id = ?",
            (document_id,),
        ).fetchone()

        if not row:
            raise ValueError(f"Document {document_id} not found")

        current = DocumentStatus(row["status"])
        if new_status not in STATUS_TRANSITIONS.get(current, set()):
            raise ValueError(
                f"Invalid transition: {current.value} -> {new_status.value}"
            )

        now = datetime.now(timezone.utc).isoformat()
        self.db.execute(
            "UPDATE documents SET status = ?, updated_at = ? "
            "WHERE document_id = ?",
            (new_status.value, now, document_id),
        )
        self.db.commit()
        return True

    def store_signature(
        self, document_id: str, result: SignatureResult
    ) -> None:
        """Store a signature result and update signing progress."""
        self.db.execute(
            """INSERT INTO signatures
               (signature_id, document_id, fingerprint, doc_hash,
                hash_algorithm, timestamp, signature_data)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                result.signature_id, document_id, result.fingerprint,
                result.document_hash, result.hash_algorithm,
                result.timestamp, result.signature_data,
            ),
        )

        # Update required_signers if applicable
        self.db.execute(
            """UPDATE required_signers
               SET signed = 1, signed_at = ?
               WHERE document_id = ? AND fingerprint = ?""",
            (result.timestamp, document_id, result.fingerprint),
        )

        # Write signature file
        sig_dir = self.documents_dir / document_id / "signatures"
        sig_path = sig_dir / f"{result.signature_id}.sig.json"
        sig_path.write_text(json.dumps({
            "signature_id": result.signature_id,
            "document_hash": result.document_hash,
            "hash_algorithm": result.hash_algorithm,
            "fingerprint": result.fingerprint,
            "timestamp": result.timestamp,
        }, indent=2))

        pgp_path = sig_dir / f"{result.signature_id}.sig.pgp"
        pgp_path.write_text(result.signature_data)

        self.db.commit()

    def check_signing_completeness(self, document_id: str) -> bool:
        """Check if all required signers have signed."""
        rows = self.db.execute(
            "SELECT signed FROM required_signers WHERE document_id = ?",
            (document_id,),
        ).fetchall()

        if not rows:
            return True  # No required signers means single-signer mode

        return all(row["signed"] for row in rows)
```

### Template Engine with PDF Field Rendering

```python
import yaml
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from pypdf import PdfReader, PdfWriter
from pypdf.annotations import FreeText


@dataclass
class FieldDefinition:
    field_id: str
    field_type: str  # signature, date, text, checkbox, initials
    label: str
    page: int
    x: float
    y: float
    width: float
    height: float
    required: bool = True
    signer_role: str = "signer"
    validation: Optional[str] = None


@dataclass
class SigningTemplate:
    template_id: str
    name: str
    description: str
    version: str
    document_type: str
    fields: list[FieldDefinition]
    signing_mode: str = "sequential"  # sequential, parallel, any_order
    signing_roles: list[str] = None
    created_by: str = ""
    created_at: str = ""


class TemplateEngine:
    """Manages signing templates and PDF field rendering."""

    def __init__(self, templates_dir: Path):
        self.templates_dir = templates_dir
        self.templates_dir.mkdir(parents=True, exist_ok=True)

    def load_template(self, template_id: str) -> SigningTemplate:
        """Load a template from YAML definition."""
        # Check both .yml and .yaml extensions
        for ext in (".yml", ".yaml"):
            path = self.templates_dir / f"{template_id}{ext}"
            if path.exists():
                break
        else:
            raise FileNotFoundError(f"Template {template_id} not found")

        with open(path) as f:
            data = yaml.safe_load(f)

        fields = [
            FieldDefinition(**field_data)
            for field_data in data.get("fields", [])
        ]

        return SigningTemplate(
            template_id=data["template_id"],
            name=data["name"],
            description=data.get("description", ""),
            version=data.get("version", "1.0.0"),
            document_type=data.get("document_type", "pdf"),
            fields=fields,
            signing_mode=data.get("signing_mode", "sequential"),
            signing_roles=data.get("signing_roles"),
            created_by=data.get("created_by", ""),
            created_at=data.get("created_at", ""),
        )

    def save_template(self, template: SigningTemplate) -> Path:
        """Save a template as YAML."""
        path = self.templates_dir / f"{template.template_id}.yml"

        data = {
            "template_id": template.template_id,
            "name": template.name,
            "description": template.description,
            "version": template.version,
            "document_type": template.document_type,
            "signing_mode": template.signing_mode,
            "signing_roles": template.signing_roles,
            "created_by": template.created_by,
            "created_at": template.created_at,
            "fields": [
                {
                    "field_id": f.field_id,
                    "field_type": f.field_type,
                    "label": f.label,
                    "page": f.page,
                    "x": f.x,
                    "y": f.y,
                    "width": f.width,
                    "height": f.height,
                    "required": f.required,
                    "signer_role": f.signer_role,
                    "validation": f.validation,
                }
                for f in template.fields
            ],
        }

        with open(path, "w") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)

        return path

    def render_signature_on_pdf(
        self,
        pdf_path: Path,
        output_path: Path,
        template: SigningTemplate,
        signer_fingerprint: str,
        signer_name: str,
        signed_at: str,
    ) -> Path:
        """Render visual signature stamps on a PDF at template-defined positions.

        For each signature field in the template, adds an annotation with
        the signer's name, fingerprint excerpt, and timestamp.
        """
        reader = PdfReader(str(pdf_path))
        writer = PdfWriter()

        # Copy all pages
        for page in reader.pages:
            writer.add_page(page)

        # Add signature annotations at template field positions
        for field_def in template.fields:
            if field_def.field_type != "signature":
                continue

            page_idx = field_def.page - 1  # Convert to 0-indexed
            if page_idx >= len(writer.pages):
                continue

            # Build signature stamp text
            fp_short = signer_fingerprint[-8:]
            stamp_text = (
                f"Signed by: {signer_name}\n"
                f"Key: ...{fp_short}\n"
                f"Date: {signed_at}"
            )

            annotation = FreeText(
                text=stamp_text,
                rect=(
                    field_def.x,
                    field_def.y,
                    field_def.x + field_def.width,
                    field_def.y + field_def.height,
                ),
                font="Courier",
                font_size="8pt",
                border_color="000000",
                background_color="FFFFFF",
            )

            writer.add_annotation(page_number=page_idx, annotation=annotation)

        with open(output_path, "wb") as f:
            writer.write(f)

        return output_path

    def list_templates(self) -> list[dict]:
        """List all available templates with basic metadata."""
        templates = []
        for path in sorted(self.templates_dir.glob("*.yml")):
            try:
                with open(path) as f:
                    data = yaml.safe_load(f)
                templates.append({
                    "template_id": data.get("template_id", path.stem),
                    "name": data.get("name", path.stem),
                    "description": data.get("description", ""),
                    "version": data.get("version", "1.0.0"),
                    "field_count": len(data.get("fields", [])),
                })
            except Exception:
                continue
        return templates
```

### FastAPI REST Server

```python
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import tempfile


app = FastAPI(
    title="SKSeal",
    description="Sovereign Document Signing API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SignRequest(BaseModel):
    document_id: str
    fingerprint: str
    signer_handle: str = ""
    notes: str = ""
    template_id: Optional[str] = None


class VerifyRequest(BaseModel):
    document_id: str
    signature_id: Optional[str] = None  # Verify specific or all


class SignResponse(BaseModel):
    signature_id: str
    document_hash: str
    fingerprint: str
    timestamp: str
    success: bool
    error: Optional[str] = None


class VerifyResponse(BaseModel):
    valid: bool
    document_hash: str
    signer_fingerprint: Optional[str] = None
    signed_at: Optional[str] = None
    reason: Optional[str] = None


@app.post("/sign", response_model=SignResponse)
async def sign_document(request: SignRequest):
    """Sign a tracked document with a PGP key."""
    # 1. Load document from manager
    # 2. Run signing engine
    # 3. Store signature
    # 4. Append audit trail
    # 5. Optionally render on PDF
    ...


@app.post("/verify", response_model=VerifyResponse)
async def verify_document(request: VerifyRequest):
    """Verify signature(s) on a document."""
    ...


@app.post("/documents")
async def upload_document(
    file: UploadFile = File(...),
    template_id: Optional[str] = None,
):
    """Upload and register a new document."""
    ...


@app.get("/documents")
async def list_documents(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """List tracked documents with optional status filter."""
    ...


@app.get("/documents/{doc_id}")
async def get_document(doc_id: str):
    """Get document details including all signatures."""
    ...


@app.get("/audit/{doc_id}")
async def get_audit_trail(doc_id: str):
    """Get the full audit trail for a document."""
    ...


@app.get("/audit/{doc_id}/verify")
async def verify_audit_chain(doc_id: str):
    """Verify the hash chain integrity of a document's audit trail."""
    ...


@app.get("/templates")
async def list_templates():
    """List available signing templates."""
    ...


@app.post("/templates")
async def create_template(template_data: dict):
    """Create a new signing template."""
    ...


@app.post("/sign/multi")
async def create_multi_sign_session(
    document_id: str,
    template_id: str,
    signers: list[dict],
):
    """Initiate a multi-signature signing session."""
    ...


@app.get("/sign/multi/{session_id}")
async def get_multi_sign_progress(session_id: str):
    """Check multi-signature session progress."""
    ...


@app.get("/health")
async def health_check():
    """Liveness probe."""
    return {"status": "healthy", "service": "skseal"}
```

### Multi-Signature Session Coordinator

```python
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional


class SigningSessionStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


@dataclass
class SignerSlot:
    fingerprint: str
    role: str
    order: int  # 0-based, used in sequential mode
    signed: bool = False
    signed_at: Optional[str] = None
    signature_id: Optional[str] = None


@dataclass
class MultiSignSession:
    session_id: str
    document_id: str
    template_id: str
    mode: str  # sequential, parallel, any_order
    status: SigningSessionStatus
    signers: list[SignerSlot]
    created_at: str
    expires_at: Optional[str] = None

    @property
    def current_signer_order(self) -> int:
        """In sequential mode, which order position is next."""
        for slot in sorted(self.signers, key=lambda s: s.order):
            if not slot.signed:
                return slot.order
        return -1  # All signed

    def can_sign(self, fingerprint: str) -> bool:
        """Check if a given signer is allowed to sign right now."""
        slot = next(
            (s for s in self.signers if s.fingerprint == fingerprint), None
        )
        if slot is None or slot.signed:
            return False

        if self.mode == "sequential":
            return slot.order == self.current_signer_order
        return True  # parallel and any_order allow anytime

    def record_signature(
        self, fingerprint: str, signature_id: str, signed_at: str
    ) -> bool:
        """Record that a signer has signed."""
        slot = next(
            (s for s in self.signers if s.fingerprint == fingerprint), None
        )
        if slot is None:
            return False

        slot.signed = True
        slot.signed_at = signed_at
        slot.signature_id = signature_id

        if all(s.signed for s in self.signers):
            self.status = SigningSessionStatus.COMPLETED
        elif self.status == SigningSessionStatus.PENDING:
            self.status = SigningSessionStatus.IN_PROGRESS

        return True
```

## Performance Optimization Strategies

### Streaming Hash Computation

For large documents, hash computation uses 8KB streaming chunks to avoid loading the entire file into memory:

```python
def digest_file_streaming(path: Path, algorithm: str = "sha256") -> str:
    """Stream-hash a file in 8KB chunks. Handles files of any size."""
    h = hashlib.new(algorithm)
    with open(path, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()
```

### Signature Cache

Verification of frequently-checked documents caches results with hash-based invalidation:

```python
from functools import lru_cache
from typing import Optional


class VerificationCache:
    """Cache verification results, invalidated on document hash change."""

    def __init__(self, max_size: int = 1000):
        self._cache: dict[str, tuple[str, VerificationResult]] = {}
        self._max_size = max_size

    def get(
        self, document_id: str, current_hash: str
    ) -> Optional[VerificationResult]:
        """Get cached result if document hash matches."""
        entry = self._cache.get(document_id)
        if entry and entry[0] == current_hash:
            return entry[1]
        return None

    def put(
        self, document_id: str, doc_hash: str, result: VerificationResult
    ) -> None:
        """Cache a verification result."""
        if len(self._cache) >= self._max_size:
            # Evict oldest entry
            oldest = next(iter(self._cache))
            del self._cache[oldest]
        self._cache[document_id] = (doc_hash, result)
```

### Connection Pooling for SQLite

```python
import sqlite3
from contextlib import contextmanager
from queue import Queue
from threading import Lock


class SQLitePool:
    """Thread-safe SQLite connection pool for concurrent API requests."""

    def __init__(self, db_path: str, pool_size: int = 5):
        self._pool: Queue[sqlite3.Connection] = Queue(maxsize=pool_size)
        self._lock = Lock()
        for _ in range(pool_size):
            conn = sqlite3.connect(db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            self._pool.put(conn)

    @contextmanager
    def connection(self):
        conn = self._pool.get(timeout=5.0)
        try:
            yield conn
        finally:
            self._pool.put(conn)
```

## Deployment Patterns

### Standalone CLI

```bash
# Initialize SKSeal
skseal init

# Sign a document
skseal sign contract.pdf --key CCBE9306410CF8CD5E393D6DEC31663B95230684

# Verify a document
skseal verify contract.pdf

# View audit trail
skseal audit contract.pdf

# Start REST API
skseal serve --host 0.0.0.0 --port 8084
```

### Docker Container

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY src/ src/
COPY templates/ /etc/skseal/templates/

ENV SKSEAL_BASE_PATH=/data/skseal
ENV SKSEAL_HOST=0.0.0.0
ENV SKSEAL_PORT=8084

VOLUME ["/data/skseal"]
EXPOSE 8084

CMD ["skseal", "serve"]
```

### Systemd Service

```ini
[Unit]
Description=SKSeal Sovereign Document Signing
After=network.target

[Service]
Type=simple
User=skseal
ExecStart=/usr/local/bin/skseal serve
Restart=on-failure
RestartSec=5
Environment=SKSEAL_BASE_PATH=/var/lib/skseal

[Install]
WantedBy=multi-user.target
```

## Security Architecture

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Document tampering after signing | SHA-256 hash comparison on every verification |
| Forged signatures | PGP signature verification against known public key |
| Audit trail manipulation | Hash chain + PGP-signed records + append-only file |
| Unauthorized signing | CapAuth capability tokens gate all sign operations |
| Key compromise | Revocation propagation via CapAuth + audit trail marking |
| Replay attacks | Unique signature_id + timestamp validation |
| Path traversal | All file paths validated against base directory |
| Resource exhaustion | Upload size limits + rate limiting + connection pooling |

### Key Isolation Model

```
┌─────────────────────────────────────────────────┐
│                  SKSeal Process                   │
│                                                   │
│  ┌─────────────┐     ┌────────────────────────┐  │
│  │ Signing     │────▶│  CapAuth Keyring        │  │
│  │ Engine      │     │  (read-only access)     │  │
│  └─────────────┘     │                         │  │
│                       │  ~/.capauth/identity/   │  │
│  SKSeal NEVER stores  │  - *.sec.asc (private) │  │
│  private keys.        │  - *.pub.asc (public)  │  │
│  All key operations   └────────────────────────┘  │
│  delegated to CapAuth                             │
│  keyring path.                                    │
└─────────────────────────────────────────────────┘
```

## Integration Points

| System | Integration |
|--------|------------|
| CapAuth | Identity, keyring, capability tokens for access control |
| SKComm | Deliver signing requests and completed signatures P2P |
| SKMemory | Store audit summaries as agent-accessible memories |
| Cloud 9 | Sign FEB files for tamper-evident emotional records |
| SKCapstone | Run as MCP skill providing signing tools to sovereign agents |
| Forgejo | Verify Git commit signatures via SKSeal verification engine |
| Vue.js Frontend | Visual template builder for drag-and-drop field placement |
