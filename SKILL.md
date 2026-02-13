---
name: forgeprint
description: >
  AI-native software blueprints — research, create, and build from detailed recipes
  that specify every feature, architecture pattern, and test for any software category.
  Use when asked to: build/forge/cook software from blueprints, research a software
  category for blueprinting, create new recipes/blueprints, compose vertical stacks
  from multiple blueprints, or contribute to the Forgeprint cookbook. Covers 21+
  categories including databases, web servers, API gateways, message queues, load
  balancers, vector DBs, graph DBs, key-value stores, security scanners, CI/CD,
  monitoring, IaC, container orchestrators, and more.
---

# 🍳 Forgeprint — AI-Native Software Recipes

> Don't order software. Cook your own.

## What This Is

Forgeprint is a cookbook of detailed software blueprints ("recipes") that contain
enough information for any AI to generate a complete, tested implementation.

Each recipe includes:
- **Ingredients** (features.yml) — every feature cataloged with complexity, defaults, dependencies
- **Recipe** (BLUEPRINT.md) — master specification with data flow diagrams
- **Kitchen Science** (architecture.md) — deep architectural patterns and internals
- **Portion Sizes** (memory-profiles/) — memory management for different deployment targets
- **Taste Tests** (tests/unit-tests.md) — comprehensive test specifications
- **Kitchen Timer** (tests/benchmarks.md) — performance baselines and targets

## Quick Start

```bash
# Browse the cookbook
node forge.mjs list          # or: forge cookbook

# Get recipe details
node forge.mjs info <dish>   # e.g., forge info databases

# Start a new project from a recipe
node forge.mjs init <dish>   # copies recipe to working directory

# Preview a full-stack menu
node forge.mjs stack <template>  # saas-starter, ai-platform, enterprise, etc.
```

## Available Recipes (Tier 1 — Complete)

| Dish | Ingredients | Status |
|------|------------|--------|
| `load-balancers` | 97 | ✅ Ready to cook |
| `web-servers` | 80+ | ✅ Ready to cook |
| `databases` | 80+ | ✅ Ready to cook |
| `message-queues` | 80+ | ✅ Ready to cook |
| `api-gateways` | 90+ | ✅ Ready to cook |

## How to Use a Recipe

### 1. Pick Your Dish
```
Read blueprints/<dish>/BLUEPRINT.md for the overview.
```

### 2. Select Your Ingredients
```
Read blueprints/<dish>/features.yml
Pick the features you want. Each has complexity (low/medium/high) and dependencies.
Start with features where default: true for a standard build.
```

### 3. Study the Architecture
```
Read blueprints/<dish>/architecture.md
Understand the data flow, concurrency model, and state management.
Choose your architecture pattern (e.g., event-driven vs threaded for web servers).
```

### 4. Choose Your Portion Size
```
Read blueprints/<dish>/memory-profiles/standard.md
Adjust buffer sizes, connection limits, cache sizes for your target hardware.
```

### 5. Cook It
```
Generate the implementation using your selected ingredients and architecture.
The recipe has enough detail for any LLM to produce working code.
```

### 6. Taste Test
```
Read blueprints/<dish>/tests/unit-tests.md
Implement the test specs to verify your build.
Check benchmarks.md for performance targets.
```

## Stack Composition (Menus)

Forge entire vertical stacks by combining recipes:

```bash
forge stack saas-starter      # Gateway + Web + DB + Cache + Queue
forge stack ai-platform       # Gateway + DB + Vectors + Graph + Queue + Storage
forge stack enterprise        # Full 9-layer production stack
forge stack notion-killer     # Gateway + Web + DB + Search + Storage + Realtime
forge stack zero-trust        # Gateway + Secrets + DB + Vectors + Graph + Storage
```

See `STACKS.md` for the `stack.yml` format and inter-layer wiring.

## Creating New Recipes (RECON)

To blueprint ANY software category, follow the RECON methodology in `RECON.md`:

