import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Settings } from '../shared/settings'
import type { Database } from './db'
import type { Logger } from './logger'
import type { SegmentRow, TaskRow } from './types'
import { HttpError, openStream, parseContentRangeHeader, probe } from './http'
import { RateLimiter } from './limiter'
import { uniqueFilePath } from './paths'

export type JobOutcome = 'completed' | 'paused' | 'cancelled' | 'failed' | 'needs_attention'

export interface DownloadHooks {
  settings(): Settings
  globalLimiter: RateLimiter
  taskLimiter(taskId: string, bytesPerSecond: number): RateLimiter
  releaseTaskLimiter(taskId: string): void
  onProgress(taskId: string, received: number, total: number | null): void
  onStatus(taskId: string, status: string, errorCode?: string | null, errorMessage?: string | null): void
}

const MIN_SEGMENT_BYTES = 1024 * 1024
const FLUSH_INTERVAL_MS = 500
const PROGRESS_INTERVAL_MS = 300

class RestartSequential extends Error {}

export function planSegments(
  taskId: string,
  totalBytes: number,
  connections: number,
  thresholdBytes: number
): SegmentRow[] {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return []
  const safeConnections = Math.max(1, Math.min(16, Math.floor(connections)))
  const bySize = Math.floor(totalBytes / MIN_SEGMENT_BYTES)
  const count = Math.max(1, Math.min(safeConnections, bySize))
  if (totalBytes < thresholdBytes || count <= 1) {
    return [makeSegment(taskId, 0, 0, totalBytes - 1)]
  }
  const base = Math.floor(totalBytes / count)
  const segments: SegmentRow[] = []
  let start = 0
  for (let index = 0; index < count; index += 1) {
    const end = index === count - 1 ? totalBytes - 1 : start + base - 1
    segments.push(makeSegment(taskId, index, start, end))
    start = end + 1
  }
  return segments
}

