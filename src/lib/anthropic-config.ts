/**
 * Configuration for Anthropic API direct passthrough mode
 */

export interface AnthropicConfig {
  enabled: boolean
  baseUrl: string
}

let cachedConfig: AnthropicConfig | null = null

export function getAnthropicConfig(): AnthropicConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const enabled = process.env.ANTHROPIC_PASSTHROUGH_MODE === "true"
  const baseUrl = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"

  cachedConfig = {
    enabled,
    baseUrl,
  }

  return cachedConfig
}

export function resetAnthropicConfigCache(): void {
  cachedConfig = null
}

export function shouldUseAnthropicPassthrough(): boolean {
  return getAnthropicConfig().enabled
}