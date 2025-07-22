# Copilot API Quick Guide

This API server provides OpenAI and Anthropic-compatible endpoints that proxy requests to GitHub Copilot's backend services. All endpoints support proper authentication, rate limiting, and comprehensive tracing.

## Base URL

```
http://localhost:3000
```

## Authentication

All API endpoints require a valid GitHub token with Copilot access:

```bash
Authorization: Bearer <your-github-token>
```

## OpenAI-Compatible Endpoints

### Chat Completions

**POST** `/chat/completions` or `/v1/chat/completions`

Creates a chat completion using OpenAI's API format, proxied through GitHub Copilot.

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 150,
    "temperature": 0.7,
    "stream": false
  }'
```

**Features:**
- Supports streaming and non-streaming responses
- Automatic token counting and validation
- Rate limiting with manual approval mode
- Full request/response tracing
- Auto-sets `max_tokens` based on model capabilities if not provided

### Models

**GET** `/models` or `/v1/models`

Lists available models in OpenAI-compatible format.

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/v1/models
```

**Response format:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4",
      "object": "model",
      "type": "model",
      "created": 0,
      "created_at": "1970-01-01T00:00:00.000Z",
      "owned_by": "openai",
      "display_name": "GPT-4"
    }
  ],
  "has_more": false
}
```

**GET** `/models/detailed`

Enhanced endpoint showing models in multiple API formats (GitHub Copilot, OpenAI, and Anthropic).

```bash
# JSON format
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/models/detailed

# HTML comparison view
curl -H "Accept: text/html" \
  http://localhost:3000/models/detailed
# or
curl http://localhost:3000/models/detailed?format=html
```

### Embeddings

**POST** `/embeddings` or `/v1/embeddings`

Creates embeddings for text inputs using GitHub Copilot's embedding models.

```bash
curl -X POST http://localhost:3000/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "model": "text-embedding-ada-002",
    "input": "Hello world"
  }'
```

## Anthropic-Compatible Endpoints

### Messages

**POST** `/v1/messages`

Creates a message completion using Anthropic's API format, translated and proxied through GitHub Copilot.

```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

**Features:**
- Automatic translation between Anthropic and OpenAI formats
- Support for both streaming and non-streaming responses
- Complete message format conversion
- Full tracing of translation process

### Count Tokens

**POST** `/v1/messages/count_tokens`

Simple endpoint that returns token count information (currently returns a placeholder response).

```bash
curl -X POST http://localhost:3000/v1/messages/count_tokens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"input": "Hello world"}'
```

## Server Management Endpoints

### Health Check

**GET** `/`

Simple health check endpoint.

```bash
curl http://localhost:3000/
```

**Response:** `Server running`

### Token Information

**GET** `/token`

Returns information about the current Copilot token state.

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/token
```

**Response:**
```json
{
  "token": {
    "token": "ghu_xxxx...",
    "expires_at": 1234567890,
    "refresh_in": 28800
  }
}
```

### Usage Statistics

**GET** `/usage`

Fetches GitHub Copilot usage statistics for the authenticated user.

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/usage
```

## Tracing Endpoints

Comprehensive tracing system for debugging and monitoring API flows.

### List Traces

**GET** `/traces`

Lists recent traces with pagination support.

```bash
curl http://localhost:3000/traces?limit=10&offset=0
```

**Query Parameters:**
- `limit` (optional): Number of traces to return (default: 50)
- `offset` (optional): Number of traces to skip (default: 0)

### Trace Statistics

**GET** `/traces/stats`

Returns tracing system statistics and configuration.

```bash
curl http://localhost:3000/traces/stats
```

### Search Traces

**GET** `/traces/search`

Search traces by various criteria.

```bash
curl "http://localhost:3000/traces/search?model=gpt-4&endpoint=openai_chat"
```

**Query Parameters:**
- `model`: Filter by model name
- `endpoint`: Filter by endpoint type (`openai_chat`, `anthropic_messages`, `models`, `embeddings`)
- `status`: Filter by HTTP status code
- `error`: Filter traces with errors only

### Get Trace by ID

**GET** `/traces/{traceId}`

Retrieves a specific trace by its ID.

```bash
curl http://localhost:3000/traces/abc123-def456-789
```

### Error Traces

**GET** `/traces/errors`

Lists only traces that encountered errors.

```bash
curl http://localhost:3000/traces/errors
```

### Clear Traces

**DELETE** `/traces`

Clears all stored traces (development/testing only).

```bash
curl -X DELETE http://localhost:3000/traces
```

## Request/Response Flow

### OpenAI Chat Completions Flow
1. Client sends OpenAI-format request to `/v1/chat/completions`
2. Server validates token and applies rate limiting
3. Request is forwarded to GitHub Copilot API
4. Response is returned in OpenAI format
5. Full trace is captured with request/response details

### Anthropic Messages Flow
1. Client sends Anthropic-format request to `/v1/messages`
2. Server translates Anthropic format to OpenAI format
3. Translated request is forwarded to GitHub Copilot API
4. OpenAI response is translated back to Anthropic format
5. Anthropic-format response is returned to client
6. Full trace includes translation details and original/translated formats

## Error Handling

All endpoints use consistent error response format:

```json
{
  "error": {
    "message": "Error description",
    "type": "error_type",
    "status": 400
  }
}
```

Common error scenarios:
- **401 Unauthorized**: Invalid or missing GitHub token
- **429 Too Many Requests**: Rate limit exceeded
- **400 Bad Request**: Invalid request format or parameters
- **503 Service Unavailable**: GitHub Copilot API unavailable

## Environment Configuration

Key environment variables that affect API behavior:

```bash
# Enable tracing (affects /traces endpoints)
COPILOT_TRACE_ENABLED=true

# Manual approval for requests (development)
MANUAL_APPROVE=true

# Rate limiting
RATE_LIMIT_ENABLED=true

# Logging verbosity
LOG_LEVEL=debug
```

## Common Usage Patterns

### Development and Testing
```bash
# Check server health
curl http://localhost:3000/

# List available models
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/v1/models

# Test OpenAI-style chat
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hello!"}]}'

# Test Anthropic-style messages
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"model": "claude-3-5-sonnet-20241022", "max_tokens": 100, "messages": [{"role": "user", "content": "Hello!"}]}'

# View recent traces
curl http://localhost:3000/traces
```

### Production Monitoring
```bash
# Monitor usage statistics
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/usage

# Check for errors
curl http://localhost:3000/traces/errors

# Get tracing statistics
curl http://localhost:3000/traces/stats
```

## Next Steps

- See `docs/auth.md` for detailed authentication setup
- See `docs/trace-quick-guide.md` for comprehensive tracing documentation
- See `docs/logging.md` for server logging configuration
- Check the source code in `src/routes/` for implementation details