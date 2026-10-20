import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ WebContentsView: class {}, session: {} }))
vi.mock('../ipc', () => ({ envoyer: vi.fn(), handle: vi.fn() }))
import { TabManager } from './TabManager'
import type { OptionsTabs } from './TabManager'

function creer(o: OptionsTabs = {}): TabManager {
  const fenetre = { win: { on: () => undefined, isDestroyed: () => true } }
  return new TabManager(fenetre as never, undefined, o)
}

describe('TabManager.retirerArchivee', () => {
  it('retire une étoile dormante du ciel exporté (session), de ses entrées, et ne la rend pas à ⌘ ⇧ T', () => {
    const t = creer()
    const garde = t.ouvrirEndormie('https://garde.fr/')
    const vieille = t.ouvrirEndormie('https://vieille.fr/', { titre: 'Vieille' })
    t.tree.activer(garde)
    expect(t.retirerArchivee(vieille)).toBe(true)
    const ex = t.exporter()
    expect(ex.ciel.stars.map((s) => s.id)).toEqual([garde])
    expect(Object.keys(ex.entrees)).toEqual([garde])
    expect(t.tree.rouvrirDerniere()).toBeNull()
  })

  it('refuse l’étoile active, épinglée, éveillée ou inconnue', () => {
    const t = creer()
    const active = t.ouvrirEndormie('https://a.fr/')
    const epinglee = t.ouvrirEndormie('https://b.fr/', { epingle: true })
    const eveillee = t.ouvrirEndormie('https://c.fr/')
    t.tree.activer(active)
    t.tree.star(eveillee)!.dormant = false
    expect(t.retirerArchivee(active)).toBe(false)
    expect(t.retirerArchivee(epinglee)).toBe(false)
    expect(t.retirerArchivee(eveillee)).toBe(false)
    expect(t.retirerArchivee('inconnue')).toBe(false)
    expect(t.exporter().ciel.stars).toHaveLength(3)
  })

  it('retire la constellation automatique devenue vide, jamais celle de l’utilisateur', () => {
    const t = creer()
    const garde = t.ouvrirEndormie('https://garde.fr/')
    const perso = t.creerConstellation({ name: 'Travail', color: '#5B8DEF' })
    const auto = t.tree.creerConstellation({ name: 'vieille.fr', color: '#5B8DEF', auto: true })
    const a = t.ouvrirEndormie('https://vieille.fr/', { constellationId: auto.id })
    const b = t.ouvrirEndormie('https://perso.fr/', { constellationId: perso.id })
    t.tree.activer(garde)
    t.retirerArchivee(a)
    t.retirerArchivee(b)
    expect(t.constellations().map((c) => c.name)).toEqual(['Travail'])
  })
})

describe('TabManager.creerConstellation', () => {
  it('ne pose jamais `auto` (réservé au regroupement par site)', () => {
    const t = creer()
    const c = t.creerConstellation({ name: 'Perso', color: '#fff', auto: true } as never)
    expect(c.auto).toBeUndefined()
    expect(t.constellations()[0].auto).toBeUndefined()
  })
})

describe('TabManager : horloge', () => {
  it('le début d’inactivité suit l’horloge injectée (pas Date.now)', () => {
    const t = creer({ maintenant: () => 4242 })
    const id = t.ouvrirEndormie('https://a.fr/')
    t['armer'](id)
    expect(t['inactifDepuis'].get(id)).toBe(4242)
    expect(t.tree.star(id)?.inactifDepuis).toBe(4242)
  })
})

describe('TabManager : placement et regroupement', () => {
  const reglages = { nouvelleEtoile: 'hors-constellation' as const, regrouperParSite: true }

  it('une étoile par site : la constellation du domaine est créée (auto) puis réutilisée', () => {
    const t = creer({ placement: () => reglages })
    const p1 = t['placer']('https://www.bbc.co.uk/a')
    expect(p1.constellationId).toBeDefined()
    t.tree.creer({ url: 'https://www.bbc.co.uk/a', ...p1 })
    const p2 = t['placer']('https://news.bbc.co.uk/b')
    expect(p2.constellationId).toBe(p1.constellationId)
    expect(t.constellations()).toHaveLength(1)
    expect(t.constellations()[0]).toMatchObject({ name: 'bbc.co.uk', auto: true })
  })

  it('une constellation nommée par l’utilisateur est réutilisée sans être modifiée', () => {
    const t = creer({ placement: () => reglages })
    const c = t.creerConstellation({ name: 'bbc.co.uk', color: '#123456' })
    const p = t['placer']('https://www.bbc.co.uk/a')
    expect(p.constellationId).toBe(c.id)
    expect(t.constellations()).toEqual([c])
  })

  it('aucun regroupement sans le réglage, ni pour une adresse sans domaine', () => {
    const sans = creer({ placement: () => ({ ...reglages, regrouperParSite: false }) })
    expect(sans['placer']('https://a.fr/').constellationId).toBeUndefined()
    const t = creer({ placement: () => reglages })
    expect(t['placer']('http://localhost:3000/').constellationId).toBeUndefined()
    expect(t.constellations()).toHaveLength(0)
  })

  it('ne recopie pas le ciel pour placer une étoile', () => {
    const t = creer({ placement: () => reglages })
    t.ouvrirEndormie('https://a.fr/')
    const espion = vi.spyOn(t.tree, 'toJSON')
    t['placer']('https://b.fr/')
    t['placer']('https://a.fr/')
    expect(espion).not.toHaveBeenCalled()
  })
})