1. **Forage** (30 min) — Find top 10 OSS + 10 proprietary + 10 SaaS products
2. **Extract Ingredients** (45 min) — Mine ALL features from ALL 30 products
3. **Analyze Architecture** (45 min) — Document data flow, concurrency, state
4. **Write Taste Tests** (30 min) — 50+ unit tests + benchmarks with baselines
5. **Size Portions** (15 min) — Memory management for embedded → enterprise
6. **Plate It** (15 min) — Assemble into blueprint directory structure

### Quick-Start Prompt for New Recipes

Copy this to start blueprinting any category:

```
Create a Forgeprint recipe for [CATEGORY]. Research top 30 products
(10 OSS + 10 proprietary + 10 SaaS). Extract 60-100 features into
features.yml with name, description, complexity, default, dependencies.
Document architecture patterns with ASCII diagrams. Write 50+ unit test
specs and 5+ benchmarks with numeric baselines. Include memory management
guide. Output as Forgeprint blueprint directory structure.
```

## Research Library

Deep research is available for building new recipes:

| File | Categories | Features |
|------|-----------|----------|
| `research/tier1-categories.md` | LBs, Web, DBs, MQs, API GWs | 400+ |
| `research/tier2-categories.md` | Storage, Secrets, Workflows, Containers, BaaS | 432 |
| `research/tier2-databases.md` | Vector, Graph, KV, Document, TimeSeries, Search | 505 |
| `research/tier3-devsecops.md` | IaC, CI/CD, Security, Monitoring, Runtime | 400 |

To build a new recipe from research:
```
Read research/<file>.md for the [CATEGORY] section.
Use the feature list, architecture patterns, and testing criteria
to create a complete blueprint directory under blueprints/<category>/.
```

## Sub-Skills

### forgeprint-cook
**When:** Asked to generate/implement/build software from a Forgeprint recipe.
1. Read the recipe's BLUEPRINT.md for overview
2. Read features.yml — select ingredients based on user requirements
3. Read architecture.md — choose the right pattern
4. Generate implementation code matching the spec
5. Generate tests from tests/unit-tests.md specs
6. Validate against benchmarks.md targets

### forgeprint-recon
**When:** Asked to research/blueprint a new software category.
1. Read RECON.md for the full methodology
2. Check if research already exists in `research/` directory
3. Follow the 6-phase RECON process
4. Output a complete blueprint directory with all 6 files
5. Run the quality checklist from RECON.md before submitting

### forgeprint-stack
**When:** Asked to compose a full stack or multi-service architecture.
1. Read STACKS.md for composition patterns
2. Identify which recipe covers each layer
3. Check blueprint availability (`forge stack <template>`)
4. Generate integrated deployment configs (docker-compose, k8s, etc.)
5. Wire inter-service connections using standard interfaces

### forgeprint-contribute
**When:** Asked to improve existing recipes or add features.
1. Read CONTRIBUTING.md for guidelines
2. Read the target recipe's current features.yml
3. Research the specific product/feature to add
4. Add new entries matching the existing YAML schema
5. Update tests if new features require validation

## File Structure

```
forgeprint/
├── SKILL.md              ← You are here
├── forge.mjs             ← CLI tool (Node.js)
├── RECON.md              ← How to blueprint anything
├── STACKS.md             ← Vertical stack composition
├── ECOSYSTEM.md          ← smilinTux org roadmap
├── blueprints/
│   ├── TEMPLATE/         ← Starter template for new recipes
│   ├── load-balancers/   ← Complete recipe
│   ├── web-servers/      ← Complete recipe
│   ├── databases/        ← Complete recipe
│   ├── message-queues/   ← Complete recipe
│   └── api-gateways/     ← Complete recipe
├── research/             ← Deep research for future recipes
│   ├── tier1-categories.md
│   ├── tier2-categories.md
│   ├── tier2-databases.md
│   └── tier3-devsecops.md
└── marketing/            ← Launch materials
```

## Links

- **GitHub:** https://github.com/smilinTux/forgeprint
- **Org:** https://github.com/smilinTux
- **License:** AGPL-3.0 (tooling), Apache 2.0 (recipes)

---

*smilinTux — Making Self-Hosting & Decentralized Systems Cool Again* 🐧
*S&K Holdings QT — Helping architect our quantum future, one smile at a time.*
