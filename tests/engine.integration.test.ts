import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defaultSettings } from '../src/shared/settings'
import { CategoryService } from '../src/engine/categories'
import { Database } from '../src/engine/db'
import { Logger } from '../src/engine/logger'
import { TaskManager } from '../src/engine/manager'
import { SchedulerService } from '../src/engine/scheduler'
import { SettingsService } from '../src/engine/settings'

interface Fixture {
  dir: string
  server: Server
  url: string
  data: Buffer
  manager: TaskManager
  db: Database
}

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

function pattern(size: number): Buffer {
  const buffer = Buffer.allocUnsafe(size)
  for (let index = 0; index < size; index += 1) buffer[index] = (index * 31 + 7) % 256
  return buffer
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor<T>(fn: () => T | Promise<T>, timeoutMs = 20_000, label = 'condition'): Promise<T> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = await fn()
    if (value) return value
    await sleep(40)
  }
  throw new Error(`Délai dépassé en attendant : ${label}`)
}

async function makeServer(options: {
  size: number
  ranges?: boolean
  ignoreRange?: boolean
  delayMs?: number
  headZeroLength?: boolean
}): Promise<{ server: Server; url: string; data: Buffer }> {
  const data = pattern(options.size)
  const etag = `"tdm-${options.size}"`
  const server = createServer((req, res) => {
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'content-length': String(options.headZeroLength ? 0 : data.length),
        'content-type': 'application/octet-stream',
        etag,
        ...(options.ranges === false ? {} : { 'accept-ranges': 'bytes' })
      })
      res.end()
      return
    }

    const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''))
    let body = data
    let status = 200
    if (range && options.ranges !== false && !options.ignoreRange) {
      const start = Number(range[1])
      const end = range[2] ? Number(range[2]) : data.length - 1
      if (start >= data.length) {
        res.writeHead(416, { 'content-range': `bytes */${data.length}` })
        res.end()
        return
      }
      body = data.subarray(start, Math.min(end, data.length - 1) + 1)
      status = 206
      res.writeHead(status, {
        'content-length': String(body.length),
        'content-type': 'application/octet-stream',
        'content-range': `bytes ${start}-${start + body.length - 1}/${data.length}`,
        'accept-ranges': 'bytes',
        etag
      })
    } else {
      res.writeHead(status, {
        'content-length': String(body.length),
        'content-type': 'application/octet-stream',
        etag,
        ...(options.ranges === false ? {} : { 'accept-ranges': 'bytes' })
      })
    }

    const delay = options.delayMs ?? 0
    let offset = 0
    const pump = async (): Promise<void> => {
      while (offset < body.length) {
        if (res.destroyed) return
        const chunk = body.subarray(offset, Math.min(offset + 32 * 1024, body.length))
        offset += chunk.length
        if (!res.write(chunk)) await new Promise<void>((resolve) => res.once('drain', resolve))
        if (delay > 0) await sleep(delay)
      }
      res.end()
    }
    void pump()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { server, url: `http://127.0.0.1:${port}/fichier.bin`, data }
}

async function makeFixture(options: Parameters<typeof makeServer>[0]): Promise<Fixture> {
  const dir = await mkdtemp(path.join(tmpdir(), 'tdm-it-'))
  const { server, url, data } = await makeServer(options)

  const logger = new Logger(path.join(dir, 'logs'), 'error')
  const db = Database.open(path.join(dir, 'tdm.db'), logger)
  const defaults = {
    ...defaultSettings(path.join(dir, 'telechargements')),
    maxConcurrentDownloads: 2,
    maxConnectionsPerTask: 4,
    segmentThresholdMib: 1,
    retryCount: 1,
    resumeOnStartup: false
  }
  const settings = new SettingsService(db, defaults, logger)
  const categories = new CategoryService(db, path.join(dir, 'telechargements'))
  const manager = new TaskManager(db, settings, categories, logger, () => undefined, path.join(dir, 'telechargements'))
  manager.init()

  cleanups.push(async () => {
    await manager.shutdown().catch(() => undefined)
    db.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  })

  return { dir, server, url, data, manager, db }
}

