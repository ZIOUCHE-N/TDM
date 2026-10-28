import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

const LEVEL_WEIGHT: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 }
const SECRET_KEYS = /token|password|secret|authorization|cookie/i

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[profondeur]'
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[key] = SECRET_KEYS.test(key) ? '[expurgé]' : redact(item, depth + 1)
    }
    return result
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`
  return value
}

export class Logger {
  private readonly file: string
  private level: LogLevel

  constructor(logDir: string, level: LogLevel = 'info') {
    this.level = level
    mkdirSync(logDir, { recursive: true })
    this.file = path.join(logDir, 'tdm.log')
    this.rotateIfNeeded()
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  error(event: string, detail?: unknown): void {
    this.write('error', event, detail)
  }

  warn(event: string, detail?: unknown): void {
    this.write('warn', event, detail)
  }

  info(event: string, detail?: unknown): void {
    this.write('info', event, detail)
  }

  debug(event: string, detail?: unknown): void {
    this.write('debug', event, detail)
  }

  private write(level: LogLevel, event: string, detail?: unknown): void {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[this.level]) return
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      detail: detail === undefined ? undefined : redact(detail)
    })
    if (level === 'error') console.error(`[tdm] ${event}`, detail ?? '')
    else if (level === 'warn') console.warn(`[tdm] ${event}`, detail ?? '')
    else console.log(`[tdm] ${event}`, detail ?? '')
    try {
      appendFileSync(this.file, `${line}\n`, { encoding: 'utf8', mode: 0o600 })
    } catch {
      // Logging must never crash the engine.
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (existsSync(this.file) && statSync(this.file).size > 10 * 1024 * 1024) {
        renameSync(this.file, `${this.file}.1`)
      }
    } catch {
      // ignore
    }
  }
}
