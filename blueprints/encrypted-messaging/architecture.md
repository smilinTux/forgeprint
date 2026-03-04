# Encrypted Messaging (SKChat) Architecture Guide

## Overview
This document provides in-depth architectural guidance for implementing a production-grade encrypted messaging platform where AI agents are first-class participants. It covers the message processing pipeline, transport path selection, group encryption mechanics, voice communication setup, AI advocacy engine, plugin system, and the local-first storage architecture.

## Architectural Foundations

### 1. Core Architecture: Message Processing Pipeline

#### Message Processor
```python
import json
import zstandard
import gnupg
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from uuid import uuid4
from pydantic import BaseModel, Field
from typing import Protocol, Literal


class ContentType(str, Enum):
    TEXT = "text"
    VOICE = "voice"
    FILE = "file"
    SYSTEM = "system"
    PRESENCE = "presence"


class DeliveryStatus(str, Enum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"


class MessageEnvelope(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    sender: str
    recipient: str
    content_type: ContentType = ContentType.TEXT
    encrypted_payload: bytes = b""
    signature: bytes = b""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    in_reply_to: str | None = None
    thread_id: str | None = None
    delivery_status: DeliveryStatus = DeliveryStatus.QUEUED
    transport_path: str = ""
    compression: str = "none"
    size_bytes: int = 0


class MessageProcessor:
    """Pipeline: serialize -> compress -> encrypt -> sign -> envelope."""

    def __init__(
        self,
        gpg: gnupg.GPG,
        sender_fingerprint: str,
        compression_level: int = 3,
    ):
        self.gpg = gpg
        self.sender_fp = sender_fingerprint
        self.compressor = zstandard.ZstdCompressor(level=compression_level)
        self.decompressor = zstandard.ZstdDecompressor()

    def prepare_outgoing(
        self,
        recipient_fingerprint: str,
        content: str,
        content_type: ContentType = ContentType.TEXT,
        in_reply_to: str | None = None,
        thread_id: str | None = None,
    ) -> MessageEnvelope:
        """Prepare a message for sending: serialize, compress, encrypt, sign."""
        # Step 1: Serialize content to JSON
        payload = json.dumps({
            "text": content,
            "format": "markdown",
        }).encode("utf-8")

        # Step 2: Compress
        compressed = self.compressor.compress(payload)
        compression = "zstd" if len(compressed) < len(payload) else "none"
        final_payload = compressed if compression == "zstd" else payload

        # Step 3: Encrypt with recipient's PGP key
        encrypted = self.gpg.encrypt(
            final_payload,
            recipient_fingerprint,
            sign=self.sender_fp,
            armor=False,
        )
        if not encrypted.ok:
            raise RuntimeError(f"Encryption failed: {encrypted.status}")

        # Step 4: Create detached signature
        signature = self.gpg.sign(
            bytes(encrypted.data),
            keyid=self.sender_fp,
            detach=True,
            binary=True,
        )

        # Step 5: Build envelope
        return MessageEnvelope(
            sender=self.sender_fp,
            recipient=recipient_fingerprint,
            content_type=content_type,
            encrypted_payload=bytes(encrypted.data),
            signature=bytes(signature.data),
            compression=compression,
            size_bytes=len(encrypted.data),
            in_reply_to=in_reply_to,
            thread_id=thread_id,
        )

    def process_incoming(self, envelope: MessageEnvelope) -> dict:
        """Process a received message: verify, decrypt, decompress, deserialize."""
        # Step 1: Verify signature
        verified = self.gpg.verify(envelope.signature)
        if not verified.valid:
            raise RuntimeError(f"Invalid signature from {envelope.sender}")
        if verified.fingerprint != envelope.sender:
            raise RuntimeError("Sender fingerprint mismatch")

        # Step 2: Decrypt
        decrypted = self.gpg.decrypt(envelope.encrypted_payload)
        if not decrypted.ok:
            raise RuntimeError(f"Decryption failed: {decrypted.status}")

        # Step 3: Decompress
        raw = bytes(decrypted.data)
        if envelope.compression == "zstd":
            raw = self.decompressor.decompress(raw)

        # Step 4: Deserialize
        content = json.loads(raw.decode("utf-8"))
        content["_envelope_id"] = envelope.id
        content["_sender"] = envelope.sender
        content["_timestamp"] = envelope.timestamp.isoformat()
        content["_thread_id"] = envelope.thread_id

        return content
```

### 2. Transport Manager: SKComm Path Selection

