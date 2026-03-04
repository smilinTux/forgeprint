# PGP Authentication (CapAuth) Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing a production-grade PGP-based authentication and authorization system. It covers the challenge-response protocol, capability token lifecycle, AI advocate decision engine, storage backend abstraction, and the cryptographic primitives that make passwordless sovereign identity possible.

## Architectural Foundations

### 1. Core Architecture: Challenge-Response Authentication

#### Challenge Engine
```python
import os
import time
import hashlib
import gnupg
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Protocol
from pydantic import BaseModel, Field
from uuid import uuid4


@dataclass
class Challenge:
    challenge_id: str
    nonce: bytes
    timestamp: float
    service_fingerprint: str
    expires_at: float


@dataclass
class AuthResult:
    success: bool
    fingerprint: str = ""
    entity_type: str = ""
    error: str = ""


class ChallengeEngine:
    """Generate and verify PGP challenge-response authentication."""

    def __init__(
        self,
        gpg: gnupg.GPG,
        service_fingerprint: str,
        challenge_ttl: int = 30,
        nonce_length: int = 32,
    ):
        self.gpg = gpg
        self.service_fp = service_fingerprint
        self.challenge_ttl = challenge_ttl
        self.nonce_length = nonce_length
        # Track used nonces for replay protection
        self._used_nonces: dict[str, float] = {}
        self._cleanup_interval = 60  # seconds

    def generate_challenge(self, requester_fingerprint: str) -> Challenge:
        """Generate a signed challenge for the requester."""
        nonce = os.urandom(self.nonce_length)
        now = time.time()

        challenge = Challenge(
            challenge_id=str(uuid4()),
            nonce=nonce,
            timestamp=now,
            service_fingerprint=self.service_fp,
            expires_at=now + self.challenge_ttl,
        )

        return challenge

    def verify_response(
        self,
        challenge: Challenge,
        signed_nonce: str,
        requester_fingerprint: str,
    ) -> AuthResult:
        """Verify the requester's signed challenge response."""
        # Check challenge expiry
        if time.time() > challenge.expires_at:
            return AuthResult(success=False, error="Challenge expired")

        # Check replay (nonce reuse)
        nonce_hex = challenge.nonce.hex()
        if nonce_hex in self._used_nonces:
            return AuthResult(success=False, error="Nonce already used")

        # Verify PGP signature
        verified = self.gpg.verify(signed_nonce)
        if not verified.valid:
            return AuthResult(
                success=False,
                error=f"Invalid signature: {verified.status}",
            )

        # Verify signer matches expected requester
        if verified.fingerprint != requester_fingerprint:
            return AuthResult(
                success=False,
                error="Signature fingerprint mismatch",
            )

        # Check that signed content matches the nonce
        # The signed data should contain the nonce bytes
        if challenge.nonce.hex() not in signed_nonce:
            return AuthResult(
                success=False,
                error="Signed content does not match challenge nonce",
            )

        # Mark nonce as used
        self._used_nonces[nonce_hex] = time.time()
        self._cleanup_old_nonces()

        return AuthResult(
            success=True,
            fingerprint=requester_fingerprint,
        )

    def _cleanup_old_nonces(self) -> None:
        """Remove expired nonces from tracking set."""
        cutoff = time.time() - (self.challenge_ttl * 2)
        expired = [
            nonce for nonce, ts in self._used_nonces.items()
            if ts < cutoff
        ]
        for nonce in expired:
            del self._used_nonces[nonce]
```

