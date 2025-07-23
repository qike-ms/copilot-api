/**
 * Core tracer class for capturing request-response flows
 */

import type {
  CopilotTraceTuple,
  ClientRequest,
  GithubRequest,
  GithubResponse,
  ClientResponse,
  TraceError,
  StreamingChunk,
  StreamingFinalization,
} from "./types"

import { getTracingConfig } from "./config"
import { TraceFileManager } from "./file-manager"
import {
  generateTraceId,
  generateSessionId,
  getCurrentTimestamp,
  getCurrentISOTimestamp,
  estimateTokenCount,
  calculateProcessingTime,
  deepClone,
} from "./utils"

export class CopilotTracer {
  private config = getTracingConfig()
  private fileManager = new TraceFileManager()
  public activeTraces = new Map<string, Partial<CopilotTraceTuple>>()

  constructor() {
    this.config = getTracingConfig()
    this.fileManager = new TraceFileManager()
  }

  /**
   * Captures initial client request
   */
  async captureClientRequest(req: any, endpointType: string, parsedBody?: any): Promise<string> {
    if (!this.config.enabled) return generateTraceId()

    const traceId = generateTraceId()
    const timestamp = getCurrentTimestamp()

    try {
      // Extract headers - handle both Hono request and standard Request objects
      const headers: Record<string, string> = {}
      
      if (req.raw && req.raw instanceof Request) {
        // Hono request with raw property
        req.raw.headers.forEach((value: string, key: string) => {
          headers[key] = value
        })
      } else if (req.headers && typeof req.headers.forEach === 'function') {
        // Standard Request object
        req.headers.forEach((value: string, key: string) => {
          headers[key] = value
        })
      } else if (req.header && typeof req.header === 'function') {
        // Hono request - get common headers manually
        const commonHeaders = [
          'authorization', 'content-type', 'user-agent', 'accept',
          'x-session-id', 'x-user-id', 'x-request-id'
        ]
        for (const headerName of commonHeaders) {
          const value = req.header(headerName)
          if (value) {
            headers[headerName] = value
          }
        }
      }

      // Get request body
      let body = parsedBody
      if (!body && req.json && typeof req.json === 'function') {
        try {
          body = await req.json()
        } catch {
          body = null
        }
      } else if (!body && req.raw && req.raw.clone) {
        try {
          body = await req.raw.clone().json()
        } catch {
          body = null
        }
      }

      // Estimate token count
      const tokenCount = body?.messages ? estimateTokenCount(body.messages) : undefined

      const clientRequest: ClientRequest = {
        timestamp,
        method: req.method || req.raw?.method || 'POST',
        url: req.url || req.raw?.url || 'unknown',
        //headers: this.config.redactHeaders ? this.redactSensitiveHeaders(headers) : headers,
        //body: this.config.redactHeaders ? this.redactSensitiveBodyData(body) : body,
        headers: headers,
        body: body,
        endpoint_type: endpointType as any,
        user_session: this.extractUserSession(headers),
        token_count: tokenCount,
      }

      // Initialize trace
      const trace: Partial<CopilotTraceTuple> = {
        clientRequest,
        trace_id: traceId,
        logged_at: getCurrentISOTimestamp(),
      }

      this.activeTraces.set(traceId, trace)

      return traceId
    } catch (error) {
      await this.logError(traceId, "client_parse", error)
      return traceId
    }
  }

  /**
   * Captures GitHub API request
   */
  async captureGithubRequest(
    traceId: string,
    payload: any,
    url: string,
    headers: Record<string, string>,
    model: string,
    streaming: boolean,
  ): Promise<void> {
    if (!this.config.enabled) return

    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    try {
      const githubRequest: GithubRequest = {
        timestamp: getCurrentTimestamp(),
        url,
        headers: headers, // this.config.redactHeaders ? this.redactSensitiveHeaders(headers) : headers,
        body: payload,
        model_requested: model,
        streaming,
        token_type: headers.authorization?.includes("gho_") ? "github" : "copilot",
      }

      trace.githubRequest = githubRequest
      this.activeTraces.set(traceId, trace)
    } catch (error) {
      await this.logError(traceId, "github_api", error)
    }
  }

