import { existsSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  CategoryRow,
  HistoryRow,
  QueueRow,
  ScheduleRow,
  SegmentRow,
  TaskRow
} from './types'
import type { Logger } from './logger'

const SCHEMA_VERSION = 1

const TASK_FIELDS: Array<[keyof TaskRow, string]> = [
  ['url', 'url'],
  ['finalUrl', 'final_url'],
  ['fileName', 'file_name'],
  ['destDir', 'dest_dir'],
  ['tempPath', 'temp_path'],
  ['categoryId', 'category_id'],
  ['queueId', 'queue_id'],
  ['status', 'status'],
  ['totalBytes', 'total_bytes'],
  ['receivedBytes', 'received_bytes'],
  ['resumable', 'resumable'],
  ['etag', 'etag'],
  ['lastModified', 'last_modified'],
  ['contentType', 'content_type'],
  ['createdAt', 'created_at'],
  ['startedAt', 'started_at'],
  ['completedAt', 'completed_at'],
  ['errorCode', 'error_code'],
  ['errorMessage', 'error_message'],
  ['priority', 'priority'],
  ['connections', 'connections'],
  ['speedLimit', 'speed_limit'],
  ['checksumExpected', 'checksum_expected'],
  ['checksumActual', 'checksum_actual'],
  ['description', 'description'],
  ['updatedAt', 'updated_at']
]

function mapTask(row: Record<string, unknown>): TaskRow {
  return {
    id: String(row.id),
    url: String(row.url),
    finalUrl: row.final_url === null ? null : String(row.final_url),
    fileName: String(row.file_name),
    destDir: String(row.dest_dir),
    tempPath: String(row.temp_path),
    categoryId: row.category_id === null ? null : String(row.category_id),
    queueId: row.queue_id === null ? null : String(row.queue_id),
    status: String(row.status),
    totalBytes: row.total_bytes === null ? null : Number(row.total_bytes),
    receivedBytes: Number(row.received_bytes ?? 0),
    resumable: Number(row.resumable ?? 0),
    etag: row.etag === null ? null : String(row.etag),
    lastModified: row.last_modified === null ? null : String(row.last_modified),
    contentType: row.content_type === null ? null : String(row.content_type),
    createdAt: String(row.created_at),
    startedAt: row.started_at === null ? null : String(row.started_at),
    completedAt: row.completed_at === null ? null : String(row.completed_at),
    errorCode: row.error_code === null ? null : String(row.error_code),
    errorMessage: row.error_message === null ? null : String(row.error_message),
    priority: Number(row.priority ?? 0),
    connections: Number(row.connections ?? 1),
    speedLimit: Number(row.speed_limit ?? 0),
    checksumExpected: row.checksum_expected === null ? null : String(row.checksum_expected),
    checksumActual: row.checksum_actual === null ? null : String(row.checksum_actual),
    description: String(row.description ?? ''),
    updatedAt: String(row.updated_at)
  }
}

function mapSegment(row: Record<string, unknown>): SegmentRow {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    idx: Number(row.idx),
    startOffset: Number(row.start_offset),
    endOffset: Number(row.end_offset),
    position: Number(row.position),
    status: String(row.status),
    updatedAt: String(row.updated_at)
  }
}

function mapQueue(row: Record<string, unknown>): QueueRow {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: String(row.kind),
    concurrency: Number(row.concurrency),
    status: String(row.status),
    createdAt: String(row.created_at)
  }
}

function mapSchedule(row: Record<string, unknown>): ScheduleRow {
  return {
    id: String(row.id),
    queueId: String(row.queue_id),
    mode: String(row.mode),
    startAt: row.start_at === null ? null : String(row.start_at),
    stopAt: row.stop_at === null ? null : String(row.stop_at),
    daysMask: row.days_mask === null ? null : Number(row.days_mask),
    intervalMinutes: row.interval_minutes === null ? null : Number(row.interval_minutes),
    retries: Number(row.retries ?? 0),
    enabled: Number(row.enabled ?? 0),
    nextRunAt: row.next_run_at === null ? null : String(row.next_run_at),
    lastRunAt: row.last_run_at === null ? null : String(row.last_run_at),
    action: String(row.action ?? 'none'),
    actionTarget: row.action_target === null ? null : String(row.action_target)
  }
}

