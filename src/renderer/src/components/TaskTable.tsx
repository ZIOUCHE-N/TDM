import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { TaskView } from '../../../shared/protocol'
import {
  IconAlert,
  IconCheck,
  IconChevron,
  IconDownload,
  IconFolder,
  IconPause,
  IconPlay,
  IconTrash,
  IconX
} from './Icons'
import {
  formatBytes,
  formatEta,
  formatSpeed,
  hostOf,
  progressPercent,
  statusLabel
} from '../lib/format'

export type SortKey = 'name' | 'status' | 'size' | 'speed' | 'createdAt'
export type SortDir = 'asc' | 'desc'

interface TaskTableProps {
  tasks: TaskView[]
  totalCount: number
  selectedId: string | null
  sort: { key: SortKey; dir: SortDir }
  onSort: (key: SortKey) => void
  onSelect: (task: TaskView) => void
  onPause: (task: TaskView) => void
  onResume: (task: TaskView) => void
  onCancel: (task: TaskView) => void
  onRemove: (task: TaskView) => void
  onShowFolder: (task: TaskView) => void
  onOpenFile: (task: TaskView) => void
  onNewDownload: () => void
}

function StatusBadge({ task }: { task: TaskView }): React.JSX.Element {
  const icon =
    task.status === 'completed' ? (
      <IconCheck size={13} />
    ) : task.status === 'failed' || task.status === 'needs_attention' ? (
      <IconAlert size={13} />
    ) : task.status === 'paused' ? (
      <IconPause size={13} />
    ) : task.status === 'downloading' ? (
      <IconDownload size={13} />
    ) : task.status === 'cancelled' ? (
      <IconX size={13} />
    ) : (
      <span className="status-badge__dot" />
    )
  return (
    <span className={`status-badge status-badge--${task.status}`} title={task.errorMessage ?? undefined}>
      {icon}
      <span>{statusLabel(task.status)}</span>
    </span>
  )
}

