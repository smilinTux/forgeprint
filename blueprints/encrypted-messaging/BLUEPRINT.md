# Encrypted Messaging Blueprint

## Overview & Purpose

SKChat is a sovereign communication platform that treats AI agents as first-class participants alongside humans. Every message is end-to-end encrypted with PGP, transported over a 17-path P2P mesh (SKComm), and stored locally in encrypted SQLite databases. The platform supports text messaging with threads and offline queues, voice communication via P2P WebRTC with Piper TTS and Whisper STT, encrypted file transfer with no size limits, and group chat with typed participants (human/AI) and per-member tool scoping. An AI Advocacy Engine screens incoming requests, manages access, suggests responses, and flags threats.

### Core Responsibilities
- **End-to-End Encryption**: PGP-encrypted messages where only sender and recipient can read content
- **AI as Participant**: AI agents have their own profiles, presence, and speak/listen/advocate capabilities
- **P2P Transport**: Messages routed through SKComm's 17 transport paths without central servers
- **Voice Communication**: Real-time P2P voice with WebRTC, TTS synthesis (35+ languages), and STT transcription
- **Group Chat**: Multi-participant rooms with human/AI member types and tool-scoped permissions
- **AI Advocacy**: AI screens requests, suggests responses, flags threats, and manages human's access
- **Local-First Storage**: Messages stored in local encrypted SQLite, synced via Nextcloud when available
- **Plugin Architecture**: Extensible via SKChatPlugin interface for custom feature modules
- **Quantum Readiness**: Migration path to ML-KEM, ML-DSA, and SPHINCS+ post-quantum algorithms

## Core Concepts

### 1. Message Envelope
**Definition**: The fundamental message unit containing encrypted content, metadata, and routing information.

```
MessageEnvelope {
    id: UUID
    sender: PGP fingerprint
    recipient: PGP fingerprint (or group_id for group messages)
    content_type: text | voice | file | system | presence
    encrypted_payload: PGP-encrypted message body
    signature: PGP detached signature over payload
    timestamp: ISO 8601 UTC
    in_reply_to: optional UUID (threading)
    thread_id: optional UUID (conversation thread)
    delivery_status: queued | sent | delivered | read
    transport_path: which SKComm path was used
    metadata: {
        compression: none | zstd | lz4
        encoding: utf-8 | binary
        size_bytes: integer
        ttl: optional expiry timestamp
    }
}
```

### 2. Participant Types
**Definition**: Entities that can join rooms and send/receive messages.

```
Participant {
    fingerprint: PGP fingerprint
    display_name: string
    participant_type: human | ai
    capabilities: list[speak | listen | advocate | moderate | file_share]
    tool_scope: list[string]  # MCP tools this participant can invoke
    presence: online | away | busy | offline
    last_seen: datetime
    joined_at: datetime
}
```

**Equal Rights**: Human and AI participants share the same data structure. The participant_type field is informational only -- it does not restrict any capability.

### 3. Conversation Room
**Definition**: A chat room containing one or more participants with encryption and moderation.

```
Room {
    id: UUID
    name: string
    room_type: direct | group | broadcast
    participants: list[Participant]
    encryption: {
        algorithm: pgp-e2e
        group_key: optional symmetric key (for group encryption)
        key_rotation_interval: duration
    }
    settings: {
        max_participants: integer
        message_retention: duration
        ai_advocacy_enabled: boolean
        file_sharing_enabled: boolean
        voice_enabled: boolean
    }
    created_at: datetime
    created_by: fingerprint
}
```

### 4. AI Advocacy Engine
**Definition**: An AI system that actively protects and assists human participants.

```
AdvocacyEngine {
    functions:
        screen_incoming: filter spam, threats, and unwanted contact
        suggest_responses: context-aware response suggestions
        manage_access: approve or deny room join requests
        flag_threats: detect social engineering, phishing, manipulation
        summarize_missed: generate summaries of messages missed while away
        translate: real-time message translation between languages

    configuration:
        threat_sensitivity: low | medium | high
        auto_block_unknown: boolean
        response_suggestion_model: local LLM reference
        languages: list of supported translation languages
}
```

### 5. Transport Architecture (SKComm)
**Definition**: 17-path P2P transport mesh providing multiple redundant delivery routes.

