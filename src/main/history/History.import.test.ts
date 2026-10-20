import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appels = vi.hoisted(() => ({ append: 0 }))
vi.mock('node:fs/promises', async (orig) => {
  const reel = await orig<typeof import('node:fs/promises')>()
  return {
    ...reel,
    appendFile: (...a: Parameters<typeof reel.appendFile>) => {
      appels.append++
      return reel.appendFile(...a)
    }
  }
})
import { History } from './History'

let chemin: string
beforeEach(() => {
  chemin = join(mkdtempSync(join(tmpdir(), 'lyra-histo-imp-')), 'historique.jsonl')
  appels.append = 0
})
const lignes = (): Array<{ url: string; date: number; title: string; maj?: boolean }> =>
  readFileSync(chemin, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))

describe('History.importer', () => {
  it('un seul appendFile par lot, dédoublonné sur (url, date), ordre quelconque', async () => {
    const h = new History(chemin)
    const r = h.importer([
      { url: 'https://a.fr/', title: 'A', date: 300 },
      { url: 'https://b.fr/', title: 'B', date: 100 },
      { url: 'https://a.fr/', title: 'A', date: 100 },
      { url: 'https://a.fr/', title: 'A', date: 300 }, // doublon dans le lot
      { url: 'about:blank', title: '', date: 5 } // non retenu
    ])
    await h.attendre()
    expect(r).toEqual({ ajoutees: 3, presentes: 1 })
    expect(appels.append).toBe(1)
    expect(lignes()).toHaveLength(3)
    const r2 = h.importer([{ url: 'https://a.fr/', title: 'A', date: 100 }, { url: 'https://a.fr/', title: 'A', date: 200 }])
    await h.attendre()
    expect(r2).toEqual({ ajoutees: 1, presentes: 1 })
    expect(appels.append).toBe(2)
    expect(h.rechercher('a.fr')[0]).toMatchObject({ visitedAt: 300, visites: 3 })
    expect(new History(chemin).rechercher('a.fr')[0].visites).toBe(3)
  })

  it('lot sans rien de nouveau : aucune écriture', async () => {
    const h = new History(chemin)
    h.importer([{ url: 'https://a.fr/', title: 'A', date: 1 }])
    await h.attendre()
    appels.append = 0
    expect(h.importer([{ url: 'https://a.fr/', title: 'A', date: 1 }])).toEqual({ ajoutees: 0, presentes: 1 })
    await h.attendre()
    expect(appels.append).toBe(0)
  })

  it('titre rempli seulement s\'il est vide, jamais écrasé', async () => {
    const h = new History(chemin)
    h.ajouter({ url: 'https://a.fr/', title: '', date: 10 })
    h.ajouter({ url: 'https://b.fr/', title: 'Titre Lyra', date: 10 })
    h.importer([
      { url: 'https://a.fr/', title: 'Titre importé', date: 10 },
      { url: 'https://b.fr/', title: 'Autre', date: 10 }
    ])
    await h.attendre()
    expect(h.rechercher('importé')).toHaveLength(1)
    expect(h.rechercher('Lyra')).toHaveLength(1)
    expect(h.rechercher('Autre')).toHaveLength(0)
    const relu = new History(chemin)
    expect(relu.rechercher('importé')).toHaveLength(1)
    expect(relu.rechercher('Lyra')).toHaveLength(1)
  })

  it('compacterSiNecessaire : seulement au-delà du seuil, fichier cohérent', async () => {
    const h = new History(chemin, { seuilCompaction: 3 })
    h.importer([
      { url: 'https://a.fr/', title: 'A', date: 1 },
      { url: 'https://b.fr/', title: 'B', date: 2 }
    ])
    expect(h.compacterSiNecessaire()).toBe(false)
    h.importer([{ url: 'https://a.fr/', title: 'A', date: 3 }, { url: 'https://c.fr/', title: 'C', date: 4 }])
    await h.attendre()
    expect(lignes().map((l) => l.date)).toEqual([1, 2, 3, 4]) // ordre d'append
    expect(h.compacterSiNecessaire()).toBe(true)
    await h.attendre()
    expect(lignes().map((l) => l.date)).toEqual([1, 3, 2, 4]) // regroupé par page
    expect(h.compacterSiNecessaire()).toBe(false)
  })
})
