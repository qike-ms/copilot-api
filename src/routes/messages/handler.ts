import type { Context } from "hono"

import consola from "consola"
import { streamSSE } from "hono/streaming"

import { awaitApproval } from "~/lib/approval"
import { getCallerLocation } from "~/lib/logger"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import { getTracer } from "~/lib/tracing"
import {
  createChatCompletions,
  type ChatCompletionChunk,
  type ChatCompletionResponse,
} from "~/services/copilot/create-chat-completions"

import { type AnthropicMessagesPayload, type AnthropicStreamState } from "./anthropic-types"
import { translateToAnthropic, translateToOpenAI } from "./non-stream-translation"
import { translateChunkToAnthropicEvents } from "./stream-translation"

export async function handleCompletion(c: Context) {
  const tracer = getTracer()
  const startTime = Date.now() / 1000
  let traceId: string | undefined

  try {
    await checkRateLimit(state)

    const anthropicPayload = await c.req.json<AnthropicMessagesPayload>()

    // Capture initial Anthropic request with parsed body
    traceId = await tracer.captureClientRequest(c.req, "anthropic_messages", anthropicPayload)

    consola.debug(`${getCallerLocation()} Anthropic request payload:\n`, anthropicPayload)

    const openAIPayload = translateToOpenAI(anthropicPayload)
    consola.debug(`${getCallerLocation()} Translated OpenAI request payload:\n`, openAIPayload)

    if (state.manualApprove) {
      await awaitApproval()
    }

    const response = await createChatCompletions(openAIPayload, traceId)

    if (isNonStreaming(response)) {
      consola.debug(
        `${getCallerLocation()} Non-streaming response from Copilot:\n`,
        JSON.stringify(response).slice(-400),
      )
      const anthropicResponse = translateToAnthropic(response)
      consola.debug(`${getCallerLocation()} Translated Anthropic response:\n`, anthropicResponse)

      // Capture final Anthropic response for tracing
      await tracer.captureClientResponse(traceId, anthropicResponse, startTime, "anthropic")

      return c.json(anthropicResponse)
    }

    consola.debug(`${getCallerLocation()} Streaming response from Copilot\n`)
    return streamSSE(c, async stream => {
      const streamState: AnthropicStreamState = {
        messageStartSent: false,
        contentBlockIndex: 0,
        contentBlockOpen: false,
        toolCalls: {},
      }

      const anthropicEvents: Array<any> = []

      try {
        for await (const rawEvent of response) {
          consola.debug(`${getCallerLocation()} Copilot raw stream event:\n`, JSON.stringify(rawEvent))
          if (rawEvent.data === "[DONE]") {
            break
          }

          if (!rawEvent.data) {
            continue
          }

          const chunk = JSON.parse(rawEvent.data) as ChatCompletionChunk
          const events = translateChunkToAnthropicEvents(chunk, streamState)

          for (const event of events) {
            //consola.debug(`${getCallerLocation()} Translated Anthropic event:\n`, JSON.stringify(event))
            anthropicEvents.push(event)

            await stream.writeSSE({
              event: event.type,
              data: JSON.stringify(event),
            })
          }
        }

        // Finalize streaming trace with collected events
        await tracer.captureClientResponse(traceId, { events: anthropicEvents }, startTime, "anthropic")
      } catch (error) {
        if (traceId) {
          await tracer.logError(traceId, "response_translation", error)
        }
        throw error
      }
    })
  } catch (error) {
    if (traceId) {
      await tracer.logError(traceId, "translation", error)
    }
    throw error
  }
}

const isNonStreaming = (
  response: Awaited<ReturnType<typeof createChatCompletions>>,
): response is ChatCompletionResponse => Object.hasOwn(response, "choices")
