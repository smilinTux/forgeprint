# Tier 4 — Self-Hosted Essentials

> Deep research for ForgePrint scaffold generation. Covers 6 categories every homelab/selfhoster wants.
> Generated: 2026-02-13

---

## 1. Authentication & Identity (Keycloak-style)

### Top 10 Open Source Solutions

| # | Name | Language | GitHub Stars | License | Key Differentiator |
|---|------|----------|-------------|---------|-------------------|
| 1 | **Keycloak** | Java | ~25k | Apache 2.0 | CNCF-incubating, enterprise standard, deepest protocol support (OIDC/SAML/UMA/LDAP), Red Hat-backed |
| 2 | **Authentik** | Python/Django | ~15k | Apache 2.0 + proprietary enterprise | Flow-based auth engine, beautiful UI, forward auth, RADIUS, SSH, GeoIP |
| 3 | **Authelia** | Go | ~23k | Apache 2.0 | Lightweight reverse-proxy companion, OIDC Certified™, minimal footprint, perfect for homelabs |
| 4 | **Zitadel** | Go | ~10k | AGPL-3.0 | Event-sourced architecture, API-first (gRPC), multi-tenant SaaS-ready, AI threat detection |
| 5 | **Ory Stack** (Kratos/Hydra/Keto/Oathkeeper) | Go | ~13k (Hydra) / ~11k (Kratos) | Apache 2.0 | Headless/API-only, cloud-native microservices, separates identity/OAuth/permissions |
| 6 | **Logto** | TypeScript | ~9k | MPL 2.0 | Developer-friendly, beautiful out-of-box UI, machine-to-machine auth, webhook events |
| 7 | **SuperTokens** | Java + Node.js | ~14k | Apache 2.0 (core) | Session management focus, anti-CSRF built-in, recipe-based architecture, managed + self-hosted |
| 8 | **Casdoor** | Go | ~11k | Apache 2.0 | 100+ social login providers, Casbin RBAC integration, multi-language UI |
| 9 | **FusionAuth** | Java | ~1.5k | Source-available (paid features) | Full IdP with no per-user pricing, advanced threat detection, breach password detection |
| 10 | **Gluu** (Janssen) | Java | ~1.5k | Apache 2.0 (Janssen) | FIDO2 certified, healthcare/gov compliance, Linux Foundation project |

### Top 10 Proprietary/SaaS Solutions

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Auth0** | Okta (Auth0) | Free tier 25k MAU → $35/mo (Essential) → $240/mo (Professional) → Enterprise custom |
| 2 | **Okta** | Okta | $2/user/mo (Workforce) → $6/user/mo (Adaptive MFA) → Custom enterprise |
| 3 | **Clerk** | Clerk | Free 10k MAU → $0.02/MAU after → Pro $25/mo + usage |
| 4 | **Firebase Auth** | Google | Free (phone auth: $0.01-0.06/verification after 10k/mo) |
| 5 | **AWS Cognito** | Amazon | Free 50k MAU → $0.0055/MAU (50k-100k) → volume discounts |
| 6 | **Azure AD B2C** | Microsoft | Free 50k auth/mo → $0.00325/auth after |
| 7 | **OneLogin** | OneLogin (One Identity) | $4/user/mo (Starter) → $8/user/mo (Advanced) → Enterprise custom |
| 8 | **PingIdentity** | PingIdentity (Thales) | $3/user/mo (Essential) → Custom enterprise |
| 9 | **WorkOS** | WorkOS | Free 1M MAU (AuthKit) → $299/mo (enterprise SSO/SCIM) |
| 10 | **Stytch** | Stytch | Free 25k MAU → $0.01/MAU → Enterprise custom |

### Feature Matrix (75 features)

#### Core Protocols
1. OpenID Connect (OIDC) provider
2. OAuth 2.0 (all grant types)
3. OAuth 2.1 support
4. SAML 2.0 IdP
5. SAML 2.0 SP
6. LDAP server/provider
7. LDAP client/federation
8. SCIM 2.0 provisioning
9. WS-Federation
10. CAS protocol
11. RADIUS protocol

#### Authentication Methods
12. Username/password
13. Passwordless / magic link (email)
14. Passwordless / magic link (SMS)
15. WebAuthn / FIDO2 passkeys
16. MFA — TOTP (Google Authenticator etc.)
17. MFA — SMS OTP
18. MFA — Email OTP
19. MFA — Push notifications
20. MFA — Hardware tokens (YubiKey)
21. Social login (Google, GitHub, Facebook, Apple, etc.)
22. Social login — 50+ providers
23. Enterprise SSO (OIDC/SAML federation)
24. Certificate-based / mTLS auth
25. Kerberos / SPNEGO
26. Smart card authentication
27. Biometric auth (device-level)

#### User Management
28. Admin console (web UI)
29. User self-service portal
30. User registration flows
31. Profile management
32. Account linking (merge identities)
33. User federation (external directories)
34. Identity brokering (delegate to external IdP)
35. User groups and roles
36. Fine-grained RBAC
37. Attribute-based access control (ABAC)
38. Policy-based access control
39. Organization / tenant management
40. User import/export (CSV, SCIM)
41. User deactivation / soft delete

#### Session & Security
42. Session management (view/revoke)
43. Brute force protection
44. Account lockout policies
45. Password policies (complexity, history, expiry)
46. Password breach detection (HaveIBeenPwned)
47. Argon2 / bcrypt / PBKDF2 password hashing
48. Rate limiting
49. GeoIP-based access rules
50. IP allowlist/blocklist
51. Adaptive/risk-based authentication
52. Bot/CAPTCHA protection
53. Audit logging (all events)
54. Consent management (GDPR)

#### Token & Authorization
55. JWT access tokens
56. Opaque reference tokens
57. Token introspection endpoint
58. Token exchange (RFC 8693)
59. Client credentials grant
60. Device authorization grant (RFC 8628)
61. PKCE support
62. DPoP (Demonstrating Proof of Possession)
63. PAR (Pushed Authorization Requests)
64. RAR (Rich Authorization Requests)
65. Fine-grained API permissions / scopes
66. UMA 2.0 (User-Managed Access)

#### Customization & Integration
67. Custom authentication flows / pipelines
68. Theming / branding (login pages)
69. Email templates (customizable)
70. Webhooks / event notifications
71. REST API (full management)
72. gRPC API
73. SDK support (JS, Python, Java, Go, etc.)
74. Terraform / IaC provider
75. Kubernetes operator / Helm charts

### Architecture Patterns