  /**
   * Captures GitHub API response
   */
  async captureGithubResponse(traceId: string, response: Response): Promise<void> {
    if (!this.config.enabled) return

    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    try {
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      let body: any = null
      let bodyRaw: string | undefined

      if (response.body && !headers["content-type"]?.includes("text/event-stream")) {
        // Non-streaming response
        try {
          const clonedResponse = response.clone()
          bodyRaw = await clonedResponse.text()
          body = JSON.parse(bodyRaw)
        } catch {
          // Keep bodyRaw, set body to null
        }
      }

      const githubResponse: GithubResponse = {
        timestamp: getCurrentTimestamp(),
        status_code: response.status,
        headers: headers, // this.config.redactHeaders ? this.redactSensitiveHeaders(headers) : headers,
        body,
        body_raw: bodyRaw,
        token_usage:
          body?.usage ?
            {
              prompt_tokens: body.usage.prompt_tokens || 0,
              completion_tokens: body.usage.completion_tokens || 0,
              total_tokens: body.usage.total_tokens || 0,
            }
          : undefined,
        model_used: body?.model,
      }

      trace.githubResponse = githubResponse
      this.activeTraces.set(traceId, trace)
    } catch (error) {
      await this.logError(traceId, "github_api", error)
    }
  }

  /**
   * Captures final client response
   */
  async captureClientResponse(
    traceId: string,
    response: Response | any,
    startTime: number,
    format: "openai" | "anthropic" = "openai",
  ): Promise<void> {
    if (!this.config.enabled) return

    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    try {
      const timestamp = getCurrentTimestamp()
      const processingTime = calculateProcessingTime(startTime, timestamp)

      let headers: Record<string, string> = {}
      let body: any = null
      let bodyRaw: string | undefined
      let statusCode = 200

      if (response instanceof Response) {
        // Response object
        statusCode = response.status
        response.headers.forEach((value, key) => {
          headers[key] = value
        })

        if (!headers["content-type"]?.includes("text/event-stream")) {
          try {
            const clonedResponse = response.clone()
            bodyRaw = await clonedResponse.text()
            body = JSON.parse(bodyRaw)
          } catch {
            // Keep bodyRaw, set body to null
          }
        }
      } else {
        // Direct object response
        body = response
        headers = { "content-type": "application/json" }
      }

      const clientResponse: ClientResponse = {
        timestamp,
        status_code: statusCode,
        headers: headers, // this.config.redactHeaders ? this.redactSensitiveHeaders(headers) : headers,
        body,
        body_raw: bodyRaw,
        processing_time_ms: processingTime,
        token_usage:
          body?.usage ?
            {
              prompt_tokens: body.usage.prompt_tokens || 0,
              completion_tokens: body.usage.completion_tokens || 0,
              total_tokens: body.usage.total_tokens || 0,
            }
          : undefined,
      }

      trace.clientResponse = clientResponse

      // Complete the trace
      await this.finalizeTrace(traceId)
    } catch (error) {
      await this.logError(traceId, "response_translation", error)
    }
  }

