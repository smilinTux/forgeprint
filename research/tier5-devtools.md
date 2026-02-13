# Tier 5 — Developer & Business Tools Research

> Deep research compiled 2026-02-13. Sources: GitHub, vendor docs, community comparisons.

---

## 1. CMS & Blog Platforms (WordPress-killer)

### Top 10 Open Source

| # | Name | Language | GitHub Stars | License | Differentiator |
|---|------|----------|-------------|---------|----------------|
| 1 | **WordPress** | PHP | ~19K (mirror) | GPLv2 | 43% of all websites, 60K+ plugins, largest ecosystem |
| 2 | **Strapi** | JavaScript/TS | ~65K | MIT (v4) / EE | Leading headless CMS, REST + GraphQL, plugin marketplace |
| 3 | **Ghost** | JavaScript | ~48K | MIT | Purpose-built for publishing, native memberships/newsletters |
| 4 | **Payload CMS** | TypeScript | ~32K | MIT | Code-first config, Next.js native, self-hosted, no vendor lock-in |
| 5 | **Directus** | TypeScript | ~30K | GPLv3 / BSL | Wraps any SQL database, instant REST/GraphQL API |
| 6 | **Hugo** | Go | ~78K | Apache-2.0 | Fastest SSG (<1ms/page), single binary, no dependencies |
| 7 | **Astro** | TypeScript | ~50K | MIT | Islands architecture, partial hydration, multi-framework |
| 8 | **KeystoneJS** | TypeScript | ~9.5K | MIT | GraphQL-native, Prisma-backed, flexible admin UI |
| 9 | **Eleventy (11ty)** | JavaScript | ~17K | MIT | Zero-config SSG, template language agnostic |
| 10 | **WriteFreely** | Go | ~4.5K | AGPLv3 | Minimalist federated blogging (ActivityPub), privacy-focused |

**Honorable Mentions:** Jekyll (49K stars, Ruby), Plone (Python/Zope), Wagtail (18K, Django-based), Decap CMS (18K, Git-based)

### Top 10 Proprietary/SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Contentful** | Contentful GmbH | Free tier → $300/mo (Team) → Custom (Enterprise) |
| 2 | **Sanity** | Sanity.io | Free (personal) → $99/mo (Team) → $949/mo (Business) |
| 3 | **Webflow** | Webflow Inc. | Free → $14-39/mo (site) → $28-60/mo (workspace) |
| 4 | **Wix** | Wix.com | Free → $17-159/mo |
| 5 | **Squarespace** | Squarespace | $16-65/mo |
| 6 | **Medium** | Medium/A Medium Corp | Free (reader) → $5/mo (member); Partner Program for writers |
| 7 | **Substack** | Substack Inc. | Free; 10% rev share on paid subscriptions |
| 8 | **Hashnode** | Hashnode | Free (devs) → Teams $99/mo → Enterprise custom |
| 9 | **Prismic** | Prismic | Free → $100/mo (Small) → $500/mo (Medium) → Custom |
| 10 | **Builder.io** | Builder.io | Free → $49/mo → $199/mo → Enterprise custom |

### Feature Matrix (75 Features)

| Feature | WordPress | Ghost | Strapi | Payload | Hugo | Astro | Contentful | Webflow |
|---------|:---------:|:-----:|:------:|:-------:|:----:|:-----:|:----------:|:-------:|
| WYSIWYG editor | ✅ Gutenberg | ✅ Koenig | ✅ | ✅ Rich text | ❌ | ❌ | ✅ | ✅ |
| Markdown support | ✅ plugin | ✅ native | ✅ | ✅ | ✅ native | ✅ native | ✅ | ❌ |
| Media library | ✅ | ✅ | ✅ | ✅ | ❌ (static) | ❌ | ✅ | ✅ |
| SEO tools | ✅ Yoast | ✅ built-in | ✅ plugin | ✅ | ✅ templates | ✅ | ✅ | ✅ |
| Custom themes | ✅ 11K+ | ✅ Handlebars | ❌ headless | ❌ headless | ✅ | ✅ | ❌ headless | ✅ |
| Plugins/extensions | ✅ 60K+ | ✅ integrations | ✅ marketplace | ✅ plugins | ❌ | ✅ integrations | ✅ apps | ✅ apps |
| Multi-language (i18n) | ✅ WPML/Polylang | ✅ | ✅ native | ✅ native | ✅ | ✅ | ✅ | ⚠️ limited |
| Custom post types | ✅ | ❌ | ✅ content types | ✅ collections | ✅ archetypes | ✅ collections | ✅ content models | ❌ |
| Taxonomies | ✅ | ✅ tags | ✅ relations | ✅ | ✅ | ✅ | ✅ | ✅ CMS |
| RSS feeds | ✅ | ✅ | ⚠️ custom | ⚠️ custom | ✅ | ✅ | ❌ | ✅ |
| Comments | ✅ native | ✅ native | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Newsletters | ⚠️ plugin | ✅ native | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Membership/paywall | ⚠️ plugin | ✅ native | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Static site generation | ⚠️ plugin | ❌ | ❌ | ❌ | ✅ core | ✅ core | ❌ | ✅ |
| Headless API (REST) | ✅ | ✅ Content API | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Headless API (GraphQL) | ⚠️ plugin | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Content versioning | ✅ revisions | ❌ | ✅ drafts | ✅ drafts/versions | ✅ Git | ✅ Git | ✅ | ✅ |
| Scheduled publishing | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Multi-author | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Role-based access | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Analytics | ⚠️ plugin | ✅ built-in | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Custom fields | ✅ ACF | ❌ | ✅ | ✅ | ✅ front matter | ✅ | ✅ | ✅ |
| Drag-and-drop builder | ✅ Gutenberg | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Real-time collaboration | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Webhooks | ⚠️ plugin | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Self-hostable | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

