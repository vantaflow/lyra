import { describe, it, expect } from 'vitest'
import { grouperParJour, libelleJour, lettre } from './jours'

const NOW = new Date(2026, 9, 19, 15, 0).getTime()
const h = (jours: number, heures = 10): number => new Date(2026, 9, 19 - jours, heures).getTime()

describe('jours', () => {
  it('libellés Aujourd’hui / Hier / date', () => {
    expect(libelleJour(h(0, 1), NOW)).toBe("Aujourd'hui")
    expect(libelleJour(h(1, 23), NOW)).toBe('Hier')
    expect(libelleJour(h(3), NOW)).toMatch(/^Vendredi 16 octobre 2026$/)
  })
  it('regroupe en conservant l’ordre', () => {
    const g = grouperParJour(
      [
        { url: 'a', title: 'A', visitedAt: h(0, 12) },
        { url: 'b', title: 'B', visitedAt: h(0, 9) },
        { url: 'c', title: 'C', visitedAt: h(1) }
      ],
      NOW
    )
    expect(g.map((x) => [x.libelle, x.entrees.length])).toEqual([["Aujourd'hui", 2], ['Hier', 1]])
  })
  it('lettre de repli sur l’hôte', () => {
    expect(lettre('', 'https://www.lyre.fr/x')).toBe('L')
    expect(lettre('étoile', 'https://a.fr')).toBe('É')
  })
})
