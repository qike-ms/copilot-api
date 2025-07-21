# Copilot API Tracing Implementation Plan

## Overview

This document outlines the comprehensive tracing strategy for capturing the complete request-response flow in the copilot API server, based on deep research of both the existing codebase and the claude-trace package patterns.

## Complete Flow Tuple Structure

For the copilot API server, we need to capture **4 distinct data points** for each request:

```typescript
interface CopilotTraceTuple {
  // 1. Original client request (OpenAI/Anthropic format)
  clientRequest: {
    timestamp: number;
    method: string;
    url: string;
    headers: Record<string, string>; // Redacted
    body: any; // Original payload (OpenAI or Anthropic)
    endpoint_type: 'openai_chat' | 'anthropic_messages' | 'models' | 'embeddings';
    user_session?: string;
    token_count?: {
      estimated_prompt_tokens: number; // From getTokenCount() in existing code
      message_count: number;
    };
  };

  // 2. Translated request sent to GitHub API
  githubRequest: {
    timestamp: number;
    url: string;
    headers: Record<string, string>; // Including auth tokens (redacted)
    body: any; // Always OpenAI format after translation
    model_requested: string;
    streaming: boolean;
    token_type: 'github' | 'copilot';
  };

  // 3. Raw response from GitHub Copilot
  githubResponse: {
    timestamp: number;
    status_code: number;
    headers: Record<string, string>;
    body?: any; // JSON response for non-streaming
    body_raw?: string; // SSE data for streaming
    events?: SSEEvent[]; // Parsed streaming events
    token_usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    model_used?: string;
  };

  // 4. Final translated response to client
  clientResponse: {
    timestamp: number;
    status_code: number;
    headers: Record<string, string>;
    body?: any; // Final format (OpenAI or Anthropic)
    body_raw?: string; // For streaming responses
    events?: any[]; // Anthropic streaming events if translated
    processing_time_ms: number;
    token_usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };

  // Metadata
  trace_id: string;
  session_id?: string;
  logged_at: string; // ISO timestamp
  error?: {
    stage: 'client_parse' | 'translation' | 'github_api' | 'response_translation';
    message: string;
    stack?: string;
  };
}
```

## Key Integration Points for Data Capture

Based on the analysis, here are the **critical points** where we need to inject tracing:

### 1. OpenAI Chat Completions (`src/routes/chat-completions/handler.ts`)

```typescript
// Capture points:
export async function handler(c: Context, state: State) {
  const tracer = getTracer();
  const traceId = generateTraceId();
  
  // POINT 1: Original client request
  const clientRequest = await tracer.captureClientRequest(c.req, 'openai_chat');
  
  await checkRateLimit(state);
  let payload = await c.req.json<ChatCompletionsPayload>();
  
  // POINT 2: Request to GitHub (minimal transformation for OpenAI)
  const githubRequest = await tracer.captureGithubRequest(payload, state);
  
  // GitHub API call
  const response = await createChatCompletions(payload);
  
  // POINT 3: GitHub response
  const githubResponse = await tracer.captureGithubResponse(response);
  
  if (payload.stream) {
    // Handle streaming
    const stream = await tracer.wrapStreamingResponse(
      response, traceId, 'openai_chat'
    );
    
    // POINT 4: Client response (streaming)
    return tracer.streamingClientResponse(c, stream, traceId);
  } else {
    // POINT 4: Client response (non-streaming)
    return tracer.nonStreamingClientResponse(c, response, traceId);
  }
}
```

### 2. Anthropic Messages (`src/routes/messages/handler.ts`)

```typescript
export async function handler(c: Context, state: State) {
  const tracer = getTracer();
  const traceId = generateTraceId();
  
  // POINT 1: Original Anthropic request
  const anthropicPayload = await c.req.json<AnthropicMessagesPayload>();
  const clientRequest = await tracer.captureClientRequest(c.req, 'anthropic_messages', anthropicPayload);
  
  // Translation layer
  const openAIPayload = translateToOpenAI(anthropicPayload);
  
  // POINT 2: Translated OpenAI request to GitHub
  const githubRequest = await tracer.captureGithubRequest(openAIPayload, state, {
    original_format: 'anthropic',
    translated: true
  });
  
  // GitHub API call
  const response = await createChatCompletions(openAIPayload);
  
  // POINT 3: OpenAI response from GitHub
  const githubResponse = await tracer.captureGithubResponse(response);
  
  if (anthropicPayload.stream) {
    // Complex streaming translation
    const anthropicStream = await tracer.wrapAnthropicStreamingTranslation(
      response, traceId, anthropicPayload
    );
    
    // POINT 4: Final Anthropic streaming response
    return tracer.streamingClientResponse(c, anthropicStream, traceId, 'anthropic');
  } else {
    // Non-streaming translation
    const anthropicResponse = translateToAnthropic(response);
    
    // POINT 4: Final Anthropic response
    return tracer.nonStreamingClientResponse(c, anthropicResponse, traceId, 'anthropic');
  }
}
```