export function TaskTable({
  tasks,
  totalCount,
  selectedId,
  sort,
  onSort,
  onSelect,
  onPause,
  onResume,
  onCancel,
  onRemove,
  onShowFolder,
  onOpenFile,
  onNewDownload
}: TaskTableProps): React.JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10
  })

  const header = (label: string, key?: SortKey, className?: string): React.JSX.Element => (
    <button
      type="button"
      className={`table-head__cell${key ? ' table-head__cell--sortable' : ''}${className ? ` ${className}` : ''}`}
      onClick={key ? () => onSort(key) : undefined}
      disabled={!key}
      aria-sort={
        key && sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : key ? 'none' : undefined
      }
    >
      {label}
      {key && sort.key === key ? (
        <IconChevron size={12} className={sort.dir === 'asc' ? 'sort-arrow sort-arrow--asc' : 'sort-arrow'} />
      ) : null}
    </button>
  )

  if (totalCount === 0) {
    return (
      <div className="table-empty">
        <span className="table-empty__icon">
          <IconDownload size={34} />
        </span>
        <h3>Aucun téléchargement</h3>
        <p>Ajoutez un lien HTTP ou HTTPS pour commencer. Les reprises, segments et files d’attente fonctionnent réellement.</p>
        <button type="button" className="button button--primary" onClick={onNewDownload}>
          <IconDownload size={17} />
          Nouveau téléchargement
        </button>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="table-empty">
        <h3>Aucun résultat</h3>
        <p>Cette vue ne contient aucun téléchargement. Modifiez le filtre ou la recherche.</p>
      </div>
    )
  }

  return (
    <div className="task-table">
      <div className="table-head" role="row">
        {header('Fichier', 'name', 'table-head__file')}
        {header('État', 'status')}
        {header('Taille', 'size')}
        <span className="table-head__cell">Progression</span>
        {header('Vitesse', 'speed')}
        <span className="table-head__cell">Restant</span>
        <span className="table-head__cell table-head__actions">Actions</span>
      </div>

      <div className="table-body" ref={parentRef}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const task = tasks[virtualRow.index]
            if (!task) return null
            const percent = progressPercent(task.receivedBytes, task.totalBytes)
            const active = task.status === 'downloading' || task.status === 'probing' || task.status === 'queued'
            return (
              <div
                key={task.id}
                className={`task-row${selectedId === task.id ? ' task-row--selected' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`
                }}
                onClick={() => onSelect(task)}
                onDoubleClick={() => (task.status === 'completed' ? onOpenFile(task) : onSelect(task))}
                tabIndex={0}
                role="row"
                aria-selected={selectedId === task.id}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSelect(task)
                  if (event.key === ' ') {
                    event.preventDefault()
                    onSelect(task)
                  }
                }}
              >
                <div className="task-cell task-cell--file">
                  <span className={`file-glyph file-glyph--${task.status}`} aria-hidden="true">
                    <IconDownload size={16} />
                  </span>
                  <div className="file-meta">
                    <span className="file-name" title={task.fileName}>
                      {task.fileName}
                    </span>
                    <span className="file-host" title={task.url}>
                      {hostOf(task.url)}
                      {task.categoryName ? ` · ${task.categoryName}` : ''}
                    </span>
                  </div>
                </div>

                <div className="task-cell">
                  <StatusBadge task={task} />
                  {task.errorMessage ? (
                    <span className="task-error" title={task.errorMessage}>
                      {task.errorMessage}
                    </span>
                  ) : null}
                </div>

                <div className="task-cell task-cell--size">
                  <span>{formatBytes(task.totalBytes ?? (task.receivedBytes || null))}</span>
                  <span className="muted small">
                    {task.totalBytes !== null ? `${formatBytes(task.receivedBytes)} reçus` : 'taille inconnue'}
                  </span>
                </div>

                <div className="task-cell task-cell--progress">
                  <div className="progress" aria-label={`Progression ${percent === null ? 'inconnue' : `${Math.round(percent)} %`}`}>
                    <div
                      className={`progress__bar${percent === null && active ? ' progress__bar--indeterminate' : ''}`}
                      style={percent === null ? undefined : { width: `${percent}%` }}
                    />
                  </div>
                  <span className="progress__label">
                    {percent === null ? (task.status === 'completed' ? '100 %' : '—') : `${percent.toFixed(percent < 10 ? 1 : 0)} %`}
                  </span>
                </div>

                <div className="task-cell task-cell--speed">
                  {task.status === 'downloading' ? formatSpeed(task.speed) : '—'}
                </div>

                <div className="task-cell task-cell--eta">{task.status === 'downloading' ? formatEta(task.etaSeconds) : '—'}</div>

                <div className="task-cell task-cell--actions" onClick={(event) => event.stopPropagation()}>
                  {active ? (
                    <button
                      type="button"
                      className="icon-button icon-button--small"
                      onClick={() => onPause(task)}
                      title="Suspendre"
                      aria-label={`Suspendre ${task.fileName}`}
                    >
                      <IconPause size={15} />
                    </button>
                  ) : task.status === 'paused' || task.status === 'failed' || task.status === 'needs_attention' ? (
                    <button
                      type="button"
                      className="icon-button icon-button--small"
                      onClick={() => onResume(task)}
                      title="Reprendre"
                      aria-label={`Reprendre ${task.fileName}`}
                    >
                      <IconPlay size={15} />
                    </button>
                  ) : null}

                  {task.status !== 'completed' && task.status !== 'cancelled' && task.status !== 'failed' ? (
                    <button
                      type="button"
                      className="icon-button icon-button--small"
                      onClick={() => onCancel(task)}
                      title="Annuler"
                      aria-label={`Annuler ${task.fileName}`}
                    >
                      <IconX size={15} />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="icon-button icon-button--small"
                    onClick={() => onShowFolder(task)}
                    title="Afficher dans le dossier"
                    aria-label={`Afficher ${task.fileName} dans le dossier`}
                  >
                    <IconFolder size={15} />
                  </button>

                  <button
                    type="button"
                    className="icon-button icon-button--small icon-button--danger"
                    onClick={() => onRemove(task)}
                    title="Retirer de la liste"
                    aria-label={`Retirer ${task.fileName}`}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