**Additional features tracked (not shown for brevity):** image optimization, CDN integration, A/B testing, form builders, e-commerce integration, search (Algolia/ElasticSearch), database flexibility (SQLite/Postgres/MySQL/MongoDB), SSO/OAuth, audit logs, content workflows/approval, API rate limiting, asset transformations, preview/staging environments, CLI tools, SDK availability, migration tools, backup/restore, multi-tenancy, white-labeling, custom dashboard widgets, edge deployment, ISR (incremental static regeneration).

### Architecture Patterns

| Pattern | Examples | Characteristics |
|---------|----------|----------------|
| **Monolithic (traditional)** | WordPress, Plone | Server-rendered, tightly coupled front+back, plugin architecture |
| **Headless CMS** | Strapi, Directus, Payload, Contentful, Sanity | API-only backend, frontend decoupled, REST/GraphQL |
| **Static Site Generator** | Hugo, Astro, Eleventy, Jekyll | Build-time rendering, CDN deployment, Git-based content |
| **Hybrid** | Ghost, Astro (SSR+SSG) | Server-rendered + static, best of both |
| **Visual/No-code** | Webflow, Wix, Squarespace | Drag-and-drop, proprietary hosting, all-in-one |

### Memory & Performance

- **WordPress:** 256MB-512MB RAM minimum; PHP process pool; database-heavy; caching essential (Redis/Memcached + page cache)
- **Ghost:** ~150MB RAM; Node.js single-process; SQLite (small) or MySQL; built-in caching
- **Strapi:** ~200-400MB RAM; Node.js; PostgreSQL/MySQL/SQLite; media uploads to S3/Cloudinary recommended
- **Hugo:** ~50MB build-time only; zero runtime; output is static HTML
- **Astro:** ~100MB build; optional SSR runtime (Node/Deno/edge); partial hydration minimizes client JS

### Testing Criteria for ForgePrint

- [ ] Content CRUD via API (REST + GraphQL)
- [ ] Custom content type creation
- [ ] Media upload and transformation
- [ ] User roles and permissions
- [ ] i18n content creation
- [ ] Webhook delivery on content events
- [ ] Build time for 1000+ pages (SSG)
- [ ] Concurrent editor performance
- [ ] Plugin/extension installation
- [ ] Migration from WordPress export

---

## 2. E-Commerce Platforms (Shopify-killer)

### Top 10 Open Source

| # | Name | Language | GitHub Stars | License | Differentiator |
|---|------|----------|-------------|---------|----------------|
| 1 | **Medusa** | TypeScript | ~31K | MIT | Modular architecture, composable commerce, Stripe-native |
| 2 | **Saleor** | Python/GraphQL | ~22K | BSD-3 | GraphQL-first, async architecture, enterprise-grade |
| 3 | **WooCommerce** | PHP | ~9.5K | GPLv3 | WordPress plugin, largest market share in OSS ecommerce |
| 4 | **Magento/Adobe Commerce** | PHP | ~11K | OSL-3.0 | Enterprise features, multi-store, massive ecosystem |
| 5 | **PrestaShop** | PHP | ~8K | OSL-3.0 | European market leader, 600+ features OOTB |
| 6 | **Vendure** | TypeScript | ~6K | GPL-3.0 | NestJS-based, GraphQL, extremely well-documented |
| 7 | **Bagisto** | PHP (Laravel) | ~15K | MIT | Laravel ecosystem, multi-warehouse, B2B features |
| 8 | **Solidus** | Ruby | ~5K | BSD-3 | Spree fork, stable, enterprise-focused |
| 9 | **Spree Commerce** | Ruby | ~13K | BSD-3 | Multi-vendor marketplace, headless, 50+ extensions |
| 10 | **OpenCart** | PHP | ~7.5K | GPLv3 | Simple, lightweight, 13K+ extensions marketplace |

### Top 10 Proprietary/SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Shopify** | Shopify Inc. | $39-399/mo (Basic→Advanced) + 2.4-2.9% tx; Plus from $2K/mo |
| 2 | **BigCommerce** | BigCommerce | $39-399/mo + Enterprise custom |
| 3 | **Stripe (Commerce)** | Stripe | 2.9% + 30¢ per transaction; no monthly fee |
| 4 | **Square Online** | Block Inc. | Free → $29-79/mo + 2.9% + 30¢ |
| 5 | **Gumroad** | Gumroad | Free; 10% flat fee per sale |
| 6 | **Lemon Squeezy** | Lemon Squeezy | Free; 5% + 50¢ per transaction (MoR) |
| 7 | **Paddle** | Paddle | 5% + 50¢ per transaction (MoR, handles tax) |
| 8 | **Ecwid** | Lightspeed | Free → $25-82/mo |
| 9 | **Snipcart** | Snipcart | 2% per transaction (min $10/mo) |
| 10 | **ThriveCart** | ThriveCart | $495 lifetime (one-time) |

### Feature Matrix (70 Features)