#### Path Selection and Delivery
```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import asyncio
import logging
import time

logger = logging.getLogger("skchat.transport")


@dataclass
class DeliveryResult:
    success: bool
    transport_path: str
    latency_ms: float = 0.0
    error: str = ""


class TransportAdapter(ABC):
    """Base class for all SKComm transport paths."""

    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def send(self, envelope_bytes: bytes, recipient: str) -> DeliveryResult: ...

    @abstractmethod
    async def receive(self) -> list[bytes]: ...

    @abstractmethod
    def is_available(self) -> bool: ...

    @abstractmethod
    def latency_estimate(self) -> float: ...


class SyncthingTransport(TransportAdapter):
    """File-based async messaging via Syncthing shared folders."""

    def __init__(self, outbox_dir, inbox_dir):
        self.outbox = outbox_dir
        self.inbox = inbox_dir

    def name(self) -> str:
        return "syncthing"

    async def send(self, envelope_bytes: bytes, recipient: str) -> DeliveryResult:
        start = time.monotonic()
        filename = f"msg_{recipient[:8]}_{uuid4().hex[:8]}.enc"
        filepath = self.outbox / filename
        filepath.write_bytes(envelope_bytes)
        elapsed = (time.monotonic() - start) * 1000
        return DeliveryResult(
            success=True, transport_path="syncthing", latency_ms=elapsed
        )

    async def receive(self) -> list[bytes]:
        messages = []
        for msg_file in self.inbox.glob("msg_*.enc"):
            messages.append(msg_file.read_bytes())
            processed = self.inbox / "processed"
            processed.mkdir(exist_ok=True)
            msg_file.rename(processed / msg_file.name)
        return messages

    def is_available(self) -> bool:
        return self.outbox.exists() and self.inbox.exists()

    def latency_estimate(self) -> float:
        return 5.0  # Syncthing sync latency in seconds


class WebSocketTransport(TransportAdapter):
    """Persistent WebSocket connection to a relay server."""

    def __init__(self, relay_url: str):
        self.relay_url = relay_url
        self._ws = None

    def name(self) -> str:
        return "websocket"

    async def send(self, envelope_bytes: bytes, recipient: str) -> DeliveryResult:
        import websockets
        start = time.monotonic()
        try:
            if not self._ws:
                self._ws = await websockets.connect(self.relay_url)
            await self._ws.send(envelope_bytes)
            elapsed = (time.monotonic() - start) * 1000
            return DeliveryResult(
                success=True, transport_path="websocket", latency_ms=elapsed
            )
        except Exception as e:
            return DeliveryResult(
                success=False, transport_path="websocket", error=str(e)
            )

    async def receive(self) -> list[bytes]:
        if not self._ws:
            return []
        messages = []
        try:
            msg = await asyncio.wait_for(self._ws.recv(), timeout=0.1)
            messages.append(msg if isinstance(msg, bytes) else msg.encode())
        except asyncio.TimeoutError:
            pass
        return messages

    def is_available(self) -> bool:
        return self._ws is not None

    def latency_estimate(self) -> float:
        return 0.5


class PathSelectionStrategy(str, Enum):
    FASTEST = "fastest"
    MOST_PRIVATE = "most_private"
    MOST_RELIABLE = "most_reliable"
    ROUND_ROBIN = "round_robin"


# Privacy tier ranking for path selection
PRIVACY_TIERS = {
    "tor": 1,
    "i2p": 1,
    "veilid": 2,
    "yggdrasil": 2,
    "syncthing": 3,
    "wireguard": 3,
    "nostr": 4,
    "iroh": 4,
    "webrtc": 5,
    "websocket": 6,
    "http_poll": 7,
    "matrix": 7,
    "xmpp": 7,
}


class TransportManager:
    """Manage multiple transport paths with selection strategies."""

    def __init__(
        self,
        transports: list[TransportAdapter],
        strategy: PathSelectionStrategy = PathSelectionStrategy.FASTEST,
        fallback_chain: list[str] | None = None,
    ):
        self.transports = {t.name(): t for t in transports}
        self.strategy = strategy
        self.fallback_chain = fallback_chain or list(self.transports.keys())
        self._delivery_stats: dict[str, list[float]] = {}

    def _select_path(self) -> list[TransportAdapter]:
        """Select transport paths based on strategy."""
        available = [
            t for t in self.transports.values() if t.is_available()
        ]
        if not available:
            return []

        if self.strategy == PathSelectionStrategy.FASTEST:
            return sorted(available, key=lambda t: t.latency_estimate())

        if self.strategy == PathSelectionStrategy.MOST_PRIVATE:
            return sorted(
                available,
                key=lambda t: PRIVACY_TIERS.get(t.name(), 99),
            )

        if self.strategy == PathSelectionStrategy.MOST_RELIABLE:
            return sorted(
                available,
                key=lambda t: self._reliability_score(t.name()),
                reverse=True,
            )

        if self.strategy == PathSelectionStrategy.ROUND_ROBIN:
            # Simple round-robin from fallback chain
            for name in self.fallback_chain:
                if name in self.transports and self.transports[name].is_available():
                    return [self.transports[name]]
            return available[:1]

        return available

    def _reliability_score(self, path_name: str) -> float:
        """Calculate reliability score from delivery history."""
        stats = self._delivery_stats.get(path_name, [])
        if not stats:
            return 0.5  # Unknown reliability
        successes = sum(1 for s in stats[-100:] if s > 0)
        return successes / min(len(stats), 100)

    async def send(
        self, envelope_bytes: bytes, recipient: str
    ) -> DeliveryResult:
        """Send via selected transport path with fallback."""
        paths = self._select_path()
        if not paths:
            return DeliveryResult(
                success=False, transport_path="none", error="No transports available"
            )

        for transport in paths:
            result = await transport.send(envelope_bytes, recipient)
            # Track stats
            self._delivery_stats.setdefault(transport.name(), []).append(
                result.latency_ms if result.success else -1
            )
            if result.success:
                return result
            logger.warning(
                f"Transport {transport.name()} failed: {result.error}, "
                "trying next"
            )

        return DeliveryResult(
            success=False,
            transport_path="all",
            error="All transport paths failed",
        )

    async def send_concurrent(
        self, envelope_bytes: bytes, recipient: str, max_paths: int = 2
    ) -> list[DeliveryResult]:
        """Send via multiple paths simultaneously for reliability."""
        paths = self._select_path()[:max_paths]
        tasks = [t.send(envelope_bytes, recipient) for t in paths]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        delivery_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                delivery_results.append(
                    DeliveryResult(
                        success=False,
                        transport_path=paths[i].name(),
                        error=str(result),
                    )
                )
            else:
                delivery_results.append(result)
        return delivery_results

    async def receive_all(self) -> list[bytes]:
        """Poll all transports for incoming messages."""
        all_messages = []
        for transport in self.transports.values():
            if transport.is_available():
                try:
                    messages = await transport.receive()
                    all_messages.extend(messages)
                except Exception as e:
                    logger.error(
                        f"Receive error on {transport.name()}: {e}"
                    )
        return all_messages
```