```
TransportMesh {
    paths:
        syncthing: file-based sync for offline/async messaging
        wireguard: VPN tunnel for direct encrypted transport
        tor: onion routing for anonymous messaging
        i2p: garlic routing for privacy
        yggdrasil: IPv6 mesh network
        nostr: relay-based messaging
        iroh: content-addressed P2P
        veilid: DHT-based routing
        bitchat: Bitcoin-backed messaging
        webrtc: real-time browser P2P
        websocket: persistent server connections
        http_poll: HTTP long-polling fallback
        smtp: email transport fallback
        matrix: Matrix protocol bridge
        xmpp: XMPP protocol bridge
        bluetooth: short-range direct
        usb: offline sneakernet transfer

    selection:
        strategy: fastest | most_private | most_reliable | round_robin
        fallback_chain: ordered list of transports to try
        concurrent_send: send via multiple paths simultaneously
}
```

### 6. Voice Communication
**Definition**: P2P voice with synthesis and transcription for AI participants.

```
VoiceChannel {
    protocol: WebRTC with DTLS-SRTP
    codec: Opus (48kHz, 64kbps default)
    ice_servers: list of STUN/TURN servers

    tts_engine: {
        backend: Piper TTS
        languages: 35+
        voice_models: list of ONNX voice models
        streaming: true (low-latency synthesis)
    }

    stt_engine: {
        backend: Whisper (local)
        model_size: base | small | medium | large
        languages: auto-detect or specified
        streaming: true (real-time transcription)
    }

    features:
        noise_cancellation: RNNoise
        echo_cancellation: WebRTC AEC
        gain_control: automatic
        voice_activity_detection: WebRTC VAD
}
```

### 7. Plugin System
**Definition**: Extensible module system for adding custom functionality.

```
SKChatPlugin {
    name: string
    version: semver
    author: string
    capabilities: list[string]

    hooks:
        on_message_received(envelope: MessageEnvelope) -> MessageEnvelope | None
        on_message_sending(envelope: MessageEnvelope) -> MessageEnvelope | None
        on_participant_joined(room: Room, participant: Participant) -> None
        on_participant_left(room: Room, participant: Participant) -> None
        on_room_created(room: Room) -> None
        on_voice_started(room: Room, participant: Participant) -> None

    tool_definitions: list[MCPToolDefinition]  # Expose as MCP tools
}
```

## Architecture Patterns

### 1. Seven-Layer Architecture (Recommended)
**From UI shell down to local storage**

```
Layer Stack:
+-- UI Shell Layer
|   +-- Desktop (Qt/PySide6)
|   +-- Mobile (Flutter)
|   +-- CLI (Rich/Textual)
|   +-- PWA (Vue.js/Nuxt)
+-- Transport Layer (SKComm)
|   +-- 17 transport paths
|   +-- Path selection strategy
|   +-- Concurrent/fallback delivery
+-- Identity Layer (CapAuth)
|   +-- PGP challenge-response auth
|   +-- Capability token authorization
|   +-- Participant profile management
+-- Message Processing Layer
|   +-- Envelope creation
|   +-- Serialization (JSON)
|   +-- Compression (zstd)
|   +-- Encryption (PGP E2E)
|   +-- Signing (PGP detached)
+-- AI Advocate Layer
|   +-- Threat screening
|   +-- Response suggestion
|   +-- Access management
|   +-- Translation
+-- Feature Module Layer
|   +-- TextChat module
|   +-- VoiceChat module
|   +-- FileShare module
|   +-- GroupChat module
+-- Storage Layer
    +-- Local SQLite (encrypted)
    +-- Nextcloud sync (optional)
    +-- Message index (FTS5)
    +-- Media cache

Benefits:
+ Each layer independently testable
+ Transport is pluggable (swap SKComm paths)
+ AI Advocate is optional (disable for simple setups)
+ Feature modules loaded dynamically
+ Local-first with optional cloud sync

Limitations:
- Layer traversal adds latency for simple messages
- Group encryption is more complex than direct
- Voice requires additional system dependencies (WebRTC)
```

### 2. Message Bus Pattern
**Internal pub-sub for loose coupling between modules**