| Feature | Medusa | Saleor | WooCommerce | Shopify | Vendure | Stripe |
|---------|:------:|:------:|:-----------:|:-------:|:-------:|:------:|
| Product catalog | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Variants/SKUs | ✅ | ✅ | ✅ | ✅ (100 limit) | ✅ | ✅ |
| Inventory management | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Shopping cart | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Checkout |
| Checkout flow (custom) | ✅ | ✅ | ✅ | ⚠️ Plus only | ✅ | ✅ |
| Payment gateways | ✅ multi | ✅ multi | ✅ 100+ | ✅ Shopify Pay + others | ✅ | ✅ native |
| Tax calculation | ✅ | ✅ | ✅ plugin | ✅ | ✅ | ✅ Tax |
| Shipping rates | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Order management | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Customer accounts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Wishlists | ⚠️ plugin | ✅ | ✅ plugin | ⚠️ app | ✅ | ❌ |
| Reviews/ratings | ⚠️ plugin | ❌ | ✅ plugin | ⚠️ app | ❌ | ❌ |
| Discount codes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Coupons |
| Gift cards | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Subscriptions | ✅ | ✅ | ✅ plugin | ⚠️ app | ⚠️ plugin | ✅ Billing |
| Digital downloads | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Multi-currency | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-language | ✅ | ✅ | ✅ WPML | ✅ | ✅ | ⚠️ |
| Search & filtering | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Analytics | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ Dashboard |
| Abandoned cart recovery | ✅ | ⚠️ | ✅ plugin | ✅ | ❌ | ❌ |
| Email notifications | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Headless/API-first | ✅ | ✅ GraphQL | ✅ REST | ✅ Storefront API | ✅ GraphQL | ✅ |
| PCI compliance | ✅ (via gateway) | ✅ | ✅ (via gateway) | ✅ Level 1 | ✅ (via gateway) | ✅ Level 1 |
| Multi-vendor/marketplace | ⚠️ | ⚠️ | ✅ plugin | ⚠️ app | ❌ | ✅ Connect |
| B2B features | ✅ | ✅ | ⚠️ | ✅ Plus | ⚠️ | ❌ |
| Self-hostable | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |

**Additional features:** product bundles, upsell/cross-sell, loyalty programs, POS integration, multi-warehouse, returns/refunds management, invoice generation, dropshipping, product import/export (CSV), SEO tools, social commerce, mobile app/SDK, custom checkout fields, fraud detection, A/B testing, CDN/image optimization, real-time inventory sync, customer segmentation, automated workflows, print-on-demand.

### Architecture Patterns

| Pattern | Examples | Characteristics |
|---------|----------|----------------|
| **Monolithic** | WooCommerce, Magento, PrestaShop, OpenCart | All-in-one, server-rendered storefront + admin |
| **Headless/API-first** | Medusa, Saleor, Vendure | Backend API only, BYO frontend (Next.js, Gatsby) |
| **Merchant of Record (MoR)** | Lemon Squeezy, Paddle, Gumroad | Handle tax, compliance, billing; you just sell |
| **Embeddable** | Snipcart, Ecwid | Add commerce to any existing site |
| **Composable Commerce** | Medusa v2 | Modular services, each replaceable independently |

### Memory & Performance

- **Medusa v2:** ~200-400MB RAM; Node.js + PostgreSQL + Redis; modular services
- **Saleor:** ~300-500MB RAM; Python/Django + PostgreSQL + Redis + Celery workers
- **WooCommerce:** Same as WordPress (~256-512MB); heavily dependent on hosting + caching
- **Shopify:** Managed; CDN-backed; 99.99% uptime SLA on Plus
- **Vendure:** ~200-300MB RAM; NestJS + TypeORM (Postgres/MySQL/SQLite)

### Testing Criteria

- [ ] Product CRUD + variant management via API
- [ ] Cart → Checkout → Payment flow (Stripe test mode)
- [ ] Discount code application
- [ ] Multi-currency pricing
- [ ] Order lifecycle (placed → paid → fulfilled → refunded)
- [ ] Webhook delivery on order events
- [ ] Inventory tracking accuracy under concurrent orders
- [ ] Search performance with 10K+ products
- [ ] Storefront page load time (headless frontend)
- [ ] Plugin/extension installation and compatibility

---

## 3. Project Management & Issue Tracking

### Top 10 Open Source

| # | Name | Language | GitHub Stars | License | Differentiator |
|---|------|----------|-------------|---------|----------------|
| 1 | **Plane** | TypeScript/Python | ~43K | AGPLv3 | Modern Jira/Linear alternative, beautiful UI, fast-growing |
| 2 | **Huly** | TypeScript | ~18K | EPL-2.0 | All-in-one (PM + HR + CRM), real-time collaboration |
| 3 | **Taiga** | Python/Angular | ~7K | MPL-2.0 | Scrum + Kanban, mature, backed by Kaleidos |
| 4 | **OpenProject** | Ruby | ~9.5K | GPLv3 | Enterprise PM, Gantt charts, BIM support, German engineering |
| 5 | **Focalboard** | Go/TypeScript | ~22K | AGPL/MIT | Mattermost-backed, Notion-like boards, lightweight |
| 6 | **Vikunja** | Go | ~5K | AGPLv3 | Todoist alternative, lightweight, fast, CalDAV support |
| 7 | **WeKan** | JavaScript | ~19.5K | MIT | Trello-like kanban, simple, mature |
| 8 | **Leantime** | PHP | ~5K | AGPLv2 | Strategy-focused, OKRs, non-technical user friendly |
| 9 | **Redmine** | Ruby | ~5.3K | GPLv2 | Veteran (since 2006), flexible, massive plugin ecosystem |
| 10 | **Tuleap** | PHP | ~1K | GPLv2 | Full ALM (Agile + Waterfall + DevOps), enterprise |