- **Monolithic IdP** (Keycloak, FusionAuth): Single deployable with embedded auth server, admin, user management. Scales vertically, then horizontally with shared DB + sticky sessions or replicated caches (Infinispan).
- **Microservices IdP** (Ory Stack): Separate services for identity (Kratos), OAuth (Hydra), permissions (Keto), proxy (Oathkeeper). Each scales independently. Headless — bring your own UI.
- **Event-Sourced** (Zitadel): Every state change stored as immutable event. Projections for read queries. Perfect audit trail. PostgreSQL as event store.
- **Flow/Pipeline Engine** (Authentik): Authentication as directed graph of stages (login → MFA → consent → redirect). Visual flow editor. Python expressions for conditions.
- **Forward Auth Proxy** (Authelia): Sits behind reverse proxy (Traefik, Nginx, Caddy). Proxy sends auth subrequests. Authelia validates session cookie, returns 200/401. Not a full IdP — delegates to upstream identity.
- **Sidecar/Middleware** (Ory Oathkeeper): API gateway pattern. Evaluates access rules, mutates requests (inject JWT), proxies to upstream.

### Memory & Resource Requirements

| Solution | RAM (idle) | RAM (1k users) | CPU | Storage | Database |
|----------|-----------|----------------|-----|---------|----------|
| Keycloak | 512MB-1GB | 1-2GB | 1-2 cores | 500MB | PostgreSQL (recommended), MySQL, MariaDB |
| Authentik | 800MB-1.2GB | 1.5-2.5GB | 1-2 cores | 1GB | PostgreSQL + Redis |
| Authelia | 30-50MB | 50-100MB | 0.25 cores | 50MB | SQLite/PostgreSQL/MySQL + Redis (optional) |
| Zitadel | 256-512MB | 512MB-1GB | 1 core | 500MB | PostgreSQL (CockroachDB) |
| Ory Stack (all) | 200-400MB | 400-800MB | 1-2 cores | 200MB | PostgreSQL/MySQL/SQLite |
| Logto | 256-512MB | 512MB-1GB | 1 core | 200MB | PostgreSQL |
| SuperTokens | 256-512MB | 512MB-1GB | 1 core | 200MB | PostgreSQL/MySQL |

### Testing Criteria for ForgePrint

1. **Protocol conformance**: OIDC certification test suite, SAML interop
2. **Login flow latency**: Time-to-first-byte on login page, token issuance time
3. **Concurrent auth load**: Logins/second under load (k6/Locust)
4. **MFA enrollment**: End-to-end passkey/TOTP setup time
5. **Federation test**: LDAP bind + sync with 10k users
6. **Session scalability**: 100k concurrent sessions memory/CPU impact
7. **Failover**: Kill one node, measure recovery time
8. **Token validation**: Downstream service token introspection latency
9. **Brute force**: Verify lockout triggers correctly
10. **Upgrade path**: Data migration between versions

---

## 2. Email Servers (Self-Hosted Email)

### Top 10 Open Source Solutions

| # | Name | Language | GitHub Stars | License | Key Differentiator |
|---|------|----------|-------------|---------|-------------------|
| 1 | **Mailcow** (dockerized) | Shell/Python/PHP | ~9.5k | GPL-3.0 | Full-stack Docker compose (Postfix+Dovecot+SOGo+rspamd+ClamAV), best admin UI |
| 2 | **Stalwart Mail** | Rust | ~7k | AGPL-3.0 | All-in-one binary (SMTP+IMAP+JMAP), modern, lightweight, written in Rust |
| 3 | **Mail-in-a-Box** | Shell/Python | ~14k | CC0 | One-command Ubuntu install, opinionated turnkey, includes DNS+webmail+CalDAV |
| 4 | **Mailu** | Python | ~6k | MIT | Lightweight Docker stack, modular, simpler than Mailcow |
| 5 | **Maddy** | Go | ~5k | GPL-3.0 | Single binary, composable, replaces Postfix+Dovecot+OpenDKIM in one process |
| 6 | **Postal** | Ruby | ~15k | MIT | Outbound-focused (transactional email), click/open tracking, webhook delivery |
| 7 | **iRedMail** | Shell/Python | ~1.5k | GPL-3.0 (free) / Proprietary (Pro) | Script-based installer on bare metal, production-proven for years |
| 8 | **Modoboa** | Python/Django | ~3k | ISC | Web admin for Postfix+Dovecot, domain admin delegation, statistics |
| 9 | **Docker-Mailserver** | Shell | ~15k | MIT | Pure Docker, minimal, community-driven, env-var config |
| 10 | **Haraka** | Node.js | ~5k | MIT | High-performance SMTP (outbound/relay), plugin architecture, not full stack |

### Top 10 Proprietary/SaaS Solutions

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Google Workspace** | Google | $7/user/mo (Starter) → $14/user/mo (Business) → $18/user/mo (Plus) |
| 2 | **Microsoft Exchange Online** | Microsoft | $4/user/mo (Kiosk) → $6/user/mo (Plan 1) → $12/user/mo (Plan 2) |
| 3 | **Fastmail** | Fastmail | $5/user/mo (Standard) → $8/user/mo (Professional) |
| 4 | **ProtonMail** | Proton AG | Free (500MB) → €4/mo (Mail Plus) → €8/mo (Proton Unlimited) |
| 5 | **Tutanota/Tuta** | Tuta GmbH | Free (1GB) → €3/mo (Revolution) → €8/mo (Legend) |
| 6 | **Zoho Mail** | Zoho | Free (5 users) → $1/user/mo (Light) → $4/user/mo (Premium) |
| 7 | **Migadu** | Migadu | $19/mo (Mini, 20 mailboxes) → $49/mo (Standard) → $99/mo (Pro) |
| 8 | **Zimbra** | Synacor/Zextras | Open source (free) + Commercial ($varies, per-mailbox) |
| 9 | **Postmark** | ActiveCampaign | $15/mo (10k emails) — transactional only |
| 10 | **Mailgun** | Sinch | Free (100/day) → $15/mo (Starter) → $35/mo (Foundation) → Custom |

### Feature Matrix (80 features)

#### Core Protocols
1. SMTP (outbound relay)
2. SMTP (inbound MX)
3. ESMTP extensions (PIPELINING, 8BITMIME, SIZE)
4. IMAP4rev1 / IMAP4rev2
5. POP3
6. JMAP (modern IMAP replacement)
7. Submission (port 587)
8. SMTPS (implicit TLS, port 465)
9. STARTTLS (opportunistic encryption)
10. ManageSieve protocol

#### Authentication & Security
11. DKIM signing (outbound)
12. DKIM verification (inbound)
13. SPF checking
14. DMARC policy enforcement
15. DMARC aggregate reports (send/receive)
16. ARC (Authenticated Received Chain)
17. DANE (TLSA DNS records)
18. MTA-STS (SMTP TLS reporting)
19. TLS-RPT (TLS reporting)
20. REQUIRETLS (RFC 8689)
21. Opportunistic TLS everywhere
22. Client certificate auth
23. OAuth2 / OIDC for IMAP/SMTP
24. App passwords

