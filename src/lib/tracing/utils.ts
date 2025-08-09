/**
 * Common utilities for the tracing system
 * Includes header redaction, ID generation, token counting, and other shared functions
 */

import { randomBytes } from "crypto"
import { statSync, existsSync } from "fs"

import { TokenCount } from "./types"

// Types for message structures
interface MessageContent {
  type?: string
  text?: string
}

interface ToolCall {
  function?: {
    name?: string
    arguments?: string | unknown
  }
}

interface Message {
  role?: string
  content?: string | Array<MessageContent>
  tool_calls?: Array<ToolCall>
}

/**
 * Generates a unique trace ID
 */
export function generateTraceId(): string {
  return randomBytes(16).toString("hex")
}

/**
 * Generates a unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${randomBytes(8).toString("hex")}`
}

/**
 * Gets current timestamp in seconds (Unix timestamp)
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Gets current timestamp as ISO string
 */
export function getCurrentISOTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Calculates processing time in milliseconds between start and end timestamps
 */
export function calculateProcessingTime(startTime: number, endTime: number): number {
  return (endTime - startTime) * 1000 // Convert from seconds to milliseconds
}

/**
 * Estimates token count from messages (simplified version of existing getTokenCount)
 * Based on the existing implementation in the codebase
 */
export function estimateTokenCount(messages: Array<unknown>): TokenCount {
  if (!Array.isArray(messages)) {
    return {
      estimated_prompt_tokens: 0,
      message_count: 0,
    }
  }

  let totalTokens = 0
  const messageCount = messages.length

  for (const msg of messages) {
    const message = msg as Message
    if (message && typeof message === "object") {
      // Count tokens in content
      if (message.content) {
        if (typeof message.content === "string") {
          // Rough estimate: ~4 chars per token
          totalTokens += Math.ceil(message.content.length / 4)
        } else if (Array.isArray(message.content)) {
          // Handle multi-modal content
          for (const content of message.content) {
            if (content?.text && typeof content.text === "string") {
              totalTokens += Math.ceil(content.text.length / 4)
            }
            // Add extra tokens for images/other media
            if (content?.type && content.type !== "text") {
              totalTokens += 100 // Rough estimate for media tokens
            }
          }
        }
      }

      // Count tokens in role (small overhead)
      if (message.role) {
        totalTokens += 2
      }

      // Count tokens in tool calls
      if (message.tool_calls && Array.isArray(message.tool_calls)) {
        for (const toolCall of message.tool_calls) {
          if (toolCall?.function?.name) {
            totalTokens += Math.ceil(toolCall.function.name.length / 4) + 5
          }
          if (toolCall?.function?.arguments) {
            const argsStr =
              typeof toolCall.function.arguments === "string" ?
                toolCall.function.arguments
              : JSON.stringify(toolCall.function.arguments)
            totalTokens += Math.ceil(argsStr.length / 4)
          }
        }
      }
    }
  }

  return {
    estimated_prompt_tokens: totalTokens,
    message_count: messageCount,
  }
}

/**
 * Safely parses JSON, returns null if invalid
 */
export function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

/**
 * Safely stringifies JSON with fallback
 */
export function safeJsonStringify(obj: unknown, space?: number): string {
  try {
    return JSON.stringify(obj, null, space)
  } catch {
    return "[INVALID_JSON]"
  }
}

/**
 * Truncates text to specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.substring(0, maxLength - 3) + "..."
}

/**
 * Determines if a URL should be traced based on endpoint patterns
 */
export function shouldTraceRequest(url: string, includeAll = false): boolean {
  const urlString = typeof url === "string" ? url : String(url)

  if (includeAll) {
    return urlString.includes("api.github") || urlString.includes("copilot") || urlString.includes("anthropic.com")
  }

  // Focus on key endpoints
  return (
    urlString.includes("/v1/chat/completions") ||
    urlString.includes("/v1/models") ||
    urlString.includes("/v1/messages") ||
    urlString.includes("/v1/embeddings")
  )
}

/**
 * Extracts endpoint type from URL
 */
export function extractEndpointType(url: string): "openai_chat" | "anthropic_messages" | "models" | "embeddings" {
  const urlString = url.toLowerCase()

  if (urlString.includes("/chat/completions")) {
    return "openai_chat"
  } else if (urlString.includes("/messages")) {
    return "anthropic_messages"
  } else if (urlString.includes("/models")) {
    return "models"
  } else if (urlString.includes("/embeddings")) {
    return "embeddings"
  }

  // Default fallback
  return "openai_chat"
}

/**
 * Creates a timestamp-based filename
 */
export function createTimestampedFilename(prefix: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, -5) // Remove milliseconds and Z

  return `${prefix}-${timestamp}.${extension}`
}

/**
 * Validates that an object has required properties
 */
export function validateRequiredProperties(obj: unknown, properties: Array<string>): boolean {
  if (!obj || typeof obj !== "object") {
    return false
  }

  const objectWithProps = obj as Record<string, unknown>
  return properties.every(prop => Object.prototype.hasOwnProperty.call(objectWithProps, prop))
}

/**
 * Deep clones an object (simple version, good enough for tracing data)
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T
  }

  const cloned: Record<string, unknown> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone((obj as Record<string, unknown>)[key])
    }
  }

  return cloned as T
}

/**
 * Gets file size in bytes
 */
export function getFileSizeInBytes(filePath: string): number {
  try {
    const stats = statSync(filePath)
    return stats.size
  } catch {
    return 0
  }
}

/**
 * Converts bytes to KB
 */
export function bytesToKB(bytes: number): number {
  return Math.round(bytes / 1024)
}

/**
 * Checks if a file exists
 */
export function fileExists(filePath: string): boolean {
  try {
    return existsSync(filePath)
  } catch {
    return false
  }
}
