/**
 * Unit tests for tracing configuration
 */

import { describe, it, expect, beforeEach } from "bun:test"

import { getTracingConfig, resetConfigCache, updateTracingConfig } from "../config"

describe("Tracing Configuration", () => {
  beforeEach(() => {
    // Reset config cache and env vars before each test
    resetConfigCache()
    delete process.env.COPILOT_TRACE_ENABLED
    delete process.env.COPILOT_TRACE_DIR
    delete process.env.COPILOT_TRACE_MAX_SIZE
    delete process.env.COPILOT_TRACE_MAX_ARCHIVES
    delete process.env.COPILOT_TRACE_REDACT_HEADERS
    delete process.env.COPILOT_TRACE_STREAMING
    delete process.env.COPILOT_TRACE_LOG_LEVEL
  })

  describe("Default Configuration", () => {
    it("should return default config when no env vars are set", () => {
      const config = getTracingConfig()

      expect(config.enabled).toBe(false)
      expect(config.logDirectory).toBe("traces/")
      expect(config.maxLogSizeKB).toBe(1000)
      expect(config.maxArchiveFiles).toBe(50)
      expect(config.redactHeaders).toBe(true)
      expect(config.includeStreamingChunks).toBe(false)
      expect(config.logLevel).toBe("info")
    })
  })

  describe("Environment Variable Override", () => {
    it("should enable tracing when COPILOT_TRACE_ENABLED=true", () => {
      process.env.COPILOT_TRACE_ENABLED = "true"

      const config = getTracingConfig()
      expect(config.enabled).toBe(true)
    })

    it("should use custom log directory", () => {
      process.env.COPILOT_TRACE_DIR = "./custom-traces"

      const config = getTracingConfig()
      expect(config.logDirectory).toBe("./custom-traces")
    })

    it("should use custom max log size", () => {
      process.env.COPILOT_TRACE_MAX_SIZE = "200"

      const config = getTracingConfig()
      expect(config.maxLogSizeKB).toBe(200)
    })

    it("should use custom max archive files", () => {
      process.env.COPILOT_TRACE_MAX_ARCHIVES = "25"

      const config = getTracingConfig()
      expect(config.maxArchiveFiles).toBe(25)
    })

    it("should disable header redaction when explicitly set to false", () => {
      process.env.COPILOT_TRACE_REDACT_HEADERS = "false"

      const config = getTracingConfig()
      expect(config.redactHeaders).toBe(false)
    })

    it("should enable streaming chunks when set to true", () => {
      process.env.COPILOT_TRACE_STREAMING = "true"

      const config = getTracingConfig()
      expect(config.includeStreamingChunks).toBe(true)
    })

    it("should use custom log level", () => {
      process.env.COPILOT_TRACE_LOG_LEVEL = "debug"

      const config = getTracingConfig()
      expect(config.logLevel).toBe("debug")
    })
  })

  describe("Value Validation", () => {
    it("should enforce minimum values for numeric settings", () => {
      process.env.COPILOT_TRACE_MAX_SIZE = "0"
      process.env.COPILOT_TRACE_MAX_ARCHIVES = "-5"

      const config = getTracingConfig()
      expect(config.maxLogSizeKB).toBe(1) // Should be at least 1
      expect(config.maxArchiveFiles).toBe(1) // Should be at least 1
    })
  })

  describe("Configuration Caching", () => {
    it("should cache configuration on first access", () => {
      process.env.COPILOT_TRACE_ENABLED = "true"

      const config1 = getTracingConfig()

      // Change env var after first access
      process.env.COPILOT_TRACE_ENABLED = "false"

      const config2 = getTracingConfig()

      // Should return cached value
      expect(config1.enabled).toBe(true)
      expect(config2.enabled).toBe(true) // Still cached
    })

    it("should refresh cache after reset", () => {
      process.env.COPILOT_TRACE_ENABLED = "true"

      const config1 = getTracingConfig()
      expect(config1.enabled).toBe(true)

      // Reset cache and change env var
      resetConfigCache()
      process.env.COPILOT_TRACE_ENABLED = "false"

      const config2 = getTracingConfig()
      expect(config2.enabled).toBe(false) // Should use new value
    })
  })

  describe("Configuration Updates", () => {
    it("should update configuration and reset cache", () => {
      const originalConfig = getTracingConfig()
      expect(originalConfig.enabled).toBe(false)

      updateTracingConfig({ enabled: true })

      const updatedConfig = getTracingConfig()
      expect(updatedConfig.enabled).toBe(true)
    })

    it("should update multiple config values", () => {
      updateTracingConfig({
        enabled: true,
        maxLogSizeKB: 500,
        logLevel: "debug",
      })

      const config = getTracingConfig()
      expect(config.enabled).toBe(true)
      expect(config.maxLogSizeKB).toBe(500)
      expect(config.logLevel).toBe("debug")
    })
  })
})