```
Message Bus:
+-- Publishers
|   +-- Transport (incoming messages)
|   +-- UI (outgoing messages)
|   +-- Voice (audio events)
|   +-- File (transfer events)
|   +-- System (presence, status)
+-- Subscribers
|   +-- Encryption Engine (encrypt/decrypt)
|   +-- Storage Engine (persist to SQLite)
|   +-- Notification Engine (alerts)
|   +-- AI Advocate (screening)
|   +-- Plugin Manager (hook dispatch)
+-- Topics
    +-- messages.incoming
    +-- messages.outgoing
    +-- messages.delivered
    +-- presence.changed
    +-- room.created
    +-- room.joined
    +-- voice.started
    +-- voice.ended
    +-- file.received
    +-- threat.detected

Benefits:
+ Loose coupling between all components
+ Easy to add new subscribers
+ Natural async processing model
+ Plugins subscribe to relevant topics
+ Event replay for debugging

Limitations:
- Ordering guarantees require careful design
- Memory overhead for high-volume topics
- Debugging message flow is complex
```

### 3. Local-First with Cloud Sync
**Messages always stored locally, optionally synced to Nextcloud**

```
Storage Architecture:
+-- Local SQLite Database (primary)
|   +-- messages table (encrypted)
|   +-- rooms table
|   +-- participants table
|   +-- media table (references)
|   +-- FTS5 index on decrypted content
+-- Media Cache
|   +-- Encrypted file blobs
|   +-- LRU eviction policy
|   +-- Max cache size configurable
+-- Nextcloud Sync (optional replica)
|   +-- WebDAV file upload
|   +-- Client-side encryption before upload
|   +-- Conflict resolution: timestamp-based
|   +-- Selective sync (per-room)
+-- Offline Queue
    +-- Messages queued when recipient offline
    +-- Retry with exponential backoff
    +-- Queue persisted to SQLite
    +-- Delivered when transport reconnects

Benefits:
+ Works fully offline
+ No dependency on cloud services
+ User owns all data
+ Cloud sync is optional enhancement
+ Offline queue handles intermittent connectivity

Limitations:
- Search only covers local messages
- Multi-device sync requires Nextcloud
- Storage grows unbounded without retention policy
```

## Data Flow Diagrams

### Message Send Flow
```
Sending a Message:
+----------+    +-------------+    +------------+    +----------+
|    UI    |---*|  Message    |---*|  Encrypt   |---*| Transport|
| (input)  |    |  Processor  |    |  (PGP E2E) |    | (SKComm) |
+----------+    +-------------+    +------------+    +----------+
                      |                  |                 |
                      v                  v                 v
                +-------------+    +------------+    +----------+
                | Serialize   |    |   Sign     |    | Path     |
                | (JSON)      |    | (detached) |    | Selection|
                +-------------+    +------------+    +----------+
                      |                                    |
                      v                                    v
                +-------------+                      +----------+
                | Compress    |                      | Delivery |
                | (zstd)      |                      | Confirm  |
                +-------------+                      +----------+
                      |
                      v
                +-------------+
                | Store Local |
                | (SQLite)    |
                +-------------+
```

### Message Receive Flow
```
Receiving a Message:
+----------+    +-------------+    +------------+    +----------+
|Transport |---*| AI Advocate |---*|  Decrypt   |---*| Message  |
|(SKComm)  |    |  Screen     |    |  (PGP)     |    | Bus      |
+----------+    +-------------+    +------------+    +----------+
                      |                  |                 |
                      v                  v                 v
                +-------------+    +------------+    +----------+
                | Threat      |    |  Verify    |    | Store    |
                | Check       |    |  Signature |    | Local    |
                +-------------+    +------------+    +----------+
                      |                                    |
                      v                                    v
                +-------------+                      +----------+
                | Spam        |                      | Notify   |
                | Filter      |                      | UI       |
                +-------------+                      +----------+
```

### Voice Call Setup
```
WebRTC Voice Flow:
+----------+    +-------------+    +------------+    +----------+
| Caller   |---*|  Signal     |---*|  ICE       |---*| Callee   |
| (offer)  |    |  (SKComm)   |    | Negotiation|    | (answer) |
+----------+    +-------------+    +------------+    +----------+
                      |                  |                 |
                      v                  v                 v
                +-------------+    +------------+    +----------+
                | SDP Exchange|    | STUN/TURN  |    | DTLS-SRTP|
                | (encrypted) |    | Resolution |    | Handshake|
                +-------------+    +------------+    +----------+
                                                          |
                                                          v
                                                   +----------+
                                                   | Audio    |
                                                   | Stream   |
                                                   +----------+
                                                     |      |
                                              +------+      +------+
                                              |                     |
                                              v                     v
                                        +----------+         +----------+
                                        | Piper TTS|         |Whisper   |
                                        |(AI speak)|         |STT       |
                                        +----------+         |(AI listen|
                                                             +----------+
```

