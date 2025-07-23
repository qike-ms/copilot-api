# Project Plan: Anthropic API Direct Passthrough

## Overview

Add functionality to bypass the current GitHub Copilot translation layer and forward Anthropic API requests directly to Anthropic's servers (`https://api.anthropic.com`) without any message format translation. This provides a fallback mechanism when the translation layer encounters issues or when users want to use Anthropic's API directly.

## Current Architecture Analysis

### Existing Message Flow
1. **Client** → `/v1/messages` → **Anthropic Handler** (`src/routes/messages/handler.ts`)
2. **Anthropic Handler** → **Translation Layer** (`translateToOpenAI`) 
3. **Translation Layer** → **GitHub Copilot API** (`createChatCompletions`)
4. **GitHub Copilot API** → **Response Translation** (`translateToAnthropic`)
5. **Response Translation** → **Client**

### Key Components
- `src/routes/messages/handler.ts` - Main message handler
- `src/routes/messages/non-stream-translation.ts` - Translation logic
- `src/services/copilot/create-chat-completions.ts` - Copilot API calls
- `src/lib/tracing/` - Request/response tracing system

## Implementation Options

### Option 1: Route-Level Toggle (Recommended)
**Pros:**
- Clean separation of concerns
- Maintains existing translation functionality
- Easy to configure per request
- Minimal impact on existing code

**Cons:** 
- Requires new routing logic

### Option 2: Handler-Level Toggle
**Pros:**
- Single handler manages both modes
- Simpler routing

**Cons:**
- More complex handler logic
- Harder to maintain and test

### Option 3: Separate Service Module
**Pros:**
- Complete isolation of passthrough logic
- Easier to test independently

**Cons:**
- Code duplication for tracing/error handling

## Selected Approach: Option 1 (Route-Level Toggle)

## Implementation Plan

### 1. Environment Configuration
- **Environment Variable**: `ANTHROPIC_PASSTHROUGH_MODE` (boolean, default: false)
- **Anthropic Base URL**: `ANTHROPIC_BASE_URL` (string, default: "https://api.anthropic.com")
- **API Key**: `ANTHROPIC_API_KEY` (string, required when passthrough enabled)

### 2. New Components

#### 2.1 Anthropic Passthrough Service (`src/services/anthropic/passthrough.ts`)
```typescript
interface AnthropicPassthroughOptions {
  baseUrl: string
  apiKey: string
  traceId?: string
}

export async function createAnthropicPassthrough(
  payload: AnthropicMessagesPayload,
  options: AnthropicPassthroughOptions
): Promise<Response | AsyncIterable<ServerSentEvent>>
```

**Responsibilities:**
- Direct HTTP forwarding to Anthropic API
- Header preservation and authentication
- Streaming support for both directions
- Error handling and status code forwarding

#### 2.2 Enhanced Message Handler (`src/routes/messages/handler.ts`)
Add mode detection logic:
```typescript
export async function handleCompletion(c: Context) {
  if (shouldUseAnthropicPassthrough()) {
    return await handleAnthropicPassthrough(c)
  }
  // Existing translation logic...
}
```

#### 2.3 Configuration Module (`src/lib/anthropic-config.ts`)
```typescript
export interface AnthropicConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
}

export function getAnthropicConfig(): AnthropicConfig
```

### 3. Header and Payload Forwarding

#### 3.1 Headers to Forward
- `authorization` (replace with Anthropic API key)
- `content-type`
- `user-agent` (modify to include our proxy info)
- `x-api-version` (Anthropic specific)
- Custom headers starting with `x-`

#### 3.2 Headers to Add/Modify
- `authorization: Bearer ${anthropic_api_key}`
- `user-agent: copilot-api-proxy/1.0 ${original_user_agent}`
- `x-forwarded-by: copilot-api`

### 4. Response Handling

#### 4.1 Non-Streaming Responses
- Forward status code exactly
- Forward all response headers except sensitive ones
- Forward response body without modification
- Maintain tracing for debugging

#### 4.2 Streaming Responses
- Stream Server-Sent Events directly from Anthropic
- Preserve event types and data format
- Handle connection errors gracefully
- Maintain tracing for stream events

### 5. Tracing Integration

#### 5.1 Request Tracing
- Capture original client request (same as current)
- Capture forwarded Anthropic request
- Log passthrough mode in trace metadata

#### 5.2 Response Tracing  
- Capture Anthropic API response
- Capture final client response
- Log any errors in passthrough chain

### 6. Error Handling

#### 6.1 Configuration Errors
- Missing API key → HTTP 500 with clear error message
- Invalid base URL → HTTP 500 with configuration guidance

#### 6.2 Anthropic API Errors
- Forward status codes (400, 401, 429, 500, etc.)
- Forward error response bodies
- Log errors for debugging

#### 6.3 Network Errors
- Connection timeouts → HTTP 502 (Bad Gateway)
- DNS resolution failures → HTTP 502
- SSL/TLS errors → HTTP 502

### 7. Testing Strategy

#### 7.1 Unit Tests
- Configuration parsing and validation
- Header forwarding logic
- Error handling scenarios
- Mock Anthropic API responses

#### 7.2 Integration Tests
- End-to-end passthrough flow
- Streaming response handling
- Error forwarding validation
- Tracing capture verification

#### 7.3 Manual Testing
- Test with real Anthropic API key
- Verify both streaming and non-streaming
- Test various error conditions
- Validate tracing output

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Create Anthropic configuration module
- [ ] Implement passthrough service
- [ ] Add environment variable support
- [ ] Create basic unit tests

### Phase 2: Handler Integration
- [ ] Modify message handler for mode detection
- [ ] Implement passthrough handler function
- [ ] Add header forwarding logic
- [ ] Integrate with existing tracing system

### Phase 3: Response Handling
- [ ] Implement non-streaming response forwarding
- [ ] Implement streaming response forwarding
- [ ] Add comprehensive error handling
- [ ] Test status code forwarding

### Phase 4: Testing and Validation
- [ ] Create comprehensive test suite
- [ ] Add integration tests
- [ ] Manual testing with live API
- [ ] Performance and reliability testing

### Phase 5: Documentation and Deployment
- [ ] Update API documentation
- [ ] Add configuration guide
- [ ] Update CLAUDE.md with new functionality
- [ ] Create migration guide for users

## Security Considerations

1. **API Key Management**: Anthropic API key must be securely stored and not logged
2. **Header Sanitization**: Remove potentially sensitive headers before forwarding
3. **Rate Limiting**: Consider implementing rate limiting for passthrough mode
4. **Audit Logging**: Ensure all passthrough requests are properly traced

## Backwards Compatibility

- Existing `/v1/messages` endpoint remains unchanged when passthrough is disabled
- All current functionality preserved
- Gradual migration path for users who want to switch modes
- Environment variable defaults ensure no breaking changes

## Success Metrics

1. **Functionality**: Both streaming and non-streaming requests work correctly
2. **Performance**: Minimal latency overhead from proxying
3. **Reliability**: Proper error handling and status code forwarding
4. **Observability**: Complete tracing of passthrough requests
5. **Security**: No API key leakage or security vulnerabilities