### 3. GitHub API Service Layer (`src/services/copilot/create-chat-completions.ts`)

```typescript
export async function createChatCompletions(payload: ChatCompletionsPayload) {
  const tracer = getTracer();
  const requestId = getCurrentRequestId(); // From context
  
  await ensureCopilotToken(state);
  
  const isVisionRequest = payload.messages.some(/* vision detection */);
  const url = `${copilotBaseUrl(state)}/chat/completions`;
  const headers = copilotHeaders(state, isVisionRequest);
  
  // Enhanced tracing for GitHub API call
  await tracer.logGithubApiCall(requestId, {
    url,
    headers: redactSensitiveHeaders(headers),
    payload,
    vision_request: isVisionRequest,
    token_type: state.copilotToken ? 'copilot' : 'github'
  });
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const error = await parseErrorResponse(response);
      await tracer.logGithubApiError(requestId, {
        status: response.status,
        error,
        headers: Object.fromEntries(response.headers.entries())
      });
      throw new HTTPError(response.status, JSON.stringify(error));
    }
    
    // Success logging
    await tracer.logGithubApiSuccess(requestId, {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      streaming: payload.stream || false
    });
    
    return response;
  } catch (error) {
    await tracer.logGithubApiError(requestId, error);
    throw error;
  }
}
```

## Streaming Response Handling

### OpenAI Streaming (Pass-through)
```typescript
async wrapStreamingResponse(response: Response, traceId: string, format: 'openai_chat') {
  const tracer = this;
  let accumulatedChunks: string[] = [];
  
  const readable = new ReadableStream({
    start(controller) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      
      const pump = async (): Promise<void> => {
        try {
          const { done, value } = await reader.read();
          
          if (done) {
            // Finalize tracing
            await tracer.finalizeStreamingTrace(traceId, {
              total_chunks: accumulatedChunks.length,
              complete_response: accumulatedChunks.join(''),
              format: 'openai'
            });
            controller.close();
            return;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          accumulatedChunks.push(chunk);
          
          // Log chunk for tracing
          await tracer.logStreamingChunk(traceId, {
            chunk_index: accumulatedChunks.length,
            chunk_data: chunk,
            timestamp: Date.now() / 1000
          });
          
          controller.enqueue(value);
          return pump();
        } catch (error) {
          await tracer.logStreamingError(traceId, error);
          controller.error(error);
        }
      };
      
      return pump();
    }
  });
  
  return new Response(readable, {
    headers: response.headers
  });
}
```

### Anthropic Streaming (Complex Translation)
```typescript
async wrapAnthropicStreamingTranslation(
  openAIResponse: Response, 
  traceId: string, 
  originalPayload: AnthropicMessagesPayload
) {
  const tracer = this;
  let openAIAccumulator: string[] = [];
  let anthropicAccumulator: any[] = [];
  
  const anthropicStream = new ReadableStream({
    start(controller) {
      const anthropicState = new AnthropicStreamState();
      const reader = openAIResponse.body!.getReader();
      const decoder = new TextDecoder();
      
      const pump = async (): Promise<void> => {
        try {
          const { done, value } = await reader.read();
          
          if (done) {
            // Complete tracing with both formats
            await tracer.finalizeStreamingTrace(traceId, {
              openai_chunks: openAIAccumulator,
              anthropic_events: anthropicAccumulator,
              original_format: 'anthropic',
              translation_stats: anthropicState.getStats()
            });
            controller.close();
            return;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          openAIAccumulator.push(chunk);
          
          // Process OpenAI chunk and translate to Anthropic events
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
              try {
                const openAIEvent = JSON.parse(line.slice(6));
                const anthropicEvents = translateOpenAIChunkToAnthropic(
                  openAIEvent, anthropicState
                );
                
                for (const event of anthropicEvents) {
                  anthropicAccumulator.push(event);
                  const eventData = `data: ${JSON.stringify(event)}\n\n`;
                  controller.enqueue(new TextEncoder().encode(eventData));
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
          
          return pump();
        } catch (error) {
          await tracer.logStreamingError(traceId, error);
          controller.error(error);
        }
      };
      
      return pump();
    }
  });
  
  return new Response(anthropicStream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

## Error Handling and Recovery

```typescript
class CopilotTracer {
  async logError(traceId: string, stage: string, error: any) {
    const errorData = {
      trace_id: traceId,
      timestamp: Date.now() / 1000,
      stage,
      error: {
        message: error.message,
        stack: error.stack,
        status: error.status,
        type: error.constructor.name
      },
      logged_at: new Date().toISOString()
    };
    
    // Write to errors.json
    await this.writeToErrorLog(errorData);
  }
  
