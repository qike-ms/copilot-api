import { Hono } from "hono"

import { forwardError } from "~/lib/error"
import { state } from "~/lib/state"
import { cacheModels } from "~/lib/utils"

export const modelRoutes = new Hono()

modelRoutes.get("/", async c => {
  try {
    if (!state.models) {
      // This should be handled by startup logic, but as a fallback.
      await cacheModels()
    }

    const models = state.models?.data.map(model => ({
      id: model.id,
      object: "model",
      type: "model",
      created: 0, // No date available from source
      created_at: new Date(0).toISOString(), // No date available from source
      owned_by: model.vendor,
      display_name: model.name,
    }))

    return c.json({
      object: "list",
      data: models,
      has_more: false,
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})

// New endpoint to show both GitHub Copilot and OpenAI/Anthropic formats
modelRoutes.get("/detailed", async c => {
  try {
    if (!state.models) {
      await cacheModels()
    }

    const models = state.models?.data.map(model => {
      // OpenAI-compatible format
      const openaiFormat = {
        id: model.id,
        object: "model" as const,
        type: "model" as const,
        created: 0,
        created_at: new Date(0).toISOString(),
        owned_by: model.vendor,
        display_name: model.name,
      }

      // Anthropic-compatible format (similar to OpenAI but with some differences)
      const anthropicFormat = {
        id: model.id,
        type: "model" as const,
        display_name: model.name,
        created_at: new Date(0).toISOString(),
      }

      return {
        github_copilot_format: {
          id: model.id,
          name: model.name,
          vendor: model.vendor,
          version: model.version,
          preview: model.preview,
          model_picker_enabled: model.model_picker_enabled,
          object: model.object,
          capabilities: model.capabilities,
          policy: model.policy,
        },
        openai_format: openaiFormat,
        anthropic_format: anthropicFormat,
      }
    })

    return c.json({
      object: "list",
      data: models,
      has_more: false,
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})
