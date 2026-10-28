import type { CategoryView, QueueView, TaskView } from '../../../shared/protocol'
import {
  IconClock,
  IconDownload,
  IconHistory,
  IconLayers,
  IconPause,
  IconPlay,
  IconSettings,
  IconTag
} from './Icons'

export type Selection =
  | { kind: 'all' }
  | { kind: 'active' }
  | { kind: 'finished' }
  | { kind: 'completed' }
  | { kind: 'paused' }
  | { kind: 'failed' }
  | { kind: 'category'; id: string }
  | { kind: 'queue'; id: string }

interface SidebarProps {
  tasks: TaskView[]
  categories: CategoryView[]
  queues: QueueView[]
  selection: Selection
  onSelect: (selection: Selection) => void
  onOpenCategories: () => void
  onOpenQueues: () => void
  onOpenSchedules: () => void
  onOpenHistory: () => void
  onOpenSettings: () => void
  onToggleQueue: (queue: QueueView) => void
}

function isActive(task: TaskView): boolean {
  return ['downloading', 'probing', 'queued', 'cancelling'].includes(task.status)
}

function isFinished(task: TaskView): boolean {
  return ['completed', 'failed', 'cancelled', 'needs_attention'].includes(task.status)
}

export function Sidebar({
  tasks,
  categories,
  queues,
  selection,
  onSelect,
  onOpenCategories,
  onOpenQueues,
  onOpenSchedules,
  onOpenHistory,
  onOpenSettings,
  onToggleQueue
}: SidebarProps): React.JSX.Element {
  const counts = {
    all: tasks.length,
    active: tasks.filter(isActive).length,
    finished: tasks.filter(isFinished).length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    paused: tasks.filter((task) => task.status === 'paused').length,
    failed: tasks.filter((task) => task.status === 'failed' || task.status === 'needs_attention').length
  }

  const categoryCounts = new Map<string, number>()
  for (const task of tasks) {
    if (task.categoryId) categoryCounts.set(task.categoryId, (categoryCounts.get(task.categoryId) ?? 0) + 1)
  }
  const queueCounts = new Map<string, number>()
  for (const task of tasks) {
    if (task.queueId) queueCounts.set(task.queueId, (queueCounts.get(task.queueId) ?? 0) + 1)
  }

  const item = (
    active: boolean,
    label: string,
    count: number | null,
    onClick: () => void,
    icon?: React.JSX.Element
  ): React.JSX.Element => (
    <button
      type="button"
      className={`nav-item${active ? ' nav-item--active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className="nav-item__icon">{icon ?? <span className="nav-item__dot" />}</span>
      <span className="nav-item__label">{label}</span>
      {count !== null ? <span className="nav-item__count">{count}</span> : null}
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="30" height="30" fill="none">
            <path d="M7 19.5V25h18v-5.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M16 4.5v13" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            <path
              d="m10 12.5 6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <div className="brand-name">TDM</div>
          <div className="brand-tagline">Téléchargement Download Manager</div>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="Navigation principale">
        <div className="nav-group">
          {item(selection.kind === 'all', 'Tous les téléchargements', counts.all, () => onSelect({ kind: 'all' }), <IconDownload size={17} />)}
          {item(selection.kind === 'active', 'En cours', counts.active, () => onSelect({ kind: 'active' }), <IconPlay size={16} />)}
          {item(selection.kind === 'completed', 'Terminés', counts.completed, () => onSelect({ kind: 'completed' }), <IconLayers size={16} />)}
          {item(selection.kind === 'paused', 'Suspendus', counts.paused, () => onSelect({ kind: 'paused' }), <IconPause size={16} />)}
          {item(selection.kind === 'failed', 'Échecs', counts.failed, () => onSelect({ kind: 'failed' }))}
        </div>

        <div className="nav-group">
          <div className="nav-group__header">
            <span>Catégories</span>
            <button type="button" className="link-button" onClick={onOpenCategories}>
              Gérer
            </button>
          </div>
          {categories.map((category) =>
            item(
              selection.kind === 'category' && selection.id === category.id,
              category.name,
              categoryCounts.get(category.id) ?? 0,
              () => onSelect({ kind: 'category', id: category.id }),
              <IconTag size={15} />
            )
          )}
        </div>

        <div className="nav-group">
          <div className="nav-group__header">
            <span>Files d’attente</span>
            <button type="button" className="link-button" onClick={onOpenQueues}>
              Gérer
            </button>
          </div>
          {queues.map((queue) => (
            <div
              key={queue.id}
              className={`queue-row${selection.kind === 'queue' && selection.id === queue.id ? ' queue-row--active' : ''}`}
            >
              <button
                type="button"
                className="queue-row__main"
                onClick={() => onSelect({ kind: 'queue', id: queue.id })}
              >
                <span
                  className={`queue-dot queue-dot--${queue.status}`}
                  aria-label={queue.status === 'running' ? 'En marche' : 'Arrêtée'}
                />
                <span className="queue-row__name">{queue.name}</span>
                <span className="nav-item__count">{queueCounts.get(queue.id) ?? 0}</span>
              </button>
              <button
                type="button"
                className="icon-button icon-button--small"
                onClick={() => onToggleQueue(queue)}
                aria-label={queue.status === 'running' ? `Arrêter ${queue.name}` : `Démarrer ${queue.name}`}
                title={queue.status === 'running' ? 'Arrêter la file' : 'Démarrer la file'}
              >
                {queue.status === 'running' ? <IconPause size={14} /> : <IconPlay size={14} />}
              </button>
            </div>
          ))}
        </div>
      </nav>

      <div className="sidebar__footer">
        <button type="button" className="nav-item" onClick={onOpenSchedules}>
          <span className="nav-item__icon">
            <IconClock size={17} />
          </span>
          <span className="nav-item__label">Planificateur</span>
        </button>
        <button type="button" className="nav-item" onClick={onOpenHistory}>
          <span className="nav-item__icon">
            <IconHistory size={17} />
          </span>
          <span className="nav-item__label">Historique</span>
        </button>
        <button type="button" className="nav-item" onClick={onOpenSettings}>
          <span className="nav-item__icon">
            <IconSettings size={17} />
          </span>
          <span className="nav-item__label">Paramètres</span>
        </button>
      </div>
    </aside>
  )
}