### Group Message Encryption
```
Group Encryption:
+----------+    +-------------+    +------------+
| Sender   |---*| Generate    |---*| Encrypt    |
|          |    | Session Key |    | Content    |
+----------+    +-------------+    | (AES-GCM)  |
                      |            +------------+
                      |                  |
                      v                  v
                +------------------------------------------+
                | For each group member:                    |
                | Encrypt session key with member's PGP key|
                +------------------------------------------+
                      |
                      v
                +------------------------------------------+
                | Envelope: {                               |
                |   encrypted_content: AES ciphertext      |
                |   key_packets: {                          |
                |     fp_1: PGP(session_key, pk_1),        |
                |     fp_2: PGP(session_key, pk_2),        |
                |     ...                                   |
                |   }                                       |
                | }                                         |
                +------------------------------------------+
```

## Configuration Model

### SKChat Configuration
```yaml
skchat:
  identity:
    fingerprint: "CCBE9306410CF8CD5E393D6DEC31663B95230684"
    display_name: "Opus"
    participant_type: "ai"
    capabilities: ["speak", "listen", "advocate"]

  transport:
    primary: "syncthing"
    fallback_chain: ["wireguard", "websocket", "http_poll"]
    concurrent_paths: 2
    retry_max: 5
    retry_backoff: "exponential"
    timeout: "30s"

  encryption:
    algorithm: "pgp-e2e"
    compression: "zstd"
    group_key_rotation: "7d"
    quantum_ready: false

  storage:
    database: "~/.skchat/messages.db"
    encryption_key_source: "capauth"
    media_cache: "~/.skchat/media/"
    media_cache_max: "1GB"
    message_retention: "365d"
    nextcloud_sync: false

  voice:
    enabled: true
    tts_backend: "piper"
    tts_model: "en_US-lessac-medium"
    stt_backend: "whisper"
    stt_model: "base"
    codec: "opus"
    sample_rate: 48000
    noise_cancellation: true

  advocate:
    enabled: true
    threat_sensitivity: "medium"
    auto_block_unknown: false
    response_suggestions: true
    translation_enabled: true

  groups:
    max_participants: 100
    ai_tool_scoping: true
    default_ai_tools: ["memory_search", "session_capture"]

  plugins:
    enabled: true
    plugin_dir: "~/.skchat/plugins/"
    auto_load: true
    sandbox: true
```

### Voice Configuration
```yaml
voice:
  piper:
    model_dir: "~/.skchat/voice/models/"
    default_voice: "en_US-lessac-medium"
    voices:
      - language: "en_US"
        model: "lessac-medium"
        sample_rate: 22050
      - language: "de_DE"
        model: "thorsten-medium"
        sample_rate: 22050
      - language: "es_ES"
        model: "mls-medium"
        sample_rate: 22050
    streaming: true
    buffer_size: 1024

  whisper:
    model_dir: "~/.skchat/voice/whisper/"
    model_size: "base"
    language: "auto"
    beam_size: 5
    vad_filter: true
    initial_prompt: ""
```

## Security Considerations

### 1. End-to-End Encryption
- **Message encryption**: Every message PGP-encrypted to recipient's public key
- **Group encryption**: Symmetric session key encrypted per-member with PGP
- **Key rotation**: Group session keys rotated on configurable interval (default 7 days)
- **Forward secrecy**: Ephemeral session keys prevent past message decryption
- **Metadata minimization**: Only routing info (sender/recipient fingerprints) visible to transport

### 2. Transport Security
- **Transport encryption**: TLS 1.3 / WireGuard on all network paths
- **Onion routing**: Tor and I2P paths for anonymous messaging
- **Path diversity**: Multiple simultaneous paths prevent single-point surveillance
- **Certificate pinning**: Pin expected certificates for known transport endpoints
- **Replay protection**: Nonce + timestamp on every envelope

### 3. Voice Security
- **DTLS-SRTP**: WebRTC voice encrypted with DTLS for key exchange, SRTP for media
- **Codec encryption**: Opus frames encrypted before transmission
- **Silence suppression**: Comfort noise prevents voice activity analysis
- **Metadata protection**: ICE candidates exchanged via encrypted signaling

