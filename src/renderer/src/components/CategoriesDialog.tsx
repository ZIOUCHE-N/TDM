import { useState } from 'react'
import type { CategoryView } from '../../../shared/protocol'
import { Modal } from './Modal'
import { IconCheck, IconFolder, IconPlus, IconTag, IconTrash } from './Icons'

export interface CategoryInput {
  id?: string
  name: string
  dir: string
  extensions: string[]
  domains: string[]
}

interface CategoriesDialogProps {
  categories: CategoryView[]
  defaultDir: string
  onClose: () => void
  onSave: (input: CategoryInput) => Promise<void>
  onDelete: (category: CategoryView) => Promise<void>
  onToast: (title: string, body?: string, kind?: 'success' | 'error' | 'info') => void
}

export function CategoriesDialog({
  categories,
  defaultDir,
  onClose,
  onSave,
  onDelete,
  onToast
}: CategoriesDialogProps): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [dir, setDir] = useState(defaultDir)
  const [extensions, setExtensions] = useState('')
  const [domains, setDomains] = useState('')

  const reset = (): void => {
    setEditing(null)
    setName('')
    setDir(defaultDir)
    setExtensions('')
    setDomains('')
  }

  const edit = (category: CategoryView): void => {
    setEditing(category.id)
    setName(category.name)
    setDir(category.dir)
    setExtensions(category.extensions.join(', '))
    setDomains(category.domains.join(', '))
  }

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      onToast('Nom requis', 'Donnez un nom à la catégorie.', 'error')
      return
    }
    try {
      await onSave({
        id: editing ?? undefined,
        name: name.trim(),
        dir,
        extensions: extensions
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        domains: domains
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      })
      onToast(editing ? 'Catégorie mise à jour' : 'Catégorie créée', name.trim(), 'success')
      reset()
    } catch (error) {
      onToast('Enregistrement impossible', error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <Modal
      title="Catégories"
      subtitle="Les catégories choisissent le dossier et l’icône logique selon l’extension ou le domaine."
      size="xl"
      onClose={onClose}
      footer={
        <button type="button" className="button button--ghost" onClick={onClose}>
          Fermer
        </button>
      }
    >
      <div className="schedule-layout">
        <section className="dialog-section">
          <h3>{editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h3>
          <label className="field">
            <span>Nom</span>
            <input type="text" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Livres" />
          </label>
          <label className="field">
            <span>Dossier</span>
            <div className="input-with-action">
              <input type="text" value={dir} onChange={(event) => setDir(event.target.value)} />
              <button
                type="button"
                className="icon-button"
                onClick={async () => {
                  const chosen = await window.tdm.selectDirectory(dir)
                  if (chosen) setDir(chosen)
                }}
                aria-label="Choisir le dossier de la catégorie"
              >
                <IconFolder size={16} />
              </button>
            </div>
          </label>
          <label className="field">
            <span>Extensions (séparées par des virgules)</span>
            <input
              type="text"
              value={extensions}
              onChange={(event) => setExtensions(event.target.value)}
              placeholder="pdf, epub, mobi"
            />
          </label>
          <label className="field">
            <span>Domaines (facultatif, jokers *.exemple.org acceptés)</span>
            <input
              type="text"
              value={domains}
              onChange={(event) => setDomains(event.target.value)}
              placeholder="*.archive.org, exemple.org"
            />
          </label>
          <div className="button-row">
            <button type="button" className="button button--primary" onClick={() => void submit()}>
              {editing ? <IconCheck size={16} /> : <IconPlus size={16} />}
              {editing ? 'Enregistrer' : 'Créer'}
            </button>
            {editing ? (
              <button type="button" className="button button--ghost" onClick={reset}>
                Annuler
              </button>
            ) : null}
          </div>
        </section>

        <section className="dialog-section">
          <h3>Catégories existantes</h3>
          <div className="data-list">
            {categories.map((category) => (
              <div key={category.id} className="data-row">
                <span className="data-row__icon">
                  <IconTag size={16} />
                </span>
                <div className="data-row__main">
                  <strong>
                    {category.name} {category.builtin ? <span className="badge badge--soft">Intégrée</span> : null}
                  </strong>
                  <small className="mono">{category.dir}</small>
                  <small>
                    {category.extensions.length > 0 ? category.extensions.join(', ') : 'aucune extension'} ·{' '}
                    {category.domains.length > 0 ? category.domains.join(', ') : 'aucun domaine'} ·{' '}
                    {category.taskCount} tâche(s)
                  </small>
                </div>
                <button type="button" className="button button--ghost" onClick={() => edit(category)}>
                  Modifier
                </button>
                {!category.builtin ? (
                  <button
                    type="button"
                    className="icon-button icon-button--small icon-button--danger"
                    onClick={() => void onDelete(category)}
                    aria-label={`Supprimer ${category.name}`}
                    title="Supprimer"
                  >
                    <IconTrash size={14} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <p className="hint">
            Les catégories intégrées ne peuvent pas être supprimées mais leur dossier et leurs règles sont modifiables.
            La catégorie « Autres » reçoit les fichiers non reconnus.
          </p>
        </section>
      </div>
    </Modal>
  )
}
