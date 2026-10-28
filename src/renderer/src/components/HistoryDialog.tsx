import { useMemo, useState } from 'react'
import type { HistoryView } from '../../../shared/protocol'
import { Modal } from './Modal'
import { formatDate } from '../lib/format'

interface HistoryDialogProps {
  history: HistoryView[]
  onClose: () => void
  onReload: () => Promise<void>
}

const LABELS: Record<string, string> = {
  'task.added': 'Ajout',
  'task.probing': 'Analyse',
  'task.downloading': 'Démarrage',
  'task.paused': 'Suspension',
  'task.resumed': 'Reprise',
  'task.cancelled': 'Annulation',
  'task.completed': 'Terminé',
  'task.failed': 'Échec',
  'task.needs_attention': 'À vérifier',
  'task.removed': 'Suppression',
  'queue.started': 'File démarrée',
  'queue.stopped': 'File arrêtée'
}

export function HistoryDialog({ history, onClose, onReload }: HistoryDialogProps): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'all' | 'tasks' | 'queues'>('all')

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return history.filter((entry) => {
      if (kind === 'tasks' && !entry.event.startsWith('task.')) return false
      if (kind === 'queues' && !entry.event.startsWith('queue.')) return false
      if (!needle) return true
      return (
        entry.event.toLowerCase().includes(needle) ||
        (LABELS[entry.event] ?? '').toLowerCase().includes(needle) ||
        JSON.stringify(entry.detail ?? '').toLowerCase().includes(needle)
      )
    })
  }, [history, kind, search])

  return (
    <Modal
      title="Historique"
      subtitle="Journal local des événements du moteur. Les entrées anciennes sont purgées selon le réglage de conservation."
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={() => void onReload()}>
            Rafraîchir
          </button>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Fermer
          </button>
        </>
      }
    >
      <div className="history-toolbar">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filtrer l’historique…"
          aria-label="Filtrer l’historique"
        />
        <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} aria-label="Type d’événement">
          <option value="all">Tout</option>
          <option value="tasks">Téléchargements</option>
          <option value="queues">Files</option>
        </select>
        <span className="muted small">{filtered.length} entrée(s)</span>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">Aucun événement ne correspond au filtre.</p>
      ) : (
        <div className="history-list">
          {filtered.map((entry) => (
            <div key={entry.id} className={`history-row history-row--${entry.event.split('.').pop() ?? ''}`}>
              <span className="history-row__date">{formatDate(entry.at)}</span>
              <span className="history-row__event">{LABELS[entry.event] ?? entry.event}</span>
              <span className="history-row__detail mono small">
                {entry.detail ? JSON.stringify(entry.detail).slice(0, 180) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
