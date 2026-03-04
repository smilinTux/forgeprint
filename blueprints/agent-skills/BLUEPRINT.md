# Agent Skills Framework (SKSkills) Blueprint

## Overview & Purpose

SKSkills is a sovereign agent skill framework built natively on the Model Context Protocol (MCP). Instead of monolithic plugin systems where capabilities are hardcoded into agent runtimes, SKSkills decomposes agent abilities into three primitives -- Knowledge, Capability, and Flow -- each delivered as an isolated MCP server. Skills are discovered, installed, and managed through a unified CLI and registry, with optional CapAuth integration for per-tool, per-agent access control. Each skill runs as its own subprocess, communicating via stdio or SSE transport, ensuring isolation, versioning, and independent lifecycle management.

### Core Responsibilities
- **Three Primitives**: Decompose agent abilities into Knowledge (data/context), Capability (actions), and Flow (automation sequences)
- **MCP Server Model**: Each skill runs as an isolated subprocess with stdio/SSE transport
- **Skill Registry**: Discover, install, enable, disable, and update skills through a central registry
- **Namespace Support**: Global skills available to all agents, plus per-agent namespaced skills
- **CapAuth Integration**: Optional capability token gating per-tool, per-agent
- **Skill Manifest**: Declarative skill.yaml defining primitives, entry points, and dependencies
- **Built-in Skills**: Ship with core skills for SKMemory, SKSeal, and SKPDF
- **Lifecycle Management**: Install, update, enable/disable, and uninstall skills with dependency resolution

## Core Concepts

### 1. Three Primitives
**Definition**: Every agent skill is composed of one or more of three fundamental primitives, each mapping to an MCP concept.

```
Primitive {
    KNOWLEDGE: {
        mcp_type: "resource"
        description: "Data, documents, and context the agent can read"
        examples: [
            "Memory fragments from SKMemory",
            "Document contents from a file system",
            "Configuration values from a database",
            "Real-time sensor data from an IoT device"
        ]
        interface: MCP Resource (URI-addressable, read-only)
    }

    CAPABILITY: {
        mcp_type: "tool"
        description: "Actions the agent can execute"
        examples: [
            "Sign a document with SKSeal",
            "Send a message via SKComm",
            "Query a database",
            "Generate a PDF report"
        ]
        interface: MCP Tool (name, description, input_schema, execute)
    }

    FLOW: {
        mcp_type: "prompt"
        description: "Multi-step automation sequences combining primitives"
        examples: [
            "Onboarding flow: create identity, generate keys, register",
            "Signing flow: upload doc, apply template, collect signatures",
            "Review flow: fetch PR, analyze code, post comments"
        ]
        interface: MCP Prompt (template with variable substitution)
    }
}
```

### 2. Skill Manifest
**Definition**: A declarative YAML file that defines everything about a skill -- identity, primitives, entry points, dependencies, and configuration.

```
SkillManifest {
    name: Unique skill identifier (e.g., "skseal")
    version: Semantic version string
    description: Human-readable description
    author: Author name or organization
    license: SPDX license identifier
    homepage: Optional URL

    primitives: [
        {
            name: Primitive name (e.g., "sign_document")
            type: "knowledge" | "capability" | "flow"
            description: What this primitive does
            config: Primitive-specific configuration
        }
    ]

    entry_point: {
        module: Python module path (e.g., "skseal.server")
        class: Optional class name for the MCP server
        transport: "stdio" | "sse"
    }

    dependencies: {
        python: List of pip requirements
        skills: List of required skills (for inter-skill calls)
        system: List of system-level requirements
    }

    config_schema: {
        type: "object"
        properties: Map of config key → JSON Schema
        required: List of required config keys
    }

    capauth: {
        required: Boolean (whether CapAuth tokens are needed)
        scopes: List of capability scopes this skill uses
    }
}
```

### 3. Skill Registry
**Definition**: A local database tracking installed skills, their state, and namespace assignments.

```
SkillRegistry {
    registry_path: Path to registry.json
    skills: Map<skill_name, SkillEntry>

    SkillEntry {
        name: Skill identifier
        version: Installed version
        path: Path to skill directory
        enabled: Boolean
        namespace: "global" | agent_name
        manifest: Parsed SkillManifest
        installed_at: ISO-8601
        updated_at: ISO-8601
        config: Skill-specific configuration overrides
    }

    methods:
        install(source) → SkillEntry
        uninstall(name) → Boolean
        enable(name) → Boolean
        disable(name) → Boolean
        update(name) → SkillEntry
        list(namespace?) → List<SkillEntry>
        get(name) → SkillEntry
        resolve_dependencies(name) → List<SkillEntry>
}
```

