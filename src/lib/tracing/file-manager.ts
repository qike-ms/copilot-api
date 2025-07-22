/**
 * File manager for tracing system with rotation and archiving
 */

import { promises as fs, existsSync, statSync } from "fs"
import { join, extname, basename } from "path"

import type { CopilotTraceTuple, TraceError } from "./types"

interface MetadataStats {
  traces_written: number
  errors_written: number
}

interface TraceMetadata {
  stats: MetadataStats
  config: unknown
  last_updated: string | null
}

import { getTracingConfig } from "./config"
import {
  getFileSizeInBytes,
  bytesToKB,
  createTimestampedFilename,
  safeJsonStringify,
  getCurrentISOTimestamp,
} from "./utils"

export class TraceFileManager {
  private config = getTracingConfig()
  private writeQueue: Array<() => Promise<void>> = []
  private isProcessingQueue = false

  constructor() {
    this.config = getTracingConfig()
  }

  /**
   * Gets the main log file path
   */
  private getLogFilePath(): string {
    return join(this.config.logDirectory, "log.json")
  }

  /**
   * Gets the error log file path
   */
  private getErrorFilePath(): string {
    return join(this.config.logDirectory, "errors.json")
  }

  /**
   * Gets the metadata file path
   */
  private getMetadataFilePath(): string {
    return join(this.config.logDirectory, "metadata.json")
  }

  /**
   * Gets the archive directory path
   */
  private getArchiveDir(): string {
    return join(this.config.logDirectory, "archive")
  }

  /**
   * Writes a successful trace tuple to log
   */
  writeTrace(trace: CopilotTraceTuple): void {
    if (!this.config.enabled) return

    const writeOp = async () => {
      await this.checkAndRotateIfNeeded(this.getLogFilePath())
      await this.appendToFile(this.getLogFilePath(), trace)
      await this.updateMetadata("traces_written")
    }

    this.queueWrite(writeOp)
  }

  /**
   * Writes an error trace to error log
   */
  writeError(error: TraceError & { trace_id?: string; timestamp?: number }): void {
    if (!this.config.enabled) return

    const errorTrace: Partial<CopilotTraceTuple> & { error: TraceError } = {
      trace_id: error.trace_id ?? "unknown",
      logged_at: getCurrentISOTimestamp(),
      error: {
        stage: error.stage,
        message: error.message,
        stack: error.stack,
        status: error.status,
        type: error.type,
      },
    }

    const writeOp = async () => {
      await this.checkAndRotateIfNeeded(this.getErrorFilePath())
      await this.appendToFile(this.getErrorFilePath(), errorTrace)
      await this.updateMetadata("errors_written")
    }

    this.queueWrite(writeOp)
  }

  /**
   * Queues a write operation to be processed asynchronously
   */
  private queueWrite(writeOp: () => Promise<void>): void {
    this.writeQueue.push(writeOp)
    void this.processQueue()
  }

  /**
   * Processes the write queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return

    this.isProcessingQueue = true

    try {
      while (this.writeQueue.length > 0) {
        const writeOp = this.writeQueue.shift()
        if (writeOp) {
          try {
            await writeOp()
          } catch (error) {
            console.error("Trace write operation failed:", error)
          }
        }
      }
    } finally {
      this.isProcessingQueue = false
    }
  }

  /**
   * Appends data to a file as JSON array efficiently
   */
  private async appendToFile(filePath: string, data: unknown): Promise<void> {
    try {
      const jsonEntry = safeJsonStringify(data)

      if (!existsSync(filePath)) {
        // New file - create array with first entry
        await fs.writeFile(filePath, `[${jsonEntry}]`, "utf8")
      } else {
        // Existing file - insert before closing bracket
        const fd = await fs.open(filePath, "r+")
        const stats = await fd.stat()

        if (stats.size === 0) {
          // Empty file
          await fd.writeFile(`[${jsonEntry}]`)
        } else {
          // Find the last ']' and replace with ',entry]'
          const buffer = Buffer.alloc(10)
          await fd.read(buffer, 0, 10, Math.max(0, stats.size - 10))

          const tail = buffer.toString().slice(-10)
          const lastBracketPos = tail.lastIndexOf("]")

          if (lastBracketPos !== -1) {
            const seekPos = stats.size - (10 - lastBracketPos)
            await fd.write(`,${jsonEntry}]`, seekPos)
          } else {
            // Fallback: treat as corrupted and restart
            await fd.writeFile(`[${jsonEntry}]`)
          }
        }

        await fd.close()
      }
    } catch (error) {
      console.error(`Failed to append to ${filePath}:`, error)
    }
  }

  /**
   * Checks if file needs rotation and rotates if necessary
   */
  private async checkAndRotateIfNeeded(filePath: string): Promise<void> {
    if (!existsSync(filePath)) return

    const sizeKB = bytesToKB(getFileSizeInBytes(filePath))

    if (sizeKB >= this.config.maxLogSizeKB) {
      await this.rotateFile(filePath)
    }
  }

