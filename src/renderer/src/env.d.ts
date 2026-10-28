import type { BridgeInfo, TaskView } from '../../shared/protocol'
import type { Settings } from '../../shared/settings'

export interface AppInfo {
  version: string
  platform: string
  arch: string
  isPackaged: boolean
  dataDir: string
  downloadsDir: string
  theme: 'system' | 'light' | 'dark'
  resolvedTheme: 'light' | 'dark'
}

export interface HostEvent {
  type: string
  payload: unknown
  at: string
}

declare global {
  interface Window {
    tdm: {
      request: (command: string, payload?: unknown) => Promise<unknown>
      onHostEvent: (callback: (event: HostEvent) => void) => () => void
      onEvent: (callback: (event: { type: string; payload: unknown; at: string }) => void) => () => void
      getInfo: () => Promise<AppInfo>
      openExternal: (url: string) => Promise<void>
      showItemInFolder: (path: string) => Promise<void>
      openTaskFile: (id: string) => Promise<{ opened: boolean }>
      openExtensionFolder: () => Promise<string>
      openLogs: () => Promise<string>
      selectDirectory: (defaultPath?: string) => Promise<string | null>
      confirm: (body: { title?: string; message: string; detail?: string }) => Promise<boolean>
      bridgeInfo: () => Promise<BridgeInfo>
      bridgeTest: () => Promise<{ ok: boolean; message: string }>
      readClipboard: () => Promise<string>
      getTask: (id: string) => Promise<TaskView>
    }
  }
}

export type { Settings }
export {}
