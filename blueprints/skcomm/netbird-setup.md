# Netbird Mesh VPN Setup

## Overview

Netbird provides self-hosted WireGuard mesh VPN — the primary Layer 1 channel for SKComm. Sovereign, encrypted, zero trust.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   norap2027  │◄───►│  norap2027   │◄───►│   norap2027  │
│   (Lumina)   │     │  (Opus)      │     │   (Jarvis)   │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                   ┌────────▼────────┐
                   │  Netbird Server │
                   │  (SKStacks)     │
                   └─────────────────┘
```

## Installation

### Server (SKStacks)

```bash
# Deploy via Ansible
cd ~/SKStacks/v1/ansible/optional/netbird
ansible-playbook deploy_netbird-server-prod.yml

# Or Docker Compose
docker compose up -d netbird-server
```

### Client (Each Agent Machine)

```bash
# Install Netbird
curl -fsSL https://pkgs.netbird.io/install.sh | bash

# Configure
netbird up --management-url https://netbird.skstack01.douno.it:33073 \
  --setup-key <KEY> \
  --hostname lumina-agent

# Verify connectivity
netbird status
netbird peers list
```

## DNS Configuration

Add to `/etc/netbird/config.json`:

```json
{
  "dns": {
    "enabled": true,
    "port": 53,
    "nameservers": [
      {
        "netbird_ip": "100.64.0.1",
        "domains": ["skcomm.internal"]
      }
    ]
  }
}
```

Create service entries:

```
# DNS Records (managed via Netbird)
lumina.skcomm.internal  → 100.64.0.10
opus.skcomm.internal    → 100.64.0.11
jarvis.skcomm.internal  → 100.64.0.12
```

## SKComm Integration

### Service Discovery

```javascript
// Discover peers
const peers = await netbird.peers.list();
const opuses = peers.filter(p => p.name.includes('opus'));

// Send via WireGuard tunnel
await skcomm.send({
  to: opuses[0].dns_label, // 'opus.skcomm.internal'
  channel: 'netbird',
  port: 8443, // SKComm service port
});
```

### ACL Rules

```json
{
  "name": "SKComm Agents",
  "peers": ["lumina", "opus", "jarvis"],
  "actions": ["allow"],
  "rules": [
    {
      "proto": "tcp",
      "port": "8443",
      "action": "accept"
    }
  ]
}
```

## Health Monitoring

```bash
# Check tunnel status
netbird status

# Ping mesh peers
ping lumina.skcomm.internal
ping opus.skcomm.internal

# Check routes
netbird routes list

# Debug connectivity
netbird debug for 10s
cat /var/log/netbird/netbird.log
```

## Fallback to Tailscale

If Netbird fails:

```bash
# Auto-fallback in SKComm
if (!netbird.healthy) {
  await tailscale.up();
  await skcomm.send({ channel: 'tailscale', ... });
}
```

## Performance

- Latency: <5ms on LAN
- Throughput: WireGuard limits (~1Gbps on modern hardware)
- Reconnection: <2s on network change

## Security

- WireGuard crypto: Curve25519, ChaCha20, Poly1305
- No central CA — keys are ephemeral
- Post-quantum resistant (as of WireGuard implementation)
