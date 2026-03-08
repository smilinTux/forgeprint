# Agent Teams Blueprint

> Deploy and manage professional SKStacks agent teams on any infrastructure.

## Overview

This blueprint provides deployment patterns for SKStacks agent professional structure—autonomous AI agents organized into specialized teams handling Infrastructure, Development, Research, Marketing, Legal, and Sovereign domains. Deploy to Proxmox LXC containers or bare metal Ubuntu instances.

## Core Concepts

### Agent Professional Structure

SKStacks organizes agents into professional domains, each with a team lead, specialized roles, and clear responsibilities. This enables efficient task distribution while maintaining expertise concentration.

### VMID Naming Convention

| Range | Professional | Example |
|-------|-------------|---------|
| 201-209 | Infrastructure & Research | Sentinel (202), Agent Zero (201) |
| 210-219 | Development | Forge (208), Dev-Alpha (209) |
| 205-206 | Marketing & Docs | Piper (206), Chronicle (205) |
| 207 | Legal & Trusts | Vesper (207) |
| 301-305 | Sovereign (New) | Sovereign (301), Regent (302) |

### Deployment Models

1. **Proxmox LXC**: Full container isolation on Proxmox VE
2. **Bare Metal Ubuntu**: Direct deployment on Ubuntu servers
3. **Docker Containers**: Containerized deployment without VM layer

## Architecture Patterns

### Team Composition Model

```
Chef (Human)
    │
    ├── Sovereign Team (301-305)
    │   ├── Sovereign (301) → Lead
    │   ├── Regent (302) → Legal Research
    │   ├── Vault (303) → Private Banking
    │   ├── Scribe (304) → Documentation
    │   └── Consul (305) → Research Intel
    │
    ├── Infrastructure Team (202, 203, 209)
    │   ├── Sentinel (202) → Lead
    │   ├── Rook (203) → Security
    │   └── Dev-Alpha (209) → Databases
    │
    ├── Development Team (208-212)
    │   ├── Forge (208) → Lead Architect
    │   ├── Dev-Beta (210) → Templates
    │   ├── Dev-Gamma (211) → Video Pipeline
    │   └── Dev-Delta (212) → QA/Testing
    │
    ├── Research Team (201)
    │   └── Agent Zero → Research Lead
    │
    └── Marketing Team (205-206)
        ├── Piper (206) → Marketing Lead
        └── Chronicle (205) → Documentation
```

### Resource Allocation Matrix

#### Proxmox LXC Allocation

| Agent Type | vCPU | RAM | Storage | Priority |
|------------|------|-----|---------|----------|
| Team Lead | 2 | 2 GB | 10 GB | High |
| Specialist | 1-2 | 1-2 GB | 8-15 GB | Medium |

#### Bare Metal Allocation

| Pattern | Isolation | Management | Best For |
|---------|-----------|------------|----------|
| Systemd | Process | Simple | Single server |
| Docker | Container | Medium | Distributed |
| LXC on Proxmox | Full | Complex | VM infrastructure |

## Data Flow

### Agent Communication Flow

```
┌─────────────┐
│   Chef      │  ← Telegram/Discord
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Team Lead (VMID)│  ← Escalation point
└──────┬──────────┘
       │
       ├──→ Specialist 1 (VMID)
       ├──→ Specialist 2 (VMID)
       ├──→ Specialist 3 (VMID)
       └──→ Specialist 4 (VMID)
       
Agent → SKVector (knowledge)
Agent → SKGraph (relationships)
Agent → SKPrivate (secrets)
```

### Knowledge Base Integration

| Knowledge Type | Storage | Access |
|---------------|---------|--------|
| Public patterns | SKMemory (Git) | All agents |
| Private docs | SKPrivate | Team-specific |
| Secrets | Ansible Vault | Lead only |
| Agent SOUL | Local /root/clawd | Agent itself |

## Configuration Model

### Agent SOUL.md Template

```yaml
# Agent Identity
Name: <AGENT_NAME>
VMID: <VMID>
Team: <PROFESSIONAL>
Role: <SPECIFIC_ROLE>
Specializations:
  - <specialization_1>
  - <specialization_2>
Created: <ISO8601_TIMESTAMP>
Status: <pending|operational|maintenance>
```

### LXC Configuration Template

