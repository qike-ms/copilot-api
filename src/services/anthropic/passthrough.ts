/**
 * Direct passthrough service for Anthropic API
 */

import consola from "consola"
import { events } from "fetch-event-stream"

import { getTracer } from "~/lib/tracing"
import { HTTPError } from "~/lib/error"
import type { AnthropicMessagesPayload } from "~/routes/messages/anthropic-types"

export interface AnthropicPassthroughOptions {
  baseUrl: string
  headers: Record<string, string>
  traceId?: string
}

export async function createAnthropicPassthrough(
  payload: AnthropicMessagesPayload,
  options: AnthropicPassthroughOptions,
) {
  const { baseUrl, headers, traceId } = options
  const tracer = getTracer()

  const url = `${baseUrl}/v1/messages`

  // Capture Anthropic API request for tracing
  if (traceId) {
    await tracer.captureGithubRequest(traceId, payload, url, headers, payload.model, payload.stream ?? false)
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })

  // Capture Anthropic API response for tracing
  if (traceId) {
    await tracer.captureGithubResponse(traceId, response)
  }

  if (!response.ok) {
    consola.error("Failed to call Anthropic API", response.status, response.statusText)

    if (traceId) {
      await tracer.logError(traceId, "anthropic_api", new HTTPError("Failed to call Anthropic API", response.clone()))
    }

    throw new HTTPError("Failed to call Anthropic API", response.clone())
  }

  // Handle streaming responses
  if (payload.stream) {
    return events(response)
  }

  // Handle non-streaming responses
  return await response.json()
}

export function createAnthropicHeaders(clientHeaders: Headers): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "copilot-api-proxy/1.0",
    "x-forwarded-by": "copilot-api",
    "anthropic-version": "2023-06-01",
  }

  // Forward OAuth authorization header from client
  const authHeader = clientHeaders.get("authorization")
  if (authHeader) {
    headers["authorization"] = authHeader
  }

  return forwardClientHeaders(clientHeaders, headers)
}

export function forwardClientHeaders(
  clientHeaders: Headers,
  anthropicHeaders: Record<string, string>,
): Record<string, string> {
  const headersToForward = [
    "user-agent",
    "x-api-version",
    "anthropic-version",
  ]

  const customHeaders = Array.from(clientHeaders.keys()).filter(key => 
    key.toLowerCase().startsWith("x-") && !key.toLowerCase().startsWith("x-forwarded")
  )

  const allHeadersToForward = [...headersToForward, ...customHeaders]
  
  for (const headerName of allHeadersToForward) {
    const value = clientHeaders.get(headerName)
    if (value) {
      anthropicHeaders[headerName] = value
    }
  }

  // Enhance user-agent with proxy information
  const originalUserAgent = clientHeaders.get("user-agent")
  if (originalUserAgent) {
    anthropicHeaders["user-agent"] = `copilot-api-proxy/1.0 ${originalUserAgent}`
  }

  return anthropicHeaders
}