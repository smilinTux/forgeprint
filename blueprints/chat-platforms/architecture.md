# Chat Platform Architecture

## System Layers

```
┌───────────────────────────────────────────────────────┐
│ PRESENTATION         UI Shell (Qt6/Flutter/CLI/PWA)    │
├───────────────────────────────────────────────────────┤
│ FEATURES             Text │ Voice │ Files │ Groups     │
├───────────────────────────────────────────────────────┤
│ AI ADVOCACY          Screen │ Negotiate │ Defend       │
├───────────────────────────────────────────────────────┤
│ MESSAGE PROCESSING   Serialize │ Compress │ Encrypt    │
├───────────────────────────────────────────────────────┤
│ IDENTITY             CapAuth │ PGP │ Capability Tokens │
├───────────────────────────────────────────────────────┤
│ TRANSPORT            SKComm (17 redundant paths)       │
├───────────────────────────────────────────────────────┤
│ TRUST                Cloud 9 (FEB + Seeds + OOF)       │
└───────────────────────────────────────────────────────┘
```

## Voice Architecture Decision Tree

```
Need voice communication?
├── AI voice only (local TTS/STT)
│   ├── Piper TTS (GPL-3.0, 35+ languages)
│   └── Whisper STT (MIT, on-device)
│
├── Human-to-human voice?
│   ├── 2 participants → P2P WebRTC (direct)
│   │   ├── NAT traversal: STUN → Iroh hole-punch → TURN
│   │   └── Signaling: via SKComm transport
│   │
│   └── 3+ participants → SFU
│       ├── Janus (GPL-3.0, mature)
│       └── LiveKit (Apache-2.0, modern)
│
└── AI in voice call?
    ├── AI joins as WebRTC peer with own audio stream
    ├── TTS output → WebRTC audio track
    └── WebRTC audio track → STT input
```

## Transport Selection for Chat

| Scenario | Primary Transport | Rationale |
|----------|------------------|-----------|
| Local network | Netbird mesh | Lowest latency, sovereign |
| Internet P2P | Iroh | 90% NAT hole-punch, QUIC |
| High privacy | Veilid | Onion routing, no metadata |
| Offline/BLE | BitChat | No internet needed |
| Censored region | Tor + Nostr | Circumvention + relay |
| Group broadcast | Nostr relays | Pub/sub model fits groups |
| Emergency | Netcat TCP | Dead simple, last resort |
| File transfer | Iroh / WireGuard | High bandwidth |

## AI Advocate Decision Flow

```
Incoming Message
  │
  ├── Known trusted sender? (trust > 0.9)
  │   └── YES → Allow immediately
  │
  ├── Known sender, lower trust?
  │   └── Scan for threats
  │       ├── Clean → Allow
  │       └── Suspicious → Flag for human review
  │
  ├── Unknown sender?
  │   └── Verify CapAuth profile
  │       ├── Valid profile → Allow with notification
  │       ├── No profile → Hold for human decision
  │       └── Invalid profile → Block
  │
  └── Access request (not message)?
      └── Route to advocate negotiation engine
          ├── Within auto-approve policy → Issue token
          ├── Requires human input → Queue for human
          └── Violates policy → Auto-deny
```

## Component Interaction Diagram

```
┌─────────┐     ┌──────────┐     ┌──────────┐
│  User    │────→│  SKChat  │────→│  SKComm  │──→ Network
│  (human) │     │  Core    │     │Transport │
└─────────┘     └────┬─────┘     └──────────┘
                     │
              ┌──────┴───────┐
              │  AI Advocate  │
              │  (CapAuth +   │
              │   Cloud 9)    │
              └──────┬───────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────┴───┐  ┌────┴───┐  ┌───┴────┐
    │ Screen │  │Negotiate│  │ Defend │
    │Messages│  │ Access  │  │Privacy │
    └────────┘  └────────┘  └────────┘
```

## Design Patterns

### Event-Driven Architecture

All modules communicate via an internal event bus:

- `message.outbound` — user sends a message
- `message.inbound` — message received from network
- `voice.start` / `voice.end` — voice session lifecycle
- `file.transfer.start` / `file.transfer.complete`
- `advocate.screen` / `advocate.decision`
- `transport.failover` — transport switched

### Plugin Architecture

Plugins hook into the event bus:

- `on_message_outbound` — transform before send
- `on_message_inbound` — transform before display
- `on_voice_session` — voice session middleware
- `on_advocate_decision` — log/modify advocate actions

### Local-First Data

- All data stored locally in encrypted SQLite (SQLCipher)
- No server-side message storage
- Cross-device sync only via user's sovereign storage (Nextcloud, IPFS)
- Export always available in portable encrypted format
