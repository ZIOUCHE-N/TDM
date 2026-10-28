import type { TaskStatus } from '../../../shared/protocol'

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  if (bytes < 0) return '—'
  const units = ['o', 'Kio', 'Mio', 'Gio', 'Tio']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[unit]}`
}

export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '—'
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${Math.ceil(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ${Math.ceil(seconds % 60)} s`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(date)
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  queued: 'En attente',
  probing: 'Analyse',
  downloading: 'Téléchargement',
  paused: 'Suspendu',
  cancelling: 'Annulation',
  cancelled: 'Annulé',
  completed: 'Terminé',
  failed: 'Échec',
  needs_attention: 'À vérifier'
}

export function statusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status] ?? status
}

export function progressPercent(received: number, total: number | null): number | null {
  if (total === null || total <= 0) return null
  return Math.min(100, Math.max(0, (received / total) * 100))
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

export function daysSummary(mask: number | null): string {
  if (!mask) return 'Tous les jours'
  const labels = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  return labels.filter((_, index) => mask & (1 << index)).join(' ')
}
