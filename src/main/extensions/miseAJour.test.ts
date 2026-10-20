import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMiseAJour, comparerVersions } from './miseAJour'
import { creerRegistre, type StoreReglages } from './registre'
import { validerPatch } from '../settings/validate'
import { reglagesParDefaut } from '../settings/defaults'
import type { ExtensionInstallee, Settings } from '../../shared/types'

const id = (c: string): string => c.repeat(32)
const ext = (c: string, o: Partial<ExtensionInstallee> = {}): ExtensionInstallee => ({
  id: id(c), nom: `Ext ${c}`, version: '1.0.0', source: 'cws', magasin: 'chrome', dossier: `${id(c)}/1.0.0_0`, active: true,
  installeeLe: '2026-10-19T10:00:00.000Z', miseAJourLe: '2026-10-19T10:00:00.000Z', ...o
})

function reglages(init: ExtensionInstallee[], majAuto = true): StoreReglages {
  let s = { ...reglagesParDefaut('/dl'), extensions: { installees: init, majAuto } } as Settings
  return {
    getSettings: () => s,
    setSettings: (patch) => {
      const v = validerPatch(patch) as Partial<Settings>
      s = { ...s, extensions: { ...s.extensions, ...(v.extensions ?? {}) } } as Settings
      return s
    }
  }
}