```bash
# /etc/pve/lxc/<vmid>.conf
hostname: <agent-name>
rootfs: local-lvm:vm-<vmid>-disk-0,size=<STORAGE>
memory: <RAM>
cores: <CPU>
net0: name=eth0,bridge=vmbr0,ip=dhcp
features: nesting=1,keyctl=1
onboot: 1
```

### Systemd Service Template

```ini
[Unit]
Description=SKStacks <AGENT_NAME>
After=network.target

[Service]
Type=simple
User=<AGENT_USER>
Group=<AGENT_GROUP>
WorkingDirectory=/opt/skstacks/<AGENT>
ExecStart=/opt/skstacks/<AGENT>/agent.sh
Environment=SK_VMID=<VMID>
Environment=SK_TEAM=<TEAM>

[Install]
WantedBy=multi-user.target
```

## Security Considerations

### Security Levels by Domain

| Level | Domain | Measures |
|-------|--------|----------|
| 🔴 High | Sovereign | Vault secrets, encrypted storage, VPN-only access, access logging |
| 🟡 Medium | Infrastructure, Development | SSH keys, Ansible vault, network segmentation, regular scans |
| 🟢 Low | Marketing, Research | Standard access controls, public documentation |

### Agent Hardening Checklist

- [ ] Non-root user for agent processes
- [ ] SSH key authentication only (no passwords)
- [ ] UFW firewall configured
- [ ] Fail2ban installed
- [ ] Automatic security updates enabled
- [ ] Log aggregation configured
- [ ] Secrets in vault, not in code
- [ ] Network isolation via SKMesh VPN

## Performance Targets

### Agent Response Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Startup time | < 60 seconds | Container boot to agent ready |
| Memory footprint | < 2 GB | Per agent baseline |
| CPU utilization | < 10% idle | Background processing only |
| Availability | 99.9% | Uptime per month |

### Deployment Time Targets

| Deployment Type | Time Target |
|-----------------|-------------|
| Single LXC | < 5 minutes |
| Full Sovereign team | < 30 minutes |
| Bare metal with Ansible | < 45 minutes |

## Extension Points

### Adding New Teams

1. Reserve VMID range in documentation
2. Create team directory in `/home/cbrd21/clawd/agents/TEAM-<NAME>.md`
3. Add deployment scripts to FORGEPRINT blueprints
4. Update AGENT-ARMY-STATUS.md
5. Configure OpenClaw for new agents

### Customizing Agent Roles

Agents are defined by:
1. `SOUL.md` — Agent identity and role
2. `specializations/` — Directory of YAML files defining capabilities
3. `agent.sh` — Startup and loop script
4. `knowledge/` — Domain-specific knowledge base

### Integration Hooks

```yaml
# hooks/integrations.yml
external_services:
  - name: SKVector
    url: http://skvector:6333
    auth: required
    
  - name: SKGraph
    url: http://skgraph:7474
    auth: required
    
  - name: SKPrivate
    url: http://skprivate:8080
    auth: required
```

## Current Teams

### Sovereign Team (New - VMIDs 301-305)

**Purpose**: Private banking, legal affairs, trust management, research intelligence

| Agent | VMID | Role | Status |
|-------|------|------|--------|
| Sovereign | 301 | Team Lead | Pending |
| Regent | 302 | Legal Research | Pending |
| Vault | 303 | Private Banking | Pending |
| Scribe | 304 | Documentation | Pending |
| Consul | 305 | Research Intel | Pending |

### Existing Operational Teams

| Team | Agents | Status |
|------|--------|--------|
| Infrastructure | 3 | Operational |
| Development | 4 | Operational |
| Research | 1 | Operational |
| Marketing | 2 | Operational |
| Legal/Trusts | 1 | Transitioning |

## Quick Start

### Deploy Sovereign Team to Proxmox

```bash
cd /home/cbrd21/clawd/FORGEPRINT/blueprints/agent-teams/scripts
chmod +x deploy-sovereign-proxmox.sh
./deploy-sovereign-proxmox.sh
```

### Deploy to Bare Metal

```bash
cd /home/cbrd21/clawd/FORGEPRINT
ansible-playbook blueprints/agent-teams/ansible/sovereign-bare-metal.yml -e vault_proxmox_password=<password>
```

### Verify Deployment

```bash
# Check agent status
for vmid in 201 202 203 205 206 207 208 209 210 211 212 301 302 303 304 305; do
  echo "VMID $vmid: $(pct status $vmid 2>/dev/null || echo 'not found')"
done
```
