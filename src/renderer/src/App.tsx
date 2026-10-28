import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CategoryView, QueueView, ScheduleView, TaskView } from '../../shared/protocol'
import type { Settings } from '../../shared/settings'
import type { HostEvent } from './env'
import { useEngine, taskActive } from './hooks/useEngine'
import { Sidebar, type Selection } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { TaskTable, type SortDir, type SortKey } from './components/TaskTable'
import { PropertiesPanel } from './components/PropertiesPanel'
import { StatusBar } from './components/StatusBar'
import { ToastStack, type Toast, type ToastKind } from './components/Toasts'
import { AddDownloadDialog } from './components/AddDownloadDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { QueuesDialog } from './components/QueuesDialog'
import { SchedulesDialog, type ScheduleInput } from './components/SchedulesDialog'
import { CategoriesDialog, type CategoryInput } from './components/CategoriesDialog'
import { HistoryDialog } from './components/HistoryDialog'
import { DiagnosticsDialog } from './components/DiagnosticsDialog'
import { Modal } from './components/Modal'
import { IconAlert } from './components/Icons'
import { daysSummary } from './lib/format'

type DialogState =
  | null
  | { kind: 'add'; url?: string }
  | { kind: 'settings' }
  | { kind: 'queues' }
  | { kind: 'schedules' }
  | { kind: 'categories' }
  | { kind: 'history' }
  | { kind: 'diagnostics' }
  | { kind: 'limitations' }

const FAILED_STATUSES = new Set(['failed', 'needs_attention'])

function matchesSelection(task: TaskView, selection: Selection): boolean {
  switch (selection.kind) {
    case 'all':
      return true
    case 'active':
      return taskActive(task.status)
    case 'finished':
      return ['completed', 'failed', 'cancelled', 'needs_attention'].includes(task.status)
    case 'completed':
      return task.status === 'completed'
    case 'paused':
      return task.status === 'paused'
    case 'failed':
      return FAILED_STATUSES.has(task.status)
    case 'category':
      return task.categoryId === selection.id
    case 'queue':
      return task.queueId === selection.id
    default:
      return true
  }
}

