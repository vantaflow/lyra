import { describe, it, expect } from 'vitest'
import { trouverPasserelles } from './testeur'
import type { Candidat } from './liste'

const cands = (n: number): Candidat[] => Array.from({ length: n }, (_, i) => ({ type: 'http' as const, hote: `8.8.8.${i + 1}`, port: 80 }))
const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('trouverPasserelles', () => {
  it('borne le parallélisme', async () => {
    let actifs = 0
    let pic = 0
    const tester = async (): Promise<{ ok: boolean; ms: number }> => {
      actifs++
      pic = Math.max(pic, actifs)
      await attendre(5)
      actifs--
      return { ok: false, ms: 0 }
    }
    await trouverPasserelles(cands(40), { parallele: 4, max: 40, garder: 5, tester })
    expect(pic).toBeLessThanOrEqual(4)
    expect(pic).toBeGreaterThan(1)
  })

  it('s’arrête au max de candidats testés', async () => {
    let n = 0
    const tester = async (): Promise<{ ok: boolean; ms: number }> => (n++, { ok: false, ms: 0 })
    await trouverPasserelles(cands(100), { parallele: 5, max: 12, tester })
    expect(n).toBe(12)
  })

  it('trie par latence et garde les meilleures', async () => {
    const lat: Record<string, number> = { '8.8.8.1': 300, '8.8.8.2': 50, '8.8.8.3': 0, '8.8.8.4': 120, '8.8.8.5': 10 }
    const tester = async (c: Candidat): Promise<{ ok: boolean; ms: number }> => ({ ok: c.hote !== '8.8.8.3', ms: lat[c.hote] })
    const r = await trouverPasserelles(cands(5), { garder: 3, tester })
    expect(r.map((c) => c.hote)).toEqual(['8.8.8.5', '8.8.8.2', '8.8.8.4'])
  })

  it('liste vide ou tout en échec : []', async () => {
    expect(await trouverPasserelles([], { tester: async () => ({ ok: true, ms: 1 }) })).toEqual([])
    expect(await trouverPasserelles(cands(3), { tester: async () => ({ ok: false, ms: 0 }) })).toEqual([])
  })

  it('un testeur qui lève est un échec, sans crash', async () => {
    const tester = async (c: Candidat): Promise<{ ok: boolean; ms: number }> => {
      if (c.hote === '8.8.8.1') throw new Error('boum')
      return { ok: true, ms: 5 }
    }
    const r = await trouverPasserelles(cands(2), { tester })
    expect(r.map((c) => c.hote)).toEqual(['8.8.8.2'])
  })
})
