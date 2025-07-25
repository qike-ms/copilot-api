import consola from "consola"
import { events } from "fetch-event-stream"

import { copilotHeaders, copilotBaseUrl } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { getCallerLocation } from "~/lib/logger"
import { state } from "~/lib/state"
import { getTracer } from "~/lib/tracing"

export const createChatCompletions = async (payload: ChatCompletionsPayload, traceId?: string) => {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const enableVision = payload.messages.some(
    x => typeof x.content !== "string" && x.content?.some(x => x.type === "image_url"),
  )

  const tracer = getTracer()
  const url = `${copilotBaseUrl(state)}/chat/completions`
  const headers = copilotHeaders(state, enableVision)


  // Capture GitHub API request for tracing
  if (traceId) {
    await tracer.captureGithubRequest(traceId, payload, url, headers, payload.model, payload.stream ?? false)
  }

  consola.info(`${getCallerLocation()} --> POST ${url}`, { headers, body: JSON.stringify(payload, null, 2) })
  
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })
  consola.info(`${getCallerLocation()} GitHub Response: \n`, response.headers, response.url, response.status, response.clone())

  // Capture GitHub API response for tracing
  if (traceId) {
    await tracer.captureGithubResponse(traceId, response)
  }

  if (!response.ok) {
    consola.error(`${getCallerLocation()} Failed to create chat completions \n`, JSON.stringify(await response.clone().json()))

    throw new HTTPError("Failed to create chat completions", response.clone())
  }

  if (payload.stream) {
    return events(response)
  }

  return (await response.json()) as ChatCompletionResponse
}

// Streaming types

export interface ChatCompletionChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: Array<Choice>
  system_fingerprint?: string
}

interface Delta {
  content?: string | null
  role?: "user" | "assistant" | "system" | "tool"
  tool_calls?: Array<{
    index: number
    id?: string
    type?: "function"
    function?: {
      name?: string
      arguments?: string
    }
  }>
}

interface Choice {
  index: number
  delta: Delta
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null
  logprobs: object | null
}

// Non-streaming types

export interface ChatCompletionResponse {
  id: string
  object: "chat.completion"
  created: number
  model: string
  choices: Array<ChoiceNonStreaming>
  system_fingerprint?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface ResponseMessage {
  role: "assistant"
  content: string | null
  tool_calls?: Array<ToolCall>
}

interface ChoiceNonStreaming {
  index: number
  message: ResponseMessage
  logprobs: object | null
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter"
}

// Payload types

export interface ChatCompletionsPayload {
  messages: Array<Message>
  model: string
  temperature?: number | null
  top_p?: number | null
  max_tokens?: number | null
  stop?: string | Array<string> | null
  n?: number | null
  stream?: boolean | null

  frequency_penalty?: number | null
  presence_penalty?: number | null
  logit_bias?: Record<string, number> | null
  logprobs?: boolean | null
  response_format?: { type: "json_object" } | null
  seed?: number | null
  tools?: Array<Tool> | null
  tool_choice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } } | null
  user?: string | null
}

export interface Tool {
  type: "function"
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool" | "developer"
  content: string | Array<ContentPart> | null

  name?: string
  tool_calls?: Array<ToolCall>
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export type ContentPart = TextPart | ImagePart

export interface TextPart {
  type: "text"
  text: string
}

export interface ImagePart {
  type: "image_url"
  image_url: {
    url: string
    detail?: "low" | "high" | "auto"
  }
}
