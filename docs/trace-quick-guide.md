# Tracing Quick Start Guide

This guide helps you quickly set up and use the tracing system to capture and analyze API request-response flows between clients and GitHub Copilot.

## What is Tracing?

The tracing system captures detailed information about API requests flowing through your Copilot API server, including:
- Client requests (OpenAI/Anthropic format)
- GitHub Copilot API interactions 
- Response translations and token usage
- Performance metrics and error logs

## Quick Setup

### 1. Enable Tracing

Set the environment variable to enable tracing:

```bash
export COPILOT_TRACE_ENABLED=true
```

### 2. Start the Server

Run your Copilot API server as usual:

```bash
bun run dev
# or
bun run start
```

### 3. Make API Requests

Send requests to any supported endpoint:

```bash
# OpenAI-compatible chat completions
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hello!"}]}'

# Anthropic-compatible messages
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"model": "claude-3-5-sonnet-20241022", "messages": [{"role": "user", "content": "Hello!"}], "max_tokens": 100}'
```

### 4. View Traces

Traces are automatically saved to `traces/` directory as JSON files. Each trace includes:
- Complete request-response flow
- Token usage and processing time
- Model information and headers

## Trace File Locations

The tracing system stores files in the following structure:

```
traces/                          # Default trace directory (configurable)
├── log.json                     # Main trace log file (successful requests)
├── errors.json                  # Error trace log file (failed requests)
├── metadata.json                # Trace statistics and configuration metadata
└── archive/                     # Archived log files when size limits exceeded
    ├── log-2024-01-15T10-30-00Z.json
    ├── errors-2024-01-15T09-45-00Z.json
    └── ...
```

**File Descriptions:**
- **`log.json`**: Contains all successful API request-response traces in JSON array format
- **`errors.json`**: Contains traces that resulted in errors or exceptions in JSON array format
- **`metadata.json`**: Stores tracing statistics, configuration snapshot, and file rotation information
- **`archive/`**: When log files exceed the configured size limit, they are moved here with timestamps

**Reading Trace Files:**
```bash
# View recent successful traces
cat traces/log.json | jq '.[-10:]'

# View recent errors
cat traces/errors.json | jq '.[-10:]'

# View trace statistics
cat traces/metadata.json | jq

# Search for specific model traces
cat traces/log.json | jq '.[] | select(.githubRequest.model_requested == "gpt-4")'
```

## Configuration Options

Configure tracing behavior with environment variables:

```bash
# Required - Enable/disable tracing
COPILOT_TRACE_ENABLED=true

# Optional - Trace storage directory (default: traces/)
COPILOT_TRACE_DIR=./my-traces

# Optional - Max log file size in KB (default: 100)
COPILOT_TRACE_MAX_SIZE=500

# Optional - Max archived files to keep (default: 50)
COPILOT_TRACE_MAX_ARCHIVES=100

# Optional - Redact sensitive headers (default: true)
COPILOT_TRACE_REDACT_HEADERS=false

# Optional - Include streaming response chunks (default: false)
COPILOT_TRACE_STREAMING=true

# Optional - Log level (default: info)
COPILOT_TRACE_LOG_LEVEL=debug
```

## Dynamic Configuration Management

You can update trace settings in real-time without restarting the server:

### Get Current Configuration

```bash
# View current trace configuration
curl http://localhost:3000/trace-config
```

### Update Configuration

```bash
# Enable tracing and set max file size to 200KB
curl -X PUT -H "Content-Type: application/json" \
  -d '{"enabled": true, "maxLogSizeKB": 200}' \
  http://localhost:3000/trace-config

# Enable streaming chunk capture and set debug logging
curl -X PUT -H "Content-Type: application/json" \
  -d '{"includeStreamingChunks": true, "logLevel": "debug"}' \
  http://localhost:3000/trace-config

# Change trace directory location
curl -X PUT -H "Content-Type: application/json" \
  -d '{"logDirectory": "/custom/trace/path/"}' \
  http://localhost:3000/trace-config
```

