/**
 * Unit tests for Anthropic to OpenAI message translation
 */

import { describe, it, expect } from "bun:test"

import { translateToOpenAI, translateToAnthropic } from "../non-stream-translation"
import type { AnthropicMessagesPayload, AnthropicMessage } from "../anthropic-types"
import type { ChatCompletionResponse, Message } from "~/services/copilot/create-chat-completions"

describe("Message Translation", () => {
  describe("reorderToolMessages", () => {
    it("should preserve message order when no tool messages are present", () => {
      const payload: AnthropicMessagesPayload = {
        model: "claude-3-sonnet-20240229",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: "Hello"
          },
          {
            role: "assistant",
            content: "Hi there!"
          }
        ]
      }

      const result = translateToOpenAI(payload)
      
      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].role).toBe("user")
      expect(result.messages[0].content).toBe("Hello")
      expect(result.messages[1].role).toBe("assistant")
      expect(result.messages[1].content).toBe("Hi there!")
    })

    it("should place tool_result messages immediately after tool_use messages", () => {
      const payload: AnthropicMessagesPayload = {
        model: "claude-3-sonnet-20240229",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: "Use a tool to calculate 2+2"
          },
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "I'll calculate that for you."
              },
              {
                type: "tool_use",
                id: "tool_1",
                name: "calculator",
                input: { operation: "add", a: 2, b: 2 }
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool_1",
                content: "4"
              }
            ]
          }
        ]
      }

      const result = translateToOpenAI(payload)
      
      // Should have: user, assistant with tool_calls, tool result
      expect(result.messages).toHaveLength(3)
      
      // First message: user
      expect(result.messages[0].role).toBe("user")
      expect(result.messages[0].content).toBe("Use a tool to calculate 2+2")
      
      // Second message: assistant with tool call
      expect(result.messages[1].role).toBe("assistant")
      expect(result.messages[1].content).toBe("I'll calculate that for you.")
      expect(result.messages[1].tool_calls).toHaveLength(1)
      expect(result.messages[1].tool_calls![0].id).toBe("tool_1")
      expect(result.messages[1].tool_calls![0].function.name).toBe("calculator")
      
      // Third message: tool result immediately following
      expect(result.messages[2].role).toBe("tool")
      expect(result.messages[2].tool_call_id).toBe("tool_1")
      expect(result.messages[2].content).toBe("4")
    })

    it("should handle multiple tool calls with their corresponding results", () => {
      const payload: AnthropicMessagesPayload = {
        model: "claude-3-sonnet-20240229",
        max_tokens: 100,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool_1",
                name: "weather",
                input: { city: "NYC" }
              },
              {
                type: "tool_use",
                id: "tool_2",
                name: "time",
                input: { timezone: "EST" }
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool_1",
                content: "Sunny, 75°F"
              },
              {
                type: "tool_result",
                tool_use_id: "tool_2",
                content: "3:30 PM"
              }
            ]
          }
        ]
      }

      const result = translateToOpenAI(payload)
      
      // Should have: assistant with tool_calls, then two tool results
      expect(result.messages).toHaveLength(3)
      
      // First message: assistant with tool calls
      expect(result.messages[0].role).toBe("assistant")
      expect(result.messages[0].tool_calls).toHaveLength(2)
      
      // Second and third messages: tool results
      expect(result.messages[1].role).toBe("tool")
      expect(result.messages[2].role).toBe("tool")
      
      // Check tool call IDs match
      const toolCallIds = result.messages[0].tool_calls!.map(tc => tc.id)
      const toolResultIds = [result.messages[1].tool_call_id, result.messages[2].tool_call_id]
      
      expect(toolCallIds.sort()).toEqual(toolResultIds.sort())
    })

    it("should handle mixed user content with tool results", () => {
      const payload: AnthropicMessagesPayload = {
        model: "claude-3-sonnet-20240229",
        max_tokens: 100,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool_1",
                name: "search",
                input: { query: "typescript" }
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Here are the results:"
              },
              {
                type: "tool_result",
                tool_use_id: "tool_1",
                content: "TypeScript is a programming language..."
              }
            ]
          }
        ]
      }

      const result = translateToOpenAI(payload)
      
      // Should have: assistant with tool_calls, user message, tool result
      expect(result.messages).toHaveLength(3)
      
      // First message: assistant with tool call
      expect(result.messages[0].role).toBe("assistant")
      expect(result.messages[0].tool_calls).toHaveLength(1)
      
      // Second message: user content (non-tool)
      expect(result.messages[1].role).toBe("user")
      expect(result.messages[1].content).toBe("Here are the results:")
      
      // Third message: tool result
      expect(result.messages[2].role).toBe("tool")
      expect(result.messages[2].tool_call_id).toBe("tool_1")
    })

    it("should handle orphaned tool results gracefully", () => {
      const payload: AnthropicMessagesPayload = {
        model: "claude-3-sonnet-20240229",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "orphaned_tool",
                content: "This result has no matching tool call"
              }
            ]
          }
        ]
      }

      const result = translateToOpenAI(payload)
      
      // Should place orphaned tool result at the end
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].role).toBe("tool")
      expect(result.messages[0].tool_call_id).toBe("orphaned_tool")
    })
  })

  describe("translateToAnthropic", () => {
    it("should translate OpenAI response to Anthropic format", () => {
      const openAIResponse: ChatCompletionResponse = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1699896916,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Hello! How can I help you today?"
            },
            logprobs: null,
            finish_reason: "stop"
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18
        }
      }

      const result = translateToAnthropic(openAIResponse)
      
      expect(result.id).toBe("chatcmpl-123")
      expect(result.type).toBe("message")
      expect(result.role).toBe("assistant")
      expect(result.model).toBe("gpt-4")
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe("text")
      expect(result.content[0].text).toBe("Hello! How can I help you today?")
      expect(result.stop_reason).toBe("end_turn")
      expect(result.usage.input_tokens).toBe(10)
      expect(result.usage.output_tokens).toBe(8)
    })

    it("should translate tool calls to tool_use blocks", () => {
      const openAIResponse: ChatCompletionResponse = {
        id: "chatcmpl-456",
        object: "chat.completion",
        created: 1699896916,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "I'll help you with that calculation.",
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "calculator",
                    arguments: '{"operation": "multiply", "a": 5, "b": 3}'
                  }
                }
              ]
            },
            logprobs: null,
            finish_reason: "tool_calls"
          }
        ]
      }

      const result = translateToAnthropic(openAIResponse)
      
      expect(result.content).toHaveLength(2)
      
      // First block: text
      expect(result.content[0].type).toBe("text")
      expect(result.content[0].text).toBe("I'll help you with that calculation.")
      
      // Second block: tool_use
      expect(result.content[1].type).toBe("tool_use")
      expect(result.content[1].id).toBe("call_123")
      expect(result.content[1].name).toBe("calculator")
      expect(result.content[1].input).toEqual({ operation: "multiply", a: 5, b: 3 })
      
      expect(result.stop_reason).toBe("tool_use")
    })
  })

  describe("System message handling", () => {
    it("should convert system string to system message", () => {
      const payload: AnthropicMessagesPayload = {
        model: "claude-3-sonnet-20240229",
        max_tokens: 100,
        system: "You are a helpful assistant.",
        messages: [
          {
            role: "user",
            content: "Hello"
          }
        ]
      }

      const result = translateToOpenAI(payload)
      
      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].role).toBe("system")
      expect(result.messages[0].content).toBe("You are a helpful assistant.")
      expect(result.messages[1].role).toBe("user")
      expect(result.messages[1].content).toBe("Hello")
    })

    it("should convert system blocks to system message", () => {
      const payload: AnthropicMessagesPayload = {
        model: "claude-3-sonnet-20240229",
        max_tokens: 100,
        system: [
          {
            type: "text",
            text: "You are a helpful assistant."
          },
          {
            type: "text", 
            text: "Always be polite."
          }
        ],
        messages: [
          {
            role: "user",
            content: "Hello"
          }
        ]
      }

      const result = translateToOpenAI(payload)
      
      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].role).toBe("system")
      expect(result.messages[0].content).toBe("You are a helpful assistant.\n\nAlways be polite.")
    })
  })
})