/**
 * Common utilities for the tracing system
 * Includes header redaction, ID generation, token counting, and other shared functions
 */

import { randomBytes } from "crypto"

import { TokenCount } from "./types"

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
 * Redacts sensitive information from headers
 */
export function redactSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
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
 * Estimates token count from messages (simplified version of existing getTokenCount)
 * Based on the existing implementation in the codebase
 */
export function estimateTokenCount(messages: Array<any>): TokenCount {
  if (!Array.isArray(messages)) {
    return {
      estimated_prompt_tokens: 0,
      message_count: 0,
    }
  }

  let totalTokens = 0
  const messageCount = messages.length

  for (const message of messages) {
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
export function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

/**
 * Safely stringifies JSON with fallback
 */
export function safeJsonStringify(obj: any, space?: number): string {
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
  const urlString = typeof url === "string" ? url : url.toString()

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
export function validateRequiredProperties(obj: any, properties: Array<string>): boolean {
  if (!obj || typeof obj !== "object") {
    return false
  }

  return properties.every(prop => obj.hasOwnProperty(prop))
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

  const cloned: any = {}
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key])
    }
  }

  return cloned
}

/**
 * Gets file size in bytes
 */
export function getFileSizeInBytes(filePath: string): number {
  try {
    const fs = require("fs")
    const stats = fs.statSync(filePath)
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
    const fs = require("fs")
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}
