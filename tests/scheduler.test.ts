import { describe, expect, it } from 'vitest'
import { nextOccurrence, matchesDay } from '../src/engine/scheduler'

const base = {
  stopAt: null,
  lastRunAt: null,
  enabled: 1,
  intervalMinutes: null,
  daysMask: null
}

describe('planificateur : calcul des occurrences', () => {
  it('once ne se déclenche que dans le futur', () => {
    const now = new Date('2026-10-23T12:00:00')
    expect(
      nextOccurrence({ ...base, mode: 'once', startAt: '2026-10-23T13:00:00' }, now)?.toISOString()
    ).toBe(new Date('2026-10-23T13:00:00').toISOString())
    expect(nextOccurrence({ ...base, mode: 'once', startAt: '2026-10-23T11:00:00' }, now)).toBeNull()
  })

  it('interval repart du dernier lancement', () => {
    const now = new Date('2026-10-23T12:00:00')
    const next = nextOccurrence(
      { ...base, mode: 'interval', startAt: null, intervalMinutes: 30 },
      now
    )
    expect(next?.toISOString()).toBe(new Date('2026-10-23T12:30:00').toISOString())
  })

  it('daily respecte le masque de jours (lundi = bit 0)', () => {
    // 19 octobre 2026 est un lundi.
    const monday = new Date(2026, 9, 19, 10, 0, 0)
    expect(matchesDay(monday, 1)).toBe(true)
    expect(matchesDay(monday, 2)).toBe(false)
    const next = nextOccurrence(
      { ...base, mode: 'daily', startAt: '09:00', daysMask: 1 },
      monday
    )
    expect(next?.getTime()).toBe(new Date(2026, 9, 26, 9, 0, 0).getTime())
  })

  it('daily sans masque passe au lendemain si l’heure est dépassée', () => {
    const now = new Date(2026, 9, 23, 18, 0, 0)
    const next = nextOccurrence({ ...base, mode: 'daily', startAt: '09:00' }, now)
    expect(next?.getTime()).toBe(new Date(2026, 9, 24, 9, 0, 0).getTime())
  })

  it('refuse les heures invalides', () => {
    const now = new Date('2026-10-23T12:00:00')
    expect(nextOccurrence({ ...base, mode: 'daily', startAt: '25:99' }, now)).toBeNull()
    expect(nextOccurrence({ ...base, mode: 'interval', startAt: null, intervalMinutes: 0 }, now)).toBeNull()
  })
})
