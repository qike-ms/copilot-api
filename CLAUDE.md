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

## Other Notes

- Ensure Bun (>= 1.2.x) is installed for all scripts and local dev.
- Tokens and cache are handled automatically; manual authentication can be forced with the `auth` subcommand.
- No .cursorrules, .github/copilot-instructions.md, or .cursor/rules found, so follow typical TypeScript/Bun/ESLint conventions as seen in this codebase.