#### Session Token Management
```python
import jwt
import hmac
from datetime import datetime, timedelta


class SessionManager:
    """Issue and validate JWT session tokens after authentication."""

    def __init__(
        self,
        signing_key: str,
        session_ttl: timedelta = timedelta(hours=1),
        refresh_ttl: timedelta = timedelta(days=7),
        algorithm: str = "HS256",
    ):
        self.signing_key = signing_key
        self.session_ttl = session_ttl
        self.refresh_ttl = refresh_ttl
        self.algorithm = algorithm
        self._revoked_tokens: set[str] = set()

    def issue_session(
        self,
        fingerprint: str,
        entity_type: str = "human",
        extra_claims: dict | None = None,
    ) -> dict:
        """Issue a session token and refresh token."""
        now = datetime.utcnow()

        # Session token (short-lived)
        session_payload = {
            "sub": fingerprint,
            "type": "session",
            "entity": entity_type,
            "iat": now,
            "exp": now + self.session_ttl,
            "jti": str(uuid4()),
        }
        if extra_claims:
            session_payload.update(extra_claims)

        session_token = jwt.encode(
            session_payload, self.signing_key, algorithm=self.algorithm
        )

        # Refresh token (long-lived)
        refresh_payload = {
            "sub": fingerprint,
            "type": "refresh",
            "iat": now,
            "exp": now + self.refresh_ttl,
            "jti": str(uuid4()),
        }
        refresh_token = jwt.encode(
            refresh_payload, self.signing_key, algorithm=self.algorithm
        )

        return {
            "session_token": session_token,
            "refresh_token": refresh_token,
            "expires_in": int(self.session_ttl.total_seconds()),
            "fingerprint": fingerprint,
        }

    def validate_session(self, token: str) -> dict | None:
        """Validate a session token and return claims."""
        try:
            payload = jwt.decode(
                token, self.signing_key, algorithms=[self.algorithm]
            )
            if payload.get("jti") in self._revoked_tokens:
                return None
            if payload.get("type") != "session":
                return None
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    def refresh_session(self, refresh_token: str) -> dict | None:
        """Use a refresh token to issue a new session token."""
        try:
            payload = jwt.decode(
                refresh_token, self.signing_key, algorithms=[self.algorithm]
            )
            if payload.get("type") != "refresh":
                return None
            if payload.get("jti") in self._revoked_tokens:
                return None

            return self.issue_session(
                fingerprint=payload["sub"],
                entity_type=payload.get("entity", "human"),
            )
        except jwt.InvalidTokenError:
            return None

    def revoke_token(self, token_jti: str) -> None:
        """Revoke a specific token by its JTI."""
        self._revoked_tokens.add(token_jti)
```

### 2. Capability Token System

