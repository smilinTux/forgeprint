# Collaboration Platform Blueprint
> Notion / Coda / Outline alternative — All-in-one workspace

## Overview
A collaborative workspace combining documents, databases, wikis, and project management into a single unified platform. Users create hierarchical pages with rich block-based content, build relational databases with custom views, and collaborate in real-time.

## Market Analysis
| Platform | Users | Pricing | Key Differentiator |
|----------|-------|---------|-------------------|
| Notion | 30M+ | Free/$10/$15/custom | Block-based everything |
| Coda | 5M+ | Free/$10/$30/custom | Doc-powered apps |
| Outline | 100K+ | $10/user/mo or self-host | Open-source wiki |
| Slite | 200K+ | Free/$8/$12.50 | AI-powered knowledge base |
| Confluence | 10M+ | $5.75/user/mo+ | Atlassian ecosystem |

## Core Concepts
- **Block-based editor**: Every piece of content is a block (paragraph, heading, image, embed, database, toggle, callout, code, etc.)
- **Hierarchical pages**: Infinite nesting of pages within pages (tree structure)
- **Relational databases**: Tables, boards, calendars, galleries, timelines as views of the same data
- **Real-time collaboration**: Multiple cursors, presence indicators, live editing via CRDTs
- **Templates**: Reusable page/database structures
- **Permissions**: Workspace → teamspace → page-level access control

## Architecture

### System Components
```
┌─────────────────────────────────────────────────┐
│                   CDN / Edge                     │
├─────────────────────────────────────────────────┤
│              API Gateway / Load Balancer          │
├──────────┬──────────┬───────────┬───────────────┤
│  Auth    │ Document │ Database  │ Collaboration  │
│ Service  │ Service  │ Service   │ Service (CRDT) │
├──────────┴──────────┴───────────┴───────────────┤
│              Event Bus (NATS/Kafka)               │
├──────────┬──────────┬───────────┬───────────────┤
│ Search   │ File     │ Export    │ Integration    │
│ (Meili)  │ Storage  │ Service   │ Service        │
├──────────┴──────────┴───────────┴───────────────┤
│         PostgreSQL    │    Redis    │    S3       │
└─────────────────────────────────────────────────┘
```

### Data Model
```sql
-- Core entities
workspaces (id, name, icon, plan, created_at)
users (id, email, name, avatar, settings_json)
workspace_members (workspace_id, user_id, role)

-- Content
pages (id, workspace_id, parent_id, title, icon, cover, created_by, permissions_json, is_template, archived_at)
blocks (id, page_id, parent_block_id, type, content_json, position, created_by, version)

-- Database engine
databases (id, page_id, schema_json)  -- schema defines properties/columns
database_rows (id, database_id, properties_json)
database_views (id, database_id, type, filter_json, sort_json, group_json)

-- Collaboration
comments (id, block_id, user_id, content, resolved, thread_id)
page_versions (id, page_id, snapshot_json, created_at, created_by)
```

### Block Types (minimum viable)
| Type | Description | Content JSON |
|------|-------------|-------------|
| paragraph | Rich text | `{rich_text: [{text, annotations}]}` |
| heading_1/2/3 | Headers | `{rich_text, toggleable}` |
| bulleted_list | Bullet list | `{rich_text, children}` |
| numbered_list | Numbered list | `{rich_text, children}` |
| to_do | Checkbox | `{rich_text, checked}` |
| toggle | Collapsible | `{rich_text, children}` |
| code | Code block | `{rich_text, language}` |
| image | Image | `{url, caption}` |
| embed | External embed | `{url}` |
| database | Inline database | `{database_id, view_id}` |
| callout | Callout box | `{rich_text, icon, color}` |
| divider | Horizontal rule | `{}` |
| table | Simple table | `{rows, cols, cells}` |
| bookmark | URL bookmark | `{url, title, description, icon}` |

### Real-time Collaboration (CRDT)
- Use **Yjs** or **Automerge** for conflict-free collaborative editing
- WebSocket connections for real-time sync
- Each block is a CRDT document
- Presence awareness (cursors, selections, active users)
- Offline support: queue operations, merge on reconnect

