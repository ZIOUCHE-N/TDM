import { settingsSchema, type Settings } from '../shared/settings'
import type { Database } from './db'
import { Logger } from './logger'

export class SettingsService {
  private current: Settings

  constructor(
    private readonly db: Database,
    defaults: Settings,
    private readonly logger: Logger
  ) {
    const stored = this.db.getSetting<Partial<Settings>>('settings')
    const merged = { ...defaults, ...(stored ?? {}) }
    const parsed = settingsSchema.safeParse(merged)
    if (parsed.success) {
      this.current = parsed.data
    } else {
      this.logger.warn('settings.invalid', parsed.error.flatten())
      this.current = defaults
    }
    this.logger.setLevel(this.current.logLevel)
  }

  get(): Settings {
    return { ...this.current }
  }

  update(patch: Partial<Settings>): Settings {
    const next = settingsSchema.parse({ ...this.current, ...patch })
    this.current = next
    this.db.setSetting('settings', next)
    this.logger.setLevel(next.logLevel)
    return this.get()
  }
}