### 4. MCP Server Runtime
**Definition**: The runtime that launches and manages skill MCP servers as subprocesses, providing the communication bridge between agent frameworks and individual skills.

```
SkillRuntime {
    active_servers: Map<skill_name, ManagedServer>

    ManagedServer {
        skill_name: Identifier
        process: Subprocess handle
        transport: "stdio" | "sse"
        pid: Process ID
        started_at: ISO-8601
        health: "starting" | "healthy" | "degraded" | "stopped"
        resources: List<MCP Resource URIs>
        tools: List<MCP Tool names>
        prompts: List<MCP Prompt names>
    }

    lifecycle:
        discover() → List<SkillEntry>     # Find all enabled skills
        launch(skill_name) → ManagedServer  # Start MCP server subprocess
        stop(skill_name) → Boolean          # Graceful shutdown
        restart(skill_name) → ManagedServer # Stop then launch
        health_check(skill_name) → HealthStatus
        list_tools() → List<ToolInfo>       # All tools across all skills
        list_resources() → List<ResourceInfo>
        call_tool(skill, tool, args) → Result
        read_resource(skill, uri) → Content
}
```

### 5. Agent Namespace
**Definition**: Skills can be scoped globally or to specific agents. Namespacing allows different agents to have different skill configurations without interference.

```
Namespace {
    global: {
        path: "~/.skskills/skills/"
        description: "Skills available to all agents on this node"
        skills: List of globally installed skills
    }

    agent: {
        path: "~/.skskills/agents/{agent_name}/skills/"
        description: "Skills scoped to a specific agent"
        skills: List of agent-specific skills
        overrides: Agent-specific config overrides for global skills
    }

    resolution_order:
        1. Agent-namespaced skill (highest priority)
        2. Global skill
        3. Built-in skill (lowest priority, always available)
}
```

## Architecture Patterns

### 1. Subprocess Isolation Model

```
┌─────────────────────────────────────────────────────┐
│                    Agent Framework                     │
│  (Claude Code, OpenClaw, custom agent)                │
│                                                       │
│  MCP Client ─────────────────────────────────────┐   │
│      │           │           │           │        │   │
│      │ stdio     │ stdio     │ sse       │ stdio  │   │
│      ▼           ▼           ▼           ▼        │   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │   │
│  │SKMemory│ │SKSeal  │ │SKPDF   │ │Custom  │     │   │
│  │Skill   │ │Skill   │ │Skill   │ │Skill   │     │   │
│  │(subproc│ │(subproc│ │(subproc│ │(subproc│     │   │
│  │  PID 1)│ │  PID 2)│ │  PID 3)│ │  PID 4)│     │   │
│  └────────┘ └────────┘ └────────┘ └────────┘     │   │
│                                                       │
│  Each skill = isolated process with own dependencies  │
│  Crash in one skill does not affect others            │
└─────────────────────────────────────────────────────┘
```

**Benefits:**
- Complete process isolation -- a skill crash cannot bring down the agent
- Each skill can have its own Python dependencies without version conflicts
- Skills can be written in any language that speaks MCP protocol
- Resource limits (memory, CPU) can be set per-skill via OS process controls

**Limitations:**
- Subprocess startup adds latency on first invocation
- Inter-process communication overhead vs in-process function calls
- More complex deployment than a single monolith

### 2. Registry-Driven Discovery

```
skseal run                          # User starts runtime
     │
     ▼
Registry: Load registry.json
     │
     ▼
For each enabled skill:
     │
     ├── Load skill.yaml manifest
     ├── Verify dependencies are met
     ├── Resolve namespace (global vs agent)
     │
     ▼
Launch MCP servers as subprocesses
     │
     ├── stdio transport: Connect via stdin/stdout pipes
     └── sse transport: Connect via HTTP Server-Sent Events
     │
     ▼
Aggregate all tools, resources, and prompts
     │
     ▼
Ready: Agent framework connects and discovers all primitives
```

**Benefits:**
- Skills are discovered dynamically -- no hardcoded list
- Enable/disable without code changes or restarts (with hot-reload)
- Manifest-driven configuration reduces misconfiguration

