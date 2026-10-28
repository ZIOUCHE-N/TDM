import type { BridgeInfo, EngineStats } from '../../../shared/protocol'
import {
  IconLayers,
  IconPause,
  IconPlay,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTrash,
  IconWifi
} from './Icons'
import { formatSpeed } from '../lib/format'

interface ToolbarProps {
  title: string
  subtitle: string
  search: string
  onSearch: (value: string) => void
  stats: EngineStats
  bridge: BridgeInfo | null
  onNew: () => void
  onPauseAll: () => void
  onResumeAll: () => void
  onClearFinished: () => void
  onSettings: () => void
  onRefresh: () => void
}

export function Toolbar({
  title,
  subtitle,
  search,
  onSearch,
  stats,
  bridge,
  onNew,
  onPauseAll,
  onResumeAll,
  onClearFinished,
  onSettings,
  onRefresh
}: ToolbarProps): React.JSX.Element {
  const active = stats.downloading > 0 || stats.queued > 0
  return (
    <header className="toolbar">
      <div className="toolbar__title">
        <h1>{title}</h1>
        <p>
          {subtitle}
          {stats.downloading > 0 ? ` · ${formatSpeed(stats.totalSpeed)}` : ''}
        </p>
      </div>

      <label className="search">
        <IconSearch size={16} />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Rechercher un fichier, un domaine…"
          aria-label="Rechercher des téléchargements"
        />
      </label>

      <div className="toolbar__actions">
        <button type="button" className="button button--primary" onClick={onNew}>
          <IconPlus size={17} />
          <span className="button__label">Nouveau</span>
        </button>
        {active ? (
          <button type="button" className="button button--ghost" onClick={onPauseAll} title="Suspendre tous les téléchargements">
            <IconPause size={16} />
            <span className="button__label">Tout suspendre</span>
          </button>
        ) : (
          <button type="button" className="button button--ghost" onClick={onResumeAll} title="Démarrer tous les téléchargements">
            <IconPlay size={16} />
            <span className="button__label">Tout démarrer</span>
          </button>
        )}
        <button type="button" className="icon-button" onClick={onClearFinished} title="Vider les téléchargements terminés" aria-label="Vider les téléchargements terminés">
          <IconTrash size={17} />
        </button>
        <button type="button" className="icon-button" onClick={onRefresh} title="Rafraîchir" aria-label="Rafraîchir">
          <IconRefresh size={17} />
        </button>
        <button type="button" className="icon-button" onClick={onSettings} title="Paramètres" aria-label="Paramètres">
          <IconSettings size={17} />
        </button>
      </div>

      <div className="toolbar__signals" aria-label="État des services">
        <span className={`signal${bridge?.running ? ' signal--ok' : ' signal--off'}`} title={bridge?.running ? `Pont navigateur actif sur le port ${bridge.port}` : 'Pont navigateur arrêté'}>
          <IconWifi size={14} /> Pont
        </span>
        <span className={`signal${stats.downloading > 0 ? ' signal--busy' : ''}`}>
          <IconLayers size={14} /> {stats.downloading} actif{stats.downloading > 1 ? 's' : ''}
        </span>
      </div>
    </header>
  )
}
