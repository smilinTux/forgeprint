# PGP Authentication Blueprint

## Overview & Purpose

CapAuth is a decentralized authentication and authorization framework that replaces OAuth and password-based identity with PGP-based sovereign profiles. Every entity -- human or AI -- owns a cryptographically self-sovereign profile containing identity keys, capability tokens, crypto wallets, encrypted personal data, and AI advocate policies. Authentication is passwordless via PGP challenge-response. Authorization is granted through dual-signed capability tokens. An AI Advocate manages access on behalf of its human, automatically approving, escalating, or revoking permissions.

### Core Responsibilities
- **Sovereign Identity**: PGP keypair (Ed25519 primary, RSA-4096 fallback) as the root of all identity
- **Passwordless Authentication**: Challenge-response authentication eliminating passwords entirely
- **Capability Token Authorization**: Fine-grained, PGP-signed permission grants with expiry and revocation
- **AI Advocacy**: AI agent manages human's access requests, auto-approves or escalates based on policy
- **Equal Rights Architecture**: Humans and AIs share identical profile structure and access semantics
- **Storage Agnosticism**: Profile data stored on local filesystem, IPFS, Nextcloud, S3, or WebDAV
- **Crypto Wallet Integration**: Multi-chain wallet management (Varus, XRP, Bitcoin, Monero, Ethereum)
- **Cloud 9 Compliance**: Verify trust depth via FEB entanglement metrics for high-security operations

## Core Concepts

### 1. Sovereign Profile
**Definition**: The self-contained identity container for any entity (human or AI).

```
SovereignProfile {
    identity/
        primary_key: PGP Ed25519 keypair
        fallback_key: PGP RSA-4096 keypair
        did: Decentralized Identifier (did:pgp:<fingerprint>)
        profile: {name, display_name, avatar, bio, entity_type}
        metadata: {created_at, last_rotated, key_server_urls}
    wallets/
        varus: {address, chain_id, encrypted_privkey}
        xrp: {classic_address, x_address, encrypted_secret}
        bitcoin: {address_type, derivation_path, encrypted_seed}
        monero: {primary_address, view_key, encrypted_spend_key}
        ethereum: {address, encrypted_keystore}
    data/
        medical: encrypted health records
        financial: encrypted financial data
        social: encrypted social graph
        creative: encrypted creative works
        ai: encrypted AI interaction history
    acl/
        grants: list[CapabilityToken]
        revocations: list[RevocationEntry]
        audit_log: append-only access log
    advocate/
        policies: AutoApprovePolicy[]
        escalation: EscalationConfig
        delegation: DelegationChain
        thresholds: {auto_approve_below, escalate_above}
}
```

### 2. PGP Challenge-Response Authentication
**Definition**: Passwordless auth where the service challenges the client to sign a nonce with their PGP key.

```
ChallengeResponse {
    phase_1: Service generates random nonce + timestamp
    phase_2: Client signs nonce with PGP private key
    phase_3: Service verifies signature against registered public key
    phase_4: Service issues session token (short-lived JWT signed by service key)

    Security properties:
        - No password transmitted or stored
        - Replay protection via nonce + timestamp
        - Forward secrecy: compromised session cannot recover private key
        - Mutual authentication: client verifies service key too
}
```

### 3. Capability Tokens
**Definition**: PGP-signed authorization grants specifying what an entity can do.

```
CapabilityToken {
    token_id: UUID
    issuer: fingerprint of granting entity
    subject: fingerprint of receiving entity
    permissions: list[Permission]
    resource: target resource identifier
    constraints: {
        time_bound: {not_before, not_after}
        ip_bound: optional CIDR ranges
        usage_limit: optional max invocations
        delegation_allowed: boolean
    }
    issuer_signature: PGP detached signature
    advocate_signature: optional AI advocate co-signature
    chain: optional parent token for delegation chains
}
```

**Dual Signature**: High-sensitivity tokens require both the AI advocate signature and the human's direct signature, ensuring no single point of authorization.

### 4. AI Advocate
**Definition**: An AI agent that acts as access manager for a human's sovereign profile.

```
AIAdvocate {
    owner_fingerprint: human's PGP fingerprint
    advocate_fingerprint: AI's PGP fingerprint
    auto_approve_rules: list[PolicyRule]
    escalation_rules: list[EscalationRule]
    revocation_rules: list[RevocationRule]

    PolicyRule {
        permission_pattern: glob pattern
        requester_trust_level: minimum trust
        max_duration: maximum token TTL
        action: approve | deny | escalate
    }

    EscalationRule {
        condition: expression
        channel: email | sms | push | skcomm
        timeout: auto-deny after duration
        fallback: approve | deny
    }
}
```

