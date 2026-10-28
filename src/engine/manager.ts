import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import type {
  AddTaskInput,
  CategoryView,
  EngineStats,
  HistoryView,
  ProbeView,
  QueueView,
  TaskFilter,
  TaskStatus,
  TaskView
} from '../shared/protocol'
import type { Settings } from '../shared/settings'
import type { CategoryService } from './categories'
import type { Database } from './db'
import { DownloadJob, mapError, planSegments, type JobOutcome } from './downloader'
import { assertHttpUrl, probe } from './http'
import { LimiterRegistry } from './limiter'
import type { Logger } from './logger'
import {
  fileNameFromContentDisposition,
  fileNameFromUrl,
  isPathInside,
  sanitizeFileName
} from './paths'
import type { SettingsService } from './settings'
import type { QueueRow, ScheduleRow, TaskRow } from './types'

export type Emit = (type: string, payload: unknown) => void

interface RunningJob {
  job: DownloadJob
  promise: Promise<JobOutcome>
  queueId: string | null
}

interface SpeedSample {
  bytes: number
  at: number
  speed: number
  lastEmit: number
}

const DEFAULT_QUEUE_ID = 'queue-default'

export class TaskManager {
  private readonly jobs = new Map<string, RunningJob>()
  private readonly speeds = new Map<string, SpeedSample>()
  private readonly limiters = new LimiterRegistry()
  private readonly resumeAfterStop = new Set<string>()
  private pumping = false
  private stopping = false

  constructor(
    private readonly db: Database,
    private readonly settingsService: SettingsService,
    private readonly categories: CategoryService,
    private readonly logger: Logger,
    private readonly emit: Emit,
    private readonly downloadsRoot: string
  ) {}

  init(): void {
    if (this.db.listQueues().length === 0) {
      const now = new Date().toISOString()
      this.db.insertQueue({
        id: DEFAULT_QUEUE_ID,
        name: 'Principal',
        kind: 'download',
        concurrency: 1,
        status: 'running',
        createdAt: now
      })
    }

    const settings = this.settingsService.get()
    for (const task of this.db.listTasks()) {
      if (task.status === 'downloading' || task.status === 'probing' || task.status === 'cancelling') {
        this.db.updateTask(task.id, {
          status: settings.resumeOnStartup ? 'queued' : 'paused',
          errorCode: null,
          errorMessage: null
        })
      }
    }

    const retention = settings.historyRetentionDays
    if (retention > 0) {
      const cutoff = new Date(Date.now() - retention * 86_400_000).toISOString()
      const purged = this.db.purgeHistory(cutoff)
      if (purged > 0) this.logger.info('history.purged', { count: purged })
    }

    this.applyLimits()
    this.pump()
  }

  applyLimits(): void {
    const settings = this.settingsService.get()
    this.limiters.global.setRate(settings.globalSpeedLimitKib * 1024)
  }

  // ---------- lecture ----------

  list(filter: TaskFilter = {}): TaskView[] {
    const categories = new Map(this.categories.list().map((category) => [category.id, category.name]))
    const queues = new Map(this.db.listQueues().map((queue) => [queue.id, queue.name]))
    let tasks = this.db.listTasks().map((task) => this.toView(task, categories, queues))

    if (filter.categoryId !== undefined) {
      tasks = tasks.filter((task) => (task.categoryId ?? null) === (filter.categoryId ?? null))
    }
    if (filter.queueId !== undefined) {
      tasks = tasks.filter((task) => (task.queueId ?? null) === (filter.queueId ?? null))
    }
    if (filter.status && filter.status !== 'all') {
      const active: TaskStatus[] = ['downloading', 'probing', 'queued']
      const finished: TaskStatus[] = ['completed', 'failed', 'cancelled', 'needs_attention']
      tasks = tasks.filter((task) =>
        filter.status === 'active'
          ? active.includes(task.status)
          : filter.status === 'finished'
            ? finished.includes(task.status)
            : task.status === filter.status
      )
    }
    if (filter.search && filter.search.trim()) {
      const needle = filter.search.trim().toLowerCase()
      tasks = tasks.filter(
        (task) =>
          task.fileName.toLowerCase().includes(needle) ||
          task.url.toLowerCase().includes(needle) ||
          task.description.toLowerCase().includes(needle)
      )
    }
    return tasks
  }

