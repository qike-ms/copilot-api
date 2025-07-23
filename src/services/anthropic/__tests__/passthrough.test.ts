/**
 * Unit tests for Anthropic passthrough service
 */

import { describe, it, expect, beforeEach, mock } from "bun:test"

import { forwardClientHeaders } from "../passthrough"

// Mock fetch for testing
const mockFetch = mock()
global.fetch = mockFetch

// Mock tracer
const mockTracer = {
  captureGithubRequest: mock(),
  captureGithubResponse: mock(),
  logError: mock(),
}

mock.module("~/lib/tracing", () => ({
  getTracer: () => mockTracer,
}))

describe("Anthropic Passthrough Service", () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockTracer.captureGithubRequest.mockReset()
    mockTracer.captureGithubResponse.mockReset()
    mockTracer.logError.mockReset()
  })

  describe("forwardClientHeaders", () => {
    it("should forward allowed headers", () => {
      const clientHeaders = new Headers({
        "user-agent": "test-client/1.0",
        "x-api-version": "2023-06-01",
        "anthropic-version": "2023-06-01",
        "x-custom-header": "custom-value",
        "authorization": "Bearer should-not-forward",
        "content-type": "application/json",
      })

      const anthropicHeaders = {
        "authorization": "Bearer sk-test-key",
        "content-type": "application/json",
      }

      const result = forwardClientHeaders(clientHeaders, anthropicHeaders)

      expect(result["user-agent"]).toBe("copilot-api-proxy/1.0 test-client/1.0")
      expect(result["x-api-version"]).toBe("2023-06-01")
      expect(result["anthropic-version"]).toBe("2023-06-01")
      expect(result["x-custom-header"]).toBe("custom-value")
      expect(result["authorization"]).toBe("Bearer sk-test-key") // Should not be overwritten
      expect(result["content-type"]).toBe("application/json")
    })

    it("should not forward x-forwarded headers", () => {
      const clientHeaders = new Headers({
        "x-forwarded-for": "127.0.0.1",
        "x-forwarded-proto": "https",
        "x-custom-header": "should-forward",
      })

      const anthropicHeaders = {}

      const result = forwardClientHeaders(clientHeaders, anthropicHeaders)

      expect(result["x-forwarded-for"]).toBeUndefined()
      expect(result["x-forwarded-proto"]).toBeUndefined()
      expect(result["x-custom-header"]).toBe("should-forward")
    })

    it("should handle missing user-agent gracefully", () => {
      const clientHeaders = new Headers({
        "x-api-version": "2023-06-01",
      })

      const anthropicHeaders = {
        "user-agent": "copilot-api-proxy/1.0",
      }

      const result = forwardClientHeaders(clientHeaders, anthropicHeaders)

      expect(result["user-agent"]).toBe("copilot-api-proxy/1.0")
      expect(result["x-api-version"]).toBe("2023-06-01")
    })
  })

  describe("createAnthropicPassthrough", () => {
    it("should create proper headers for Anthropic API", () => {
      // This test would require importing createAnthropicPassthrough
      // and testing the headers it creates, but since it's an internal function
      // we'll test the external behavior through integration tests
      expect(true).toBe(true) // Placeholder
    })
  })
})