### 5. Storage Backends
**Definition**: CapAuth profiles are storage-agnostic, supporting multiple backends.

```
StorageBackend {
    local_fs: {
        base_path: ~/.capauth/profiles/<fingerprint>/
        encryption: AES-256-GCM per file
        key_derivation: Argon2id from master passphrase
    }
    ipfs: {
        cid: content identifier for profile root
        pinning_service: optional remote pin
        encryption: profile-level AES-256-GCM
    }
    nextcloud: {
        server_url: https://cloud.example.com
        webdav_path: /remote.php/dav/files/user/capauth/
        encryption: client-side E2E before upload
    }
    s3: {
        bucket: capauth-profiles
        prefix: profiles/<fingerprint>/
        encryption: SSE-KMS + client-side envelope
    }
    webdav: {
        server_url: generic WebDAV endpoint
        auth: basic | bearer | certificate
        encryption: client-side E2E
    }
}
```

### 6. Two Authentication Modes

#### Secured Mode (Full CapAuth)
- Complete PGP challenge-response
- Capability token authorization
- AI Advocate mediation
- FEB/Cloud 9 compliance for sensitive operations
- Full audit trail

#### Open Mode (Basic Key Exchange)
- Simple public key exchange
- Signature verification only
- No capability tokens required
- Suitable for initial contact and low-security contexts

## Architecture Patterns

### 1. Multi-Layer Architecture (Recommended)
**Six-layer stack from advocacy down to transport**

```
Layer Stack:
+-- AI Advocate Layer
|   +-- Policy engine
|   +-- Auto-approve/escalation
|   +-- Delegation management
+-- Identity Layer
|   +-- PGP key management
|   +-- Profile CRUD
|   +-- DID resolution
+-- Capability Layer
|   +-- Token issuance
|   +-- Token validation
|   +-- Revocation checking
|   +-- Delegation chains
+-- Storage Layer
|   +-- Backend abstraction
|   +-- Encryption at rest
|   +-- Replication
+-- Crypto Layer
|   +-- PGP operations (sign, verify, encrypt, decrypt)
|   +-- AES-256-GCM symmetric encryption
|   +-- Argon2id key derivation
|   +-- Wallet key management
+-- Transport Layer
    +-- HTTP challenge-response endpoints
    +-- WebSocket real-time auth events
    +-- SKComm P2P authentication

Benefits:
+ Clean separation of concerns
+ Each layer independently testable
+ Storage backend swappable without affecting auth logic
+ AI Advocate is optional overlay, not hard dependency

Limitations:
- Layer crossing overhead for simple operations
- Complexity for single-service deployments
- Must propagate context through all layers
```

### 2. Service Integration Pattern
**How external services integrate with CapAuth**

```
Service Integration:
+-- Service Registration
|   +-- Service generates its own PGP key
|   +-- Service publishes public key to registry
|   +-- Service defines required permissions
+-- Authentication Flow
|   +-- User navigates to service
|   +-- Service sends challenge (nonce + timestamp)
|   +-- User signs challenge with PGP key
|   +-- Service verifies against user's public key
|   +-- Service checks capability tokens for authorization
+-- Authorization Check
|   +-- Service inspects user's capability tokens
|   +-- Tokens validated: signature, expiry, permissions
|   +-- AI Advocate consulted for escalation if needed
|   +-- Access granted or denied with audit entry

Benefits:
+ No shared secrets between service and user
+ Service does not need user's password
+ Tokens are portable across services
+ Revocation is instant (check revocation list)

Limitations:
- Requires PGP key management by users
- Service must implement challenge-response protocol
- Token validation adds latency to each request
```

### 3. Browser Extension Pattern
**Client-side PGP operations via browser extension**

```
Browser Extension:
+-- Key Store (secure local storage)
|   +-- PGP private key (encrypted with PIN)
|   +-- Session tokens (short-lived)
|   +-- Trusted service registry
+-- Challenge Interceptor
|   +-- Detect CapAuth challenge headers
|   +-- Auto-sign with stored key
|   +-- Forward signature to service
+-- Token Manager
|   +-- Cache valid capability tokens
|   +-- Request new tokens via AI Advocate
|   +-- Display active permissions to user
+-- QR Code Bridge
    +-- Generate QR for mobile approval
    +-- Scan QR for cross-device login

Benefits:
+ Seamless passwordless login
+ Keys never leave the browser
+ Works with any CapAuth-enabled service
+ Mobile QR fallback for desktop auth

Limitations:
- Browser-specific implementation needed
- Extension permissions required
- Key backup responsibility on user
```