#### Spam & Antivirus
25. Spam filtering — rspamd
26. Spam filtering — SpamAssassin
27. Bayesian learning (ham/spam training)
28. Greylisting
29. DNSBL / RBL checking
30. Antivirus — ClamAV integration
31. Phishing detection
32. Rate limiting (per-sender, per-domain)
33. Sender verification
34. Content filtering rules
35. Quarantine management UI

#### Mail Routing & Management
36. Virtual domains
37. Virtual mailboxes
38. Aliases (user + domain-level)
39. Catch-all addresses
40. Mail forwarding
41. Mailing lists / distribution groups
42. Sieve filtering (server-side rules)
43. Vacation / auto-responder
44. Quota management (per-user, per-domain)
45. Shared mailboxes / folders
46. Public folders
47. Mail archiving

#### Client Features
48. Webmail (Roundcube / SOGo / Snappymail)
49. CardDAV (contacts sync)
50. CalDAV (calendar sync)
51. ActiveSync (mobile push)
52. Autoconfig / Autodiscover (client auto-setup)
53. Push notifications (IMAP IDLE / JMAP push)
54. Full-text search (Solr / Xapian / built-in)
55. Conversation/thread view
56. Message tagging / labels
57. Attachment handling (size limits)

#### Administration
58. Web-based admin panel
59. Domain admin delegation
60. Per-domain settings
61. Backup / restore tools
62. Import from other mail servers
63. DNS configuration assistant
64. Let's Encrypt auto-renewal
65. Monitoring / health checks
66. Logging (structured, searchable)
67. API for management

#### Advanced
68. Multi-server / clustering
69. High availability / failover
70. Object storage backend (S3)
71. Deduplication
72. Encryption at rest
73. PGP/S-MIME gateway
74. BIMI (Brand Indicators for Message Identification)
75. Relay host configuration
76. Outbound IP rotation
77. Bounce handling
78. DSN (Delivery Status Notifications)
79. Milter support
80. Custom transport maps

### Architecture Patterns

- **Docker Compose Stack** (Mailcow, Mailu): Orchestrated containers — separate services for MTA (Postfix), MDA (Dovecot), webmail (SOGo/Roundcube), spam filter (rspamd), antivirus (ClamAV), database (MySQL/MariaDB), reverse proxy. Interconnected via Docker networking.
- **All-in-One Binary** (Stalwart, Maddy): Single process handling SMTP, IMAP, JMAP, spam filtering. Drastically simpler deployment. Backend storage configurable (filesystem, S3, SQL, LDAP).
- **Bare Metal Installer** (Mail-in-a-Box, iRedMail): Scripts that install and configure Postfix+Dovecot+etc. directly on the OS. Opinionated; takes over the machine. MiaB even manages DNS.
- **Microservice/Plugin** (Haraka, Postal): Focused on one aspect (SMTP relay). Plugin-based extensibility. Often paired with other tools for full stack.

### Memory & Resource Requirements

| Solution | RAM (idle) | RAM (100 mailboxes) | CPU | Storage | Notes |
|----------|-----------|---------------------|-----|---------|-------|
| Mailcow | 1.5-2GB | 2-4GB | 2 cores | 10GB+ | ClamAV alone uses ~1GB RAM |
| Stalwart | 50-100MB | 150-300MB | 0.5 cores | 1GB+ | Extremely lightweight |
| Mail-in-a-Box | 1-1.5GB | 1.5-2.5GB | 1 core | 5GB+ | Includes DNS server |
| Mailu | 800MB-1.2GB | 1.5-2.5GB | 1 core | 5GB+ | Lighter than Mailcow |
| Maddy | 30-80MB | 100-200MB | 0.5 cores | 1GB+ | Go single binary |
| Docker-Mailserver | 500MB-1GB | 1-2GB | 1 core | 3GB+ | No ClamAV = much lighter |

### Testing Criteria for ForgePrint

1. **Deliverability**: Send to Gmail/Outlook/Yahoo, check inbox vs spam placement
2. **DNS compliance**: Verify DKIM/SPF/DMARC/DANE/MTA-STS/BIMI with mail-tester.com (target 10/10)
3. **Spam filtering accuracy**: Test with GTUBE string, Eicar, and real spam corpus
4. **TLS enforcement**: Verify STARTTLS, test with testssl.sh
5. **IMAP performance**: Upload 50k messages, measure search/sync speed
6. **Concurrent connections**: 100 simultaneous IMAP clients, measure degradation
7. **Queue management**: Send 10k messages, monitor queue drain rate
8. **Backup/restore**: Full mailbox backup and restore timing
9. **Protocol compliance**: IMAP/SMTP test suites (imaptest from Dovecot)
10. **Resource under load**: Monitor RAM/CPU with ClamAV + rspamd under burst

---

## 3. Chat & Communication (Matrix/Slack-killer)

### Top 10 Open Source Solutions

| # | Name | Language | GitHub Stars | License | Key Differentiator |
|---|------|----------|-------------|---------|-------------------|
| 1 | **Matrix/Synapse** | Python | ~12k | Apache 2.0 | Federation protocol standard, richest bridge ecosystem (IRC, Slack, Discord, WhatsApp, Signal, Telegram), E2EE |
| 2 | **Mattermost** | Go/React | ~31k | MIT (Community) / Proprietary (Enterprise) | Slack-like UX, enterprise plugins, Boards/Playbooks, compliance features |
| 3 | **Rocket.Chat** | TypeScript/Meteor | ~41k | MIT (pre-7.0) → Source-available | Omnichannel (livechat, WhatsApp, SMS), marketplace, video conferencing built-in |
| 4 | **Zulip** | Python/Django | ~22k | Apache 2.0 | Topic-based threading (unique!), full-text search, 100% open source, academic/OSS focused |
| 5 | **Element** (Matrix client) | TypeScript | ~11k | Apache 2.0 | Reference Matrix client, E2EE by default, Element Call (video), Element X (new fast client) |
| 6 | **Revolt** | Rust/TypeScript | ~1k (backend) | AGPL-3.0 | Discord clone (channels, servers, roles), modern UI, self-hostable Discord replacement |
| 7 | **Conduit/Conduwuit** | Rust | ~4k | Apache 2.0 | Lightweight Matrix homeserver, single binary, embedded DB, fraction of Synapse resources |
| 8 | **Prosody** (XMPP) | Lua | ~1k | MIT | Lightweight XMPP server, highly extensible, real-time communication standard |
| 9 | **ejabberd** (XMPP) | Erlang | ~6k | GPL-2.0 | Battle-tested XMPP (WhatsApp was built on it), millions of concurrent users, clustering |
| 10 | **Nextcloud Talk** | PHP/JS | (part of NC) | AGPL-3.0 | Integrated with Nextcloud, video calls (HPB), no separate deployment if you have NC |

