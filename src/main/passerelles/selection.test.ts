import { describe, it, expect } from 'vitest'
import { meilleures, ecarter } from './selection'
import type { Candidat } from './liste'

const c = (n: number, type: Candidat['type'] = 'socks5'): Candidat => ({ type, hote: `8.8.8.${n}`, port: 1080 })

describe('meilleures', () => {
  it('garde les succès triés par latence, au plus n', () => {
    const r = [
      { candidat: c(1), ok: true, ms: 300 },
      { candidat: c(2), ok: false, ms: 10 },
      { candidat: c(3), ok: true, ms: 100 },
      { candidat: c(4), ok: true, ms: 200 }
    ]
    expect(meilleures(r, 2)).toEqual([c(3), c(4)])
    expect(meilleures(r)).toEqual([c(3), c(4), c(1)])
  })
  it("défaut 5 ; ne modifie pas l'entrée ; vide si aucun succès", () => {
    const r = Array.from({ length: 8 }, (_, i) => ({ candidat: c(i), ok: true, ms: 8 - i }))
    const copie = [...r]
    expect(meilleures(r)).toHaveLength(5)
    expect(r).toEqual(copie)
    expect(meilleures([{ candidat: c(1), ok: false, ms: 1 }])).toEqual([])
  })
})

describe('ecarter', () => {
  it('retire le candidat (type, hôte, port) sans modifier le pool', () => {
    const pool = [c(1), c(2), c(1, 'http')]
    expect(ecarter(pool, c(1))).toEqual([c(2), c(1, 'http')])
    expect(pool).toHaveLength(3)
    expect(ecarter(pool, c(9))).toEqual(pool)
  })
})