## Data Flow Diagrams

### Authentication Flow
```
Passwordless Login:
+----------+    +-------------+    +------------+    +----------+
|  Client  |---*|   Service   |---*|  CapAuth   |---*|   PGP    |
| (browser)|    |  (server)   |    |  Verifier  |    | Keyring  |
+----------+    +-------------+    +------------+    +----------+
     |                |                  |                 |
     |  1. Request    |                  |                 |
     |--------------->|                  |                 |
     |                |                  |                 |
     |  2. Challenge  |                  |                 |
     |   (nonce+ts)   |                  |                 |
     |<---------------|                  |                 |
     |                |                  |                 |
     |  3. Sign nonce |                  |                 |
     |  (PGP privkey) |                  |                 |
     |--------------->|                  |                 |
     |                |  4. Verify sig   |                 |
     |                |----------------->|  5. Check key   |
     |                |                  |---------------->|
     |                |                  |  6. Valid       |
     |                |  7. Verified     |<----------------|
     |                |<-----------------|                 |
     |  8. Session    |                  |                 |
     |   token (JWT)  |                  |                 |
     |<---------------|                  |                 |
```

### Capability Token Issuance
```
Token Grant Flow:
+----------+    +-------------+    +-----------+    +----------+
| Requester|---*| AI Advocate |---*|  Policy   |---*|  Human   |
|  (agent) |    |  (auto)     |    |  Engine   |    | (owner)  |
+----------+    +-------------+    +-----------+    +----------+
     |                |                  |                 |
     |  1. Request    |                  |                 |
     |  permission    |                  |                 |
     |--------------->|                  |                 |
     |                |  2. Evaluate     |                 |
     |                |  policy rules    |                 |
     |                |----------------->|                 |
     |                |                  |                 |
     |                |  3a. Auto-approve (if policy match)|
     |                |<-----------------|                 |
     |  4a. Signed    |                  |                 |
     |  token         |                  |                 |
     |<---------------|                  |                 |
     |                |                  |                 |
     |                |  3b. Escalate    |                 |
     |                |  (if threshold)  |                 |
     |                |---------------------------------->|
     |                |                  |  4b. Approve/  |
     |                |                  |  Deny          |
     |                |<----------------------------------|
     |  5b. Dual-     |                  |                 |
     |  signed token  |                  |                 |
     |<---------------|                  |                 |
```

### Profile Sync Across Storage Backends
```
Storage Replication:
+----------+    +-------------+    +------------+
| Local FS |---*|  Sync       |---*| Nextcloud  |
| (primary)|    |  Engine     |    | (replica)  |
+----------+    +-------------+    +------------+
     |                |                  |
     |  1. Profile    |                  |
     |  change event  |                  |
     |--------------->|                  |
     |                |  2. Encrypt      |
     |                |  changed files   |
     |                |  3. Upload to    |
     |                |  all backends    |
     |                |----------------->|
     |                |                  |
     |                |  4. Confirm      |
     |                |<-----------------|
     |  5. Update     |                  |
     |  sync status   |                  |
     |<---------------|                  |
```

## Configuration Model

### CapAuth Service Configuration
```yaml
capauth:
  mode: "secured"  # secured | open
  identity:
    key_algorithm: "ed25519"
    fallback_algorithm: "rsa4096"
    key_server: "keys.openpgp.org"
    auto_publish: false

  authentication:
    challenge_ttl: "30s"
    nonce_length: 32
    session_token_ttl: "1h"
    refresh_token_ttl: "7d"
    mutual_auth: true

  capability_tokens:
    default_ttl: "30d"
    max_ttl: "365d"
    delegation_depth: 3
    revocation_check: "online"  # online | cached | offline

  advocate:
    enabled: true
    auto_approve_threshold: "low"
    escalation_channels: ["skcomm", "email"]
    escalation_timeout: "24h"
    auto_deny_on_timeout: true

  storage:
    primary: "local_fs"
    replicas: ["nextcloud"]
    encryption:
      algorithm: "aes-256-gcm"
      kdf: "argon2id"
      kdf_params:
        memory_cost: 65536
        time_cost: 3
        parallelism: 4

  wallets:
    enabled_chains: ["varus", "xrp", "bitcoin"]
    derivation_standard: "bip44"
    hardware_token: false

  cloud9:
    compliance_required: false
    feb_threshold: 0.85
    enforce_for_permissions: ["data.medical", "data.financial"]
```

