import path from 'node:path'
import type { CategoryRow } from './types'
import type { Database } from './db'

export interface Category {
  id: string
  name: string
  dir: string
  extensions: string[]
  domains: string[]
  builtin: boolean
}

const DEFAULTS: Array<{ id: string; name: string; folder: string; extensions: string[] }> = [
  { id: 'cat-compressed', name: 'Compressés', folder: 'Compresses', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'iso'] },
  { id: 'cat-documents', name: 'Documents', folder: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'txt', 'rtf', 'epub', 'csv'] },
  { id: 'cat-music', name: 'Musique', folder: 'Musique', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'wma'] },
  { id: 'cat-programs', name: 'Programmes', folder: 'Programmes', extensions: ['exe', 'msi', 'msix', 'deb', 'rpm', 'appimage', 'dmg', 'pkg', 'apk', 'jar'] },
  { id: 'cat-video', name: 'Vidéos', folder: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts'] },
  { id: 'cat-images', name: 'Images', folder: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'avif'] },
  { id: 'cat-other', name: 'Autres', folder: 'Autres', extensions: [] }
]

function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    dir: row.dir,
    extensions: parseList(row.extensions),
    domains: parseList(row.domains),
    builtin: row.builtin === 1
  }
}

function domainMatches(hostname: string, patterns: string[]): boolean {
  const host = hostname.toLowerCase()
  return patterns.some((pattern) => {
    const normalized = pattern.trim().toLowerCase()
    if (!normalized) return false
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(2)
      return host === suffix || host.endsWith(`.${suffix}`)
    }
    return host === normalized
  })
}

export class CategoryService {
  constructor(
    private readonly db: Database,
    private readonly downloadsRoot: string
  ) {
    if (this.db.listCategories().length === 0) this.seed()
  }

  private seed(): void {
    for (const item of DEFAULTS) {
      this.db.insertCategory({
        id: item.id,
        name: item.name,
        dir: path.join(this.downloadsRoot, item.folder),
        extensions: JSON.stringify(item.extensions),
        domains: '[]',
        builtin: 1
      })
    }
  }

  list(): Category[] {
    return this.db.listCategories().map(toCategory)
  }

  get(id: string): Category | null {
    const row = this.db.listCategories().find((item) => item.id === id)
    return row ? toCategory(row) : null
  }

  match(fileName: string, url: string): Category {
    const categories = this.list()
    let hostname = ''
    try {
      hostname = new URL(url).hostname
    } catch {
      // ignore invalid URL
    }

    if (hostname) {
      const byDomain = categories.find((category) => domainMatches(hostname, category.domains))
      if (byDomain) return byDomain
    }

    const extension = path.extname(fileName).replace(/^\./, '').toLowerCase()
    if (extension) {
      const byExtension = categories.find((category) => category.extensions.includes(extension))
      if (byExtension) return byExtension
    }

    return categories.find((category) => category.id === 'cat-other') ?? categories[categories.length - 1]!
  }

  resolveDirectory(categoryId: string | null, fallback: string): string {
    if (!categoryId) return fallback
    const category = this.get(categoryId)
    return category?.dir || fallback
  }
}
