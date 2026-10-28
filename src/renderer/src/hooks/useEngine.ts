import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BridgeInfo,
  CategoryView,
  EngineInfo,
  EngineStats,
  HistoryView,
  PingResult,
  QueueView,
  ScheduleView,
  TaskStatus,
  TaskView
} from '../../../shared/protocol'
import type { Settings } from '../../../shared/settings'
import type { AppInfo, HostEvent } from '../env'

export type ConnectionState = 'starting' | 'ready' | 'error'

export interface EngineState {
  connection: ConnectionState
  error: string | null
  info: EngineInfo | null
  appInfo: AppInfo | null
  tasks: TaskView[]
  queues: QueueView[]
  categories: CategoryView[]
  schedules: ScheduleView[]
  history: HistoryView[]
  stats: EngineStats
  settings: Settings | null
  bridge: BridgeInfo | null
}

const emptyStats: EngineStats = {
  queued: 0,
  downloading: 0,
  paused: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  totalSpeed: 0,
  totalReceived: 0,
  activeDownloads: 0
}

const initialState: EngineState = {
  connection: 'starting',
  error: null,
  info: null,
  appInfo: null,
  tasks: [],
  queues: [],
  categories: [],
  schedules: [],
  history: [],
  stats: emptyStats,
  settings: null,
  bridge: null
}

function upsert(tasks: TaskView[], task: TaskView): TaskView[] {
  const index = tasks.findIndex((item) => item.id === task.id)
  if (index === -1) return [task, ...tasks]
  const next = tasks.slice()
  next[index] = task
  return next
}

export function useEngine(): {
  state: EngineState
  refreshAll: () => Promise<void>
  reloadHistory: () => Promise<void>
  applyTask: (task: TaskView) => void
  removeTaskLocal: (id: string) => void
  retryConnection: () => void
} {
  const [state, setState] = useState<EngineState>(initialState)
  const booted = useRef(false)
  const refreshTimer = useRef<number | null>(null)

  const refreshAll = useCallback(async () => {
    try {
      const [tasks, queues, categories, schedules, history, stats, settings, bridge] = await Promise.all([
        window.tdm.request('tasks.list') as Promise<TaskView[]>,
        window.tdm.request('queues.list') as Promise<QueueView[]>,
        window.tdm.request('categories.list') as Promise<CategoryView[]>,
        window.tdm.request('schedules.list') as Promise<ScheduleView[]>,
        window.tdm.request('history.list', { limit: 300 }) as Promise<HistoryView[]>,
        window.tdm.request('engine.stats') as Promise<EngineStats>,
        window.tdm.request('settings.get') as Promise<Settings>,
        window.tdm.bridgeInfo()
      ])
      setState((current) => ({
        ...current,
        connection: 'ready',
        error: null,
        tasks,
        queues,
        categories,
        schedules,
        history,
        stats,
        settings,
        bridge
      }))
    } catch (error) {
      setState((current) => ({
        ...current,
        connection: current.info ? 'ready' : 'error',
        error: error instanceof Error ? error.message : String(error)
      }))
    }
  }, [])

  const reloadHistory = useCallback(async () => {
    try {
      const history = (await window.tdm.request('history.list', { limit: 300 })) as HistoryView[]
      setState((current) => ({ ...current, history }))
    } catch {
      // l'historique n'est pas critique
    }
  }, [])

  const applyTask = useCallback((task: TaskView) => {
    setState((current) => ({ ...current, tasks: upsert(current.tasks, task) }))
  }, [])

  const removeTaskLocal = useCallback((id: string) => {
    setState((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }))
  }, [])

  const boot = useCallback(async () => {
    try {
      const appInfo = await window.tdm.getInfo()
      setState((current) => ({ ...current, appInfo }))
    } catch {
      // info applicative indisponible : l'interface continue
    }

    for (let attempt = 0; attempt < 150; attempt += 1) {
      try {
        const result = (await window.tdm.request('engine.ping')) as PingResult
        setState((current) => ({ ...current, info: result.info, connection: 'ready', error: null }))
        await refreshAll()
        return
      } catch (error) {
        if (attempt === 0) {
          setState((current) => ({
            ...current,
            connection: 'starting',
            error: error instanceof Error ? error.message : String(error)
          }))
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
    setState((current) => ({
      ...current,
      connection: 'error',
      error: 'Le moteur TDM ne répond pas. Consultez les journaux.'
    }))
  }, [refreshAll])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void boot()
  }, [boot])

  useEffect(() => {
    const unsubscribe = window.tdm.onHostEvent((event: HostEvent) => {
      if (event.type === 'engine.status') {
        const payload = event.payload as { status?: string; message?: string }
        if (payload.status === 'error') {
          setState((current) => ({
            ...current,
            connection: 'error',
            error: payload.message ?? 'Le moteur s’est arrêté.'
          }))
        }
        return
      }

      if (event.type === 'bridge.status') {
        setState((current) => ({ ...current, bridge: event.payload as BridgeInfo }))
        return
      }

      if (event.type !== 'engine') return
      const payload = event.payload as { type: string; payload: unknown }
      if (!payload || typeof payload.type !== 'string') return

      switch (payload.type) {
        case 'task.updated':
        case 'task.added':
          setState((current) => ({ ...current, tasks: upsert(current.tasks, payload.payload as TaskView) }))
          break
        case 'task.removed': {
          const id = (payload.payload as { id?: string })?.id
          if (id) setState((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }))
          break
        }
        case 'tasks.changed':
          if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
          refreshTimer.current = window.setTimeout(() => void refreshAll(), 150)
          break
        case 'queues.changed':
          setState((current) => ({ ...current, queues: payload.payload as QueueView[] }))
          break
        case 'categories.changed':
          setState((current) => ({ ...current, categories: payload.payload as CategoryView[] }))
          break
        case 'schedules.changed':
          setState((current) => ({ ...current, schedules: payload.payload as ScheduleView[] }))
          break
        case 'settings.changed':
          setState((current) => ({ ...current, settings: payload.payload as Settings }))
          break
        case 'stats.tick':
          setState((current) => ({ ...current, stats: payload.payload as EngineStats }))
          break
        case 'engine.status': {
          const status = payload.payload as { status?: string; message?: string }
          if (status.status === 'error') {
            setState((current) => ({
              ...current,
              connection: 'error',
              error: status.message ?? 'Le moteur s’est arrêté.'
            }))
          }
          break
        }
        default:
          break
      }
    })

    return () => {
      unsubscribe()
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
    }
  }, [refreshAll])

  const retryConnection = useCallback(() => {
    setState((current) => ({ ...current, connection: 'starting', error: null }))
    void boot()
  }, [boot])

  return { state, refreshAll, reloadHistory, applyTask, removeTaskLocal, retryConnection }
}

export function taskActive(status: TaskStatus): boolean {
  return status === 'downloading' || status === 'probing' || status === 'queued' || status === 'cancelling'
}