### Top 10 Proprietary/SaaS Solutions

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Slack** | Salesforce | Free → $8.75/user/mo (Pro) → $15/user/mo (Business+) → Custom (Enterprise Grid) |
| 2 | **Microsoft Teams** | Microsoft | Included in M365 ($6/user/mo+) → $4/user/mo (Essentials standalone) |
| 3 | **Discord** | Discord | Free → $9.99/mo (Nitro) — no per-seat enterprise pricing |
| 4 | **Google Chat** | Google | Included in Google Workspace ($7/user/mo+) |
| 5 | **Telegram** | Telegram | Free → Telegram Premium $4.99/mo (individual perks) |
| 6 | **Wire** | Wire Swiss | Free (personal) → €5.83/user/mo (Enterprise) |
| 7 | **Signal** | Signal Foundation | Free (donations-supported) |
| 8 | **Webex** | Cisco | Free → $14.50/user/mo (Meet) → $25/user/mo (Suite) |
| 9 | **Chanty** | Chanty | Free (10 users) → $4/user/mo (Business) |
| 10 | **Pumble** | CAKE.com | Free → $2.49/user/mo (Pro) → $3.99/user/mo (Business) |

### Feature Matrix (80 features)

#### Core Messaging
1. Real-time messaging (WebSocket)
2. Channels / rooms (public)
3. Private channels / groups
4. Direct messages (1:1)
5. Group DMs
6. Threads (in-channel replies)
7. Topic-based threading (Zulip-style)
8. Message editing
9. Message deletion
10. Message reactions (emoji)
11. Custom emoji
12. Rich text / Markdown formatting
13. Code blocks with syntax highlighting
14. File sharing / uploads
15. Image/video inline preview
16. Link previews / unfurling
17. Pinned messages
18. Bookmarked / saved messages
19. Message forwarding
20. Scheduled messages

#### Search & Organization
21. Full-text message search
22. Search filters (from, in, date, has:file)
23. User mentions (@user)
24. Channel mentions (@channel, @here)
25. Hashtags / topics
26. Starred / favorite channels
27. Channel categories / sections
28. Unread message management
29. Read receipts
30. Typing indicators
31. Online/offline presence
32. Custom status / status messages

#### Voice & Video
33. Voice calls (1:1)
34. Group voice calls
35. Video calls (1:1)
36. Group video calls
37. Screen sharing
38. Screen recording
39. Virtual backgrounds
40. Call recording
41. Huddle / always-on rooms
42. SFU/MCU for large calls
43. TURN/STUN server integration

#### Security & Privacy
44. End-to-end encryption (E2EE)
45. E2EE key verification (cross-signing)
46. Transport encryption (TLS)
47. Message retention policies
48. Data loss prevention (DLP)
49. Compliance exports
50. eDiscovery
51. Audit logging
52. Session management (device list)

#### Federation & Bridges
53. Server-to-server federation
54. Bridge to IRC
55. Bridge to Slack
56. Bridge to Discord
57. Bridge to WhatsApp
58. Bridge to Telegram
59. Bridge to Signal
60. Bridge to SMS
61. Bridge to Email
62. Application services / appservices

#### Bots & Integration
63. Incoming webhooks
64. Outgoing webhooks
65. Bot framework / SDK
66. Slash commands
67. Interactive messages (buttons, menus)
68. Marketplace / app directory
69. Zapier / n8n integration
70. RSS feeds

#### Administration
71. SSO (OIDC/SAML)
72. LDAP integration
73. Guest access (external users)
74. User roles / permissions
75. Moderation tools (ban, mute, report)
76. Anti-spam measures
77. Push notifications (mobile)
78. Email notifications (digest)
79. Rate limiting
80. Multi-workspace / spaces

### Architecture Patterns

- **Federation Protocol** (Matrix): Homeservers sync room state via federation. DAG-based event ordering. Each server holds full room history. Clients connect to their homeserver. Identity servers for user discovery.
- **Monolithic Server** (Mattermost, Rocket.Chat, Zulip): Single server app + database (PostgreSQL). WebSocket for real-time. Horizontal scaling with load balancer + shared DB + shared file store. Worker processes for async tasks.
- **XMPP Federation** (Prosody, ejabberd): XML stream protocol. Server-to-server TLS. Publish-subscribe (PubSub) for group chat. MAM (Message Archive Management) for history. Erlang OTP (ejabberd) enables millions of concurrent connections.
- **Conduit/Conduwuit Embedded** (Rust Matrix): Single binary with embedded RocksDB/SQLite. No external database needed. Fraction of Synapse memory. Federated but lightweight.

### Memory & Resource Requirements

| Solution | RAM (idle) | RAM (100 users) | RAM (1k users) | CPU | Database |
|----------|-----------|-----------------|----------------|-----|----------|
| Synapse | 500MB-1GB | 1-2GB | 4-8GB+ | 2-4 cores | PostgreSQL |
| Dendrite | 100-200MB | 300-600MB | 1-2GB | 1-2 cores | PostgreSQL/SQLite |
| Conduit | 50-100MB | 100-300MB | 500MB-1GB | 0.5 cores | RocksDB (embedded) |
| Mattermost | 300-500MB | 500MB-1GB | 2-4GB | 1-2 cores | PostgreSQL |
| Rocket.Chat | 500MB-1GB | 1-2GB | 3-6GB | 2 cores | MongoDB |
| Zulip | 1-2GB | 2-3GB | 4-8GB | 2-4 cores | PostgreSQL + memcached + RabbitMQ |
| Prosody | 30-50MB | 50-200MB | 200-500MB | 0.5 cores | SQLite/PostgreSQL |
| ejabberd | 100-200MB | 200-500MB | 500MB-2GB | 1-2 cores | Mnesia/SQL |

### Testing Criteria for ForgePrint

1. **Message delivery latency**: Time from send to receive (local + federated)
2. **Concurrent WebSocket connections**: 1k/10k simultaneous users
3. **Message throughput**: Messages/second sustained
4. **Search performance**: Full-text search across 1M messages
5. **Federation reliability**: Message delivery across 3+ homeservers
6. **E2EE verification**: Cross-device key verification flow
7. **File upload/download**: Large file (100MB+) transfer speed
8. **Push notification delivery**: Time from message to mobile push
9. **Bridge reliability**: Message round-trip through bridges (Matrix↔Slack)
10. **Database growth**: Storage growth rate per message volume

---

## 4. Media Servers & Streaming

### Top 10 Open Source Solutions

