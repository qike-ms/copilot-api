# Authentication

This document describes the OAuth authentication flow used by the Copilot API proxy server.

## Overview

The application uses GitHub's Device Flow (OAuth 2.0 Device Authorization Grant) to authenticate users and obtain access to GitHub Copilot. This flow is ideal for CLI applications where users can't easily redirect to localhost.

## Authentication Flow

### 1. Device Code Request

**File**: `src/services/github/get-device-code.ts:9-21`

Makes a POST request to `https://github.com/login/device/code` with:
- **Client ID**: `Iv1.b507a08c87ecfe98` (defined in `src/lib/api-config.ts:51`)
- **Scopes**: `read:user` (defined in `src/lib/api-config.ts:52`)

**Response includes**:
- `device_code`: Used for polling
- `user_code`: Displayed to user
- `verification_uri`: URL for user authorization
- `expires_in`: Code expiration time
- `interval`: Polling frequency

### 2. User Authorization

**File**: `src/lib/token.ts:69-71`

The application displays instructions to the user:
```
Please enter the code "ABC-DEF" in https://github.com/login/device/verify
```

User must:
1. Visit the verification URL
2. Enter the displayed user code
3. Authorize the application

### 3. Token Polling

**File**: `src/services/github/poll-access-token.ts:12-51`

The application polls `https://github.com/login/oauth/access_token` with:
- **Method**: POST
- **Body**: Device code and grant type
- **Grant Type**: `urn:ietf:params:oauth:grant-type:device_code`
- **Interval**: Based on response from step 1 (plus 1 second buffer)

Polling continues until:
- Access token is received
- Device code expires
- Error occurs

### 4. Token Storage

**File**: `src/lib/token.ts:74-75`

Once received, the GitHub access token is:
- Saved to filesystem via `PATHS.GITHUB_TOKEN_PATH`
- Stored in global state (`state.githubToken`)
- Used for future sessions (persistent)

### 5. Copilot Token Exchange

**File**: `src/services/github/get-copilot-token.ts:5-15`

The GitHub token is exchanged for a Copilot-specific token:
- **Endpoint**: `https://api.github.com/copilot_internal/v2/token`
- **Headers**: Include GitHub token and VSCode user agent
- **Response**: Copilot token with expiration info

### 6. Automatic Token Refresh

**File**: `src/lib/token.ts:28-42`

Copilot tokens have shorter lifespans and auto-refresh:
- **Refresh timing**: Based on `refresh_in` field (minus 60 second buffer)
- **Automatic**: Runs in background interval
- **Error handling**: Logs errors and throws to stop server

## CLI Commands

### Auth Command

**File**: `src/auth.ts`

```bash
# Run authentication flow
bun run auth
npx copilot-api@latest auth

# With verbose logging
bun run auth --verbose

# Show tokens after auth
bun run auth --show-token
```

**Options**:
- `--verbose`, `-v`: Enable detailed debug logging
- `--show-token`: Display tokens in console output

### Start Command Auth

**File**: `src/start.ts:49-56`

Authentication happens automatically when starting the server:
1. Check for existing GitHub token
2. If none exists, run OAuth flow
3. Exchange for Copilot token
4. Cache available models
5. Start server

Force re-authentication:
```bash
bun run auth --force
```

## Token Management

### Token Storage Locations

**File**: `src/lib/paths.ts`

Tokens are stored in user-specific directories:
- **macOS**: `~/Library/Application Support/copilot-api/`
- **Linux**: `~/.config/copilot-api/`
- **Windows**: `%APPDATA%/copilot-api/`

### Token Types

1. **GitHub Token**:
   - Long-lived (no expiration in response)
   - Stored on filesystem
   - Used to obtain Copilot tokens

2. **Copilot Token**:
   - Short-lived (typically 1 hour)
   - Stored in memory only
   - Auto-refreshed before expiration

### Security Considerations

- GitHub tokens are stored in plain text on filesystem
- Copilot tokens are only in memory
- Tokens only displayed with `--show-token` flag
- File permissions should be set appropriately by OS

## Account Types

**File**: `src/lib/api-config.ts:16-19`

Different GitHub account types use different Copilot API endpoints:
- **Individual**: `https://api.githubcopilot.com`
- **Business**: `https://api.business.githubcopilot.com`
- **Enterprise**: `https://api.enterprise.githubcopilot.com`

Account type is detected automatically or specified via `--account-type` flag.

## Error Handling

### Common Issues

1. **Device code expired**: User took too long to authorize
2. **Network errors**: Connectivity issues during polling
3. **Invalid tokens**: Corrupted or revoked tokens
4. **Rate limiting**: Too many authentication attempts

### Recovery

- Delete token files to force re-authentication
- Use `--force` flag to bypass cached tokens
- Check network connectivity and GitHub status
- Ensure correct account type for organization

## API Headers

**File**: `src/lib/api-config.ts:20-37`

Authentication requests include specific headers:
- **User-Agent**: `GitHubCopilotChat/0.26.7`
- **Editor Version**: `vscode/{version}`
- **Plugin Version**: `copilot-chat/0.26.7`
- **API Version**: `2025-04-01`
- **Integration ID**: `vscode-chat`

These headers ensure compatibility with GitHub's Copilot API.