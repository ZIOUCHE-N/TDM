import { useState } from 'react'
import type { QueueView, ScheduleView } from '../../../shared/protocol'
import { Modal } from './Modal'
import { IconCheck, IconClock, IconTrash } from './Icons'
import { daysSummary, formatShortDate } from '../lib/format'

export interface ScheduleInput {
  id?: string
  queueId: string
  mode: 'once' | 'daily' | 'interval'
  startAt: string | null
  stopAt: string | null
  daysMask: number | null
  intervalMinutes: number | null
  retries: number
  enabled: boolean
  action: 'start_queue' | 'stop_queue' | 'start_all' | 'stop_all'
}

interface SchedulesDialogProps {
  schedules: ScheduleView[]
  queues: QueueView[]
  onClose: () => void
  onSave: (input: ScheduleInput) => Promise<void>
  onDelete: (schedule: ScheduleView) => Promise<void>
  onToast: (title: string, body?: string, kind?: 'success' | 'error' | 'info') => void
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : toLocalInput(date)
}

function defaultOnceValue(): string {
  return toLocalInput(new Date(Date.now() + 60 * 60 * 1000))
}

function modeLabel(mode: ScheduleView['mode']): string {
  return mode === 'daily' ? 'Quotidien' : mode === 'interval' ? 'Intervalle' : 'Une fois'
}

function actionLabel(action: ScheduleView['action']): string {
  switch (action) {
    case 'start_queue':
      return 'Démarrer la file'
    case 'stop_queue':
      return 'Arrêter la file'
    case 'start_all':
      return 'Tout démarrer'
    default:
      return 'Tout suspendre'
  }
}

