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

    // Check if HTML format is requested
    const acceptHeader = c.req.header("Accept") ?? ""
    const formatParam = c.req.query("format")

    if (formatParam === "html" || acceptHeader.includes("text/html")) {
      const html = generateModelComparisonHTML(models ?? [])
      return c.html(html)
    }

    return c.json({
      object: "list",
      data: models,
      has_more: false,
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})

// Generate HTML for model comparison view
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
function generateModelComparisonHTML(
  models: Array<{
    github_copilot_format: any
    openai_format: any
    anthropic_format: any
  }>,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Model Format Comparison - Copilot API</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            color: #333;
        }
        .model-card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 30px;
            overflow: hidden;
        }
        .model-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
        }
        .model-id {
            font-size: 1.5em;
            font-weight: bold;
            margin: 0;
        }
        .model-meta {
            font-size: 0.9em;
            opacity: 0.9;
            margin-top: 5px;
        }
        .formats-container {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 0;
        }
        .format-column {
            padding: 20px;
            border-right: 1px solid #eee;
        }
        .format-column:last-child {
            border-right: none;
        }
        .format-title {
            font-weight: bold;
            color: #333;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 2px solid #eee;
            font-size: 1.1em;
        }
        .github-title { border-bottom-color: #24292e; }
        .openai-title { border-bottom-color: #00a67e; }
        .anthropic-title { border-bottom-color: #d4a574; }
        
        .json-container {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 15px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
            font-size: 12px;
            line-height: 1.4;
            overflow-x: auto;
            max-height: 400px;
            overflow-y: auto;
        }
        .json-key { color: #0969da; }
        .json-string { color: #032f62; }
        .json-number { color: #0550ae; }
        .json-boolean { color: #8250df; }
        .json-null { color: #6f42c1; }
        
        @media (max-width: 1200px) {
            .formats-container {
                grid-template-columns: 1fr;
            }
            .format-column {
                border-right: none;
                border-bottom: 1px solid #eee;
            }
            .format-column:last-child {
                border-bottom: none;
            }
        }
        .summary {
            text-align: center;
            color: #666;
            margin-top: 30px;
            padding: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 Model Format Comparison</h1>
        <p>GitHub Copilot API models shown in different API format standards</p>
    </div>

    ${models
      .map(
        model => `
        <div class="model-card">
            <div class="model-header">
                <h2 class="model-id">${model.github_copilot_format.id}</h2>
                <div class="model-meta">
                    ${model.github_copilot_format.vendor} • ${model.github_copilot_format.version}
                    ${model.github_copilot_format.preview ? " • Preview" : ""}
                </div>
            </div>
            <div class="formats-container">
                <div class="format-column">
                    <div class="format-title github-title">GitHub Copilot Format</div>
                    <div class="json-container">${syntaxHighlightJSON(model.github_copilot_format)}</div>
                </div>
                <div class="format-column">
                    <div class="format-title openai-title">OpenAI Format</div>
                    <div class="json-container">${syntaxHighlightJSON(model.openai_format)}</div>
                </div>
                <div class="format-column">
                    <div class="format-title anthropic-title">Anthropic Format</div>
                    <div class="json-container">${syntaxHighlightJSON(model.anthropic_format)}</div>
                </div>
            </div>
        </div>
    `,
      )
      .join("")}

    <div class="summary">
        <p><strong>${models.length}</strong> models available across all formats</p>
        <p>
            <strong>API Endpoints:</strong><br>
            JSON: <code>GET /models/detailed</code><br>
            HTML: <code>GET /models/detailed?format=html</code>
        </p>
    </div>
</body>
</html>`
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

// Simple JSON syntax highlighting
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syntaxHighlightJSON(obj: any): string {
  const json = JSON.stringify(obj, null, 2)
  return json
    .replace(/("[\w_-]+")(\s*:)/g, '<span class="json-key">$1</span>$2')
    .replace(/:\s*"([^"]+)"/g, ': <span class="json-string">"$1"</span>')
    .replace(/:\s*(\d+)/g, ': <span class="json-number">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>')
    .replace(/\n/g, "<br>")
    .replace(/ {2}/g, "&nbsp;&nbsp;")
}
