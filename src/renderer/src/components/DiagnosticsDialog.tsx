import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { copyText, formatBytes } from '../lib/format'
import { IconCopy } from './Icons'

interface DiagnosticsDialogProps {
  onClose: () => void
  onToast: (title: string, body?: string, kind?: 'success' | 'error' | 'info') => void
}

interface Diagnostics {
  status: string
  version: string
  sqliteVersion: string
  protocolVersion: number
  startedAt: string
  platform: string
  dataDir: string
  databasePath: string
  downloadsRoot: string
  uptimeSeconds: number
  stats: {
    downloading: number
    queued: number
    paused: number
    completed: number
    failed: number
    totalSpeed: number
    totalReceived: number
  }
}

export function DiagnosticsDialog({ onClose, onToast }: DiagnosticsDialogProps): React.JSX.Element {
  const [data, setData] = useState<Diagnostics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.tdm
      .request('engine.diagnostics')
      .then((result) => setData(result as Diagnostics))
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [])

  return (
    <Modal
      title="Diagnostic du moteur"
      subtitle="Informations réelles collectées auprès du processus moteur."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="button button--ghost"
            onClick={async () => {
              const ok = await copyText(JSON.stringify(data ?? { error }, null, 2))
              onToast(ok ? 'Diagnostic copié' : 'Copie impossible', undefined, ok ? 'success' : 'error')
            }}
          >
            <IconCopy size={15} /> Copier
          </button>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Fermer
          </button>
        </>
      }
    >
      {error ? <div className="alert alert--error">{error}</div> : null}
      {data ? (
        <dl className="details">
          <div>
            <dt>État</dt>
            <dd>{data.status}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{data.version}</dd>
          </div>
          <div>
            <dt>SQLite</dt>
            <dd>{data.sqliteVersion}</dd>
          </div>
          <div>
            <dt>Protocole</dt>
            <dd>v{data.protocolVersion}</dd>
          </div>
          <div>
            <dt>Démarré</dt>
            <dd>{new Date(data.startedAt).toLocaleString('fr-FR')}</dd>
          </div>
          <div>
            <dt>Durée de service</dt>
            <dd>{Math.floor(data.uptimeSeconds / 60)} min</dd>
          </div>
          <div>
            <dt>Plateforme</dt>
            <dd>{data.platform}</dd>
          </div>
          <div>
            <dt>Base de données</dt>
            <dd className="mono">{data.databasePath}</dd>
          </div>
          <div>
            <dt>Dossier des téléchargements</dt>
            <dd className="mono">{data.downloadsRoot}</dd>
          </div>
          <div>
            <dt>Tâches</dt>
            <dd>
              {data.stats.downloading} actives · {data.stats.queued} en attente · {data.stats.paused} suspendues ·{' '}
              {data.stats.completed} terminées · {data.stats.failed} en échec
            </dd>
          </div>
          <div>
            <dt>Débit agrégé</dt>
            <dd>{formatBytes(data.stats.totalSpeed)}/s</dd>
          </div>
          <div>
            <dt>Octets reçus</dt>
            <dd>{formatBytes(data.stats.totalReceived)}</dd>
          </div>
        </dl>
      ) : !error ? (
        <p className="muted">Collecte des informations…</p>
      ) : null}
    </Modal>
  )
}