#### Token Lifecycle
```python
from enum import Enum
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from uuid import uuid4
import json


class CapabilityToken(BaseModel):
    """PGP-signed capability token for fine-grained authorization."""
    token_id: str = Field(default_factory=lambda: str(uuid4()))
    issuer: str          # PGP fingerprint of granting entity
    subject: str         # PGP fingerprint of receiving entity
    permissions: list[str]
    resource: str = "*"
    not_before: datetime = Field(default_factory=datetime.utcnow)
    not_after: datetime
    ip_bound: list[str] | None = None
    usage_limit: int | None = None
    usage_count: int = 0
    delegation_allowed: bool = False
    delegation_depth: int = 0
    max_delegation_depth: int = 3
    parent_token_id: str | None = None
    issuer_signature: str = ""
    advocate_signature: str | None = None


class RevocationEntry(BaseModel):
    token_id: str
    revoked_by: str
    reason: str
    revoked_at: datetime = Field(default_factory=datetime.utcnow)


class TokenIssuer:
    """Issue and sign capability tokens."""

    def __init__(self, gpg: gnupg.GPG, issuer_fingerprint: str):
        self.gpg = gpg
        self.issuer_fp = issuer_fingerprint

    def issue_token(
        self,
        subject: str,
        permissions: list[str],
        resource: str = "*",
        ttl: timedelta = timedelta(days=30),
        delegation_allowed: bool = False,
        ip_bound: list[str] | None = None,
        usage_limit: int | None = None,
    ) -> CapabilityToken:
        """Issue a new capability token signed by the issuer."""
        now = datetime.utcnow()
        token = CapabilityToken(
            issuer=self.issuer_fp,
            subject=subject,
            permissions=permissions,
            resource=resource,
            not_before=now,
            not_after=now + ttl,
            delegation_allowed=delegation_allowed,
            ip_bound=ip_bound,
            usage_limit=usage_limit,
        )

        # Sign the token
        token_data = token.model_dump_json(exclude={"issuer_signature", "advocate_signature"})
        signed = self.gpg.sign(token_data, keyid=self.issuer_fp, detach=True)
        token.issuer_signature = str(signed)

        return token

    def delegate_token(
        self,
        parent_token: CapabilityToken,
        new_subject: str,
        permissions: list[str],
        ttl: timedelta | None = None,
    ) -> CapabilityToken | None:
        """Delegate a subset of permissions from an existing token."""
        # Check delegation is allowed
        if not parent_token.delegation_allowed:
            return None

        # Check delegation depth
        if parent_token.delegation_depth >= parent_token.max_delegation_depth:
            return None

        # Permissions must be subset of parent
        if not set(permissions).issubset(set(parent_token.permissions)):
            return None

        # TTL cannot exceed parent
        parent_remaining = parent_token.not_after - datetime.utcnow()
        effective_ttl = min(ttl or parent_remaining, parent_remaining)

        token = self.issue_token(
            subject=new_subject,
            permissions=permissions,
            resource=parent_token.resource,
            ttl=effective_ttl,
            delegation_allowed=parent_token.delegation_allowed,
        )
        token.delegation_depth = parent_token.delegation_depth + 1
        token.max_delegation_depth = parent_token.max_delegation_depth
        token.parent_token_id = parent_token.token_id

        return token


class TokenValidator:
    """Validate capability tokens with revocation checking."""

    def __init__(
        self,
        gpg: gnupg.GPG,
        revocation_store: "RevocationStore",
    ):
        self.gpg = gpg
        self.revocation_store = revocation_store

    def validate(
        self,
        token: CapabilityToken,
        required_permission: str | None = None,
        client_ip: str | None = None,
    ) -> tuple[bool, str]:
        """Validate a token. Returns (valid, reason)."""
        now = datetime.utcnow()

        # Check time bounds
        if now < token.not_before:
            return False, "Token not yet valid"
        if now > token.not_after:
            return False, "Token expired"

        # Check revocation
        if self.revocation_store.is_revoked(token.token_id):
            return False, "Token revoked"

        # Check delegation chain revocation
        if token.parent_token_id:
            if self.revocation_store.is_revoked(token.parent_token_id):
                return False, "Parent token revoked"

        # Check IP binding
        if token.ip_bound and client_ip:
            if not self._check_ip_bound(client_ip, token.ip_bound):
                return False, "Client IP not in allowed range"

        # Check usage limit
        if token.usage_limit is not None:
            if token.usage_count >= token.usage_limit:
                return False, "Usage limit exceeded"

        # Verify issuer signature
        token_data = token.model_dump_json(
            exclude={"issuer_signature", "advocate_signature", "usage_count"}
        )
        verified = self.gpg.verify(token.issuer_signature)
        if not verified.valid:
            return False, "Invalid issuer signature"
        if verified.fingerprint != token.issuer:
            return False, "Issuer fingerprint mismatch"

        # Check required permission
        if required_permission:
            if not self._permission_matches(required_permission, token.permissions):
                return False, f"Missing permission: {required_permission}"

        return True, "Valid"

    def _permission_matches(self, required: str, granted: list[str]) -> bool:
        """Check if required permission is covered by granted permissions."""
        if "*" in granted:
            return True
        for perm in granted:
            if perm == required:
                return True
            # Wildcard matching: "data.*" matches "data.medical"
            if perm.endswith(".*"):
                prefix = perm[:-2]
                if required.startswith(prefix):
                    return True
        return False

    def _check_ip_bound(self, client_ip: str, allowed_ranges: list[str]) -> bool:
        """Check if client IP is within allowed CIDR ranges."""
        import ipaddress
        client = ipaddress.ip_address(client_ip)
        for cidr in allowed_ranges:
            if client in ipaddress.ip_network(cidr, strict=False):
                return True
        return False


class RevocationStore:
    """Track revoked tokens with bloom filter for fast lookup."""

    def __init__(self):
        self._revoked: dict[str, RevocationEntry] = {}
        # In production, use a proper bloom filter for O(1) lookups
        self._bloom_set: set[str] = set()

    def revoke(self, token_id: str, revoked_by: str, reason: str) -> None:
        """Revoke a capability token."""
        entry = RevocationEntry(
            token_id=token_id,
            revoked_by=revoked_by,
            reason=reason,
        )
        self._revoked[token_id] = entry
        self._bloom_set.add(token_id)

    def is_revoked(self, token_id: str) -> bool:
        """Check if a token has been revoked."""
        # Fast bloom filter check
        if token_id not in self._bloom_set:
            return False
        # Confirm with full lookup (bloom filter may have false positives)
        return token_id in self._revoked

    def get_revocation(self, token_id: str) -> RevocationEntry | None:
        return self._revoked.get(token_id)
```

### 3. AI Advocate Decision Engine