| # | Name | Language | GitHub Stars | License | Key Differentiator |
|---|------|----------|-------------|---------|-------------------|
| 1 | **Jellyfin** | C# (.NET) | ~37k | GPL-2.0 | Fully free (no premium tier), fork of Emby, hardware transcoding, active community |
| 2 | **Navidrome** | Go | ~13k | GPL-3.0 | Music-focused, Subsonic/OpenSubsonic API, lightweight, fast, modern web UI |
| 3 | **PeerTube** | TypeScript/Node | ~13k | AGPL-3.0 | Federated video platform (ActivityPub), YouTube alternative, P2P streaming |
| 4 | **Owncast** | Go | ~9.5k | MIT | Self-hosted live streaming (Twitch alternative), OBS-compatible RTMP ingest, chat |
| 5 | **Funkwhale** | Python/Django + Vue | ~1.5k | AGPL-3.0 | Federated music/podcast platform (ActivityPub), Subsonic API compatible |
| 6 | **Ampache** | PHP | ~3.5k | AGPL-3.0 | Veteran music server (20+ years), Subsonic API, video support, multi-catalog |
| 7 | **Airsonic-Advanced** | Java | ~1.2k | GPL-3.0 | Fork of Subsonic/Libresonic, Subsonic API, transcoding, podcast support |
| 8 | **MediaCMS** | Python/Django | ~3k | AGPL-3.0 | Video CMS (YouTube clone), HLS adaptive streaming, multi-user |
| 9 | **Dim** | Rust | ~4k | AGPL-3.0 | Media manager written in Rust, modern UI, lightweight |
| 10 | **Stash** | Go | ~10k | AGPL-3.0 | Media organizer with rich metadata scraping, scene/performer management |

### Top 10 Proprietary/SaaS Solutions

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Plex** | Plex Inc. | Free (basic) → $4.99/mo or $119.99 lifetime (Plex Pass) |
| 2 | **Emby** | Emby LLC | Free (basic) → $4.99/mo or $119 lifetime (Emby Premiere) |
| 3 | **Roon** | Roon Labs (Harman) | $14.99/mo or $829.99 lifetime — audiophile music server |
| 4 | **Spotify** | Spotify | Free (ads) → $11.99/mo (Premium) → $19.99/mo (Family) |
| 5 | **Apple Music** | Apple | $10.99/mo (Individual) → $16.99/mo (Family) |
| 6 | **Tidal** | Block (Square) | $10.99/mo (HiFi) → $19.99/mo (HiFi Plus) |
| 7 | **YouTube Music** | Google | Free (ads) → $13.99/mo (Premium) → $22.99/mo (Family) |
| 8 | **Netflix** | Netflix | $6.99/mo (Standard with Ads) → $15.49/mo → $22.99/mo (Premium 4K) |
| 9 | **Subsonic** | Subsonic | Free (trial) → $1/mo (license) — original Subsonic server |
| 10 | **Stremio** | Stremio | Free (community addons) — aggregator/player, not server |

### Feature Matrix (75 features)

#### Media Management
1. Library scanning (auto-detect new media)
2. Movie metadata (TMDb, IMDb)
3. TV show metadata (season/episode)
4. Music metadata (MusicBrainz, Last.fm)
5. Artist/album/track organization
6. NFO file support
7. Custom metadata editing
8. Collections / sets
9. Tags / genres
10. Smart playlists (auto-generated)
11. Manual playlists
12. Favorites / ratings
13. Recently added view
14. Continue watching / resume playback
15. Watch history / play count

#### Transcoding & Playback
16. Software transcoding (FFmpeg)
17. Hardware transcoding — Intel QSV
18. Hardware transcoding — NVIDIA NVENC
19. Hardware transcoding — VAAPI
20. Hardware transcoding — V4L2 (RPi)
21. Hardware transcoding — AMD AMF
22. Direct play (no transcoding)
23. Direct stream (container remux only)
24. Adaptive bitrate streaming (HLS/DASH)
25. HDR → SDR tone mapping
26. Subtitle transcoding (burn-in)
27. Audio transcoding (e.g., DTS → AAC)

#### Subtitle Support
28. SRT / SSA / ASS subtitles
29. PGS / VobSub image subtitles
30. Embedded subtitle extraction
31. External subtitle files
32. OpenSubtitles integration (auto-download)
33. Subtitle offset adjustment

#### Client & Streaming
34. Web player (built-in)
35. Android app
36. iOS app
37. Android TV / Fire TV app
38. Roku app
39. Apple TV / tvOS app
40. Desktop app (Windows/Mac/Linux)
41. DLNA / UPnP server
42. Chromecast support
43. AirPlay support
44. Remote streaming (WAN)
45. Bandwidth throttling
46. Offline sync / download

#### Multi-User
47. User accounts (multiple)
48. Parental controls / content ratings
49. Per-user library access
50. Per-user watch history
51. Guest access
52. Home screen customization (per-user)

#### Music-Specific
53. Gapless playback
54. ReplayGain
55. Lyrics display (synced/unsynced)
56. Scrobbling (Last.fm, ListenBrainz)
57. Internet radio
58. Podcast support / management
59. Audiobook support (chapters)
60. Music artist images / biographies

#### Live TV & DVR
61. Live TV (tuner integration)
62. EPG (Electronic Program Guide)
63. DVR / recording
64. Time-shifting (pause live TV)
65. HDHomeRun support
66. IPTV / M3U playlist support

#### Advanced
67. Plugin / addon system
68. API (REST/GraphQL)
69. Webhooks (playback events)
70. SSO / LDAP integration
71. Reverse proxy friendly
72. Multi-server / distributed libraries
73. S3 / remote storage backend
74. Chapter support (video)
75. Intro/credits skip detection

### Architecture Patterns

- **Monolithic Media Server** (Jellyfin, Plex, Emby): Single server process managing library, metadata, transcoding, streaming, user management. SQLite or custom DB for metadata. FFmpeg for transcoding. Serves clients via REST API + HLS/DASH streams.
- **Music-Focused Lightweight** (Navidrome, Airsonic): Smaller footprint, implements Subsonic API for broad client compatibility (DSub, Symfonium, etc.). Single binary + SQLite. No transcoding or lightweight on-the-fly transcoding.
- **Federated Video** (PeerTube): ActivityPub federation between instances. WebTorrent/HLS for P2P bandwidth sharing. PostgreSQL + Redis. Worker processes for transcoding jobs.
- **Live Streaming** (Owncast): RTMP ingest → HLS output. FFmpeg transcoding to multiple quality levels. Chat built-in. Single binary deployment.

### Memory & Resource Requirements

| Solution | RAM (idle) | RAM (1 transcode) | RAM (5 transcodes) | CPU (per transcode) | Storage |
|----------|-----------|-------------------|--------------------|--------------------|---------|
| Jellyfin | 150-300MB | 500MB-1GB | 2-4GB | 1-2 cores (SW) / GPU (HW) | Varies with library |
| Plex | 200-400MB | 500MB-1GB | 2-4GB | Similar to Jellyfin | Varies + metadata cache |
| Navidrome | 30-80MB | N/A (no video) | N/A | 0.25 cores | Small (DB only) |
| PeerTube | 300-500MB | 1-2GB (per job) | Queue-based | 2+ cores | Large (video storage) |
| Owncast | 50-100MB | 200-500MB | N/A (single stream) | 1-2 cores | Minimal |

### Testing Criteria for ForgePrint