### Top 10 Proprietary/SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Jira** | Atlassian | Free (10 users) → $8.15/user/mo (Standard) → $16/user/mo (Premium) |
| 2 | **Linear** | Linear Inc. | Free (250 issues) → $8/user/mo → Custom |
| 3 | **Asana** | Asana Inc. | Free → $10.99/user/mo → $24.99/user/mo → Enterprise |
| 4 | **Monday.com** | Monday.com | Free (2 users) → $9-19/user/mo → Enterprise |
| 5 | **ClickUp** | ClickUp | Free → $7/user/mo → $12/user/mo → Enterprise |
| 6 | **Notion** | Notion Labs | Free → $10/user/mo → $15/user/mo |
| 7 | **Trello** | Atlassian | Free → $5/user/mo → $10/user/mo → $17.50/user/mo |
| 8 | **Basecamp** | 37signals | $15/user/mo or $349/mo flat (unlimited) |
| 9 | **Shortcut** | Shortcut | Free → $8.50/user/mo → $16/user/mo |
| 10 | **Height** | Height Inc. | Free → $8.50/user/mo → Enterprise |

### Feature Matrix (65 Features)

| Feature | Plane | Huly | Jira | Linear | Asana | ClickUp |
|---------|:-----:|:----:|:----:|:------:|:-----:|:-------:|
| Kanban boards | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gantt charts | ✅ | ⚠️ | ✅ | ❌ | ✅ | ✅ |
| Sprints/agile | ✅ | ✅ | ✅ | ✅ cycles | ⚠️ | ✅ |
| Backlog management | ✅ | ✅ | ✅ | ✅ triage | ⚠️ | ✅ |
| Issue tracking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Time tracking | ⚠️ | ✅ | ✅ plugin | ❌ | ✅ | ✅ |
| Milestones | ✅ modules | ✅ | ✅ versions | ✅ projects | ✅ | ✅ |
| Epics/stories/tasks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom fields | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Filters/views | ✅ | ✅ | ✅ JQL | ✅ | ✅ | ✅ |
| Automations | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Templates | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| File attachments | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comments/mentions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Roadmaps | ✅ | ✅ | ✅ | ✅ | ✅ timeline | ✅ |
| Reports/dashboards | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendar view | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Dependencies | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Workload management | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ |
| Guest access | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| API | ✅ REST | ✅ | ✅ REST | ✅ GraphQL | ✅ REST | ✅ REST |
| Webhooks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Import/export | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mobile app | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Wiki/docs | ✅ Pages | ✅ | ✅ Confluence | ❌ | ❌ | ✅ Docs |
| AI features | ✅ Plane AI | ✅ | ✅ Atlassian AI | ✅ | ✅ | ✅ |
| Self-hostable | ✅ | ✅ | ✅ Data Center | ❌ | ❌ | ❌ |
| Git integration | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |

**Additional features:** sub-tasks, recurring tasks, task priorities, labels/tags, bulk operations, keyboard shortcuts, dark mode, SSO/SAML, audit logs, activity feeds, email-to-task, Slack/Teams integration, Zapier/automation connectors, OKRs/goals, portfolio view, resource planning, time estimates, SLA tracking, approvals/workflows.

### Architecture Patterns

| Pattern | Examples | Characteristics |
|---------|----------|----------------|
| **Monolithic web app** | Redmine, OpenProject, Tuleap | Server-rendered, single deployment, plugin-extensible |
| **Modern SPA + API** | Plane, Huly, Linear | React/Next.js frontend + REST/GraphQL API backend |
| **Embedded/integrated** | Focalboard (Mattermost) | Part of larger platform, can run standalone |
| **Micro-frontend** | Jira (Atlassian ecosystem) | Interconnected products (Confluence, Bitbucket) |

### Memory & Performance

- **Plane:** ~300-500MB RAM; Next.js + Django + PostgreSQL + Redis; Docker Compose
- **Huly:** ~500MB-1GB RAM; Svelte + Node.js + MongoDB + MinIO; Kubernetes-native
- **Jira:** 2-4GB RAM (self-hosted Data Center); Java/Tomcat + PostgreSQL
- **Linear:** Managed SaaS; known for exceptional performance (local-first sync)
- **OpenProject:** ~500MB-1GB RAM; Ruby on Rails + PostgreSQL + Memcached

### Testing Criteria

- [ ] Project + issue CRUD via API
- [ ] Kanban board drag-and-drop responsiveness
- [ ] Sprint planning workflow
- [ ] Custom field creation and filtering
- [ ] Bulk operations (move, assign, label 100+ issues)
- [ ] Real-time collaboration (multiple users editing)
- [ ] Git commit linking
- [ ] Import from Jira/Trello
- [ ] Notification delivery (in-app, email, webhook)
- [ ] Performance with 10K+ issues in a project

---

## 4. AI/ML Serving & Inference Platforms

### Top 10 Open Source