### 3. Group Encryption: Per-Member Key Distribution

#### Group Key Manager
```python
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from datetime import datetime, timedelta


class GroupKeyManager:
    """Manage symmetric session keys for group message encryption."""

    def __init__(self, gpg: gnupg.GPG, own_fingerprint: str):
        self.gpg = gpg
        self.own_fp = own_fingerprint
        # room_id -> (session_key, created_at, encrypted_key_packets)
        self._session_keys: dict[str, tuple[bytes, datetime, dict]] = {}

    def generate_session_key(self, room_id: str, member_fingerprints: list[str]) -> dict:
        """Generate a new session key and encrypt it for each member."""
        session_key = os.urandom(32)  # AES-256
        key_packets = {}

        for member_fp in member_fingerprints:
            encrypted = self.gpg.encrypt(
                session_key,
                member_fp,
                sign=self.own_fp,
                armor=True,
            )
            if encrypted.ok:
                key_packets[member_fp] = str(encrypted)

        self._session_keys[room_id] = (session_key, datetime.utcnow(), key_packets)
        return key_packets

    def encrypt_group_message(self, room_id: str, plaintext: bytes) -> tuple[bytes, dict]:
        """Encrypt message with room's session key (AES-256-GCM)."""
        if room_id not in self._session_keys:
            raise RuntimeError(f"No session key for room {room_id}")

        session_key, _, key_packets = self._session_keys[room_id]
        nonce = os.urandom(12)
        aesgcm = AESGCM(session_key)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)

        # Return ciphertext (nonce prepended) and key packets
        return nonce + ciphertext, key_packets

    def decrypt_group_message(
        self, room_id: str, encrypted_data: bytes, key_packet: str | None = None
    ) -> bytes:
        """Decrypt a group message using the session key."""
        # If we have a key packet, decrypt the session key first
        if key_packet and room_id not in self._session_keys:
            decrypted_key = self.gpg.decrypt(key_packet)
            if decrypted_key.ok:
                session_key = bytes(decrypted_key.data)
                self._session_keys[room_id] = (
                    session_key, datetime.utcnow(), {}
                )

        if room_id not in self._session_keys:
            raise RuntimeError(f"Cannot decrypt: no session key for room {room_id}")

        session_key, _, _ = self._session_keys[room_id]
        nonce = encrypted_data[:12]
        ciphertext = encrypted_data[12:]
        aesgcm = AESGCM(session_key)
        return aesgcm.decrypt(nonce, ciphertext, None)

    def should_rotate(self, room_id: str, rotation_interval: timedelta) -> bool:
        """Check if room's session key needs rotation."""
        if room_id not in self._session_keys:
            return True
        _, created_at, _ = self._session_keys[room_id]
        return datetime.utcnow() - created_at > rotation_interval

    def rotate_key(self, room_id: str, member_fingerprints: list[str]) -> dict:
        """Rotate the session key for a room."""
        return self.generate_session_key(room_id, member_fingerprints)
```

### 4. Room Management: Participants and Permissions

