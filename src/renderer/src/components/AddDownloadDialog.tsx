import { useEffect, useState } from 'react'
import type { CategoryView, ProbeView, QueueView, TaskView } from '../../../shared/protocol'
import type { Settings } from '../../../shared/settings'
import { Modal } from './Modal'
import { IconAlert, IconDownload, IconFolder, IconLink, IconRefresh } from './Icons'
import { formatBytes } from '../lib/format'

interface AddDownloadDialogProps {
  settings: Settings
  categories: CategoryView[]
  queues: QueueView[]
  initialUrl?: string
  onClose: () => void
  onAdded: (task: TaskView) => void
  onToast: (title: string, body?: string, kind?: 'success' | 'error' | 'info') => void
}

export function AddDownloadDialog({
  settings,
  categories,
  queues,
  initialUrl,
  onClose,
  onAdded,
  onToast
}: AddDownloadDialogProps): React.JSX.Element {
  const [url, setUrl] = useState(initialUrl ?? '')
  const [probe, setProbe] = useState<ProbeView | null>(null)
  const [probing, setProbing] = useState(false)
  const [fileName, setFileName] = useState('')
  const [destDir, setDestDir] = useState(settings.defaultDownloadDir)
  const [categoryId, setCategoryId] = useState('')
  const [queueId, setQueueId] = useState('')
  const [connections, setConnections] = useState(settings.maxConnectionsPerTask)
  const [description, setDescription] = useState('')
  const [checksum, setChecksum] = useState('')
  const [startNow, setStartNow] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const analyze = async (target = url): Promise<void> => {
    const value = target.trim()
    if (!value) {
      setError('Saisissez une URL HTTP ou HTTPS.')
      return
    }
    setProbing(true)
    setError(null)
    try {
      const result = (await window.tdm.request('tasks.probe', { url: value })) as ProbeView
      setProbe(result)
      setFileName(result.suggestedFileName ?? '')
      if (result.resumable) setError(null)
    } catch (cause) {
      setProbe(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setProbing(false)
    }
  }

  useEffect(() => {
    if (initialUrl) void analyze(initialUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (): Promise<void> => {
    const value = url.trim()
    if (!value) {
      setError('Saisissez une URL HTTP ou HTTPS.')
      return
    }
    if (!/^https?:\/\//i.test(value)) {
      setError('Seules les URL HTTP et HTTPS sont acceptées.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const task = (await window.tdm.request('tasks.add', {
        url: value,
        fileName: fileName.trim() || undefined,
        destDir: destDir.trim() || undefined,
        categoryId: categoryId || undefined,
        queueId: queueId || null,
        connections,
        description: description.trim() || undefined,
        checksumExpected: checksum.trim() || undefined,
        startNow
      })) as TaskView
      onAdded(task)
      onToast('Téléchargement ajouté', task.fileName, 'success')
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Nouveau téléchargement"
      subtitle="Le moteur analyse le lien, puis télécharge réellement le fichier."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="button button--primary" onClick={() => void submit()} disabled={saving}>
            <IconDownload size={16} />
            {saving ? 'Ajout…' : startNow ? 'Télécharger' : 'Ajouter à la liste'}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="field">
          <span>Adresse du fichier</span>
          <div className="input-with-action">
            <IconLink size={16} />
            <input
              type="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value)
                setProbe(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void analyze()
                }
              }}
              placeholder="https://exemple.org/fichier.zip"
              autoFocus
            />
            <button type="button" className="button button--ghost" onClick={() => void analyze()} disabled={probing}>
              <IconRefresh size={15} className={probing ? 'spin' : undefined} />
              {probing ? 'Analyse…' : 'Analyser'}
            </button>
          </div>
        </label>

        {probe ? (
          <div className="probe-card">
            <div className="probe-card__main">
              <strong>{probe.suggestedFileName ?? 'Nom inconnu'}</strong>
              <span className="muted">
                {formatBytes(probe.contentLength)} · {probe.contentType ?? 'type inconnu'}
              </span>
            </div>
            <div className="probe-card__tags">
              <span className={`badge ${probe.resumable ? 'badge--ok' : 'badge--warn'}`}>
                {probe.resumable ? 'Reprise et segments disponibles' : 'Sans reprise'}
              </span>
              {probe.redirects.length > 0 ? <span className="badge badge--soft">{probe.redirects.length} redirection(s)</span> : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="alert alert--error" role="alert">
            <IconAlert size={16} />
            <div>{error}</div>
          </div>
        ) : null}

        <div className="form-grid form-grid--two">
          <label className="field">
            <span>Nom du fichier</span>
            <input
              type="text"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              placeholder="Nom déduit de l’URL"
            />
          </label>
          <label className="field">
            <span>Dossier de destination</span>
            <div className="input-with-action">
              <input type="text" value={destDir} onChange={(event) => setDestDir(event.target.value)} />
              <button
                type="button"
                className="icon-button"
                onClick={async () => {
                  const chosen = await window.tdm.selectDirectory(destDir)
                  if (chosen) setDestDir(chosen)
                }}
                aria-label="Choisir un dossier"
              >
                <IconFolder size={16} />
              </button>
            </div>
          </label>
          <label className="field">
            <span>Catégorie</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Automatique (selon l’extension)</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>File d’attente</span>
            <select value={queueId} onChange={(event) => setQueueId(event.target.value)}>
              <option value="">Aucune file</option>
              {queues.map((queue) => (
                <option key={queue.id} value={queue.id}>
                  {queue.name} ({queue.status === 'running' ? 'en marche' : 'arrêtée'})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Connexions simultanées</span>
            <input
              type="number"
              min={1}
              max={16}
              value={connections}
              onChange={(event) => setConnections(Math.max(1, Math.min(16, Number(event.target.value))))}
            />
          </label>
          <label className="field">
            <span>SHA-256 attendu (facultatif)</span>
            <input
              type="text"
              value={checksum}
              onChange={(event) => setChecksum(event.target.value)}
              placeholder="64 caractères hexadécimaux"
              spellCheck={false}
            />
          </label>
        </div>

        <label className="field">
          <span>Description (facultatif)</span>
          <input
            type="text"
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Par exemple : image ISO de sauvegarde"
          />
        </label>

        <label className="checkbox">
          <input type="checkbox" checked={startNow} onChange={(event) => setStartNow(event.target.checked)} />
          <span>Démarrer immédiatement après l’ajout</span>
        </label>
      </form>
    </Modal>
  )
}
