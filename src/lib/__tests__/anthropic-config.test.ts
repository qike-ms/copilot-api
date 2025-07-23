/**
 * Unit tests for Anthropic configuration
 */

import { describe, it, expect, beforeEach } from "bun:test"

import { 
  getAnthropicConfig, 
  resetAnthropicConfigCache, 
  shouldUseAnthropicPassthrough 
} from "../anthropic-config"

describe("Anthropic Configuration", () => {
  beforeEach(() => {
    // Reset config cache and env vars before each test
    resetAnthropicConfigCache()
    delete process.env.ANTHROPIC_PASSTHROUGH_MODE
    delete process.env.ANTHROPIC_BASE_URL
  })

  describe("Default Configuration", () => {
    it("should return default config when no env vars are set", () => {
      const config = getAnthropicConfig()

      expect(config.enabled).toBe(false)
      expect(config.baseUrl).toBe("https://api.anthropic.com")
    })

    it("should return false for shouldUseAnthropicPassthrough by default", () => {
      expect(shouldUseAnthropicPassthrough()).toBe(false)
    })
  })

  describe("Environment Variable Override", () => {
    it("should enable passthrough when ANTHROPIC_PASSTHROUGH_MODE=true", () => {
      process.env.ANTHROPIC_PASSTHROUGH_MODE = "true"

      const config = getAnthropicConfig()
      expect(config.enabled).toBe(true)
      expect(shouldUseAnthropicPassthrough()).toBe(true)
    })

    it("should use custom base URL", () => {
      process.env.ANTHROPIC_BASE_URL = "https://custom.anthropic.com"

      const config = getAnthropicConfig()
      expect(config.baseUrl).toBe("https://custom.anthropic.com")
    })

    it("should enable passthrough without requiring API key (OAuth used)", () => {
      process.env.ANTHROPIC_PASSTHROUGH_MODE = "true"

      expect(() => getAnthropicConfig()).not.toThrow()
      const config = getAnthropicConfig()
      expect(config.enabled).toBe(true)
    })

    it("should disable passthrough when explicitly set to false", () => {
      process.env.ANTHROPIC_PASSTHROUGH_MODE = "false"

      const config = getAnthropicConfig()
      expect(config.enabled).toBe(false)
    })
  })

  describe("Configuration Caching", () => {
    it("should cache configuration on first access", () => {
      process.env.ANTHROPIC_PASSTHROUGH_MODE = "true"

      const config1 = getAnthropicConfig()

      // Change env var after first access
      process.env.ANTHROPIC_PASSTHROUGH_MODE = "false"

      const config2 = getAnthropicConfig()

      // Should return cached value
      expect(config1.enabled).toBe(true)
      expect(config2.enabled).toBe(true) // Still cached
    })

    it("should refresh cache after reset", () => {
      process.env.ANTHROPIC_PASSTHROUGH_MODE = "true"

      const config1 = getAnthropicConfig()
      expect(config1.enabled).toBe(true)

      // Reset cache and change env var
      resetAnthropicConfigCache()
      process.env.ANTHROPIC_PASSTHROUGH_MODE = "false"

      const config2 = getAnthropicConfig()
      expect(config2.enabled).toBe(false) // Should use new value
    })
  })
})