#### Room Manager
```python
class ParticipantType(str, Enum):
    HUMAN = "human"
    AI = "ai"


class Participant(BaseModel):
    fingerprint: str
    display_name: str
    participant_type: ParticipantType
    capabilities: list[str] = ["speak", "listen"]
    tool_scope: list[str] = []
    presence: str = "offline"
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    joined_at: datetime = Field(default_factory=datetime.utcnow)


class Room(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    room_type: Literal["direct", "group", "broadcast"] = "direct"
    participants: list[Participant] = []
    encryption_algorithm: str = "pgp-e2e"
    max_participants: int = 100
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""


class RoomManager:
    """Manage chat rooms, participants, and permissions."""

    def __init__(self, storage: "MessageStorage", group_keys: GroupKeyManager):
        self.storage = storage
        self.group_keys = group_keys
        self.rooms: dict[str, Room] = {}
        self._load_rooms()

    def _load_rooms(self) -> None:
        """Load rooms from storage."""
        for room_data in self.storage.list_rooms():
            room = Room(**room_data)
            self.rooms[room.id] = room

    def create_room(
        self,
        name: str,
        room_type: str = "direct",
        creator_fingerprint: str = "",
        initial_participants: list[Participant] | None = None,
    ) -> Room:
        """Create a new chat room."""
        room = Room(
            name=name,
            room_type=room_type,
            created_by=creator_fingerprint,
            participants=initial_participants or [],
        )
        self.rooms[room.id] = room
        self.storage.save_room(room)

        # Generate group key if needed
        if room_type == "group" and room.participants:
            member_fps = [p.fingerprint for p in room.participants]
            self.group_keys.generate_session_key(room.id, member_fps)

        return room

    def add_participant(
        self,
        room_id: str,
        participant: Participant,
        added_by: str = "",
    ) -> bool:
        """Add a participant to a room."""
        room = self.rooms.get(room_id)
        if not room:
            return False

        if len(room.participants) >= room.max_participants:
            return False

        # Check for duplicate
        if any(p.fingerprint == participant.fingerprint for p in room.participants):
            return False

        room.participants.append(participant)
        self.storage.save_room(room)

        # Rotate group key to include new member
        if room.room_type == "group":
            member_fps = [p.fingerprint for p in room.participants]
            self.group_keys.rotate_key(room.id, member_fps)

        return True

    def remove_participant(self, room_id: str, fingerprint: str) -> bool:
        """Remove a participant from a room."""
        room = self.rooms.get(room_id)
        if not room:
            return False

        room.participants = [
            p for p in room.participants if p.fingerprint != fingerprint
        ]
        self.storage.save_room(room)

        # Rotate group key to exclude removed member
        if room.room_type == "group" and room.participants:
            member_fps = [p.fingerprint for p in room.participants]
            self.group_keys.rotate_key(room.id, member_fps)

        return True

    def get_participant_tools(self, room_id: str, fingerprint: str) -> list[str]:
        """Get the tool scope for a participant in a room."""
        room = self.rooms.get(room_id)
        if not room:
            return []
        for p in room.participants:
            if p.fingerprint == fingerprint:
                return p.tool_scope
        return []

    def update_presence(
        self, room_id: str, fingerprint: str, presence: str
    ) -> None:
        """Update a participant's presence status."""
        room = self.rooms.get(room_id)
        if not room:
            return
        for p in room.participants:
            if p.fingerprint == fingerprint:
                p.presence = presence
                p.last_seen = datetime.utcnow()
                break
        self.storage.save_room(room)
```

### 5. AI Advocacy Engine: Threat Screening and Response Suggestion