### Reset to Defaults

```bash
# Reset all configuration to default values
curl -X POST http://localhost:3000/trace-config/reset
```

**Available Configuration Options:**
- `enabled` (boolean): Enable/disable tracing
- `logDirectory` (string): Directory path for trace files
- `maxLogSizeKB` (number): Maximum size per log file in KB
- `maxArchiveFiles` (number): Maximum number of archived log files to keep
- `redactHeaders` (boolean): Whether to redact sensitive headers
- `includeStreamingChunks` (boolean): Whether to capture streaming response chunks
- `logLevel` (string): Logging level ("debug", "info", "warn", "error")

## API Endpoints for Trace Management

Query traces programmatically via HTTP endpoints:

```bash
# List recent traces
curl http://localhost:3000/traces

# Get trace statistics
curl http://localhost:3000/traces/stats

# Search traces by model or endpoint type
curl "http://localhost:3000/traces/search?model=gpt-4&endpoint=openai_chat"

# Get specific trace by ID
curl http://localhost:3000/traces/{trace-id}

# View error traces only
curl http://localhost:3000/traces/errors

# Clear all traces (development only)
curl -X DELETE http://localhost:3000/traces
```

## Trace File Structure

Each trace file contains a complete request-response cycle:

```json
{
  "trace_id": "abc123-def456",
  "logged_at": "2024-01-15T10:30:00Z",
  "clientRequest": {
    "method": "POST",
    "url": "/v1/chat/completions",
    "body": {"model": "gpt-4", "messages": [...]},
    "token_count": {"estimated_prompt_tokens": 15}
  },
  "githubRequest": {
    "url": "https://api.githubcopilot.com/chat/completions",
    "model_requested": "gpt-4",
    "streaming": false
  },
  "githubResponse": {
    "status_code": 200,
    "body": {"choices": [...], "usage": {...}},
    "token_usage": {"total_tokens": 25}
  },
  "clientResponse": {
    "status_code": 200,
    "processing_time_ms": 1250
  }
}
```

## Common Use Cases

### Debug Request Translation
Compare client requests vs. GitHub API requests to verify format translation:

```bash
# Find traces for a specific model
curl "http://localhost:3000/traces/search?model=claude-3-5-sonnet"
```

### Monitor Token Usage
Track token consumption across different models:

```bash
# View stats with token usage summaries
curl http://localhost:3000/traces/stats
```

### Performance Analysis
Identify slow requests by processing time:

```bash
# List recent traces and check processing_time_ms
curl http://localhost:3000/traces
```

### Error Investigation
Debug failed requests and API errors:

```bash
# View error traces only
curl http://localhost:3000/traces/errors
```

## Security & Privacy

- **Headers**: Sensitive headers (Authorization, API keys) are redacted by default
- **Body Data**: Request/response bodies containing sensitive fields are automatically sanitized
- **Local Storage**: All traces are stored locally in your specified directory
- **No External Logging**: Traces are never sent to external services

## Tips

1. **Start Small**: Begin with `COPILOT_TRACE_ENABLED=true` and default settings
2. **Dynamic Configuration**: Use `/trace-config` endpoints to adjust settings without server restart
3. **Monitor Disk Usage**: Trace files can grow quickly with high traffic - check `archive/` directory size regularly
4. **Use Search**: The search endpoints are more efficient than reading individual trace files
5. **Development Focus**: Tracing is designed for debugging and development, not production monitoring
6. **Clean Regularly**: Use the DELETE endpoint to clear old traces during development
7. **File Rotation**: Configure `maxLogSizeKB` and `maxArchiveFiles` to manage disk usage automatically

## Next Steps

- Review individual trace files in `traces/` directory
- Use the HTTP endpoints to build custom trace analysis tools
- Check `src/lib/tracing/` for advanced configuration options
- See `docs/logging.md` for general server logging beyond tracing