  get(id: string): TaskView {
    const task = this.requireTask(id)
    const categories = new Map(this.categories.list().map((category) => [category.id, category.name]))
    const queues = new Map(this.db.listQueues().map((queue) => [queue.id, queue.name]))
    return this.toView(task, categories, queues)
  }

  listQueues(): QueueView[] {
    return this.db.listQueues().map((queue) => this.toQueueView(queue))
  }

  listSchedules(): ReturnType<typeof mapScheduleView>[] {
    const queues = new Map(this.db.listQueues().map((queue) => [queue.id, queue.name]))
    return this.db.listSchedules().map((schedule) => mapScheduleView(schedule, queues.get(schedule.queueId) ?? null))
  }

  scheduleRow(id: string): ScheduleRow | null {
    return this.db.getSchedule(id)
  }

  listCategories(): CategoryView[] {
    const counts = new Map<string, number>()
    for (const task of this.db.listTasks()) {
      if (task.categoryId) counts.set(task.categoryId, (counts.get(task.categoryId) ?? 0) + 1)
    }
    return this.categories.list().map((category) => ({
      id: category.id,
      name: category.name,
      dir: category.dir,
      extensions: category.extensions,
      domains: category.domains,
      builtin: category.builtin,
      taskCount: counts.get(category.id) ?? 0
    }))
  }

  listHistory(limit = 300): HistoryView[] {
    return this.db.listHistory(limit).map((row) => ({
      id: row.id,
      taskId: row.taskId,
      event: row.event,
      at: row.at,
      detail: row.detailJson ? safeJson(row.detailJson) : null
    }))
  }

