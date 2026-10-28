import type { TaskManager } from './manager'
import type { Logger } from './logger'
import type { ScheduleRow } from './types'

const TICK_MS = 20_000

export interface Schedulable {
  mode: string
  startAt: string | null
  stopAt: string | null
  daysMask: number | null
  intervalMinutes: number | null
  lastRunAt: string | null
  enabled: number | boolean
}

function parseTimeOfDay(value: string | null): { hours: number; minutes: number } | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

/** bit 0 = lundi … bit 6 = dimanche */
export function dayBit(date: Date): number {
  return (date.getDay() + 6) % 7
}

export function matchesDay(date: Date, daysMask: number | null): boolean {
  if (!daysMask) return true
  return (daysMask & (1 << dayBit(date))) !== 0
}

function atTime(day: Date, time: { hours: number; minutes: number }): Date {
  const result = new Date(day)
  result.setHours(time.hours, time.minutes, 0, 0)
  return result
}

/**
 * Prochaine occurrence strictement après `from`.
 * - once : date/heure ISO unique
 * - daily : HH:MM, filtré par daysMask
 * - interval : toutes les N minutes depuis le dernier lancement (ou maintenant)
 */
export function nextOccurrence(schedule: Schedulable, from: Date): Date | null {
  if (!schedule.enabled) return null

  if (schedule.mode === 'once') {
    if (!schedule.startAt) return null
    const date = new Date(schedule.startAt)
    if (Number.isNaN(date.getTime())) return null
    return date.getTime() > from.getTime() ? date : null
  }

  if (schedule.mode === 'interval') {
    const minutes = schedule.intervalMinutes ?? 0
    if (minutes <= 0) return null
    const last = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null
    const base =
      last && !Number.isNaN(last.getTime()) && last.getTime() > from.getTime() ? last : from
    return new Date(base.getTime() + minutes * 60_000)
  }

  if (schedule.mode === 'daily') {
    const time = parseTimeOfDay(schedule.startAt)
    if (!time) return null
    for (let offset = 0; offset <= 8; offset += 1) {
      const day = new Date(from)
      day.setDate(day.getDate() + offset)
      if (!matchesDay(day, schedule.daysMask)) continue
      const candidate = atTime(day, time)
      if (candidate.getTime() > from.getTime()) return candidate
    }
    return null
  }

  return null
}

function isStartAction(action: string): boolean {
  return action === 'start_queue' || action === 'start_all'
}

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null
  private readonly activeWindows = new Set<string>()

  constructor(
    private readonly manager: TaskManager,
    private readonly logger: Logger
  ) {}

  start(): void {
    if (this.timer) return
    this.refresh()
    this.timer = setInterval(() => {
      try {
        this.tick()
      } catch (error) {
        this.logger.error('scheduler.tick.failed', {
          message: error instanceof Error ? error.message : String(error)
        })
      }
    }, TICK_MS)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Recalcule les prochaines exécutions après création/modification d'un planning. */
  refresh(): void {
    const now = new Date()
    for (const view of this.manager.listSchedules()) {
      if (!view.enabled) continue
      const row = this.manager.scheduleRow(view.id)
      if (!row) continue
      if (row.mode === 'interval' || row.nextRunAt === null) {
        const next = nextOccurrence(row, now)
        this.manager.setScheduleNextRun(row.id, next ? next.toISOString() : null)
      } else if (row.mode === 'daily') {
        const next = nextOccurrence(row, now)
        const value = next ? next.toISOString() : null
        if (value !== row.nextRunAt) this.manager.setScheduleNextRun(row.id, value)
      }
    }
  }

  tick(now = new Date()): void {
    for (const view of this.manager.listSchedules()) {
      if (!view.enabled) continue
      const row = this.manager.scheduleRow(view.id)
      if (!row) continue

      if (row.mode === 'daily' && isStartAction(row.action) && parseTimeOfDay(row.stopAt)) {
        this.tickWindow(row, now)
        continue
      }

      if (!row.nextRunAt) {
        const next = nextOccurrence(row, now)
        this.manager.setScheduleNextRun(row.id, next ? next.toISOString() : null)
        continue
      }

      const due = new Date(row.nextRunAt)
      if (Number.isNaN(due.getTime()) || due.getTime() > now.getTime()) continue

      this.execute(row, now)
      const next = nextOccurrence(
        { ...row, lastRunAt: now.toISOString(), enabled: row.mode === 'once' ? 0 : 1 },
        new Date(now.getTime() + 1000)
      )
      this.manager.setScheduleNextRun(
        row.id,
        next ? next.toISOString() : null,
        now.toISOString(),
        row.mode !== 'once'
      )
    }
  }

  private tickWindow(row: ScheduleRow, now: Date): void {
    const window = this.windowFor(row, now)
    const active = this.activeWindows.has(row.id)
    if (!window) {
      if (active) {
        this.executeStop(row)
        this.activeWindows.delete(row.id)
      }
      this.manager.setScheduleNextRun(row.id, null)
      return
    }

    if (window.inside && !active) {
      this.executeStart(row)
      this.activeWindows.add(row.id)
      this.logger.info('scheduler.window.start', { scheduleId: row.id, queueId: row.queueId })
    } else if (!window.inside && active) {
      this.executeStop(row)
      this.activeWindows.delete(row.id)
      this.logger.info('scheduler.window.stop', { scheduleId: row.id, queueId: row.queueId })
    }

    const nextStart = nextOccurrence({ ...row, stopAt: null }, now)
    const value = nextStart ? nextStart.toISOString() : null
    if (row.nextRunAt !== value) this.manager.setScheduleNextRun(row.id, value)
  }

  private windowFor(
    row: ScheduleRow,
    now: Date
  ): { start: Date; stop: Date; inside: boolean } | null {
    const startTime = parseTimeOfDay(row.startAt)
    const stopTime = parseTimeOfDay(row.stopAt)
    if (!startTime || !stopTime) return null

    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const startToday = atTime(today, startTime)
    const stopToday = atTime(today, stopTime)

    let start = startToday
    let stop = stopToday
    if (stopToday.getTime() <= startToday.getTime()) {
      // Fenêtre traversant minuit (ex. 22:00 → 06:00).
      if (now.getTime() < stopToday.getTime()) {
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        start = atTime(yesterday, startTime)
      } else {
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        stop = atTime(tomorrow, stopTime)
      }
    }

    if (!matchesDay(start, row.daysMask)) return null
    const inside = now.getTime() >= start.getTime() && now.getTime() < stop.getTime()
    return { start, stop, inside }
  }

  private execute(row: ScheduleRow, now: Date): void {
    try {
      if (row.action === 'start_all') this.manager.startAll()
      else if (row.action === 'stop_all') this.manager.pauseAll()
      else if (row.action === 'start_queue') this.manager.startQueue(row.queueId)
      else if (row.action === 'stop_queue') this.manager.stopQueue(row.queueId)
      this.logger.info('scheduler.run', { scheduleId: row.id, action: row.action, at: now.toISOString() })
    } catch (error) {
      this.logger.error('scheduler.run.failed', {
        scheduleId: row.id,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private executeStart(row: ScheduleRow): void {
    try {
      if (row.action === 'start_all') this.manager.startAll()
      else this.manager.startQueue(row.queueId)
    } catch (error) {
      this.logger.error('scheduler.start.failed', {
        scheduleId: row.id,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private executeStop(row: ScheduleRow): void {
    try {
      if (row.action === 'start_all') this.manager.pauseAll()
      else this.manager.stopQueue(row.queueId)
    } catch (error) {
      this.logger.error('scheduler.stop.failed', {
        scheduleId: row.id,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
}
