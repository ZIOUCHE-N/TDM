import { useEffect, useState } from 'react'
import type { QueueView, TaskView } from '../../../shared/protocol'
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternal,
  IconFolder,
  IconPause,
  IconPlay,
  IconTrash,
  IconX
} from './Icons'
import {
  copyText,
  formatBytes,
  formatDate,
  formatEta,
  formatSpeed,
  progressPercent,
  statusLabel
} from '../lib/format'

interface PropertiesPanelProps {
  task: TaskView
  queues: QueueView[]
  onClose: () => void
  onPause: (task: TaskView) => void
  onResume: (task: TaskView) => void
  onCancel: (task: TaskView) => void
  onRemove: (task: TaskView, deleteFile: boolean) => void
  onShowFolder: (task: TaskView) => void
  onOpenFile: (task: TaskView) => void
  onUpdate: (task: TaskView, patch: Record<string, unknown>) => Promise<void>
  onToast: (title: string, body?: string, kind?: 'success' | 'error' | 'info') => void
}

export function PropertiesPanel({
  task,
  queues,
  onClose,
  onPause,
  onResume,
  onCancel,
  onRemove,
  onShowFolder,
  onOpenFile,
  onUpdate,
  onToast
}: PropertiesPanelProps): React.JSX.Element {
  const [queueId, setQueueId] = useState(task.queueId ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [connections, setConnections] = useState(task.connections)
  const [speedLimit, setSpeedLimit] = useState(task.speedLimitKib)
  const [description, setDescription] = useState(task.description)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setQueueId(task.queueId ?? '')
    setPriority(task.priority)
    setConnections(task.connections)
    setSpeedLimit(task.speedLimitKib)
    setDescription(task.description)
  }, [task.id, task.speedLimitKib])

  const percent = progressPercent(task.receivedBytes, task.totalBytes)
  const active = ['downloading', 'probing', 'queued', 'cancelling'].includes(task.status)

  const apply = async (): Promise<void> => {
    setBusy(true)
    try {
      await onUpdate(task, {
        queueId: queueId || null,
        priority,
        connections,
        speedLimitKib: speedLimit,
        description
      })
      onToast('Modifications enregistrées', task.fileName, 'success')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="properties" aria-label="Détails du téléchargement">
      <header className="properties__header">
        <div className="properties__heading">
          <span className="properties__file-icon" aria-hidden="true">
            <IconDownload size={20} />
          </span>
          <div>
            <h2 title={task.fileName}>{task.fileName}</h2>
            <span className={`status-badge status-badge--${task.status}`}>{statusLabel(task.status)}</span>
          </div>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer les détails">
          <IconX size={17} />
        </button>
      </header>

      <div className="properties__scroll">
        <section className="properties__section">
          <div className="progress progress--large">
            <div
              className={`progress__bar${percent === null && active ? ' progress__bar--indeterminate' : ''}`}
              style={percent === null ? undefined : { width: `${percent}%` }}
            />
          </div>
          <div className="properties__progress-meta">
            <strong>{percent === null ? '—' : `${percent.toFixed(1)} %`}</strong>
            <span>
              {formatBytes(task.receivedBytes)} / {formatBytes(task.totalBytes)}
            </span>
          </div>
          <div className="properties__metrics">
            <div>
              <span className="muted small">Vitesse</span>
              <strong>{task.status === 'downloading' ? formatSpeed(task.speed) : '—'}</strong>
            </div>
            <div>
              <span className="muted small">Restant</span>
              <strong>{task.status === 'downloading' ? formatEta(task.etaSeconds) : '—'}</strong>
            </div>
            <div>
              <span className="muted small">Connexions</span>
              <strong>{task.connections}</strong>
            </div>
          </div>
        </section>

        {task.errorMessage ? (
          <div className="alert alert--error">
            <IconAlert size={16} />
            <div>
              <strong>{task.errorCode ?? 'Erreur'}</strong>
              <p>{task.errorMessage}</p>
            </div>
          </div>
        ) : null}

        <section className="properties__section">
          <h3>Actions</h3>
          <div className="properties__actions">
            {active ? (
              <button type="button" className="button button--ghost" onClick={() => onPause(task)}>
                <IconPause size={15} /> Suspendre
              </button>
            ) : task.status === 'paused' || task.status === 'failed' || task.status === 'needs_attention' ? (
              <button type="button" className="button button--primary" onClick={() => onResume(task)}>
                <IconPlay size={15} /> Reprendre
              </button>
            ) : null}
            {task.status === 'completed' ? (
              <button type="button" className="button button--primary" onClick={() => onOpenFile(task)}>
                <IconExternal size={15} /> Ouvrir
              </button>
            ) : null}
            <button type="button" className="button button--ghost" onClick={() => onShowFolder(task)}>
              <IconFolder size={15} /> Dossier
            </button>
            {task.status !== 'completed' && task.status !== 'cancelled' ? (
              <button type="button" className="button button--ghost button--danger" onClick={() => onCancel(task)}>
                <IconX size={15} /> Annuler
              </button>
            ) : null}
            <button type="button" className="button button--ghost button--danger" onClick={() => onRemove(task, false)}>
              <IconTrash size={15} /> Retirer
            </button>
            {task.status === 'completed' ? (
              <button type="button" className="button button--danger" onClick={() => onRemove(task, true)}>
                <IconTrash size={15} /> Retirer + fichier
              </button>
            ) : null}
          </div>
        </section>

        <section className="properties__section">
          <h3>Emplacement</h3>
          <dl className="details">
            <div>
              <dt>Dossier</dt>
              <dd className="mono">{task.destDir}</dd>
            </div>
            <div>
              <dt>Fichier final</dt>
              <dd className="mono">{task.filePath}</dd>
            </div>
            <div>
              <dt>Catégorie</dt>
              <dd>{task.categoryName ?? 'Aucune'}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{task.queueName ?? 'Aucune'}</dd>
            </div>
          </dl>
        </section>

        <section className="properties__section">
          <h3>
            Source <span className="badge badge--soft">{task.resumable ? 'Reprise possible' : 'Sans reprise'}</span>
          </h3>
          <div className="source-url">
            <span className="mono" title={task.url}>
              {task.url}
            </span>
            <button
              type="button"
              className="icon-button icon-button--small"
              onClick={async () => {
                const ok = await copyText(task.url)
                onToast(ok ? 'Lien copié' : 'Copie impossible', task.url, ok ? 'success' : 'error')
              }}
              aria-label="Copier le lien"
            >
              <IconCopy size={14} />
            </button>
            <button
              type="button"
              className="icon-button icon-button--small"
              onClick={() => void window.tdm.openExternal(task.url)}
              aria-label="Ouvrir le lien dans le navigateur"
            >
              <IconExternal size={14} />
            </button>
          </div>
          {task.finalUrl && task.finalUrl !== task.url ? (
            <p className="small muted mono">Redirigé vers {task.finalUrl}</p>
          ) : null}
        </section>

        <section className="properties__section">
          <h3>Planification de la tâche</h3>
          <div className="form-grid form-grid--two">
            <label className="field">
              <span>File d’attente</span>
              <select value={queueId} onChange={(event) => setQueueId(event.target.value)}>
                <option value="">Aucune file</option>
                {queues.map((queue) => (
                  <option key={queue.id} value={queue.id}>
                    {queue.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Priorité</span>
              <select value={priority} onChange={(event) => setPriority(Number(event.target.value))}>
                <option value={-5}>Très basse</option>
                <option value={0}>Normale</option>
                <option value={5}>Haute</option>
                <option value={10}>Urgente</option>
              </select>
            </label>
            <label className="field">
              <span>Connexions</span>
              <input
                type="number"
                min={1}
                max={16}
                value={connections}
                disabled={task.status === 'downloading'}
                onChange={(event) => setConnections(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Limite (Kio/s, 0 = globale)</span>
              <input
                type="number"
                min={0}
                max={10_000_000}
                value={speedLimit}
                onChange={(event) => setSpeedLimit(Number(event.target.value))}
              />
            </label>
          </div>
          <label className="field">
            <span>Description</span>
            <textarea
              rows={2}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Note personnelle…"
            />
          </label>
          <button type="button" className="button button--ghost" onClick={() => void apply()} disabled={busy}>
            <IconCheck size={15} /> {busy ? 'Enregistrement…' : 'Appliquer'}
          </button>
        </section>

        <section className="properties__section">
          <h3>Détails</h3>
          <dl className="details">
            <div>
              <dt>Créé</dt>
              <dd>{formatDate(task.createdAt)}</dd>
            </div>
            <div>
              <dt>Démarré</dt>
              <dd>{formatDate(task.startedAt)}</dd>
            </div>
            <div>
              <dt>Terminé</dt>
              <dd>{formatDate(task.completedAt)}</dd>
            </div>
            <div>
              <dt>Type MIME</dt>
              <dd>{task.mimeType ?? '—'}</dd>
            </div>
            <div>
              <dt>Taille totale</dt>
              <dd>{formatBytes(task.totalBytes)}</dd>
            </div>
            <div>
              <dt>SHA-256 attendu</dt>
              <dd className="mono small">{task.checksumExpected ?? '—'}</dd>
            </div>
            <div>
              <dt>SHA-256 calculé</dt>
              <dd className="mono small">{task.checksumActual ?? '—'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </aside>
  )
}
