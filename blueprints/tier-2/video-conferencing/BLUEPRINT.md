# Video Conferencing Platform Blueprint
> Zoom / Google Meet / Jitsi alternative

## Overview
Real-time video/audio conferencing platform supporting 1:1 calls, group meetings, webinars, screen sharing, recording, and virtual backgrounds. Built on WebRTC with a Selective Forwarding Unit (SFU) architecture for scalability.

## Market Analysis
| Platform | Users | Pricing | Key Differentiator |
|----------|-------|---------|-------------------|
| Zoom | 300M+ | Free/$13.33/$18.33 | Reliability, breakout rooms |
| Google Meet | 300M+ | Free (w/ Google) | Google ecosystem |
| Jitsi | Self-host | Free/open-source | No account needed |
| LiveKit | Infra | Open-source + cloud | Developer-first SFU |
| Daily.co | API | $0.004/min | Embedded video API |
| 100ms | API | Free tier + usage | Low-latency infra |

## Core Concepts
- **SFU (Selective Forwarding Unit)**: Server receives all streams, forwards selectively (vs MCU which transcodes)
- **WebRTC**: Browser-native real-time communication (SRTP for media, SCTP for data)
- **Simulcast**: Sender publishes multiple quality layers; SFU picks best for each receiver
- **Opaqueocal**: ICE/STUN/TURN for NAT traversal
- **Rooms**: Isolated meeting sessions with participant management
- **Tracks**: Individual audio/video/screen streams per participant

## Architecture

```
┌──────────────────────────────────────────────┐
│              Signaling Server (WSS)           │
│         (room mgmt, auth, SDP exchange)       │
├──────────────────────────────────────────────┤
│                SFU Cluster                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │  SFU 1  │ │  SFU 2  │ │  SFU 3  │        │
│  │ (room A)│ │ (room B)│ │ (room C)│        │
│  └─────────┘ └─────────┘ └─────────┘        │
│         Cascading for cross-node rooms        │
├──────────────────────────────────────────────┤
│  TURN Server │ Recording │ API Service       │
│  (coturn)    │ (Egress)  │ (REST + Auth)     │
├──────────────────────────────────────────────┤
│  Redis (signaling state) │ Postgres (users)  │
│  S3 (recordings)         │ NATS (events)     │
└──────────────────────────────────────────────┘
```

### Data Model
```sql
users (id, email, name, avatar)
rooms (id, name, created_by, scheduled_at, duration_min, settings_json, recording_enabled)
-- settings_json: {max_participants, mute_on_join, waiting_room, e2ee}
room_participants (room_id, user_id, role, joined_at, left_at)
recordings (id, room_id, s3_key, duration, size, format, created_at)
chat_messages (id, room_id, user_id, content, ts)
```

### Meeting Flow
```
1. Host creates room → gets room_id + join URL
2. Participant opens URL → authenticate → connect WebSocket to signaling server
3. Signaling server assigns SFU node → returns SFU endpoint
4. Client connects to SFU via WebRTC (ICE negotiation)
5. Client publishes audio + video tracks (simulcast: high/medium/low)
6. SFU forwards tracks to other participants (quality adapted per receiver)
7. Screen share: additional video track published
8. Recording: SFU forwards streams to egress service → composite → S3
```

### Key Protocols
```
Signaling: WebSocket (JSON-RPC or custom protocol)
  → join(room_id, token) → offer/answer SDP exchange
  → track published/subscribed events
  → participant join/leave events

Media: WebRTC (SRTP)
  → Audio: Opus codec (48kHz, ~32kbps)
  → Video: VP8/VP9/H.264 (simulcast: 720p + 360p + 180p)
  → Screen: VP9 (high resolution, low frame rate)

Data Channel: SCTP over WebRTC
  → Chat messages, reactions, file transfer
```

## API Design
```
# Rooms
POST   /api/v1/rooms                   # Create room
GET    /api/v1/rooms/:id               # Room info
POST   /api/v1/rooms/:id/token         # Generate participant token
DELETE /api/v1/rooms/:id               # End room

# Participants
GET    /api/v1/rooms/:id/participants
POST   /api/v1/rooms/:id/participants/:uid/mute
POST   /api/v1/rooms/:id/participants/:uid/remove

# Recording
POST   /api/v1/rooms/:id/recording/start
POST   /api/v1/rooms/:id/recording/stop
GET    /api/v1/recordings/:id/download

# Webhooks
POST   /api/v1/webhooks               # Register webhook
  Events: room.started, room.ended, participant.joined,
          participant.left, recording.completed
```

## Security
- DTLS-SRTP for all media (encrypted in transit)
- Optional E2EE via Insertable Streams (sender encrypts, SFU can't decrypt)
- JWT tokens for room access with expiration
- Waiting room / host approval before join
- TURN server with auth (prevents abuse)
- Rate limit room creation

## Performance Targets
| Metric | Target |
|--------|--------|
| Join-to-first-frame | < 2s |
| Audio latency | < 150ms |
| Video latency | < 300ms |
| Max participants (SFU) | 100-500 per room |
| Max participants (webinar) | 10K+ (subscribe-only) |
| Recording start | < 5s |

## Tech Stack
| Component | Recommended | Alternatives |
|-----------|------------|-------------|
| SFU | LiveKit (Go) | mediasoup (TS), ion-sfu (Go), Janus (C) |
| Signaling | Go/Rust WebSocket | Node.js |
| TURN | coturn | Pion TURN |
| Recording | LiveKit Egress | GStreamer pipeline |
| Frontend | React + livekit-client | plain WebRTC API |
| Mobile | React Native / Flutter | Native WebRTC |

## MVP Tiers

### Tier 1 — Basic Calls (2-4 weeks)
- 1:1 and group video/audio (up to 10 participants)
- Screen sharing
- Mute/unmute controls
- Chat during meeting
- Use LiveKit as SFU (don't build your own)

### Tier 2 — Meeting Management (4-8 weeks)
- Scheduled meetings with calendar links
- Waiting room
- Recording to S3
- Virtual backgrounds (TensorFlow.js body segmentation)
- Breakout rooms

### Tier 3 — Scale (8-14 weeks)
- Webinar mode (speakers + audience)
- SFU cascading for multi-region
- Live streaming (RTMP egress to YouTube/Twitch)
- Transcription (Whisper)
- AI meeting notes

### Tier 4 — Enterprise (14-20 weeks)
- E2EE
- SSO/SAML
- Admin dashboard with analytics
- Custom branding
- SIP/PSTN dial-in (phone bridge)
- Compliance recording