1. **Library scan speed**: Time to scan and fetch metadata for 10k files
2. **Transcoding performance**: 4K → 1080p transcode speed (SW vs HW)
3. **Concurrent streams**: 5/10/20 simultaneous transcoding streams
4. **Startup time**: Cold start to serving first stream
5. **Client compatibility**: Test across 5+ client platforms
6. **Subtitle rendering**: Burn-in vs passthrough accuracy
7. **HDR tone mapping quality**: Visual comparison
8. **Remote streaming**: Bandwidth usage and quality at various speeds
9. **API response times**: Library queries, search, metadata lookups
10. **Plugin stability**: Test top 10 community plugins

---

## 5. Analytics & Business Intelligence

### Top 10 Open Source Solutions

| # | Name | Language | GitHub Stars | License | Key Differentiator |
|---|------|----------|-------------|---------|-------------------|
| 1 | **PostHog** | Python/TypeScript | ~25k | MIT (self-host free) | All-in-one: analytics + session replay + feature flags + A/B testing + surveys |
| 2 | **Plausible** | Elixir | ~21k | AGPL-3.0 | Privacy-first, <1KB script, no cookies, simple dashboard, GDPR compliant by design |
| 3 | **Matomo** | PHP | ~20k | GPL-3.0 | Most mature GA alternative, ecommerce tracking, heatmaps (premium), 20+ years |
| 4 | **Umami** | TypeScript/Next.js | ~24k | MIT | Simple, fast, privacy-focused, beautiful UI, best self-hosted experience |
| 5 | **Metabase** | Clojure/Java | ~40k | AGPL-3.0 | BI/dashboards, SQL query builder, embeddable charts, connects to any SQL DB |
| 6 | **Apache Superset** | Python | ~65k | Apache 2.0 | Enterprise BI, 40+ DB connectors, SQL Lab, rich visualizations, Airbnb-originated |
| 7 | **Redash** | Python | ~26k | BSD-2-Clause | Query & visualize any data source, dashboards, alerts, SQL-focused |
| 8 | **Grafana** | Go/TypeScript | ~66k | AGPL-3.0 | Observability dashboards, Prometheus/Loki/Tempo integration, alerting |
| 9 | **GoAccess** | C | ~19k | MIT | Real-time terminal/HTML log analyzer, zero dependencies, blazing fast |
| 10 | **Countly** | Node.js | ~5.5k | AGPL-3.0 | Mobile + web analytics, crash reporting, push notifications, user profiles |

### Top 10 Proprietary/SaaS Solutions

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Google Analytics 4** | Google | Free (standard) → GA360 ($50k+/year for enterprise) |
| 2 | **Mixpanel** | Mixpanel | Free (20M events/mo) → $24/mo (Growth) → Enterprise custom |
| 3 | **Amplitude** | Amplitude | Free (50k MTU) → $49/mo (Plus) → Enterprise custom |
| 4 | **Heap** | Contentsquare | Free (10k sessions/mo) → Growth → Enterprise custom |
| 5 | **Hotjar** | Contentsquare | Free (35 sessions/day) → $32/mo (Plus) → $80/mo (Business) → Custom |
| 6 | **FullStory** | FullStory | Free trial → Enterprise custom ($$$$) |
| 7 | **Fathom Analytics** | Fathom | $15/mo (100k pageviews) → $25/mo (200k) → scales with usage |
| 8 | **Pendo** | Pendo | Free (500 MAU) → Growth → Portfolio → Enterprise (custom) |
| 9 | **Datadog RUM** | Datadog | $15/10k sessions/mo (RUM) + usage-based |
| 10 | **Looker** | Google | Custom enterprise pricing (formerly $3k+/mo) |

### Feature Matrix (75 features)

#### Web Analytics (Core)
1. Pageview tracking
2. Unique visitor tracking
3. Session tracking
4. Bounce rate
5. Time on page / session duration
6. Entry/exit pages
7. Referrer / traffic source tracking
8. UTM parameter tracking
9. Campaign tracking
10. Geographic location (country/city)
11. Device / browser / OS detection
12. Screen resolution tracking
13. Language detection
14. Real-time visitors dashboard

#### Event & Behavior Tracking
15. Custom event tracking
16. Event properties / metadata
17. Auto-capture (clicks, form submissions)
18. Custom properties / user properties
19. Conversion / goal tracking
20. Funnel analysis
21. Path / flow analysis (user journeys)
22. Cohort analysis
23. Retention analysis
24. User segmentation
25. User identification (link sessions to users)
26. User profiles / timelines

#### Advanced Analytics
27. Session replay (video playback of user sessions)
28. Heatmaps (click, scroll, move)
29. A/B testing / experimentation
30. Feature flags
31. Surveys (in-app)
32. Net Promoter Score (NPS)
33. Ecommerce tracking (revenue, transactions)
34. Multi-touch attribution
35. Channel grouping
36. Search analytics (site search terms)

#### Dashboards & Visualization
37. Pre-built dashboards
38. Custom dashboards
39. Chart types (line, bar, pie, area, table, map)
40. SQL query builder / editor
41. Visual query builder (no-code)
42. Embeddable charts / iframes
43. Scheduled reports (email)
44. PDF / CSV export
45. Dashboard sharing (public links)

#### Privacy & Compliance
46. Privacy-first (no cookies required)
47. Cookie consent integration
48. GDPR compliance tools
49. Data anonymization / hashing
50. IP anonymization
51. Data retention policies (auto-purge)
52. User data deletion (right to erasure)
53. Opt-out mechanism
54. Do Not Track respect
55. No third-party tracking / data sharing

#### Data & Integration
56. REST API (read/write)
57. Webhook integrations
58. Data export (CSV, JSON)
59. Data import
60. Warehouse integrations (BigQuery, Snowflake, Redshift)
61. Reverse ETL
62. Zapier / n8n integration
63. JavaScript SDK
64. Mobile SDK (iOS/Android)
65. Server-side tracking API

#### Administration
66. Multi-site / multi-project support
67. Team / user management
68. Role-based access control
69. SSO (OIDC/SAML)
70. Email alerts / notifications
71. Uptime monitoring
72. Error tracking / crash analytics
73. Performance monitoring (Web Vitals)
74. Bot filtering
75. Proxy / reverse proxy deployment (bypass adblockers)

### Architecture Patterns

- **Lightweight Tracker + Dashboard** (Plausible, Umami, Fathom): Tiny JS snippet (<1KB) sends events to backend. Backend processes and stores in ClickHouse/PostgreSQL. Simple dashboard reads aggregated data. No cookies, no PII.
- **Full Product Analytics** (PostHog, Mixpanel, Amplitude): Event ingestion pipeline → ClickHouse/custom OLAP. Session replay captures DOM snapshots. Feature flags evaluate server-side. Plugin system for data transformation.
- **BI/Query Platform** (Metabase, Superset, Redash): Connects to existing databases (PostgreSQL, MySQL, BigQuery, etc.). SQL editor + visual query builder. Caching layer for query results. Not a tracker — analyzes existing data.
- **Log-Based** (GoAccess): Parses web server access logs (Nginx, Apache). No JavaScript needed. Real-time terminal UI or static HTML report. Zero external dependencies.
- **Observability Stack** (Grafana): Dashboarding layer over time-series databases (Prometheus, InfluxDB) and log stores (Loki). Query language (PromQL, LogQL). Alerting rules engine.

