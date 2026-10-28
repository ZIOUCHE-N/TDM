import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  session,
  shell,
  Tray,
  utilityProcess,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions
} from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { PROTOCOL_VERSION, type BridgeInfo, type TaskView } from '../shared/protocol'
import type { Settings } from '../shared/settings'
import { BrowserBridge } from './bridge'

type EngineMessage = {
  requestId?: string
  ok?: boolean
  result?: unknown
  error?: { code: string; message?: string; details?: string }
  type?: string
  payload?: unknown
  at?: string
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let engine: Electron.UtilityProcess | null = null
let engineReady = false
let engineRestarts = 0
let settings: Settings | null = null
let bridge: BrowserBridge | null = null
let bridgePort = 0
let quitting = false
let stopped = false
let startHidden = process.argv.includes('--hidden')
let lastClipboard = ''
let argvHandled = false

const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout }
>()

const DOWNLOADS_ROOT = path.join(homedir(), 'Downloads', 'TDM')

// ---------- utilitaires ----------

function assetPath(name: string): string {
  return app.isPackaged ? path.join(process.resourcesPath, name) : path.join(app.getAppPath(), 'build', name)
}

function extensionPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.join(app.getAppPath(), 'extension')
}

function sendHost(type: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('host:event', { type, payload, at: new Date().toISOString() })
  }
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function trusted(event: IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('Appel IPC refusé')
  }
}

function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 o/s'
  const units = ['o/s', 'Kio/s', 'Mio/s', 'Gio/s']
  let value = bytesPerSecond
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}

// ---------- moteur ----------

function sendToRendererEvent(data: EngineMessage): void {
  if (typeof data.requestId === 'string') {
    const entry = pending.get(data.requestId)
    if (entry) {
      clearTimeout(entry.timer)
      pending.delete(data.requestId)
      if (data.ok) entry.resolve(data.result)
      else {
        const error = new Error(data.error?.message ?? 'Erreur du moteur') as Error & {
          code?: string
          details?: string
        }
        error.code = data.error?.code
        error.details = data.error?.details
        entry.reject(error)
      }
    }
    return
  }

  if (typeof data.type !== 'string') return

  if (data.type === 'engine.status') {
    const status = (data.payload as { status?: string } | undefined)?.status
    const wasReady = engineReady
    engineReady = status === 'ready' || status === 'degraded'
    if (engineReady) engineRestarts = 0
    if (engineReady && !wasReady) void onEngineReady()
  }

  if (data.type === 'settings.changed' && data.payload && typeof data.payload === 'object') {
    settings = data.payload as Settings
    applySettings(settings)
  }

  if (data.type === 'notification') {
    const info = data.payload as { title?: string; body?: string; kind?: string; taskId?: string }
    showNotification(info.title ?? 'TDM', info.body ?? '', info.taskId)
  }

  if (data.type === 'stats.tick') {
    const stats = data.payload as { totalSpeed?: number; downloading?: number }
    if (tray) {
      tray.setToolTip(
        stats?.downloading
          ? `TDM — ${stats.downloading} téléchargement(s), ${formatSpeed(stats.totalSpeed ?? 0)}`
          : 'TDM — Téléchargement Download Manager'
      )
    }
  }

  sendHost('engine', { type: data.type, payload: data.payload, at: data.at })
}

function startEngine(): void {
  if (stopped) return
  engineReady = false
  const enginePath = path.join(__dirname, 'engine.js')
  engine = utilityProcess.fork(enginePath, [], {
    serviceName: 'TDM Engine',
    stdio: 'pipe',
    env: {
      ...process.env,
      TDM_APP_VERSION: app.getVersion(),
      TDM_DATA_DIR: app.getPath('userData'),
      TDM_DOWNLOADS_DIR: DOWNLOADS_ROOT
    }
  })

  engine.stdout?.on('data', (chunk: Buffer) => {
    console.log(`[engine] ${chunk.toString().trimEnd()}`)
  })
  engine.stderr?.on('data', (chunk: Buffer) => {
    console.error(`[engine] ${chunk.toString().trimEnd()}`)
  })

  engine.on('message', (message: unknown) => {
    sendToRendererEvent(message as EngineMessage)
  })

  engine.on('spawn', () => {
    console.log('[engine] spawned')
  })

  engine.on('exit', (code) => {
    engineReady = false
    engine = null
    for (const [, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error('Le moteur s’est arrêté'))
    }
    pending.clear()
    console.error(`[engine] exited with code ${code}`)
    if (stopped || quitting) return
    engineRestarts += 1
    sendHost('engine.status', {
      status: 'error',
      message: `Moteur arrêté (code ${code}). Redémarrage ${engineRestarts}/5…`
    })
    if (engineRestarts <= 5) {
      setTimeout(() => startEngine(), Math.min(8000, 800 * engineRestarts))
    } else {
      sendHost('engine.status', {
        status: 'error',
        message: 'Le moteur n’a pas pu redémarrer. Consultez le journal.'
      })
    }
  })
}