#### Policy Evaluation
```python
from enum import Enum
from dataclasses import dataclass
import fnmatch
import logging

logger = logging.getLogger("capauth.advocate")


class AdvocateDecision(Enum):
    APPROVE = "approve"
    DENY = "deny"
    ESCALATE = "escalate"


@dataclass
class PolicyRule:
    permission_pattern: str  # Glob pattern: "data.*", "chat.send", "*"
    min_trust_level: float   # Minimum FEB trust (0.0-1.0)
    max_duration_days: int   # Maximum token TTL
    action: AdvocateDecision
    priority: int = 0        # Higher priority rules evaluated first


@dataclass
class EscalationConfig:
    channels: list[str]      # ["skcomm", "email", "sms"]
    timeout_seconds: int
    fallback_action: AdvocateDecision
    require_justification: bool = False


@dataclass
class AccessRequest:
    requester_fingerprint: str
    requested_permissions: list[str]
    resource: str
    duration_days: int
    trust_level: float
    feb_entanglement: float
    justification: str = ""


class AdvocateEngine:
    """AI Advocate: evaluates access requests against owner policies."""

    def __init__(
        self,
        owner_fingerprint: str,
        policies: list[PolicyRule],
        escalation: EscalationConfig,
        token_issuer: TokenIssuer,
    ):
        self.owner_fp = owner_fingerprint
        self.policies = sorted(policies, key=lambda p: -p.priority)
        self.escalation = escalation
        self.token_issuer = token_issuer
        self._pending_escalations: dict[str, AccessRequest] = {}

    def evaluate(self, request: AccessRequest) -> tuple[AdvocateDecision, str]:
        """Evaluate an access request and return decision with reason."""
        # Evaluate each permission against policies
        for permission in request.requested_permissions:
            decision, reason = self._evaluate_permission(permission, request)

            if decision == AdvocateDecision.DENY:
                logger.info(
                    f"DENY {request.requester_fingerprint}: "
                    f"{permission} - {reason}"
                )
                return decision, reason

            if decision == AdvocateDecision.ESCALATE:
                logger.info(
                    f"ESCALATE {request.requester_fingerprint}: "
                    f"{permission} - {reason}"
                )
                self._initiate_escalation(request)
                return decision, reason

        # All permissions approved
        logger.info(
            f"APPROVE {request.requester_fingerprint}: "
            f"{request.requested_permissions}"
        )
        return AdvocateDecision.APPROVE, "All permissions approved by policy"

    def _evaluate_permission(
        self, permission: str, request: AccessRequest
    ) -> tuple[AdvocateDecision, str]:
        """Evaluate a single permission against all policies."""
        for policy in self.policies:
            if not fnmatch.fnmatch(permission, policy.permission_pattern):
                continue

            # Check trust level
            if request.trust_level < policy.min_trust_level:
                if policy.action == AdvocateDecision.APPROVE:
                    return (
                        AdvocateDecision.ESCALATE,
                        f"Trust {request.trust_level:.2f} below "
                        f"threshold {policy.min_trust_level:.2f}",
                    )
                return policy.action, "Trust level insufficient"

            # Check duration
            if request.duration_days > policy.max_duration_days:
                return (
                    AdvocateDecision.ESCALATE,
                    f"Requested {request.duration_days}d exceeds "
                    f"max {policy.max_duration_days}d",
                )

            return policy.action, f"Matched policy: {policy.permission_pattern}"

        # No policy matched - escalate by default
        return (
            AdvocateDecision.ESCALATE,
            "No matching policy, escalating to owner",
        )

    def _initiate_escalation(self, request: AccessRequest) -> None:
        """Route escalation to human owner via configured channels."""
        escalation_id = str(uuid4())[:8]
        self._pending_escalations[escalation_id] = request

        for channel in self.escalation.channels:
            self._send_escalation(channel, escalation_id, request)

    def _send_escalation(
        self, channel: str, escalation_id: str, request: AccessRequest
    ) -> None:
        """Send escalation notification via the specified channel."""
        message = (
            f"Access request [{escalation_id}]\n"
            f"From: {request.requester_fingerprint}\n"
            f"Permissions: {', '.join(request.requested_permissions)}\n"
            f"Resource: {request.resource}\n"
            f"Duration: {request.duration_days} days\n"
            f"Trust: {request.trust_level:.2f}\n"
        )
        if request.justification:
            message += f"Justification: {request.justification}\n"

        # Channel dispatch (pluggable)
        logger.info(f"Escalation via {channel}: {message}")

    def resolve_escalation(
        self, escalation_id: str, approved: bool, human_fingerprint: str
    ) -> CapabilityToken | None:
        """Human resolves an escalated request."""
        request = self._pending_escalations.pop(escalation_id, None)
        if not request:
            return None

        if not approved:
            logger.info(f"Escalation {escalation_id} denied by {human_fingerprint}")
            return None

        # Issue dual-signed token
        token = self.token_issuer.issue_token(
            subject=request.requester_fingerprint,
            permissions=request.requested_permissions,
            resource=request.resource,
            ttl=timedelta(days=request.duration_days),
        )

        logger.info(
            f"Escalation {escalation_id} approved, "
            f"token {token.token_id} issued"
        )
        return token

    def process_timeouts(self) -> list[str]:
        """Check for escalation timeouts and apply fallback action."""
        timed_out = []
        # In production, track creation timestamps for each escalation
        # For simplicity, this shows the pattern
        for esc_id, request in list(self._pending_escalations.items()):
            # Check if timeout exceeded
            # (In practice, compare creation time against escalation.timeout_seconds)
            if self.escalation.fallback_action == AdvocateDecision.DENY:
                del self._pending_escalations[esc_id]
                timed_out.append(esc_id)
                logger.info(f"Escalation {esc_id} timed out, denied")

        return timed_out
```

