/**
 * Dedicated route for trace configuration management
 */

import { Hono } from "hono"

import {
  getTraceConfig,
  updateTraceConfig,
  resetTraceConfig,
} from "../traces/handlers"

export const traceConfigRoute = new Hono()

// GET /trace-config - Get current trace configuration
traceConfigRoute.get("/", getTraceConfig)

// PUT /trace-config - Update trace configuration
traceConfigRoute.put("/", updateTraceConfig)

// POST /trace-config/reset - Reset trace configuration to defaults
traceConfigRoute.post("/reset", resetTraceConfig)