**Limitations:**
- Registry corruption can prevent all skills from loading
- Dependency resolution at startup adds to boot time

## Data Flow Diagrams

### Skill Installation Flow
```
User runs: skskills install <source>
        │
        ▼
Resolve source: Local path, git URL, or registry name
        │
        ▼
Download/copy skill files to temporary directory
        │
        ▼
Parse skill.yaml manifest
        │
        ├── Invalid manifest → Error with details
        │
        ▼ Valid
Dependency Resolution:
        │
        ├── Python deps: pip install into skill's virtualenv
        ├── Skill deps: Verify required skills are installed
        ├── System deps: Check system requirements
        │
        ├── Unresolvable dependency → Error with suggestions
        │
        ▼ All resolved
Copy skill to namespace directory:
        │
        ├── Global: ~/.skskills/skills/{name}/
        └── Agent: ~/.skskills/agents/{agent}/skills/{name}/
        │
        ▼
Register in registry.json (name, version, path, enabled=true)
        │
        ▼
Run skill's post-install hook (if defined in manifest)
        │
        ▼
Return: SkillEntry with installation details
```

### Runtime Skill Invocation Flow
```
Agent framework sends MCP tool call
  e.g., { method: "tools/call", params: { name: "skseal.sign_document", ... } }
        │
        ▼
Skill Runtime: Parse qualified tool name → "skseal" + "sign_document"
        │
        ▼
Namespace Resolution: Which "skseal" skill applies?
        │
        ├── Agent-scoped version exists → Use it
        └── Fall back to global → Use global
        │
        ▼
CapAuth Gate (if configured):
        │
        ├── Check capability token: Does this agent have "skseal:sign" scope?
        ├── Token missing/invalid → Return 403 error
        │
        ▼ Authorized
MCP Transport: Route request to skill's MCP server subprocess
        │
        ├── stdio: Write JSON-RPC to subprocess stdin, read from stdout
        └── sse: POST to skill's HTTP endpoint
        │
        ▼
Skill MCP Server: Execute tool logic
        │
        ▼
Return: MCP tool result → Agent framework
```

### Skill Lifecycle Flow
```
                    install
          ┌──────────────────────┐
          │                      ▼
     ┌────────┐           ┌──────────┐
     │  Not   │           │ Installed│
     │Installed│           │ (enabled)│
     └────────┘           └────┬─────┘
          ▲                    │
          │ uninstall    disable│   enable
          │                    ▼      │
          │              ┌──────────┐ │
          └──────────────│ Installed│◀┘
                         │(disabled)│
                         └──────────┘

     update: Installed → download new version → Installed (new version)
     All transitions recorded in registry.json
```

## Configuration Model

```yaml
# ~/.skskills/config.yml

runtime:
  transport: "stdio"                     # Default transport for skills
  max_concurrent_skills: 20              # Max simultaneous skill processes
  startup_timeout_seconds: 30            # Max time for a skill to become healthy
  health_check_interval_seconds: 60      # Health check polling interval
  restart_on_crash: true                 # Auto-restart crashed skills
  max_restart_attempts: 3                # Max restarts before marking degraded

registry:
  path: "~/.skskills/registry.json"
  auto_update: false                     # Auto-update skills on startup
  update_check_interval: 86400           # Seconds between update checks

namespaces:
  global_path: "~/.skskills/skills/"
  agents_path: "~/.skskills/agents/"
  resolution: "agent_first"              # agent_first | global_first | agent_only

capauth:
  enabled: false                          # Require CapAuth tokens for tool access
  keyring: "~/.capauth/identity/"
  default_scopes: []                     # Scopes granted to all agents by default
  per_agent_scopes:                      # Agent-specific scope grants
    opus:
      - "skseal:*"
      - "skmemory:*"
    jarvis:
      - "skmemory:read"

skills:
  skmemory:
    enabled: true
    config:
      memory_path: "~/.skcapstone/memory/"
      max_results: 50
  skseal:
    enabled: true
    config:
      skseal_path: "~/.skseal/"
      default_key: "auto"
  skpdf:
    enabled: true
    config:
      temp_dir: "/tmp/skpdf/"
      max_file_size: "100MB"

logging:
  level: "info"
  file: "~/.skskills/logs/skskills.log"
  max_size: "50MB"
  rotate: 7
```

## Security Considerations

