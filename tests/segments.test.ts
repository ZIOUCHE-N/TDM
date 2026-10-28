import { describe, expect, it } from 'vitest'
import { planSegments } from '../src/engine/downloader'

describe('découpage en segments', () => {
  it('reste séquentiel sous le seuil', () => {
    const segments = planSegments('t1', 4 * 1024 * 1024, 4, 8 * 1024 * 1024)
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ startOffset: 0, endOffset: 4 * 1024 * 1024 - 1 })
  })

  it('découpe couvre exactement la taille sans trou ni chevauchement', () => {
    const total = 20 * 1024 * 1024 + 123
    const segments = planSegments('t2', total, 4, 1024 * 1024)
    expect(segments).toHaveLength(4)
    expect(segments[0]!.startOffset).toBe(0)
    expect(segments.at(-1)!.endOffset).toBe(total - 1)
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i]!.startOffset).toBe(segments[i - 1]!.endOffset + 1)
    }
  })

  it('limite le nombre de segments à la taille disponible et à 16', () => {
    expect(planSegments('t3', 2 * 1024 * 1024, 16, 1024 * 1024)).toHaveLength(2)
    expect(planSegments('t4', 100 * 1024 * 1024, 32, 1024 * 1024)).toHaveLength(16)
  })
})
