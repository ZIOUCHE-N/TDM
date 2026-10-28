import { z } from 'zod'

export const settingsSchema = z.object({
  defaultDownloadDir: z.string().min(1),
  maxConcurrentDownloads: z.number().int().min(1).max(16),
  maxConnectionsPerTask: z.number().int().min(1).max(16),
  globalSpeedLimitKib: z.number().int().min(0).max(10_000_000),
  perTaskSpeedLimitKib: z.number().int().min(0).max(10_000_000),
  retryCount: z.number().int().min(0).max(20),
  resumeOnStartup: z.boolean(),
  clipboardMonitoring: z.boolean(),
  notifications: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  proxyMode: z.enum(['system', 'direct', 'manual']),
  proxyUrl: z.string(),
  proxyBypass: z.string(),
  userAgent: z.string().max(512),
  autoStart: z.boolean(),
  minimizeToTray: z.boolean(),
  confirmDelete: z.boolean(),
  historyRetentionDays: z.number().int().min(0).max(3650),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
  bridgeEnabled: z.boolean(),
  bridgePort: z.number().int().min(1024).max(65_535),
  segmentThresholdMib: z.number().int().min(1).max(1024)
})

export type Settings = z.infer<typeof settingsSchema>

export const defaultSettings = (downloadsDir: string): Settings => ({
  defaultDownloadDir: downloadsDir,
  maxConcurrentDownloads: 3,
  maxConnectionsPerTask: 4,
  globalSpeedLimitKib: 0,
  perTaskSpeedLimitKib: 0,
  retryCount: 3,
  resumeOnStartup: true,
  clipboardMonitoring: false,
  notifications: true,
  theme: 'system',
  proxyMode: 'system',
  proxyUrl: '',
  proxyBypass: '',
  userAgent: '',
  autoStart: false,
  minimizeToTray: true,
  confirmDelete: true,
  historyRetentionDays: 90,
  logLevel: 'info',
  bridgeEnabled: true,
  bridgePort: 47831,
  segmentThresholdMib: 8
})
