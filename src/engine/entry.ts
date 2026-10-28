import { homedir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { defaultSettings } from '../shared/settings'
import type { EngineInfo } from '../shared/protocol'
import { CategoryService } from './categories'
import { Database } from './db'
import { Logger } from './logger'
import { TaskManager } from './manager'
import { mapError } from './downloader'
import { SchedulerService } from './scheduler'
import { SettingsService } from './settings'

type ParentPort = {
  on(event: 'message', listener: (event: { data: unknown }) => void): void
  postMessage(message: unknown): void
}

const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort
if (!parentPort) {
  throw new Error('TDM engine must run inside an Electron utility process')
}

const PROTOCOL_VERSION = 1
const APP_VERSION = process.env.TDM_APP_VERSION ?? '0.0.0'
const DATA_DIR = process.env.TDM_DATA_DIR ?? path.join(homedir(), '.config', 'tdm')
const DOWNLOADS_ROOT = process.env.TDM_DOWNLOADS_DIR ?? path.join(homedir(), 'Downloads', 'TDM')

function send(message: unknown): void {
  parentPort.postMessage(message)
}

function emit(type: string, payload: unknown): void {
  send({ protocolVersion: PROTOCOL_VERSION, type, payload, at: new Date().toISOString() })
}

function sqliteVersion(): string {
  try {
    const sqlite = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')
    const db = new sqlite.DatabaseSync(':memory:')
    const row = db.prepare('select sqlite_version() as version').get() as { version: string }
    db.close()
    return row.version
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message : String(error)}`
  }
}

const filterSchema = z
  .object({
    status: z
      .enum(['all', 'active', 'finished', 'queued', 'probing', 'downloading', 'paused', 'completed', 'failed', 'cancelled', 'needs_attention'])
      .optional(),
    categoryId: z.string().nullable().optional(),
    queueId: z.string().nullable().optional(),
    search: z.string().max(300).optional()
  })
  .optional()

const addSchema = z.object({
  url: z.string().min(1).max(4096),
  fileName: z.string().max(240).optional(),
  destDir: z.string().max(1024).optional(),
  categoryId: z.string().max(100).optional(),
  queueId: z.string().max(100).nullable().optional(),
  connections: z.number().int().min(1).max(16).optional(),
  description: z.string().max(500).optional(),
  checksumExpected: z.string().max(80).nullable().optional(),
  startNow: z.boolean().optional(),
  referrer: z.string().max(2048).optional()
})

const taskIdSchema = z.object({ id: z.string().min(1) })

const settingsPatchSchema = z.object({
  defaultDownloadDir: z.string().min(1).optional(),
  maxConcurrentDownloads: z.number().int().min(1).max(16).optional(),
  maxConnectionsPerTask: z.number().int().min(1).max(16).optional(),
  globalSpeedLimitKib: z.number().int().min(0).max(10_000_000).optional(),
  perTaskSpeedLimitKib: z.number().int().min(0).max(10_000_000).optional(),
  retryCount: z.number().int().min(0).max(20).optional(),
  resumeOnStartup: z.boolean().optional(),
  clipboardMonitoring: z.boolean().optional(),
  notifications: z.boolean().optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  proxyMode: z.enum(['system', 'direct', 'manual']).optional(),
  proxyUrl: z.string().max(2048).optional(),
  proxyBypass: z.string().max(2048).optional(),
  userAgent: z.string().max(512).optional(),
  autoStart: z.boolean().optional(),
  minimizeToTray: z.boolean().optional(),
  confirmDelete: z.boolean().optional(),
  historyRetentionDays: z.number().int().min(0).max(3650).optional(),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).optional(),
  bridgeEnabled: z.boolean().optional(),
  bridgePort: z.number().int().min(1024).max(65_535).optional(),
  segmentThresholdMib: z.number().int().min(1).max(1024).optional()
})

const scheduleSchema = z.object({
  id: z.string().optional(),
  queueId: z.string().min(1),
  mode: z.enum(['once', 'daily', 'interval']),
  startAt: z.string().max(64).nullable(),
  stopAt: z.string().max(64).nullable(),
  daysMask: z.number().int().min(0).max(127).nullable(),
  intervalMinutes: z.number().int().min(1).max(10080).nullable(),
  retries: z.number().int().min(0).max(20),
  enabled: z.boolean(),
  action: z.enum(['start_queue', 'stop_queue', 'start_all', 'stop_all'])
})

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  dir: z.string().min(1).max(1024),
  extensions: z.array(z.string().max(20)).max(100),
  domains: z.array(z.string().max(253)).max(100)
})

interface Context {
  db: Database
  logger: Logger
  settings: SettingsService
  manager: TaskManager
  scheduler: SchedulerService
  startedAt: string
  sqlite: string
}

function createContext(): Context {
  const logger = new Logger(path.join(DATA_DIR, 'logs'), 'info')
  logger.info('engine.start', { version: APP_VERSION, dataDir: DATA_DIR })
  const sqlite = sqliteVersion()
  const db = Database.open(path.join(DATA_DIR, 'tdm.db'), logger)
  const defaults = defaultSettings(DOWNLOADS_ROOT)
  const settings = new SettingsService(db, defaults, logger)
  const categories = new CategoryService(db, DOWNLOADS_ROOT)
  const manager = new TaskManager(db, settings, categories, logger, emit, DOWNLOADS_ROOT)
  const scheduler = new SchedulerService(manager, logger)
  manager.init()
  scheduler.start()
  return { db, logger, settings, manager, scheduler, startedAt: new Date().toISOString(), sqlite }
}

let context: Context | null = null

function requireContext(): Context {
  if (!context) throw new Error('Moteur non initialisé')
  return context
}

async function handle(command: string, payload: unknown): Promise<unknown> {
  const ctx = requireContext()

  switch (command) {
    case 'engine.ping':
      return {
        ok: true,
        pongAt: new Date().toISOString(),
        info: engineInfo(ctx)
      }
    case 'engine.info':
      return engineInfo(ctx)
    case 'engine.stats':
      return ctx.manager.stats()

    case 'settings.get':
      return ctx.settings.get()
    case 'settings.update': {
      const patch = settingsPatchSchema.parse(payload ?? {})
      const next = ctx.settings.update(patch)
      ctx.manager.applyLimits()
      ctx.scheduler.refresh()
      emit('settings.changed', next)
      return next
    }

    case 'tasks.list': {
      const filter = filterSchema.parse(payload ?? {})
      return ctx.manager.list(filter ?? {})
    }
    case 'tasks.get':
      return ctx.manager.get(taskIdSchema.parse(payload).id)
    case 'tasks.probe':
      return ctx.manager.probeUrl(z.object({ url: z.string().min(1).max(4096) }).parse(payload).url)
    case 'tasks.add':
      const parsed = addSchema.parse(payload)
      return ctx.manager.add({ ...parsed, checksumExpected: parsed.checksumExpected ?? undefined })
    case 'tasks.pause':
      return ctx.manager.pause(taskIdSchema.parse(payload).id)
    case 'tasks.resume':
      return ctx.manager.resume(taskIdSchema.parse(payload).id)
    case 'tasks.retry':
      return ctx.manager.retry(taskIdSchema.parse(payload).id)
    case 'tasks.cancel':
      return ctx.manager.cancel(taskIdSchema.parse(payload).id)
    case 'tasks.remove': {
      const parsed = z
        .object({ id: z.string().min(1), deleteFile: z.boolean().optional() })
        .parse(payload)
      await ctx.manager.remove(parsed.id, parsed.deleteFile ?? false)
      return { ok: true }
    }
    case 'tasks.update': {
      const parsed = z
        .object({
          id: z.string().min(1),
          patch: z.object({
            queueId: z.string().nullable().optional(),
            priority: z.number().int().min(-10).max(10).optional(),
            description: z.string().max(500).optional(),
            connections: z.number().int().min(1).max(16).optional(),
            speedLimitKib: z.number().int().min(0).max(10_000_000).optional(),
            checksumExpected: z.string().max(80).nullable().optional()
          })
        })
        .parse(payload)
      return ctx.manager.updateTask(parsed.id, parsed.patch)
    }
    case 'tasks.clearFinished': {
      const parsed = z.object({ deleteFiles: z.boolean().optional() }).parse(payload ?? {})
      return { removed: await ctx.manager.clearFinished(parsed.deleteFiles ?? false) }
    }
    case 'tasks.startAll':
      ctx.manager.startAll()
      return { ok: true }
    case 'tasks.pauseAll':
      ctx.manager.pauseAll()
      return { ok: true }

    case 'queues.list':
      return ctx.manager.listQueues()
    case 'queues.create': {
      const parsed = z
        .object({ name: z.string().min(1).max(80), concurrency: z.number().int().min(1).max(16) })
        .parse(payload)
      return ctx.manager.createQueue(parsed.name, parsed.concurrency)
    }
    case 'queues.update': {
      const parsed = z
        .object({
          id: z.string().min(1),
          patch: z.object({
            name: z.string().min(1).max(80).optional(),
            concurrency: z.number().int().min(1).max(16).optional()
          })
        })
        .parse(payload)
      return ctx.manager.updateQueue(parsed.id, parsed.patch)
    }
    case 'queues.delete':
      ctx.manager.deleteQueue(z.object({ id: z.string().min(1) }).parse(payload).id)
      return { ok: true }
    case 'queues.start':
      ctx.manager.startQueue(z.object({ id: z.string().min(1) }).parse(payload).id)
      return { ok: true }
    case 'queues.stop':
      ctx.manager.stopQueue(z.object({ id: z.string().min(1) }).parse(payload).id)
      return { ok: true }

    case 'schedules.list':
      return ctx.manager.listSchedules()
    case 'schedules.save': {
      ctx.manager.saveSchedule(scheduleSchema.parse(payload))
      ctx.scheduler.refresh()
      return ctx.manager.listSchedules()
    }
    case 'schedules.delete': {
      ctx.manager.deleteSchedule(z.object({ id: z.string().min(1) }).parse(payload).id)
      return ctx.manager.listSchedules()
    }

    case 'categories.list':
      return ctx.manager.listCategories()
    case 'categories.save':
      return ctx.manager.saveCategory(categorySchema.parse(payload))
    case 'categories.delete': {
      ctx.manager.deleteCategory(z.object({ id: z.string().min(1) }).parse(payload).id)
      return ctx.manager.listCategories()
    }

    case 'history.list': {
      const parsed = z.object({ limit: z.number().int().min(1).max(1000).optional() }).parse(payload ?? {})
      return ctx.manager.listHistory(parsed.limit)
    }

    case 'engine.diagnostics':
      return {
        ...engineInfo(ctx),
        databasePath: path.join(DATA_DIR, 'tdm.db'),
        downloadsRoot: DOWNLOADS_ROOT,
        stats: ctx.manager.stats(),
        uptimeSeconds: Math.round((Date.now() - new Date(ctx.startedAt).getTime()) / 1000)
      }

    case 'engine.shutdown':
      ctx.scheduler.stop()
      await ctx.manager.shutdown()
      ctx.db.close()
      context = null
      return { ok: true }

    default:
      throw Object.assign(new Error(`Commande inconnue : ${command}`), { code: 'TDM-E-UNKNOWN-COMMAND' })
  }
}

function engineInfo(ctx: Context): EngineInfo {
  const degraded = ctx.sqlite.startsWith('unavailable')
  return {
    status: degraded ? 'degraded' : 'ready',
    version: APP_VERSION,
    sqliteVersion: ctx.sqlite,
    protocolVersion: PROTOCOL_VERSION,
    startedAt: ctx.startedAt,
    platform: `${process.platform}/${process.arch}`,
    dataDir: DATA_DIR
  }
}

async function main(): Promise<void> {
  try {
    context = createContext()
  } catch (error) {
    send({
      protocolVersion: PROTOCOL_VERSION,
      type: 'engine.status',
      payload: {
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      },
      at: new Date().toISOString()
    })
    return
  }

  const ctx = context
  const degraded = ctx.sqlite.startsWith('unavailable')
  emit('engine.status', {
    status: degraded ? 'degraded' : 'ready',
    sqliteVersion: ctx.sqlite,
    version: APP_VERSION,
    startedAt: ctx.startedAt
  })
  emit('settings.changed', ctx.settings.get())
  emit('tasks.changed', null)
  emit('queues.changed', ctx.manager.listQueues())
  emit('categories.changed', ctx.manager.listCategories())
  emit('schedules.changed', ctx.manager.listSchedules())

  const heartbeat = setInterval(() => {
    emit('stats.tick', ctx.manager.stats())
  }, 3000)
  if (typeof heartbeat.unref === 'function') heartbeat.unref()

  parentPort.on('message', (event) => {
    const request = event.data as {
      protocolVersion?: number
      requestId?: string
      command?: string
      payload?: unknown
    }

    if (!request || typeof request.requestId !== 'string' || typeof request.command !== 'string') return
    const requestId = request.requestId
    const command = request.command
    const payload = request.payload

    void (async () => {
      try {
        if (request.protocolVersion !== PROTOCOL_VERSION) {
          throw Object.assign(new Error('Version de protocole incompatible.'), { code: 'TDM-E-PROTOCOL' })
        }
        const result = await handle(command, payload)
        send({
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          ok: true,
          result
        })
      } catch (error) {
        const mapped = error instanceof z.ZodError
          ? { code: 'TDM-E-VALIDATION', message: 'Données invalides.', details: z.prettifyError(error) }
          : error instanceof Error
            ? {
                code: (error as Error & { code?: string }).code ?? mapError(error).code,
                message: error.message,
                details: undefined
              }
            : { code: 'TDM-E-UNKNOWN', message: String(error), details: undefined }
        send({
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          ok: false,
          error: mapped
        })
      }
    })()
  })
}

process.on('SIGTERM', () => {
  void context?.manager.shutdown().finally(() => process.exit(0))
})

void main()
