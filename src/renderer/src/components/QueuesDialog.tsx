import { useState } from 'react'
import type { QueueView } from '../../../shared/protocol'
import { Modal } from './Modal'
import { IconCheck, IconPause, IconPlay, IconPlus, IconTrash } from './Icons'

interface QueuesDialogProps {
  queues: QueueView[]
  onClose: () => void
  onCreate: (name: string, concurrency: number) => Promise<void>
  onUpdate: (id: string, patch: { name?: string; concurrency?: number }) => Promise<void>
  onDelete: (queue: QueueView) => Promise<void>
  onStart: (queue: QueueView) => Promise<void>
  onStop: (queue: QueueView) => Promise<void>
  onToast: (title: string, body?: string, kind?: 'success' | 'error' | 'info') => void
}

export function QueuesDialog({
  queues,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onStart,
  onStop,
  onToast
}: QueuesDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [concurrency, setConcurrency] = useState(1)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editConcurrency, setEditConcurrency] = useState(1)

  const create = async (): Promise<void> => {
    if (!name.trim()) {
      onToast('Nom requis', 'Donnez un nom à la file d’attente.', 'error')
      return
    }
    try {
      await onCreate(name.trim(), concurrency)
      setName('')
      setConcurrency(1)
      onToast('File créée', name.trim(), 'success')
    } catch (error) {
      onToast('Création impossible', error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <Modal
      title="Files d’attente"
      subtitle="Une file limite le nombre de téléchargements simultanés qui lui sont assignés."
      size="lg"
      onClose={onClose}
      footer={
        <button type="button" className="button button--ghost" onClick={onClose}>
          Fermer
        </button>
      }
    >
      <section className="dialog-section">
        <h3>Créer une file</h3>
        <div className="inline-form">
          <input
            type="text"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nom de la file"
            aria-label="Nom de la nouvelle file"
          />
          <label className="inline-number">
            <span>Simultanés</span>
            <input
              type="number"
              min={1}
              max={16}
              value={concurrency}
              onChange={(event) => setConcurrency(Math.max(1, Math.min(16, Number(event.target.value))))}
            />
          </label>
          <button type="button" className="button button--primary" onClick={() => void create()}>
            <IconPlus size={16} /> Créer
          </button>
        </div>
      </section>

      <section className="dialog-section">
        <h3>Files existantes</h3>
        <div className="data-list">
          {queues.map((queue) => {
            const isEditing = editing === queue.id
            return (
              <div key={queue.id} className="data-row">
                <span className={`queue-dot queue-dot--${queue.status}`} />
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      aria-label="Nom de la file"
                    />
                    <label className="inline-number">
                      <span>Simultanés</span>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={editConcurrency}
                        onChange={(event) =>
                          setEditConcurrency(Math.max(1, Math.min(16, Number(event.target.value))))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={async () => {
                        try {
                          await onUpdate(queue.id, { name: editName, concurrency: editConcurrency })
                          setEditing(null)
                          onToast('File mise à jour', editName, 'success')
                        } catch (error) {
                          onToast('Mise à jour impossible', error instanceof Error ? error.message : String(error), 'error')
                        }
                      }}
                    >
                      <IconCheck size={15} /> Enregistrer
                    </button>
                  </>
                ) : (
                  <>
                    <div className="data-row__main">
                      <strong>{queue.name}</strong>
                      <small>
                        {queue.status === 'running' ? 'En marche' : 'Arrêtée'} · {queue.concurrency} simultané(s) ·{' '}
                        {queue.taskCount} tâche(s) · {queue.activeCount} active(s)
                      </small>
                    </div>
                    <button
                      type="button"
                      className="icon-button icon-button--small"
                      onClick={() => {
                        setEditing(queue.id)
                        setEditName(queue.name)
                        setEditConcurrency(queue.concurrency)
                      }}
                      aria-label={`Modifier ${queue.name}`}
                      title="Modifier"
                    >
                      <IconCheck size={14} />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  className="icon-button icon-button--small"
                  onClick={() => void (queue.status === 'running' ? onStop(queue) : onStart(queue))}
                  aria-label={queue.status === 'running' ? `Arrêter ${queue.name}` : `Démarrer ${queue.name}`}
                  title={queue.status === 'running' ? 'Arrêter' : 'Démarrer'}
                >
                  {queue.status === 'running' ? <IconPause size={14} /> : <IconPlay size={14} />}
                </button>
                <button
                  type="button"
                  className="icon-button icon-button--small icon-button--danger"
                  onClick={() => void onDelete(queue)}
                  aria-label={`Supprimer ${queue.name}`}
                  title="Supprimer la file"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            )
          })}
        </div>
        <p className="hint">
          Arrêter une file suspend ses téléchargements actifs. Les tâches sans file ne sont pas concernées.
        </p>
      </section>
    </Modal>
  )
}
