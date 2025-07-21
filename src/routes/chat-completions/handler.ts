import type { Context } from "hono"

import consola from "consola"
import { streamSSE } from "hono/streaming"

import { awaitApproval } from "~/lib/approval"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import { getTokenCount } from "~/lib/tokenizer"
import { getTracer } from "~/lib/tracing"
import { isNullish } from "~/lib/utils"
import {
  createChatCompletions,
  type ChatCompletionResponse,
  type ChatCompletionsPayload,
} from "~/services/copilot/create-chat-completions"

export async function handleCompletion(c: Context) {
  const tracer = getTracer()
  const startTime = Date.now() / 1000

  // Capture initial client request
  const traceId = await tracer.captureClientRequest(c.req, "openai_chat")

  try {
    await checkRateLimit(state)

    let payload = await c.req.json<ChatCompletionsPayload>()
    consola.debug("Request payload:", JSON.stringify(payload).slice(-400))

    consola.info("Current token count:", getTokenCount(payload.messages))

    if (state.manualApprove) await awaitApproval()

    if (isNullish(payload.max_tokens)) {
      const selectedModel = state.models?.data.find(model => model.id === payload.model)

      payload = {
        ...payload,
        max_tokens: selectedModel?.capabilities.limits.max_output_tokens,
      }
      consola.debug("Set max_tokens to:", JSON.stringify(payload.max_tokens))
    }

    const response = await createChatCompletions(payload, traceId)

    if (isNonStreaming(response)) {
      consola.debug("Non-streaming response:", JSON.stringify(response))

      // Capture final response for tracing
      await tracer.captureClientResponse(traceId, response, startTime, "openai")

      return c.json(response)
    }

    consola.debug("Streaming response")

    // Wrap streaming response with tracing
    const tracedStream = tracer.wrapStreamingResponse(new Response(response as any), traceId, "openai")

    return streamSSE(c, async stream => {
      const reader = tracedStream.body!.getReader()
      const decoder = new TextDecoder()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split("\n")

          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6))
                await stream.writeSSE({ data: JSON.stringify(data) })
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      } catch (error) {
        await tracer.logError(traceId, "response_translation", error)
        throw error
      }
    })
  } catch (error) {
    await tracer.logError(traceId, "client_parse", error)
    throw error
  }
}

const isNonStreaming = (
  response: Awaited<ReturnType<typeof createChatCompletions>>,
): response is ChatCompletionResponse => Object.hasOwn(response, "choices")
