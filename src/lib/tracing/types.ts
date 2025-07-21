/**
 * Type definitions for the tracing system
 */

export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface TokenCount {
  estimated_prompt_tokens: number
  message_count: number
}

export interface SSEEvent {
  type: string
  data: unknown
  id?: string
}

export type EndpointType = "openai_chat" | "anthropic_messages" | "models" | "embeddings"
export type TokenType = "github" | "copilot"
export type TraceStage = "client_parse" | "translation" | "github_api" | "response_translation"

export interface ClientRequest {
  timestamp: number
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
  endpoint_type: EndpointType
  user_session?: string
  token_count?: TokenCount
}

export interface GithubRequest {
  timestamp: number
  url: string
  headers: Record<string, string>
  body: unknown
  model_requested: string
  streaming: boolean
  token_type: TokenType
}

export interface GithubResponse {
  timestamp: number
  status_code: number
  headers: Record<string, string>
  body?: unknown
  body_raw?: string
  events?: Array<SSEEvent>
  token_usage?: TokenUsage
  model_used?: string
}

export interface ClientResponse {
  timestamp: number
  status_code: number
  headers: Record<string, string>
  body?: unknown
  body_raw?: string
  events?: Array<unknown>
  processing_time_ms: number
  token_usage?: TokenUsage
}

export interface TraceError {
  stage: TraceStage
  message: string
  stack?: string
  status?: number
  type?: string
}

export interface CopilotTraceTuple {
  clientRequest: ClientRequest
  githubRequest?: GithubRequest
  githubResponse?: GithubResponse
  clientResponse?: ClientResponse
  trace_id: string
  session_id?: string
  logged_at: string
  error?: TraceError
}

export interface TracingConfig {
  enabled: boolean
  logDirectory: string
  maxLogSizeKB: number
  maxArchiveFiles: number
  redactHeaders: boolean
  includeStreamingChunks: boolean
  logLevel: "debug" | "info" | "warn" | "error"
}

export interface StreamingChunk {
  chunk_index: number
  chunk_data: string
  timestamp: number
}

export interface StreamingFinalization {
  total_chunks: number
  complete_response: string
  format: "openai" | "anthropic"
  openai_chunks?: Array<string>
  anthropic_events?: Array<unknown>
  original_format?: string
  translation_stats?: unknown
}