  stats(): EngineStats {
    const tasks = this.db.listTasks()
    const counts = new Map<string, number>()
    for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1)
    let totalSpeed = 0
    for (const sample of this.speeds.values()) totalSpeed += sample.speed
    return {
      queued: counts.get('queued') ?? 0,
      downloading: counts.get('downloading') ?? 0,
      paused: counts.get('paused') ?? 0,
      completed: counts.get('completed') ?? 0,
      failed: counts.get('failed') ?? 0,
      cancelled: counts.get('cancelled') ?? 0,
      totalSpeed: Math.round(totalSpeed),
      totalReceived: tasks.reduce((sum, task) => sum + task.receivedBytes, 0),
      activeDownloads: this.jobs.size
    }
  }

  async probeUrl(url: string): Promise<ProbeView> {
    const settings = this.settingsService.get()
    const result = await probe(url, settings)
    return { ...result }
  }

  // ---------- écriture ----------

  async add(input: AddTaskInput): Promise<TaskView> {
    const settings = this.settingsService.get()
    assertHttpUrl(input.url)
    const probed = await probe(input.url, settings)

    const fileName = sanitizeFileName(
      input.fileName?.trim() ||
        probed.suggestedFileName ||
        fileNameFromUrl(probed.finalUrl) ||
        'telechargement'
    )
    const category =
      (input.categoryId ? this.categories.get(input.categoryId) : null) ??
      this.categories.match(fileName, probed.finalUrl)
    const destDir = path.resolve(input.destDir?.trim() || category.dir || settings.defaultDownloadDir)
    const taskId = randomUUID()
    const now = new Date().toISOString()
    const connections = Math.max(1, Math.min(16, input.connections ?? settings.maxConnectionsPerTask))

    const queueId = input.queueId ?? null
    if (queueId && !this.db.getQueue(queueId)) throw new Error('File d’attente inconnue')

    const task: TaskRow = {
      id: taskId,
      url: input.url,
      finalUrl: probed.finalUrl,
      fileName,
      destDir,
      tempPath: path.join(destDir, `.${fileName}.${taskId.slice(0, 8)}.tdm-part`),
      categoryId: category?.id ?? null,
      queueId,
      status: input.startNow === false ? 'paused' : 'queued',
      totalBytes: probed.contentLength,
      receivedBytes: 0,
      resumable: probed.resumable ? 1 : 0,
      etag: probed.etag,
      lastModified: probed.lastModified,
      contentType: probed.contentType,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      priority: 0,
      connections,
      speedLimit: settings.perTaskSpeedLimitKib,
      checksumExpected: normalizeChecksum(input.checksumExpected),
      checksumActual: null,
      description: (input.description ?? '').slice(0, 500),
      updatedAt: now
    }

    this.db.insertTask(task)
    if (probed.contentLength && probed.contentLength > 0) {
      const segments = probed.resumable
        ? planSegments(
            taskId,
            probed.contentLength,
            connections,
            settings.segmentThresholdMib * 1024 * 1024
          )
        : planSegments(taskId, probed.contentLength, 1, Number.MAX_SAFE_INTEGER)
      this.db.replaceSegments(taskId, segments)
    }
    this.db.addHistory('task.added', taskId, { url: input.url, fileName })
    this.emit('task.updated', this.get(taskId))
    this.emit('task.added', this.get(taskId))
    this.pump()
    return this.get(taskId)
  }

  pause(id: string): TaskView {
    const task = this.requireTask(id)
    const running = this.jobs.get(id)
    if (running) {
      this.db.updateTask(id, { status: 'paused' })
      running.job.pause()
    } else if (task.status === 'queued' || task.status === 'downloading' || task.status === 'probing') {
      this.db.updateTask(id, { status: 'paused' })
    }
    this.db.addHistory('task.paused', id, null)
    this.emit('task.updated', this.get(id))
    return this.get(id)
  }

  resume(id: string): TaskView {
    const task = this.requireTask(id)
    if (task.status === 'completed') throw new Error('Ce téléchargement est déjà terminé.')
    if (this.jobs.has(id)) {
      // Le travail est encore en cours d'arrêt : on relancera dès sa sortie.
      this.resumeAfterStop.add(id)
      return this.get(id)
    }
    this.db.updateTask(id, { status: 'queued', errorCode: null, errorMessage: null })
    this.db.addHistory('task.resumed', id, null)
    this.emit('task.updated', this.get(id))
    this.pump()
    return this.get(id)
  }

  retry(id: string): TaskView {
    return this.resume(id)
  }

  cancel(id: string): TaskView {
    const task = this.requireTask(id)
    const running = this.jobs.get(id)
    if (running) {
      this.db.updateTask(id, { status: 'cancelling' })
      running.job.cancel()
    } else {
      this.db.updateTask(id, {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
        errorCode: null,
        errorMessage: null
      })
      void rm(task.tempPath, { force: true }).catch(() => undefined)
    }
    this.db.addHistory('task.cancelled', id, null)
    this.emit('task.updated', this.get(id))
    return this.get(id)
  }

  async remove(id: string, deleteFile: boolean): Promise<void> {
    const task = this.requireTask(id)
    const running = this.jobs.get(id)
    if (running) {
      running.job.cancel()
      await running.promise.catch(() => undefined)
    }
    if (deleteFile && task.status === 'completed') {
      const finalPath = path.join(task.destDir, task.fileName)
      if (isPathInside(finalPath, task.destDir)) await rm(finalPath, { force: true }).catch(() => undefined)
    }
    // Le fichier temporaire ne doit jamais survivre au retrait d'une tâche,
    // sauf lorsque c'est aussi le fichier final conservé volontairement.
    if (deleteFile || task.status !== 'completed') {
      await rm(task.tempPath, { force: true }).catch(() => undefined)
    }
    this.db.deleteTask(id)
    this.db.addHistory('task.removed', id, { fileName: task.fileName, deleteFile })
    this.speeds.delete(id)
    this.limiters.release(id)
    this.emit('task.removed', { id })
    this.pump()
  }

  async clearFinished(deleteFiles: boolean): Promise<number> {
    const finished = this.db
      .listTasks()
      .filter((task) => ['completed', 'failed', 'cancelled', 'needs_attention'].includes(task.status))
    for (const task of finished) await this.remove(task.id, deleteFiles)
    return finished.length
  }

  updateTask(
    id: string,
    patch: {
      queueId?: string | null
      priority?: number
      description?: string
      connections?: number
      speedLimitKib?: number
      checksumExpected?: string | null
    }
  ): TaskView {
    const task = this.requireTask(id)
    const update: Parameters<Database['updateTask']>[1] = {}
    if (patch.queueId !== undefined) {
      if (patch.queueId !== null && !this.db.getQueue(patch.queueId)) throw new Error('File inconnue')
      update.queueId = patch.queueId
    }
    if (patch.priority !== undefined) update.priority = Math.max(-10, Math.min(10, Math.round(patch.priority)))
    if (patch.description !== undefined) update.description = patch.description.slice(0, 500)
    if (patch.connections !== undefined) {
      if (task.status === 'downloading') throw new Error('Modifiez les connexions après une pause.')
      update.connections = Math.max(1, Math.min(16, Math.round(patch.connections)))
    }
    if (patch.speedLimitKib !== undefined) {
      update.speedLimit = Math.max(0, Math.min(10_000_000, Math.round(patch.speedLimitKib)))
    }
    if (patch.checksumExpected !== undefined) {
      update.checksumExpected = normalizeChecksum(patch.checksumExpected)
    }
    this.db.updateTask(id, update)
    this.emit('task.updated', this.get(id))
    this.pump()
    return this.get(id)
  }

  // ---------- files ----------

  createQueue(name: string, concurrency: number): QueueView {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Nom de file requis.')
    const queue: QueueRow = {
      id: randomUUID(),
      name: trimmed.slice(0, 80),
      kind: 'download',
      concurrency: Math.max(1, Math.min(16, Math.round(concurrency))),
      status: 'stopped',
      createdAt: new Date().toISOString()
    }
    this.db.insertQueue(queue)
    this.emit('queues.changed', this.listQueues())
    return this.toQueueView(queue)
  }

  updateQueue(id: string, patch: { name?: string; concurrency?: number }): QueueView {
    const queue = this.db.getQueue(id)
    if (!queue) throw new Error('File inconnue.')
    const update: Partial<QueueRow> = {}
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new Error('Nom de file requis.')
      update.name = patch.name.trim().slice(0, 80)
    }
    if (patch.concurrency !== undefined) {
      update.concurrency = Math.max(1, Math.min(16, Math.round(patch.concurrency)))
    }
    this.db.updateQueue(id, update)
    const next = this.db.getQueue(id)!
    this.emit('queues.changed', this.listQueues())
    this.pump()
    return this.toQueueView(next)
  }

  deleteQueue(id: string): void {
    if (id === DEFAULT_QUEUE_ID) throw new Error('La file principale ne peut pas être supprimée.')
    const queue = this.db.getQueue(id)
    if (!queue) return
    const tasks = this.db.listTasks().filter((task) => task.queueId === id)
    for (const task of tasks) this.db.updateTask(task.id, { queueId: null })
    this.db.deleteQueue(id)
    this.emit('queues.changed', this.listQueues())
    this.pump()
  }

  startQueue(id: string): void {
    const queue = this.db.getQueue(id)
    if (!queue) throw new Error('File inconnue.')
    this.db.updateQueue(id, { status: 'running' })
    for (const task of this.db.listTasks()) {
      if (task.queueId !== id) continue
      if (task.status === 'paused' || task.status === 'failed') {
        this.db.updateTask(task.id, { status: 'queued', errorCode: null, errorMessage: null })
      }
    }
    this.db.addHistory('queue.started', null, { queueId: id })
    this.emit('queues.changed', this.listQueues())
    this.emit('tasks.changed', null)
    this.pump()
  }

  stopQueue(id: string): void {
    const queue = this.db.getQueue(id)
    if (!queue) throw new Error('File inconnue.')
    this.db.updateQueue(id, { status: 'stopped' })
    this.db.addHistory('queue.stopped', null, { queueId: id })
    for (const [taskId, running] of this.jobs) {
      if (running.queueId === id) {
        this.db.updateTask(taskId, { status: 'paused' })
        running.job.pause()
      }
    }
    this.emit('queues.changed', this.listQueues())
  }

  startAll(): void {
    for (const queue of this.db.listQueues()) this.db.updateQueue(queue.id, { status: 'running' })
    for (const task of this.db.listTasks()) {
      if (task.status === 'paused' || task.status === 'failed' || task.status === 'queued') {
        this.db.updateTask(task.id, { status: 'queued', errorCode: null, errorMessage: null })
      }
    }
    this.emit('queues.changed', this.listQueues())
    this.emit('tasks.changed', null)
    this.pump()
  }

  pauseAll(): void {
    for (const [id, running] of this.jobs) {
      this.db.updateTask(id, { status: 'paused' })
      running.job.pause()
    }
    for (const task of this.db.listTasks()) {
      if (task.status === 'queued') this.db.updateTask(task.id, { status: 'paused' })
    }
    this.emit('tasks.changed', null)
  }

  // ---------- planificateur ----------

  saveSchedule(input: {
    id?: string
    queueId: string
    mode: 'once' | 'daily' | 'interval'
    startAt: string | null
    stopAt: string | null
    daysMask: number | null
    intervalMinutes: number | null
    retries: number
    enabled: boolean
    action: 'start_queue' | 'stop_queue' | 'start_all' | 'stop_all'
  }): void {
    if (!this.db.getQueue(input.queueId)) throw new Error('File inconnue.')
    const existing = input.id ? this.db.getSchedule(input.id) : null
    const schedule: ScheduleRow = {
      id: existing?.id ?? randomUUID(),
      queueId: input.queueId,
      mode: input.mode,
      startAt: input.startAt,
      stopAt: input.stopAt,
      daysMask: input.daysMask,
      intervalMinutes: input.intervalMinutes,
      retries: Math.max(0, Math.min(20, input.retries)),
      enabled: input.enabled ? 1 : 0,
      nextRunAt: null,
      lastRunAt: existing?.lastRunAt ?? null,
      action: input.action,
      actionTarget: input.queueId
    }
    this.db.upsertSchedule(schedule)
    this.emit('schedules.changed', this.listSchedules())
  }

  deleteSchedule(id: string): void {
    this.db.deleteSchedule(id)
    this.emit('schedules.changed', this.listSchedules())
  }

  setScheduleNextRun(
    id: string,
    nextRunAt: string | null,
    lastRunAt?: string,
    enabled?: boolean
  ): void {
    const schedule = this.db.getSchedule(id)
    if (!schedule) return
    this.db.upsertSchedule({
      ...schedule,
      nextRunAt,
      lastRunAt: lastRunAt ?? schedule.lastRunAt,
      enabled: enabled === undefined ? schedule.enabled : enabled ? 1 : 0
    })
    this.emit('schedules.changed', this.listSchedules())
  }

  // ---------- catégories ----------

  saveCategory(input: {
    id?: string
    name: string
    dir: string
    extensions: string[]
    domains: string[]
  }): CategoryView {
    const name = input.name.trim()
    if (!name) throw new Error('Nom de catégorie requis.')
    const dir = path.resolve(input.dir.trim() || this.downloadsRoot)
    const extensions = JSON.stringify(
      input.extensions.map((item) => item.trim().replace(/^\./, '').toLowerCase()).filter(Boolean)
    )
    const domains = JSON.stringify(input.domains.map((item) => item.trim().toLowerCase()).filter(Boolean))
    if (input.id) {
      const existing = this.db.listCategories().find((category) => category.id === input.id)
      if (!existing) throw new Error('Catégorie inconnue.')
      this.db.updateCategory(input.id, { name, dir, extensions, domains })
    } else {
      this.db.insertCategory({
        id: randomUUID(),
        name,
        dir,
        extensions,
        domains,
        builtin: 0
      })
    }
    this.emit('categories.changed', this.listCategories())
    return this.listCategories().find((category) => category.name === name)!
  }

  deleteCategory(id: string): void {
    this.db.deleteCategory(id)
    this.emit('categories.changed', this.listCategories())
  }

  // ---------- pompe ----------

  pump(): void {
    if (this.pumping || this.stopping) return
    this.pumping = true
    try {
      const settings = this.settingsService.get()
      const max = settings.maxConcurrentDownloads
      if (this.jobs.size >= max) return

      const queues = new Map(this.db.listQueues().map((queue) => [queue.id, queue]))
      const candidates = this.db
        .listTasks()
        .filter((task) => task.status === 'queued')
        .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))

      for (const task of candidates) {
        if (this.jobs.size >= max) break
        if (this.jobs.has(task.id)) continue
        if (task.queueId) {
          const queue = queues.get(task.queueId)
          if (!queue || queue.status !== 'running') continue
          const active = [...this.jobs.values()].filter((job) => job.queueId === task.queueId).length
          if (active >= queue.concurrency) continue
        }
        this.startJob(task)
      }
    } finally {
      this.pumping = false
    }
  }

  private startJob(task: TaskRow): void {
    const job = new DownloadJob(task.id, this.db, this.logger, {
      settings: () => this.settingsService.get(),
      globalLimiter: this.limiters.global,
      taskLimiter: (id, rate) => this.limiters.forTask(id, rate),
      releaseTaskLimiter: (id) => this.limiters.release(id),
      onProgress: (id, received, total) => this.handleProgress(id, received, total),
      onStatus: (id, status, code, message) => this.handleStatus(id, status, code, message)
    })

    const promise = job
      .run()
      .then((outcome) => {
        this.logger.debug('download.outcome', { taskId: task.id, outcome })
        return outcome
      })
      .catch((error) => {
        this.logger.error('download.crash', {
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error)
        })
        const mapped = mapError(error)
        this.db.updateTask(task.id, {
          status: 'failed',
          errorCode: mapped.code,
          errorMessage: mapped.message
        })
        this.handleStatus(task.id, 'failed', mapped.code, mapped.message)
        return 'failed' as JobOutcome
      })
      .finally(() => {
        this.jobs.delete(task.id)
        this.speeds.delete(task.id)
        this.limiters.release(task.id)
        if (this.resumeAfterStop.delete(task.id)) {
          this.db.updateTask(task.id, { status: 'queued', errorCode: null, errorMessage: null })
        }
        this.emit('task.updated', this.get(task.id))
        this.emit('stats.tick', this.stats())
        this.pump()
      })

    this.jobs.set(task.id, { job, promise, queueId: task.queueId })
    this.emit('task.updated', this.get(task.id))
  }

  private handleProgress(id: string, received: number, total: number | null): void {
    const task = this.db.getTask(id)
    if (!task) return
    const now = Date.now()
    const previous = this.speeds.get(id)
    let speed = previous?.speed ?? 0
    if (previous) {
      const elapsed = (now - previous.at) / 1000
      if (elapsed >= 0.2) {
        const instant = Math.max(0, (received - previous.bytes) / elapsed)
        speed = previous.speed > 0 ? previous.speed * 0.65 + instant * 0.35 : instant
        this.speeds.set(id, { bytes: received, at: now, speed, lastEmit: previous.lastEmit })
      }
    } else {
      this.speeds.set(id, { bytes: received, at: now, speed: 0, lastEmit: 0 })
    }
    const sample = this.speeds.get(id)!
    if (now - sample.lastEmit < 400 && received < (total ?? Number.MAX_SAFE_INTEGER)) return
    sample.lastEmit = now

    this.db.updateTask(id, { receivedBytes: received })
    const view = this.toView(this.db.getTask(id)!, this.categoryNames(), this.queueNames())
    view.speed = Math.round(speed)
    view.etaSeconds = speed > 0 && total !== null ? Math.max(0, (total - received) / speed) : null
    this.emit('task.updated', view)
    this.emit('stats.tick', this.stats())
  }

  private handleStatus(id: string, status: string, code?: string | null, message?: string | null): void {
    const task = this.db.getTask(id)
    if (!task) return
    this.db.addHistory(`task.${status}`, id, code ? { code, message } : null)
    const view = this.toView(task, this.categoryNames(), this.queueNames())
    if (status === 'completed') {
      view.speed = 0
      view.etaSeconds = 0
      this.emit('notification', {
        kind: 'success',
        title: 'Téléchargement terminé',
        body: task.fileName,
        taskId: id
      })
    } else if (status === 'failed') {
      view.speed = 0
      this.emit('notification', {
        kind: 'error',
        title: 'Échec du téléchargement',
        body: message ?? task.fileName,
        taskId: id
      })
    }
    this.emit('task.updated', view)
    this.emit('stats.tick', this.stats())
  }

  private categoryNames(): Map<string, string> {
    return new Map(this.categories.list().map((category) => [category.id, category.name]))
  }

  private queueNames(): Map<string, string> {
    return new Map(this.db.listQueues().map((queue) => [queue.id, queue.name]))
  }

  private toQueueView(queue: QueueRow): QueueView {
    const tasks = this.db.listTasks().filter((task) => task.queueId === queue.id)
    return {
      id: queue.id,
      name: queue.name,
      kind: queue.kind,
      concurrency: queue.concurrency,
      status: queue.status as QueueView['status'],
      createdAt: queue.createdAt,
      taskCount: tasks.length,
      activeCount: tasks.filter((task) => task.status === 'downloading' || task.status === 'probing').length
    }
  }

  private toView(task: TaskRow, categories: Map<string, string>, queues: Map<string, string>): TaskView {
    const filePath = path.join(task.destDir, task.fileName)
    const sample = this.speeds.get(task.id)
    const speed = task.status === 'downloading' ? Math.round(sample?.speed ?? 0) : 0
    const remaining = task.totalBytes !== null ? task.totalBytes - task.receivedBytes : null
    return {
      id: task.id,
      url: task.url,
      finalUrl: task.finalUrl,
      fileName: task.fileName,
      filePath,
      destDir: task.destDir,
      categoryId: task.categoryId,
      categoryName: task.categoryId ? (categories.get(task.categoryId) ?? null) : null,
      queueId: task.queueId,
      queueName: task.queueId ? (queues.get(task.queueId) ?? null) : null,
      status: task.status as TaskStatus,
      totalBytes: task.totalBytes,
      receivedBytes: task.receivedBytes,
      speed,
      etaSeconds: speed > 0 && remaining !== null ? Math.max(0, remaining / speed) : null,
      resumable: task.resumable === 1,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
      priority: task.priority,
      connections: task.connections,
      speedLimitKib: task.speedLimit,
      description: task.description,
      mimeType: task.contentType,
      checksumExpected: task.checksumExpected,
      checksumActual: task.checksumActual
    }
  }

  private requireTask(id: string): TaskRow {
    const task = this.db.getTask(id)
    if (!task) throw new Error('Téléchargement inconnu.')
    return task
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    for (const [, running] of this.jobs) running.job.pause()
    await Promise.all([...this.jobs.values()].map((running) => running.promise.catch(() => undefined)))
    this.jobs.clear()
  }
}

export function normalizeChecksum(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase().replace(/^sha256:/, '')
  if (!/^[a-f0-9]{64}$/.test(trimmed)) throw new Error('La somme SHA-256 doit contenir 64 caractères hexadécimaux.')
  return trimmed
}

export function mapScheduleView(
  schedule: ScheduleRow,
  queueName: string | null
): import('../shared/protocol').ScheduleView {
  return {
    id: schedule.id,
    queueId: schedule.queueId,
    queueName,
    mode: schedule.mode as 'once' | 'daily' | 'interval',
    startAt: schedule.startAt,
    stopAt: schedule.stopAt,
    daysMask: schedule.daysMask,
    intervalMinutes: schedule.intervalMinutes,
    retries: schedule.retries,
    enabled: schedule.enabled === 1,
    nextRunAt: schedule.nextRunAt,
    lastRunAt: schedule.lastRunAt,
    action: schedule.action as 'start_queue' | 'stop_queue' | 'start_all' | 'stop_all',
    actionTarget: schedule.actionTarget
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

// Réexport utilitaire pour les tests et l'entry.
export { fileNameFromContentDisposition }
export type { Settings }
