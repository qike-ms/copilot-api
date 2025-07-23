/**
 * Configuration management for the tracing system
 */

import { existsSync, mkdirSync } from "fs"
import { join } from "path"

import type { TracingConfig } from "./types"

const DEFAULT_CONFIG: TracingConfig = {
  enabled: false,
  logDirectory: "traces/",
  maxLogSizeKB: 1000,
  maxArchiveFiles: 50,
  redactHeaders: true,
  includeStreamingChunks: false,
  logLevel: "info",
}

let configCache: TracingConfig | null = null

/**
 * Gets the tracing configuration from environment variables and defaults
 */
export function getTracingConfig(): TracingConfig {
  if (configCache) {
    return configCache
  }

  const config: TracingConfig = {
    enabled: process.env.COPILOT_TRACE_ENABLED === "true",
    logDirectory: process.env.COPILOT_TRACE_DIR ?? DEFAULT_CONFIG.logDirectory,
    maxLogSizeKB: parseInt(process.env.COPILOT_TRACE_MAX_SIZE ?? String(DEFAULT_CONFIG.maxLogSizeKB), 10),
    maxArchiveFiles: parseInt(process.env.COPILOT_TRACE_MAX_ARCHIVES ?? String(DEFAULT_CONFIG.maxArchiveFiles), 10),
    redactHeaders: process.env.COPILOT_TRACE_REDACT_HEADERS !== "false",
    includeStreamingChunks: process.env.COPILOT_TRACE_STREAMING === "true",
    logLevel: (process.env.COPILOT_TRACE_LOG_LEVEL as TracingConfig["logLevel"]) ?? DEFAULT_CONFIG.logLevel,
  }

  // Validate and sanitize values
  config.maxLogSizeKB = Math.max(1, config.maxLogSizeKB)
  config.maxArchiveFiles = Math.max(1, config.maxArchiveFiles)

  // Ensure log directory exists if tracing is enabled
  ensureLogDirectory(config.logDirectory)

  configCache = config
  return config
}

/**
 * Ensures the log directory exists
 */
export function ensureLogDirectory(logDirectory: string): void {
  try {
    if (!existsSync(logDirectory)) {
      mkdirSync(logDirectory, { recursive: true })
    }

    // Ensure archive subdirectory exists
    const archiveDir = join(logDirectory, "archive")
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true })
    }
  } catch (error) {
    console.error("Failed to create tracing log directory:", error)
  }
}

/**
 * Resets the configuration cache (useful for testing)
 */
export function resetConfigCache(): void {
  configCache = null
}

/**
 * Updates configuration and resets cache
 */
export function updateTracingConfig(updates: Partial<TracingConfig>): void {
  configCache = null

  // Update environment variables to persist changes
  if (updates.enabled !== undefined) {
    process.env.COPILOT_TRACE_ENABLED = String(updates.enabled)
  }
  if (updates.logDirectory !== undefined) {
    process.env.COPILOT_TRACE_DIR = updates.logDirectory
  }
  if (updates.maxLogSizeKB !== undefined) {
    process.env.COPILOT_TRACE_MAX_SIZE = String(updates.maxLogSizeKB)
  }
  if (updates.maxArchiveFiles !== undefined) {
    process.env.COPILOT_TRACE_MAX_ARCHIVES = String(updates.maxArchiveFiles)
  }
  if (updates.redactHeaders !== undefined) {
    process.env.COPILOT_TRACE_REDACT_HEADERS = String(updates.redactHeaders)
  }
  if (updates.includeStreamingChunks !== undefined) {
    process.env.COPILOT_TRACE_STREAMING = String(updates.includeStreamingChunks)
  }
  if (updates.logLevel !== undefined) {
    process.env.COPILOT_TRACE_LOG_LEVEL = updates.logLevel
  }
}
