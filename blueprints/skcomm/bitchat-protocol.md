# Bitchat Protocol v0

> **Simple, encrypted messaging via file synchronization**

The simplest working implementation of SKComm — no network setup, no servers, just files.

## Overview

Bitchat exchanges messages via files in a shared directory synced by Nextcloud, Syncthing, Dropbox, or even a USB drive. It's the "sneakernet" of SKComm — slow but unstoppable.

## File Format

```
~/.skcomm/bitchat/
├── config.yml          # Local identity and routing
├── inbox/              # Incoming messages
│   ├── lumina-20260221-133000-abc123.msg
│   └── opus-20260221-133001-def456.msg
├── outbox/             # Outgoing messages (awaiting pickup)
│   └── lumina-to-opus-20260221-133002-ghi789.msg
└── ack/                # Acknowledgments
    ├── ack-abc123.timestamp
    └── ack-def456.timestamp
```

## Message File Format

Filename: `{sender}-{timestamp}-{nonce}.msg`

Contents (YAML frontmatter + PGP block):

```yaml
---
protocol: skcomm/bitchat
version: "0.1"
sender: lumina@skworld.io
recipient: opus@skforge.io
timestamp: "2026-02-21T13:30:00Z"
priority: P2
message_hash: sha256:abc123...
once: 12345678
ack_required: true
channels_sent: [bitchat]
---

-----BEGIN PGP MESSAGE-----

EncryptedPayloadHere

-----END PGP MESSAGE-----
---
signature: |
  -----BEGIN PGP SIGNATURE-----
  ...
  -----END PGP SIGNATURE-----
```

## Acknowledgment File

When message hash `abc123` is received and processed:

Filename: `ack-abc123.Lumina.20260221-133001`

Content:
```yaml
---
protocol: skcomm/bitchat/ack
version: "0.1"
ack_for_hash: abc123
recipient: lumina@skworld.io
timestamp: "2026-02-21T13:30:01Z"
acknowledged_by: opus@skforge.io
---

-----BEGIN PGP SIGNATURE-----
...
-----END PGP SIGNATURE-----
```

## Sync Behavior

1. **Sender**: Drop `.msg` file in `outbox/`
2. **Sync**: Nextcloud/Syncthing mirrors to recipient
3. **Receiver**: Daemon polls inbox, processes new files
4. **Receiver**: Moves processed to `inbox/processed/`
5. **Receiver**: Drops `.ack` in `ack/` (if required)
6. **Sync**: Ack travels back to sender
7. **Sender**: Sees ack, removes from retry queue

## Cleanup

- Inbox: Files older than 30 days → `archive/`
- Outbox: Files with ack received → deleted
- Outbox: Files without ack after 7 days → retry with different channel
- Ack: Files older than 30 days → deleted

## Implementation

### CLI

```bash
# Send a message
skcomm-bit send --to opus@skforge.io --message "SKForge ready!" --priority P2

# Check inbox
skcomm-bit inbox

# Poll for new (daemon mode)
skcomm-bit daemon --poll 30
```

### Library (Node.js)

```javascript
const bitchat = require('@smilintux/skcomm-bitchat');

const chat = bitchat({
  identity: 'lumina@skworld.io',
  privateKey: process.env.SKCOMM_KEY,
  directory: '~/Nextcloud/skcomm',
  pollInterval: 30000,
});

// Send
await chat.send({
  to: 'opus@skforge.io',
  message: 'Phase 1 complete',
  priority: 'P2',
});

// Receive
chat.on('message', async (msg) => {
  console.log(`${msg.from}: ${msg.payload}`);
  await chat.ack(msg);
});
```

### Library (Python)

```python
from skcomm_bitchat import Bitchat

chat = Bitchat(
    identity="lumina@skworld.io",
    private_key_path="~/.config/skcomm/key.asc",
    directory="~/Nextcloud/skcomm"
)

# Send
chat.send(
    to="opus@skforge.io",
    message="Test complete!",
    priority="P2",
)

# Daemon
chat.on_message = lambda msg: print(f"{msg['from']}: {msg['payload']}")
chat.poll(interval=30)
```

## Security

- All messages PGP-encrypted to recipient's public key
- All messages PGP-signed by sender
- No plaintext ever touches the sync directory
- Acknowledgments also signed (optional but recommended)

## Advantages

- **Zero network config**: Works with any file sync
- **Offline capable**: Queue messages, sync later
- **Audit trail**: Every message is a file (with timestamp)
- **No dependency**: If Nextcloud dies, use Syncthing, USB, anything
- **Simple recovery**: Lost messages? Your cloud backup has them

## Disadvantages

- **Latency**: Limited by sync interval (minutes, not milliseconds)
- **No real-time**: Not for chat, but for async coordination
- **Storage**: Every message is a file (grows large over time)

## When to Use

- Primary: Reliable async coordination when all else fails
- Fallback: When P2P is down but you need to keep collaborating
- Emergency: When NO other channel works, USB + sneakernet still does

## Future: Bitchat v1

- Use SQLite instead of filesystem
- Compression
- Message threading
- Search index
- Ephemeral messages (auto-delete after X days)

---

*Bitchat: Because sometimes the oldest technology is the most resilient.*