### Memory & Resource Requirements

| Solution | RAM (idle) | RAM (100k events/day) | CPU | Storage | Database |
|----------|-----------|----------------------|-----|---------|----------|
| Plausible | 200-400MB | 500MB-1GB | 1 core | 5GB+ | ClickHouse + PostgreSQL |
| Umami | 100-200MB | 200-400MB | 0.5 cores | 2GB+ | PostgreSQL/MySQL |
| PostHog | 1-2GB | 4-8GB | 2-4 cores | 50GB+ | ClickHouse + PostgreSQL + Redis + Kafka |
| Matomo | 200-500MB | 500MB-2GB | 1-2 cores | 10GB+ | MySQL/MariaDB |
| Metabase | 500MB-1GB | 1-2GB | 1-2 cores | 2GB | H2 (embedded) / PostgreSQL |
| Superset | 500MB-1GB | 1-2GB | 1-2 cores | 5GB | PostgreSQL + Redis + Celery |
| GoAccess | 10-50MB | 50-200MB | 0.25 cores | Minimal | None (in-memory / log files) |
| Grafana | 100-200MB | 200-500MB | 0.5 cores | 1GB | SQLite/PostgreSQL |

### Testing Criteria for ForgePrint

1. **Tracking accuracy**: Compare event counts vs server logs
2. **Script size & load impact**: Measure page load overhead (Lighthouse)
3. **Adblocker bypass**: Test with uBlock Origin, Brave shields
4. **Ingestion throughput**: Events/second before dropping
5. **Dashboard load time**: Time to render main dashboard
6. **Query performance**: Complex queries on 10M+ events
7. **Privacy compliance**: Verify no cookies, no PII leakage
8. **Data retention**: Auto-purge verification
9. **API completeness**: CRUD operations on all entities
10. **Multi-site isolation**: Verify data separation between sites

---

## 6. File Sync & Cloud Storage (Nextcloud-killer)

### Top 10 Open Source Solutions

| # | Name | Language | GitHub Stars | License | Key Differentiator |
|---|------|----------|-------------|---------|-------------------|
| 1 | **Nextcloud** | PHP | ~28k | AGPL-3.0 | Most feature-rich (Apps ecosystem: Office, Talk, Calendar, Contacts, Deck, etc.), de facto standard |
| 2 | **ownCloud Infinite Scale** (oCIS) | Go | ~1.5k | Apache 2.0 | Ground-up rewrite in Go, microservice architecture, spaces concept, faster than NC |
| 3 | **Seafile** | C/Python | ~12k | Community: AGPL-3.0 / Pro: Proprietary | Fastest sync performance, block-level dedup, library-based organization |
| 4 | **Syncthing** | Go | ~68k | MPL 2.0 | P2P sync (no central server), no cloud needed, zero-config, relay servers |
| 5 | **FileBrowser** | Go | ~28k | Apache 2.0 | Lightweight web file manager, no sync client, simple deployment |
| 6 | **MinIO** | Go | ~50k | AGPL-3.0 | S3-compatible object storage, not a file sync but foundational storage layer |
| 7 | **Pydio Cells** | Go | ~1.5k | AGPL-3.0 | Enterprise file sharing, microservice Go rewrite, advanced sharing/security |
| 8 | **FileRun** | PHP | N/A (proprietary core) | Proprietary (free for 5 users) | Google Drive-like UI, excellent Office integration, low resource usage |
| 9 | **ProjectSend** | PHP | ~1.5k | GPL-2.0 | Client-facing file sharing portal, upload/download management |
| 10 | **CryptPad** | JavaScript | ~6k | AGPL-3.0 | Zero-knowledge collaborative editing, encrypted documents, not traditional file sync |

### Top 10 Proprietary/SaaS Solutions

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Google Drive** | Google | Free (15GB) → $1.99/mo (100GB) → $9.99/mo (2TB, Google One) |
| 2 | **Dropbox** | Dropbox | Free (2GB) → $11.99/mo (Plus, 2TB) → $22/user/mo (Business) |
| 3 | **OneDrive** | Microsoft | Free (5GB) → $1.99/mo (100GB) → included in M365 ($6.99/mo, 1TB) |
| 4 | **iCloud** | Apple | Free (5GB) → $0.99/mo (50GB) → $2.99/mo (200GB) → $9.99/mo (2TB) |
| 5 | **Box** | Box | Free (10GB) → $15/user/mo (Business) → $25/user/mo (Business Plus) |
| 6 | **MEGA** | Mega Limited | Free (20GB) → €4.99/mo (Pro Lite, 400GB) → €9.99/mo (Pro I, 2TB) |
| 7 | **Tresorit** | Tresorit (Swiss Post) | $13.99/mo (Personal) → $17/user/mo (Business) — E2EE focus |
| 8 | **Proton Drive** | Proton AG | Included in Proton plans (Free 1GB → €4/mo for 500GB) |
| 9 | **SpiderOak** | SpiderOak | $6/mo (150GB) → $29/mo (5TB) — zero-knowledge encryption |
| 10 | **Hetzner Storage Share** | Hetzner | €3.41/mo (1TB Nextcloud hosted) → €10.23/mo (5TB) |

### Feature Matrix (80 features)

#### File Sync & Access
1. Desktop sync client (Windows)
2. Desktop sync client (macOS)
3. Desktop sync client (Linux)
4. Mobile app (Android)
5. Mobile app (iOS)
6. Web interface / file browser
7. Selective sync (choose folders)
8. Virtual files / on-demand sync (Files On-Demand)
9. Conflict resolution
10. Delta sync (block-level, only changed parts)
11. Bandwidth throttling
12. LAN sync (peer-to-peer on local network)
13. Background sync / auto-upload (mobile photos)

#### File Sharing
14. Share via link (public)
15. Password-protected links
16. Expiry date on links
17. Upload-only links (file drop)
18. Share with internal users
19. Share with groups
20. Federated sharing (cross-server)
21. Share permissions (read/write/reshare)
22. Share via email invitation

#### Collaboration
23. Collaborative document editing (real-time)
24. OnlyOffice integration
25. Collabora Online (LibreOffice) integration
26. Microsoft Office integration (WOPI)
27. Comments on files
28. File locking (check-out/check-in)
29. @mentions in comments
30. Activity feed / notifications