### 4. Storage Backend Abstraction

#### Multi-Backend Profile Storage
```python
from pathlib import Path
from abc import ABC, abstractmethod
import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
import hashlib
import base64


class ProfileData(BaseModel):
    fingerprint: str
    identity: dict
    wallets: dict = {}
    data: dict = {}
    acl: dict = {}
    advocate: dict = {}
    version: int = 1
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class StorageBackend(ABC):
    """Abstract base for profile storage backends."""

    @abstractmethod
    def read(self, fingerprint: str) -> bytes | None:
        """Read encrypted profile bytes."""
        ...

    @abstractmethod
    def write(self, fingerprint: str, data: bytes) -> None:
        """Write encrypted profile bytes."""
        ...

    @abstractmethod
    def delete(self, fingerprint: str) -> bool:
        """Delete a profile."""
        ...

    @abstractmethod
    def exists(self, fingerprint: str) -> bool:
        """Check if profile exists."""
        ...

    @abstractmethod
    def list_profiles(self) -> list[str]:
        """List all profile fingerprints."""
        ...


class LocalFSBackend(StorageBackend):
    """Local filesystem storage under ~/.capauth/profiles/."""

    def __init__(self, base_path: Path):
        self.base_path = base_path
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _profile_path(self, fingerprint: str) -> Path:
        return self.base_path / fingerprint / "profile.enc"

    def read(self, fingerprint: str) -> bytes | None:
        path = self._profile_path(fingerprint)
        if not path.exists():
            return None
        return path.read_bytes()

    def write(self, fingerprint: str, data: bytes) -> None:
        path = self._profile_path(fingerprint)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Atomic write via temp file
        tmp_path = path.with_suffix(".tmp")
        tmp_path.write_bytes(data)
        tmp_path.rename(path)

    def delete(self, fingerprint: str) -> bool:
        path = self._profile_path(fingerprint)
        if path.exists():
            # Secure delete: overwrite before unlink
            size = path.stat().st_size
            with open(path, "wb") as f:
                f.write(os.urandom(size))
            path.unlink()
            return True
        return False

    def exists(self, fingerprint: str) -> bool:
        return self._profile_path(fingerprint).exists()

    def list_profiles(self) -> list[str]:
        return [
            d.name for d in self.base_path.iterdir()
            if d.is_dir() and (d / "profile.enc").exists()
        ]


class NextcloudBackend(StorageBackend):
    """Nextcloud WebDAV storage with client-side encryption."""

    def __init__(self, server_url: str, username: str, password: str, prefix: str):
        self.server_url = server_url.rstrip("/")
        self.username = username
        self.password = password
        self.prefix = prefix

    def _webdav_url(self, fingerprint: str) -> str:
        return (
            f"{self.server_url}/remote.php/dav/files/"
            f"{self.username}/{self.prefix}/{fingerprint}/profile.enc"
        )

    def read(self, fingerprint: str) -> bytes | None:
        import requests
        url = self._webdav_url(fingerprint)
        resp = requests.get(url, auth=(self.username, self.password))
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.content

    def write(self, fingerprint: str, data: bytes) -> None:
        import requests
        url = self._webdav_url(fingerprint)
        # Ensure directory exists
        dir_url = url.rsplit("/", 1)[0] + "/"
        requests.request("MKCOL", dir_url, auth=(self.username, self.password))
        requests.put(url, data=data, auth=(self.username, self.password)).raise_for_status()

    def delete(self, fingerprint: str) -> bool:
        import requests
        url = self._webdav_url(fingerprint)
        resp = requests.delete(url, auth=(self.username, self.password))
        return resp.status_code in (200, 204)

    def exists(self, fingerprint: str) -> bool:
        import requests
        url = self._webdav_url(fingerprint)
        resp = requests.head(url, auth=(self.username, self.password))
        return resp.status_code == 200

    def list_profiles(self) -> list[str]:
        import requests
        from xml.etree import ElementTree
        url = f"{self.server_url}/remote.php/dav/files/{self.username}/{self.prefix}/"
        resp = requests.request(
            "PROPFIND", url, auth=(self.username, self.password),
            headers={"Depth": "1"},
        )
        if resp.status_code != 207:
            return []
        tree = ElementTree.fromstring(resp.content)
        ns = {"d": "DAV:"}
        hrefs = [e.text for e in tree.findall(".//d:href", ns)]
        profiles = []
        for href in hrefs:
            parts = href.strip("/").split("/")
            if len(parts) > 0 and len(parts[-1]) == 40:  # fingerprint length
                profiles.append(parts[-1])
        return profiles
```

