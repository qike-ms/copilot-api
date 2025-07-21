# Model Routing

This document explains how the Copilot API proxy handles model discovery, transformation, and routing between OpenAI-compatible clients and GitHub Copilot's backend.

## Overview

The model routing system provides OpenAI-compatible model listings while internally managing GitHub Copilot models. It acts as a transparent proxy with format translation and capability enhancement.

## Model Discovery & Caching

### Initial Setup

**File**: `src/lib/utils.ts:16-19`

```typescript
export async function cacheModels(): Promise<void> {
  const models = await getModels()
  state.models = models
}
```

**Process**:
1. `cacheModels()` fetches available models from GitHub Copilot API
2. Called at server startup (`src/start.ts:56`)
3. Stores models in global `state.models` for runtime access

### Model Discovery

**File**: `src/services/copilot/get-models.ts:5-12`

Makes GET request to `{copilotBaseUrl}/models` with proper authentication headers. Returns comprehensive model information including:

- **Basic Info**: `id`, `name`, `vendor`, `version`
- **Capabilities**: Context limits, output limits, tool support
- **Metadata**: Preview status, model picker availability
- **Features**: Parallel tool calls, dimensions support

## HTTP Endpoints

### Route Configuration

**File**: `src/server.ts:20,27`

```typescript
server.route("/models", modelRoutes)           // Direct access
server.route("/v1/models", modelRoutes)        // OpenAI-compatible
```

Both endpoints use the same handler for consistency.

### Model Listing Handler

**File**: `src/routes/models/route.ts:9-34`

```typescript
modelRoutes.get("/", async (c) => {
  if (!state.models) {
    await cacheModels()  // Fallback if models not cached
  }
  
  const models = state.models?.data.map((model) => ({
    // Transform GitHub format to OpenAI format
  }))
  
  return c.json({
    object: "list",
    data: models,
    has_more: false,
  })
})
```

## Format Transformation

### GitHub Copilot Model Format

```typescript
interface Model {
  id: string                    // e.g., "gpt-4o"
  name: string                  // e.g., "GPT-4o"
  vendor: string                // e.g., "openai"
  version: string               // Model version
  preview: boolean              // Preview status
  model_picker_enabled: boolean // UI availability
  capabilities: {
    family: string              // Model family
    limits: {
      max_context_window_tokens?: number
      max_output_tokens?: number
      max_prompt_tokens?: number
      max_inputs?: number
    }
    supports: {
      tool_calls?: boolean
      parallel_tool_calls?: boolean
      dimensions?: boolean       // For embeddings
    }
    tokenizer: string           // Tokenizer type
    type: string               // Model type
  }
}
```

### OpenAI-Compatible Output Format

**File**: `src/routes/models/route.ts:16-24`

```typescript
{
  id: model.id,                              // Preserved from source
  object: "model",                           // Fixed value
  type: "model",                             // Fixed value
  created: 0,                                // No date from source
  created_at: new Date(0).toISOString(),     // Epoch timestamp
  owned_by: model.vendor,                    // Maps from vendor field
  display_name: model.name,                  // Maps from name field
}
```

## Model Selection in Requests

### Chat Completions

**File**: `src/routes/chat-completions/handler.ts:28-36`

```typescript
const selectedModel = state.models?.data.find(
  (model) => model.id === payload.model,
)

payload = {
  ...payload,
  max_tokens: selectedModel?.capabilities.limits.max_output_tokens,
}
```

**Process**:
1. Extract `payload.model` from incoming request
2. Find matching model by ID in cached models
3. Use model's `max_output_tokens` if client didn't specify `max_tokens`
4. Enhance request with model capabilities

### Anthropic Messages

**File**: `src/routes/messages/non-stream-translation.ts:32`

```typescript
model: payload.model,  // Pass through model ID directly
```

Model ID is preserved when translating between Anthropic and OpenAI formats.

## Request Flow

### 1. Client Request
```
POST /v1/chat/completions
{
  "model": "gpt-4o",
  "messages": [...],
  // max_tokens not specified
}
```

### 2. Model Lookup & Enhancement
```typescript
// Find model capabilities
const selectedModel = state.models?.data.find(
  (model) => model.id === "gpt-4o"
)

// Enhance request
payload.max_tokens = selectedModel?.capabilities.limits.max_output_tokens
```

### 3. GitHub Copilot Request
```typescript
// Direct passthrough to GitHub Copilot
await fetch(`${copilotBaseUrl(state)}/chat/completions`, {
  method: "POST",
  headers: copilotHeaders(state),
  body: JSON.stringify(payload),  // Enhanced payload
})
```

## Model Capabilities Usage

### Token Limits

Available capability limits:
- `max_context_window_tokens`: Total context window size
- `max_output_tokens`: Maximum response length
- `max_prompt_tokens`: Maximum input length
- `max_inputs`: Maximum number of inputs

### Feature Support

Available feature flags:
- `tool_calls`: Function calling support
- `parallel_tool_calls`: Concurrent tool execution
- `dimensions`: Custom embedding dimensions

### Vision Detection

**File**: `src/services/copilot/create-chat-completions.ts:13-17`

```typescript
const enableVision = payload.messages.some(
  (x) => typeof x.content !== "string" 
    && x.content?.some((x) => x.type === "image_url"),
)
```

Automatically detects vision requests and sets appropriate headers.

## Error Handling

### Fallback Model Caching

**File**: `src/routes/models/route.ts:11-14`

```typescript
if (!state.models) {
  // This should be handled by startup logic, but as a fallback.
  await cacheModels()
}
```

Ensures models are always available even if startup caching failed.

### Model Not Found

- No client-side validation of model IDs
- Invalid models are handled by GitHub Copilot backend
- HTTPError forwarding preserves original error responses

## Key Design Principles

### 1. Transparent Proxy
- Model requests pass through with minimal processing
- No model validation or filtering on proxy side
- GitHub Copilot handles model availability and validation

### 2. Dynamic Discovery
- Models discovered at runtime via API calls
- No hardcoded model lists
- Automatically stays current with GitHub Copilot offerings

### 3. Capability Enhancement
- Uses cached model metadata to improve request handling
- Automatically sets appropriate token limits
- Provides feature detection for clients

### 4. Format Compatibility
- Converts GitHub's model format to OpenAI-compatible structure
- Maintains all essential model information
- Supports both `/models` and `/v1/models` endpoints

### 5. Performance Optimization
- Models cached at startup for fast access
- Fallback caching if startup fails
- Global state prevents repeated API calls

## Integration Points

### Startup Sequence
1. Server starts (`src/start.ts`)
2. Models cached (`cacheModels()`)
3. Available models logged to console
4. Claude Code integration can select models interactively

### Request Processing
1. Client sends request with model ID
2. Model capabilities looked up in cache
3. Request enhanced with model limits
4. Request forwarded to GitHub Copilot
5. Response returned to client

### Model Information Flow
```
GitHub Copilot API → Cache → OpenAI Format → Client
                      ↓
                Request Enhancement
                      ↓
                GitHub Copilot API
```