export default function App(): React.JSX.Element {
  const { state, refreshAll, reloadHistory, applyTask, removeTaskLocal, retryConnection } = useEngine()
  const [selection, setSelection] = useState<Selection>({ kind: 'all' })
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'createdAt', dir: 'desc' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastTimers = useRef(new Map<string, number>())

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = toastTimers.current.get(id)
    if (timer) window.clearTimeout(timer)
    toastTimers.current.delete(id)
  }, [])

  const pushToast = useCallback(
    (
      title: string,
      body?: string,
      kind: ToastKind = 'info',
      action?: { label: string; onClick: () => void },
      duration = 5200
    ) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((current) => [...current.slice(-3), { id, title, body, kind, action, duration }])
      if (duration > 0) {
        const timer = window.setTimeout(() => dismissToast(id), duration)
        toastTimers.current.set(id, timer)
      }
    },
    [dismissToast]
  )

  const toast = useCallback(
    (title: string, body?: string, kind: 'success' | 'error' | 'info' = 'info') => pushToast(title, body, kind),
    [pushToast]
  )

  const { settings, tasks, categories, queues, schedules, stats, bridge, connection, error, info, appInfo } = state

  // ---------- thème ----------
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const theme = settings?.theme ?? 'system'
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings?.theme])

  // ---------- événements hôte ----------
  useEffect(() => {
    const unsubscribe = window.tdm.onHostEvent((event: HostEvent) => {
      if (event.type === 'ui:command') {
        const payload = event.payload
        if (typeof payload === 'string') {
          if (payload === 'new-download') setDialog({ kind: 'add' })
          else if (payload === 'settings') setDialog({ kind: 'settings' })
          else if (payload === 'pause-all') void window.tdm.request('tasks.pauseAll').catch(() => undefined)
          else if (payload === 'resume-all') void window.tdm.request('tasks.startAll').catch(() => undefined)
          else if (payload === 'clear-finished') void clearFinished()
          else if (payload === 'diagnostics') setDialog({ kind: 'diagnostics' })
          else if (payload === 'about-limitations') setDialog({ kind: 'limitations' })
        } else if (payload && typeof payload === 'object') {
          const command = payload as { command?: string; url?: string }
          if (command.command === 'new-download') setDialog({ kind: 'add', url: command.url })
        }
        return
      }

      if (event.type === 'clipboard.detected') {
        const url = (event.payload as { url?: string })?.url
        if (!url) return
        pushToast(
          'Lien détecté dans le presse-papiers',
          url,
          'clipboard',
          { label: 'Télécharger', onClick: () => setDialog({ kind: 'add', url }) },
          12_000
        )
        return
      }

      if (event.type === 'focus-task') {
        const id = (event.payload as { id?: string } | string) as string
        if (typeof id === 'string') {
          setSelectedId(id)
          if (!state.tasks.some((task) => task.id === id)) {
            void window.tdm.getTask(id).then(applyTask).catch(() => undefined)
          }
        }
        return
      }

      if (event.type === 'engine') {
        const payload = event.payload as { type?: string; payload?: unknown }
        if (payload?.type === 'notification') {
          const notification = payload.payload as { kind?: string; title?: string; body?: string }
          pushToast(
            notification.title ?? 'TDM',
            notification.body,
            notification.kind === 'error' ? 'error' : 'success'
          )
        }
      }
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToast, applyTask, state.tasks])

  // ---------- données dérivées ----------
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = tasks.filter((task) => {
      if (!matchesSelection(task, selection)) return false
      if (!needle) return true
      return (
        task.fileName.toLowerCase().includes(needle) ||
        task.url.toLowerCase().includes(needle) ||
        task.description.toLowerCase().includes(needle) ||
        (task.categoryName ?? '').toLowerCase().includes(needle)
      )
    })
    const direction = sort.dir === 'asc' ? 1 : -1
    return list.sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return a.fileName.localeCompare(b.fileName, 'fr') * direction
        case 'status':
          return a.status.localeCompare(b.status) * direction
        case 'size':
          return ((a.totalBytes ?? 0) - (b.totalBytes ?? 0)) * direction
        case 'speed':
          return (a.speed - b.speed) * direction
        default:
          return a.createdAt.localeCompare(b.createdAt) * direction
      }
    })
  }, [tasks, selection, search, sort])

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [tasks, selectedId]
  )

  const title = useMemo(() => {
    if (selection.kind === 'all') return 'Tous les téléchargements'
    if (selection.kind === 'active') return 'En cours'
    if (selection.kind === 'finished') return 'Terminés et échecs'
    if (selection.kind === 'completed') return 'Terminés'
    if (selection.kind === 'paused') return 'Suspendus'
    if (selection.kind === 'failed') return 'Échecs et vérifications'
    if (selection.kind === 'category') {
      return categories.find((category) => category.id === selection.id)?.name ?? 'Catégorie'
    }
    return queues.find((queue) => queue.id === selection.id)?.name ?? 'File d’attente'
  }, [selection, categories, queues])

  const subtitle = `${filtered.length} téléchargement${filtered.length > 1 ? 's' : ''}${
    search.trim() ? ' filtré(s)' : ''
  }`

  // ---------- actions ----------
  const call = useCallback(
    async <T,>(command: string, payload?: unknown): Promise<T> => {
      const result = (await window.tdm.request(command, payload)) as T
      return result
    },
    []
  )

  const handlePause = useCallback(
    async (task: TaskView) => {
      try {
        applyTask(await call<TaskView>('tasks.pause', { id: task.id }))
      } catch (cause) {
        toast('Suspension impossible', cause instanceof Error ? cause.message : String(cause), 'error')
      }
    },
    [applyTask, call, toast]
  )

  const handleResume = useCallback(
    async (task: TaskView) => {
      try {
        applyTask(await call<TaskView>('tasks.resume', { id: task.id }))
      } catch (cause) {
        toast('Reprise impossible', cause instanceof Error ? cause.message : String(cause), 'error')
      }
    },
    [applyTask, call, toast]
  )

  const handleCancel = useCallback(
    async (task: TaskView) => {
      try {
        applyTask(await call<TaskView>('tasks.cancel', { id: task.id }))
        toast('Téléchargement annulé', task.fileName, 'info')
      } catch (cause) {
        toast('Annulation impossible', cause instanceof Error ? cause.message : String(cause), 'error')
      }
    },
    [applyTask, call, toast]
  )

  const handleRemove = useCallback(
    async (task: TaskView, deleteFile: boolean) => {
      if (settings?.confirmDelete !== false) {
        const ok = await window.tdm.confirm({
          title: deleteFile ? 'Supprimer la tâche et le fichier' : 'Retirer la tâche',
          message: deleteFile ? `Supprimer définitivement « ${task.fileName} » ?` : `Retirer « ${task.fileName} » de la liste ?`,
          detail: deleteFile
            ? 'Le fichier final sera supprimé du disque. Cette action est irréversible.'
            : task.status === 'completed'
              ? 'Le fichier restera sur le disque ; seule la tâche sera retirée de la base.'
              : 'Le fichier temporaire sera supprimé, le fichier final n’existe pas encore.'
        })
        if (!ok) return
      }
      try {
        await call('tasks.remove', { id: task.id, deleteFile })
        removeTaskLocal(task.id)
        if (selectedId === task.id) setSelectedId(null)
        toast('Tâche retirée', task.fileName, 'success')
      } catch (cause) {
        toast('Suppression impossible', cause instanceof Error ? cause.message : String(cause), 'error')
      }
    },
    [call, removeTaskLocal, selectedId, settings?.confirmDelete, toast]
  )

  const handleShowFolder = useCallback(
    (task: TaskView) => {
      const target = task.status === 'completed' ? task.filePath : task.destDir
      void window.tdm.showItemInFolder(target).catch((cause) => {
        toast('Dossier introuvable', cause instanceof Error ? cause.message : String(cause), 'error')
      })
    },
    [toast]
  )

  const handleOpenFile = useCallback(
    (task: TaskView) => {
      void window.tdm.openTaskFile(task.id).catch((cause) => {
        toast('Ouverture impossible', cause instanceof Error ? cause.message : String(cause), 'error')
      })
    },
    [toast]
  )

  const handleUpdate = useCallback(
    async (task: TaskView, patch: Record<string, unknown>) => {
      try {
        applyTask(await call<TaskView>('tasks.update', { id: task.id, patch }))
      } catch (cause) {
        toast('Mise à jour impossible', cause instanceof Error ? cause.message : String(cause), 'error')
        throw cause
      }
    },
    [applyTask, call, toast]
  )

  const clearFinished = useCallback(async () => {
    const finished = tasks.filter((task) => ['completed', 'failed', 'cancelled', 'needs_attention'].includes(task.status))
    if (finished.length === 0) {
      toast('Aucun élément à retirer', 'Il n’y a aucun téléchargement terminé ou en échec.', 'info')
      return
    }
    const ok = await window.tdm.confirm({
      title: 'Vider les téléchargements terminés',
      message: `Retirer ${finished.length} tâche(s) de la liste ?`,
      detail: 'Les fichiers terminés restent sur le disque. Les fichiers temporaires des échecs sont supprimés.'
    })
    if (!ok) return
    try {
      const result = await call<{ removed: number }>('tasks.clearFinished', { deleteFiles: false })
      await refreshAll()
      toast('Liste nettoyée', `${result.removed} tâche(s) retirée(s).`, 'success')
    } catch (cause) {
      toast('Nettoyage impossible', cause instanceof Error ? cause.message : String(cause), 'error')
    }
  }, [tasks, call, refreshAll, toast])

  const saveSettings = useCallback(
    async (next: Settings) => {
      await call<Settings>('settings.update', next)
      await refreshAll()
    },
    [call, refreshAll]
  )

  // ---------- rendu ----------
  return (
    <div className="app-shell">
      <Sidebar
        tasks={tasks}
        categories={categories}
        queues={queues}
        selection={selection}
        onSelect={setSelection}
        onOpenCategories={() => setDialog({ kind: 'categories' })}
        onOpenQueues={() => setDialog({ kind: 'queues' })}
        onOpenSchedules={() => setDialog({ kind: 'schedules' })}
        onOpenHistory={() => {
          setDialog({ kind: 'history' })
          void reloadHistory()
        }}
        onOpenSettings={() => setDialog({ kind: 'settings' })}
        onToggleQueue={(queue) => {
          void call(queue.status === 'running' ? 'queues.stop' : 'queues.start', { id: queue.id })
            .then(() => refreshAll())
            .catch((cause) => toast('Action impossible', cause instanceof Error ? cause.message : String(cause), 'error'))
        }}
      />

      <div className="workspace">
        <Toolbar
          title={title}
          subtitle={subtitle}
          search={search}
          onSearch={setSearch}
          stats={stats}
          bridge={bridge}
          onNew={() => setDialog({ kind: 'add' })}
          onPauseAll={() => {
            void call('tasks.pauseAll')
              .then(() => refreshAll())
              .catch((cause) => toast('Action impossible', cause instanceof Error ? cause.message : String(cause), 'error'))
          }}
          onResumeAll={() => {
            void call('tasks.startAll')
              .then(() => refreshAll())
              .catch((cause) => toast('Action impossible', cause instanceof Error ? cause.message : String(cause), 'error'))
          }}
          onClearFinished={() => void clearFinished()}
          onSettings={() => setDialog({ kind: 'settings' })}
          onRefresh={() => void refreshAll()}
        />

        {connection === 'error' || error ? (
          <div className="banner banner--error" role="alert">
            <IconAlert size={17} />
            <span>{error ?? 'Le moteur a rencontré un problème.'}</span>
            <button type="button" className="button button--ghost" onClick={retryConnection}>
              Réessayer
            </button>
          </div>
        ) : null}

        {connection === 'starting' ? (
          <div className="banner banner--info">
            <span className="spinner" aria-hidden="true" />
            <span>Démarrage du moteur et ouverture de la base locale…</span>
          </div>
        ) : null}

        <div className={`workspace__body${selectedTask ? ' workspace__body--with-properties' : ''}`}>
          <main className="content" aria-label="Liste des téléchargements">
            <TaskTable
              tasks={filtered}
              totalCount={tasks.length}
              selectedId={selectedId}
              sort={sort}
              onSort={(key) =>
                setSort((current) =>
                  current.key === key
                    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
                    : { key, dir: key === 'createdAt' ? 'desc' : 'asc' }
                )
              }
              onSelect={(task) => setSelectedId(task.id)}
              onPause={(task) => void handlePause(task)}
              onResume={(task) => void handleResume(task)}
              onCancel={(task) => void handleCancel(task)}
              onRemove={(task) => void handleRemove(task, false)}
              onShowFolder={handleShowFolder}
              onOpenFile={handleOpenFile}
              onNewDownload={() => setDialog({ kind: 'add' })}
            />
          </main>

          {selectedTask ? (
            <PropertiesPanel
              task={selectedTask}
              queues={queues}
              onClose={() => setSelectedId(null)}
              onPause={(task) => void handlePause(task)}
              onResume={(task) => void handleResume(task)}
              onCancel={(task) => void handleCancel(task)}
              onRemove={(task, deleteFile) => void handleRemove(task, deleteFile)}
              onShowFolder={handleShowFolder}
              onOpenFile={handleOpenFile}
              onUpdate={handleUpdate}
              onToast={toast}
            />
          ) : null}
        </div>

        <StatusBar
          connection={connection}
          info={info}
          stats={stats}
          bridge={bridge}
          onOpenLogs={() => void window.tdm.openLogs()}
        />
      </div>

      {dialog?.kind === 'add' && settings ? (
        <AddDownloadDialog
          settings={settings}
          categories={categories}
          queues={queues}
          initialUrl={dialog.url}
          onClose={() => setDialog(null)}
          onAdded={applyTask}
          onToast={toast}
        />
      ) : null}

      {dialog?.kind === 'settings' && settings ? (
        <SettingsDialog
          settings={settings}
          appInfo={appInfo}
          engineInfo={info}
          bridge={bridge}
          onClose={() => setDialog(null)}
          onSave={saveSettings}
          onOpenDiagnostics={() => setDialog({ kind: 'diagnostics' })}
          onToast={toast}
        />
      ) : null}

      {dialog?.kind === 'queues' ? (
        <QueuesDialog
          queues={queues}
          onClose={() => setDialog(null)}
          onCreate={async (name, concurrency) => {
            await call<QueueView>('queues.create', { name, concurrency })
            await refreshAll()
          }}
          onUpdate={async (id, patch) => {
            await call<QueueView>('queues.update', { id, patch })
            await refreshAll()
          }}
          onDelete={async (queue) => {
            const ok = await window.tdm.confirm({
              title: 'Supprimer la file',
              message: `Supprimer la file « ${queue.name} » ?`,
              detail: 'Les tâches associées seront conservées et détachées de la file.'
            })
            if (!ok) return
            await call('queues.delete', { id: queue.id })
            await refreshAll()
          }}
          onStart={async (queue) => {
            await call('queues.start', { id: queue.id })
            await refreshAll()
          }}
          onStop={async (queue) => {
            await call('queues.stop', { id: queue.id })
            await refreshAll()
          }}
          onToast={toast}
        />
      ) : null}

      {dialog?.kind === 'schedules' ? (
        <SchedulesDialog
          schedules={schedules}
          queues={queues}
          onClose={() => setDialog(null)}
          onSave={async (input: ScheduleInput) => {
            await call<ScheduleView[]>('schedules.save', input)
            await refreshAll()
          }}
          onDelete={async (schedule) => {
            const ok = await window.tdm.confirm({
              title: 'Supprimer le planning',
              message: `Supprimer le planning ${schedule.mode === 'daily' ? daysSummary(schedule.daysMask) : ''} ?`
            })
            if (!ok) return
            await call<ScheduleView[]>('schedules.delete', { id: schedule.id })
            await refreshAll()
          }}
          onToast={toast}
        />
      ) : null}

      {dialog?.kind === 'categories' ? (
        <CategoriesDialog
          categories={categories}
          defaultDir={settings?.defaultDownloadDir ?? ''}
          onClose={() => setDialog(null)}
          onSave={async (input: CategoryInput) => {
            await call<CategoryView>('categories.save', input)
            await refreshAll()
          }}
          onDelete={async (category) => {
            const ok = await window.tdm.confirm({
              title: 'Supprimer la catégorie',
              message: `Supprimer « ${category.name} » ?`,
              detail: 'Les tâches existantes conservent leur dossier actuel ; la catégorie disparaît de la liste.'
            })
            if (!ok) return
            await call<CategoryView[]>('categories.delete', { id: category.id })
            await refreshAll()
          }}
          onToast={toast}
        />
      ) : null}

      {dialog?.kind === 'history' ? (
        <HistoryDialog history={state.history} onClose={() => setDialog(null)} onReload={reloadHistory} />
      ) : null}

      {dialog?.kind === 'diagnostics' ? (
        <DiagnosticsDialog onClose={() => setDialog(null)} onToast={toast} />
      ) : null}

      {dialog?.kind === 'limitations' ? (
        <Modal
          title="Limites de cette version"
          subtitle="TDM 0.1.0 — périmètre assumé, sans fausse promesse."
          size="lg"
          onClose={() => setDialog(null)}
        >
          <div className="prose">
            <h3>Pris en charge</h3>
            <ul>
              <li>HTTP/HTTPS avec redirections, reprise, segments parallèles et repli séquentiel.</li>
              <li>Pause, reprise, annulation, priorités, files d’attente et planificateur local.</li>
              <li>Catégories par extension et domaine, historique SQLite, vérification SHA-256.</li>
              <li>Pont navigateur local explicite par jeton, extension Chrome/Edge et Firefox.</li>
            </ul>
            <h3>Non pris en charge en 0.1.0</h3>
            <ul>
              <li>FTP, MMS, streaming vidéo, capture de médias et grabber de sites.</li>
              <li>Authentification NTLM/Kerberos, cookies de session importés, contournement de DRM ou de protections.</li>
              <li>Native messaging et installation automatique de l’extension.</li>
              <li>Planificateur actif lorsque TDM est complètement fermé.</li>
            </ul>
            <h3>Sécurité</h3>
            <ul>
              <li>Interface Electron sandboxée, contexte isolé, aucune intégration Node dans le rendu.</li>
              <li>Moteur séparé en utilityProcess ; IPC validé par schémas Zod.</li>
              <li>Pont limité à 127.0.0.1, jeton de 256 bits, contrôle d’origine et limitation de débit.</li>
              <li>Aucun code, icône ou ressource d’un autre gestionnaire n’est utilisé.</li>
            </ul>
          </div>
        </Modal>
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