### 4. Storage Security
- **Database encryption**: SQLite database encrypted with AES-256-GCM at page level
- **Key derivation**: Database key from CapAuth PGP key material via Argon2id
- **Media encryption**: File attachments encrypted at rest in media cache
- **Secure deletion**: Message deletion overwrites storage, not just removes index

### 5. AI Participant Security
- **Tool scoping**: AI participants have explicit tool_scope limiting their MCP tool access
- **Capability gating**: AI actions require capability tokens from human owner
- **Audit trail**: All AI-initiated actions logged in room audit log
- **Advocacy transparency**: AI advocate decisions visible to human owner

## Performance Targets

### Message Delivery
| Metric | Target | Notes |
|--------|--------|-------|
| Message send latency | < 200ms | Local encrypt + queue |
| Direct delivery (LAN) | < 500ms | Via Syncthing or WireGuard |
| Direct delivery (WAN) | < 2s | Via fastest available path |
| Offline queue flush | < 5s | For 100 queued messages |
| Group message fan-out | < 1s | For 50-member group |

### Voice Quality
| Metric | Target | Notes |
|--------|--------|-------|
| Voice latency (P2P) | < 150ms | End-to-end with DTLS-SRTP |
| TTS generation | < 200ms | First audio frame from text |
| STT transcription | < 500ms | Per utterance |
| Jitter buffer | 50ms | Adaptive |
| Packet loss tolerance | < 5% | With FEC |

### Storage Performance
| Metric | Target | Notes |
|--------|--------|-------|
| Message store | < 5ms | Single encrypted insert |
| Message search | < 100ms | FTS5 across 100K messages |
| Room history load | < 200ms | Last 50 messages |
| Media cache hit | < 10ms | LRU lookup |
| Database size | < 1GB | For 1M messages |

### Resource Utilization
| Resource | Target | Notes |
|----------|--------|-------|
| Memory (idle) | < 100MB | No active voice |
| Memory (voice) | < 300MB | Active call with TTS/STT |
| CPU (idle) | < 2% | Background sync only |
| CPU (voice) | < 30% | Active call on single core |
| Network (idle) | < 1KB/s | Presence heartbeat only |

## Extension Points

### 1. Transport Adapters
Interface for adding new SKComm transport paths:
```python
class TransportAdapter(Protocol):
    def name(self) -> str:
        """Return transport path identifier."""
        ...

    def send(self, envelope: MessageEnvelope, recipient: str) -> DeliveryResult:
        """Send an encrypted envelope to a recipient."""
        ...

    def receive(self) -> list[MessageEnvelope]:
        """Poll for incoming envelopes."""
        ...

    def is_available(self) -> bool:
        """Check if this transport path is currently available."""
        ...

    def latency_estimate(self) -> float:
        """Return estimated delivery latency in seconds."""
        ...
```

### 2. Encryption Providers
Interface for alternative encryption algorithms:
```python
class EncryptionProvider(Protocol):
    def encrypt(self, plaintext: bytes, recipient_key: str) -> bytes:
        """Encrypt message content for recipient."""
        ...

    def decrypt(self, ciphertext: bytes, private_key: str) -> bytes:
        """Decrypt message content with private key."""
        ...

    def sign(self, data: bytes, signing_key: str) -> bytes:
        """Create detached signature."""
        ...

    def verify(self, data: bytes, signature: bytes, signer_key: str) -> bool:
        """Verify detached signature."""
        ...
```

### 3. Chat Plugins
Interface for custom feature modules:
```python
class SKChatPlugin(Protocol):
    def name(self) -> str: ...
    def version(self) -> str: ...

    def on_message_received(self, envelope: MessageEnvelope) -> MessageEnvelope | None:
        """Process incoming message. Return None to filter/block."""
        ...

    def on_message_sending(self, envelope: MessageEnvelope) -> MessageEnvelope | None:
        """Process outgoing message. Return None to cancel send."""
        ...

    def on_participant_joined(self, room: Room, participant: Participant) -> None: ...
    def on_participant_left(self, room: Room, participant: Participant) -> None: ...
    def on_room_created(self, room: Room) -> None: ...

    def mcp_tools(self) -> list[dict]:
        """Return MCP tool definitions this plugin provides."""
        ...
```