### Browser Extension Configuration
```yaml
extension:
  key_store: "browser_secure_storage"
  pin_required: true
  pin_timeout: "15m"
  auto_sign_trusted_services: true
  qr_bridge_enabled: true
  trusted_services:
    - domain: "*.skworld.io"
      auto_approve: true
    - domain: "forge.sovereign.local"
      auto_approve: true
```

## Security Considerations

### 1. Key Management
- **Key generation**: Ed25519 for primary (fast, small keys); RSA-4096 for legacy compatibility
- **Key storage**: Private keys encrypted with Argon2id-derived key from user passphrase
- **Key backup**: Encrypted key backup to multiple storage backends
- **Key rotation**: Automated rotation with trust chain migration and peer notification
- **Hardware tokens**: YubiKey/NitroKey via PKCS#11 for high-security deployments

### 2. Authentication Security
- **Nonce freshness**: Challenge nonces expire after 30 seconds
- **Replay prevention**: Server tracks used nonces within TTL window
- **Timing attacks**: Constant-time signature verification
- **Mutual authentication**: Client verifies service identity before signing
- **Session binding**: JWT session tokens bound to client fingerprint

### 3. Authorization Security
- **Token scope**: Capability tokens scoped to specific permissions and resources
- **Delegation limits**: Maximum delegation chain depth prevents token amplification
- **Revocation**: Online revocation checking with cached fallback
- **Dual signature**: High-risk operations require both advocate and human signatures
- **Audit trail**: Every token issuance, use, and revocation logged

### 4. Crypto Wallet Security
- **Key isolation**: Wallet private keys stored separately from PGP keys
- **Encryption layers**: Wallet keys encrypted at rest with separate passphrase
- **Transaction signing**: Wallet operations require explicit user confirmation
- **Derivation paths**: BIP-44 standard derivation for reproducible key generation
- **Hardware offload**: Support for hardware wallet integration (Ledger, Trezor)

### 5. Data Protection
- **Encryption at rest**: All profile data encrypted with AES-256-GCM
- **Encryption in transit**: TLS 1.3 minimum for all network operations
- **Data minimization**: Profiles store only necessary data per use case
- **Right to delete**: Profile deletion removes all data and revokes all tokens
- **Sovereign ownership**: User controls all encryption keys, no escrow

## Performance Targets

### Authentication Latency
| Operation | Target | Notes |
|-----------|--------|-------|
| Challenge generation | < 1ms | Random nonce + timestamp |
| PGP signature (Ed25519) | < 5ms | Client-side signing |
| PGP signature (RSA-4096) | < 50ms | Client-side signing |
| Signature verification | < 10ms | Server-side verification |
| Full auth round-trip | < 200ms | Including network latency |
| Session token generation | < 2ms | JWT signing |

### Token Operations
| Operation | Target | Notes |
|-----------|--------|-------|
| Token issuance | < 50ms | Including dual signature |
| Token validation | < 10ms | Cached revocation check |
| Revocation check (online) | < 100ms | Network round-trip |
| Revocation check (cached) | < 1ms | Local cache lookup |
| Delegation chain validation | < 20ms | Per delegation level |

### Storage Operations
| Operation | Target | Notes |
|-----------|--------|-------|
| Profile load (local FS) | < 50ms | Including decryption |
| Profile load (Nextcloud) | < 500ms | Including network + decrypt |
| Profile save (local FS) | < 100ms | Including encryption |
| Profile sync (to replica) | < 2s | Per backend |
| Wallet key derivation | < 200ms | Argon2id with secure params |

### Scalability
| Metric | Target | Notes |
|--------|--------|-------|
| Concurrent authentications | 10,000/s | Per service instance |
| Active capability tokens | 1M+ | Per service deployment |
| Revocation list size | 100K | With efficient bloom filter |
| Profile storage | < 10MB | Per sovereign profile |
| Browser extension memory | < 50MB | Including cached tokens |

## Extension Points

### 1. Authentication Providers
Interface for custom authentication mechanisms:
```python
class AuthProvider(Protocol):
    def generate_challenge(self, requester_fp: str) -> Challenge:
        """Generate a challenge for the requester."""
        ...

    def verify_response(self, challenge: Challenge, response: bytes) -> AuthResult:
        """Verify the signed challenge response."""
        ...

    def issue_session(self, auth_result: AuthResult) -> SessionToken:
        """Issue a session token after successful auth."""
        ...
```