### Search Architecture
- Full-text search via Meilisearch or Typesense
- Index pages and blocks on every change (debounced)
- Filter by workspace, creator, date, type
- Support for content within databases

## API Design (REST + WebSocket)

### REST Endpoints
```
# Pages
GET    /api/v1/pages/:id
POST   /api/v1/pages                    # Create page
PATCH  /api/v1/pages/:id                # Update metadata
DELETE /api/v1/pages/:id                # Archive/delete

# Blocks
GET    /api/v1/blocks/:id/children
POST   /api/v1/blocks/:id/children      # Append blocks
PATCH  /api/v1/blocks/:id               # Update block
DELETE /api/v1/blocks/:id

# Databases
POST   /api/v1/databases                # Create database
POST   /api/v1/databases/:id/query      # Query with filters/sorts
POST   /api/v1/databases/:id/rows       # Add row
PATCH  /api/v1/databases/:id/rows/:rid  # Update row

# Search
POST   /api/v1/search                   # Full-text search

# Files
POST   /api/v1/files/upload
GET    /api/v1/files/:id
```

### WebSocket Protocol
```json
// Client → Server
{"type": "subscribe", "page_id": "xxx"}
{"type": "update", "block_id": "xxx", "ops": [...]}  // CRDT operations
{"type": "cursor", "page_id": "xxx", "position": {...}}

// Server → Client
{"type": "update", "block_id": "xxx", "ops": [...]}
{"type": "presence", "users": [{id, name, cursor}]}
```

## Security Considerations
- Row-level security on all queries (workspace + page permissions)
- Rate limiting on API and WebSocket
- Content sanitization (XSS prevention in rich text)
- File upload validation (type, size, virus scan)
- Share links with expiration and password protection
- Audit log for compliance (who changed what, when)

## Performance Targets
| Metric | Target |
|--------|--------|
| Page load (cached) | < 200ms |
| Block update propagation | < 100ms |
| Search results | < 300ms |
| Database query (10K rows) | < 500ms |
| File upload (10MB) | < 3s |
| Concurrent editors per page | 50+ |

## Tech Stack Options
| Component | Rust | Go | TypeScript | Python |
|-----------|------|-----|-----------|--------|
| API Server | Axum | Gin/Fiber | Fastify/Hono | FastAPI |
| CRDT | yrs (Yjs Rust) | custom | Yjs | pycrdt |
| Database | sqlx + Postgres | pgx + Postgres | Prisma + Postgres | SQLAlchemy + Postgres |
| Search | meilisearch-sdk | meilisearch-go | meilisearch-js | meilisearch-python |
| Cache | redis-rs | go-redis | ioredis | redis-py |
| Frontend | Leptos/Dioxus | N/A (use TS) | React/Svelte | N/A (use TS) |
| WebSocket | tokio-tungstenite | gorilla/websocket | ws/Socket.io | websockets |

## Extension Points
- **Custom block types**: Plugin system for new block renderers
- **Integrations**: Webhook triggers on page/database changes
- **API**: Full REST API for automation (like Notion API)
- **Import/Export**: Markdown, HTML, CSV, Notion export
- **AI features**: Summarize, translate, generate content, auto-tag
- **Themes**: Custom CSS/themes per workspace

## MVP Feature Tiers

### Tier 1 — Core (2-4 weeks)
- Block-based page editor (10 block types)
- Page hierarchy (sidebar tree)
- Basic auth (email/password, OAuth)
- Single-user editing

### Tier 2 — Collaboration (4-8 weeks)
- Real-time multi-user editing (CRDT)
- Comments and mentions
- Page permissions
- Version history
- Full-text search

### Tier 3 — Database Engine (8-12 weeks)
- Relational database with properties
- Table, board, calendar, gallery views
- Filters, sorts, groups
- Formulas and rollups
- Relations between databases

### Tier 4 — Platform (12-20 weeks)
- API for external integrations
- Templates marketplace
- Import from Notion/Confluence
- Mobile app (responsive + PWA)
- AI writing assistant
- Automations (if X then Y)