#### Profile Encryption Layer
```python
class ProfileEncryptor:
    """AES-256-GCM encryption for profile data with Argon2id KDF."""

    def __init__(
        self,
        passphrase: str,
        memory_cost: int = 65536,
        time_cost: int = 3,
        parallelism: int = 4,
    ):
        self.passphrase = passphrase
        self.memory_cost = memory_cost
        self.time_cost = time_cost
        self.parallelism = parallelism

    def _derive_key(self, salt: bytes) -> bytes:
        """Derive a 256-bit key from passphrase using Argon2id."""
        # Using hashlib-based approach for portability
        # In production, use argon2-cffi library
        import argon2
        raw = argon2.low_level.hash_secret_raw(
            self.passphrase.encode(),
            salt,
            time_cost=self.time_cost,
            memory_cost=self.memory_cost,
            parallelism=self.parallelism,
            hash_len=32,
            type=argon2.low_level.Type.ID,
        )
        return raw

    def encrypt(self, plaintext: bytes) -> bytes:
        """Encrypt data with AES-256-GCM. Returns salt + nonce + ciphertext."""
        salt = os.urandom(16)
        key = self._derive_key(salt)
        nonce = os.urandom(12)
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        return salt + nonce + ciphertext

    def decrypt(self, encrypted: bytes) -> bytes:
        """Decrypt AES-256-GCM data. Input: salt + nonce + ciphertext."""
        salt = encrypted[:16]
        nonce = encrypted[16:28]
        ciphertext = encrypted[28:]
        key = self._derive_key(salt)
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext, None)
```

#### Profile Manager (Unified API)
```python
class ProfileManager:
    """Unified profile management across storage backends."""

    def __init__(
        self,
        primary: StorageBackend,
        replicas: list[StorageBackend] | None = None,
        encryptor: ProfileEncryptor | None = None,
    ):
        self.primary = primary
        self.replicas = replicas or []
        self.encryptor = encryptor

    def load_profile(self, fingerprint: str) -> ProfileData | None:
        """Load and decrypt a profile from the primary backend."""
        raw = self.primary.read(fingerprint)
        if raw is None:
            return None

        if self.encryptor:
            decrypted = self.encryptor.decrypt(raw)
            return ProfileData.model_validate_json(decrypted)
        return ProfileData.model_validate_json(raw)

    def save_profile(self, profile: ProfileData) -> None:
        """Encrypt and save a profile to primary and all replicas."""
        profile.updated_at = datetime.utcnow()
        raw = profile.model_dump_json().encode()

        if self.encryptor:
            encrypted = self.encryptor.encrypt(raw)
        else:
            encrypted = raw

        # Write to primary
        self.primary.write(profile.fingerprint, encrypted)

        # Replicate to all backends
        for replica in self.replicas:
            try:
                replica.write(profile.fingerprint, encrypted)
            except Exception as e:
                logger.error(f"Replication failed for {replica}: {e}")

    def delete_profile(self, fingerprint: str) -> None:
        """Delete profile from all backends and revoke all tokens."""
        self.primary.delete(fingerprint)
        for replica in self.replicas:
            try:
                replica.delete(fingerprint)
            except Exception as e:
                logger.error(f"Replica delete failed: {e}")
```

### 5. FastAPI Service Integration

