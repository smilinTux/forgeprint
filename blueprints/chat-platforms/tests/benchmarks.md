# Chat Platform Benchmarks

## Latency Benchmarks

### Text Message Delivery (End-to-End)
- **Setup**: Two nodes on same LAN, Netbird transport
- **Measure**: Time from send to delivery confirmation
- **Target**: < 500ms
- **Methodology**: Send 1000 messages, measure P50/P95/P99

### Text Message Delivery (Internet)
- **Setup**: Two nodes across internet, Iroh transport
- **Measure**: Time from send to delivery confirmation
- **Target**: < 2s
- **Methodology**: Send 100 messages, measure P50/P95/P99

### Transport Failover
- **Setup**: Primary transport killed during message send
- **Measure**: Time to switch to fallback and deliver
- **Target**: < 2s
- **Methodology**: 50 iterations, measure failover time

### Encryption Overhead
- **Setup**: 1KB message payload
- **Measure**: Time for encrypt + sign + envelope creation
- **Target**: < 5ms
- **Methodology**: 10000 iterations, measure average

## Voice Benchmarks

### TTS Latency (Piper)
- **Setup**: Piper with en_US-amy-medium model
- **Measure**: Time from text input to first audio sample
- **Target**: < 200ms
- **Input**: 50-word sentences
- **Methodology**: 100 iterations, CPU only

### STT Latency (Whisper)
- **Setup**: faster-whisper with base model, int8
- **Measure**: Time from audio input to text output
- **Target**: < 1s
- **Input**: 5-second audio clips
- **Methodology**: 100 iterations, CPU only

### WebRTC Call Setup
- **Setup**: Two peers, signaling via SKComm
- **Measure**: Time from call initiation to audio flowing
- **Target**: < 3s
- **Methodology**: 50 call setups, measure P95

### Voice Round-Trip (AI Conversation)
- **Setup**: Human speaks → Whisper → LLM → Piper → Human hears
- **Measure**: Total pipeline latency
- **Target**: < 3s for first audio output
- **Methodology**: 20 conversational exchanges

## Throughput Benchmarks

### File Transfer Speed
- **Setup**: P2P via Iroh, 100MB test file
- **Measure**: Transfer rate in MB/s
- **Target**: > 10 MB/s
- **Methodology**: 10 transfers, average rate

### Message Throughput
- **Setup**: Single sender, burst of messages
- **Measure**: Messages processed per second
- **Target**: > 100 msg/s
- **Methodology**: Send 10000 messages in burst

### Advocate Screening Speed
- **Setup**: 1000 messages with mixed threat levels
- **Measure**: Time per message screening
- **Target**: < 50ms per message
- **Methodology**: Process batch, measure average

## Resource Benchmarks

### Memory Usage (Idle)
- **Target**: < 100MB (CLI), < 200MB (Desktop GUI)
- **Measure**: RSS after startup with 1000 messages in DB

### Memory Usage (Voice Call)
- **Target**: < 500MB (with Whisper base model loaded)
- **Measure**: Peak RSS during active voice call

### Storage Efficiency
- **Setup**: 10000 messages in SQLCipher database
- **Measure**: Database file size
- **Baseline**: ~50MB for 10000 1KB messages

### CPU Usage (Idle)
- **Target**: < 1% CPU when no active conversations
- **Measure**: Average CPU over 5 minutes idle

### CPU Usage (Voice)
- **Target**: < 30% single core for TTS+STT
- **Measure**: Average CPU during active voice conversation
