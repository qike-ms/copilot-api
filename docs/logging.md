# Logging

This document describes the logging capabilities of the Copilot API proxy server.

## Enabling Verbose Logging

Use the `--verbose` or `-v` flag to enable detailed debug logging:

```bash
# Start server with verbose logging
bun run start --verbose
npx copilot-api@latest start --verbose

# Auth flow with verbose logging
bun run auth --verbose
npx copilot-api@latest auth --verbose
```

The verbose flag sets `consola.level = 5` for maximum verbosity (`src/start.ts:31`, `src/auth.ts:17`).

## HTTP Request Logging

All HTTP requests are logged via Hono's logger middleware (`src/server.ts:14`), showing:
- Request method and path
- Response status codes
- Response times

## API Request/Response Logging

### Chat Completions (`src/routes/chat-completions/handler.ts`)

- **Request payload** (line 21): Last 400 characters of the request
- **Token count** (line 23): Current token count for the request
- **Non-streaming responses** (line 42): Full response data
- **Streaming mode** (line 46): Stream start notification
- **Streaming chunks** (line 49): Individual streaming response chunks

```
consola.debug("Request payload:", JSON.stringify(payload).slice(-400))
consola.info("Current token count:", getTokenCount(payload.messages))
consola.debug("Non-streaming response:", JSON.stringify(response))
consola.debug("Streaming chunk:", JSON.stringify(chunk))
```

### Anthropic Messages (`src/routes/messages/handler.ts`)

- **Request payload** (line 30): Anthropic-formatted request payload
- **OpenAI translation** (line 33): Converted OpenAI format
- **Response translation** (line 45): Non-streaming response conversion
- **Stream events** (lines 67, 80): Raw Copilot events and translated Anthropic events

```
consola.debug("Anthropic request payload:", JSON.stringify(anthropicPayload))
consola.debug("Copilot raw stream event:", JSON.stringify(rawEvent))
consola.debug("Translated Anthropic event:", JSON.stringify(event))
```

## Authentication Logging

### OAuth Flow (`src/services/github/poll-access-token.ts`)

- **Polling interval** (line 18): Token polling frequency
- **Polling responses** (line 42): OAuth token exchange responses

```
consola.debug(`Polling access token with interval of ${sleepDuration}ms`)
consola.debug("Polling access token response:", json)
```

### Token Management (`src/lib/token.ts`)

- **Token fetch** (line 23): Copilot token acquisition
- **Token display** (lines 25, 36): Token values (when `--show-token` used)
- **Token refresh** (lines 30, 34): Automatic token refresh cycle
- **User info** (line 94): Logged in user details

```
consola.debug("GitHub Copilot Token fetched successfully!")
consola.debug("Refreshing Copilot token")
consola.debug("Copilot token refreshed")
consola.info(`Logged in as ${user.login}`)
```

## System Logging

### Rate Limiting (`src/lib/rate-limit.ts`)

- **Rate limit completion** (line 44): When rate limit wait period ends

```
consola.info("Rate limit wait completed, proceeding with request")
```

### Startup (`src/start.ts`)

- **Account type** (line 37): GitHub account plan being used
- **Available models** (line 58): List of discovered Copilot models
- **VSCode version** (`src/lib/utils.ts:25`): Detected VSCode version

```
consola.info(`Using ${options.accountType} plan GitHub account`)
consola.info(`Available models: \n${state.models?.data.map((model) => `- ${model.id}`).join("\n")}`)
consola.info(`Using VSCode version: ${response}`)
```

## Log Levels

The application uses `consola` with these levels:
- **info**: General operational information
- **debug**: Detailed debugging information (enabled with `--verbose`)
- **error**: Error conditions
- **success**: Successful operations

## Security Considerations

- Tokens are only displayed when using `--show-token` flag
- Request payloads are truncated to last 400 characters to avoid excessive logging
- OAuth responses may contain sensitive information in debug mode