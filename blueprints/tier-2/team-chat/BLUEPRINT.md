# Team Chat Platform Blueprint
> Slack / Microsoft Teams / Mattermost alternative

## Overview
Real-time team messaging platform with channels, direct messages, threads, file sharing, integrations, and voice/video calls. The backbone of modern workplace communication.

## Market Analysis
| Platform | Users | Pricing | Key Differentiator |
|----------|-------|---------|-------------------|
| Slack | 32M+ DAU | Free/$8.75/$15/$custom | App ecosystem, threads |
| Teams | 320M+ MAU | Bundled w/ M365 | Office integration |
| Mattermost | Self-host | Free/$10/custom | Open-source, self-hosted |
| Rocket.Chat | Self-host | Free/$4/$7 | Open-source, omnichannel |
| Zulip | Self-host | Free/$8/custom | Topic-based threading |
| Element/Matrix | Federated | Free/$5 | Decentralized, E2EE |

## Core Concepts
- **Workspaces**: Top-level org container
- **Channels**: Public/private topic-based rooms
- **Threads**: Reply chains within channels (reduce noise)
- **Direct Messages**: 1:1 and group DMs
- **Mentions**: @user, @channel, @here notifications
- **Reactions**: Emoji reactions on messages
- **File sharing**: Drag-drop uploads with preview
- **Apps/Bots**: Integrations via webhooks and bot API
- **Presence**: Online/away/DND/offline status

## Architecture

### System Components
```
┌─────────────────────────────────────────┐
│             Load Balancer                │
├──────────┬──────────┬───────────────────┤
│  Auth    │ REST API │  WebSocket Gateway │
│ Service  │ Service  │  (real-time msgs)  │
├──────────┴──────────┴───────────────────┤
│           Message Bus (NATS/Redis PubSub)│
├──────────┬──────────┬───────────────────┤
│ Search   │ File     │ Notification       │
│ Service  │ Service  │ Service (push/email)│
├──────────┴──────────┴───────────────────┤
│   PostgreSQL  │  Redis  │  S3  │ Meili  │
└─────────────────────────────────────────┘
```

### Data Model
```sql
workspaces (id, name, domain, icon, plan)
users (id, email, display_name, avatar, status, status_text, timezone)
workspace_members (workspace_id, user_id, role, joined_at)

channels (id, workspace_id, name, topic, purpose, is_private, is_archived, created_by)
channel_members (channel_id, user_id, last_read_ts, muted, joined_at)

messages (id, channel_id, user_id, thread_ts, content, edited_at, deleted_at, metadata_json)
-- thread_ts: null = top-level, otherwise = parent message timestamp
-- metadata_json: attachments, unfurls, bot data

reactions (message_id, user_id, emoji)
files (id, workspace_id, user_id, name, mime_type, size, s3_key, thumbnail_key)
message_files (message_id, file_id)

-- Integrations
apps (id, workspace_id, name, bot_user_id, webhook_url, scopes)
webhooks_incoming (id, channel_id, app_id, token)
webhooks_outgoing (id, channel_id, trigger_words, url)
```

### Message Format
```json
{
  "id": "msg_abc123",
  "channel_id": "ch_general",
  "user_id": "usr_dave",
  "content": "Hey @alice, check out this <https://example.com|link>!",
  "blocks": [
    {"type": "rich_text", "elements": [
      {"type": "text", "text": "Hey "},
      {"type": "mention", "user_id": "usr_alice"},
      {"type": "text", "text": ", check out this "},
      {"type": "link", "url": "https://example.com", "label": "link"},
      {"type": "text", "text": "!"}
    ]}
  ],
  "ts": "1707840000.000100",
  "thread_ts": null,
  "reactions": [{"emoji": "thumbsup", "users": ["usr_alice"]}],
  "files": []
}
```

### Real-time Architecture
- WebSocket per user (not per channel) — multiplexed
- Server fans out messages via Redis PubSub or NATS
- Client subscribes to workspace events, server filters by membership
- Typing indicators: throttled broadcasts (every 3s max)
- Presence: heartbeat-based with 30s timeout
- Read receipts: batch update `last_read_ts` on channel_members

