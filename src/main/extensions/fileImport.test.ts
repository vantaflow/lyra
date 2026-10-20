import { describe, expect, it, vi } from 'vitest'
import { consommerFile } from './fileImport'
import type { EntreeImport, ProgressionFile } from '../../shared/types'
import type { ResultatInstallation } from '../../shared/types'

const id = (c: string): string => c.repeat(32)
const ok = (c: string): ResultatInstallation => ({ etat: 'installee', id: id(c), nom: c, version: '1.0' })

const cinq = (): EntreeImport[] => [
  { id: id('a'), nom: 'A', magasin: 'chrome' },
  { id: id('b'), nom: 'B (erreur)', magasin: 'chrome' },
  { id: 'dark-reader', nom: 'Dark Reader', magasin: 'firefox', actif: false },
  { id: id('d'), nom: 'D imposée', magasin: 'chrome', imposee: true },
  { id: 'edge-ext', nom: 'E', magasin: 'edge' }
]

describe('consommerFile', () => {
  it("5 entrées : erreur, imposée et edge ne bloquent pas ; la file restante = erreur + à confirmer", async () => {
    const chrome = vi.fn(async (i: string) => (i === id('b') ? ({ etat: 'erreur', raison: 'hors ligne' } as const) : ok(i[0])))
    const firefox = vi.fn(async () => ok('f'))
    const desactiver = vi.fn(async () => true)
    const progression: Array<{ index: number; total: number; fin: boolean }> = []
    const r = await consommerFile(cinq(), {
      installateurs: { chrome, firefox },
      desactiver,
      journal: () => {},
      surProgression: (p) => progression.push({ index: p.index, total: p.total, fin: p.resultat !== undefined })
    })
    expect(r.resultats.map((x) => x.etat)).toEqual(['installee', 'erreur', 'installee', 'a-confirmer', 'manuel'])
    expect(r.resultats[1].raison).toBe('hors ligne')
    expect(r.resultats[4].raison).toMatch(/Edge/)
    expect(r.restantes.map((e) => e.nom)).toEqual(['B (erreur)', 'D imposée'])
    // L'imposée n'est jamais passée à un installateur ; edge non plus.
    expect(chrome.mock.calls.map((c) => c[0])).toEqual([id('a'), id('b')])
    expect(firefox).toHaveBeenCalledWith('dark-reader')
    // Entrée marquée inactive : désactivée après installation.
    expect(desactiver).toHaveBeenCalledWith(id('f'))
    expect(progression.filter((p) => !p.fin)).toHaveLength(4)
    expect(progression.every((p) => p.total === 4)).toBe(true)
  })

  it('une entrée imposée confirmée explicitement est installée', async () => {
    const chrome = vi.fn(async (i: string) => ok(i[0]))
    const r = await consommerFile([{ id: id('d'), nom: 'D', magasin: 'chrome', imposee: true }], {
      installateurs: { chrome },
      confirmees: new Set([id('d')]),
      journal: () => {}
    })
    expect(r.resultats[0].etat).toBe('installee')
    expect(r.restantes).toEqual([])
  })

  it("Firefox sans installateur AMO : « à installer à la main » ; une exception d'installateur devient une erreur", async () => {
    const chrome = vi.fn(async () => {
      throw new Error('boum')
    })
    const r = await consommerFile(
      [
        { id: 'x', nom: 'X', magasin: 'firefox' },
        { id: id('a'), nom: 'A', magasin: 'chrome' }
      ],
      { installateurs: { chrome }, journal: () => {} }
    )
    expect(r.resultats.map((x) => x.etat)).toEqual(['manuel', 'erreur'])
    expect(r.resultats[1].raison).toBe('boum')
  })

  it('file vide', async () => {
    expect(await consommerFile([], { installateurs: { chrome: vi.fn() } })).toEqual({ resultats: [], restantes: [] })
  })

  it('progression typée pour le renderer', () => {
    const p: ProgressionFile = { index: 0, total: 1, nom: 'A' }
    expect(p.nom).toBe('A')
  })
})
