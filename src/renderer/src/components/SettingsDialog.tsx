import { useState } from 'react'
import type { BridgeInfo, EngineInfo } from '../../../shared/protocol'
import type { Settings } from '../../../shared/settings'
import type { AppInfo } from '../env'
import { Modal } from './Modal'
import { IconCheck, IconCopy, IconFolder, IconShield } from './Icons'
import { copyText } from '../lib/format'

type Tab = 'general' | 'downloads' | 'network' | 'browser' | 'data'

interface SettingsDialogProps {
  settings: Settings
  appInfo: AppInfo | null
  engineInfo: EngineInfo | null
  bridge: BridgeInfo | null
  onClose: () => void
  onSave: (settings: Settings) => Promise<void>
  onOpenDiagnostics: () => void
  onToast: (title: string, body?: string, kind?: 'success' | 'error' | 'info') => void
}

export function SettingsDialog({
  settings,
  appInfo,
  engineInfo,
  bridge,
  onClose,
  onSave,
  onOpenDiagnostics,
  onToast
}: SettingsDialogProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('general')
  const [draft, setDraft] = useState<Settings>({ ...settings })
  const [saving, setSaving] = useState(false)
  const [bridgeTest, setBridgeTest] = useState<string | null>(null)

  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(draft)
      onToast('Paramètres enregistrés', 'Les changements sont appliqués immédiatement.', 'success')
      onClose()
    } catch (error) {
      onToast('Enregistrement impossible', error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const tabButton = (id: Tab, label: string): React.JSX.Element => (
    <button
      type="button"
      className={`tab${tab === id ? ' tab--active' : ''}`}
      onClick={() => setTab(id)}
      role="tab"
      aria-selected={tab === id}
    >
      {label}
    </button>
  )

  return (
    <Modal
      title="Paramètres"
      subtitle="Réglages du moteur, du réseau et du pont navigateur."
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="button button--primary" onClick={() => void save()} disabled={saving}>
            <IconCheck size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="tabs" role="tablist">
        {tabButton('general', 'Général')}
        {tabButton('downloads', 'Téléchargements')}
        {tabButton('network', 'Réseau')}
        {tabButton('browser', 'Navigateur')}
        {tabButton('data', 'Données & sécurité')}
      </div>

      {tab === 'general' ? (
        <div className="settings-pane">
          <div className="form-grid form-grid--two">
            <label className="field">
              <span>Thème</span>
              <select value={draft.theme} onChange={(event) => set('theme', event.target.value as Settings['theme'])}>
                <option value="system">Suivre le système</option>
                <option value="light">Clair</option>
                <option value="dark">Sombre</option>
              </select>
            </label>
            <label className="field">
              <span>Niveau de journalisation</span>
              <select value={draft.logLevel} onChange={(event) => set('logLevel', event.target.value as Settings['logLevel'])}>
                <option value="error">Erreurs</option>
                <option value="warn">Avertissements</option>
                <option value="info">Informations</option>
                <option value="debug">Débogage</option>
              </select>
            </label>
            <label className="field">
              <span>Conservation de l’historique (jours, 0 = illimité)</span>
              <input
                type="number"
                min={0}
                max={3650}
                value={draft.historyRetentionDays}
                onChange={(event) => set('historyRetentionDays', Number(event.target.value))}
              />
            </label>
          </div>

          <div className="switch-list">
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.notifications}
                onChange={(event) => set('notifications', event.target.checked)}
              />
              <span>
                <strong>Notifications système</strong>
                <small>Prévenir à la fin ou en cas d’échec d’un téléchargement.</small>
              </span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.clipboardMonitoring}
                onChange={(event) => set('clipboardMonitoring', event.target.checked)}
              />
              <span>
                <strong>Surveiller le presse-papiers</strong>
                <small>Propose les liens de fichiers copiés, sans les ajouter automatiquement.</small>
              </span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.resumeOnStartup}
                onChange={(event) => set('resumeOnStartup', event.target.checked)}
              />
              <span>
                <strong>Reprendre au démarrage</strong>
                <small>Relance les téléchargements qui étaient actifs à la fermeture.</small>
              </span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.minimizeToTray}
                onChange={(event) => set('minimizeToTray', event.target.checked)}
              />
              <span>
                <strong>Réduire dans la zone de notification</strong>
                <small>Le moteur continue tant que TDM est actif.</small>
              </span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={draft.autoStart} onChange={(event) => set('autoStart', event.target.checked)} />
              <span>
                <strong>Lancer TDM à l’ouverture de session</strong>
                <small>Crée une entrée utilisateur (autostart Linux ou ouverture de session Windows/macOS).</small>
              </span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.confirmDelete}
                onChange={(event) => set('confirmDelete', event.target.checked)}
              />
              <span>
                <strong>Confirmer les suppressions</strong>
                <small>Demande une confirmation avant de retirer une tâche ou un fichier.</small>
              </span>
            </label>
          </div>
        </div>
      ) : null}

      {tab === 'downloads' ? (
        <div className="settings-pane">
          <label className="field">
            <span>Dossier de téléchargement par défaut</span>
            <div className="input-with-action">
              <input
                type="text"
                value={draft.defaultDownloadDir}
                onChange={(event) => set('defaultDownloadDir', event.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                onClick={async () => {
                  const chosen = await window.tdm.selectDirectory(draft.defaultDownloadDir)
                  if (chosen) set('defaultDownloadDir', chosen)
                }}
                aria-label="Choisir le dossier par défaut"
              >
                <IconFolder size={16} />
              </button>
            </div>
          </label>

          <div className="form-grid form-grid--two">
            <label className="field">
              <span>Téléchargements simultanés (1–16)</span>
              <input
                type="number"
                min={1}
                max={16}
                value={draft.maxConcurrentDownloads}
                onChange={(event) => set('maxConcurrentDownloads', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Connexions par fichier (1–16)</span>
              <input
                type="number"
                min={1}
                max={16}
                value={draft.maxConnectionsPerTask}
                onChange={(event) => set('maxConnectionsPerTask', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Seuil de segmentation (Mio)</span>
              <input
                type="number"
                min={1}
                max={1024}
                value={draft.segmentThresholdMib}
                onChange={(event) => set('segmentThresholdMib', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Nouvelles tentatives par segment</span>
              <input
                type="number"
                min={0}
                max={20}
                value={draft.retryCount}
                onChange={(event) => set('retryCount', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Limite globale (Kio/s, 0 = illimité)</span>
              <input
                type="number"
                min={0}
                max={10_000_000}
                value={draft.globalSpeedLimitKib}
                onChange={(event) => set('globalSpeedLimitKib', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Limite par tâche (Kio/s, 0 = illimité)</span>
              <input
                type="number"
                min={0}
                max={10_000_000}
                value={draft.perTaskSpeedLimitKib}
                onChange={(event) => set('perTaskSpeedLimitKib', Number(event.target.value))}
              />
            </label>
          </div>
          <p className="hint">
            La segmentation nécessite un serveur qui annonce <code>Accept-Ranges: bytes</code>. Sinon TDM bascule
            automatiquement en flux séquentiel. La reprise conserve les octets déjà écrits dans un fichier temporaire.
          </p>
        </div>
      ) : null}

      {tab === 'network' ? (
        <div className="settings-pane">
          <div className="form-grid form-grid--two">
            <label className="field">
              <span>Mode proxy</span>
              <select
                value={draft.proxyMode}
                onChange={(event) => set('proxyMode', event.target.value as Settings['proxyMode'])}
              >
                <option value="system">Système / variables d’environnement</option>
                <option value="direct">Connexion directe</option>
                <option value="manual">Proxy manuel</option>
              </select>
            </label>
            {draft.proxyMode === 'manual' ? (
              <label className="field">
                <span>Adresse du proxy</span>
                <input
                  type="text"
                  value={draft.proxyUrl}
                  onChange={(event) => set('proxyUrl', event.target.value)}
                  placeholder="http://proxy.exemple:8080"
                />
              </label>
            ) : null}
          </div>
          {draft.proxyMode === 'manual' ? (
            <label className="field">
              <span>Domaines sans proxy (séparés par des virgules)</span>
              <input
                type="text"
                value={draft.proxyBypass}
                onChange={(event) => set('proxyBypass', event.target.value)}
                placeholder="localhost, 127.0.0.1, .entreprise.local"
              />
            </label>
          ) : null}
          <label className="field">
            <span>User-Agent personnalisé (vide = valeur TDM)</span>
            <textarea
              rows={2}
              maxLength={512}
              value={draft.userAgent}
              onChange={(event) => set('userAgent', event.target.value)}
              placeholder="Mozilla/5.0 …"
            />
          </label>
          <p className="hint">
            Les identifiants de proxy ne sont pas stockés dans cette version. Aucun contournement d’authentification
            de site, de DRM ou de protection n’est effectué.
          </p>
        </div>
      ) : null}

      {tab === 'browser' ? (
        <div className="settings-pane">
          <div className="switch-list">
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.bridgeEnabled}
                onChange={(event) => set('bridgeEnabled', event.target.checked)}
              />
              <span>
                <strong>Activer le pont navigateur</strong>
                <small>Serveur HTTP local sur 127.0.0.1 uniquement, protégé par jeton et contrôle d’origine.</small>
              </span>
            </label>
          </div>

          <div className="form-grid form-grid--two">
            <label className="field">
              <span>Port local</span>
              <input
                type="number"
                min={1024}
                max={65535}
                value={draft.bridgePort}
                onChange={(event) => set('bridgePort', Number(event.target.value))}
              />
            </label>
            <div className="field">
              <span>État</span>
              <div className={`inline-status${bridge?.running ? ' inline-status--ok' : ' inline-status--off'}`}>
                {bridge?.running ? `Actif sur 127.0.0.1:${bridge.port}` : bridge?.error ?? 'Arrêté'}
              </div>
            </div>
          </div>

          <label className="field">
            <span>Jeton d’appairage (à coller dans l’extension)</span>
            <div className="input-with-action">
              <input type="text" value={bridge?.token ?? ''} readOnly className="mono" />
              <button
                type="button"
                className="icon-button"
                onClick={async () => {
                  const ok = await copyText(bridge?.token ?? '')
                  onToast(ok ? 'Jeton copié' : 'Copie impossible', undefined, ok ? 'success' : 'error')
                }}
                aria-label="Copier le jeton"
              >
                <IconCopy size={16} />
              </button>
            </div>
          </label>

          <div className="button-row">
            <button
              type="button"
              className="button button--ghost"
              onClick={async () => {
                const result = await window.tdm.bridgeTest()
                setBridgeTest(result.message)
              }}
            >
              Tester le pont
            </button>
            <button type="button" className="button button--ghost" onClick={() => void window.tdm.openExtensionFolder()}>
              <IconFolder size={16} /> Dossier de l’extension
            </button>
          </div>
          {bridgeTest ? <p className="hint">{bridgeTest}</p> : null}

          <div className="callout">
            <IconShield size={18} />
            <div>
              <strong>Extension explicite, sans injection</strong>
              <p>
                Dans Chrome/Edge : <code>chrome://extensions</code> → mode développeur → « Charger l’extension non
                empaquetée » → dossier <code>extension/</code>. Dans Firefox : <code>about:debugging</code> → charger
                le manifeste du dossier <code>extension-firefox/</code>. Collez ensuite le jeton ci-dessus.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'data' ? (
        <div className="settings-pane">
          <dl className="details">
            <div>
              <dt>Version TDM</dt>
              <dd>{appInfo?.version ?? engineInfo?.version ?? '—'}</dd>
            </div>
            <div>
              <dt>Plateforme</dt>
              <dd>
                {appInfo?.platform ?? '—'} / {appInfo?.arch ?? '—'}
              </dd>
            </div>
            <div>
              <dt>SQLite</dt>
              <dd>{engineInfo?.sqliteVersion ?? '—'}</dd>
            </div>
            <div>
              <dt>Données</dt>
              <dd className="mono">{appInfo?.dataDir ?? '—'}</dd>
            </div>
            <div>
              <dt>Dossier par défaut</dt>
              <dd className="mono">{draft.defaultDownloadDir}</dd>
            </div>
          </dl>

          <div className="button-row">
            <button type="button" className="button button--ghost" onClick={() => void window.tdm.openLogs()}>
              Ouvrir les journaux
            </button>
            <button type="button" className="button button--ghost" onClick={onOpenDiagnostics}>
              Diagnostic du moteur
            </button>
          </div>

          <div className="callout">
            <IconShield size={18} />
            <div>
              <strong>Données locales uniquement</strong>
              <p>
                Les tâches, réglages, files et historiques sont stockés dans une base SQLite locale. Aucune donnée
                n’est envoyée à un service tiers. Les URL et métadonnées sont visibles dans cette base ; les
                journaux peuvent contenir des URL et des noms de fichiers, jamais le contenu des fichiers ni le
                jeton du pont.
              </p>
            </div>
          </div>

          <p className="hint">
            Les fichiers téléchargés restent votre propriété. TDM ne supprime jamais un fichier final sans action
            explicite. L’extension navigateur n’a accès qu’aux liens que vous lui transmettez.
          </p>
        </div>
      ) : null}
    </Modal>
  )
}
