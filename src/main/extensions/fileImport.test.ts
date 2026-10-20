import { describe, expect, it, vi } from 'vitest'
import { cleEntree, consommerFile, traiterFile, type DepsTraiterFile } from './fileImport'
import type { EntreeFileExtensions, ProgressionFile } from '../../shared/types'
import type { ResultatInstallation } from '../../shared/types'

const id = (c: string): string => c.repeat(32)
const ok = (c: string): ResultatInstallation => ({ etat: 'installee', id: id(c), nom: c, version: '1.0' })

const cinq = (): EntreeFileExtensions[] => [
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
      confirmees: new Set([cleEntree({ id: id('d'), magasin: 'chrome' })]),
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

describe('traiterFile (la file est lue et réécrite par le processus principal)', () => {
  const type = (c: string, o: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: id(c), nom: `Ext ${c}`, magasin: 'chrome', actif: true, source: 'chrome', date: 1700000000000, ...o
  })
  const montage = (file: unknown, extra: Partial<DepsTraiterFile> = {}) => {
    let courante = file
    const ecritures: unknown[][] = []
    const installer = vi.fn(async (i: string) => (i === id('b') ? ({ etat: 'erreur', raison: 'hors ligne' } as const) : ok(i[0])))
    const deps: DepsTraiterFile = {
      lire: () => courante,
      ecrire: (l) => {
        ecritures.push(l)
        courante = l
      },
      installateurs: { chrome: installer },
      journal: () => {},
      ...extra
    }
    return { deps, ecritures, installer, courante: () => courante }
  }

  it('file absente (jalon E non fusionné) : résultat vide, rien d’écrit', async () => {
    for (const absent of [undefined, null, 'x', {}, 3]) {
      const m = montage(absent)
      expect(await traiterFile(m.deps, undefined)).toEqual({ resultats: [], restantes: [] })
      expect(m.ecritures).toEqual([])
    }
  })

  it('installe ce que la file contient, réécrit les restantes avec tous leurs champs', async () => {
    const b = type('b', { source: 'edge', date: 42, champInconnu: 'garde' })
    const d = type('d', { imposee: true, date: 7 })
    const m = montage([type('a'), b, d])
    const r = await traiterFile(m.deps, undefined)
    expect(r.resultats.map((x) => x.etat)).toEqual(['installee', 'erreur', 'a-confirmer'])
    expect(m.installer.mock.calls.map((c) => c[0])).toEqual([id('a'), id('b')])
    expect(m.ecritures).toHaveLength(1)
    expect(m.ecritures[0]).toEqual([b, d]) // intactes : source, date, imposee…
    expect(m.ecritures[0][0]).toBe(b)
  })

  it('confirmees (magasin:id) : l’imposée confirmée est installée puis sort de la file ; un identifiant seul ne confirme rien', async () => {
    const d = type('d', { imposee: true })
    const m = montage([d])
    await traiterFile(m.deps, [id('d')])
    expect(m.installer).not.toHaveBeenCalled()
    const r = await traiterFile(m.deps, ['chrome:' + id('d'), 42, null])
    expect(r.resultats[0].etat).toBe('installee')
    expect(m.courante()).toEqual([])
  })

  it("confirmer une imposée n'installe qu'elle : le reste de la file attend « Tout réinstaller »", async () => {
    const a = type('a')
    const d = type('d', { imposee: true })
    const m = montage([a, d])
    const r = await traiterFile(m.deps, ['chrome:' + id('d')])
    expect(m.installer.mock.calls.map((c) => c[0])).toEqual([id('d')])
    expect(r.resultats.map((x) => x.entree.id)).toEqual([id('d')])
    expect(m.courante()).toEqual([a])
  })

  it('entrées invalides ignorées (champs manquants, magasin inconnu, identifiant trop long)', async () => {
    const m = montage([null, 'x', { id: 3, nom: 'N', magasin: 'chrome' }, type('a', { magasin: 'opera' }), type('a', { id: 'x'.repeat(201) }), type('a')])
    const r = await traiterFile(m.deps, undefined)
    expect(r.resultats).toHaveLength(1)
    expect(m.installer).toHaveBeenCalledTimes(1)
  })

  it('plus de 200 entrées : refusé sans rien installer ni écrire', async () => {
    const m = montage(Array.from({ length: 201 }, (_, i) => type('a', { id: `e${i}` })))
    await expect(traiterFile(m.deps, undefined)).rejects.toThrow('File invalide.')
    expect(m.installer).not.toHaveBeenCalled()
    expect(m.ecritures).toEqual([])
  })

  it("une entrée ajoutée à la file pendant l'installation n'est pas perdue", async () => {
    let courante: unknown = [type('a')]
    const ajoutee = type('c')
    const deps: DepsTraiterFile = {
      lire: () => courante,
      ecrire: (l) => {
        courante = l
      },
      installateurs: {
        chrome: async (i) => {
          courante = [type('a'), ajoutee]
          return ok(i[0])
        }
      },
      journal: () => {}
    }
    await traiterFile(deps, undefined)
    expect(courante).toEqual([ajoutee])
  })

  it("file vide : rien n'est écrit", async () => {
    const m = montage([])
    expect(await traiterFile(m.deps, undefined)).toEqual({ resultats: [], restantes: [] })
    expect(m.ecritures).toEqual([])
  })
})