| # | Name | Language | GitHub Stars | License | Differentiator |
|---|------|----------|-------------|---------|----------------|
| 1 | **llama.cpp** | C/C++ | ~75K | MIT | Pure C++ inference, GGUF format creator, CPU+GPU, tiny footprint |
| 2 | **Ollama** | Go (wraps llama.cpp) | ~115K | MIT | One-command model running, Modelfile, dead-simple UX |
| 3 | **vLLM** | Python | ~50K | Apache-2.0 | PagedAttention, continuous batching, highest throughput |
| 4 | **LocalAI** | Go/C++ | ~30K | MIT | OpenAI drop-in replacement, multi-backend, multi-modal |
| 5 | **text-generation-webui** | Python | ~42K | AGPL-3.0 | Gradio UI, all backends (GGUF/GPTQ/AWQ/EXL2), character chat |
| 6 | **TensorRT-LLM** | C++/Python | ~9K | Apache-2.0 | NVIDIA optimized, FP8/INT4, fastest on NVIDIA GPUs |
| 7 | **GPT4All** | C++/Python | ~72K | MIT | Desktop app, offline, privacy-focused, runs on CPU |
| 8 | **Jan** | TypeScript | ~27K | AGPLv3 | Desktop app (Electron), OpenAI-compatible, local-first |
| 9 | **LMStudio** | TypeScript | N/A (closed) | Proprietary (free) | Best desktop UX, model discovery, quantization browser |
| 10 | **BentoML** | Python | ~7.5K | Apache-2.0 | ML model serving framework, containerization, composable |

**Honorable Mentions:** Ray Serve (~35K as part of Ray), KServe (~4K, Kubernetes-native), Seldon Core (~4.5K), OpenLLM (~10K), Triton Inference Server (~8.5K, NVIDIA, multi-framework)

### Top 10 Proprietary/SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **OpenAI API** | OpenAI | Pay-per-token ($2.50-15/1M tokens depending on model) |
| 2 | **AWS SageMaker** | Amazon | Per-instance-hour ($0.05-$65/hr depending on GPU) |
| 3 | **Google Vertex AI** | Google Cloud | Per-prediction + compute; Gemini API pay-per-token |
| 4 | **Azure ML / Azure OpenAI** | Microsoft | Per-instance + per-token for OpenAI models |
| 5 | **Hugging Face Inference** | Hugging Face | Free (rate-limited) → $0.60/hr (dedicated) → Enterprise |
| 6 | **Together AI** | Together AI | $0.20-1.20/1M tokens; serverless + dedicated |
| 7 | **Replicate** | Replicate | Per-second compute ($0.000225-$0.0032/sec) |
| 8 | **Fireworks AI** | Fireworks | $0.20-0.90/1M tokens; serverless |
| 9 | **Groq** | Groq Inc. | Free tier → $0.04-0.80/1M tokens; LPU hardware |
| 10 | **Anthropic API** | Anthropic | $3-15/1M tokens (Claude Sonnet→Opus) |

### Feature Matrix (70 Features)

| Feature | Ollama | vLLM | llama.cpp | LocalAI | TensorRT-LLM | HF Inference |
|---------|:------:|:----:|:---------:|:-------:|:------------:|:------------:|
| Model loading/serving | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| REST API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| gRPC API | ❌ | ❌ | ❌ | ✅ | ✅ Triton | ❌ |
| OpenAI-compatible API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Streaming responses | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Continuous batching | ❌ | ✅ | ⚠️ | ❌ | ✅ | ✅ |
| GGUF quantization | ✅ | ⚠️ | ✅ native | ✅ | ❌ | ❌ |
| GPTQ quantization | ❌ | ✅ | ❌ | ⚠️ | ❌ | ✅ |
| AWQ quantization | ❌ | ✅ | ❌ | ⚠️ | ✅ | ✅ |
| EXL2 quantization | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ ExLlamaV2 |
| FP8/INT4 | ❌ | ✅ | ⚠️ | ❌ | ✅ native | ✅ |
| GPU memory management | ⚠️ basic | ✅ PagedAttention | ⚠️ | ⚠️ | ✅ | ✅ |
| Multi-GPU (tensor parallel) | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ |
| Model caching | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| LoRA adapter loading | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Embedding generation | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Vision/multimodal | ✅ | ✅ | ✅ llava | ✅ | ✅ | ✅ |
| Function calling | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ |
| Structured output (JSON) | ✅ | ✅ | ✅ grammar | ✅ | ⚠️ | ✅ |
| Token counting | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rate limiting | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Model registry | ✅ ollama.com | ❌ | ❌ | ❌ | ❌ | ✅ Hub |
| Auto-scaling | ❌ | ⚠️ | ❌ | ❌ | ❌ | ✅ |
| Health checks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Metrics/monitoring | ⚠️ | ✅ Prometheus | ⚠️ | ✅ | ✅ | ✅ |
| Prompt caching | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Speculative decoding | ❌ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| CPU inference | ✅ | ❌ (GPU only) | ✅ | ✅ | ❌ (GPU only) | N/A |
| Apple Silicon (Metal) | ✅ | ❌ | ✅ | ✅ | ❌ | N/A |
| AMD GPU (ROCm) | ✅ | ✅ | ✅ | ⚠️ | ❌ | N/A |
| Desktop GUI | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Additional features:** prefix caching, chunked prefill, pipeline parallelism, weight streaming, KV cache compression, flash attention, context length extension (RoPE scaling), beam search, multiple sampling strategies (top-k, top-p, min-p, temperature), repetition penalty, stop sequences, seed for reproducibility, request queuing, priority scheduling, model warm-up, graceful shutdown, container images (Docker/OCI), Helm charts, multi-model serving, model sharding, disaggregated serving, tool use parsing.