function sha(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

describe('moteur de téléchargement (HTTP local réel)', () => {
  it('télécharge en segments et reconstitue exactement le fichier', async () => {
    const { manager, data, url } = await makeFixture({ size: 3 * 1024 * 1024 + 17 })
    const task = await manager.add({ url })

    const finished = await waitFor(
      () => {
        const view = manager.get(task.id)
        return ['completed', 'failed'].includes(view.status) ? view : null
      },
      25_000,
      'fin du téléchargement'
    )
    expect(finished.status).toBe('completed')
    expect(finished.errorMessage).toBeNull()
    const file = await readFile(finished.filePath)
    expect(file.length).toBe(data.length)
    expect(sha(file)).toBe(sha(data))
    expect(finished.receivedBytes).toBe(data.length)
  })

  it('met en pause, persiste la progression, puis reprend sans corruption', async () => {
    const { manager, data, url } = await makeFixture({ size: 4 * 1024 * 1024, delayMs: 40 })
    const task = await manager.add({ url, connections: 4 })

    await waitFor(() => manager.get(task.id).receivedBytes > 250_000, 10_000, 'progression')
    manager.pause(task.id)
    const paused = await waitFor(
      () => (manager.get(task.id).status === 'paused' ? manager.get(task.id) : null),
      10_000,
      'pause'
    )
    expect(paused.receivedBytes).toBeGreaterThan(0)
    expect(paused.receivedBytes).toBeLessThan(data.length)

    manager.resume(task.id)
    const finished = await waitFor(
      () => {
        const view = manager.get(task.id)
        return ['completed', 'failed'].includes(view.status) ? view : null
      },
      30_000,
      'reprise'
    )
    expect(finished.status).toBe('completed')
    const file = await readFile(finished.filePath)
    expect(sha(file)).toBe(sha(data))
  })

  it('annule un téléchargement actif et supprime le fichier temporaire', async () => {
    const { manager, url, dir } = await makeFixture({ size: 3 * 1024 * 1024, delayMs: 20 })
    const task = await manager.add({ url })
    await waitFor(() => manager.get(task.id).receivedBytes > 100_000, 10_000, 'progression')

    manager.cancel(task.id)
    const cancelled = await waitFor(
      () => (manager.get(task.id).status === 'cancelled' ? manager.get(task.id) : null),
      10_000,
      'annulation'
    )
    expect(cancelled.status).toBe('cancelled')
    const entries = await readdir(path.join(dir, 'telechargements'), { recursive: true }).catch(() => [])
    expect(entries.filter((entry) => String(entry).endsWith('.tdm-part'))).toHaveLength(0)
  })

  it('retire une tâche suspendue en supprimant son fichier temporaire', async () => {
    const { manager, url, dir } = await makeFixture({ size: 4 * 1024 * 1024, delayMs: 40 })
    const task = await manager.add({ url })
    await waitFor(() => manager.get(task.id).receivedBytes > 150_000, 10_000, 'progression')
    manager.pause(task.id)
    await waitFor(() => manager.get(task.id).status === 'paused', 10_000, 'pause')
    await manager.remove(task.id, false)
    expect(manager.list().some((item) => item.id === task.id)).toBe(false)
    const entries = await readdir(path.join(dir, 'telechargements'), { recursive: true }).catch(() => [])
    expect(entries.filter((entry) => String(entry).endsWith('.tdm-part'))).toHaveLength(0)
  })

  it('bascule en séquentiel si le serveur annonce Range mais renvoie 200', async () => {
    const { manager, data, url } = await makeFixture({ size: 2 * 1024 * 1024, ignoreRange: true })
    const task = await manager.add({ url, connections: 4 })
    const finished = await waitFor(
      () => {
        const view = manager.get(task.id)
        return ['completed', 'failed'].includes(view.status) ? view : null
      },
      25_000,
      'repli séquentiel'
    )
    expect(finished.status).toBe('completed')
    const file = await readFile(finished.filePath)
    expect(sha(file)).toBe(sha(data))
  })

  it('télécharge un flux sans Content-Length', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tdm-chunked-'))
    const payload = pattern(512 * 1024)
    const server = createServer((req, res) => {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-type': 'application/octet-stream' })
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/octet-stream' })
      res.end(payload)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    const logger = new Logger(path.join(dir, 'logs'), 'error')
    const db = Database.open(path.join(dir, 'tdm.db'), logger)
    const defaults = { ...defaultSettings(path.join(dir, 'dl')), resumeOnStartup: false }
    const manager = new TaskManager(
      db,
      new SettingsService(db, defaults, logger),
      new CategoryService(db, path.join(dir, 'dl')),
      logger,
      () => undefined,
      path.join(dir, 'dl')
    )
    manager.init()
    cleanups.push(async () => {
      await manager.shutdown().catch(() => undefined)
      db.close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(dir, { recursive: true, force: true })
    })

    const task = await manager.add({ url: `http://127.0.0.1:${port}/inconnu` })
    const finished = await waitFor(
      () => {
        const view = manager.get(task.id)
        return ['completed', 'failed'].includes(view.status) ? view : null
      },
      20_000,
      'flux chunked'
    )
    expect(finished.status).toBe('completed')
    expect(sha(await readFile(finished.filePath))).toBe(sha(payload))
  })

  it('ignore une taille HEAD nulle et interroge le contenu réel', async () => {
    const { manager, data, url } = await makeFixture({ size: 512 * 1024, headZeroLength: true })
    const task = await manager.add({ url })
    const finished = await waitFor(
      () => {
        const view = manager.get(task.id)
        return ['completed', 'failed'].includes(view.status) ? view : null
      },
      20_000,
      'taille HEAD nulle'
    )
    expect(finished.status).toBe('completed')
    expect(finished.totalBytes).toBe(data.length)
    expect(sha(await readFile(finished.filePath))).toBe(sha(data))
  })

  it('signale une somme de contrôle invalide sans livrer le fichier', async () => {
    const { manager, url, data } = await makeFixture({ size: 300 * 1024 })
    const task = await manager.add({
      url,
      checksumExpected: '0'.repeat(64)
    })
    const finished = await waitFor(
      () => {
        const view = manager.get(task.id)
        return ['needs_attention', 'failed', 'completed'].includes(view.status) ? view : null
      },
      20_000,
      'contrôle SHA-256'
    )
    expect(finished.status).toBe('needs_attention')
    expect(finished.errorCode).toBe('TDM-E-CHECKSUM')

    // Une reprise après correction de l'empreinte doit retélécharger réellement
    // le fichier, et non revalider le contenu précédent.
    manager.updateTask(task.id, { checksumExpected: null })
    manager.resume(task.id)
    const retried = await waitFor(
      () => {
        const view = manager.get(task.id)
        return ['completed', 'failed'].includes(view.status) ? view : null
      },
      25_000,
      'nouvelle tentative après contrôle'
    )
    expect(retried.status).toBe('completed')
    expect(sha(await readFile(retried.filePath))).toBe(sha(data))
  })

  it('démarre une file et relance les tâches en pause', async () => {
    const { manager, data, url } = await makeFixture({ size: 512 * 1024 })
    const queue = manager.createQueue('Reprise', 1)
    const task = await manager.add({ url, queueId: queue.id, startNow: false })
    expect(manager.get(task.id).status).toBe('paused')

    manager.startQueue(queue.id)
    const finished = await waitFor(
      () => {
        const view = manager.get(task.id)
        return ['completed', 'failed'].includes(view.status) ? view : null
      },
      25_000,
      'reprise via la file'
    )

    expect(finished.status).toBe('completed')
    expect(sha(await readFile(finished.filePath))).toBe(sha(data))
    expect(manager.listQueues().find((item) => item.id === queue.id)?.status).toBe('running')
  })

  it('exécute une action de planning arrivée à échéance', async () => {
    const { manager, dir, data, url } = await makeFixture({ size: 512 * 1024 })
    const queue = manager.createQueue('Planifiée', 1)
    const task = await manager.add({ url, queueId: queue.id, startNow: false })
    expect(manager.get(task.id).status).toBe('paused')

    manager.saveSchedule({
      queueId: queue.id,
      mode: 'once',
      startAt: new Date(Date.now() - 60_000).toISOString(),
      stopAt: null,
      daysMask: null,
      intervalMinutes: null,
      retries: 0,
      enabled: true,
      action: 'start_queue'
    })
    const schedule = manager.listSchedules()[0]
    manager.setScheduleNextRun(schedule.id, new Date(Date.now() - 1_000).toISOString())

    const scheduler = new SchedulerService(manager, new Logger(path.join(dir, 'logs'), 'error'))
    scheduler.tick(new Date())

    const finished = await waitFor(
      () => {
        const view = manager.get(task.id)
        return ['completed', 'failed'].includes(view.status) ? view : null
      },
      25_000,
      'exécution du planning'
    )
    expect(finished.status).toBe('completed')
    expect(sha(await readFile(finished.filePath))).toBe(sha(data))
    const after = manager.listSchedules().find((item) => item.id === schedule.id)
    expect(after?.enabled).toBe(false)
    expect(after?.lastRunAt).not.toBeNull()
  })
})
