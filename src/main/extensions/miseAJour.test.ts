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

describe('verifier', () => {
  const NOW = new Date('2026-10-20T08:00:00.000Z')
  it('met à jour les extensions du Web Store, réconcilie le registre et horodate', async () => {
    const r = reglages([ext('a'), ext('b', { source: 'dossier', magasin: 'inconnu', dossier: `${id('b')}/1.0.0` })])
    const registre = creerRegistre(r)
    const updateExtensions = vi.fn(async () => {})
    const m = creerMiseAJour({
      registre, reglages: r, updateExtensions,
      extensionsChargees: () => [{ id: id('a'), version: '1.1.0', path: `/base/${id('a')}/1.1.0_0` }],
      base: '/base', maintenant: () => NOW, journal: () => {}
    })
    const res = await m.verifier()
    expect(updateExtensions).toHaveBeenCalledTimes(1)
    expect(res.misesAJour).toEqual([{ id: id('a'), nom: 'Ext a', de: '1.0.0', vers: '1.1.0' }])
    expect(registre.trouver(id('a'))).toMatchObject({ version: '1.1.0', dossier: `${id('a')}/1.1.0_0`, miseAJourLe: NOW.toISOString() })
    expect(registre.trouver(id('b'))?.version).toBe('1.0.0')
    expect(r.getSettings().extensions.derniereVerification).toBe(NOW.toISOString())
  })

  it('uBO : compare la version de la release et réinstalle si plus récente', async () => {
    const ubo = ext('u', { nom: 'uBlock Origin', source: 'zip', version: '1.63.0', dossier: `${id('u')}/1.63.0` })
    const r = reglages([ubo])
    const registre = creerRegistre(r)
    const installerUbo = vi.fn(async () => ({ etat: 'installee' as const, id: id('u'), nom: 'uBlock Origin', version: '1.64.0' }))
    const m = creerMiseAJour({
      registre, reglages: r, updateExtensions: async () => {}, extensionsChargees: () => [], base: '/base', maintenant: () => NOW, journal: () => {},
      derniereVersionUbo: async () => '1.64.0', installerUbo
    })
    const res = await m.verifier()
    expect(installerUbo).toHaveBeenCalledTimes(1)
    expect(res.misesAJour).toEqual([{ id: id('u'), nom: 'uBlock Origin', de: '1.63.0', vers: '1.64.0' }])
    // À jour : rien à faire
    installerUbo.mockClear()
    const m2 = creerMiseAJour({
      registre: creerRegistre(reglages([{ ...ubo, version: '1.64.0' }])), reglages: reglages([]), updateExtensions: async () => {}, extensionsChargees: () => [], base: '/base', journal: () => {},
      derniereVersionUbo: async () => '1.64.0', installerUbo
    })
    expect((await m2.verifier()).misesAJour).toEqual([])
    expect(installerUbo).not.toHaveBeenCalled()
  })

  it('une erreur réseau est journalisée sans lever ; la date n\'est pas posée', async () => {
    const r = reglages([ext('a')])
    const journal = vi.fn()
    const m = creerMiseAJour({
      registre: creerRegistre(r), reglages: r, updateExtensions: async () => { throw new Error('hors ligne') }, extensionsChargees: () => [], base: '/base', journal
    })
    const res = await m.verifier()
    expect(res.erreurs).toEqual([expect.stringContaining('hors ligne')])
    expect(journal).toHaveBeenCalled()
    expect(r.getSettings().extensions.derniereVerification).toBeUndefined()
  })

  it('sans extension du magasin ni uBO : aucun appel réseau', async () => {
    const r = reglages([ext('b', { source: 'dossier', dossier: `${id('b')}/1.0.0` })])
    const updateExtensions = vi.fn()
    const m = creerMiseAJour({ registre: creerRegistre(r), reglages: r, updateExtensions, extensionsChargees: () => [], base: '/base', journal: () => {} })
    await m.verifier()
    expect(updateExtensions).not.toHaveBeenCalled()
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
      updateExtensions: async () => {}, extensionsChargees: () => [], base: '/b', journal: () => {}
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

  it('le minuteur ne retient pas le processus (unref)', () => {
    const r = reglages([])
    const unref = vi.spyOn(globalThis, 'setInterval')
    const m = creerMiseAJour({ registre: creerRegistre(r), reglages: r, updateExtensions: async () => {}, extensionsChargees: () => [], base: '/b', journal: () => {} })
    m.demarrer()
    const t = unref.mock.results[0].value as unknown as { unref?: () => void }
    expect(t).toBeDefined()
    m.arreter()
    unref.mockRestore()
  })
})