export class Database {
  private db: DatabaseSync

  private constructor(db: DatabaseSync) {
    this.db = db
  }

  static open(filePath: string, logger: Logger): Database {
    mkdirSync(path.dirname(filePath), { recursive: true })
    try {
      return Database.openInternal(filePath, logger)
    } catch (error) {
      const backup = `${filePath}.corrupt-${Date.now()}`
      logger.error('db.open.failed', {
        message: error instanceof Error ? error.message : String(error),
        backup
      })
      if (existsSync(filePath)) renameSync(filePath, backup)
      const database = Database.openInternal(filePath, logger)
      database.setSetting('db.lastRecovery', {
        at: new Date().toISOString(),
        backup,
        message: error instanceof Error ? error.message : String(error)
      })
      return database
    }
  }

  private static openInternal(filePath: string, logger: Logger): Database {
    const sqlite = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')
    const db = new sqlite.DatabaseSync(filePath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA busy_timeout = 5000')
    const database = new Database(db)
    database.migrate(logger)
    return database
  }

  private migrate(logger: Logger): void {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    const version = Number(row.user_version ?? 0)
    if (version >= SCHEMA_VERSION) return

    logger.info('db.migrate', { from: version, to: SCHEMA_VERSION })
    this.db.exec('BEGIN')
    try {
      if (version < 1) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            final_url TEXT,
            file_name TEXT NOT NULL,
            dest_dir TEXT NOT NULL,
            temp_path TEXT NOT NULL,
            category_id TEXT,
            queue_id TEXT,
            status TEXT NOT NULL,
            total_bytes INTEGER,
            received_bytes INTEGER NOT NULL DEFAULT 0,
            resumable INTEGER NOT NULL DEFAULT 0,
            etag TEXT,
            last_modified TEXT,
            content_type TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            error_code TEXT,
            error_message TEXT,
            priority INTEGER NOT NULL DEFAULT 0,
            connections INTEGER NOT NULL DEFAULT 1,
            speed_limit INTEGER NOT NULL DEFAULT 0,
            checksum_expected TEXT,
            checksum_actual TEXT,
            description TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS segments (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            idx INTEGER NOT NULL,
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            position INTEGER NOT NULL,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(task_id, idx)
          );

          CREATE TABLE IF NOT EXISTS queues (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL DEFAULT 'download',
            concurrency INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'stopped',
            created_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS queue_items (
            queue_id TEXT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            PRIMARY KEY(queue_id, task_id)
          );

          CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY,
            queue_id TEXT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
            mode TEXT NOT NULL,
            start_at TEXT,
            stop_at TEXT,
            days_mask INTEGER,
            interval_minutes INTEGER,
            retries INTEGER NOT NULL DEFAULT 3,
            enabled INTEGER NOT NULL DEFAULT 1,
            next_run_at TEXT,
            last_run_at TEXT,
            action TEXT NOT NULL DEFAULT 'none',
            action_target TEXT
          );

          CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            dir TEXT NOT NULL,
            extensions TEXT NOT NULL,
            domains TEXT NOT NULL,
            builtin INTEGER NOT NULL DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            task_id TEXT,
            event TEXT NOT NULL,
            at TEXT NOT NULL,
            detail_json TEXT
          );

          CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
          CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
          CREATE INDEX IF NOT EXISTS idx_history_at ON history(at);
        `)
      }
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close(): void {
    this.db.close()
  }

  // ---------- tasks ----------

  insertTask(task: TaskRow): void {
    const columns = ['id', ...TASK_FIELDS.map(([, column]) => column)]
    const placeholders = columns.map(() => '?').join(', ')
    const values = [task.id, ...TASK_FIELDS.map(([key]) => this.toSqlite(task[key]))]
    this.db.prepare(`INSERT INTO tasks (${columns.join(', ')}) VALUES (${placeholders})`).run(...values)
  }

  updateTask(id: string, patch: Partial<TaskRow>): void {
    const entries = TASK_FIELDS.filter(([key]) => Object.prototype.hasOwnProperty.call(patch, key))
    if (entries.length === 0) return
    const assignments = entries.map(([, column]) => `${column} = ?`).join(', ')
    const values = entries.map(([key]) => this.toSqlite(patch[key]))
    this.db.prepare(`UPDATE tasks SET ${assignments} WHERE id = ?`).run(...values, id)
  }

  getTask(id: string): TaskRow | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    return row ? mapTask(row as Record<string, unknown>) : null
  }

  listTasks(): TaskRow[] {
    return (this.db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all() as Record<string, unknown>[]).map(mapTask)
  }

  deleteTask(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }

  countTasksByStatus(status: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE status = ?').get(status) as { count: number }
    return Number(row?.count ?? 0)
  }

  // ---------- segments ----------

  replaceSegments(taskId: string, segments: SegmentRow[]): void {
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM segments WHERE task_id = ?').run(taskId)
      const stmt = this.db.prepare(
        'INSERT INTO segments (id, task_id, idx, start_offset, end_offset, position, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      for (const segment of segments) {
        stmt.run(
          segment.id,
          taskId,
          segment.idx,
          segment.startOffset,
          segment.endOffset,
          segment.position,
          segment.status,
          segment.updatedAt
        )
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  listSegments(taskId: string): SegmentRow[] {
    return (
      this.db.prepare('SELECT * FROM segments WHERE task_id = ? ORDER BY idx ASC').all(taskId) as Record<
        string,
        unknown
      >[]
    ).map(mapSegment)
  }

  updateSegmentPosition(id: string, position: number, status: string): void {
    this.db
      .prepare('UPDATE segments SET position = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(position, status, new Date().toISOString(), id)
  }

  // ---------- queues ----------

  insertQueue(queue: QueueRow): void {
    this.db
      .prepare('INSERT INTO queues (id, name, kind, concurrency, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(queue.id, queue.name, queue.kind, queue.concurrency, queue.status, queue.createdAt)
  }

  updateQueue(id: string, patch: Partial<QueueRow>): void {
    const fields: Array<[keyof QueueRow, string]> = [
      ['name', 'name'],
      ['kind', 'kind'],
      ['concurrency', 'concurrency'],
      ['status', 'status']
    ]
    const entries = fields.filter(([key]) => Object.prototype.hasOwnProperty.call(patch, key))
    if (entries.length === 0) return
    const assignments = entries.map(([, column]) => `${column} = ?`).join(', ')
    const values = entries.map(([key]) => this.toSqlite(patch[key]))
    this.db.prepare(`UPDATE queues SET ${assignments} WHERE id = ?`).run(...values, id)
  }

  listQueues(): QueueRow[] {
    return (this.db.prepare('SELECT * FROM queues ORDER BY created_at ASC').all() as Record<string, unknown>[]).map(mapQueue)
  }

  getQueue(id: string): QueueRow | null {
    const row = this.db.prepare('SELECT * FROM queues WHERE id = ?').get(id)
    return row ? mapQueue(row as Record<string, unknown>) : null
  }

  deleteQueue(id: string): void {
    this.db.prepare('DELETE FROM queues WHERE id = ?').run(id)
  }

  setQueueTasks(queueId: string, taskIds: string[]): void {
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM queue_items WHERE queue_id = ?').run(queueId)
      const stmt = this.db.prepare('INSERT INTO queue_items (queue_id, task_id, position) VALUES (?, ?, ?)')
      taskIds.forEach((taskId, index) => stmt.run(queueId, taskId, index))
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  listQueueTaskIds(queueId: string): string[] {
    return (
      this.db.prepare('SELECT task_id FROM queue_items WHERE queue_id = ? ORDER BY position ASC').all(queueId) as {
        task_id: string
      }[]
    ).map((row) => row.task_id)
  }

  // ---------- schedules ----------

  listSchedules(): ScheduleRow[] {
    return (this.db.prepare('SELECT * FROM schedules').all() as Record<string, unknown>[]).map(mapSchedule)
  }

  getSchedule(id: string): ScheduleRow | null {
    const row = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id)
    return row ? mapSchedule(row as Record<string, unknown>) : null
  }

  upsertSchedule(schedule: ScheduleRow): void {
    this.db
      .prepare(
        `INSERT INTO schedules (id, queue_id, mode, start_at, stop_at, days_mask, interval_minutes, retries, enabled, next_run_at, last_run_at, action, action_target)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           queue_id = excluded.queue_id, mode = excluded.mode, start_at = excluded.start_at,
           stop_at = excluded.stop_at, days_mask = excluded.days_mask, interval_minutes = excluded.interval_minutes,
           retries = excluded.retries, enabled = excluded.enabled, next_run_at = excluded.next_run_at,
           last_run_at = excluded.last_run_at, action = excluded.action, action_target = excluded.action_target`
      )
      .run(
        schedule.id,
        schedule.queueId,
        schedule.mode,
        schedule.startAt,
        schedule.stopAt,
        schedule.daysMask,
        schedule.intervalMinutes,
        schedule.retries,
        schedule.enabled,
        schedule.nextRunAt,
        schedule.lastRunAt,
        schedule.action,
        schedule.actionTarget
      )
  }

  deleteSchedule(id: string): void {
    this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id)
  }

  // ---------- categories ----------

  listCategories(): CategoryRow[] {
    return this.db.prepare('SELECT * FROM categories ORDER BY name ASC').all() as unknown as CategoryRow[]
  }

  insertCategory(category: CategoryRow): void {
    this.db
      .prepare('INSERT INTO categories (id, name, dir, extensions, domains, builtin) VALUES (?, ?, ?, ?, ?, ?)')
      .run(category.id, category.name, category.dir, category.extensions, category.domains, category.builtin)
  }

  updateCategory(id: string, patch: Partial<CategoryRow>): void {
    const fields: Array<[keyof CategoryRow, string]> = [
      ['name', 'name'],
      ['dir', 'dir'],
      ['extensions', 'extensions'],
      ['domains', 'domains']
    ]
    const entries = fields.filter(([key]) => Object.prototype.hasOwnProperty.call(patch, key))
    if (entries.length === 0) return
    const assignments = entries.map(([, column]) => `${column} = ?`).join(', ')
    const values = entries.map(([key]) => this.toSqlite(patch[key]))
    this.db.prepare(`UPDATE categories SET ${assignments} WHERE id = ?`).run(...values, id)
  }

  deleteCategory(id: string): void {
    this.db.prepare('DELETE FROM categories WHERE id = ? AND builtin = 0').run(id)
  }

  // ---------- settings ----------

  getSetting<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as
      | { value_json: string }
      | undefined
    if (!row) return null
    try {
      return JSON.parse(row.value_json) as T
    } catch {
      return null
    }
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at'
      )
      .run(key, JSON.stringify(value), new Date().toISOString())
  }

  // ---------- history ----------

  addHistory(event: string, taskId: string | null, detail: unknown = null): void {
    this.db
      .prepare('INSERT INTO history (id, task_id, event, at, detail_json) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), taskId, event, new Date().toISOString(), detail === null ? null : JSON.stringify(detail))
  }

  listHistory(limit = 200): HistoryRow[] {
    return this.db
      .prepare('SELECT * FROM history ORDER BY at DESC LIMIT ?')
      .all(limit) as unknown as HistoryRow[]
  }

  purgeHistory(before: string): number {
    const result = this.db.prepare('DELETE FROM history WHERE at < ?').run(before)
    return Number(result.changes ?? 0)
  }

  private toSqlite(value: unknown): string | number | null {
    if (value === undefined || value === null) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    if (typeof value === 'number') return value
    return String(value)
  }
}