### 1. Process Isolation
- Each skill runs in its own subprocess with separate memory space
- Skills cannot access each other's file descriptors or memory
- Resource limits (memory, CPU) can be set per-skill via cgroups or ulimits
- A compromised skill cannot escalate to the agent runtime

### 2. CapAuth Capability Gating
- Tool invocation can require a valid CapAuth capability token
- Scopes are granular: per-skill, per-tool, per-agent
- Token validation happens before the request reaches the skill subprocess
- Missing or expired tokens result in immediate rejection

### 3. Manifest Integrity
- Skill manifests can be PGP-signed by the skill author
- Registry verifies signature before installation (optional, recommended)
- Hash-based integrity check on skill files after installation
- Tampered files detected on next startup

### 4. Dependency Isolation
- Each skill can use its own virtualenv to avoid dependency conflicts
- System-level dependencies declared in manifest and verified at install
- No shared mutable state between skills beyond MCP protocol messages

### 5. Transport Security
- stdio transport: Pipes are process-local, no network exposure
- SSE transport: Bound to localhost by default, TLS optional for remote
- All MCP messages are JSON-RPC -- structured and validatable
- Message size limits prevent resource exhaustion

## Performance Targets

| Metric | Target |
|--------|--------|
| Skill subprocess startup | < 2s (Python with imports) |
| MCP tool call latency (stdio) | < 50ms overhead |
| MCP tool call latency (SSE) | < 100ms overhead |
| Registry load time | < 100ms for 100 skills |
| Skill discovery (all enabled) | < 500ms |
| Max concurrent skill processes | 20+ (configurable) |
| Memory per idle skill process | < 50MB |
| Hot-reload (enable/disable) | < 5s |
| Health check round-trip | < 200ms |
| Skill install (local source) | < 10s |

## Extension Points

### Custom Skill Template
```python
class SkillServer(ABC):
    """Base class for creating an SKSkills-compatible MCP server."""

    @abstractmethod
    def name(self) -> str:
        """Skill name matching the manifest."""

    @abstractmethod
    def version(self) -> str:
        """Skill version matching the manifest."""

    @abstractmethod
    def tools(self) -> list[dict]:
        """List of MCP tool definitions this skill provides."""

    @abstractmethod
    def resources(self) -> list[dict]:
        """List of MCP resource definitions this skill provides."""

    @abstractmethod
    def prompts(self) -> list[dict]:
        """List of MCP prompt definitions this skill provides."""

    @abstractmethod
    async def call_tool(self, name: str, arguments: dict) -> dict:
        """Execute a tool by name with the given arguments."""

    @abstractmethod
    async def read_resource(self, uri: str) -> dict:
        """Read a resource by URI."""
```

### Custom Transport Adapters
```python
class TransportAdapter(ABC):
    """Adapter for custom MCP transport mechanisms."""

    @abstractmethod
    async def connect(self, skill_entry: dict) -> None:
        """Establish connection to a skill's MCP server."""

    @abstractmethod
    async def send(self, message: dict) -> dict:
        """Send a JSON-RPC message and return the response."""

    @abstractmethod
    async def disconnect(self) -> None:
        """Clean up the connection."""
```

### Custom Registry Backends
```python
class RegistryBackend(ABC):
    """Backend for skill registry storage."""

    @abstractmethod
    def load(self) -> dict:
        """Load the full registry state."""

    @abstractmethod
    def save(self, state: dict) -> None:
        """Persist the full registry state."""

    @abstractmethod
    def get_skill(self, name: str) -> Optional[dict]:
        """Get a single skill entry."""

    @abstractmethod
    def update_skill(self, name: str, entry: dict) -> None:
        """Update a single skill entry."""
```

## Implementation Architecture

### Core Components

| Component | Responsibility | Dependencies |
|-----------|---------------|--------------|
| `SkillRuntime` | Launch, manage, and health-check skill subprocesses | asyncio, subprocess |
| `SkillRegistry` | Install, update, enable/disable, track skills | JSON file or SQLite |
| `ManifestParser` | Parse and validate skill.yaml manifests | pyyaml, jsonschema |
| `NamespaceResolver` | Resolve skill lookups across global and agent namespaces | pathlib |
| `MCPStdioTransport` | Communicate with skills over stdin/stdout pipes | asyncio |
| `MCPSSETransport` | Communicate with skills over HTTP Server-Sent Events | httpx |
| `CapAuthGate` | Validate capability tokens before tool invocation | CapAuth SDK |
| `DependencyResolver` | Resolve and install Python and skill dependencies | pip, pathlib |
| `CLIApp` | Command-line interface for all skill management | click, rich |
| `BuiltinSkills` | Ship with SKMemory, SKSeal, SKPDF skills | internal |

