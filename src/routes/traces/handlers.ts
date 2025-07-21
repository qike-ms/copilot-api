/**
 * API routes for accessing tracing data
 */

import type { Context } from "hono"

import { getTracingConfig } from "~/lib/tracing/config"
import { TraceFileManager } from "~/lib/tracing/file-manager"

const fileManager = new TraceFileManager()

/**
 * GET /traces - List traces with pagination
 */
export async function getTraces(c: Context) {
  const config = getTracingConfig()

  if (!config.enabled) {
    return c.json({ error: "Tracing is not enabled" }, 400)
  }

  try {
    const limit = parseInt(c.req.query("limit") ?? "50", 10)
    const offset = parseInt(c.req.query("offset") ?? "0", 10)

    const traces = await fileManager.readTraces(limit, offset)
    const metadata = await fileManager.getMetadata()

    return c.json({
      traces,
      pagination: {
        limit,
        offset,
        total: metadata.stats.traces_written ?? 0,
      },
      metadata: {
        config: metadata.config,
        last_updated: metadata.last_updated,
      },
    })
  } catch (error) {
    console.error("Failed to fetch traces:", error)
    return c.json({ error: "Failed to fetch traces" }, 500)
  }
}

/**
 * GET /traces/errors - List error traces with pagination
 */
export async function getTraceErrors(c: Context) {
  const config = getTracingConfig()

  if (!config.enabled) {
    return c.json({ error: "Tracing is not enabled" }, 400)
  }

  try {
    const limit = parseInt(c.req.query("limit") ?? "50", 10)
    const offset = parseInt(c.req.query("offset") ?? "0", 10)

    const errors = await fileManager.readErrors(limit, offset)
    const metadata = await fileManager.getMetadata()

    return c.json({
      errors,
      pagination: {
        limit,
        offset,
        total: metadata.stats.errors_written ?? 0,
      },
      metadata: {
        config: metadata.config,
        last_updated: metadata.last_updated,
      },
    })
  } catch (error) {
    console.error("Failed to fetch trace errors:", error)
    return c.json({ error: "Failed to fetch trace errors" }, 500)
  }
}

/**
 * GET /traces/stats - Get tracing statistics and metadata
 */
export async function getTraceStats(c: Context) {
  const config = getTracingConfig()

  try {
    const metadata = await fileManager.getMetadata()

    return c.json({
      enabled: config.enabled,
      config,
      stats: metadata.stats ?? { traces_written: 0, errors_written: 0 },
      last_updated: metadata.last_updated,
      directory: config.logDirectory,
    })
  } catch (error) {
    console.error("Failed to fetch trace stats:", error)
    return c.json({ error: "Failed to fetch trace stats" }, 500)
  }
}

/**
 * GET /traces/search - Search traces by various criteria
 */
export async function searchTraces(c: Context) {
  const config = getTracingConfig()

  if (!config.enabled) {
    return c.json({ error: "Tracing is not enabled" }, 400)
  }

  try {
    const query = c.req.query("q") ?? ""
    const endpointType = c.req.query("endpoint_type")
    const model = c.req.query("model")
    const status = c.req.query("status")
    const limit = parseInt(c.req.query("limit") ?? "50", 10)
    const offset = parseInt(c.req.query("offset") ?? "0", 10)

    // Get all traces (in a real implementation, you'd want to optimize this)
    const allTraces = await fileManager.readTraces(1000, 0)

    // Filter traces based on search criteria
    let filteredTraces = allTraces

    if (endpointType) {
      filteredTraces = filteredTraces.filter(trace => trace.clientRequest?.endpoint_type === endpointType)
    }

    if (model) {
      filteredTraces = filteredTraces.filter(trace =>
        trace.githubRequest?.model_requested?.toLowerCase().includes(model.toLowerCase()),
      )
    }

    if (status) {
      filteredTraces = filteredTraces.filter(trace => {
        if (status === "success") return !trace.error
        if (status === "error") return !!trace.error
        return true
      })
    }

    if (query) {
      filteredTraces = filteredTraces.filter(trace => {
        const searchText = JSON.stringify(trace).toLowerCase()
        return searchText.includes(query.toLowerCase())
      })
    }

    // Apply pagination
    const paginatedTraces = filteredTraces.slice(offset, offset + limit)

    return c.json({
      traces: paginatedTraces,
      pagination: {
        limit,
        offset,
        total: filteredTraces.length,
        filtered_from: allTraces.length,
      },
      filters: {
        query,
        endpoint_type: endpointType,
        model,
        status,
      },
    })
  } catch (error) {
    console.error("Failed to search traces:", error)
    return c.json({ error: "Failed to search traces" }, 500)
  }
}

/**
 * GET /traces/:traceId - Get specific trace by ID
 */
export async function getTraceById(c: Context) {
  const config = getTracingConfig()

  if (!config.enabled) {
    return c.json({ error: "Tracing is not enabled" }, 400)
  }

  try {
    const traceId = c.req.param("traceId")

    if (!traceId) {
      return c.json({ error: "Trace ID is required" }, 400)
    }

    // Search for the trace in both regular and error logs
    const traces = await fileManager.readTraces(1000, 0)
    const trace = traces.find(t => t.trace_id === traceId)

    if (trace) {
      return c.json(trace)
    }

    // Check error logs
    const errors = await fileManager.readErrors(1000, 0)
    const errorTrace = errors.find(e => e.trace_id === traceId)

    if (errorTrace) {
      return c.json(errorTrace)
    }

    return c.json({ error: "Trace not found" }, 404)
  } catch (error) {
    console.error("Failed to fetch trace by ID:", error)
    return c.json({ error: "Failed to fetch trace" }, 500)
  }
}

/**
 * DELETE /traces - Clear all traces (development/testing only)
 */
export async function clearTraces(c: Context) {
  const config = getTracingConfig()

  if (!config.enabled) {
    return c.json({ error: "Tracing is not enabled" }, 400)
  }

  // Only allow in development mode
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Trace clearing not allowed in production" }, 403)
  }

  try {
    // This is a simple implementation - in production you'd want more sophisticated clearing
    const { promises: fs } = await import("fs")
    const { join } = await import("path")

    const logPath = join(config.logDirectory, "log.json")
    const errorPath = join(config.logDirectory, "errors.json")
    const metadataPath = join(config.logDirectory, "metadata.json")

    // Clear the files by writing empty content
    await fs.writeFile(logPath, "", "utf8").catch(() => {
      // Ignore file write errors
    })
    await fs.writeFile(errorPath, "", "utf8").catch(() => {
      // Ignore file write errors
    })

    // Reset metadata
    const newMetadata = {
      stats: { traces_written: 0, errors_written: 0 },
      config,
      last_updated: new Date().toISOString(),
      cleared_at: new Date().toISOString(),
    }
    const stringifiedMetadata = JSON.stringify.bind(null);
    await fs.writeFile(metadataPath, stringifiedMetadata(newMetadata, null, 2), "utf8").catch(() => {
      // Ignore file write errors
    })

    return c.json({ message: "All traces cleared successfully" })
  } catch (error) {
    console.error("Failed to clear traces:", error)
    return c.json({ error: "Failed to clear traces" }, 500)
  }
}
