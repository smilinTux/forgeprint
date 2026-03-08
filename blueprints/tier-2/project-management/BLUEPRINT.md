# Project Management Platform Blueprint
> Linear / Jira / Asana / Trello alternative

## Overview
Task and project management tool with boards, lists, timelines, sprints, and workflow automation. Optimized for software development teams but flexible for any project type.

## Market Analysis
| Platform | Users | Pricing | Key Differentiator |
|----------|-------|---------|-------------------|
| Linear | 10K+ orgs | Free/$10/custom | Speed, keyboard-first UX |
| Jira | 10M+ | Free/$8.15/$16 | Customization, ecosystem |
| Asana | 139K+ orgs | Free/$11/$26 | Goals, portfolios |
| Trello | 50M+ | Free/$5/$10/$17.50 | Simplicity, Kanban |
| ClickUp | 10M+ | Free/$7/$12/custom | Feature density |
| Shortcut | 5K+ orgs | Free/$8.50/$16 | Dev-focused, API-first |

## Core Concepts
- **Issues/Tasks**: Atomic unit of work with status, assignee, priority, labels, estimates
- **Projects**: Group of issues with a goal and timeline
- **Views**: Board (Kanban), list, timeline (Gantt), calendar
- **Cycles/Sprints**: Time-boxed iterations
- **Workflows**: Customizable status transitions (Backlog → Todo → In Progress → Done)
- **Relations**: Blocks, blocked-by, duplicates, relates-to
- **Automations**: Rules triggered by status changes, assignments, etc.

## Architecture

```
┌─────────────────────────────────────────┐
│            CDN + Edge Cache              │
├─────────────────────────────────────────┤
│              API Server                  │
│  (GraphQL + REST + WebSocket)            │
├──────────┬──────────┬───────────────────┤
│ Issue    │ Project  │ Notification       │
│ Engine   │ Engine   │ Service            │
├──────────┴──────────┴───────────────────┤
│  PostgreSQL │ Redis │ Meilisearch │ S3  │
└─────────────────────────────────────────┘
```

### Data Model
```sql
organizations (id, name, slug, plan)
teams (id, org_id, name, identifier, icon)  -- identifier = 3-letter prefix like "ENG"
team_members (team_id, user_id, role)

-- Workflow
statuses (id, team_id, name, color, category, position)
-- category: BACKLOG | UNSTARTED | STARTED | COMPLETED | CANCELLED

-- Issues
issues (id, team_id, number, title, description_md, status_id,
        priority, assignee_id, creator_id, project_id, cycle_id,
        estimate, due_date, parent_id, sort_order,
        created_at, updated_at, completed_at, cancelled_at)
-- number: auto-increment per team → "ENG-142"
-- priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low
-- parent_id: for sub-issues

labels (id, team_id, name, color)
issue_labels (issue_id, label_id)
issue_relations (id, issue_id, related_issue_id, type)
-- type: BLOCKS, BLOCKED_BY, DUPLICATE, RELATES_TO

-- Projects & Cycles
projects (id, team_id, name, description, status, lead_id, start_date, target_date)
cycles (id, team_id, name, number, start_date, end_date)

-- Activity
activities (id, issue_id, user_id, type, data_json, created_at)
-- type: status_changed, assigned, priority_changed, comment, etc.

comments (id, issue_id, user_id, body_md, created_at, edited_at)
```

### Issue Identifiers
- Format: `{TEAM_PREFIX}-{AUTO_NUMBER}` (e.g., ENG-142, DES-57)
- Human-readable, memorable, shareable
- Globally unique within org

## API Design (GraphQL primary, REST secondary)

### GraphQL
```graphql
type Issue {
  id: ID!
  identifier: String!     # "ENG-142"
  title: String!
  description: String
  state: WorkflowState!
  priority: Int!
  assignee: User
  project: Project
  cycle: Cycle
  labels: [Label!]!
  children: [Issue!]!
  relations: [IssueRelation!]!
  comments: [Comment!]!
  history: [Activity!]!
  estimate: Float
  dueDate: DateTime
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Query {
  issue(id: ID!): Issue
  issues(filter: IssueFilter, sort: IssueSort, first: Int, after: String): IssueConnection!
  projects(teamId: ID!): [Project!]!
  cycles(teamId: ID!): [Cycle!]!
}

type Mutation {
  issueCreate(input: IssueCreateInput!): Issue!
  issueUpdate(id: ID!, input: IssueUpdateInput!): Issue!
  issueBatchUpdate(ids: [ID!]!, input: IssueUpdateInput!): [Issue!]!
}

type Subscription {
  issueUpdated(teamId: ID!): Issue!
}
```

### Keyboard Shortcuts (Linear-style UX)
```
C           → Create issue
S 1-4       → Set status
P 0-4       → Set priority
A           → Assign
L           → Add label
Cmd+K       → Command palette (fuzzy search everything)
J/K         → Navigate up/down
X           → Select issue
Cmd+Enter   → Submit
```

## Security
- Org-level data isolation
- Team-based permissions (admin, member, guest)
- Issue-level visibility (team only, org-wide)
- OAuth2 / SAML SSO
- API keys with scoped permissions
- Audit trail on all changes

## Performance Targets
| Metric | Target |
|--------|--------|
| Issue list render | < 100ms |
| Issue create | < 200ms |
| Search (10K issues) | < 300ms |
| Board view drag-drop | 60fps |
| Batch update (50 issues) | < 1s |
| Real-time sync | < 200ms |

## Tech Stack
| Component | Recommended |
|-----------|------------|
| API | Go (Fiber) or Rust (Axum) with GraphQL |
| Frontend | React + TanStack Query + Zustand |
| Database | PostgreSQL (with good indexing) |
| Search | Meilisearch |
| Real-time | WebSocket subscriptions |
| Cache | Redis |
| Queue | NATS or Redis Streams |

## MVP Tiers

### Tier 1 — Core (2-3 weeks)
- Issues: create, edit, status, priority, assignee
- Board (Kanban) and list views
- Team identifiers (ENG-1, DES-1)
- Keyboard shortcuts
- Fast filtering and sorting

### Tier 2 — Project Management (3-6 weeks)
- Projects with status tracking
- Cycles/sprints
- Sub-issues
- Labels and relations
- Comments and activity log
- Search

### Tier 3 — Workflows (6-10 weeks)
- Custom workflows per team
- Automations (rules engine)
- Timeline/Gantt view
- Estimates and velocity tracking
- GitHub/GitLab integration (link PRs to issues)
- Notifications (in-app, email, Slack)

### Tier 4 — Enterprise (10-16 weeks)
- Roadmaps and goals (OKRs)
- Cross-team dependencies
- Analytics and reports
- SSO/SAML
- Custom fields
- API for external integrations
- Triage / intake workflows