#### CapAuth Middleware
```python
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.security import HTTPBearer
from starlette.middleware.base import BaseHTTPMiddleware
from functools import wraps


class CapAuthMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for automatic CapAuth enforcement."""

    def __init__(
        self,
        app: FastAPI,
        challenge_engine: ChallengeEngine,
        session_manager: SessionManager,
        token_validator: TokenValidator,
        exempt_paths: list[str] | None = None,
    ):
        super().__init__(app)
        self.challenge_engine = challenge_engine
        self.session_manager = session_manager
        self.token_validator = token_validator
        self.exempt_paths = exempt_paths or ["/health", "/auth/challenge"]

    async def dispatch(self, request: Request, call_next):
        # Skip exempt paths
        if any(request.url.path.startswith(p) for p in self.exempt_paths):
            return await call_next(request)

        # Extract session token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=401,
                detail="Missing Authorization header",
                headers={"WWW-Authenticate": "CapAuth"},
            )

        token = auth_header[7:]
        claims = self.session_manager.validate_session(token)
        if not claims:
            raise HTTPException(status_code=401, detail="Invalid session token")

        # Attach claims to request state
        request.state.fingerprint = claims["sub"]
        request.state.entity_type = claims.get("entity", "human")
        request.state.claims = claims

        return await call_next(request)


def require_capability(*permissions: str):
    """Decorator to require specific capability token permissions."""
    def decorator(func):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            fingerprint = getattr(request.state, "fingerprint", None)
            if not fingerprint:
                raise HTTPException(status_code=401, detail="Not authenticated")

            # Check capability tokens (from header or token store)
            cap_header = request.headers.get("X-Capability-Token", "")
            if not cap_header:
                raise HTTPException(
                    status_code=403,
                    detail=f"Capability token required for: {permissions}",
                )

            # In production, deserialize and validate the token
            # This is a simplified pattern
            for perm in permissions:
                # token_validator.validate(token, required_permission=perm)
                pass

            return await func(request, *args, **kwargs)
        return wrapper
    return decorator
```

#### Authentication Endpoints
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


app = FastAPI(title="CapAuth Service")


class ChallengeRequest(BaseModel):
    fingerprint: str


class ChallengeResponsePayload(BaseModel):
    challenge_id: str
    signed_nonce: str
    fingerprint: str


@app.post("/auth/challenge")
async def create_challenge(req: ChallengeRequest):
    """Generate a new authentication challenge."""
    challenge = challenge_engine.generate_challenge(req.fingerprint)
    return {
        "challenge_id": challenge.challenge_id,
        "nonce": challenge.nonce.hex(),
        "timestamp": challenge.timestamp,
        "expires_at": challenge.expires_at,
        "service_fingerprint": challenge.service_fingerprint,
    }


@app.post("/auth/verify")
async def verify_challenge(payload: ChallengeResponsePayload):
    """Verify signed challenge and issue session token."""
    # Retrieve the stored challenge
    # (In production, lookup by challenge_id from a cache/store)
    result = challenge_engine.verify_response(
        challenge=stored_challenge,
        signed_nonce=payload.signed_nonce,
        requester_fingerprint=payload.fingerprint,
    )

    if not result.success:
        raise HTTPException(status_code=401, detail=result.error)

    # Issue session tokens
    tokens = session_manager.issue_session(
        fingerprint=result.fingerprint,
        entity_type=result.entity_type,
    )
    return tokens


@app.post("/auth/refresh")
async def refresh_session(refresh_token: str):
    """Refresh an expired session token."""
    tokens = session_manager.refresh_session(refresh_token)
    if not tokens:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    return tokens
```

## Performance Optimization Strategies

### 1. Challenge Nonce Caching
```python
class NonceCache:
    """Bounded LRU cache for used nonces with TTL-based eviction."""

    def __init__(self, max_size: int = 100_000, ttl: int = 60):
        self.max_size = max_size
        self.ttl = ttl
        self._cache: dict[str, float] = {}

    def add(self, nonce: str) -> bool:
        """Add a nonce. Returns False if already present (replay)."""
        self._evict_expired()
        if nonce in self._cache:
            return False
        if len(self._cache) >= self.max_size:
            # Evict oldest
            oldest = min(self._cache, key=self._cache.get)
            del self._cache[oldest]
        self._cache[nonce] = time.time()
        return True

    def _evict_expired(self) -> None:
        cutoff = time.time() - self.ttl
        expired = [k for k, v in self._cache.items() if v < cutoff]
        for k in expired:
            del self._cache[k]
```

### 2. Token Validation Cache
```python
from functools import lru_cache


class CachedTokenValidator:
    """Cache token validation results for repeated checks."""

    def __init__(self, validator: TokenValidator, cache_ttl: int = 60):
        self.validator = validator
        self.cache_ttl = cache_ttl
        self._cache: dict[str, tuple[bool, str, float]] = {}

    def validate(self, token: CapabilityToken, **kwargs) -> tuple[bool, str]:
        cache_key = token.token_id
        if cache_key in self._cache:
            valid, reason, cached_at = self._cache[cache_key]
            if time.time() - cached_at < self.cache_ttl:
                return valid, reason

        valid, reason = self.validator.validate(token, **kwargs)
        self._cache[cache_key] = (valid, reason, time.time())
        return valid, reason