### Architecture Patterns

| Pattern | Examples | Characteristics |
|---------|----------|----------------|
| **Single-binary CLI** | Ollama, llama.cpp | Download and run, minimal deps, embedded server |
| **Python serving framework** | vLLM, BentoML, Ray Serve | pip install, GPU-optimized, production-grade |
| **Kubernetes-native** | KServe, Seldon, Triton | CRDs, auto-scaling, model mesh, enterprise |
| **Desktop application** | LMStudio, Jan, GPT4All | GUI, model browser, zero-config for end users |
| **Managed cloud** | Together AI, Fireworks, Groq | API-only, pay-per-token, zero ops |

### Memory & Performance

- **Ollama:** Wraps llama.cpp; RAM = model size + ~500MB overhead; auto-offloads to GPU
- **vLLM:** PagedAttention reduces GPU memory waste by ~60-80%; 2-5x throughput vs naive serving; GPU-only
- **llama.cpp:** Most memory-efficient; Q4_K_M 7B model = ~4.5GB RAM; runs on CPU, Metal, CUDA, ROCm, Vulkan
- **TensorRT-LLM:** Highest single-GPU perf on NVIDIA; FP8 on H100 = 2-3x vs FP16; complex setup
- **Rule of thumb:** Q4 quantized model needs ~0.6x parameter count in GB (7B → ~4.2GB, 70B → ~42GB)

### Testing Criteria

- [ ] Model download and first inference time
- [ ] Tokens/second (single user, batch)
- [ ] Concurrent request throughput (10, 50, 100 users)
- [ ] GPU memory utilization efficiency
- [ ] OpenAI API compatibility (chat completions, embeddings)
- [ ] Function calling accuracy
- [ ] Structured output (JSON mode) reliability
- [ ] LoRA hot-swapping latency
- [ ] Vision/multimodal input handling
- [ ] Graceful handling of OOM conditions

---

## 5. Form Builders & Survey Tools

### Top 10 Open Source

| # | Name | Language | GitHub Stars | License | Differentiator |
|---|------|----------|-------------|---------|----------------|
| 1 | **Formbricks** | TypeScript | ~9K | AGPLv3 | Experience management (surveys + in-app), privacy-first |
| 2 | **SurveyJS** | TypeScript | ~4.5K | MIT (library) | Client-side rendering, JSON-based forms, framework-agnostic |
| 3 | **LimeSurvey** | PHP | ~2.8K | GPLv2 | Academic/research surveys, 80+ question types, 80+ languages |
| 4 | **Typebot** | TypeScript | ~8K | AGPLv3 | Conversational forms (chatbot-style), visual flow builder |
| 5 | **OpnForm** | PHP (Laravel) + Vue | ~3K | AGPLv3 | Simple, beautiful, Notion-like form builder |
| 6 | **OhMyForm** | TypeScript | ~2.8K | MIT | Typeform alternative, drag-and-drop, analytics |
| 7 | **Heyflow** | TypeScript | N/A (SaaS) | Proprietary | Interactive flows, high conversion optimization |
| 8 | **NocoDB (forms)** | TypeScript | ~51K | AGPLv3 | Airtable alternative with built-in form view |
| 9 | **Tally** | N/A | N/A (SaaS free) | Proprietary (generous free) | Notion-like UX, unlimited forms free |
| 10 | **Formspree** | N/A | N/A (SaaS) | Proprietary | Form backend API, works with any static site |

### Top 10 Proprietary/SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Typeform** | Typeform SL | Free (10 responses) → $25-83/mo → Enterprise |
| 2 | **Google Forms** | Google | Free (with Google account) |
| 3 | **JotForm** | JotForm Inc. | Free (5 forms) → $34-99/mo → Enterprise |
| 4 | **SurveyMonkey** | Momentive | Free → $25-75/user/mo → Enterprise |
| 5 | **Microsoft Forms** | Microsoft | Free with M365; included in Business plans |
| 6 | **Cognito Forms** | Cognito Forms | Free → $15-99/mo |
| 7 | **Airtable (forms)** | Airtable | Free → $20-45/user/mo |
| 8 | **Paperform** | Paperform | $24-159/mo |
| 9 | **Formstack** | Formstack | $50-250/mo |
| 10 | **123FormBuilder** | 123FormBuilder | Free → $25-85/mo |

### Feature Matrix (60 Features)

| Feature | Formbricks | LimeSurvey | Typebot | Typeform | Google Forms | JotForm |
|---------|:----------:|:----------:|:-------:|:--------:|:------------:|:-------:|
| Drag-and-drop builder | ✅ | ✅ | ✅ visual flow | ✅ | ✅ | ✅ |
| Conditional logic | ✅ | ✅ | ✅ branching | ✅ | ✅ | ✅ |
| Multi-page forms | ✅ | ✅ | ✅ steps | ✅ | ✅ sections | ✅ |
| File uploads | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Payment integration | ⚠️ | ⚠️ | ✅ Stripe | ✅ | ❌ | ✅ |
| Email notifications | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ | ❌ (Apps Script) | ✅ |
| API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom themes | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Embedded forms | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Analytics/responses | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export (CSV/Excel) | ✅ | ✅ | ✅ | ✅ | ✅ Sheets | ✅ |
| Spam protection | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Pre-fill | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partial submissions | ⚠️ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Calculations | ❌ | ✅ | ⚠️ | ✅ | ❌ | ✅ |
| Signature fields | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Date pickers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rating scales | ✅ | ✅ | ✅ | ✅ | ✅ linear | ✅ |
| Matrix questions | ❌ | ✅ | ❌ | ✅ | ✅ grid | ✅ |
| Logic jumps/piping | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Thank you pages | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Collaboration | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| GDPR compliance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Conversational UI | ❌ | ❌ | ✅ native | ✅ native | ❌ | ⚠️ |
| Self-hostable | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