function requestEngine(command: string, payload?: unknown, timeoutMs = 60_000): Promise<unknown> {
  if (!engine) return Promise.reject(new Error('Moteur non démarré'))
  if (!engineReady) return Promise.reject(new Error('Moteur en cours de démarrage'))
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('Délai dépassé en attendant le moteur'))
    }, timeoutMs)
    pending.set(requestId, { resolve, reject, timer })
    engine!.postMessage({
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      command,
      payload
    })
  })
}

async function onEngineReady(): Promise<void> {
  try {
    const current = (await requestEngine('settings.get')) as Settings
    settings = current
    applySettings(current)
  } catch (error) {
    console.error('[main] settings load failed', error)
  }
  await applyBridge()
  if (!argvHandled) {
    argvHandled = true
    void addFromArgv(process.argv)
  }
}

// ---------- réglages ----------

function applySettings(next: Settings): void {
  nativeTheme.themeSource = next.theme
  sendHost('theme', {
    theme: next.theme,
    resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })
  applyAutoStart(next.autoStart)
  if (bridge) void applyBridge()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle('TDM — Téléchargement Download Manager')
  }
}

function applyAutoStart(enabled: boolean): void {
  if (!app.isPackaged) return
  try {
    if (process.platform === 'linux') {
      const dir = path.join(app.getPath('home'), '.config', 'autostart')
      const file = path.join(dir, 'tdm.desktop')
      if (enabled) {
        mkdirSync(dir, { recursive: true })
        const exec = app.getPath('exe').replace(/(["\\$`])/g, '\\$1')
        writeFileSync(
          file,
          [
            '[Desktop Entry]',
            'Type=Application',
            'Name=TDM',
            'Comment=Téléchargement Download Manager',
            `Exec="${exec}" --hidden`,
            'Terminal=false',
            'X-GNOME-Autostart-enabled=true',
            ''
          ].join('\n'),
          { mode: 0o644 }
        )
      } else {
        rmSync(file, { force: true })
      }
    } else {
      app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
    }
  } catch (error) {
    console.error('[main] autostart failed', error)
  }
}

// ---------- pont navigateur ----------

async function applyBridge(): Promise<void> {
  if (!settings) return
  if (!bridge) {
    bridge = new BrowserBridge({
      dataDir: app.getPath('userData'),
      version: app.getVersion(),
      addTask: (input) => requestEngine('tasks.add', { ...input, startNow: input.startNow ?? true }, 90_000),
      log: (message, detail) => console.log(`[bridge] ${message}`, detail ?? '')
    })
    bridge.setStatusListener((info: BridgeInfo) => {
      bridgePort = info.port
      sendHost('bridge.status', info)
    })
  }

  if (!settings.bridgeEnabled) {
    await bridge.stop()
    sendHost('bridge.status', { ...bridge.info(), enabled: false })
    return
  }

  if (bridge.info().running && bridgePort === settings.bridgePort) return
  bridgePort = settings.bridgePort
  const info = await bridge.start(settings.bridgePort)
  sendHost('bridge.status', info)
}

// ---------- notifications & presse-papiers ----------

function showNotification(title: string, body: string, taskId?: string): void {
  if (settings && !settings.notifications) return
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title,
    body,
    icon: assetPath('notification.png'),
    silent: false
  })
  notification.on('click', () => {
    showWindow()
    if (taskId) sendHost('focus-task', taskId)
  })
  notification.show()
}

function looksDownloadable(text: string): boolean {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const pathname = url.pathname.toLowerCase()
  if (
    /\.(zip|rar|7z|tar|gz|bz2|xz|zst|iso|pdf|docx?|xlsx?|pptx?|epub|mp3|flac|wav|ogg|mp4|mkv|avi|mov|webm|exe|msi|msix|deb|rpm|appimage|dmg|pkg|apk|jar)$/.test(
      pathname
    )
  ) {
    return true
  }
  return /(?:^|[?&])(download|dl|attachment)=?/i.test(url.search)
}

setInterval(() => {
  void (async () => {
    if (!settings?.clipboardMonitoring) return
    if (!mainWindow || mainWindow.isDestroyed()) return
    const text = (await clipboard.readText()).trim()
    if (!text || text === lastClipboard || text.length > 4096) return
    if (!looksDownloadable(text)) return
    lastClipboard = text
    sendHost('clipboard.detected', { url: text })
  })().catch(() => undefined)
}, 2000)

// ---------- menu & tray ----------

function sendCommand(command: string): void {
  showWindow()
  sendHost('ui:command', command)
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Nouveau téléchargement…', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('new-download') },
        { type: 'separator' },
        { label: 'Paramètres…', accelerator: 'CmdOrCtrl+,', click: () => sendCommand('settings') },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'quit', label: 'Quitter TDM' } : { label: 'Quitter', accelerator: 'Ctrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Téléchargements',
      submenu: [
        { label: 'Tout démarrer', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand('resume-all') },
        { label: 'Tout suspendre', accelerator: 'CmdOrCtrl+Shift+P', click: () => sendCommand('pause-all') },
        { type: 'separator' },
        { label: 'Vider les téléchargements terminés…', click: () => sendCommand('clear-finished') },
        { label: 'Ajouter depuis le presse-papiers', click: () => void addFromClipboard() }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger l’interface' },
        { role: 'toggleDevTools', label: 'Outils de développement', visible: !app.isPackaged },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Taille réelle' },
        { role: 'zoomIn', label: 'Agrandir' },
        { role: 'zoomOut', label: 'Réduire' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    },
    {
      label: 'Outils',
      submenu: [
        { label: 'Dossier de l’extension navigateur', click: () => void shell.openPath(extensionPath()) },
        { label: 'Dossier des journaux', click: () => void shell.openPath(path.join(app.getPath('userData'), 'logs')) },
        { label: 'Dossier des téléchargements', click: () => void shell.openPath(settings?.defaultDownloadDir ?? DOWNLOADS_ROOT) },
        { type: 'separator' },
        { label: 'Diagnostic du moteur', click: () => sendCommand('diagnostics') }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'À propos de TDM', click: () => void showAbout() },
        { label: 'Limites de cette version', click: () => sendCommand('about-limitations') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function addFromClipboard(): Promise<void> {
  const text = (await clipboard.readText()).trim()
  if (!text) {
    void dialog.showMessageBox({ type: 'info', message: 'Le presse-papiers est vide.' })
    return
  }
  showWindow()
  sendHost('ui:command', { command: 'new-download', url: text })
}

async function showAbout(): Promise<void> {
  await dialog.showMessageBox({
    type: 'info',
    title: 'À propos de TDM',
    message: 'TDM — Téléchargement Download Manager',
    detail: [
      `Version ${app.getVersion()}`,
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
      `SQLite : moteur local (node:sqlite)`,
      '',
      'Gestionnaire de téléchargements original pour Linux et Windows.',
      'Inspiré de fonctions documentées publiquement ; aucun code, icône ou ressource d’un autre produit n’est utilisé.',
      'Aucun contournement de DRM, d’authentification ou de protection de site.'
    ].join('\n'),
    buttons: ['Fermer']
  })
}

function buildTray(): void {
  if (tray) return
  const image = nativeImage
    .createFromPath(assetPath('tray.png'))
    .resize({ width: process.platform === 'linux' ? 22 : 16, height: process.platform === 'linux' ? 22 : 16 })
  tray = new Tray(image)
  tray.setToolTip('TDM — Téléchargement Download Manager')
  const menu = Menu.buildFromTemplate([
    { label: 'Afficher TDM', click: () => showWindow() },
    { label: 'Nouveau téléchargement…', click: () => sendCommand('new-download') },
    { type: 'separator' },
    { label: 'Tout démarrer', click: () => void requestEngine('tasks.startAll').catch(() => undefined) },
    { label: 'Tout suspendre', click: () => void requestEngine('tasks.pauseAll').catch(() => undefined) },
    { type: 'separator' },
    { label: 'Quitter TDM', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', () => showWindow())
  tray.on('click', () => showWindow())
}

// ---------- fenêtre ----------

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 1020,
    minHeight: 620,
    show: false,
    backgroundColor: '#0e1317',
    title: 'TDM — Téléchargement Download Manager',
    icon: assetPath('icon.png'),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
      devTools: !app.isPackaged
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!startHidden) mainWindow?.show()
    startHidden = false
  })

  mainWindow.on('close', (event) => {
    if (quitting || !settings?.minimizeToTray) return
    event.preventDefault()
    mainWindow?.hide()
    if (process.platform === 'darwin') app.dock?.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('show', () => {
    if (process.platform === 'darwin') void app.dock?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
  })

  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ---------- IPC ----------

function registerIpc(): void {
  ipcMain.handle('engine:request', async (event, body: { command?: unknown; payload?: unknown }) => {
    trusted(event)
    if (!body || typeof body.command !== 'string') throw new Error('Commande invalide')
    return requestEngine(body.command, body.payload)
  })

  ipcMain.handle('app:info', (event) => {
    trusted(event)
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
      dataDir: app.getPath('userData'),
      downloadsDir: settings?.defaultDownloadDir ?? DOWNLOADS_ROOT,
      theme: settings?.theme ?? 'system',
      resolvedTheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    }
  })

  ipcMain.handle('app:open-external', async (event, url: unknown) => {
    trusted(event)
    if (typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('http://'))) {
      throw new Error('URL non autorisée')
    }
    await shell.openExternal(url)
  })

  ipcMain.handle('app:show-item', async (event, target: unknown) => {
    trusted(event)
    if (typeof target !== 'string' || !path.isAbsolute(target)) throw new Error('Chemin invalide')
    shell.showItemInFolder(target)
  })

  ipcMain.handle('app:open-task-file', async (event, id: unknown) => {
    trusted(event)
    if (typeof id !== 'string') throw new Error('Identifiant invalide')
    const task = (await requestEngine('tasks.get', { id })) as TaskView
    if (task.status !== 'completed') throw new Error('Le fichier n’est pas encore disponible.')
    const confirmation = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      title: 'Ouvrir le fichier',
      message: task.fileName,
      detail: task.filePath,
      buttons: ['Ouvrir', 'Annuler'],
      defaultId: 1,
      cancelId: 1
    })
    if (confirmation.response !== 0) return { opened: false }
    const error = await shell.openPath(task.filePath)
    if (error) throw new Error(error)
    return { opened: true }
  })

  ipcMain.handle('app:open-extension-folder', async (event) => {
    trusted(event)
    return shell.openPath(extensionPath())
  })

  ipcMain.handle('app:open-logs', async (event) => {
    trusted(event)
    return shell.openPath(path.join(app.getPath('userData'), 'logs'))
  })

  ipcMain.handle('dialog:select-directory', async (event, defaultPath: unknown) => {
    trusted(event)
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choisir un dossier',
      defaultPath: typeof defaultPath === 'string' ? defaultPath : DOWNLOADS_ROOT,
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('dialog:confirm', async (event, body: { title?: unknown; message?: unknown; detail?: unknown }) => {
    trusted(event)
    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      title: typeof body?.title === 'string' ? body.title.slice(0, 120) : 'Confirmer',
      message: typeof body?.message === 'string' ? body.message.slice(0, 400) : 'Confirmer l’action ?',
      detail: typeof body?.detail === 'string' ? body.detail.slice(0, 1000) : undefined,
      buttons: ['Confirmer', 'Annuler'],
      defaultId: 1,
      cancelId: 1
    })
    return result.response === 0
  })

  ipcMain.handle('bridge:info', (event) => {
    trusted(event)
    if (!bridge) return { enabled: false, port: 0, token: '', origin: '', running: false, error: null }
    return { ...bridge.info(), enabled: settings?.bridgeEnabled ?? false }
  })

  ipcMain.handle('bridge:test', async (event) => {
    trusted(event)
    if (!bridge || !settings?.bridgeEnabled) return { ok: false, message: 'Le pont est désactivé.' }
    try {
      const response = await fetch(`http://127.0.0.1:${settings.bridgePort}/v1/ping`, {
        signal: AbortSignal.timeout(3000)
      })
      const data = (await response.json()) as { app?: string; version?: string }
      return {
        ok: response.ok && data.app === 'TDM',
        message: response.ok ? `Pont actif — version ${data.version ?? '?'}` : `HTTP ${response.status}`
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Échec du test' }
    }
  })

  ipcMain.handle('clipboard:read', async (event) => {
    trusted(event)
    return (await clipboard.readText()).slice(0, 4096)
  })
}

// ---------- cycle de vie ----------

async function addFromArgv(argv: string[]): Promise<void> {
  const candidate = argv.find((arg) => /^https?:\/\//i.test(arg))
  if (!candidate) return
  try {
    await requestEngine('tasks.add', { url: candidate })
    showWindow()
  } catch (error) {
    console.error('[main] add from argv failed', error)
    dialog.showMessageBox({
      type: 'error',
      message: 'Impossible d’ajouter ce lien.',
      detail: error instanceof Error ? error.message : String(error)
    })
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.setAppUserModelId('org.tdm.downloadmanager')

  app.on('second-instance', (_event, argv) => {
    showWindow()
    void addFromArgv(argv)
  })

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)

    registerIpc()
    buildMenu()
    buildTray()
    createWindow()
    startEngine()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !settings?.minimizeToTray) app.quit()
  })

  app.on('before-quit', (event) => {
    if (quitting) return
    if (!engine || !engineReady) {
      stopped = true
      engine?.kill()
      return
    }
    event.preventDefault()
    quitting = true
    stopped = true
    const hardExit = setTimeout(() => {
      engine?.kill()
      app.exit(0)
    }, 5000)
    requestEngine('engine.shutdown', undefined, 4000)
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(hardExit)
        engine?.kill()
        app.exit(0)
      })
  })
}