  /**
   * Wraps streaming response with tracing
   */
  wrapStreamingResponse(response: Response, traceId: string, format: "openai" | "anthropic" = "openai"): Response {
    if (!this.config.enabled) {
      return response
    }

    const chunks: Array<StreamingChunk> = []
    let chunkIndex = 0

    const readable = new ReadableStream({
      start: controller => {
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()

        const pump = async (): Promise<void> => {
          try {
            const { done, value } = await reader.read()

            if (done) {
              await this.finalizeStreamingTrace(traceId, {
                total_chunks: chunks.length,
                complete_response: chunks.map(c => c.chunk_data).join(""),
                format,
              })
              controller.close()
              return
            }

            const chunkData = decoder.decode(value, { stream: true })

            if (this.config.includeStreamingChunks) {
              chunks.push({
                chunk_index: chunkIndex++,
                chunk_data: chunkData,
                timestamp: getCurrentTimestamp(),
              })
            }

            controller.enqueue(value)
            return pump()
          } catch (error) {
            await this.logError(traceId, "response_translation", error)
            controller.error(error)
          }
        }

        return pump()
      },
    })

    return new Response(readable, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    })
  }

  /**
   * Finalizes streaming trace
   */
  private async finalizeStreamingTrace(traceId: string, finalization: StreamingFinalization): Promise<void> {
    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    try {
      // Update client response with streaming info
      if (trace.clientResponse) {
        trace.clientResponse.body_raw = finalization.complete_response
        trace.clientResponse.events = finalization.anthropic_events
      }

      await this.finalizeTrace(traceId)
    } catch (error) {
      await this.logError(traceId, "response_translation", error)
    }
  }

  /**
   * Finalizes and writes completed trace
   */
  private async finalizeTrace(traceId: string): Promise<void> {
    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    try {
      const completedTrace = trace as CopilotTraceTuple
      await this.fileManager.writeTrace(completedTrace)
      this.activeTraces.delete(traceId)
    } catch (error) {
      await this.logError(traceId, "response_translation", error)
    }
  }

  /**
   * Logs an error
   */
  async logError(traceId: string, stage: string, error: any): Promise<void> {
    if (!this.config.enabled) return
    const trace = this.activeTraces.get(traceId)
    if (!trace) return
    const completedTrace = trace as CopilotTraceTuple

    const traceError: TraceError & { trace_id: string; timestamp: number; trace: CopilotTraceTuple } = {
      trace_id: traceId,
      timestamp: getCurrentTimestamp(),
      stage: stage as any,
      message: error?.message || String(error),
      stack: error?.stack,
      status: error?.status,
      type: error?.constructor?.name,
      trace: completedTrace,
    }

    this.fileManager.writeError(traceError, traceId)

    // Clean up active trace on error
    this.activeTraces.delete(traceId)
  }

  /**
   * Gets tracer statistics
   */
  getStats(): { activeTraces: number; config: any } {
    return {
      activeTraces: this.activeTraces.size,
      config: this.config,
    }
  }

  /**
   * Extracts user session from headers
   */
  private extractUserSession(headers: Record<string, string>): string | undefined {
    // Try to extract some kind of session identifier
    const sessionHeaders = ["x-session-id", "x-user-id", "x-request-id"]

    for (const header of sessionHeaders) {
      if (headers[header]) {
        return headers[header]
      }
    }

    return generateSessionId()
  }

  /**
   * Redacts sensitive information from headers
   */
  private redactSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
    const redactedHeaders = { ...headers }
  
    const sensitiveKeys = [
      "authorization",
      "x-api-key",
      "x-auth-token",
      "x-github-token",
      "x-copilot-token",
      "cookie",
      "set-cookie",
      "x-session-token",
      "x-access-token",
      "bearer",
      "proxy-authorization",
    ]
  
    for (const [key, value] of Object.entries(redactedHeaders)) {
      const lowerKey = key.toLowerCase()
  
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        if (value && typeof value === "string") {
          if (value.length > 14) {
            // Keep first 10 chars and last 4 chars, redact middle
            redactedHeaders[key] = `${value.substring(0, 10)}...${value.slice(-4)}`
          } else if (value.length > 4) {
            // Keep first 2 and last 2 chars
            redactedHeaders[key] = `${value.substring(0, 2)}...${value.slice(-2)}`
          } else {
            redactedHeaders[key] = "[REDACTED]"
          }
        } else {
          redactedHeaders[key] = "[REDACTED]"
        }
      }
    }
  
    return redactedHeaders
  }

  /**
   * Redacts sensitive data from request body
   */
  private redactSensitiveBodyData(body: any): any {
    if (!body || typeof body !== "object") {
      return body
    }

    const cloned = deepClone(body)

    // Redact any fields that might contain sensitive info
    const sensitiveFields = ["api_key", "token", "password", "secret", "key"]

    const redactObject = (obj: any): void => {
      if (!obj || typeof obj !== "object") return

      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase()

        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          if (typeof value === "string" && value.length > 8) {
            obj[key] = `${value.slice(0, 4)}...${value.slice(-4)}`
          } else {
            obj[key] = "[REDACTED]"
          }
        } else if (typeof value === "object" && value !== null) {
          redactObject(value)
        }
      }
    }

    redactObject(cloned)
    return cloned
  }
}

// Global tracer instance
let tracerInstance: CopilotTracer | null = null

/**
 * Gets the global tracer instance
 */
export function getTracer(): CopilotTracer {
  if (!tracerInstance) {
    tracerInstance = new CopilotTracer()
  }
  return tracerInstance
}