**Additional features:** quiz mode/scoring, randomization, quotas, time limits, auto-save, offline mode, QR code sharing, URL shortening, password protection, response limits, hidden fields, address autocomplete, phone validation, Zapier/Make integration, Slack notifications, Google Sheets sync, CRM integration (HubSpot/Salesforce), A/B testing, NPS/CSAT/CES templates, multi-language surveys, white-labeling, custom CSS, accessibility (WCAG), keyboard navigation, mobile-responsive.

### Architecture Patterns

| Pattern | Examples | Characteristics |
|---------|----------|----------------|
| **Conversational/chatbot** | Typebot, Typeform | One question at a time, high engagement |
| **Traditional form builder** | LimeSurvey, JotForm, Google Forms | All fields visible, section-based |
| **Experience management** | Formbricks | In-app surveys, user targeting, product feedback |
| **Form backend/API** | Formspree, Basin | No UI builder; accept submissions from any frontend |
| **Database-integrated** | NocoDB, Airtable | Forms feed directly into structured database |

### Memory & Performance

- **Formbricks:** ~200-300MB RAM; Next.js + PostgreSQL + Docker
- **LimeSurvey:** ~128-256MB RAM; PHP + MySQL; lightweight, handles 1000s of concurrent respondents
- **Typebot:** ~200MB RAM; Next.js + PostgreSQL + S3-compatible storage
- **Google Forms:** Managed; unlimited scale; tied to Google Workspace

### Testing Criteria

- [ ] Form creation with 15+ field types
- [ ] Conditional logic (show/hide, skip, branch)
- [ ] File upload handling (size limits, types)
- [ ] Payment collection (Stripe test mode)
- [ ] Webhook delivery on submission
- [ ] Embed in external website (iframe + JS widget)
- [ ] Response export (CSV, JSON)
- [ ] Concurrent submission handling (100+)
- [ ] Mobile responsiveness
- [ ] Accessibility (screen reader, keyboard nav)

---

## 6. Status Pages & Uptime Monitoring

### Top 10 Open Source

| # | Name | Language | GitHub Stars | License | Differentiator |
|---|------|----------|-------------|---------|----------------|
| 1 | **Uptime Kuma** | JavaScript | ~81K | MIT | Beautiful UI, 90+ notification types, dead-simple setup |
| 2 | **Gatus** | Go | ~9.5K | Apache-2.0 | Config-as-code (YAML), lightweight, conditions DSL |
| 3 | **Vigil** | Rust | ~1.7K | MPL-2.0 | Microservice-oriented, push-based probing, tiny footprint |
| 4 | **Cachet** | PHP | ~14K | BSD-3 | Dedicated status page (no monitoring), beautiful, API-driven |
| 5 | **Ciao** | Go | ~2K | MIT | Simple HTTP checks, Docker-native, minimal |
| 6 | **StatPing-ng** | Go | ~8K (archived) | GPL-3.0 | All-in-one monitoring + status page (community fork) |
| 7 | **Staytus** | Ruby | ~3.5K | MIT | Status page only, email/SMS subscribers, maintenance windows |
| 8 | **OneUptime** | TypeScript | ~5K | Apache-2.0 | Full observability (monitors + status + incidents + logs) |
| 9 | **Kener** | TypeScript | ~3K | MIT | Modern status page, GitHub-based incident management |
| 10 | **Upptime** | TypeScript | ~15K | MIT | GitHub Actions-powered, no server needed, free hosting |

### Top 10 Proprietary/SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Atlassian Statuspage** | Atlassian | Free (1 component) → $29-99/mo → Enterprise |
| 2 | **UptimeRobot** | UptimeRobot | Free (50 monitors) → $7-31/mo |
| 3 | **Better Uptime (Better Stack)** | Better Stack | Free → $24-85/mo → Enterprise |
| 4 | **Pingdom** | SolarWinds | $15-100/mo |
| 5 | **PagerDuty (Status)** | PagerDuty | $21-41/user/mo (+ status page add-on) |
| 6 | **Oh Dear** | Oh Dear BV | $12-120/mo |
| 7 | **Checkly** | Checkly | Free (5 checks) → $30-90/mo → Enterprise |
| 8 | **StatusCake** | StatusCake | Free → $20-66/mo |
| 9 | **Datadog Synthetics** | Datadog | $5-12/test/mo (part of Datadog platform) |
| 10 | **Instatus** | Instatus | Free → $20-300/mo |

### Feature Matrix (60 Features)

