/**
 * Routes for trace API endpoints
 */

import { Hono } from "hono"

import {
  getTraces,
  getTraceErrors,
  getTraceStats,
  searchTraces,
  getTraceById,
  clearTraces,
  getTraceConfig,
  updateTraceConfig,
  resetTraceConfig,
} from "./handlers"

export const tracesRoute = new Hono()

// GET /traces - List traces with pagination
tracesRoute.get("/", getTraces)

// GET /traces/errors - List error traces
tracesRoute.get("/errors", getTraceErrors)

// GET /traces/stats - Get tracing statistics
tracesRoute.get("/stats", getTraceStats)

// GET /traces/search - Search traces
tracesRoute.get("/search", searchTraces)

// GET /traces/:traceId - Get specific trace by ID
tracesRoute.get("/:traceId", getTraceById)

// DELETE /traces - Clear all traces (dev/testing only)
tracesRoute.delete("/", clearTraces)

// GET /traces/config - Get current trace configuration
tracesRoute.get("/config", getTraceConfig)

// PUT /traces/config - Update trace configuration
tracesRoute.put("/config", updateTraceConfig)

// POST /traces/config/reset - Reset trace configuration to defaults
tracesRoute.post("/config/reset", resetTraceConfig)
