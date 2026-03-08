# AI Chat Platform Blueprint
> ChatGPT / Claude / Perplexity alternative

## Overview
Conversational AI platform with multi-model support, streaming responses, conversation history, RAG (Retrieval Augmented Generation), tool use, and a plugin/function-calling system. Serves both consumer chat and API access.

## Market Analysis
| Platform | Users | Pricing | Key Differentiator |
|----------|-------|---------|-------------------|
| ChatGPT | 200M+ | Free/$20/$200 | GPT-4o, plugins, DALL-E |
| Claude | 10M+ | Free/$20/$100 | Long context, safety |
| Perplexity | 15M+ | Free/$20 | Search-grounded answers |
| Poe | 5M+ | Free/$20 | Multi-model aggregator |
| HuggingChat | 1M+ | Free | Open-source models |

## Core Concepts
- **Conversations**: Threaded message history with system/user/assistant roles
- **Streaming**: Token-by-token response via SSE (Server-Sent Events)
- **Multi-model**: Route to different LLMs (OpenAI, Anthropic, local Ollama, etc.)
- **RAG**: Retrieve relevant documents before generating (knowledge base)
- **Tool/Function Calling**: LLM can invoke tools (search, code exec, API calls)
- **Prompt Templates**: System prompts, personas, custom instructions
- **Usage Tracking**: Token counting, rate limiting, billing per usage

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 Frontend (React/Next.js)           │
│  Chat UI │ Model Selector │ File Upload │ Settings │
├──────────────────────────────────────────────────┤
│                 API Gateway                        │
├──────────┬───────────┬────────────┬──────────────┤
│  Chat    │  Model    │  RAG       │  Tool        │
│  Service │  Router   │  Pipeline  │  Executor    │
├──────────┴───────────┴────────────┴──────────────┤
│              Model Providers                       │
│  ┌────────┐ ┌────────┐ ┌──────┐ ┌─────────────┐ │
│  │ OpenAI │ │Anthropic│ │Ollama│ │ HuggingFace │ │
│  └────────┘ └────────┘ └──────┘ └─────────────┘ │
├──────────────────────────────────────────────────┤
│  PostgreSQL │ Redis │ Vector DB │ S3 │ Queue     │
└──────────────────────────────────────────────────┘
```

### Data Model
```sql
users (id, email, name, plan, custom_instructions, usage_json)
api_keys (id, user_id, key_hash, name, scopes, rate_limit, created_at)

conversations (id, user_id, title, model, system_prompt, created_at, updated_at)
messages (id, conversation_id, role, content, model, tokens_in, tokens_out, 
          tool_calls_json, attachments_json, created_at)
-- role: system | user | assistant | tool
-- tool_calls_json: [{id, name, arguments, result}]

-- RAG
knowledge_bases (id, user_id, name, embedding_model)
documents (id, kb_id, filename, content_hash, chunk_count, status)
chunks (id, document_id, content, embedding vector(1536), metadata_json)

-- Usage
usage_records (id, user_id, model, tokens_in, tokens_out, cost_usd, created_at)
```

### Chat Completion Flow
```
User Message
  → Authenticate + rate limit check
  → Load conversation history (last N messages)
  → If RAG enabled:
      → Embed user query
      → Vector search knowledge base → top K chunks
      → Inject chunks into system prompt
  → Build messages array [{role, content}, ...]
  → Route to model provider (OpenAI/Anthropic/Ollama)
  → Stream tokens via SSE to client
  → If tool_calls in response:
      → Execute tool(s) in sandbox
      → Append tool results
      → Continue generation
  → Save assistant message + token counts
  → Update usage records
```

### Streaming Protocol (SSE)
```
POST /api/v1/chat/completions
Content-Type: application/json
{"model": "gpt-4o", "messages": [...], "stream": true}

Response:
data: {"id":"msg_1","choices":[{"delta":{"content":"Hello"}}]}
data: {"id":"msg_1","choices":[{"delta":{"content":" world"}}]}
data: {"id":"msg_1","choices":[{"delta":{"content":"!"}}],"usage":{"prompt_tokens":10,"completion_tokens":3}}
data: [DONE]
```

### RAG Pipeline
```
Document Upload → Extract text (PDF/DOCX/HTML/MD)
  → Chunk (512 tokens, 50 token overlap)
  → Embed each chunk (OpenAI ada-002 or local model)
  → Store in vector DB (pgvector / Qdrant / Milvus)

Query → Embed query → Vector similarity search (top 5-10)
  → Rerank (optional, cross-encoder)
  → Format as context in system prompt
```

### Tool/Function Calling
```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "web_search",
        "description": "Search the web for current information",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {"type": "string"}
          },
          "required": ["query"]
        }
      }
    }
  ]
}
```

Built-in tools: web_search, code_interpreter (sandboxed), image_generation, calculator, url_fetch

## API Design (OpenAI-compatible)
```
# Chat
POST /api/v1/chat/completions     # OpenAI-compatible endpoint
POST /api/v1/messages              # Anthropic-compatible endpoint

# Conversations
GET    /api/v1/conversations
GET    /api/v1/conversations/:id
DELETE /api/v1/conversations/:id

# Knowledge Base
POST   /api/v1/knowledge-bases
POST   /api/v1/knowledge-bases/:id/documents   # Upload doc
DELETE /api/v1/knowledge-bases/:id/documents/:did

# Models
GET    /api/v1/models              # List available models

# Usage
GET    /api/v1/usage               # Token usage stats
```

## Security
- API key authentication (hashed storage)
- Rate limiting per user and per API key
- Code execution in sandboxed containers (gVisor/Firecracker)
- Content moderation pipeline (toxicity, PII detection)
- Conversation data encryption at rest
- GDPR: conversation export and deletion

## Performance Targets
| Metric | Target |
|--------|--------|
| Time to first token | < 500ms |
| Streaming throughput | 30+ tokens/sec |
| RAG retrieval | < 200ms |
| Tool execution | < 5s |
| Conversation load | < 300ms |
| Concurrent streams | 1000+ |

## Tech Stack
| Component | Recommended |
|-----------|------------|
| API | Python (FastAPI) or Rust (Axum) |
| Streaming | SSE via async generators |
| Vector DB | pgvector (simple) or Qdrant (scale) |
| Embeddings | OpenAI ada-002 or sentence-transformers |
| Sandbox | Docker + gVisor for code exec |
| Frontend | Next.js + Vercel AI SDK |
| Queue | Redis Streams or NATS |
| Model proxy | LiteLLM (unified API for all providers) |

## MVP Tiers

### Tier 1 — Chat (1-2 weeks)
- Multi-model chat (OpenAI + Anthropic + Ollama)
- Streaming responses (SSE)
- Conversation history
- Model selector
- Markdown rendering with code highlighting

### Tier 2 — Knowledge (2-4 weeks)
- RAG: Upload documents, vector search
- Custom system prompts / personas
- API keys for programmatic access
- Usage tracking and limits
- Share conversations via link

### Tier 3 — Tools (4-8 weeks)
- Web search integration
- Code interpreter (sandboxed Python)
- Image generation
- Function calling framework
- File analysis (PDF, images)

### Tier 4 — Platform (8-14 weeks)
- Multi-user teams and workspaces
- Plugin marketplace
- Fine-tuning interface
- Analytics dashboard
- Voice input/output
- Mobile apps