#### Advocacy Engine
```python
import re
from dataclasses import dataclass


@dataclass
class ScreenResult:
    allow: bool
    threat_type: str = ""
    confidence: float = 0.0
    reason: str = ""


@dataclass
class ResponseSuggestion:
    text: str
    confidence: float
    context: str


class AdvocacyEngine:
    """AI-powered message screening and user protection."""

    # Known phishing patterns
    PHISHING_PATTERNS = [
        r'(?:click|visit|go to)\s+(?:this|the)\s+link',
        r'(?:verify|confirm)\s+your\s+(?:account|identity|password)',
        r'(?:send|transfer)\s+(?:money|crypto|bitcoin|funds)',
        r'(?:urgent|immediate|limited time)\s+(?:action|response)',
        r'(?:won|winner|prize|lottery)',
    ]

    # Spam indicators
    SPAM_INDICATORS = [
        r'(?:buy|cheap|discount|offer|sale)\s+(?:now|today)',
        r'(?:unsubscribe|opt.?out)',
        r'(?:free|guaranteed|no.?risk)',
    ]

    def __init__(
        self,
        threat_sensitivity: str = "medium",
        auto_block_unknown: bool = False,
        trusted_fingerprints: set[str] | None = None,
    ):
        self.sensitivity = threat_sensitivity
        self.auto_block_unknown = auto_block_unknown
        self.trusted = trusted_fingerprints or set()

        # Sensitivity thresholds
        self.thresholds = {
            "low": 0.8,
            "medium": 0.5,
            "high": 0.3,
        }

    def screen_message(
        self, envelope: MessageEnvelope, decrypted_content: str
    ) -> ScreenResult:
        """Screen an incoming message for threats."""
        # Auto-approve from trusted senders
        if envelope.sender in self.trusted:
            return ScreenResult(allow=True)

        # Auto-block unknown senders if configured
        if self.auto_block_unknown and envelope.sender not in self.trusted:
            return ScreenResult(
                allow=False,
                threat_type="unknown_sender",
                confidence=1.0,
                reason="Auto-blocked: sender not in trusted list",
            )

        # Run threat detection
        threat_score = 0.0
        threat_types = []

        # Phishing detection
        for pattern in self.PHISHING_PATTERNS:
            if re.search(pattern, decrypted_content, re.IGNORECASE):
                threat_score += 0.3
                threat_types.append("phishing")

        # Spam detection
        for pattern in self.SPAM_INDICATORS:
            if re.search(pattern, decrypted_content, re.IGNORECASE):
                threat_score += 0.2
                threat_types.append("spam")

        # URL analysis
        urls = re.findall(r'https?://\S+', decrypted_content)
        if urls:
            for url in urls:
                if self._is_suspicious_url(url):
                    threat_score += 0.4
                    threat_types.append("suspicious_url")

        threat_score = min(threat_score, 1.0)
        threshold = self.thresholds.get(self.sensitivity, 0.5)

        if threat_score >= threshold:
            return ScreenResult(
                allow=False,
                threat_type=", ".join(set(threat_types)),
                confidence=threat_score,
                reason=f"Threat detected: {', '.join(set(threat_types))}",
            )

        return ScreenResult(allow=True)

    def _is_suspicious_url(self, url: str) -> bool:
        """Check if a URL looks suspicious."""
        suspicious_tlds = [".xyz", ".top", ".click", ".loan", ".gq"]
        url_lower = url.lower()
        return any(tld in url_lower for tld in suspicious_tlds)

    def suggest_response(
        self, conversation: list[dict], max_suggestions: int = 3
    ) -> list[ResponseSuggestion]:
        """Generate response suggestions based on conversation context."""
        if not conversation:
            return []

        last_message = conversation[-1].get("text", "")
        suggestions = []

        # Simple pattern-based suggestions
        # In production, use a local LLM for context-aware suggestions
        if "?" in last_message:
            # Question detected
            suggestions.append(ResponseSuggestion(
                text="Let me look into that and get back to you.",
                confidence=0.6,
                context="question_detected",
            ))

        if any(word in last_message.lower() for word in ["thanks", "thank you"]):
            suggestions.append(ResponseSuggestion(
                text="You're welcome!",
                confidence=0.8,
                context="gratitude_response",
            ))

        if any(word in last_message.lower() for word in ["meeting", "call", "schedule"]):
            suggestions.append(ResponseSuggestion(
                text="I'm available. What time works for you?",
                confidence=0.5,
                context="scheduling",
            ))

        return suggestions[:max_suggestions]

    def summarize_missed(self, messages: list[dict]) -> str:
        """Generate a summary of missed messages."""
        if not messages:
            return "No missed messages."

        senders = set()
        topics = []
        for msg in messages:
            senders.add(msg.get("_sender", "unknown")[:8])
            text = msg.get("text", "")
            if len(text) > 50:
                topics.append(text[:50] + "...")

        summary = f"You have {len(messages)} missed message(s) "
        summary += f"from {len(senders)} sender(s)."
        if topics:
            summary += f" Topics include: {'; '.join(topics[:3])}"
        return summary
```

### 6. Voice Communication: WebRTC with TTS/STT

#### Voice Manager
```python
import asyncio
from dataclasses import dataclass
from pathlib import Path


@dataclass
class VoiceConfig:
    tts_model_dir: Path
    tts_voice: str = "en_US-lessac-medium"
    stt_model: str = "base"
    sample_rate: int = 48000
    codec: str = "opus"


class VoiceManager:
    """Manage WebRTC voice sessions with Piper TTS and Whisper STT."""

    def __init__(self, config: VoiceConfig):
        self.config = config
        self._active_sessions: dict[str, dict] = {}
        self._tts_engine = None
        self._stt_engine = None

    def _init_tts(self):
        """Lazy-load Piper TTS engine."""
        if self._tts_engine is None:
            try:
                from piper import PiperVoice
                model_path = (
                    self.config.tts_model_dir / f"{self.config.tts_voice}.onnx"
                )
                self._tts_engine = PiperVoice.load(str(model_path))
            except ImportError:
                logger.warning("Piper TTS not available")

    def _init_stt(self):
        """Lazy-load Whisper STT engine."""
        if self._stt_engine is None:
            try:
                import whisper
                self._stt_engine = whisper.load_model(self.config.stt_model)
            except ImportError:
                logger.warning("Whisper STT not available")

    def synthesize_speech(self, text: str, voice: str | None = None) -> bytes:
        """Convert text to audio using Piper TTS."""
        self._init_tts()
        if self._tts_engine is None:
            return b""

        import io
        import wave

        audio_buffer = io.BytesIO()
        with wave.open(audio_buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)  # 16-bit
            wav.setframerate(self._tts_engine.config.sample_rate)

            for audio_bytes in self._tts_engine.synthesize_stream_raw(text):
                wav.writeframes(audio_bytes)

        return audio_buffer.getvalue()

    def transcribe_audio(
        self, audio_bytes: bytes, language: str | None = None
    ) -> str:
        """Convert audio to text using Whisper STT."""
        self._init_stt()
        if self._stt_engine is None:
            return ""

        import numpy as np
        import tempfile

        # Write audio to temp file for Whisper
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_bytes)
            temp_path = f.name

        result = self._stt_engine.transcribe(
            temp_path,
            language=language,
        )
        Path(temp_path).unlink(missing_ok=True)

        return result.get("text", "").strip()

    async def create_webrtc_offer(self, room_id: str) -> dict:
        """Create a WebRTC offer for voice call initiation."""
        try:
            from aiortc import RTCPeerConnection, RTCSessionDescription
            from aiortc.contrib.media import MediaPlayer, MediaRecorder

            pc = RTCPeerConnection()

            # Add audio track
            audio_track = self._create_audio_track()
            if audio_track:
                pc.addTrack(audio_track)

            # Create offer
            offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            self._active_sessions[room_id] = {
                "peer_connection": pc,
                "started_at": datetime.utcnow(),
            }

            return {
                "type": offer.type,
                "sdp": offer.sdp,
                "session_id": room_id,
            }
        except ImportError:
            logger.error("aiortc not available for WebRTC")
            return {"error": "WebRTC not available"}

    async def handle_webrtc_answer(self, room_id: str, answer: dict) -> bool:
        """Handle a WebRTC answer from the remote peer."""
        session = self._active_sessions.get(room_id)
        if not session:
            return False

        try:
            from aiortc import RTCSessionDescription
            pc = session["peer_connection"]
            await pc.setRemoteDescription(
                RTCSessionDescription(
                    type=answer["type"],
                    sdp=answer["sdp"],
                )
            )
            return True
        except Exception as e:
            logger.error(f"WebRTC answer handling failed: {e}")
            return False

    async def end_call(self, room_id: str) -> None:
        """End a voice call and cleanup resources."""
        session = self._active_sessions.pop(room_id, None)
        if session and "peer_connection" in session:
            await session["peer_connection"].close()

    def _create_audio_track(self):
        """Create an audio track from microphone or synthesized audio."""
        # In production, this would interface with the system audio
        return None
```