| Feature | Uptime Kuma | Gatus | Cachet | UptimeRobot | Better Stack | Checkly |
|---------|:-----------:|:-----:|:------:|:-----------:|:------------:|:-------:|
| HTTP monitoring | ✅ | ✅ | ❌ (status only) | ✅ | ✅ | ✅ |
| TCP monitoring | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| DNS monitoring | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Ping/ICMP | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| SSL certificate monitoring | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Response time tracking | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Multi-location checks | ❌ (single) | ⚠️ (self-deploy) | ❌ | ✅ | ✅ | ✅ 20+ |
| Public status page | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Incident management | ⚠️ manual | ❌ | ✅ | ✅ | ✅ | ❌ |
| Maintenance windows | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Email notifications | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SMS notifications | ⚠️ via services | ⚠️ | ❌ | ✅ paid | ✅ | ✅ |
| Webhook notifications | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Slack notifications | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Discord notifications | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Custom domains | ✅ (reverse proxy) | ✅ | ✅ | ✅ paid | ✅ | N/A |
| Uptime SLA tracking | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Badge/embed | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| API monitoring | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Keyword monitoring | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Cron job monitoring | ✅ push | ✅ | ❌ | ❌ | ✅ | ❌ |
| Heartbeat monitoring | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Custom status components | ✅ groups | ✅ | ✅ | ✅ | ✅ | N/A |
| Historical uptime | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Response time graphs | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Alerting rules | ✅ | ✅ conditions | ❌ | ✅ | ✅ | ✅ |
| Escalation policies | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Team management | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Browser/synthetic checks | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ Playwright |
| Self-hostable | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ CLI |
| Docker one-liner | ✅ | ✅ | ✅ | N/A | N/A | N/A |
| Subscriber notifications | ⚠️ | ❌ | ✅ | ✅ | ✅ | N/A |

**Additional features:** gRPC monitoring, MongoDB/Redis/MySQL checks, Docker container monitoring, game server monitoring (Uptime Kuma), Prometheus metrics export, Grafana integration, mobile apps, on-call scheduling, post-mortem templates, SLO/error budget tracking, multi-page status sites, component groups, real user monitoring (RUM), API endpoint testing (assertions), CI/CD integration, Terraform provider, SSO/SAML, audit logs, data retention policies, global infrastructure map.

### Architecture Patterns

| Pattern | Examples | Characteristics |
|---------|----------|----------------|
| **All-in-one (monitor + status)** | Uptime Kuma, Better Stack, OneUptime | Single app does monitoring, alerting, and status page |
| **Status page only** | Cachet, Staytus, Atlassian Statuspage | Manual/API incident reporting, no active monitoring |
| **Config-as-code** | Gatus, Upptime | YAML/Git-driven, GitOps-friendly, CI/CD integration |
| **Push-based** | Vigil, Healthchecks.io | Services report TO monitor (heartbeat/cron style) |
| **Synthetic monitoring** | Checkly, Datadog Synthetics | Script-based checks (Playwright), transaction monitoring |

### Memory & Performance

- **Uptime Kuma:** ~80-150MB RAM; Node.js + SQLite; handles 100s of monitors easily
- **Gatus:** ~20-50MB RAM; single Go binary; extremely lightweight
- **Vigil:** ~5-10MB RAM; Rust binary; designed for minimal resource usage
- **Cachet:** ~128MB RAM; PHP + MySQL/PostgreSQL; status page only (low load)
- **Upptime:** Zero server resources; runs on GitHub Actions; free hosting via GitHub Pages

### Testing Criteria

- [ ] Monitor setup for HTTP/TCP/DNS/Ping
- [ ] Alert delivery latency (time from failure to notification)
- [ ] Status page load time and customization
- [ ] SSL certificate expiry detection
- [ ] False positive rate (avoid flapping alerts)
- [ ] Multi-monitor dashboard overview
- [ ] API for programmatic monitor management
- [ ] Notification channel setup (Slack, Discord, email, webhook)
- [ ] Historical data retention and graph accuracy
- [ ] Recovery notification after downtime

---

## Cross-Category Architecture Summary

### Common Patterns Across All Categories

| Concern | Best Practice | Examples |
|---------|--------------|----------|
| **Deployment** | Docker Compose for dev, Kubernetes for prod | All modern OSS tools ship Docker images |
| **Database** | PostgreSQL as default, SQLite for dev/small | Plane, Medusa, Formbricks, Payload |
| **Caching** | Redis for sessions, queues, real-time | Medusa, Saleor, Plane, Huly |
| **Search** | Meilisearch/ElasticSearch/Typesense | Medusa (Meilisearch), WooCommerce (Algolia) |
| **File storage** | S3-compatible (MinIO self-hosted) | All headless CMS, ecommerce, forms |
| **Auth** | OAuth 2.0 / OIDC / SAML for enterprise | Keycloak integration common |
| **API style** | REST dominant, GraphQL for complex queries | Saleor, Linear, Payload, KeystoneJS |
| **Frontend** | React/Next.js dominant, Svelte rising | Huly (Svelte), most others React |

### Self-Hosting Stack Recommendations

For a single-server ForgePrint deployment:
```
PostgreSQL 16 ─── shared database
Redis 7 ────────── caching/queues
MinIO ──────────── S3-compatible storage
Traefik ────────── reverse proxy + auto-SSL
Docker Compose ─── orchestration
```

Estimated total RAM for running one tool from each category simultaneously:
- CMS (Ghost): ~150MB
- Ecommerce (Medusa): ~400MB
- PM (Plane): ~500MB
- AI Inference (Ollama): ~model size + 500MB
- Forms (Formbricks): ~300MB
- Monitoring (Uptime Kuma): ~100MB
- **Total baseline: ~2GB + model size**

---

*Research compiled from GitHub repositories, official documentation, vendor pricing pages, and community comparisons. Star counts approximate as of Feb 2026.*