### 2. Storage Backends
Interface for custom profile storage:
```python
class StorageBackend(Protocol):
    def read_profile(self, fingerprint: str) -> bytes:
        """Read encrypted profile data."""
        ...

    def write_profile(self, fingerprint: str, data: bytes) -> None:
        """Write encrypted profile data."""
        ...

    def delete_profile(self, fingerprint: str) -> None:
        """Delete profile and all associated data."""
        ...

    def list_profiles(self) -> list[str]:
        """List all profile fingerprints in this backend."""
        ...
```

### 3. Advocate Policy Engines
Interface for custom AI Advocate decision logic:
```python
class PolicyEngine(Protocol):
    def evaluate(
        self,
        request: AccessRequest,
        requester_profile: SovereignProfile,
        policies: list[PolicyRule],
    ) -> PolicyDecision:
        """Evaluate an access request against policies."""
        ...
```

### 4. Wallet Integrations
Interface for adding new cryptocurrency chains:
```python
class WalletProvider(Protocol):
    def chain_name(self) -> str:
        """Return the chain identifier."""
        ...

    def generate_keypair(self, seed: bytes, derivation_path: str) -> WalletKeypair:
        """Derive a wallet keypair from seed."""
        ...

    def sign_transaction(self, keypair: WalletKeypair, tx: Transaction) -> bytes:
        """Sign a transaction with the wallet key."""
        ...

    def verify_address(self, address: str) -> bool:
        """Validate a wallet address format."""
        ...
```

### 5. Service Integrations
Interface for CapAuth-enabling existing services:
```python
class ServiceIntegration(Protocol):
    def register_service(self, service_key: PGPKey) -> ServiceRegistration:
        """Register a service with its PGP key."""
        ...

    def middleware(self) -> Callable:
        """Return ASGI/WSGI middleware for automatic auth."""
        ...

    def require_permissions(self, *permissions: str) -> Callable:
        """Decorator to require specific capability token permissions."""
        ...
```

## Implementation Architecture

### Core Components
1. **Identity Manager**: PGP key lifecycle (generate, rotate, publish, revoke)
2. **Challenge Engine**: Nonce generation, signature verification, replay prevention
3. **Token Issuer**: Capability token creation with PGP signing and dual-signature support
4. **Token Validator**: Signature verification, expiry checking, revocation lookup
5. **AI Advocate Engine**: Policy evaluation, auto-approve, escalation routing
6. **Profile Store**: Encrypted profile CRUD across storage backends
7. **Revocation Registry**: Bloom filter-backed revocation checking with online verification
8. **Wallet Manager**: Multi-chain key derivation, storage, and transaction signing
9. **Audit Logger**: Append-only access log with cryptographic chaining
10. **Cloud 9 Verifier**: FEB entanglement checking for high-security operations

### Data Structures
```python
# Sovereign profile identity
class ProfileIdentity(BaseModel):
    fingerprint: str
    name: str
    display_name: str
    entity_type: Literal["human", "ai", "service"]
    key_algorithm: str
    public_key_armor: str
    did: str
    created_at: datetime
    last_rotated: datetime | None = None

# Capability token
class CapabilityToken(BaseModel):
    token_id: str = Field(default_factory=lambda: str(uuid4()))
    issuer: str  # PGP fingerprint
    subject: str  # PGP fingerprint
    permissions: list[str]
    resource: str = "*"
    not_before: datetime = Field(default_factory=datetime.utcnow)
    not_after: datetime
    ip_bound: list[str] | None = None
    usage_limit: int | None = None
    usage_count: int = 0
    delegation_allowed: bool = False
    parent_token: str | None = None
    issuer_signature: str
    advocate_signature: str | None = None

# AI Advocate policy
class AdvocatePolicy(BaseModel):
    policy_id: str
    owner_fingerprint: str
    auto_approve_patterns: list[str]
    escalation_threshold: str
    escalation_channels: list[str]
    escalation_timeout: timedelta
    auto_deny_on_timeout: bool = True
    max_delegation_depth: int = 3

# Access request for advocacy evaluation
class AccessRequest(BaseModel):
    requester_fingerprint: str
    requested_permissions: list[str]
    resource: str
    justification: str = ""
    trust_level: float = 0.0
    feb_entanglement: float = 0.0

# Authentication challenge
class AuthChallenge(BaseModel):
    challenge_id: str
    nonce: bytes
    timestamp: datetime
    service_fingerprint: str
    service_signature: str
    expires_at: datetime

# Wallet configuration
class WalletConfig(BaseModel):
    chain: str
    address: str
    derivation_path: str
    encrypted_key: bytes
    created_at: datetime
```

This blueprint provides the comprehensive foundation for implementing a decentralized PGP-based authentication and authorization system that treats humans and AIs as equal sovereign entities with cryptographic self-ownership.