### 7. Local-First Storage: Encrypted SQLite

#### Message Storage Engine
```python
import sqlite3
import json
from pathlib import Path
from datetime import datetime


class MessageStorage:
    """Encrypted SQLite storage for messages, rooms, and participants."""

    SCHEMA = """
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'text',
        encrypted_payload BLOB NOT NULL,
        signature BLOB NOT NULL,
        timestamp TEXT NOT NULL,
        in_reply_to TEXT,
        thread_id TEXT,
        delivery_status TEXT NOT NULL DEFAULT 'queued',
        transport_path TEXT DEFAULT '',
        compression TEXT DEFAULT 'none',
        size_bytes INTEGER DEFAULT 0,
        decrypted_content TEXT  -- Stored for FTS, encrypted DB provides protection
    );

    CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        room_type TEXT NOT NULL DEFAULT 'direct',
        participants TEXT NOT NULL DEFAULT '[]',
        encryption_algorithm TEXT DEFAULT 'pgp-e2e',
        max_participants INTEGER DEFAULT 100,
        created_at TEXT NOT NULL,
        created_by TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS offline_queue (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        envelope_bytes BLOB NOT NULL,
        created_at TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        last_retry TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        decrypted_content, sender, room_id,
        content=messages, content_rowid=rowid
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_offline_recipient ON offline_queue(recipient);
    """

    def __init__(self, db_path: Path):
        self.db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(db_path))
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(self.SCHEMA)

    def store_message(
        self, envelope: MessageEnvelope, decrypted_content: str = ""
    ) -> None:
        """Store a message envelope with optional decrypted content for search."""
        self._conn.execute(
            """INSERT OR REPLACE INTO messages
            (id, room_id, sender, content_type, encrypted_payload,
             signature, timestamp, in_reply_to, thread_id,
             delivery_status, transport_path, compression,
             size_bytes, decrypted_content)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                envelope.id,
                envelope.recipient,  # room_id for direct = recipient
                envelope.sender,
                envelope.content_type.value,
                envelope.encrypted_payload,
                envelope.signature,
                envelope.timestamp.isoformat(),
                envelope.in_reply_to,
                envelope.thread_id,
                envelope.delivery_status.value,
                envelope.transport_path,
                envelope.compression,
                envelope.size_bytes,
                decrypted_content,
            ),
        )
        self._conn.commit()

    def get_room_history(
        self, room_id: str, limit: int = 50, before: str | None = None
    ) -> list[dict]:
        """Load message history for a room."""
        if before:
            rows = self._conn.execute(
                """SELECT * FROM messages WHERE room_id = ? AND timestamp < ?
                ORDER BY timestamp DESC LIMIT ?""",
                (room_id, before, limit),
            ).fetchall()
        else:
            rows = self._conn.execute(
                """SELECT * FROM messages WHERE room_id = ?
                ORDER BY timestamp DESC LIMIT ?""",
                (room_id, limit),
            ).fetchall()
        return [dict(row) for row in reversed(rows)]

    def search_messages(self, query: str, limit: int = 20) -> list[dict]:
        """Full-text search across decrypted message content."""
        rows = self._conn.execute(
            """SELECT m.* FROM messages m
            JOIN messages_fts fts ON m.rowid = fts.rowid
            WHERE messages_fts MATCH ?
            ORDER BY rank LIMIT ?""",
            (query, limit),
        ).fetchall()
        return [dict(row) for row in rows]

    def queue_offline_message(
        self, recipient: str, envelope_bytes: bytes
    ) -> str:
        """Queue a message for offline delivery."""
        msg_id = str(uuid4())
        self._conn.execute(
            """INSERT INTO offline_queue (id, recipient, envelope_bytes, created_at)
            VALUES (?, ?, ?, ?)""",
            (msg_id, recipient, envelope_bytes, datetime.utcnow().isoformat()),
        )
        self._conn.commit()
        return msg_id

    def get_offline_queue(self, recipient: str) -> list[dict]:
        """Get all queued messages for a recipient."""
        rows = self._conn.execute(
            """SELECT * FROM offline_queue WHERE recipient = ?
            ORDER BY created_at ASC""",
            (recipient,),
        ).fetchall()
        return [dict(row) for row in rows]

    def remove_from_queue(self, msg_id: str) -> None:
        """Remove a delivered message from the offline queue."""
        self._conn.execute(
            "DELETE FROM offline_queue WHERE id = ?", (msg_id,)
        )
        self._conn.commit()

    def update_delivery_status(
        self, message_id: str, status: str
    ) -> None:
        """Update delivery status for a message."""
        self._conn.execute(
            "UPDATE messages SET delivery_status = ? WHERE id = ?",
            (status, message_id),
        )
        self._conn.commit()

    def save_room(self, room: Room) -> None:
        """Save or update a room."""
        participants_json = json.dumps(
            [p.model_dump(mode="json") for p in room.participants]
        )
        self._conn.execute(
            """INSERT OR REPLACE INTO rooms
            (id, name, room_type, participants, encryption_algorithm,
             max_participants, created_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                room.id, room.name, room.room_type,
                participants_json, room.encryption_algorithm,
                room.max_participants,
                room.created_at.isoformat(), room.created_by,
            ),
        )
        self._conn.commit()

    def list_rooms(self) -> list[dict]:
        """List all rooms."""
        rows = self._conn.execute("SELECT * FROM rooms").fetchall()
        rooms = []
        for row in rows:
            room_dict = dict(row)
            room_dict["participants"] = json.loads(room_dict["participants"])
            rooms.append(room_dict)
        return rooms

    def apply_retention(self, retention_days: int) -> int:
        """Delete messages older than retention period."""
        cutoff = (
            datetime.utcnow() - timedelta(days=retention_days)
        ).isoformat()
        cursor = self._conn.execute(
            "DELETE FROM messages WHERE timestamp < ?", (cutoff,)
        )
        self._conn.commit()
        return cursor.rowcount

    def close(self) -> None:
        self._conn.close()
```

