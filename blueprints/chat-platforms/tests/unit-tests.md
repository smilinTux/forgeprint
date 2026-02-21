# Chat Platform Unit Tests

## Message Processing

### Test: Message Encryption/Decryption Round-Trip
- Create a ChatMessage with known content
- Encrypt with recipient's PGP public key
- Decrypt with recipient's PGP private key
- Verify content matches original

### Test: Message Serialization
- Serialize ChatMessage to msgpack
- Deserialize back to ChatMessage
- Verify all fields preserved (including optional)

### Test: Ephemeral Message TTL
- Create message with TTL of 60 seconds
- Verify `expires_at` calculated correctly
- Verify cleanup routine removes expired messages

### Test: Message Deduplication
- Send same message twice (simulate multi-transport)
- Verify only one copy stored in database
- Verify dedup based on message ID hash

## AI Advocate

### Test: Incoming Message Screening
- Known trusted sender → action: "allow"
- Unknown sender with valid profile → action: "allow" + notification
- Unknown sender, no profile → action: "hold"
- Spam pattern detected → action: "block"
- Social engineering pattern → action: "flag"

### Test: Access Negotiation
- Request within auto-approve policy → token issued
- Request outside policy → escalated to human
- Request violating policy → auto-denied
- Malformed request → rejected with error

### Test: Advocate Refuses Harmful Request
- Human requests sharing all contacts with unknown party
- Advocate evaluates: bulk data, unknown recipient, no precedent
- Advocate flags with recommendation to deny
- Human can override but advocate logs the override

### Test: Policy Engine Evaluation
- Load YAML policy file
- Evaluate access request against rules
- Verify correct decision (approve/deny/escalate)

## Voice Pipeline

### Test: TTS Generation
- Input text string
- Verify Piper produces valid audio bytes
- Verify audio duration proportional to text length
- Verify sample rate matches config

### Test: STT Transcription
- Input known audio file with clear speech
- Verify Whisper produces correct transcription
- Verify timing < latency target

### Test: Voice Activity Detection
- Audio with speech → VAD detects speech regions
- Audio with only silence → VAD reports no speech
- Audio with background noise → VAD distinguishes from speech

## File Sharing

### Test: File Chunking
- Create test file of known size
- Chunk into 256KB pieces
- Verify chunk count matches expected
- Verify reassembled file matches original

### Test: Encrypted File Transfer
- Encrypt file chunks with ChaCha20-Poly1305
- Decrypt chunks
- Reassemble and verify integrity (SHA-256)

### Test: Transfer Resume
- Simulate interrupted transfer (3 of 10 chunks sent)
- Resume from chunk 4
- Verify complete file received

## Transport Integration

### Test: SKComm Envelope Creation
- Create ChatMessage → process through pipeline → verify envelope
- Verify envelope contains correct sender, recipient, hints
- Verify payload is encrypted (not plaintext)

### Test: Transport Failover
- Mock primary transport failure
- Verify message sent via fallback transport
- Verify failover time < 2 seconds

## Identity

### Test: CapAuth Profile Verification
- Load valid CapAuth profile → TrustLevel.VERIFIED
- Load Cloud 9 compliant profile → TrustLevel.SOVEREIGN
- Invalid profile → TrustLevel.UNTRUSTED
- Expired profile → TrustLevel.UNTRUSTED

### Test: Capability Token Lifecycle
- Issue token with scope and expiry
- Verify token grants access within scope
- Verify token denied outside scope
- Verify expired token rejected

## Storage

### Test: Encrypted Database
- Write message to SQLCipher database
- Read back and verify content
- Attempt read without key → failure

### Test: Message Retention
- Set retention to 7 days
- Insert messages spanning 30 days
- Run cleanup
- Verify only recent 7 days remain