  /**
   * Rotates a file to the archive directory
   */
  private async rotateFile(filePath: string): Promise<void> {
    try {
      const fileName = basename(filePath)
      const fileExt = extname(fileName)
      const baseName = basename(fileName, fileExt)

      const archiveFileName = createTimestampedFilename(baseName, fileExt.slice(1))
      const archivePath = join(this.getArchiveDir(), archiveFileName)

      // Move current file to archive
      await fs.rename(filePath, archivePath)

      // Clean up old archives
      await this.cleanupOldArchives()

      console.log(`Rotated trace file: ${filePath} -> ${archivePath}`)
    } catch (error) {
      console.error(`Failed to rotate file ${filePath}:`, error)
    }
  }

  /**
   * Cleans up old archive files beyond the limit
   */
  private async cleanupOldArchives(): Promise<void> {
    try {
      const archiveDir = this.getArchiveDir()
      const files = await fs.readdir(archiveDir)

      // Filter and sort archive files by modification time
      const archiveFiles = files
        .filter(file => file.endsWith(".json"))
        .map(file => {
          const filePath = join(archiveDir, file)
          const stats = statSync(filePath)
          return { name: file, path: filePath, mtime: stats.mtime }
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

      // Remove excess files
      if (archiveFiles.length > this.config.maxArchiveFiles) {
        const filesToRemove = archiveFiles.slice(this.config.maxArchiveFiles)

        for (const file of filesToRemove) {
          await fs.unlink(file.path)
          console.log(`Removed old archive: ${file.name}`)
        }
      }
    } catch (error) {
      console.error("Failed to cleanup old archives:", error)
    }
  }

  /**
   * Updates metadata file with stats
   */
  private async updateMetadata(operation: "traces_written" | "errors_written"): Promise<void> {
    try {
      const metadataPath = this.getMetadataFilePath()
      let metadata: Partial<TraceMetadata> = {}

      if (existsSync(metadataPath)) {
        const content = await fs.readFile(metadataPath, "utf8")
        try {
          metadata = JSON.parse(content) as Partial<TraceMetadata>
        } catch {
          metadata = {}
        }
      }

      // Initialize counters
      metadata.stats = metadata.stats || { traces_written: 0, errors_written: 0 }
      metadata.stats.traces_written = metadata.stats.traces_written || 0
      metadata.stats.errors_written = metadata.stats.errors_written || 0

      // Update counter
      metadata.stats[operation]++
      metadata.last_updated = getCurrentISOTimestamp()
      metadata.config = this.config

      await fs.writeFile(metadataPath, safeJsonStringify(metadata, 2), "utf8")
    } catch (error) {
      console.error("Failed to update metadata:", error)
    }
  }

  /**
   * Reads traces from log files
   */
  async readTraces(limit = 100, offset = 0): Promise<Array<CopilotTraceTuple>> {
    const traces: Array<CopilotTraceTuple> = []

    try {
      const logPath = this.getLogFilePath()

      if (existsSync(logPath)) {
        const content = await fs.readFile(logPath, "utf8")
        const trimmedContent = content.trim()

        if (trimmedContent) {
          try {
            const allTraces = JSON.parse(trimmedContent) as Array<CopilotTraceTuple>
            if (Array.isArray(allTraces)) {
              // Apply offset and limit
              const selectedTraces = allTraces.slice(offset, offset + limit)
              traces.push(...selectedTraces)
            }
          } catch (_parseError) {
            // Fallback: try parsing as JSONL for backward compatibility
            const lines = trimmedContent.split("\n").filter(line => line.trim())

            const selectedLines = lines.slice(offset, offset + limit)

            for (const line of selectedLines) {
              try {
                const trace = JSON.parse(line) as CopilotTraceTuple
                traces.push(trace)
              } catch {
                // Skip invalid JSON lines
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to read traces:", error)
    }

    return traces
  }

  /**
   * Reads errors from error log
   */
  async readErrors(limit = 50, offset = 0): Promise<Array<Partial<CopilotTraceTuple> & { error: TraceError }>> {
    const errors: Array<Partial<CopilotTraceTuple> & { error: TraceError }> = []

    try {
      const errorPath = this.getErrorFilePath()

      if (existsSync(errorPath)) {
        const content = await fs.readFile(errorPath, "utf8")
        const trimmedContent = content.trim()

        if (trimmedContent) {
          try {
            const allErrors = JSON.parse(trimmedContent) as Array<Partial<CopilotTraceTuple> & { error: TraceError }>
            if (Array.isArray(allErrors)) {
              // Apply offset and limit
              const selectedErrors = allErrors.slice(offset, offset + limit)
              errors.push(...selectedErrors)
            }
          } catch (_parseError) {
            // Fallback: try parsing as JSONL for backward compatibility
            const lines = trimmedContent.split("\n").filter(line => line.trim())

            const selectedLines = lines.slice(offset, offset + limit)

            for (const line of selectedLines) {
              try {
                const error = JSON.parse(line) as Partial<CopilotTraceTuple> & { error: TraceError }
                errors.push(error)
              } catch {
                // Skip invalid JSON lines
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to read errors:", error)
    }

    return errors
  }

  /**
   * Gets metadata and stats
   */
  async getMetadata(): Promise<TraceMetadata> {
    try {
      const metadataPath = this.getMetadataFilePath()

      if (existsSync(metadataPath)) {
        const content = await fs.readFile(metadataPath, "utf8")
        return JSON.parse(content) as TraceMetadata
      }
    } catch (error) {
      console.error("Failed to read metadata:", error)
    }

    return {
      stats: { traces_written: 0, errors_written: 0 },
      config: this.config,
      last_updated: null,
    }
  }
}