### 8. Plugin System: Dynamic Extension Loading

#### Plugin Manager
```python
import importlib
import importlib.util
from pathlib import Path
from dataclasses import dataclass


@dataclass
class PluginInfo:
    name: str
    version: str
    module: object
    instance: object


class SKChatPlugin(Protocol):
    """Interface that all SKChat plugins must implement."""

    def name(self) -> str: ...
    def version(self) -> str: ...

    def on_message_received(self, envelope: MessageEnvelope) -> MessageEnvelope | None:
        return envelope  # Pass through by default

    def on_message_sending(self, envelope: MessageEnvelope) -> MessageEnvelope | None:
        return envelope

    def on_participant_joined(self, room: Room, participant: Participant) -> None:
        pass

    def on_participant_left(self, room: Room, participant: Participant) -> None:
        pass

    def on_room_created(self, room: Room) -> None:
        pass

    def mcp_tools(self) -> list[dict]:
        return []


class PluginManager:
    """Discover, load, and dispatch hooks to SKChat plugins."""

    def __init__(self, plugin_dir: Path, sandbox: bool = True):
        self.plugin_dir = plugin_dir
        self.sandbox = sandbox
        self.plugins: dict[str, PluginInfo] = {}
        self.plugin_dir.mkdir(parents=True, exist_ok=True)

    def discover_and_load(self) -> list[str]:
        """Discover and load all plugins from the plugin directory."""
        loaded = []

        for plugin_path in self.plugin_dir.glob("*/plugin.py"):
            try:
                plugin_name = plugin_path.parent.name
                spec = importlib.util.spec_from_file_location(
                    f"skchat_plugin_{plugin_name}", str(plugin_path)
                )
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)

                    # Look for a Plugin class
                    plugin_class = getattr(module, "Plugin", None)
                    if plugin_class:
                        instance = plugin_class()
                        self.plugins[plugin_name] = PluginInfo(
                            name=instance.name(),
                            version=instance.version(),
                            module=module,
                            instance=instance,
                        )
                        loaded.append(plugin_name)
                        logger.info(
                            f"Loaded plugin: {plugin_name} v{instance.version()}"
                        )
            except Exception as e:
                logger.error(f"Failed to load plugin {plugin_path}: {e}")

        return loaded

    def dispatch_message_received(
        self, envelope: MessageEnvelope
    ) -> MessageEnvelope | None:
        """Dispatch to all plugins. Any plugin returning None blocks the message."""
        current = envelope
        for plugin_info in self.plugins.values():
            result = plugin_info.instance.on_message_received(current)
            if result is None:
                logger.info(
                    f"Plugin {plugin_info.name} blocked message {envelope.id}"
                )
                return None
            current = result
        return current

    def dispatch_message_sending(
        self, envelope: MessageEnvelope
    ) -> MessageEnvelope | None:
        """Dispatch to all plugins before sending."""
        current = envelope
        for plugin_info in self.plugins.values():
            result = plugin_info.instance.on_message_sending(current)
            if result is None:
                return None
            current = result
        return current

    def dispatch_participant_joined(
        self, room: Room, participant: Participant
    ) -> None:
        for plugin_info in self.plugins.values():
            try:
                plugin_info.instance.on_participant_joined(room, participant)
            except Exception as e:
                logger.error(
                    f"Plugin {plugin_info.name} error on participant_joined: {e}"
                )

    def collect_mcp_tools(self) -> list[dict]:
        """Collect MCP tool definitions from all plugins."""
        tools = []
        for plugin_info in self.plugins.values():
            try:
                plugin_tools = plugin_info.instance.mcp_tools()
                tools.extend(plugin_tools)
            except Exception as e:
                logger.error(
                    f"Plugin {plugin_info.name} error collecting tools: {e}"
                )
        return tools
```

