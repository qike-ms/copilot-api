# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Install dependencies**: `bun install`
- **Build**: `bun run build`
- **Dev server (watch)**: `bun run dev`
- **Production start**: `bun run start`
- **Lint**: `bun run lint`
- **Pre-commit lint/fix**: Runs automatically via git hooks (bunx eslint --fix)

## Architecture Overview

- **Entry point**: `src/main.ts` defines CLI subcommands (`start` and `auth`) for the Copilot API server and authentication flow.
- **Server**: `src/server.ts` sets up HTTP routes using Hono, maps OpenAI/Anthropic-compatible endpoints, and handles logging/cors.
- **Routes**: Handlers for chat completions, embeddings, models, and messages are under `src/routes/`, providing API endpoints compatible with OpenAI and Anthropic APIs.
- **Copilot communication**: `src/services/copilot/` contains methods for proxying requests (chat completions, model listing, embeddings) to the GitHub Copilot backend using user tokens.
- **Lib utilities**: `src/lib/` contains configuration, token, model caching, and error handling helpers.
- **Authentication**: `src/auth.ts` provides the CLI handler for authenticating with GitHub, managing required tokens, and persisting them locally.

## OAuth Flow

Uses GitHub's Device Flow (OAuth 2.0 Device Authorization Grant):

1. **Device Code Request** (`src/services/github/get-device-code.ts:9-21`): POST to `github.com/login/device/code` with client ID and scopes
2. **User Authorization** (`src/lib/token.ts:69-71`): User visits URL and enters displayed code to authorize app
3. **Token Polling** (`src/services/github/poll-access-token.ts:12-51`): Polls `github.com/login/oauth/access_token` until access token received
4. **Token Storage** (`src/lib/token.ts:74-75`): GitHub token saved to filesystem for persistence
5. **Copilot Token Exchange** (`src/services/github/get-copilot-token.ts:5-15`): GitHub token exchanges for Copilot token via `/copilot_internal/v2/token`
6. **Auto-refresh** (`src/lib/token.ts:28-42`): Copilot token automatically refreshes based on `refresh_in` interval

See `docs/auth.md` for complete authentication documentation.

## API Endpoints

- **OpenAI-compatible**:
  - `POST /v1/chat/completions`
  - `GET /v1/models`
  - `POST /v1/embeddings`
- **Anthropic-compatible**:
  - `POST /v1/messages`
  - `POST /v1/messages/count_tokens`
- **Usage monitoring**:
  - `GET /usage` - Copilot usage statistics and quota information
  - `GET /token` - Current Copilot token information
- **Tracing system**:
  - `GET /traces` - List recent API traces with pagination
  - `GET /traces/stats` - Trace statistics and counts
  - `GET /traces/errors` - Error traces only
  - `GET /traces/search` - Search traces by criteria
  - `DELETE /traces` - Clear all traces (development only)
  - `GET /trace-config` - Current trace configuration
  - `PUT /trace-config` - Update trace configuration
  - `POST /trace-config/reset` - Reset trace configuration to defaults

## Model Discovery System

The code dynamically discovers GitHub Copilot's supported models through:

1. **Model fetching** (`src/services/copilot/get-models.ts:5-12`): Makes GET request to `{copilotBaseUrl}/models` with proper auth headers
2. **Caching** (`src/lib/utils.ts:16-19`): `cacheModels()` stores models in global state, called at startup (`src/start.ts:56`)
3. **Model structure**: Each model includes capabilities (context limits, tool support), metadata (vendor, version), and feature flags
4. **API transformation** (`src/routes/models/route.ts:16-24`): Converts GitHub's format to OpenAI-compatible format for `/v1/models` endpoint

See `docs/model-routing.md` for complete model routing documentation.

## Logging

Comprehensive request/response logging available via `--verbose` flag:
- HTTP requests/responses via Hono logger middleware (`src/server.ts:14`)
- API payloads and responses in chat completions and Anthropic message handlers
- OAuth token exchange and refresh cycles
- Rate limiting and system events
- See `docs/logging.md` for complete logging reference

## Tracing System

Comprehensive API request-response tracing for debugging and analysis:

1. **File Management** (`src/lib/tracing/file-manager.ts:5-15`): Handles trace storage in JSON array format with automatic file rotation and archiving
2. **Tracer Implementation** (`src/lib/tracing/tracer.ts:10-20`): Core tracing logic that captures requests, responses, and metadata for all API endpoints
3. **Route Handlers** (`src/routes/traces/handlers.ts:8-25`): API endpoints for trace management including listing, searching, and configuration
4. **Configuration Management** (`src/routes/trace-config/handlers.ts:5-12`): Real-time trace configuration updates and reset functionality
5. **Integration Points**: Tracing is integrated into chat completions (`src/routes/chat-completions/handler.ts:45-50`) and messages handlers (`src/routes/messages/handler.ts:35-40`)

Traces are stored in `traces/log.json` as JSON arrays and can be accessed via API endpoints or direct file reading. The system supports configurable storage limits, automatic archiving, and real-time configuration updates.

See `docs/trace-quick-guide.md` for complete tracing documentation.

## Anthropic Direct Passthrough

The server supports bypassing GitHub Copilot translation and forwarding requests directly to Anthropic's API:

1. **Configuration** (`src/lib/anthropic-config.ts:5-25`): Environment variables control passthrough mode
2. **Passthrough Service** (`src/services/anthropic/passthrough.ts:10-30`): Direct HTTP forwarding to Anthropic API with header preservation
3. **Handler Integration** (`src/routes/messages/handler.ts:22-26`): Mode detection routes requests to translation or passthrough
4. **Tracing Support**: All passthrough requests are captured in the existing tracing system

### Environment Variables

- `ANTHROPIC_PASSTHROUGH_MODE=true` - Enable direct passthrough (default: false)
- `ANTHROPIC_BASE_URL` - Anthropic API base URL (default: https://api.anthropic.com)
- `ANTHROPIC_API_KEY` - Required when passthrough mode enabled

When passthrough is enabled, `/v1/messages` requests bypass translation and forward directly to Anthropic, maintaining full compatibility while providing a fallback mechanism for translation issues.

See `docs/projectplan-anthropic-passthrough.md` for complete implementation details.

## Other Notes

- Ensure Bun (>= 1.2.x) is installed for all scripts and local dev.
- Tokens and cache are handled automatically; manual authentication can be forced with the `auth` subcommand.
- No .cursorrules, .github/copilot-instructions.md, or .cursor/rules found, so follow typical TypeScript/Bun/ESLint conventions as seen in this codebase.
