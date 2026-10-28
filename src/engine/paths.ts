import path from 'node:path'

const WINDOWS_RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9'
])

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g
const ILLEGAL_CHARS = /[<>:"/\\|?*]/g

export function sanitizeFileName(input: string, fallback = 'telechargement'): string {
  let name = input.normalize('NFC').replace(CONTROL_CHARS, '').replace(ILLEGAL_CHARS, '_')
  name = name.replace(/\s+/g, ' ').trim()
  name = name.replace(/[. ]+$/g, '')

  if (!name || name === '.' || name === '..') return fallback

  const extension = path.extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  if (WINDOWS_RESERVED.has(stem.toLowerCase())) {
    name = `${stem}_${extension}`
  }

  if (name.length > 180) {
    const ext = path.extname(name).slice(0, 20)
    name = `${name.slice(0, 180 - ext.length)}${ext}`
  }

  return name || fallback
}

export function fileNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').filter(Boolean).pop()
    if (!last) return null
    return sanitizeFileName(decodeURIComponent(last))
  } catch {
    return null
  }
}

export function fileNameFromContentDisposition(value: string | null): string | null {
  if (!value) return null

  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(value)
  if (utf8?.[1]) {
    try {
      return sanitizeFileName(decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, '')))
    } catch {
      // ignore malformed encoding
    }
  }

  const plain = /filename\s*=\s*("([^"]+)"|([^;]+))/i.exec(value)
  const raw = plain?.[2] ?? plain?.[3]
  if (!raw) return null
  return sanitizeFileName(raw.trim())
}

export function isPathInside(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function assertPathInside(child: string, parents: string[]): string {
  const resolved = path.resolve(child)
  if (!parents.some((parent) => isPathInside(resolved, parent))) {
    throw new Error('Chemin de destination refusé : hors des dossiers autorisés')
  }
  return resolved
}

export async function uniqueFilePath(dir: string, fileName: string): Promise<string> {
  const { access } = await import('node:fs/promises')
  const parsed = path.parse(fileName)
  let candidate = path.join(dir, fileName)
  let counter = 1
  while (true) {
    try {
      await access(candidate)
      candidate = path.join(dir, `${parsed.name} (${counter})${parsed.ext}`)
      counter += 1
      if (counter > 9999) throw new Error('Impossible de trouver un nom de fichier libre')
    } catch {
      return candidate
    }
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '—'
  const units = ['o', 'Kio', 'Mio', 'Gio', 'Tio']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[unit]}`
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${Math.ceil(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ${Math.ceil(seconds % 60)} s`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}
