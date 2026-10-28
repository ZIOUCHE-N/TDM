export const PROTOCOL_VERSION = 1

export type TaskStatus =
  | 'queued'
  | 'probing'
  | 'downloading'
  | 'paused'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'needs_attention'

export interface TaskView {
  id: string
  url: string
  finalUrl: string | null
  fileName: string
  filePath: string
  destDir: string
  categoryId: string | null
  categoryName: string | null
  queueId: string | null
  queueName: string | null
  status: TaskStatus
  totalBytes: number | null
  receivedBytes: number
  speed: number
  etaSeconds: number | null
  resumable: boolean
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  priority: number
  connections: number
  speedLimitKib: number
  description: string
  mimeType: string | null
  checksumExpected: string | null
  checksumActual: string | null
}

export interface QueueView {
  id: string
  name: string
  kind: string
  concurrency: number
  status: 'running' | 'stopped' | 'paused'
  createdAt: string
  taskCount: number
  activeCount: number
}

export interface ScheduleView {
  id: string
  queueId: string
  queueName: string | null
  mode: 'once' | 'daily' | 'interval'
  startAt: string | null
  stopAt: string | null
  daysMask: number | null
  intervalMinutes: number | null
  retries: number
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  action: 'start_queue' | 'stop_queue' | 'start_all' | 'stop_all'
  actionTarget: string | null
}

export interface CategoryView {
  id: string
  name: string
  dir: string
  extensions: string[]
  domains: string[]
  builtin: boolean
  taskCount: number
}

export interface HistoryView {
  id: string
  taskId: string | null
  event: string
  at: string
  detail: unknown
}

export interface EngineInfo {
  status: 'ready' | 'degraded' | 'error'
  version: string
  sqliteVersion: string
  protocolVersion: number
  startedAt: string
  platform: string
  dataDir: string
}

export interface PingResult {
  ok: true
  pongAt: string
  info: EngineInfo
}

export interface EngineStats {
  queued: number
  downloading: number
  paused: number
  completed: number
  failed: number
  cancelled: number
  totalSpeed: number
  totalReceived: number
  activeDownloads: number
}

export interface ProbeView {
  url: string
  finalUrl: string
  status: number
  contentType: string | null
  contentLength: number | null
  acceptRanges: boolean
  etag: string | null
  lastModified: string | null
  suggestedFileName: string | null
  resumable: boolean
  redirects: string[]
}

export interface BridgeInfo {
  enabled: boolean
  port: number
  token: string
  origin: string
  running: boolean
  error: string | null
}

export interface EngineEventEnvelope {
  type: string
  payload: unknown
  at: string
}

export interface EngineRequest {
  protocolVersion: number
  requestId: string
  command: string
  payload?: unknown
}

export interface EngineResponse {
  protocolVersion: number
  requestId: string
  ok: boolean
  result?: unknown
  error?: { code: string; message: string; details?: string }
}

export interface EngineEvent {
  protocolVersion: number
  type: string
  payload: unknown
  at: string
}

export interface AddTaskInput {
  url: string
  fileName?: string
  destDir?: string
  categoryId?: string
  queueId?: string | null
  connections?: number
  description?: string
  checksumExpected?: string
  startNow?: boolean
  referrer?: string
}

export interface TaskFilter {
  status?: TaskStatus | 'all' | 'active' | 'finished'
  categoryId?: string | null
  queueId?: string | null
  search?: string
}
