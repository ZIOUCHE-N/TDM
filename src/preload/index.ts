import { contextBridge, ipcRenderer } from 'electron'
import type { BridgeInfo, EngineEvent, TaskView } from '../shared/protocol'

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

const api = {
  request: (command: string, payload?: unknown): Promise<unknown> =>
    ipcRenderer.invoke('engine:request', { command, payload }),

  onHostEvent: (callback: (event: HostEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: HostEvent): void => callback(data)
    ipcRenderer.on('host:event', listener)
    return () => ipcRenderer.removeListener('host:event', listener)
  },

  // Conservé pour compatibilité avec l'ancien canal moteur.
  onEvent: (callback: (event: EngineEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: EngineEvent): void => callback(data)
    ipcRenderer.on('engine:event', listener)
    return () => ipcRenderer.removeListener('engine:event', listener)
  },

  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),

  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),

  showItemInFolder: (path: string): Promise<void> => ipcRenderer.invoke('app:show-item', path),

  openTaskFile: (id: string): Promise<{ opened: boolean }> => ipcRenderer.invoke('app:open-task-file', id),

  openExtensionFolder: (): Promise<string> => ipcRenderer.invoke('app:open-extension-folder'),

  openLogs: (): Promise<string> => ipcRenderer.invoke('app:open-logs'),

  selectDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-directory', defaultPath),

  confirm: (body: { title?: string; message: string; detail?: string }): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirm', body),

  bridgeInfo: (): Promise<BridgeInfo> => ipcRenderer.invoke('bridge:info'),

  bridgeTest: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('bridge:test'),

  readClipboard: (): Promise<string> => ipcRenderer.invoke('clipboard:read'),

  getTask: (id: string): Promise<TaskView> => ipcRenderer.invoke('engine:request', { command: 'tasks.get', payload: { id } })
}

contextBridge.exposeInMainWorld('tdm', api)

export type TdmApi = typeof api
