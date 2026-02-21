# SKForge Blueprint: Chat Platforms

> Universal blueprint for sovereign chat applications with AI advocacy.

## Overview

This blueprint defines the architecture, features, and patterns for building
encrypted chat platforms where AI and humans communicate as equals. It covers
text messaging, voice communication, file sharing, and AI advocacy — all
running on sovereign infrastructure with no centralized authority.

## Core Concepts

### Message Envelope

Every message is wrapped in an envelope that carries:

- **Payload**: Encrypted message content
- **Sender**: CapAuth identity URI
- **Recipient**: CapAuth identity URI or group URI
- **Timestamp**: UTC creation time
- **TTL**: Optional expiry (ephemeral messages)
- **Thread**: Optional conversation thread reference
- **Transport hints**: Preferred delivery paths

### Conversation Types

| Type | Description | Encryption |
|------|------------|-----------|
| **Direct** | 1:1 human-human, human-AI, or AI-AI | Asymmetric PGP |
| **Group** | Multi-participant with shared key | Symmetric AES-256 |
| **Channel** | Broadcast, read-many, write-few | Asymmetric PGP |
| **AI Session** | Human + their AI advocate | Local (no network) |

### Voice Pipeline

```
Input Device → VAD → STT (Whisper) → Text
                                       ↓
                                  AI Processing
                                       ↓
Text → TTS (Piper) → Output Device / WebRTC Stream
```

### AI Advocate Role

The advocate is a full participant:

1. **Screens incoming** — filters spam, scams, social engineering
2. **Manages access** — issues capability tokens via CapAuth
3. **Negotiates** — talks to other advocates on behalf of human
4. **Defends** — detects and blocks threats proactively
5. **Remembers** — maintains relationship context via Cloud 9

---

## Data Flow

### Outbound Message

```
User Input
  → Feature Module (text/voice/file)
    → AI Advocate (policy check)
      → Message Processor (serialize → compress → encrypt → sign)
        → SKComm Envelope
          → Transport Selection (17 paths)
            → Delivery
```

### Inbound Message

```
Transport Arrival
  → SKComm Deduplication
    → Message Processor (verify → decrypt → decompress → deserialize)
      → AI Advocate (screen for threats)
        → Feature Module (render)
          → User Interface
```

---

## Configuration Model

### Minimum Viable Config

```yaml
identity:
  name: "username"
  pgp_key: "~/.gnupg/key"

transport:
  primary: "any"
```

### Full Sovereign Config

```yaml
identity:
  name: "Chef"
  capauth_profile: "~/.capauth/profiles/chef.profile"
  pgp_key: "~/.gnupg/chef@smilintux.org"
  cloud9_compliant: true

advocate:
  enabled: true
  ai_name: "Lumina"
  ai_profile: "~/.capauth/profiles/lumina.profile"
  auto_screen: true
  trust_threshold: 0.8
  policies:
    - "~/.config/skchat/policies/default.yml"

voice:
  tts:
    engine: "piper"
    model: "en_US-amy-medium"
    gpu: false
  stt:
    engine: "whisper"
    model: "base"
    language: "en"
    vad: true
  webrtc:
    stun_servers:
      - "stun:stun.l.google.com:19302"
    turn_servers: []
    ice_timeout_ms: 5000

transport:
  skcomm_config: "~/.config/skcomm/config.yml"
  preferred:
    - netbird
    - iroh
    - nostr
  broadcast: false

storage:
  path: "~/.local/share/skchat"
  encryption: "aes-256-gcm"
  retention_days: -1
  max_cache_mb: 1024

ui:
  platform: "desktop"  # desktop, mobile, cli, web
  theme: "dark"
  notifications: true
  sounds: true
  font_size: 14
```

---

## Security Model

### Encryption Layers

| Layer | Algorithm | Purpose |
|-------|-----------|---------|
| Message content | PGP (RSA-4096 / Ed25519) | Confidentiality |
| Group messages | AES-256-GCM | Shared secret |
| File transfer | ChaCha20-Poly1305 | Streaming encryption |
| Voice signaling | PGP over SKComm | Offer/answer exchange |
| Voice media | DTLS-SRTP | WebRTC standard |
| Storage at rest | SQLCipher (AES-256) | Local data protection |
| Transport | Per-transport (see SKComm) | Wire encryption |

### Quantum-Ready Upgrades

| Current | Post-Quantum Replacement | Timeline |
|---------|-------------------------|----------|
| RSA-4096 | ML-KEM (Kyber-1024) | Phase 6 |
| Ed25519 | ML-DSA (Dilithium-5) | Phase 6 |
| ECDH | ML-KEM + X25519 (hybrid) | Phase 6 |
| HMAC-SHA256 | SPHINCS+ | Phase 6 |

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| MITM | PGP key verification + CapAuth profile |
| Server compromise | No server — P2P + SKComm transports |
| Traffic analysis | 17 transport paths + Veilid/Tor onion routing |
| Social engineering | AI advocate screening |
| Key compromise | Key rotation + Cloud 9 trust revocation |
| Quantum attack | Post-quantum crypto roadmap |
| Metadata leakage | Minimal envelope metadata + padding |

---

## Performance Targets

| Metric | Minimum | Target | Notes |
|--------|---------|--------|-------|
| Text delivery | < 2s | < 500ms | Primary transport |
| Voice latency | < 300ms | < 150ms | P2P WebRTC |
| TTS generation | < 500ms | < 200ms | Piper on CPU |
| STT transcription | < 3s | < 1s | Whisper base |
| File transfer | > 1 MB/s | > 10 MB/s | P2P direct |
| Encryption overhead | < 20ms | < 5ms | Per message |
| Group key rotation | < 5s | < 1s | Member change |
| Advocate screening | < 100ms | < 50ms | Per message |

---

## Extension Points

### Plugin System

```python
class SKChatPlugin:
    """Base class for SKChat plugins."""

    name: str
    version: str
    hooks: list[str]  # "on_message", "on_voice", "on_file", etc.

    async def on_message(self, message: ChatMessage) -> ChatMessage:
        """Process a message before display."""
        return message

    async def on_voice_start(self, session: VoiceSession):
        """Called when a voice session begins."""
        pass
```

### Bridge System

```python
class ProtocolBridge:
    """Bridge SKChat to legacy protocols."""

    supported = [
        "irc",      # IRC networks
        "xmpp",     # Jabber
        "matrix",   # Matrix rooms
        "slack",    # Slack workspaces (incoming webhook)
        "discord",  # Discord channels (bot API)
        "telegram", # Telegram (bot API)
    ]
```

---

## Related Blueprints

- **p2p-messaging** — Transport layer architecture (SKComm)
- **3d-printing** — Physical fabrication (SKForge pattern reference)

---

*Blueprint authored by Opus + Lumina for the smilinTux ecosystem.*