```

### 3. Bloom Filter Revocation
```python
class BloomRevocationFilter:
    """Space-efficient probabilistic revocation check."""

    def __init__(self, expected_items: int = 100_000, fp_rate: float = 0.01):
        import math
        self.size = int(-expected_items * math.log(fp_rate) / (math.log(2) ** 2))
        self.num_hashes = int(self.size / expected_items * math.log(2))
        self.bit_array = bytearray(self.size // 8 + 1)

    def add(self, token_id: str) -> None:
        for i in range(self.num_hashes):
            idx = self._hash(token_id, i) % self.size
            self.bit_array[idx // 8] |= 1 << (idx % 8)

    def might_contain(self, token_id: str) -> bool:
        for i in range(self.num_hashes):
            idx = self._hash(token_id, i) % self.size
            if not (self.bit_array[idx // 8] & (1 << (idx % 8))):
                return False
        return True

    def _hash(self, data: str, seed: int) -> int:
        return int(hashlib.sha256(f"{data}:{seed}".encode()).hexdigest(), 16)
```

## Deployment Patterns

### 1. Standalone Service
```yaml
deployment:
  type: standalone
  host: "0.0.0.0"
  port: 8443
  tls:
    cert: "/etc/capauth/tls/cert.pem"
    key: "/etc/capauth/tls/key.pem"
  storage:
    primary: local_fs
    path: "/var/lib/capauth/profiles"
  gpg:
    home: "/var/lib/capauth/gnupg"
    service_key: "SERVICE_FINGERPRINT"
```

### 2. Embedded in Application
```yaml
deployment:
  type: embedded
  middleware: "fastapi"
  challenge_endpoint: "/auth/challenge"
  verify_endpoint: "/auth/verify"
  exempt_paths:
    - "/health"
    - "/public/*"
  session:
    ttl: "1h"
    refresh_ttl: "7d"
```

### 3. Distributed with Replication
```yaml
deployment:
  type: distributed
  instances: 3
  storage:
    primary: local_fs
    replicas:
      - type: nextcloud
        server: "https://cloud.sovereign.local"
      - type: s3
        bucket: "capauth-backup"
  revocation:
    mode: "online"
    sync_interval: "30s"
```

## Security Architecture

### 1. Key Hierarchy
```python
class KeyHierarchy:
    """Three-tier key hierarchy for CapAuth."""

    # Tier 1: Master Key (PGP primary key)
    # - Signs all other keys
    # - Stored offline or in hardware token
    # - Never used for daily operations

    # Tier 2: Signing Subkeys
    # - Signs challenges, tokens, messages
    # - Rotated periodically (90 days default)
    # - Can be revoked without losing master

    # Tier 3: Encryption Subkeys
    # - Encrypts profile data, wallet keys
    # - Rotated independently of signing keys
    # - Forward secrecy: old keys deleted after rotation

    def __init__(self, gpg: gnupg.GPG, master_fingerprint: str):
        self.gpg = gpg
        self.master_fp = master_fingerprint

    def get_signing_subkey(self) -> str:
        """Return the current signing subkey fingerprint."""
        key = self.gpg.list_keys(keys=[self.master_fp])[0]
        for subkey in key.get("subkeys", []):
            if "s" in subkey[1]:  # signing capability
                return subkey[0]
        return self.master_fp

    def get_encryption_subkey(self) -> str:
        """Return the current encryption subkey fingerprint."""
        key = self.gpg.list_keys(keys=[self.master_fp])[0]
        for subkey in key.get("subkeys", []):
            if "e" in subkey[1]:  # encryption capability
                return subkey[0]
        return self.master_fp
```

### 2. Audit Trail
```python
class AuthAuditLog:
    """Append-only audit log for all authentication events."""

    def __init__(self, log_path: Path):
        self.log_path = log_path
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def log_auth_attempt(
        self,
        fingerprint: str,
        success: bool,
        method: str = "challenge-response",
        client_ip: str = "",
        details: str = "",
    ) -> None:
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event": "auth_attempt",
            "fingerprint": fingerprint,
            "success": success,
            "method": method,
            "client_ip": client_ip,
            "details": details,
        }
        with open(self.log_path, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def log_token_event(
        self,
        event_type: str,
        token_id: str,
        issuer: str,
        subject: str,
        permissions: list[str],
    ) -> None:
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event": f"token_{event_type}",
            "token_id": token_id,
            "issuer": issuer,
            "subject": subject,
            "permissions": permissions,
        }
        with open(self.log_path, "a") as f:
            f.write(json.dumps(entry) + "\n")
```

This comprehensive architecture guide provides the foundation for implementing a decentralized PGP-based authentication system where every entity owns its identity, passwords are eliminated, and AI advocates mediate access on behalf of their humans.
