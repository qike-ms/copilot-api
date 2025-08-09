/**
 * Unit tests for tracing utilities
 */

import { describe, it, expect } from "bun:test"

import {
  generateTraceId,
  generateSessionId,
  estimateTokenCount,
  getCurrentTimestamp,
  getCurrentISOTimestamp,
  safeJsonParse,
  safeJsonStringify,
  truncateText,
  shouldTraceRequest,
  extractEndpointType,
  createTimestampedFilename,
  validateRequiredProperties,
  deepClone,
} from "../utils"

describe("Tracing Utils", () => {
  describe("ID Generation", () => {
    it("should generate unique trace IDs", () => {
      const id1 = generateTraceId()
      const id2 = generateTraceId()

      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id1).not.toBe(id2)
      expect(id1.length).toBe(32) // 16 bytes = 32 hex chars
    })

    it("should generate unique session IDs", () => {
      const session1 = generateSessionId()
      const session2 = generateSessionId()

      expect(session1).toBeDefined()
      expect(session2).toBeDefined()
      expect(session1).not.toBe(session2)
      expect(session1.startsWith("session_")).toBe(true)
    })
  })

  describe("Token Count Estimation", () => {
    it("should estimate tokens from simple messages", () => {
      const messages = [
        { role: "user", content: "Hello world" },
        { role: "assistant", content: "Hi there!" },
      ]

      const result = estimateTokenCount(messages)

      expect(result.message_count).toBe(2)
      expect(result.estimated_prompt_tokens).toBeGreaterThan(0)
    })

    it("should handle complex message content", () => {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image" },
            { type: "image", data: "base64data" },
          ],
        },
      ]

      const result = estimateTokenCount(messages)

      expect(result.message_count).toBe(1)
      expect(result.estimated_prompt_tokens).toBeGreaterThan(100) // Should include image cost
    })

    it("should handle invalid input gracefully", () => {
      const result = estimateTokenCount(null as unknown as Array<unknown>)

      expect(result.message_count).toBe(0)
      expect(result.estimated_prompt_tokens).toBe(0)
    })
  })

  describe("Timestamp Functions", () => {
    it("should return valid timestamps", () => {
      const timestamp = getCurrentTimestamp()
      const isoTimestamp = getCurrentISOTimestamp()

      expect(typeof timestamp).toBe("number")
      expect(timestamp).toBeGreaterThan(0)
      expect(typeof isoTimestamp).toBe("string")
      expect(new Date(isoTimestamp).getTime()).toBeGreaterThan(0)
    })
  })

  describe("JSON Utilities", () => {
    it("should safely parse valid JSON", () => {
      const validJson = '{"key": "value"}'
      const result = safeJsonParse(validJson)

      expect(result).toEqual({ key: "value" })
    })

    it("should return null for invalid JSON", () => {
      const invalidJson = '{"key": invalid}'
      const result = safeJsonParse(invalidJson)

      expect(result).toBeNull()
    })

    it("should safely stringify objects", () => {
      const obj = { key: "value", num: 123 }
      const result = safeJsonStringify(obj)

      expect(result).toBe('{"key":"value","num":123}')
    })

    it("should handle unstringifiable objects", () => {
      const circular: Record<string, unknown> = {}
      circular.self = circular

      const result = safeJsonStringify(circular)
      expect(result).toBe("[INVALID_JSON]")
    })
  })

  describe("Text Utilities", () => {
    it("should truncate long text", () => {
      const longText = "a".repeat(100)
      const truncated = truncateText(longText, 50)

      expect(truncated.length).toBe(50)
      expect(truncated.endsWith("...")).toBe(true)
    })

    it("should not truncate short text", () => {
      const shortText = "Hello world"
      const result = truncateText(shortText, 50)

      expect(result).toBe(shortText)
    })
  })

  describe("Request Filtering", () => {
    it("should identify traceable requests", () => {
      expect(shouldTraceRequest("/v1/chat/completions")).toBe(true)
      expect(shouldTraceRequest("/v1/messages")).toBe(true)
      expect(shouldTraceRequest("/v1/models")).toBe(true)
      expect(shouldTraceRequest("/v1/embeddings")).toBe(true)
      expect(shouldTraceRequest("/health")).toBe(false)
    })

    it("should extract correct endpoint types", () => {
      expect(extractEndpointType("/v1/chat/completions")).toBe("openai_chat")
      expect(extractEndpointType("/v1/messages")).toBe("anthropic_messages")
      expect(extractEndpointType("/v1/models")).toBe("models")
      expect(extractEndpointType("/v1/embeddings")).toBe("embeddings")
    })
  })

  describe("File Utilities", () => {
    it("should create timestamped filenames", () => {
      const filename = createTimestampedFilename("log", "json")

      expect(filename).toMatch(/^log-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/)
    })
  })

  describe("Validation", () => {
    it("should validate required properties", () => {
      const obj = { name: "test", age: 25 }

      expect(validateRequiredProperties(obj, ["name", "age"])).toBe(true)
      expect(validateRequiredProperties(obj, ["name", "age", "email"])).toBe(false)
      expect(validateRequiredProperties(null, ["name"])).toBe(false)
    })
  })

  describe("Deep Clone", () => {
    it("should deep clone objects", () => {
      const obj = {
        name: "test",
        nested: { value: 123 },
        array: [1, 2, { inner: "value" }],
      }

      const cloned = deepClone(obj)

      expect(cloned).toEqual(obj)
      expect(cloned).not.toBe(obj)
      expect(cloned.nested).not.toBe(obj.nested)
      expect(cloned.array).not.toBe(obj.array)
    })

    it("should handle primitive values", () => {
      expect(deepClone(42)).toBe(42)
      expect(deepClone("string")).toBe("string")
      expect(deepClone(null)).toBe(null)
      const undefinedResult = deepClone(undefined)
      expect(undefinedResult).toBe(undefined)
    })

    it("should handle dates", () => {
      const date = new Date()
      const cloned = deepClone(date)

      expect(cloned).toEqual(date)
      expect(cloned).not.toBe(date)
    })
  })
})
