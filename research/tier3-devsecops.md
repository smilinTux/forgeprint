# Tier 3: DevSecOps Categories — Forgeprint Deep Research

> **Generated:** 2026-02-13 | **Purpose:** Exhaustive reference for Forgeprint blueprint generation
> **Categories:** Infrastructure as Code, CI/CD Pipelines, Security Scanners, Monitoring/Observability, Runtime Protection

---

## Table of Contents
1. [Infrastructure as Code](#1-infrastructure-as-code)
2. [CI/CD Pipelines](#2-cicd-pipelines)
3. [Security Scanners / Vulnerability Management](#3-security-scanners--vulnerability-management)
4. [Monitoring / Observability Platforms](#4-monitoring--observability-platforms)
5. [Runtime Protection / Zero-Day Defense](#5-runtime-protection--zero-day-defense)

---

# 1. Infrastructure as Code

## 🔥 The OpenTofu Fork Story & BSL License Controversy

In **August 2023**, HashiCorp changed Terraform's license from **MPL-2.0** (Mozilla Public License) to **BSL 1.1** (Business Source License). BSL prohibits using the software in a competitive offering, effectively making Terraform **source-available but NOT open-source** by OSI definition.

**Impact:**
- The community reacted swiftly — within days, the **OpenTF Manifesto** gathered thousands of signatures
- The **Linux Foundation** backed the fork, establishing **OpenTofu** as the true open-source continuation
- OpenTofu 1.6.0 (first GA) shipped in January 2024, maintaining full compatibility with Terraform 1.6
- OpenTofu has since diverged with unique features: client-side state encryption, `removed` blocks, provider-defined functions
- This event became **the canonical example** of why organizations need open-source alternatives and why Forgeprint must prioritize OSS-first blueprints

**Key divergences (OpenTofu vs Terraform post-fork):**
- OpenTofu: State encryption (native), `removed` blocks (earlier), provider-defined functions, `for_each` on resources with unknown values
- Terraform: Stacks (preview), ephemeral resources, HCP Terraform deep integration, Sentinel policy
- Provider ecosystem: 99%+ compatible — same provider protocol, same registry format

## Top 10 Open-Source Tools

| # | Name | Language | Stars | License | Key Differentiator |
|---|------|----------|-------|---------|-------------------|
| 1 | **Terraform** | Go | 47.7K | BSL-1.1 | Industry standard IaC, massive provider ecosystem (3000+), HCL language |
| 2 | **Ansible** | Python | 68K | GPL-3.0 | Agentless config management, SSH-based, procedural + declarative hybrid |
| 3 | **OpenTofu** | Go | 27.8K | MPL-2.0 | True OSS Terraform fork, state encryption, Linux Foundation backed |
| 4 | **Pulumi** | Go/TypeScript | 24.7K | Apache-2.0 | Real programming languages (Python/TS/Go/C#/Java), state management |
| 5 | **Salt** | Python | 15.2K | Apache-2.0 | Event-driven automation, ZeroMQ transport, massive scale |
| 6 | **AWS CDK** | TypeScript | 12.6K | Apache-2.0 | AWS-native IaC in real languages, synthesizes to CloudFormation |
| 7 | **Crossplane** | Go | 11.4K | Apache-2.0 | Kubernetes-native IaC, control plane for cloud resources via CRDs |
| 8 | **Terragrunt** | Go | 9.3K | MIT | Terraform wrapper for DRY configs, multi-account orchestration |
| 9 | **CDKTF** | TypeScript | 5.1K | MPL-2.0 | CDK for Terraform — real languages that synth to HCL/JSON |
| 10 | **Terramate** | Go | 3.5K | MPL-2.0 | Stack orchestration, code generation, change detection for TF |

## Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **HCP Terraform (Terraform Cloud)** | HashiCorp/IBM | Free (5 users) / Team $20/user/mo / Business custom |
| 2 | **Spacelift** | Spacelift | Free tier / Team from $40/user/mo / Enterprise custom |
| 3 | **env0** | env0 | Free tier / Pro $25/user/mo / Enterprise custom |
| 4 | **Scalr** | Scalr | Free tier (5 runs) / Team from $50/mo / Enterprise custom |
| 5 | **Brainboard** | Brainboard | Free tier / Pro €35/user/mo / Enterprise custom |
| 6 | **Digger** | Digger | OSS core / Cloud from $40/user/mo / Enterprise custom |
| 7 | **Atlantis** | OSS (self-hosted) | Free (OSS) — commonly self-hosted as TACOS |
| 8 | **Puppet Enterprise** | Perforce | Per-node pricing, ~$120/node/yr |
| 9 | **Chef Automate** | Progress | Per-node pricing, ~$137/node/yr |
| 10 | **Ansible Automation Platform** | Red Hat | Subscription-based, starts ~$13K/yr (100 nodes) |

## Features (80 Features)

### Core Language & Configuration

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 1 | HCL Declarative Language | HashiCorp Configuration Language for defining infrastructure | Low | Enabled | None |
| 2 | JSON Configuration | Alternative JSON syntax for machine-generated configs | Low | Supported | None |
| 3 | Variable Definitions | Input variables with type constraints (string, number, bool, list, map, object) | Low | None | None |
| 4 | Variable Validation | Custom validation rules with `condition` and `error_message` | Medium | None | Variables |
| 5 | Local Values | Computed local variables for expression reuse | Low | None | None |
| 6 | Output Values | Expose values from module/root for consumption | Low | None | None |
| 7 | Sensitive Values | Mark variables/outputs as sensitive to redact from logs | Low | false | Variables/Outputs |
| 8 | Type Constraints | Complex type system: object({...}), tuple([...]), optional() | Medium | any | Variables |
| 9 | Dynamic Blocks | Generate repeated nested blocks from collections | Medium | None | for_each |
| 10 | for_each / count | Create multiple instances of resources from maps/lists | Medium | None | None |
| 11 | Conditional Expressions | Ternary expressions and conditional resource creation | Low | None | None |
| 12 | String Templates | Template interpolation with `${}` and directives `%{}` | Low | Enabled | None |
| 13 | Built-in Functions | 100+ functions: string, numeric, collection, encoding, filesystem, date, hash, IP, type | Low | Available | None |
| 14 | Moved Blocks | Refactor resource addresses without destroying/recreating | Medium | None | State |
| 15 | Import Blocks | Declarative import of existing infrastructure into state | Medium | None | State |

### State Management

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 16 | State File | JSON-serialized infrastructure state tracking | Low | terraform.tfstate | None |
| 17 | Remote Backends | Store state in S3, GCS, Azure Blob, Consul, HTTP, pg, etc. | Medium | local | Backend config |
| 18 | State Locking | Prevent concurrent modifications via DynamoDB, Consul, etc. | Medium | Backend-dependent | Remote backend |
| 19 | State Encryption (OpenTofu) | Client-side encryption of state file at rest | Medium | Disabled | OpenTofu 1.7+ |
| 20 | Workspaces | Multiple named state files for environment isolation | Medium | "default" | None |
| 21 | State Manipulation | `state mv`, `state rm`, `state pull/push`, `taint`, `untaint` | High | N/A | State |
| 22 | Drift Detection | Compare actual infrastructure to state, detect out-of-band changes | Medium | On plan | State + Providers |
| 23 | Refresh-Only Mode | Update state from real infrastructure without changing anything | Medium | Disabled | State |
| 24 | Force Unlock | Break stale state locks | High | N/A | State locking |

### Plan / Apply Workflow

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 25 | Plan | Preview changes before applying (dry-run) | Low | Required | State |
| 26 | Apply | Execute planned changes to infrastructure | Low | Requires approval | Plan |
| 27 | Destroy | Remove all managed infrastructure | Medium | Requires confirmation | State |
| 28 | Plan Serialization | Save plan to binary file for later apply | Medium | None | Plan |
| 29 | Targeted Operations | `-target` flag to limit operations to specific resources | Medium | All resources | None |
| 30 | Replace | `-replace` flag to force recreation of specific resources | Medium | None | None |
| 31 | Parallelism | Control concurrent resource operations | Medium | 10 | None |
| 32 | Auto-Approve | Skip interactive approval (for CI/CD) | Low | false | None |

### Providers & Modules

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 33 | Provider System | Plugin architecture for cloud/service integrations (3000+ providers) | Low | None | Provider binary |
| 34 | Provider Plugin Protocol | gRPC-based protocol (v5/v6) for provider communication | High | v6 | gRPC |
| 35 | Provider Configuration | Authentication, region, default tags per provider | Medium | None | Provider |
| 36 | Provider Aliases | Multiple configurations of same provider (multi-region/account) | Medium | None | Provider |
| 37 | Required Providers | Version constraints for provider dependencies | Low | None | None |
| 38 | Module System | Reusable infrastructure packages with inputs/outputs | Medium | None | None |
| 39 | Module Registry | Public/private registries for module sharing | Medium | registry.terraform.io | Internet |
| 40 | Module Sources | Git, S3, GCS, HTTP, local path, registry sources | Low | Registry | None |
| 41 | Module Composition | Nested modules, module-to-module data passing | Medium | None | Modules |
| 42 | Provider-Defined Functions (OpenTofu) | Custom functions implemented by providers | Medium | None | OpenTofu 1.7+ |

### Resource Lifecycle

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 43 | Lifecycle create_before_destroy | Create replacement before destroying original (zero-downtime) | Medium | false | None |
| 44 | Lifecycle prevent_destroy | Prevent accidental deletion of critical resources | Low | false | None |
| 45 | Lifecycle ignore_changes | Ignore specific attribute changes (external modifications) | Medium | [] | None |
| 46 | Lifecycle replace_triggered_by | Force replacement when referenced resources change | Medium | [] | None |
| 47 | Timeouts | Per-resource create/update/delete timeouts | Medium | Provider default | None |
| 48 | Provisioners | Execute scripts on resource creation (local-exec, remote-exec, file) | High | None | SSH/WinRM |
| 49 | Data Sources | Read-only queries to existing infrastructure/APIs | Low | None | Provider |
| 50 | Depends On | Explicit dependency declaration between resources | Medium | Auto-detected | DAG |
| 51 | Custom Conditions | Preconditions and postconditions on resources | Medium | None | None |
| 52 | Removed Blocks (OpenTofu) | Remove resources from state without destroying | Medium | None | OpenTofu 1.7+ |

### Policy & Governance

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 53 | Sentinel Policy (Terraform) | HashiCorp's policy-as-code framework | High | None | HCP Terraform |
| 54 | OPA Integration | Open Policy Agent for policy enforcement | High | None | OPA server |
| 55 | Cost Estimation | Estimate infrastructure costs before apply | Medium | None | Infracost/HCP |
| 56 | Run Tasks | Pre/post-plan webhooks for external integrations | Medium | None | HCP Terraform |
| 57 | Tag Enforcement | Require specific tags on all resources | Medium | None | Policy framework |
| 58 | Compliance Frameworks | CIS, SOC2, PCI-DSS benchmark enforcement | High | None | Policy + scanning |

### TACOS (TF Automation & Collaboration)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 59 | PR-based Workflow | Plan on PR, apply on merge | Medium | None | Git + TACOS |
| 60 | Plan Comments | Post plan output as PR comments | Medium | None | TACOS |
| 61 | Lock on PR | Prevent concurrent modifications via PR locking | Medium | None | TACOS |
| 62 | Drift Detection Scheduling | Periodic automatic drift detection runs | Medium | None | TACOS |
| 63 | Multi-Environment Promotion | Promote changes through dev→staging→prod | High | None | TACOS + Workspaces |
| 64 | RBAC | Role-based access control for plan/apply | Medium | None | TACOS |
| 65 | SSO/OIDC | Enterprise authentication integration | Medium | None | TACOS |
| 66 | Audit Logging | Track all operations with user attribution | Medium | None | TACOS |
| 67 | VCS Integration | GitHub, GitLab, Bitbucket, Azure DevOps webhook integration | Medium | None | TACOS |
| 68 | Private Module Registry | Self-hosted module sharing within organization | Medium | None | TACOS |

### Advanced

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 69 | Backend Migration | Migrate state between backend types | High | N/A | State |
| 70 | State File Format v4 | Current state serialization with lineage tracking | Low | v4 | None |
| 71 | Plugin Cache | Shared provider binary cache across workspaces | Low | Disabled | Filesystem |
| 72 | TF_LOG Debug | Detailed logging for troubleshooting | Low | None | Env var |
| 73 | Cloud Backend | HCP Terraform as native backend (replaces remote) | Medium | None | HCP account |
| 74 | Stacks (Terraform) | Multi-component deployments with dependency ordering | High | Preview | Terraform 1.8+ |
| 75 | Ephemeral Resources (Terraform) | Resources that exist only during apply, not persisted in state | High | None | Terraform 1.10+ |
| 76 | Check Blocks | Continuous validation assertions | Medium | None | Terraform 1.5+ |
| 77 | Testing Framework | Native test files (.tftest.hcl) for module testing | Medium | None | Terraform 1.6+ |
| 78 | Override Files | Override any configuration for testing/dev | Medium | None | None |
| 79 | Graph Command | Visualize dependency DAG | Low | N/A | Graphviz |
| 80 | Console Command | Interactive expression evaluation | Low | N/A | None |

## Architecture Patterns

### DAG-Based Dependency Resolution
```
┌─────────────────────────────────────────────────┐
│                 Configuration                    │
│  (.tf files → HCL parser → AST)                │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│            Dependency Graph (DAG)                │
│  Resources → edges based on references          │
│  Topological sort → parallel execution groups   │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│               Graph Walker                       │
│  Parallel execution with configurable limit     │
│  (default: 10 concurrent operations)            │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│            Provider Plugins (gRPC)               │
│  Separate OS processes per provider              │
│  Protocol: terraform-plugin-protocol v6          │
│  go-plugin framework (hashicorp/go-plugin)       │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│              State Management                    │
│  JSON state file with resource attributes        │
│  Lineage UUID + serial number for versioning     │
│  Backend abstraction for storage                 │
└─────────────────────────────────────────────────┘
```

### Provider Plugin Protocol (gRPC)
- **Protocol versions:** v5 (terraform-plugin-sdk/v2) and v6 (terraform-plugin-framework)
- **Lifecycle:** GetProviderSchema → ConfigureProvider → PlanResourceChange → ApplyResourceChange → ReadResource
- **Discovery:** Provider binaries in `~/.terraform.d/plugins/` or downloaded from registry
- **Multiplexing:** Multiple protocol versions can be served from single binary via tf-mux

### State File Format (v4)
```json
{
  "version": 4,
  "terraform_version": "1.9.0",
  "serial": 42,
  "lineage": "uuid-v4",
  "outputs": {},
  "resources": [{
    "mode": "managed",
    "type": "aws_instance",
    "name": "web",
    "provider": "provider[\"registry.terraform.io/hashicorp/aws\"]",
    "instances": [{
      "schema_version": 1,
      "attributes": { "id": "i-abc123", "ami": "ami-xxx", ... },
      "sensitive_attributes": [],
      "dependencies": ["aws_security_group.web"]
    }]
  }]
}
```

### Module Registry Protocol
- **Discovery:** `GET /.well-known/terraform.json` → service discovery document
- **Versions:** `GET /v1/modules/{namespace}/{name}/{provider}/versions`
- **Download:** `GET /v1/modules/{namespace}/{name}/{provider}/{version}/download`

## Memory Management
- **State file size:** Can grow to hundreds of MB for large deployments; use `-refresh=false` and targeted plans
- **Provider memory:** Each provider plugin is a separate process (50-500MB each depending on provider)
- **Plan memory:** Plans hold entire state + diff in memory; large deployments may need 4-8GB+
- **Parallelism tuning:** Reduce `-parallelism` for memory-constrained environments
- **Graph complexity:** O(V+E) for DAG traversal; provider calls dominate actual time

## Testing Criteria
- Plan produces expected diff for known inputs
- Apply creates resources matching desired state
- Destroy removes all managed resources
- State locking prevents concurrent corruption
- Provider authentication works across configured backends
- Module versioning resolves correctly
- Import brings existing resources under management
- Drift detection identifies out-of-band changes
- Variable validation rejects invalid inputs
- Sensitive values are redacted from all outputs

---

# 2. CI/CD Pipelines

## Top 10 Open-Source Tools

| # | Name | Language | Stars | License | Key Differentiator |
|---|------|----------|-------|---------|-------------------|
| 1 | **Gitea** | Go | 53.7K | MIT | Lightweight self-hosted Git with Actions (GH Actions compatible) |
| 2 | **Jenkins** | Java | 25K | MIT | Most extensible CI server, 1800+ plugins, massive ecosystem |
| 3 | **Argo CD** | Go | 22K | Apache-2.0 | GitOps-native continuous delivery for Kubernetes |
| 4 | **Dagger** | Go | 15.4K | Apache-2.0 | Portable CI/CD pipelines as code, runs anywhere (local/CI) |
| 5 | **Tekton** | Go | 8.9K | Apache-2.0 | Kubernetes-native CI/CD building blocks, CRD-based |
| 6 | **Flux CD** | Go | 7.9K | Apache-2.0 | GitOps toolkit for Kubernetes, CNCF graduated |
| 7 | **Concourse** | Go | 7.8K | Apache-2.0 | Pipeline-as-first-class with resource-based triggering |
| 8 | **GoCD** | Java/Ruby | 7.4K | Apache-2.0 | Advanced pipeline modeling, value stream maps |
| 9 | **Woodpecker CI** | Go | 6.5K | Apache-2.0 | Community fork of Drone, simple YAML-based CI |
| 10 | **Forgejo Actions** | Go | ~4K* | MIT | Codeberg-backed Gitea fork with GH Actions compatibility |

\* Forgejo is part of the Forgejo project (~4K stars), Actions is integrated

**Notable:** Drone CI (by Harness) was relicensed → Woodpecker forked it. Forgejo forked Gitea over governance concerns. Pattern mirrors the Terraform/OpenTofu split.

## Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **GitHub Actions** | Microsoft/GitHub | Free (2000 min/mo) / Team $4/user/mo / Enterprise $21/user/mo |
| 2 | **GitLab CI/CD** | GitLab | Free (400 min/mo) / Premium $29/user/mo / Ultimate $99/user/mo |
| 3 | **Azure DevOps Pipelines** | Microsoft | Free (1 parallel job) / $40/parallel job/mo |
| 4 | **CircleCI** | CircleCI | Free tier / Performance from $15/mo / Scale custom |
| 5 | **Buildkite** | Buildkite | Free (OSS) / Pro from $15/user/mo / Enterprise custom |
| 6 | **Harness CI** | Harness | Free tier / Team $25/dev/mo / Enterprise custom |
| 7 | **TeamCity** | JetBrains | Free (100 builds) / Pro from $359/yr / Enterprise from $1999/yr |
| 8 | **Semaphore** | Semaphore | Free tier / Pro from $25/mo / Enterprise custom |
| 9 | **Travis CI** | Travis CI | Free (OSS) / Pro from $69/mo |
| 10 | **Codefresh** | Codefresh | Free tier / Pro from $75/mo / Enterprise custom |

## Features (80 Features)

### Pipeline Definition

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 1 | YAML Pipeline Definition | Define pipelines as code in YAML format | Low | `.github/workflows/`, `.gitlab-ci.yml`, etc. | None |
| 2 | Declarative Pipelines | Structured pipeline syntax (Jenkins Declarative, GitLab) | Low | Varies | None |
| 3 | Scripted Pipelines | Imperative pipeline code (Jenkins Groovy, Dagger) | Medium | None | Runtime |
| 4 | Pipeline as Code | Pipelines version-controlled alongside application code | Low | Enabled | Git |
| 5 | Multi-File Pipelines | Split pipeline definition across multiple files | Medium | Single file | None |
| 6 | Template/Include System | Reusable pipeline fragments | Medium | None | None |
| 7 | Pipeline Visualization | DAG/graph view of pipeline stages | Low | Available | UI |

### Execution Model

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 8 | Parallel Stages | Run independent stages concurrently | Medium | Sequential | None |
| 9 | Matrix Builds | Test across multiple versions/platforms/configs | Medium | None | None |
| 10 | DAG Execution | Directed acyclic graph for complex dependencies | Medium | Linear | None |
| 11 | Conditional Execution | Run steps based on conditions (branch, file changes, variables) | Medium | Always | None |
| 12 | Manual Approvals | Human gate before proceeding | Medium | None | None |
| 13 | Timeout Configuration | Per-job and per-step timeouts | Low | Provider default | None |
| 14 | Retry Logic | Automatic retry on failure with configurable count | Medium | 0 | None |
| 15 | Concurrency Controls | Limit parallel runs, cancel in-progress on new push | Medium | Unlimited | None |
| 16 | Job Dependencies | `needs`/`depends_on` between jobs | Medium | None | None |

### Triggers

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 17 | Push Triggers | Run on code push to branches | Low | Enabled | Webhook |
| 18 | Pull Request Triggers | Run on PR open/update/merge | Low | Enabled | Webhook |
| 19 | Scheduled Triggers (Cron) | Run on cron schedule | Low | None | Scheduler |
| 20 | Webhook Triggers | Generic webhook-triggered pipelines | Medium | None | HTTP endpoint |
| 21 | Tag Triggers | Run on Git tag creation | Low | None | Webhook |
| 22 | Manual/Dispatch Triggers | Manually trigger with optional inputs | Medium | None | API/UI |
| 23 | Cross-Pipeline Triggers | One pipeline triggers another | Medium | None | API |
| 24 | Path Filters | Only trigger when specific paths change | Medium | All paths | None |

### Runner Infrastructure

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 25 | Hosted Runners | Cloud-provided execution environments | Low | Varies | SaaS account |
| 26 | Self-Hosted Runners | Run on own infrastructure | Medium | None | Server/VM |
| 27 | Container-Based Runners | Execute in Docker containers (isolation) | Medium | Varies | Docker |
| 28 | Kubernetes Runners | Dynamic pod-based execution | High | None | K8s cluster |
| 29 | Runner Groups | Organize runners into labeled groups | Medium | Default group | Multiple runners |
| 30 | Auto-Scaling Runners | Scale runner pool based on queue depth | High | None | Cloud infra |
| 31 | Ephemeral Runners | Single-use runners destroyed after job | Medium | Reusable | Runner config |
| 32 | Runner Labels/Tags | Route jobs to specific runner types | Low | None | Runners |

### Artifacts & Caching

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 33 | Build Artifacts | Upload/download build outputs between jobs | Medium | None | Storage |
| 34 | Dependency Caching | Cache package manager downloads between runs | Medium | None | Cache key |
| 35 | Docker Layer Caching | Cache Docker build layers for faster builds | Medium | None | Docker |
| 36 | Workspace Persistence | Share workspace between pipeline stages | Low | Per-stage clean | None |
| 37 | Artifact Retention | Configure artifact expiry | Low | 30-90 days | Artifacts |
| 38 | Container Registry | Built-in or integrated container registry | Medium | Varies | Registry |

### Security

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 39 | Secrets Management | Encrypted secrets available to pipelines | Medium | None | Secret store |
| 40 | OIDC Authentication | Keyless cloud auth via OIDC tokens | High | None | Cloud provider |
| 41 | Environment Protection Rules | Require approvals for production deployments | Medium | None | Environments |
| 42 | Branch Protection | Require CI pass before merge | Low | None | Git platform |
| 43 | Audit Logging | Track all CI/CD actions with user attribution | Medium | Varies | Enterprise tier |
| 44 | Token Permissions | Fine-grained token scopes for pipeline access | Medium | Broad | Platform |
| 45 | Secret Masking | Prevent secrets from appearing in logs | Low | Enabled | Secrets |
| 46 | Supply Chain Security | SLSA provenance, signed artifacts, attestations | High | None | Sigstore/Cosign |

### Deployment

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 47 | Deployment Environments | Named environments (dev/staging/prod) with config | Medium | None | Platform |
| 48 | Blue-Green Deployments | Switch traffic between two identical environments | High | None | Load balancer |
| 49 | Canary Deployments | Gradual rollout with traffic splitting | High | None | Service mesh |
| 50 | Rolling Updates | Incremental update across instances | Medium | None | Orchestrator |
| 51 | Rollback | Revert to previous deployment | Medium | None | Deployment history |
| 52 | GitOps Deployment | Declarative desired state in Git, reconciled by operator | Medium | None | Argo CD/Flux |
| 53 | Multi-Cluster Deployment | Deploy to multiple K8s clusters | High | None | Cluster config |

### Reusability & Composition

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 54 | Reusable Workflows | Call workflows from other workflows | Medium | None | Platform support |
| 55 | Composite Actions | Bundle multiple steps into single action | Medium | None | GitHub Actions |
| 56 | Shared Libraries | Organization-wide pipeline libraries | Medium | None | Repository |
| 57 | Action/Plugin Marketplace | Ecosystem of reusable pipeline components | Low | Available | Platform |
| 58 | Output Variables | Pass data between jobs/steps | Medium | None | None |

### Observability & Integration

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 59 | Build Badges | SVG status badges for README | Low | Available | None |
| 60 | Notification Integrations | Slack, Teams, email, webhook notifications | Low | None | Channel config |
| 61 | Status Checks | Report pipeline status to PR/commit | Low | Enabled | Git platform |
| 62 | Build Logs | Streaming real-time log output | Low | Enabled | None |
| 63 | Build Metrics | Duration, success rate, queue time metrics | Medium | Varies | None |
| 64 | Trace/Span Integration | OpenTelemetry traces for pipeline runs | High | None | OTEL |

### Advanced

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 65 | Monorepo Support | Detect changes and run only affected pipelines | Medium | None | Path filters |
| 66 | Dynamic Pipelines | Generate pipeline config programmatically | High | None | None |
| 67 | Services (Sidecar) | Run databases/services alongside tests | Medium | None | Docker |
| 68 | SSH Debug | SSH into running job for debugging | Medium | None | Runner support |
| 69 | Pipeline-level Variables | Configurable variables at pipeline level | Low | None | None |
| 70 | Variable Groups | Shared variable sets across pipelines | Medium | None | Platform |
| 71 | Approval Policies | RBAC-based approval requirements | Medium | None | Enterprise |
| 72 | Compliance Gates | Automated security/compliance checks in pipeline | High | None | Scanning tools |
| 73 | Fan-in/Fan-out | Parallel expansion then convergence | Medium | None | DAG |
| 74 | Pipeline Triggers on Completion | Chain pipelines together | Medium | None | API |
| 75 | Resource Groups (Azure DevOps) | Limit concurrent access to shared resources | Medium | None | Azure DevOps |
| 76 | Test Result Publishing | Parse and display test results in UI | Medium | None | Test framework |
| 77 | Code Coverage Reporting | Display coverage metrics | Medium | None | Coverage tool |
| 78 | Container Build (Kaniko/Buildah) | Build containers without Docker daemon | Medium | Docker | Alt builder |
| 79 | Multi-Architecture Builds | Build for amd64, arm64, etc. | High | amd64 | QEMU/native |
| 80 | Pull-Through Cache | Proxy and cache external container images | Medium | None | Registry mirror |

## Architecture Patterns

### Controller/Runner Model
```
┌─────────────────────────────────────────────┐
│              Git Platform / Event Source     │
│  (Push, PR, Schedule, Webhook, Manual)      │
└────────────────────┬────────────────────────┘
                     ▼
┌─────────────────────────────────────────────┐
│           CI/CD Controller / Server         │
│  • Parse pipeline definition                │
│  • Build execution DAG                      │
│  • Manage job queue                         │
│  • Coordinate secrets injection             │
│  • Track status and results                 │
└────────────────────┬────────────────────────┘
                     ▼
┌─────────────────────────────────────────────┐
│             Job Queue / Scheduler           │
│  • Match jobs to runner labels              │
│  • Priority queuing                         │
│  • Concurrency limits                       │
└──────┬─────────────┬────────────┬───────────┘
       ▼             ▼            ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Runner 1 │  │ Runner 2 │  │ Runner N │
│ (Docker) │  │ (K8s Pod)│  │ (VM)     │
│          │  │          │  │          │
│ • Clone  │  │ • Clone  │  │ • Clone  │
│ • Setup  │  │ • Setup  │  │ • Setup  │
│ • Execute│  │ • Execute│  │ • Execute│
│ • Report │  │ • Report │  │ • Report │
└──────────┘  └──────────┘  └──────────┘
```

### Container Isolation Model
- Each job runs in isolated container or VM
- Workspace cloned fresh per job (or restored from cache)
- Secrets injected as environment variables or files
- Network access controlled (no inter-job communication by default)
- Sidecar services started/stopped per job lifecycle

### GitOps Architecture (Argo CD / Flux)
```
Developer → Git Push → Git Repo (desired state)
                            ↓
                    GitOps Operator (polling/webhook)
                            ↓
                    Diff (desired vs actual)
                            ↓
                    Apply to Kubernetes cluster
                            ↓
                    Health check / sync status → Git status
```

## Memory Management
- **Jenkins:** JVM heap-based; default 256MB-1GB, production needs 2-8GB; plugin count directly impacts memory
- **GitHub Actions runners:** 7GB RAM (Linux), fixed per runner tier
- **Container runners:** Memory limits set per container; OOM kills possible
- **Queue depth:** Large queues consume controller memory; implement queue limits
- **Log storage:** Streaming logs consume memory; implement rotation and max-size limits
- **Build cache:** Can consume significant disk; TTL and size limits essential

## Testing Criteria
- Pipeline triggers correctly on configured events
- Parallel stages execute concurrently and merge correctly
- Secrets are available to jobs but masked in logs
- Matrix builds produce correct number of job combinations
- Caching restores and invalidates correctly
- Artifacts are accessible across jobs
- Timeout and retry behave as configured
- OIDC tokens authenticate successfully to cloud providers
- Self-hosted runners register and pick up jobs
- Rollback deploys previous version successfully

---

# 3. Security Scanners / Vulnerability Management

> **CRITICAL for Moltbook/Forgeprint:** These tools protect AI agent infrastructure. Every "moltie" (Moltbook agent) needs automated security scanning in its CI/CD pipeline and runtime environment.

## Top 10 Open-Source Tools

| # | Name | Language | Stars | License | Key Differentiator |
|---|------|----------|-------|---------|-------------------|
| 1 | **Trivy** | Go | 31.9K | Apache-2.0 | All-in-one scanner: containers, IaC, SBOM, secrets, licenses, K8s |
| 2 | **Nuclei** | Go | 27K | MIT | Template-based vulnerability scanner, 8000+ community templates |
| 3 | **Gitleaks** | Go | 24.9K | MIT | Secret detection in git repos and CI/CD, fast regex-based |
| 4 | **TruffleHog** | Go | 24.5K | AGPL-3.0 | Deep secret scanning with verification (checks if secrets are active) |
| 5 | **Renovate** | TypeScript | 20.8K | AGPL-3.0 | Automated dependency updates, multi-platform, highly configurable |
| 6 | **OWASP ZAP** | Java | 14.8K | Apache-2.0 | Leading DAST tool, web app security testing, active scanning |
| 7 | **Grype** | Go | 11.5K | Apache-2.0 | Fast container vulnerability scanner, pairs with Syft SBOM |
| 8 | **Clair** | Go | 10.9K | Apache-2.0 | Container vulnerability static analysis (Red Hat/Quay) |
| 9 | **Semgrep** | OCaml/Python | ~10K | LGPL-2.1 | Lightweight SAST, pattern-based code scanning, 3000+ rules |
| 10 | **Checkov** | Python | 8.5K | Apache-2.0 | IaC scanning for Terraform, K8s, CloudFormation, ARM, Helm |

**Honorable mentions:** Syft (8.4K, SBOM generation), kube-bench (7.9K, CIS K8s benchmarks), tfsec (7K, Terraform-specific, now part of Trivy), OSSF Scorecard (5.3K, OSS project security assessment), Falco (8.7K, runtime — covered in Section 5)

## Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Snyk** | Snyk | Free (200 tests/mo) / Team $25/dev/mo / Enterprise custom |
| 2 | **Wiz** | Wiz (Google Cloud) | Enterprise-only, ~$50K-500K+/yr based on workloads |
| 3 | **SonarQube/SonarCloud** | SonarSource | Community (free) / Developer $150/yr / Enterprise from $20K/yr |
| 4 | **Prisma Cloud** | Palo Alto Networks | Per-credit model, Enterprise custom pricing |
| 5 | **CrowdStrike Falcon** | CrowdStrike | Per-endpoint, starts ~$8.99/endpoint/mo |
| 6 | **Qualys VMDR** | Qualys | Per-asset, starts ~$2/asset/mo |
| 7 | **Tenable (Nessus)** | Tenable | Nessus Pro $3,990/yr / Tenable.io from $2,390/yr |
| 8 | **Rapid7 InsightVM** | Rapid7 | Per-asset, ~$2-5/asset/mo |
| 9 | **Aqua Security** | Aqua | Per-workload pricing, Enterprise custom |
| 10 | **GitGuardian** | GitGuardian | Free (personal) / Team €34/dev/mo / Enterprise custom |

## Features (80 Features)

### Container & Image Scanning

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 1 | Container Image Scanning | Scan Docker/OCI images for vulnerabilities | Low | Enabled | Image registry |
| 2 | OS Package Scanning | Detect CVEs in OS packages (apt, rpm, apk) | Low | Enabled | Vuln DB |
| 3 | Language Package Scanning | Scan npm, pip, go.mod, Maven, Cargo, etc. | Low | Enabled | Vuln DB |
| 4 | Binary Analysis | Detect vulnerabilities in compiled binaries | High | Disabled | Analysis engine |
| 5 | Layer-by-Layer Analysis | Show which image layer introduced vulnerability | Medium | Varies | Image scanner |
| 6 | Base Image Detection | Identify base image and recommend updates | Medium | Varies | Image metadata |
| 7 | Distroless Support | Scan minimal/distroless container images | Medium | Supported | Scanner |
| 8 | Registry Integration | Scan images directly from registries (ECR, GCR, ACR, DockerHub) | Medium | None | Registry auth |

### SBOM (Software Bill of Materials)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 9 | SPDX Generation | Generate SBOM in SPDX format | Medium | None | SBOM tool (Syft) |
| 10 | CycloneDX Generation | Generate SBOM in CycloneDX format | Medium | None | SBOM tool |
| 11 | SBOM Ingestion | Scan existing SBOMs for vulnerabilities | Medium | None | SBOM file |
| 12 | Dependency Tree | Full transitive dependency resolution | Medium | Direct only | Package managers |
| 13 | SBOM Attestation | Sign and attest SBOM provenance | High | None | Sigstore/Cosign |

### Vulnerability Databases

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 14 | NVD Integration | NIST National Vulnerability Database CVEs | Low | Enabled | Internet/mirror |
| 15 | OSV Database | Google's Open Source Vulnerabilities database | Low | Varies | Internet |
| 16 | GitHub Advisory Database (GHSA) | GitHub-curated vulnerability advisories | Low | Varies | Internet |
| 17 | Vendor Advisories | OS vendor advisories (RHEL, Ubuntu, Alpine, etc.) | Low | Enabled | Vuln DB sync |
| 18 | EPSS Scoring | Exploit Prediction Scoring System (probability of exploitation) | Medium | Varies | EPSS feed |
| 19 | CVSS Scoring | Common Vulnerability Scoring (v3.1/v4.0) | Low | Enabled | Vuln DB |
| 20 | KEV Integration | CISA Known Exploited Vulnerabilities catalog | Medium | Varies | KEV feed |
| 21 | Offline Database | Air-gapped vulnerability database for disconnected environments | High | Online | DB download |

### Static Analysis (SAST)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 22 | Source Code Scanning | Analyze source code for security vulnerabilities | Medium | Language-dependent | SAST tool |
| 23 | Taint Analysis | Track untrusted input flow through code | High | Varies | SAST engine |
| 24 | Pattern-Based Rules | Regex/AST patterns for vulnerability detection | Medium | Enabled | Rule set |
| 25 | Custom Rule Authoring | Write organization-specific scanning rules | High | None | SAST tool |
| 26 | Multi-Language Support | Scan across 20+ programming languages | Medium | Varies | Language parsers |
| 27 | Code Quality | Bugs, code smells, complexity metrics (beyond security) | Medium | Varies | SonarQube/Semgrep |
| 28 | Incremental Scanning | Only scan changed files for faster CI | Medium | Full scan | Diff info |

### Dynamic Analysis (DAST)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 29 | Web Application Scanning | Crawl and test running web applications | High | None | Running target |
| 30 | API Security Testing | Test REST/GraphQL/gRPC APIs for vulnerabilities | High | None | API spec |
| 31 | Authenticated Scanning | Scan behind login with session management | High | None | Credentials |
| 32 | Active Scanning | Send attack payloads to detect vulnerabilities | High | Passive | Target |
| 33 | Passive Scanning | Analyze proxied traffic without active attacks | Medium | Enabled | Proxy config |
| 34 | AJAX Spider | Crawl JavaScript-heavy single-page applications | High | Standard spider | DAST tool |
| 35 | Fuzzing | Protocol/API fuzzing for edge-case vulnerabilities | High | None | Fuzzer |

### Infrastructure as Code Scanning

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 36 | Terraform Scanning | Check TF configs for misconfigurations | Low | Enabled | Checkov/tfsec/Trivy |
| 37 | Kubernetes Manifest Scanning | Validate K8s YAML for security issues | Low | Enabled | Scanner |
| 38 | CloudFormation Scanning | Check AWS CF templates | Low | Varies | Scanner |
| 39 | Helm Chart Scanning | Scan Helm charts after template rendering | Medium | Varies | Helm |
| 40 | Dockerfile Scanning | Check Dockerfiles for best practice violations | Low | Enabled | Scanner |
| 41 | Policy as Code | Custom OPA/Rego policies for IaC validation | High | None | OPA |
| 42 | CIS Benchmark Checks | Center for Internet Security configuration benchmarks | Medium | Varies | Benchmark rules |

### Secret Detection

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 43 | Git History Scanning | Scan entire git history for leaked secrets | Medium | HEAD only | Git repo |
| 44 | Entropy-Based Detection | Detect high-entropy strings (potential secrets) | Medium | Varies | Scanner |
| 45 | Pattern/Regex Detection | Known secret patterns (AWS keys, tokens, etc.) | Low | Enabled | Rule set |
| 46 | Secret Verification | Check if detected secrets are still active/valid | High | Disabled | API access |
| 47 | Pre-Commit Hook | Block commits containing secrets | Low | None | Git hooks |
| 48 | Baseline/Allowlist | Suppress known false positives | Medium | None | Config file |

### Dependency Management

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 49 | Automated Dependency Updates | Create PRs to update vulnerable dependencies | Medium | None | Renovate/Dependabot |
| 50 | License Compliance | Detect and enforce dependency license policies | Medium | None | SBOM |
| 51 | Reachability Analysis | Determine if vulnerable code is actually called | High | Disabled | Call graph |
| 52 | Fix Suggestions | Recommend minimum version to resolve CVE | Medium | Varies | Vuln DB |
| 53 | Lock File Analysis | Parse lock files for exact version resolution | Low | Enabled | Lock file |
| 54 | Transitive Dependency Scanning | Scan indirect dependencies | Medium | Varies | Dependency tree |

### CI/CD Integration

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 55 | GitHub Actions Integration | Native action/workflow for GitHub CI | Low | None | GitHub |
| 56 | GitLab CI Integration | Template/include for GitLab pipelines | Low | None | GitLab |
| 57 | SARIF Output | Standardized Static Analysis Results Interchange Format | Low | Varies | SARIF consumer |
| 58 | JSON/CSV/Table Output | Multiple output formats for integration | Low | Table | None |
| 59 | Exit Code Control | Non-zero exit on findings above severity threshold | Low | All findings | Config |
| 60 | PR Comments | Post findings as PR comments/annotations | Medium | None | Platform |
| 61 | IDE Integration | Scan in VS Code, IntelliJ, etc. | Medium | None | Plugin |
| 62 | CLI Tool | Command-line scanner for local/CI use | Low | Primary | Installation |

### Compliance & Reporting

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 63 | SOC 2 Compliance | Map findings to SOC 2 Trust Services Criteria | High | None | Policy mapping |
| 64 | PCI-DSS Compliance | Payment Card Industry Data Security Standard checks | High | None | Policy mapping |
| 65 | HIPAA Compliance | Health data protection standard checks | High | None | Policy mapping |
| 66 | CIS Benchmarks | Center for Internet Security benchmarks (K8s, Docker, OS) | Medium | Varies | Benchmark rules |
| 67 | NIST Framework | NIST Cybersecurity Framework mapping | High | None | Policy mapping |
| 68 | Compliance Dashboard | Centralized view of compliance posture | Medium | None | Platform |
| 69 | Audit Trail | Immutable log of scan results and remediations | Medium | None | Storage |
| 70 | Executive Reports | PDF/HTML reports for management | Medium | None | Reporting engine |

### Advanced

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 71 | Vulnerability Prioritization | Risk-based ranking (EPSS + CVSS + reachability + asset criticality) | High | CVSS only | Multiple feeds |
| 72 | Suppression Management | Mark findings as accepted risk/false positive with justification | Medium | None | Scanner |
| 73 | Policy Enforcement | Break builds on policy violations | Medium | Advisory | Policy config |
| 74 | Runtime Protection Integration | Correlate scanner findings with runtime behavior | High | None | Runtime agent |
| 75 | Asset Inventory | Track all scanned assets and their security posture | Medium | None | Platform |
| 76 | Vulnerability SLA | Track time-to-remediate against SLA targets | Medium | None | Platform |
| 77 | Exploit DB Integration | Link CVEs to known exploits (Metasploit, ExploitDB) | Medium | None | Exploit feeds |
| 78 | Network Scanning | Port scanning and service discovery | Medium | None | Network access |
| 79 | MITRE ATT&CK Mapping | Map vulnerabilities to ATT&CK techniques | Medium | None | ATT&CK framework |
| 80 | Agent vs Agentless | Deploy with or without persistent agents | Medium | Varies | Architecture choice |

## Architecture Patterns

### Scanner Engine Architecture
```
┌─────────────────────────────────────────────────┐
│              Input Sources                       │
│  Container Image │ Source Code │ IaC │ SBOM     │
│  Git Repo │ Running App │ K8s Cluster │ Registry │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│             Analysis Engine                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Package  │ │  SAST    │ │  IaC     │       │
│  │ Scanner  │ │  Engine  │ │  Scanner │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       ▼             ▼            ▼              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Secret   │ │  DAST    │ │ License  │       │
│  │ Detector │ │  Engine  │ │ Checker  │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘       │
└───────┴─────────────┴────────────┴──────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│          Vulnerability Database                  │
│  NVD │ OSV │ GHSA │ Vendor │ EPSS │ KEV       │
│  (Synced periodically, cached locally)          │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│            Policy Engine                         │
│  Severity thresholds │ License policies          │
│  Compliance frameworks │ Custom rules            │
│  Suppression/baseline management                 │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│           Output / Reporting                     │
│  SARIF │ JSON │ HTML │ PR Comment │ Dashboard   │
│  Exit code → CI/CD gate decision                │
└─────────────────────────────────────────────────┘
```

### Trivy Architecture (All-in-One Scanner)
```
trivy CLI
├── image scanner → OCI image layer extraction → package enumeration → DB match
├── filesystem scanner → walk directory tree → detect package manifests
├── repo scanner → clone + filesystem scan
├── config scanner → Rego policies (built-in + custom)
├── kubernetes scanner → K8s API → scan running workloads
├── sbom scanner → parse SPDX/CycloneDX → match CVEs
└── vulnerability DB
    ├── trivy-db (vulnerability data, compressed, updated every 6h)
    └── trivy-java-db (Java-specific, larger dataset)
```

## Memory Management
- **Scanner memory:** Trivy: 200-500MB typical, 2GB+ for large images; Grype: 300-800MB (loads full DB)
- **Vulnerability DB:** Trivy DB ~40MB compressed (300MB+ expanded); NVD full dataset 1GB+
- **SAST engines:** Semgrep: 500MB-2GB depending on rule count and codebase; SonarQube: 2-4GB JVM heap
- **DAST:** ZAP: 2-4GB JVM for active scanning; scales with target complexity
- **CI optimization:** Use DB caching, incremental scanning, severity filtering to reduce time/memory

## Testing Criteria
- Scanner detects known CVEs in test images (e.g., old Alpine, vulnerable npm packages)
- SBOM generation produces valid SPDX/CycloneDX documents
- Secret detection catches test secrets without excessive false positives
- IaC scanner flags misconfigured Terraform/K8s manifests
- SARIF output validates against SARIF schema
- Policy enforcement breaks build on critical findings
- Baseline management correctly suppresses known issues
- Offline/air-gapped mode works with pre-downloaded DB
- Multi-language dependency scanning covers all project ecosystems
- Fix suggestions recommend correct minimum versions

---

# 4. Monitoring / Observability Platforms

## Top 10 Open-Source Tools

| # | Name | Language | Stars | License | Key Differentiator |
|---|------|----------|-------|---------|-------------------|
| 1 | **Uptime Kuma** | JavaScript | 82.8K | MIT | Beautiful self-hosted uptime monitoring, 90+ notification types |
| 2 | **Netdata** | C | 77.7K | GPL-3.0 | Real-time per-second monitoring, zero-config, ML anomaly detection |
| 3 | **Grafana** | Go/TypeScript | 72.1K | AGPL-3.0 | Universal dashboarding, 150+ data sources, alerting |
| 4 | **Prometheus** | Go | 62.7K | Apache-2.0 | CNCF graduated, pull-based metrics, PromQL, de facto standard |
| 5 | **Loki** | Go | 27.6K | AGPL-3.0 | Log aggregation designed for Grafana, labels not full-text index |
| 6 | **Jaeger** | Go | 22.5K | Apache-2.0 | Distributed tracing, OpenTelemetry native, CNCF graduated |
| 7 | **Zipkin** | Java | 17.4K | Apache-2.0 | Distributed tracing pioneer, simple architecture |
| 8 | **VictoriaMetrics** | Go | 16.3K | Apache-2.0 | High-performance Prometheus-compatible TSDB, compression leader |
| 9 | **Thanos** | Go | 14K | Apache-2.0 | Highly available Prometheus with long-term object storage |
| 10 | **OpenTelemetry Collector** | Go | 6.6K | Apache-2.0 | Vendor-neutral telemetry pipeline (metrics, logs, traces) |

**Honorable mentions:** Mimir (5K, Grafana's scalable metrics), Zabbix (5.6K, enterprise monitoring), Cortex (5.7K, horizontally scalable Prometheus), Tempo (5K, distributed tracing backend), Checkmk, LibreNMS, Icinga

## Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **Datadog** | Datadog | Infrastructure $15/host/mo / APM $31/host/mo / Logs $0.10/GB |
| 2 | **New Relic** | New Relic | Free (100GB/mo) / Standard $0.30/GB / Pro $0.50/GB |
| 3 | **Splunk** | Cisco/Splunk | Ingest from $15/GB/day (Splunk Cloud) |
| 4 | **Elastic Observability** | Elastic | Free (basic) / Cloud from $95/mo / Enterprise custom |
| 5 | **PagerDuty** | PagerDuty | Free (5 users) / Pro $21/user/mo / Business $41/user/mo |
| 6 | **OpsGenie** | Atlassian | Free (5 users) / Essentials $9/user/mo / Enterprise custom |
| 7 | **Better Stack (formerly Logtail)** | Better Stack | Free tier / Pro from $25/mo |
| 8 | **Grafana Cloud** | Grafana Labs | Free tier (generous) / Pro from $29/mo / Advanced $299/mo |
| 9 | **Healthchecks.io** | Healthchecks | Free (20 checks) / Plus $20/mo / Business $80/mo |
| 10 | **Chronosphere** | Chronosphere | Enterprise-only, per-series pricing |

## Features (80 Features)

### Metrics Collection

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 1 | Pull-Based Collection | Prometheus-style scraping of /metrics endpoints | Low | 15s interval | Exporters |
| 2 | Push-Based Collection | Agents push metrics to gateway (Push Gateway, OTLP) | Low | None | Push endpoint |
| 3 | Service Discovery | Auto-discover scrape targets (K8s, Consul, DNS, EC2, file) | Medium | Static config | Discovery source |
| 4 | Custom Exporters | Write exporters for any metric source | Medium | None | Prometheus client lib |
| 5 | OpenTelemetry Integration | Receive/export metrics via OTLP protocol | Medium | None | OTel collector |
| 6 | Remote Write | Forward metrics to remote storage (Cortex, Mimir, VictoriaMetrics) | Medium | Disabled | Remote endpoint |
| 7 | Remote Read | Query metrics from remote storage | Medium | Disabled | Remote endpoint |
| 8 | Metric Types | Counter, gauge, histogram, summary, info, stateset | Low | N/A | None |
| 9 | Histogram Buckets | Configurable histogram boundaries for latency tracking | Medium | Default buckets | None |
| 10 | Exemplars | Link metrics to trace IDs for correlation | Medium | Disabled | Tracing |

### Query Languages

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 11 | PromQL | Prometheus Query Language for metrics | Medium | Available | Prometheus |
| 12 | LogQL | Loki Query Language for logs (inspired by PromQL) | Medium | Available | Loki |
| 13 | TraceQL | Tempo Query Language for distributed traces | Medium | Available | Tempo |
| 14 | MetricsQL | VictoriaMetrics extended PromQL (additional functions) | Medium | Available | VictoriaMetrics |
| 15 | Recording Rules | Pre-compute expensive queries as new time series | Medium | None | Prometheus |
| 16 | Aggregation Operators | sum, avg, min, max, count, topk, bottomk, quantile | Low | N/A | Query language |

### Alerting

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 17 | Alerting Rules | PromQL-based threshold and anomaly alerts | Medium | None | Prometheus |
| 18 | Alertmanager | Alert routing, grouping, silencing, inhibition | Medium | None | Prometheus |
| 19 | Alert Routing | Route alerts to different receivers based on labels | Medium | Default receiver | Alertmanager |
| 20 | Alert Grouping | Batch related alerts into single notification | Medium | By alertname | Alertmanager |
| 21 | Alert Silencing | Temporarily suppress known alerts | Low | None | Alertmanager |
| 22 | Alert Inhibition | Suppress alerts when higher-priority alert fires | Medium | None | Alertmanager |
| 23 | Notification Channels | Email, Slack, PagerDuty, OpsGenie, webhook, Teams, Telegram | Low | None | Channel config |
| 24 | Multi-Condition Alerts | Combine multiple metrics in alert expression | Medium | None | PromQL |
| 25 | Alert Templates | Customize alert message format with Go templates | Medium | Default | Alertmanager |

### Dashboards & Visualization

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 26 | Grafana Dashboards | Rich visualization with panels, variables, annotations | Low | None | Grafana |
| 27 | Dashboard Provisioning | Dashboards as code (JSON/YAML) | Medium | Manual | Grafana |
| 28 | Variables/Templating | Dynamic dashboard filters (dropdowns, regex) | Medium | None | Grafana |
| 29 | Annotations | Mark events on time series graphs | Low | None | Grafana |
| 30 | Service Maps | Auto-generated topology maps from traces/metrics | Medium | None | Tracing/APM |
| 31 | Heatmaps | Visualize distribution over time | Low | None | Histogram data |
| 32 | Dashboard Sharing | Public/embedded/snapshot sharing | Low | Private | Grafana |

### Distributed Tracing

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 33 | Trace Collection | Collect distributed traces from instrumented services | Medium | None | Instrumentation |
| 34 | Auto-Instrumentation | Automatic trace injection (Java agent, eBPF, OTel) | Medium | None | Agent/SDK |
| 35 | Trace Sampling | Head/tail sampling to control trace volume | Medium | 100% | Collector |
| 36 | Span Attributes | Custom metadata on trace spans | Low | None | SDK |
| 37 | Trace-to-Metrics | Generate RED metrics from traces | Medium | None | Tracing backend |
| 38 | Trace-to-Logs | Correlate traces with log entries | Medium | None | Log backend |
| 39 | Service Dependency Graph | Auto-discovered service topology from traces | Medium | None | Tracing |

### Log Aggregation

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 40 | Log Collection | Aggregate logs from multiple sources | Low | None | Agent (Promtail/Fluentd) |
| 41 | Label-Based Indexing | Index logs by labels, not full-text (Loki approach) | Low | Labels only | Loki |
| 42 | Full-Text Search | Full-text indexing for log search (Elastic approach) | High | None | Elasticsearch |
| 43 | Log Parsing | Extract structured fields from unstructured logs | Medium | None | Parser config |
| 44 | Log Retention | Configurable retention periods per tenant/stream | Low | 30 days | Storage |
| 45 | Log-Based Alerts | Alert on log patterns/frequencies | Medium | None | Log backend |

### Uptime & Synthetic Monitoring

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 46 | HTTP Checks | Periodic HTTP(S) endpoint checks | Low | None | Target URL |
| 47 | TCP/UDP Checks | Port availability monitoring | Low | None | Network access |
| 48 | DNS Checks | DNS resolution monitoring | Low | None | DNS |
| 49 | Certificate Monitoring | SSL/TLS certificate expiry tracking | Low | None | HTTPS target |
| 50 | Status Pages | Public/private service status pages | Low | None | Uptime Kuma/platform |
| 51 | Synthetic Transactions | Scripted browser interactions for user journey monitoring | High | None | Browser engine |
| 52 | Multi-Location Checks | Monitor from multiple geographic regions | Medium | Single | Multiple probes |

### SLO/SLI Tracking

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 53 | SLI Definition | Define Service Level Indicators from metrics | Medium | None | Prometheus |
| 54 | SLO Configuration | Set targets (99.9%, 99.99%) with error budgets | Medium | None | SLI |
| 55 | Error Budget Tracking | Track remaining error budget over rolling window | Medium | None | SLO |
| 56 | Burn Rate Alerts | Alert on error budget burn rate (fast/slow) | Medium | None | SLO |
| 57 | SLO Dashboard | Visualize SLO compliance and trends | Low | None | Grafana |

### Storage & Scalability

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 58 | TSDB (Time Series Database) | Efficient storage for time series data | Low | Prometheus local | None |
| 59 | WAL (Write-Ahead Log) | Crash-recovery for incoming data | Low | Enabled | TSDB |
| 60 | Compaction | Merge and downsample old data blocks | Medium | Automatic | TSDB |
| 61 | Long-Term Storage | Object storage backend (S3, GCS) for retention beyond local | Medium | Local only | Object store |
| 62 | Multi-Tenancy | Isolate data per tenant/team | High | Single tenant | Cortex/Mimir/VM |
| 63 | Federation | Aggregate metrics across Prometheus instances | Medium | Disabled | Multiple Prometheus |
| 64 | Horizontal Scaling | Scale metrics ingestion/query across nodes | High | Single node | Thanos/Mimir/Cortex |
| 65 | Data Deduplication | Remove duplicate samples from HA pairs | Medium | None | Thanos/Mimir |
| 66 | Downsampling | Reduce resolution of old data for storage savings | Medium | None | Thanos/Mimir |

### Cardinality & Performance

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 67 | Cardinality Management | Track and limit high-cardinality series | Medium | No limit | TSDB |
| 68 | Series Limits | Per-metric and global series count limits | Medium | Varies | Config |
| 69 | Query Timeout | Prevent runaway queries from consuming resources | Low | 2m | Prometheus |
| 70 | Query Concurrency | Limit concurrent queries | Medium | 20 | Prometheus |
| 71 | Chunk Pools | Memory pools for TSDB chunks to reduce GC pressure | High | Enabled | Go runtime |
| 72 | WAL Memory | Control WAL memory usage via segment size | Medium | 128MB | Config |
| 73 | Relabeling | Transform/filter labels at scrape time or alert time | Medium | None | Config |
| 74 | Metric Relabeling | Drop or modify metrics before storage | Medium | None | Config |

### Integration & Ecosystem

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 75 | Node Exporter | Linux host metrics (CPU, memory, disk, network) | Low | None | Prometheus |
| 76 | cAdvisor | Container resource usage metrics | Low | None | Docker/K8s |
| 77 | kube-state-metrics | Kubernetes object state metrics | Low | None | K8s cluster |
| 78 | Blackbox Exporter | Probe endpoints (HTTP, TCP, ICMP, DNS) | Low | None | Prometheus |
| 79 | Pushgateway | Accept pushed metrics for batch/ephemeral jobs | Low | None | Prometheus |
| 80 | Grafana OnCall | Incident management and on-call scheduling | Medium | None | Grafana |

## Architecture Patterns

### Prometheus + Grafana Stack
```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Service A│  │ Service B│  │ Service C│
│ /metrics │  │ /metrics │  │ /metrics │
└─────┬────┘  └─────┬────┘  └─────┬────┘
      └─────────────┼─────────────┘
                    ▼
          ┌──────────────────┐
          │   Prometheus     │
          │  ┌─────────┐    │
          │  │ Scraper  │    │  ← Pull metrics every 15s
          │  └────┬─────┘    │
          │       ▼          │
          │  ┌─────────┐    │
          │  │  TSDB    │    │  ← Local storage (WAL + blocks)
          │  └────┬─────┘    │
          │       ▼          │
          │  ┌─────────┐    │
          │  │ PromQL   │    │  ← Query engine
          │  └──────────┘    │
          └───────┬──────────┘
                  │
    ┌─────────────┼──────────────┐
    ▼             ▼              ▼
┌────────┐  ┌──────────┐  ┌──────────┐
│Grafana │  │Alertmgr  │  │Remote    │
│(Viz)   │  │(Routing) │  │Write     │
└────────┘  └──────────┘  └──────────┘
```

### Highly Available Prometheus (Thanos/Mimir)
```
Prometheus HA Pair (2x) ──► Thanos Sidecar ──► Object Storage (S3)
                                                      ▲
                                              Thanos Store Gateway
                                                      ▲
                                              Thanos Querier (dedup + merge)
                                                      ▲
                                              Grafana
```

### OpenTelemetry Pipeline
```
App (SDK/Auto-instrument)
    ├── Traces (OTLP) ──► OTel Collector ──► Jaeger/Tempo
    ├── Metrics (OTLP) ──► OTel Collector ──► Prometheus/Mimir
    └── Logs (OTLP) ──► OTel Collector ──► Loki/Elasticsearch
```

## Memory Management
- **Prometheus:** Memory ≈ (active_series × 4KB) + WAL buffer + query cache; 1M series ≈ 4GB RAM
- **VictoriaMetrics:** 3-5x more memory efficient than Prometheus for same series count
- **Loki:** Memory scales with active streams, not log volume; ingester memory ~1-4GB
- **Grafana:** 256MB-1GB typical; dashboard complexity and concurrent users drive memory
- **Thanos Store Gateway:** Caches index headers in memory; ~1GB per 10M series in object storage
- **Cardinality impact:** Each unique label combination = new series; unbounded labels (user_id, request_id) cause OOM
- **Mitigation:** Relabeling to drop high-cardinality labels, series limits, recording rules for pre-aggregation

## Testing Criteria
- Metrics scraped at configured interval from test exporters
- PromQL queries return expected results for known data
- Alerting rules fire within expected evaluation cycle
- Alert routing delivers to correct channels
- Dashboards render correctly with variable substitution
- Distributed traces show full request path across services
- Log queries return matching log entries by label and content
- Long-term storage retrieves historical data correctly
- High availability: failover works with zero data loss
- Cardinality limits prevent unbounded series growth

---

# 5. Runtime Protection / Zero-Day Defense

> **CRITICAL for AI Agent Infrastructure:** As Moltbook agents ("molties") execute code, install packages, and interact with systems, runtime protection is the last line of defense against compromised agents, supply chain attacks, and zero-day exploits.

## Top 10 Open-Source Tools

| # | Name | Language | Stars | License | Key Differentiator |
|---|------|----------|-------|---------|-------------------|
| 1 | **Falco** | C++ | 8.7K | Apache-2.0 | CNCF graduated, kernel syscall monitoring, rich rules ecosystem |
| 2 | **Wazuh** | C/Python | ~25K | GPL-2.0 | Full SIEM/XDR platform, file integrity, compliance, agent-based |
| 3 | **OSSEC** | C | 5K | GPL-2.0 | Original host-based IDS, log analysis, rootkit detection |
| 4 | **gVisor** | Go | ~16K | Apache-2.0 | Application kernel in user-space, syscall interception sandbox |
| 5 | **Tetragon** | Go | 4.4K | Apache-2.0 | eBPF-based security observability and runtime enforcement (Cilium) |
| 6 | **Kata Containers** | Go/Rust | ~5K | Apache-2.0 | Lightweight VMs for container isolation, hardware-level security |
| 7 | **Tracee** | Go | ~3.5K | Apache-2.0 | eBPF-based runtime security and forensics (Aqua Security) |
| 8 | **KubeArmor** | Go | 2.1K | Apache-2.0 | K8s-native runtime security, LSM-based (AppArmor/BPF-LSM) |
| 9 | **NeuVector** | Go | ~2K | Apache-2.0 | Full lifecycle container security, network + runtime (SUSE) |
| 10 | **seccomp** | C (kernel) | N/A | GPL-2.0 | Linux kernel syscall filtering (BPF-based), foundation of sandboxing |

**Also critical (kernel-level, not standalone repos):** AppArmor (MAC), SELinux (MAC), Linux Security Modules (LSM)

## Top 10 Proprietary / SaaS

| # | Name | Vendor | Pricing |
|---|------|--------|---------|
| 1 | **CrowdStrike Falcon** | CrowdStrike | From $8.99/endpoint/mo (Falcon Go) |
| 2 | **SentinelOne Singularity** | SentinelOne | From $6/endpoint/mo / Complete $12/mo / Enterprise custom |
| 3 | **Sysdig Secure** | Sysdig | Per-host pricing, Enterprise custom (~$20-40/host/mo) |
| 4 | **Aqua Runtime Protection** | Aqua Security | Per-workload, Enterprise custom |
| 5 | **Prisma Cloud Runtime** | Palo Alto Networks | Per-credit model, bundled with CNAPP |
| 6 | **Carbon Black (VMware)** | Broadcom/VMware | Per-endpoint, Enterprise custom |
| 7 | **Wiz Runtime Sensor** | Wiz (Google Cloud) | Bundled with Wiz platform |
| 8 | **Microsoft Defender for Containers** | Microsoft | $7/vCore/mo (Defender for Cloud) |
| 9 | **Lacework** | Fortinet | Per-host, Enterprise custom |
| 10 | **Trend Micro Cloud One** | Trend Micro | From $0.01/hour per workload |

## Features (80 Features)

### System Call Monitoring

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 1 | Syscall Monitoring | Intercept and analyze system calls in real-time | High | Varies | Kernel support |
| 2 | eBPF Probe Injection | Attach eBPF programs to kernel tracepoints/kprobes | High | None | Linux 4.18+ |
| 3 | Kernel Module | Traditional kernel module for deep syscall visibility | High | None | Kernel headers |
| 4 | Syscall Filtering (seccomp) | Block/allow specific system calls per container | Medium | Docker default | seccomp profile |
| 5 | Syscall Argument Inspection | Examine syscall arguments (file paths, network addrs) | High | None | eBPF/kprobe |
| 6 | Process Execution Monitoring | Track all process exec events (execve) | Medium | Enabled | Kernel tracing |
| 7 | File Access Monitoring | Monitor file open/read/write/unlink operations | Medium | Enabled | Kernel tracing |
| 8 | Network Connection Monitoring | Track connect/accept/bind/listen syscalls | Medium | Enabled | Kernel tracing |

### Behavioral Analysis

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 9 | Runtime Anomaly Detection | Detect deviations from normal behavior profile | High | None | Baseline |
| 10 | Behavioral Profiling | Learn normal behavior of workloads over time | High | None | ML/statistical |
| 11 | Process Allowlisting | Only permit expected processes to run | Medium | Disabled | Profile |
| 12 | Container Drift Detection | Alert when container filesystem changes from image | Medium | None | Image baseline |
| 13 | Privilege Escalation Detection | Detect setuid, capability changes, namespace escapes | High | Enabled | Syscall monitoring |
| 14 | Reverse Shell Detection | Identify outbound shell connections (fd redirect patterns) | Medium | Enabled | Rule |
| 15 | Cryptominer Detection | Detect cryptocurrency mining activity (CPU patterns, pool connections) | Medium | Enabled | Rule + heuristic |
| 16 | Rootkit Detection | Scan for known rootkit signatures and techniques | High | Varies | Scanner |
| 17 | Lateral Movement Detection | Identify attempts to access other hosts/containers | High | Varies | Network monitoring |
| 18 | Data Exfiltration Detection | Monitor for unusual outbound data transfers | High | Varies | Network monitoring |

### File Integrity Monitoring (FIM)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 19 | File Hash Monitoring | Track changes to critical system files via checksums | Medium | None | File list |
| 20 | Real-Time FIM | Detect file changes immediately via inotify/eBPF | Medium | Polling | Kernel support |
| 21 | Registry Monitoring (Windows) | Track Windows registry changes | Medium | None | Windows |
| 22 | Configuration Drift | Detect changes to configuration files | Medium | None | Baseline |
| 23 | Binary Verification | Verify executable integrity against known-good hashes | High | None | Hash DB |

### Network Security

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 24 | Network Policy Enforcement | Enforce micro-segmentation between workloads | High | Allow-all | Network plugin |
| 25 | DNS Monitoring | Track DNS queries for C2 detection, DGA detection | Medium | None | DNS visibility |
| 26 | TLS Inspection | Inspect encrypted traffic (MITM proxy) | High | None | CA + proxy |
| 27 | Network Anomaly Detection | Detect unusual traffic patterns and volumes | High | None | Baseline |
| 28 | Port Scan Detection | Identify reconnaissance scanning activity | Medium | Varies | Network monitor |
| 29 | Egress Filtering | Control outbound network connections | Medium | Allow-all | Network policy |

### Container & Kubernetes Security

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 30 | K8s Admission Control | Validate/mutate pod specs before creation | Medium | None | Webhook |
| 31 | K8s Audit Log Analysis | Analyze Kubernetes API server audit logs | Medium | None | Audit policy |
| 32 | Pod Security Standards | Enforce restricted/baseline/privileged pod policies | Medium | Privileged | K8s 1.25+ |
| 33 | Image Verification | Verify container image signatures before running | Medium | None | Cosign/Notary |
| 34 | Runtime Image Scanning | Scan running containers for new vulnerabilities | Medium | None | Scanner + agent |
| 35 | Namespace Isolation | Enforce security boundaries between namespaces | Medium | None | Network policy |
| 36 | Service Mesh Security | mTLS enforcement and authorization policies | High | None | Istio/Linkerd |
| 37 | Ephemeral Container Detection | Alert on debug containers attached to running pods | Low | None | K8s audit |

### Mandatory Access Control (MAC)

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 38 | AppArmor Profiles | Restrict process capabilities via AppArmor LSM | Medium | Unconfined | AppArmor |
| 39 | SELinux Policies | Type enforcement and mandatory access control | High | Permissive | SELinux |
| 40 | seccomp Profiles | Syscall allowlist/blocklist per container | Medium | Docker default | seccomp |
| 41 | Capabilities Management | Linux capability dropping (drop ALL, add specific) | Medium | Default set | Kernel |
| 42 | Read-Only Root Filesystem | Prevent writes to container root filesystem | Low | Read-write | Container config |
| 43 | Non-Root Enforcement | Force containers to run as non-root user | Low | Root allowed | Container config |

### Threat Intelligence & Detection Rules

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 44 | Rule Engine | Declarative rules for detection (Falco rules, Sigma, YARA) | Medium | Built-in rules | Rule files |
| 45 | MITRE ATT&CK Mapping | Map detections to ATT&CK tactics/techniques | Medium | Varies | ATT&CK framework |
| 46 | Threat Intelligence Feeds | Integrate IOCs (IPs, hashes, domains) for detection | Medium | None | TI feed |
| 47 | Sigma Rules | Cross-platform detection rule format | Medium | None | Sigma converter |
| 48 | YARA Rules | Pattern matching for malware/artifact detection | Medium | None | YARA engine |
| 49 | Custom Detection Rules | Author organization-specific detection logic | Medium | None | Rule engine |
| 50 | Rule Severity/Priority | Classify detections by severity | Low | Built-in | Rule metadata |
| 51 | False Positive Management | Suppress/tune rules to reduce noise | Medium | None | Exception lists |

### Incident Response

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 52 | Automated Response | Kill process, isolate container, block IP on detection | High | Alert only | Response engine |
| 53 | Forensic Capture | Capture process tree, network state, file state on alert | High | None | Agent |
| 54 | Container Quarantine | Isolate compromised container (network/process freeze) | High | None | Orchestrator |
| 55 | Incident Timeline | Reconstructed timeline of attack events | Medium | None | Event correlation |
| 56 | SOAR Integration | Connect to Security Orchestration, Automation, Response | High | None | SOAR platform |
| 57 | Evidence Preservation | Capture forensic evidence before container destruction | High | None | Agent |

### Compliance

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 58 | CIS Benchmarks | Center for Internet Security compliance checks (Docker, K8s, OS) | Medium | None | Benchmark rules |
| 59 | PCI-DSS Runtime Controls | Payment card industry runtime security requirements | High | None | Policy mapping |
| 60 | HIPAA Controls | Health data runtime protection requirements | High | None | Policy mapping |
| 61 | SOC 2 Type II | Continuous compliance monitoring for SOC 2 | High | None | Policy mapping |
| 62 | NIST 800-53 | Federal security control compliance | High | None | Policy mapping |
| 63 | Compliance Reporting | Generate audit-ready compliance reports | Medium | None | Platform |

### Sandboxing & Isolation

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 64 | gVisor Sandboxing | Run containers in user-space kernel (Sentry) | High | None | gVisor runtime |
| 65 | Kata Containers | Run containers in lightweight VMs (QEMU/Cloud Hypervisor) | High | None | Hardware virt |
| 66 | Firecracker MicroVMs | AWS-developed microVM for serverless isolation | High | None | KVM |
| 67 | Namespace Isolation | Linux kernel namespaces (pid, net, mnt, user, etc.) | Medium | Container default | Kernel |
| 68 | Cgroup Limits | Resource limits (CPU, memory, I/O) via cgroups v2 | Medium | Container default | Kernel |
| 69 | User Namespace Remapping | Map container root to unprivileged host user | Medium | Disabled | Kernel config |
| 70 | Rootless Containers | Run entire container engine without root | Medium | Disabled | Podman/rootless Docker |

### eBPF-Specific Features

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 71 | eBPF Kernel Tracing | Attach to kprobes, tracepoints, LSM hooks | High | None | Linux 4.18+ |
| 72 | eBPF Network Observability | Monitor network flows at kernel level | High | None | eBPF + Cilium |
| 73 | eBPF Policy Enforcement | Block actions at kernel level (Tetragon) | High | None | Tetragon |
| 74 | BTF Support | BPF Type Format for portable eBPF programs (CO-RE) | High | Available | Kernel 5.2+ |
| 75 | Ring Buffer | Efficient kernel→user-space event streaming | Medium | Perf buffer | Kernel 5.8+ |

### Advanced

| # | Feature | Description | Complexity | Default | Dependencies |
|---|---------|-------------|------------|---------|-------------|
| 76 | Virtual Patching | Shield known vulnerabilities at runtime without code changes | High | None | WAF/runtime agent |
| 77 | Host-Based IDS/IPS | Intrusion detection/prevention at host level | High | IDS only | Agent |
| 78 | Memory Protection | Detect buffer overflows, use-after-free at runtime | High | None | Specialized tooling |
| 79 | Supply Chain Attack Detection | Detect compromised dependencies at runtime | High | None | Behavioral analysis |
| 80 | AI/ML Anomaly Detection | Machine learning models for unknown threat detection | High | None | Training data + compute |

## Architecture Patterns

### eBPF-Based Runtime Security (Falco/Tetragon)
```
┌─────────────────────────────────────────────────┐
│                Linux Kernel                      │
│  ┌──────────────────────────────────────────┐   │
│  │         eBPF Programs                     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │kprobes  │ │tracepoint│ │ LSM     │   │   │
│  │  │(syscall)│ │(sched,  │ │ hooks   │   │   │
│  │  │         │ │ net)    │ │         │   │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘   │   │
│  │       └──────────┬┘───────────┘         │   │
│  │                  ▼                       │   │
│  │         eBPF Ring Buffer                 │   │
│  └──────────────────┬───────────────────────┘   │
└─────────────────────┼───────────────────────────┘
                      ▼ (events streamed to user-space)
┌─────────────────────────────────────────────────┐
│           User-Space Agent                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Event    │  │  Rule    │  │ Response │     │
│  │ Decoder  │→ │  Engine  │→ │ Engine   │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│                      ▼                          │
│  ┌──────────────────────────────────────┐      │
│  │  Output Plugins                       │      │
│  │  stdout │ syslog │ gRPC │ HTTP │ K8s │      │
│  └──────────────────────────────────────┘      │
└─────────────────────────────────────────────────┘
```

### Defense in Depth Model
```
Layer 1: Network Policies (micro-segmentation)
    └── Layer 2: Admission Control (image verification, pod security)
        └── Layer 3: MAC (AppArmor/SELinux/seccomp profiles)
            └── Layer 4: Runtime Monitoring (Falco/Tetragon eBPF)
                └── Layer 5: Sandboxing (gVisor/Kata for untrusted workloads)
                    └── Layer 6: Incident Response (auto-quarantine, forensics)
```

### Agent vs Agentless Architecture
```
Agent-Based (Falco, Wazuh, CrowdStrike):
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Host A   │  │ Host B   │  │ Host C   │
  │ [Agent]  │  │ [Agent]  │  │ [Agent]  │
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       └──────────────┼──────────────┘
                      ▼
              ┌──────────────┐
              │ Central Mgmt │  (events, rules, response)
              └──────────────┘

Agentless (Wiz, some Prisma Cloud):
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Host A   │  │ Host B   │  │ Host C   │
  │ (no agent)│  │ (no agent)│  │ (no agent)│
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       └──────────────┼──────────────┘
                      ▼
              ┌──────────────┐
              │ Cloud APIs   │  (snapshot scanning, API queries)
              │ + Snapshots  │
              └──────────────┘
```

## Memory Management
- **Falco:** eBPF probes: ~50-100MB kernel memory; user-space agent: 200-500MB; ring buffer: 8MB default
- **Tetragon:** More efficient than Falco (in-kernel filtering); agent: 150-300MB; eBPF maps: configurable
- **Wazuh agent:** 50-200MB per host; manager: 2-8GB depending on agent count
- **gVisor (Sentry):** Adds ~50-100MB overhead per sandboxed container; syscall interception latency 5-15%
- **Kata Containers:** VM overhead ~100-200MB per container; startup latency ~1-2s vs ~100ms for runc
- **seccomp:** Near-zero overhead (BPF filter in kernel); loaded once per container
- **AppArmor/SELinux:** Minimal memory overhead (<10MB); loaded as kernel LSM policies

## Testing Criteria
- eBPF probes load and attach correctly on target kernel version
- Falco rules detect test scenarios (shell in container, sensitive file access, network anomaly)
- seccomp profiles block disallowed syscalls and permit required ones
- Container drift detection catches filesystem modifications
- Privilege escalation simulation triggers alerts
- Cryptominer detection identifies test mining activity
- File integrity monitoring detects unauthorized file changes
- Network policy enforcement blocks unauthorized connections
- Auto-response kills/quarantines compromised container
- Performance overhead stays within acceptable bounds (<5% CPU, <200MB RAM)

---

# Cross-Category Integration Notes

## The Forgeprint DevSecOps Pipeline
```
Code Commit
    → CI/CD Pipeline (Section 2)
        → Security Scanning (Section 3): SAST, dependency, secret detection
            → IaC Validation (Section 1): Terraform plan + Checkov/tfsec
                → Build & Deploy
                    → Runtime Protection (Section 5): Falco, seccomp, network policies
                        → Monitoring (Section 4): Prometheus metrics, Loki logs, Jaeger traces
                            → Alert → Response → Audit
```

## Key Decisions for Forgeprint Blueprints

1. **IaC:** Default to OpenTofu (MPL-2.0) over Terraform (BSL). Terragrunt for DRY multi-environment.
2. **CI/CD:** Forgejo Actions for self-hosted (GH Actions compatible). Argo CD for GitOps K8s delivery.
3. **Security:** Trivy as all-in-one scanner. Gitleaks for secrets. Renovate for dependency updates.
4. **Monitoring:** Prometheus + Grafana + Loki stack. VictoriaMetrics for high-scale. OpenTelemetry for instrumentation.
5. **Runtime:** Falco for detection. seccomp + AppArmor for enforcement. gVisor for untrusted agent workloads.

## Moltbook Agent Security Stack
For AI agents ("molties"), the recommended defense stack:
- **Build time:** Trivy image scan → Checkov IaC scan → Gitleaks secret scan
- **Deploy time:** Admission control (image signature verification) → Pod Security Standards (restricted)
- **Runtime:** Falco (syscall monitoring) → seccomp (syscall filtering) → gVisor (sandbox for untrusted code execution)
- **Network:** Cilium network policies → egress filtering → DNS monitoring
- **Observe:** Prometheus metrics → Loki logs → alerts on anomalous agent behavior