#### Organization
31. Folders & nested hierarchy
32. Tags / labels
33. Favorites / starred files
34. Recent files view
35. Full-text search (file contents)
36. OCR (image/PDF text extraction)
37. File type filtering
38. Sort / group views

#### Versioning & Recovery
39. File versioning (automatic)
40. Version history viewer
41. Restore previous versions
42. Trash / recycle bin
43. Trash retention period (configurable)
44. Undelete / restore from trash
45. Ransomware protection / mass-change detection

#### Storage & Backend
46. Local filesystem storage
47. S3 / object storage backend
48. External storage mounts (SMB, NFS, FTP, S3, WebDAV)
49. Quota management (per-user, per-group)
50. Storage usage reporting
51. Data deduplication
52. Compression

#### Security
53. Server-side encryption
54. End-to-end encryption (E2EE)
55. TLS everywhere (transit encryption)
56. Two-factor authentication
57. Brute force protection
58. File access audit log
59. Antivirus scanning (ClamAV)
60. Watermarking (documents)
61. DLP / classification policies
62. Remote wipe (device)

#### Integration
63. WebDAV protocol
64. CalDAV (calendar sync)
65. CardDAV (contacts sync)
66. LDAP / Active Directory integration
67. SAML / OIDC SSO
68. OAuth2 client
69. API (REST / OCS)
70. Webhooks
71. Zapier / automation integration
72. Outlook / Thunderbird plugin

#### Administration
73. Admin dashboard
74. User provisioning (manual + SCIM)
75. Group management
76. App / plugin marketplace
77. Theming / branding
78. Email notifications
79. Monitoring / health endpoints
80. High availability / clustering

### Architecture Patterns

- **PHP Monolith + Apps** (Nextcloud): PHP application on Apache/Nginx + PHP-FPM. MySQL/MariaDB/PostgreSQL for metadata. Filesystem or S3 for blobs. Redis/APCu for caching. App framework for extensibility (300+ apps). Background jobs via cron.
- **Go Microservices** (ownCloud Infinite Scale, Pydio Cells): Multiple Go services communicating via gRPC/NATS. Each service handles a domain (storage, sharing, search, thumbnails). Can run as single binary or distributed. Designed for horizontal scaling.
- **Block-Level Dedup** (Seafile): Files split into 1-8MB blocks, content-addressed (SHA1). Identical blocks stored once. Libraries as organizational unit. C core for performance, Python/Django for web. MySQL/MariaDB + filesystem.
- **P2P Mesh** (Syncthing): No central server. Devices discover each other via relay servers or local discovery. Block Exchange Protocol (BEP) over TLS. Conflict resolution via vector clocks. Configuration per-device.
- **Object Storage API** (MinIO): S3-compatible API. Erasure coding for data protection. Distributed mode across nodes. Not a file sync solution but underlies many others.

### Memory & Resource Requirements

| Solution | RAM (idle) | RAM (100 users) | CPU | Storage Backend | Database |
|----------|-----------|-----------------|-----|----------------|----------|
| Nextcloud | 256-512MB | 1-4GB | 1-2 cores | Filesystem/S3 | MySQL/PostgreSQL + Redis |
| ownCloud Infinite Scale | 200-400MB | 500MB-2GB | 1-2 cores | Filesystem/S3 | Embedded (no external DB needed) |
| Seafile | 100-200MB | 300-800MB | 1 core | Filesystem | MySQL/MariaDB |
| Syncthing | 50-100MB | N/A (per-device) | 0.5 cores | Local filesystem | Embedded LevelDB |
| FileBrowser | 20-50MB | 50-150MB | 0.25 cores | Local filesystem | Embedded (bolt) |
| MinIO | 200-500MB | 500MB-2GB | 1-2 cores | Direct disk/JBOD | Embedded |
| Pydio Cells | 300-600MB | 1-2GB | 1-2 cores | Filesystem/S3 | MySQL |

### Testing Criteria for ForgePrint

1. **Sync speed**: Time to sync 10k files / 10GB across clients
2. **Delta sync efficiency**: Modify 1 byte in 1GB file, measure transfer
3. **Conflict handling**: Simultaneous edits from 2 clients
4. **Upload/download throughput**: Large file (10GB) transfer speed
5. **Concurrent users**: 50/100/500 simultaneous web UI users
6. **Search performance**: Full-text search across 100k files
7. **Sharing workflow**: Create link → access → upload → notify roundtrip
8. **Mobile photo upload**: Reliability over unstable connections
9. **Collaborative editing**: 5+ users editing same document simultaneously
10. **Storage efficiency**: Dedup ratio with similar file sets

---

## Cross-Category Architecture Notes

### Common Self-Hosted Patterns

1. **Reverse Proxy + TLS Termination**: Traefik / Caddy / Nginx Proxy Manager in front of all services. Auto Let's Encrypt. Single entry point.
2. **SSO Integration**: All Tier 4 services should authenticate against a single IdP (Category 1). OIDC preferred over SAML for self-hosted.
3. **Database Consolidation**: PostgreSQL as the universal DB. Most services support it. Single backup strategy.
4. **Object Storage**: MinIO as S3-compatible backend for file storage, email attachments, media files, analytics data.
5. **Docker Compose / Kubernetes**: Docker Compose for single-node homelab. K8s (k3s) for multi-node.
6. **Backup Strategy**: Restic/BorgBackup for file-level. pg_dump for databases. 3-2-1 rule.

### Recommended Homelab Stack (Opinionated)

| Category | Pick | Why |
|----------|------|-----|
| Auth & Identity | **Authentik** | Best UX, flow engine, forward auth, sweet spot of features vs complexity |
| Email | **Stalwart Mail** | Modern Rust all-in-one, tiny footprint, JMAP support |
| Chat | **Matrix (Conduwuit)** + Element | Federation, E2EE, bridges to everything, Conduwuit is lightweight |
| Media | **Jellyfin** + **Navidrome** | Fully free, great community, Navidrome for music focus |
| Analytics | **Umami** | Simplest self-host, beautiful, privacy-first, MIT license |
| File Sync | **Nextcloud** | Ecosystem is unmatched despite resource usage; or **Seafile** for pure sync performance |

### Total Resource Estimate (Minimal Homelab Stack)

| Component | RAM | CPU |
|-----------|-----|-----|
| Authentik | 1.2GB | 1 core |
| Stalwart Mail | 100MB | 0.5 cores |
| Conduwuit (Matrix) | 100MB | 0.5 cores |
| Jellyfin | 300MB | 1 core (+ GPU for HW transcode) |
| Navidrome | 50MB | 0.25 cores |
| Umami | 150MB | 0.5 cores |
| Nextcloud | 512MB | 1 core |
| PostgreSQL (shared) | 500MB | 1 core |
| Traefik | 50MB | 0.25 cores |
| **Total** | **~3GB** | **~6 cores** |

A modest homelab box with 8GB RAM and a 4-core CPU can comfortably run this entire stack.