export function SchedulesDialog({
  schedules,
  queues,
  onClose,
  onSave,
  onDelete,
  onToast
}: SchedulesDialogProps): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const [queueId, setQueueId] = useState(queues[0]?.id ?? '')
  const [mode, setMode] = useState<ScheduleView['mode']>('daily')
  const [startAt, setStartAt] = useState('09:00')
  const [stopAt, setStopAt] = useState('18:00')
  const [daysMask, setDaysMask] = useState(127)
  const [intervalMinutes, setIntervalMinutes] = useState(60)
  const [action, setAction] = useState<ScheduleView['action']>('start_queue')
  const [enabled, setEnabled] = useState(true)

  const reset = (): void => {
    setEditing(null)
    setQueueId(queues[0]?.id ?? '')
    setMode('daily')
    setStartAt('09:00')
    setStopAt('18:00')
    setDaysMask(127)
    setIntervalMinutes(60)
    setAction('start_queue')
    setEnabled(true)
  }

  const edit = (schedule: ScheduleView): void => {
    setEditing(schedule.id)
    setQueueId(schedule.queueId)
    setMode(schedule.mode)
    setStartAt(schedule.mode === 'once' ? isoToLocalInput(schedule.startAt) : schedule.startAt ?? '09:00')
    setStopAt(schedule.stopAt ?? '')
    setDaysMask(schedule.daysMask ?? 127)
    setIntervalMinutes(schedule.intervalMinutes ?? 60)
    setAction(schedule.action)
    setEnabled(schedule.enabled)
  }

  const submit = async (): Promise<void> => {
    if (!queueId) {
      onToast('File requise', 'Créez d’abord une file d’attente.', 'error')
      return
    }
    let normalizedStart: string | null = null
    if (mode === 'daily') {
      if (!/^\d{2}:\d{2}$/.test(startAt)) {
        onToast('Heure invalide', 'Format attendu : HH:MM.', 'error')
        return
      }
      normalizedStart = startAt
    } else if (mode === 'once') {
      const date = new Date(startAt)
      if (Number.isNaN(date.getTime())) {
        onToast('Date invalide', 'Choisissez une date et une heure.', 'error')
        return
      }
      normalizedStart = date.toISOString()
    }

    try {
      await onSave({
        id: editing ?? undefined,
        queueId,
        mode,
        startAt: normalizedStart,
        stopAt: mode === 'daily' && stopAt ? stopAt : null,
        daysMask: mode === 'daily' ? daysMask : null,
        intervalMinutes: mode === 'interval' ? intervalMinutes : null,
        retries: 3,
        enabled,
        action
      })
      onToast(editing ? 'Planning mis à jour' : 'Planning créé', 'Le planificateur s’exécute tant que TDM est actif.', 'success')
      reset()
    } catch (error) {
      onToast('Enregistrement impossible', error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <Modal
      title="Planificateur"
      subtitle="Démarre ou arrête des files à des moments précis. Le planificateur ne s’exécute que lorsque TDM est actif."
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
          <h3>{editing ? 'Modifier le planning' : 'Nouveau planning'}</h3>
          <div className="form-grid form-grid--two">
            <label className="field">
              <span>File</span>
              <select value={queueId} onChange={(event) => setQueueId(event.target.value)}>
                {queues.map((queue) => (
                  <option key={queue.id} value={queue.id}>
                    {queue.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Action</span>
              <select value={action} onChange={(event) => setAction(event.target.value as ScheduleView['action'])}>
                <option value="start_queue">Démarrer la file</option>
                <option value="stop_queue">Arrêter la file</option>
                <option value="start_all">Tout démarrer</option>
                <option value="stop_all">Tout suspendre</option>
              </select>
            </label>
            <label className="field">
              <span>Récurrence</span>
              <select
                value={mode}
                onChange={(event) => {
                  const next = event.target.value as ScheduleView['mode']
                  setMode(next)
                  if (next === 'once') setStartAt(defaultOnceValue())
                  else if (next === 'daily') setStartAt('09:00')
                }}
              >
                <option value="daily">Quotidien</option>
                <option value="interval">Intervalle</option>
                <option value="once">Une fois</option>
              </select>
            </label>

            {mode === 'daily' ? (
              <>
                <label className="field">
                  <span>Heure de début</span>
                  <input type="time" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
                </label>
                <label className="field">
                  <span>Heure d’arrêt (facultatif)</span>
                  <input type="time" value={stopAt} onChange={(event) => setStopAt(event.target.value)} />
                </label>
              </>
            ) : null}

            {mode === 'once' ? (
              <label className="field">
                <span>Date et heure</span>
                <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
              </label>
            ) : null}

            {mode === 'interval' ? (
              <label className="field">
                <span>Intervalle (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={intervalMinutes}
                  onChange={(event) => setIntervalMinutes(Number(event.target.value))}
                />
              </label>
            ) : null}
          </div>

          {mode === 'daily' ? (
            <div className="field">
              <span>Jours</span>
              <div className="day-picker">
                {DAY_LABELS.map((label, index) => (
                  <label key={label} className={`day-chip${daysMask & (1 << index) ? ' day-chip--on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={(daysMask & (1 << index)) !== 0}
                      onChange={(event) =>
                        setDaysMask((current) =>
                          event.target.checked ? current | (1 << index) : current & ~(1 << index)
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <label className="checkbox">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>Planning actif</span>
          </label>

          <div className="button-row">
            <button type="button" className="button button--primary" onClick={() => void submit()}>
              <IconCheck size={16} /> {editing ? 'Enregistrer' : 'Créer'}
            </button>
            {editing ? (
              <button type="button" className="button button--ghost" onClick={reset}>
                Annuler la modification
              </button>
            ) : null}
          </div>
        </section>

        <section className="dialog-section">
          <h3>Plannings existants</h3>
          {schedules.length === 0 ? (
            <p className="muted">Aucun planning. Créez-en un pour automatiser vos files.</p>
          ) : (
            <div className="data-list">
              {schedules.map((schedule) => (
                <div key={schedule.id} className={`data-row${schedule.enabled ? '' : ' data-row--muted'}`}>
                  <span className="data-row__icon">
                    <IconClock size={16} />
                  </span>
                  <div className="data-row__main">
                    <strong>
                      {actionLabel(schedule.action)} · {schedule.queueName ?? 'File supprimée'}
                    </strong>
                    <small>
                      {modeLabel(schedule.mode)}
                      {schedule.mode === 'daily' ? ` · ${schedule.startAt} → ${schedule.stopAt ?? 'sans arrêt'}` : ''}
                      {schedule.mode === 'interval' ? ` · toutes les ${schedule.intervalMinutes} min` : ''}
                      {schedule.mode === 'daily' ? ` · ${daysSummary(schedule.daysMask)}` : ''}
                    </small>
                    <small>
                      {schedule.enabled ? 'Actif' : 'Désactivé'} · prochain : {formatShortDate(schedule.nextRunAt)}
                    </small>
                  </div>
                  <button type="button" className="button button--ghost" onClick={() => edit(schedule)}>
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--small icon-button--danger"
                    onClick={() => void onDelete(schedule)}
                    aria-label="Supprimer le planning"
                    title="Supprimer"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