### Notification Pipeline
```
Message Created
  → Check mentions (@user, @channel, @here)
  → Check channel notification preferences
  → Check user DND/status
  → Route: push notification / email digest / badge count
  → Store in notification_queue
  → Deliver via FCM/APNs (mobile) or WebSocket (desktop)
```

## API Design

### REST
```
# Channels
GET    /api/v1/channels                 # List joined channels
POST   /api/v1/channels                 # Create channel
GET    /api/v1/channels/:id/history     # Message history (paginated)
POST   /api/v1/channels/:id/join
POST   /api/v1/channels/:id/leave

# Messages
POST   /api/v1/chat.postMessage         # Send message
POST   /api/v1/chat.update              # Edit message
POST   /api/v1/chat.delete              # Delete message
POST   /api/v1/reactions.add
POST   /api/v1/reactions.remove

# Threads
GET    /api/v1/threads/:ts/replies      # Get thread replies

# Files
POST   /api/v1/files.upload
GET    /api/v1/files/:id

# Search
POST   /api/v1/search.messages
POST   /api/v1/search.files

# Users
GET    /api/v1/users.info
POST   /api/v1/users.setStatus
GET    /api/v1/users.presence
```

### WebSocket Events
```json
// Inbound (client → server)
{"type": "ping"}
{"type": "typing", "channel_id": "ch_xxx"}
{"type": "mark_read", "channel_id": "ch_xxx", "ts": "..."}

// Outbound (server → client)
{"type": "message", "channel_id": "ch_xxx", "message": {...}}
{"type": "message_changed", "channel_id": "ch_xxx", "message": {...}}
{"type": "message_deleted", "channel_id": "ch_xxx", "ts": "..."}
{"type": "typing", "channel_id": "ch_xxx", "user_id": "..."}
{"type": "presence_change", "user_id": "...", "presence": "away"}
{"type": "channel_created", ...}
{"type": "reaction_added", ...}
```

## Security
- E2E encryption option for DMs (Signal protocol / Olm)
- Message retention policies (auto-delete after N days)
- DLP: scan messages for sensitive data patterns
- OAuth2 + SAML SSO for enterprise
- Audit logs for compliance (message edits, deletions, access)
- Rate limiting: 1 msg/sec per user, 50 API calls/min

## Performance Targets
| Metric | Target |
|--------|--------|
| Message delivery | < 100ms (p95) |
| Channel history load | < 200ms |
| Search results | < 500ms |
| File upload (25MB) | < 5s |
| Concurrent users/workspace | 10K+ |
| Message throughput | 10K msgs/sec |

## Tech Stack
| Component | Rust | Go | TypeScript |
|-----------|------|-----|-----------|
| API | Axum | Fiber | Fastify |
| WebSocket | tokio-tungstenite | gorilla/ws | uWebSockets.js |
| Message bus | nats-rs | nats.go | nats.js |
| DB | sqlx | pgx | Prisma |
| Cache | redis-rs | go-redis | ioredis |
| Search | Meilisearch | Meilisearch | Meilisearch |
| Frontend | N/A | N/A | React + Zustand |
| Mobile | N/A | N/A | React Native |

## MVP Tiers

### Tier 1 — Core Chat (2-3 weeks)
- Channels (create, join, leave)
- Real-time messaging via WebSocket
- Message history with pagination
- Basic auth (email/password)
- File uploads

### Tier 2 — Collaboration (4-6 weeks)
- Threads
- Reactions
- Mentions and notifications
- User presence and status
- Search (messages + files)
- Direct messages

### Tier 3 — Platform (6-10 weeks)
- Incoming/outgoing webhooks
- Bot API (slash commands)
- OAuth2 SSO
- Message editing/deletion
- Pinned messages, bookmarks
- Custom emoji

### Tier 4 — Enterprise (10-16 weeks)
- Voice/video calls (WebRTC via LiveKit/Janus)
- Screen sharing
- Guest access
- Compliance (retention, audit, DLP)
- SAML SSO
- Huddles (lightweight audio rooms)
