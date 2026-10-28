import type { BridgeInfo, EngineInfo, EngineStats } from '../../../shared/protocol'
import type { ConnectionState } from '../hooks/useEngine'
import { formatSpeed } from '../lib/format'
import { IconWifi } from './Icons'

interface StatusBarProps {
  connection: ConnectionState
  info: EngineInfo | null
  stats: EngineStats
  bridge: BridgeInfo | null
  onOpenLogs: () => void
}

export function StatusBar({ connection, info, stats, bridge, onOpenLogs }: StatusBarProps): React.JSX.Element {
  return (
    <footer className="statusbar">
      <div className="statusbar__group">
        <span className={`statusbar__dot statusbar__dot--${connection}`} aria-hidden="true" />
        <span>
          {connection === 'ready'
            ? `Moteur prêt${info ? ` · SQLite ${info.sqliteVersion}` : ''}`
            : connection === 'starting'
              ? 'Connexion au moteur…'
              : 'Moteur indisponible'}
        </span>
      </div>
      <div className="statusbar__group statusbar__group--center">
        <span>{stats.downloading} en cours</span>
        <span>{stats.queued} en attente</span>
        <span>{stats.paused} suspendu(s)</span>
        <span>{formatSpeed(stats.totalSpeed)}</span>
      </div>
      <div className="statusbar__group">
        <span className={`signal signal--compact${bridge?.running ? ' signal--ok' : ' signal--off'}`}>
          <IconWifi size={13} /> {bridge?.running ? `Pont ${bridge.port}` : 'Pont arrêté'}
        </span>
        <button type="button" className="link-button" onClick={onOpenLogs}>
          Journaux
        </button>
        <span className="statusbar__version">TDM {info?.version ?? ''}</span>
      </div>
    </footer>
  )
}