### Data Structures

```
~/.skskills/
├── config.yml                          # Global configuration
├── registry.json                       # Skill registry database
├── skills/                             # Global skills
│   ├── skmemory/
│   │   ├── skill.yaml                  # Manifest
│   │   ├── src/
│   │   │   └── skmemory_skill/
│   │   │       ├── __init__.py
│   │   │       └── server.py           # MCP server implementation
│   │   └── requirements.txt
│   ├── skseal/
│   │   ├── skill.yaml
│   │   ├── src/
│   │   │   └── skseal_skill/
│   │   │       ├── __init__.py
│   │   │       └── server.py
│   │   └── requirements.txt
│   └── skpdf/
│       ├── skill.yaml
│       ├── src/
│       │   └── skpdf_skill/
│       │       ├── __init__.py
│       │       └── server.py
│       └── requirements.txt
├── agents/                             # Agent-namespaced skills
│   ├── opus/
│   │   └── skills/
│   │       └── custom-opus-skill/
│   │           ├── skill.yaml
│   │           └── src/
│   └── jarvis/
│       └── skills/
│           └── custom-jarvis-skill/
│               ├── skill.yaml
│               └── src/
└── logs/
    └── skskills.log
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `skskills init` | Initialize ~/.skskills/ directory structure |
| `skskills install <source>` | Install a skill from path, git URL, or registry |
| `skskills install <source> --agent <name>` | Install into agent namespace |
| `skskills uninstall <name>` | Remove a skill |
| `skskills list` | List all installed skills with status |
| `skskills list --agent <name>` | List skills for a specific agent |
| `skskills info <name>` | Show detailed skill information |
| `skskills enable <name>` | Enable a disabled skill |
| `skskills disable <name>` | Disable a skill without uninstalling |
| `skskills update <name>` | Update a skill to latest version |
| `skskills update --all` | Update all installed skills |
| `skskills run` | Start the skill runtime (launch all enabled skills) |
| `skskills run --agent <name>` | Start runtime with agent namespace |
| `skskills health` | Check health of all running skill processes |
| `skskills scaffold <name>` | Generate a new skill project from template |
| `skskills validate <path>` | Validate a skill.yaml manifest |
| `skskills tools` | List all tools across all enabled skills |
| `skskills resources` | List all resources across all enabled skills |

### Skill Manifest Example

```yaml
# ~/.skskills/skills/skseal/skill.yaml

name: skseal
version: "1.0.0"
description: "Sovereign document signing via PGP detached signatures"
author: "smilinTux"
license: "MIT"
homepage: "https://skcapstone.io/skills/skseal"

primitives:
  - name: sign_document
    type: capability
    description: "Sign a document with a PGP key, producing a detached signature"
    config:
      input_schema:
        type: object
        properties:
          document_path: { type: string, description: "Path to document to sign" }
          fingerprint: { type: string, description: "PGP key fingerprint" }
          notes: { type: string, description: "Optional signer notes" }
        required: [document_path, fingerprint]

  - name: verify_signature
    type: capability
    description: "Verify a document's PGP signature"
    config:
      input_schema:
        type: object
        properties:
          document_path: { type: string }
          signature_path: { type: string }
        required: [document_path, signature_path]

  - name: audit_trail
    type: knowledge
    description: "Read the audit trail for a document"
    config:
      uri_template: "skseal://audit/{document_id}"

  - name: signing_flow
    type: flow
    description: "Multi-step document signing workflow"
    config:
      steps:
        - "Upload document"
        - "Select template"
        - "Apply signer roles"
        - "Collect signatures"
        - "Verify and finalize"

entry_point:
  module: "skseal_skill.server"
  class: "SKSealServer"
  transport: "stdio"

dependencies:
  python:
    - "pgpy>=0.6.0"
    - "pypdf>=4.0.0"
  skills: []
  system: []

config_schema:
  type: object
  properties:
    skseal_path:
      type: string
      default: "~/.skseal/"
    default_key:
      type: string
      default: "auto"
  required: []

capauth:
  required: false
  scopes:
    - "skseal:sign"
    - "skseal:verify"
    - "skseal:audit"
```