describe('comparerVersions', () => {
  it('compare numériquement chaque segment', () => {
    expect(comparerVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(comparerVersions('1.64', '1.64.0')).toBe(0)
    expect(comparerVersions('1.0.0_0', '1.0.1')).toBeLessThan(0)
  })
})

const base = (r: StoreReglages, o: Partial<Parameters<typeof creerMiseAJour>[0]> = {}): Parameters<typeof creerMiseAJour>[0] => ({
  registre: creerRegistre(r),
  reglages: r,
  versionDistanteCws: async () => undefined,
  mettreAJourCws: async () => ({ etat: 'erreur', raison: 'non prévu' }),
  journal: () => {},
  ...o
})

describe('verifier', () => {
  const NOW = new Date('2026-10-20T08:00:00.000Z')
  it('met à jour toutes les extensions du Web Store (actives ou non) dont la version distante est plus récente, et horodate', async () => {
    const r = reglages([ext('a'), ext('b', { active: false }), ext('c'), ext('d', { source: 'dossier', magasin: 'inconnu', dossier: `${id('d')}/1.0.0` })])
    const distantes: Record<string, string> = { [id('a')]: '1.1.0', [id('b')]: '2.0.0', [id('c')]: '1.0.0' }
    const interroges: string[] = []
    const installes: string[] = []
    const m = creerMiseAJour(
      base(r, {
        maintenant: () => NOW,
        versionDistanteCws: async (i) => {
          interroges.push(i)
          return distantes[i]
        },
        mettreAJourCws: async (i) => {
          installes.push(i)
          return { etat: 'installee', id: i, nom: 'x', version: distantes[i] }
        }
      })
    )
    const res = await m.verifier()
    expect(interroges).toEqual([id('a'), id('b'), id('c')]) // jamais l'extension « dossier »
    expect(installes).toEqual([id('a'), id('b')])
    expect(res.misesAJour.map((x) => [x.id, x.de, x.vers])).toEqual([[id('a'), '1.0.0', '1.1.0'], [id('b'), '1.0.0', '2.0.0']])
    expect(res.erreurs).toEqual([])
    expect(r.getSettings().extensions.derniereVerification).toBe(NOW.toISOString())
  })

  it('une erreur de mise à jour est journalisée, les autres extensions sont traitées, la date n\'est pas posée', async () => {
    const r = reglages([ext('a'), ext('b')])
    const installes: string[] = []
    const journal = vi.fn()
    const m = creerMiseAJour(
      base(r, {
        journal,
        versionDistanteCws: async (i) => {
          if (i === id('a')) throw new Error('hors ligne')
          return '2.0.0'
        },
        mettreAJourCws: async (i) => {
          installes.push(i)
          return { etat: 'installee', id: i, nom: 'x', version: '2.0.0' }
        }
      })
    )
    const res = await m.verifier()
    expect(res.erreurs).toEqual([expect.stringContaining('hors ligne')])
    expect(installes).toEqual([id('b')])
    expect(res.misesAJour).toHaveLength(1)
    expect(journal).toHaveBeenCalled()
    expect(r.getSettings().extensions.derniereVerification).toBeUndefined()
  })

  it('uBO : compare la version de la release et réinstalle si plus récente', async () => {
    const ubo = ext('u', { nom: 'uBlock Origin', source: 'zip', version: '1.63.0', dossier: `${id('u')}/1.63.0` })
    const r = reglages([ubo])
    const installerUbo = vi.fn(async () => ({ etat: 'installee' as const, id: id('u'), nom: 'uBlock Origin', version: '1.64.0' }))
    const m = creerMiseAJour(base(r, { maintenant: () => NOW, derniereVersionUbo: async () => '1.64.0', installerUbo }))
    const res = await m.verifier()
    expect(installerUbo).toHaveBeenCalledTimes(1)
    expect(res.misesAJour).toEqual([{ id: id('u'), nom: 'uBlock Origin', de: '1.63.0', vers: '1.64.0' }])
    installerUbo.mockClear()
    const r2 = reglages([{ ...ubo, version: '1.64.0' }])
    expect((await creerMiseAJour(base(r2, { derniereVersionUbo: async () => '1.64.0', installerUbo })).verifier()).misesAJour).toEqual([])
    expect(installerUbo).not.toHaveBeenCalled()
  })

  it('sans extension du magasin ni uBO : aucun appel réseau', async () => {
    const r = reglages([ext('b', { source: 'dossier', dossier: `${id('b')}/1.0.0` })])
    const versionDistanteCws = vi.fn()
    await creerMiseAJour(base(r, { versionDistanteCws })).verifier()
    expect(versionDistanteCws).not.toHaveBeenCalled()
  })
})

describe('planification', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('vérifie au démarrage puis toutes les 6 h, seulement si majAuto', async () => {
    let auto = true
    const r = reglages([ext('a')])
    const verifier = vi.fn(async () => ({ misesAJour: [], erreurs: [] }))
    const m = creerMiseAJour({
      registre: creerRegistre(r), reglages: { ...r, getSettings: () => ({ ...r.getSettings(), extensions: { ...r.getSettings().extensions, majAuto: auto } }) as Settings },
      versionDistanteCws: async () => undefined, mettreAJourCws: async () => ({ etat: 'erreur', raison: '' }), journal: () => {}
    })
    m.verifier = verifier
    m.demarrer()
    await vi.advanceTimersByTimeAsync(1)
    expect(verifier).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6 * 3600_000)
    expect(verifier).toHaveBeenCalledTimes(2)
    auto = false
    await vi.advanceTimersByTimeAsync(6 * 3600_000)
    expect(verifier).toHaveBeenCalledTimes(2)
    m.arreter()
    auto = true
    await vi.advanceTimersByTimeAsync(12 * 3600_000)
    expect(verifier).toHaveBeenCalledTimes(2)
  })

  it('les minuteurs ne retiennent pas le processus (unref)', () => {
    const unref = vi.fn()
    const si = vi.spyOn(globalThis, 'setInterval').mockImplementation((() => ({ unref })) as never)
    const st = vi.spyOn(globalThis, 'setTimeout').mockImplementation((() => ({ unref })) as never)
    const r = reglages([])
    const m = creerMiseAJour(base(r))
    m.demarrer()
    expect(unref).toHaveBeenCalledTimes(2)
    si.mockRestore()
    st.mockRestore()
    m.arreter()
  })
})