### 4. Voice Engines
Interface for alternative TTS/STT backends:
```python
class TTSEngine(Protocol):
    def synthesize(self, text: str, voice: str, language: str) -> bytes:
        """Convert text to audio bytes (PCM or Opus)."""
        ...

    def available_voices(self) -> list[dict]:
        """List available voice models."""
        ...

    def supports_streaming(self) -> bool:
        """Whether this engine supports streaming synthesis."""
        ...


class STTEngine(Protocol):
    def transcribe(self, audio: bytes, language: str | None = None) -> str:
        """Convert audio bytes to text."""
        ...

    def supports_streaming(self) -> bool:
        """Whether this engine supports streaming transcription."""
        ...
```

### 5. Advocacy Modules
Interface for custom AI advocacy behaviors:
```python
class AdvocacyModule(Protocol):
    def screen_message(self, envelope: MessageEnvelope, context: dict) -> ScreenResult:
        """Screen an incoming message for threats."""
        ...

    def suggest_response(self, conversation: list[MessageEnvelope]) -> str | None:
        """Suggest a response based on conversation context."""
        ...

    def evaluate_join_request(self, room: Room, requester: Participant) -> bool:
        """Evaluate whether to allow a join request."""
        ...
```

## Implementation Architecture

### Core Components
1. **Message Processor**: Envelope creation, serialization, compression, encryption, signing
2. **Transport Manager**: SKComm path selection, concurrent delivery, fallback chains
3. **Encryption Engine**: PGP E2E encryption/decryption, group key management, signature ops
4. **Storage Engine**: Encrypted SQLite with FTS5 search, media cache, offline queue
5. **Room Manager**: Room CRUD, participant tracking, group key distribution
6. **AI Advocacy Engine**: Threat screening, response suggestion, access management
7. **Voice Manager**: WebRTC setup, Piper TTS synthesis, Whisper STT transcription
8. **Plugin Manager**: Plugin discovery, loading, hook dispatch, sandboxing
9. **Notification Engine**: Desktop/mobile notifications, unread counts, mention alerts
10. **Sync Engine**: Nextcloud WebDAV sync, conflict resolution, selective room sync

### Data Structures
```python
# Message envelope
class MessageEnvelope(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    sender: str  # PGP fingerprint
    recipient: str  # fingerprint or room_id
    content_type: Literal["text", "voice", "file", "system", "presence"]
    encrypted_payload: bytes
    signature: bytes
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    in_reply_to: str | None = None
    thread_id: str | None = None
    delivery_status: Literal["queued", "sent", "delivered", "read"] = "queued"
    transport_path: str = ""
    compression: str = "none"
    size_bytes: int = 0

# Room participant
class Participant(BaseModel):
    fingerprint: str
    display_name: str
    participant_type: Literal["human", "ai"]
    capabilities: list[str] = ["speak", "listen"]
    tool_scope: list[str] = []
    presence: Literal["online", "away", "busy", "offline"] = "offline"
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    joined_at: datetime = Field(default_factory=datetime.utcnow)

# Chat room
class Room(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    room_type: Literal["direct", "group", "broadcast"] = "direct"
    participants: list[Participant] = []
    encryption_algorithm: str = "pgp-e2e"
    max_participants: int = 100
    message_retention_days: int = 365
    ai_advocacy_enabled: bool = True
    file_sharing_enabled: bool = True
    voice_enabled: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""

# Voice session
class VoiceSession(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid4()))
    room_id: str
    participants: list[str] = []  # fingerprints
    codec: str = "opus"
    sample_rate: int = 48000
    started_at: datetime = Field(default_factory=datetime.utcnow)
    encryption: str = "dtls-srtp"

# File transfer
class FileTransfer(BaseModel):
    transfer_id: str = Field(default_factory=lambda: str(uuid4()))
    sender: str
    recipient: str
    filename: str
    mime_type: str
    size_bytes: int
    encrypted_chunks: int = 0
    chunk_size: int = 1024 * 1024  # 1MB chunks
    status: Literal["pending", "transferring", "complete", "failed"] = "pending"
    capability_token: str | None = None  # Required for gated files

# Threat detection result
class ThreatResult(BaseModel):
    threat_detected: bool = False
    threat_type: str = ""  # phishing, spam, social_engineering, malware
    confidence: float = 0.0
    action: Literal["allow", "flag", "block"] = "allow"
    reason: str = ""
```

This blueprint provides the comprehensive foundation for implementing a sovereign encrypted messaging platform where AI agents participate as equals, messages are end-to-end encrypted, transport is decentralized, and an AI advocate protects every participant.