  async handleOrphanedRequest(requestData: any) {
    const orphanedTrace = {
      clientRequest: requestData,
      githubRequest: null,
      githubResponse: null,
      clientResponse: null,
      trace_id: requestData.trace_id,
      logged_at: new Date().toISOString(),
      error: {
        stage: 'request_processing',
        message: 'ORPHANED_REQUEST - Processing incomplete'
      }
    };
    
    await this.writeToErrorLog(orphanedTrace);
  }
}
```

## Storage Structure

### Directory Organization
```
traces/
├── log.json              # All successful request-response pairs
├── errors.json           # Failed/incomplete requests
├── archive/
│   ├── log-2024-07-21-001.json    # Rotated logs
│   └── errors-2024-07-21-001.json # Rotated error logs
└── metadata.json         # Tracing statistics and config
```

### File Rotation Strategy
- **Size-based rotation**: When log.json exceeds 100KB
- **Archive with timestamps**: Move to `archive/` with timestamp suffix
- **Cleanup policy**: Keep last 50 archived files
- **Atomic operations**: Use temp files and rename for consistency

## Testing Strategy

### Unit Test Coverage Requirements
- **Target**: >80% code coverage for all tracing modules
- **Focus Areas**:
  - Common utilities (header redaction, token counting, ID generation)
  - Data structure validation and serialization
  - File rotation logic
  - Error handling and recovery
  - Configuration parsing and validation

### Unit Test Structure
```
src/lib/tracing/
├── __tests__/
│   ├── utils.test.ts           # Common utilities
│   ├── tracer.test.ts          # Core tracer class  
│   ├── file-manager.test.ts    # File operations
│   ├── config.test.ts          # Configuration
│   └── fixtures/               # Test data
│       ├── sample-requests.json
│       ├── sample-responses.json
│       └── sample-streaming.txt
```

### E2E Test Scenarios
1. **Complete OpenAI Flow**: Client request → GitHub API → Response
2. **Complete Anthropic Flow**: Client request → Translation → GitHub API → Translation → Response  
3. **Streaming Scenarios**: Both OpenAI and Anthropic streaming
4. **Error Scenarios**: Failed requests, network errors, malformed responses
5. **File Rotation**: Log size limits, archive creation
6. **Configuration**: Different config options and environment variables

### Test Implementation Priority
1. **Phase 1**: Common utilities with >90% coverage
2. **Phase 2**: Core tracer functionality with >85% coverage  
3. **Phase 3**: Integration points with >80% coverage
4. **Phase 4**: E2E scenarios with key user flows

## Configuration Options

```typescript
interface TracingConfig {
  enabled: boolean;              // Default: false
  logDirectory: string;          // Default: "traces/"
  maxLogSizeKB: number;         // Default: 100
  maxArchiveFiles: number;      // Default: 50
  redactHeaders: boolean;       // Default: true
  includeStreamingChunks: boolean; // Default: false (performance)
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

## Environment Variables
- `COPILOT_TRACE_ENABLED=true` - Enable tracing
- `COPILOT_TRACE_DIR=./traces` - Custom trace directory
- `COPILOT_TRACE_MAX_SIZE=100` - Max log size in KB
- `COPILOT_TRACE_STREAMING=false` - Include streaming chunks
- `COPILOT_TRACE_DEBUG=false` - Debug level logging

## Performance Considerations

1. **Async Logging**: Never block request processing for logging
2. **Stream Buffering**: Optional streaming chunk capture (disabled by default)
3. **Memory Management**: Process streaming data incrementally
4. **File I/O**: Use append-only operations with batching
5. **Error Isolation**: Tracing failures don't affect API functionality

## Security Requirements

1. **Header Redaction**: Automatic redaction of sensitive headers
2. **Token Masking**: Show only first/last chars of auth tokens
3. **PII Protection**: Optional body content filtering
4. **Access Control**: Trace files readable only by service account

This comprehensive approach captures the **complete transformation pipeline** from client request through GitHub API to final response, enabling detailed analysis of:

1. **Request translation accuracy** (Anthropic ↔ OpenAI)
2. **Response latency** at each stage
3. **Token usage patterns** 
4. **Error propagation** through the pipeline
5. **Streaming behavior** and chunk processing
6. **Authentication flow** and token refresh cycles


Todos
  ⎿  ☒ Analyze request handling and transformation from request to GitHub copilot API in the src code                                                                                   
     ☒ Study claude-trace package for tracing patterns and best practices at ../trace
     ☒ Save comprehensive trace plan to docs/trace-plan.md
     ☒ Document how to save the tuple for each request and response: received request, translated request to GitHub API, received response from GitHub and translated response to return
     ☒ Design tracing code structure and integration points between current code and tracing system
     ☒ Define trace json schema and storage under traces/ directory, use log.json for all requests and responses and errors.json for failed ones
     ☐ Implement common utilities (header redaction, ID generation, token counting)
     ☐ Write unit tests for common utilities (>90% coverage)
     ☐ Implement tracing configuration module
     ☐ Implement core tracer class
     ☐ Write unit tests for core tracer (>85% coverage)
     ☐ Integrate tracing into request handlers
     ☐ Implement file manager with rotation
     ☐ Write E2E tests for complete flows
     ☐ Implement auto rotate log data to cap at 100KB size