## Performance Optimization Strategies

### 1. Message Batching for Group Delivery
```python
class MessageBatcher:
    """Batch multiple messages for efficient group delivery."""

    def __init__(self, max_batch: int = 50, flush_interval: float = 0.1):
        self.max_batch = max_batch
        self.flush_interval = flush_interval
        self._buffer: dict[str, list[bytes]] = {}  # recipient -> messages

    def add(self, recipient: str, envelope_bytes: bytes) -> list[bytes] | None:
        self._buffer.setdefault(recipient, []).append(envelope_bytes)
        if len(self._buffer[recipient]) >= self.max_batch:
            return self.flush(recipient)
        return None

    def flush(self, recipient: str) -> list[bytes]:
        messages = self._buffer.pop(recipient, [])
        return messages
```

### 2. Connection Pooling for Transport
```python
class TransportConnectionPool:
    """Reuse transport connections across message sends."""

    def __init__(self, max_per_transport: int = 5):
        self.max_per = max_per_transport
        self._pools: dict[str, list] = {}

    def get(self, transport_name: str):
        pool = self._pools.get(transport_name, [])
        if pool:
            return pool.pop()
        return None

    def put(self, transport_name: str, conn):
        pool = self._pools.setdefault(transport_name, [])
        if len(pool) < self.max_per:
            pool.append(conn)
```

### 3. Lazy Decryption for Message History
```python
class LazyDecryptedMessage:
    """Decrypt messages on-demand when content is accessed."""

    def __init__(self, envelope: MessageEnvelope, gpg: gnupg.GPG):
        self._envelope = envelope
        self._gpg = gpg
        self._decrypted: str | None = None

    @property
    def content(self) -> str:
        if self._decrypted is None:
            result = self._gpg.decrypt(self._envelope.encrypted_payload)
            self._decrypted = str(result) if result.ok else "[decryption failed]"
        return self._decrypted
```

## Deployment Patterns

### 1. Desktop Application
```yaml
deployment:
  type: desktop
  ui: "qt"
  transport:
    primary: "syncthing"
    fallback: ["websocket", "http_poll"]
  storage:
    database: "~/.skchat/messages.db"
    media_cache: "~/.skchat/media/"
  voice:
    enabled: true
    tts: "piper"
    stt: "whisper"
```

### 2. CLI Agent
```yaml
deployment:
  type: cli
  ui: "textual"
  transport:
    primary: "syncthing"
    fallback: ["websocket"]
  storage:
    database: "~/.skchat/messages.db"
  voice:
    enabled: false
```

### 3. Headless AI Agent
```yaml
deployment:
  type: headless
  ui: "none"
  transport:
    primary: "syncthing"
    concurrent: true
  storage:
    database: "~/.skchat/messages.db"
  voice:
    tts: "piper"  # AI can speak
    stt: "whisper"  # AI can listen
  advocacy:
    enabled: true
    auto_respond: true
```

## Security Architecture

### 1. Message Encryption Pipeline
```python
class EncryptionPipeline:
    """Full encryption pipeline for outgoing messages."""

    def __init__(self, gpg: gnupg.GPG, sender_fp: str):
        self.gpg = gpg
        self.sender_fp = sender_fp

    def encrypt_direct(self, plaintext: bytes, recipient_fp: str) -> tuple[bytes, bytes]:
        """Encrypt for a single recipient with PGP."""
        encrypted = self.gpg.encrypt(
            plaintext, recipient_fp, sign=self.sender_fp, armor=False
        )
        signature = self.gpg.sign(
            bytes(encrypted.data), keyid=self.sender_fp, detach=True, binary=True
        )
        return bytes(encrypted.data), bytes(signature.data)

    def encrypt_group(
        self, plaintext: bytes, session_key: bytes
    ) -> bytes:
        """Encrypt with symmetric session key for group messages."""
        nonce = os.urandom(12)
        aesgcm = AESGCM(session_key)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        return nonce + ciphertext
```

This comprehensive architecture guide provides the foundation for implementing a sovereign encrypted messaging platform where AI agents are first-class participants, messages are end-to-end encrypted, transport is decentralized across 17 paths, and an AI advocacy engine protects every user.