function makeSegment(taskId: string, idx: number, start: number, end: number, position = start): SegmentRow {
  return {
    id: randomUUID(),
    taskId,
    idx,
    startOffset: start,
    endOffset: end,
    position,
    status: position > start ? 'partial' : 'pending',
    updatedAt: new Date().toISOString()
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class DownloadJob {
  private readonly aborter = new AbortController()
  private paused = false
  private cancelled = false
  private total: number | null = null
  private resumable = false
  private positions = new Map<string, number>()
  private segmentStarts = new Map<string, number>()
  private lastFlush = 0
  private lastProgress = 0
  private lastEmittedBytes = 0
  private readonly startedAt = new Date().toISOString()

  constructor(
    private readonly taskId: string,
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly hooks: DownloadHooks
  ) {}

  pause(): void {
    if (this.cancelled) return
    this.paused = true
    this.aborter.abort()
  }

  cancel(): void {
    this.cancelled = true
    this.aborter.abort()
  }

  async run(): Promise<JobOutcome> {
    const task = this.db.getTask(this.taskId)
    if (!task) return 'failed'

    try {
      this.setStatus(task, 'probing', { startedAt: this.startedAt, error: null, completedAt: null })
      const settings = this.hooks.settings()
      const source = task.finalUrl || task.url
      const result = await probe(source, settings, this.aborter.signal)
      if (this.cancelled || this.paused) throw new DOMException('Aborted', 'AbortError')

      this.total = result.contentLength
      this.resumable = result.resumable

      this.db.updateTask(task.id, {
        finalUrl: result.finalUrl,
        totalBytes: result.contentLength,
        resumable: result.resumable ? 1 : 0,
        etag: result.etag,
        lastModified: result.lastModified,
        contentType: result.contentType,
        errorCode: null,
        errorMessage: null
      })

      if (!task.fileName && result.suggestedFileName) {
        task.fileName = result.suggestedFileName
        this.db.updateTask(task.id, { fileName: result.suggestedFileName })
      }

      const previousSegments = this.db.listSegments(task.id)
      const sameShape =
        previousSegments.length > 0 &&
        task.totalBytes === result.contentLength &&
        (task.etag ?? null) === (result.etag ?? null) &&
        (task.lastModified ?? null) === (result.lastModified ?? null) &&
        previousSegments.every((segment) => segment.position >= segment.startOffset)
      const existingTemp = await stat(task.tempPath).catch(() => null)
      const reusable =
        sameShape &&
        existingTemp !== null &&
        (this.resumable || previousSegments.length === 1) &&
        previousSegments.every((segment) => segment.position <= segment.endOffset + 1)

      let segments: SegmentRow[] = reusable
        ? previousSegments.map((segment) => ({
            ...segment,
            position: Math.min(segment.position, segment.endOffset + 1)
          }))
        : this.resumable
          ? planSegments(
              task.id,
              result.contentLength ?? 0,
              task.connections,
              settings.segmentThresholdMib * 1024 * 1024
            )
          : result.contentLength !== null && result.contentLength > 0
            ? [makeSegment(task.id, 0, 0, result.contentLength - 1)]
            : []

      // Taille inconnue (transfert chunked) : un seul flux séquentiel jusqu'à EOF.
      if (!this.resumable && result.contentLength === null) {
        segments = [makeSegment(task.id, 0, 0, Number.MAX_SAFE_INTEGER)]
      }

      this.db.replaceSegments(task.id, segments)
      this.segmentStarts.clear()
      for (const segment of segments) {
        this.positions.set(segment.id, segment.position)
        this.segmentStarts.set(segment.id, segment.startOffset)
      }
      await mkdir(task.destDir, { recursive: true })
      const handle = await open(task.tempPath, reusable ? 'r+' : 'w+')
      try {
        if (!reusable) await handle.truncate(0)
        if (this.total !== null && this.total >= 0) await handle.truncate(this.total)

        this.setStatus(task, 'downloading', {})
        this.flush(task, true)

        if (segments.length === 0) {
          const finalized = await this.finalize(task)
          return finalized ? 'completed' : 'needs_attention'
        }

        try {
          await this.runSegments(task, segments, handle)
        } catch (error) {
          if (error instanceof RestartSequential) {
            this.logger.warn('download.sequential-fallback', { taskId: task.id })
            this.resumable = false
            const fallback =
              result.contentLength !== null && result.contentLength > 0
                ? [makeSegment(task.id, 0, 0, result.contentLength - 1)]
                : [makeSegment(task.id, 0, 0, Number.MAX_SAFE_INTEGER)]
            this.db.updateTask(task.id, { resumable: 0 })
            this.db.replaceSegments(task.id, fallback)
            this.positions.clear()
            this.segmentStarts.clear()
            for (const segment of fallback) {
              this.positions.set(segment.id, segment.position)
              this.segmentStarts.set(segment.id, segment.startOffset)
            }
            await handle.truncate(0)
            if (this.total !== null) await handle.truncate(this.total)
            await this.runSegments(task, fallback, handle)
          } else {
            throw error
          }
        }

        this.flush(task, true)
        const finalized = await this.finalize(task)
        return finalized ? 'completed' : 'needs_attention'
      } finally {
        await handle.close().catch(() => undefined)
      }
    } catch (error) {
      const outcome = await this.handleFailure(task, error)
      return outcome
    }
  }

  // ---------- interne ----------

  private async runSegments(
    task: TaskRow,
    segments: SegmentRow[],
    handle: Awaited<ReturnType<typeof open>>
  ): Promise<void> {
    const results = await Promise.allSettled(
      segments.map((segment) => this.runSegment(task, segment, handle))
    )
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failure) throw failure.reason
  }

  private async runSegment(task: TaskRow, segment: SegmentRow, handle: Awaited<ReturnType<typeof open>>): Promise<void> {
    let attempts = 0
    const settings = this.hooks.settings()
    const retries = settings.retryCount

    while (!this.aborter.signal.aborted) {
      if (segment.position > segment.endOffset && this.total !== null) {
        return
      }
      try {
        await this.transfer(task, segment, handle)
        return
      } catch (error) {
        if (this.aborter.signal.aborted) throw error
        if (error instanceof RestartSequential) throw error
        if (attempts >= retries) throw error
        attempts += 1
        this.logger.warn('download.segment-retry', {
          taskId: task.id,
          segment: segment.idx,
          attempt: attempts,
          message: error instanceof Error ? error.message : String(error)
        })
        await delay(Math.min(15_000, 500 * 2 ** attempts), this.aborter.signal)
      }
    }
    throw new DOMException('Aborted', 'AbortError')
  }

  private async transfer(
    task: TaskRow,
    segment: SegmentRow,
    handle: Awaited<ReturnType<typeof open>>
  ): Promise<void> {
    const settings = this.hooks.settings()
    const perTaskKib = task.speedLimit > 0 ? task.speedLimit : settings.perTaskSpeedLimitKib
    const perTask = perTaskKib > 0 ? perTaskKib * 1024 : 0
    const limiter = this.hooks.taskLimiter(task.id, perTask)
    const ranged = this.resumable && this.total !== null
    const start = segment.position

    const { response, finalUrl } = await openStream(task.finalUrl || task.url, settings, {
      rangeStart: ranged ? start : undefined,
      rangeEnd: ranged ? segment.endOffset : undefined,
      ifRange: ranged ? task.etag : null,
      referrer: null,
      signal: this.aborter.signal
    })

    if (ranged && response.statusCode === 416 && segment.position > segment.endOffset) return
    if (ranged && response.statusCode !== 206) {
      await response.body.dump()
      if (response.statusCode === 200) throw new RestartSequential('Le serveur ignore les requêtes partielles')
      throw new HttpError('TDM-E-RANGE', `Réponse inattendue du serveur (HTTP ${response.statusCode}).`, response.statusCode)
    }
    if (!ranged && response.statusCode >= 400) {
      await response.body.dump()
      throw new HttpError('TDM-E-HTTP', `Le serveur a refusé la requête (HTTP ${response.statusCode}).`, response.statusCode)
    }

    if (!ranged && response.statusCode === 206) {
      const range = parseContentRangeHeader(String(response.headers['content-range'] ?? ''))
      if (range && range.start !== 0) {
        await response.body.dump()
        throw new RestartSequential('Réponse partielle inattendue')
      }
    }

    if (finalUrl !== task.finalUrl) this.db.updateTask(task.id, { finalUrl })

    try {
      for await (const raw of response.body) {
        if (this.aborter.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const chunk = Buffer.from(raw)
        if (chunk.length === 0) continue
        if (this.aborter.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        await this.hooks.globalLimiter.acquire(chunk.length)
        await limiter.acquire(chunk.length)
        if (this.aborter.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        await handle.write(chunk, 0, chunk.length, segment.position)
        segment.position += chunk.length
        this.positions.set(segment.id, segment.position)

        const now = Date.now()
        if (now - this.lastProgress >= PROGRESS_INTERVAL_MS) {
          this.lastProgress = now
          this.emitProgress(task.id)
        }
        if (now - this.lastFlush >= FLUSH_INTERVAL_MS) {
          this.lastFlush = now
          this.flush(task)
        }
      }
    } catch (error) {
      if (this.aborter.signal.aborted) throw error
      if (this.resumable) throw error
      // Sans reprise, toute coupure impose de repartir de zéro.
      segment.position = segment.startOffset
      this.positions.set(segment.id, segment.position)
      await handle.truncate(0)
      if (this.total !== null) await handle.truncate(this.total)
      throw error
    }

    if (this.resumable && this.total !== null && segment.position <= segment.endOffset) {
      throw new HttpError('TDM-E-PARTIAL', 'Le flux s’est interrompu avant la fin du segment.')
    }
    this.db.updateSegmentPosition(segment.id, segment.position, 'done')
    this.flush(task, true)
  }

  private emitProgress(taskId: string): void {
    const received = this.receivedBytes()
    this.lastEmittedBytes = received
    this.hooks.onProgress(taskId, received, this.total)
  }

  private receivedBytes(): number {
    let received = 0
    for (const [id, position] of this.positions) {
      received += Math.max(0, position - (this.segmentStarts.get(id) ?? 0))
    }
    return received
  }

  private flush(task: TaskRow, force = false): void {
    const received = this.receivedBytes()
    if (!force && received === this.lastEmittedBytes) return
    this.db.updateTask(task.id, { receivedBytes: received })
    for (const segment of this.db.listSegments(task.id)) {
      const position = this.positions.get(segment.id)
      if (position !== undefined && position !== segment.position) {
        this.db.updateSegmentPosition(segment.id, position, position > segment.endOffset ? 'done' : 'partial')
      }
    }
  }

  private setStatus(
    task: TaskRow,
    status: string,
    patch: { startedAt?: string; completedAt?: string | null; error?: { code: string; message: string } | null }
  ): void {
    const update: Parameters<Database['updateTask']>[1] = { status }
    if (patch.startedAt) update.startedAt = patch.startedAt
    if (patch.completedAt !== undefined) update.completedAt = patch.completedAt
    if (patch.error === null) {
      update.errorCode = null
      update.errorMessage = null
    }
    this.db.updateTask(task.id, update)
    this.hooks.onStatus(task.id, status, update.errorCode ?? null, update.errorMessage ?? null)
  }

  private async finalize(task: TaskRow): Promise<boolean> {
    const latest = this.db.getTask(task.id) ?? task
    let expectedChecksum: string | null = null
    if (latest.checksumExpected) {
      expectedChecksum = latest.checksumExpected.trim().toLowerCase()
      const actual = await sha256(latest.tempPath)
      if (actual !== expectedChecksum) {
        // Le fichier temporaire est corrompu ou ne correspond pas à l'attendu :
        // on le supprime et on vide les segments pour qu'une reprise retélécharge
        // réellement au lieu de revalider le même contenu.
        await rm(latest.tempPath, { force: true }).catch(() => undefined)
        this.db.replaceSegments(task.id, [])
        this.db.updateTask(task.id, {
          checksumActual: actual,
          receivedBytes: 0,
          status: 'needs_attention',
          errorCode: 'TDM-E-CHECKSUM',
          errorMessage: 'La somme de contrôle ne correspond pas au fichier téléchargé.',
          completedAt: new Date().toISOString()
        })
        this.hooks.onStatus(
          task.id,
          'needs_attention',
          'TDM-E-CHECKSUM',
          'La somme de contrôle ne correspond pas au fichier téléchargé.'
        )
        return false
      }
    }

    const finalPath = await uniqueFilePath(latest.destDir, latest.fileName)
    const finalName = path.basename(finalPath)
    await rename(latest.tempPath, finalPath)
    const size = await stat(finalPath)
      .then((info) => info.size)
      .catch(() => this.total)

    this.db.updateTask(task.id, {
      fileName: finalName,
      tempPath: finalPath,
      status: 'completed',
      receivedBytes: size ?? this.total ?? this.receivedBytes(),
      totalBytes: size ?? this.total,
      completedAt: new Date().toISOString(),
      errorCode: null,
      errorMessage: null,
      checksumActual: expectedChecksum
    })
    this.hooks.onProgress(task.id, size ?? 0, size ?? this.total)
    this.hooks.onStatus(task.id, 'completed')
    return true
  }

  private async handleFailure(task: TaskRow, error: unknown): Promise<JobOutcome> {
    this.flush(task, true)
    if (this.cancelled) {
      await rm(task.tempPath, { force: true }).catch(() => undefined)
      this.db.updateTask(task.id, {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
        errorCode: null,
        errorMessage: null
      })
      this.hooks.onStatus(task.id, 'cancelled')
      return 'cancelled'
    }
    if (this.paused) {
      this.db.updateTask(task.id, { status: 'paused' })
      this.hooks.onStatus(task.id, 'paused')
      return 'paused'
    }

    const mapped = mapError(error)
    this.logger.error('download.failed', {
      taskId: task.id,
      code: mapped.code,
      message: mapped.message,
      stack: error instanceof Error ? error.stack : undefined
    })
    this.db.updateTask(task.id, {
      status: 'failed',
      errorCode: mapped.code,
      errorMessage: mapped.message,
      completedAt: new Date().toISOString()
    })
    this.hooks.onStatus(task.id, 'failed', mapped.code, mapped.message)
    return 'failed'
  }
}

export async function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function mapError(error: unknown): { code: string; message: string } {
  if (error instanceof HttpError) return { code: error.code, message: error.message }
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  switch (code) {
    case 'ENOSPC':
      return { code: 'TDM-E-DISK-FULL', message: 'Espace disque insuffisant pour terminer le téléchargement.' }
    case 'EACCES':
    case 'EPERM':
      return { code: 'TDM-E-PERMISSION', message: 'Accès refusé : vérifiez les droits du dossier de destination.' }
    case 'ENOENT':
      return { code: 'TDM-E-PATH', message: 'Dossier de destination introuvable.' }
    case 'EROFS':
      return { code: 'TDM-E-READONLY', message: 'Le dossier de destination est en lecture seule.' }
    default:
      break
  }
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return { code: 'TDM-E-TIMEOUT', message: 'Le téléchargement a été interrompu (délai dépassé).' }
  }
  return {
    code: 'TDM-E-UNKNOWN',
    message: error instanceof Error ? error.message : 'Erreur inconnue pendant le téléchargement.'
  }
}
