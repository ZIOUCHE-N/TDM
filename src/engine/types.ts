export interface TaskRow {
  id: string
  url: string
  finalUrl: string | null
  fileName: string
  destDir: string
  tempPath: string
  categoryId: string | null
  queueId: string | null
  status: string
  totalBytes: number | null
  receivedBytes: number
  resumable: number
  etag: string | null
  lastModified: string | null
  contentType: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  priority: number
  connections: number
  speedLimit: number
  checksumExpected: string | null
  checksumActual: string | null
  description: string
  updatedAt: string
}

export interface SegmentRow {
  id: string
  taskId: string
  idx: number
  startOffset: number
  endOffset: number
  position: number
  status: string
  updatedAt: string
}

export interface QueueRow {
  id: string
  name: string
  kind: string
  concurrency: number
  status: string
  createdAt: string
}

export interface CategoryRow {
  id: string
  name: string
  dir: string
  extensions: string
  domains: string
  builtin: number
}

export interface ScheduleRow {
  id: string
  queueId: string
  mode: string
  startAt: string | null
  stopAt: string | null
  daysMask: number | null
  intervalMinutes: number | null
  retries: number
  enabled: number
  nextRunAt: string | null
  lastRunAt: string | null
  action: string
  actionTarget: string | null
}

export interface HistoryRow {
  id: string
  taskId: string | null
  event: string
  at: string
  detailJson: string | null
}

export interface ProbeResult {
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

export interface TaskSpeed {
  taskId: string
  bytesPerSecond: number
}
