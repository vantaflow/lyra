import { describe, it, expect } from 'vitest'
import type { SkyState, Star } from '../../shared/types'
import { TabTree } from './TabTree'
import { domaineEnregistrable, placerEnfant, placerNouvelle, planRegroupement } from './placement'

const etoile = (id: string, o: Partial<Star> = {}): Star => ({ id, url: `https://${id}.test/`, title: '', pinned: false, dormant: false, index: 0, ...o })
const ciel = (stars: Star[], constellations: SkyState['constellations'] = []): Pick<SkyState, 'stars' | 'constellations'> => ({ stars, constellations })

describe('placerNouvelle', () => {
  it('ciel vide : fin du ciel, aucun lien', () => {
    for (const mode of ['sous-active', 'fin-constellation', 'hors-constellation'] as const) {
      expect(placerNouvelle(ciel([]), null, mode)).toEqual({ position: 'fin' })
    }
  })

  it("étoile active inconnue : fin du ciel", () => {
    expect(placerNouvelle(ciel([etoile('a')]), 'fantome', 'sous-active')).toEqual({ position: 'fin' })
  })

  it("sous-active : juste après l'étoile active, dans sa constellation, sans lien", () => {
    const c = { id: 'c1', name: 'Travail', color: '#fff' }
    const s = ciel([etoile('a', { constellationId: 'c1' })], [c])
    expect(placerNouvelle(s, 'a', 'sous-active')).toEqual({ apresId: 'a', constellationId: 'c1', position: 'apres' })
  })

  it('sous-active : étoile active hors constellation, la nouvelle l’est aussi', () => {
    expect(placerNouvelle(ciel([etoile('a')]), 'a', 'sous-active')).toEqual({ apresId: 'a', position: 'apres' })
  })

  it("sous-active : constellation inconnue de l'active ignorée", () => {
    expect(placerNouvelle(ciel([etoile('a', { constellationId: 'x' })]), 'a', 'sous-active')).toEqual({ apresId: 'a', position: 'apres' })
  })

  it('fin-constellation : fin de la constellation de l’active, sans lien', () => {
    const c = { id: 'c1', name: 'Travail', color: '#fff' }
    const s = ciel([etoile('a', { constellationId: 'c1' }), etoile('b')], [c])
    expect(placerNouvelle(s, 'a', 'fin-constellation')).toEqual({ constellationId: 'c1', position: 'fin-constellation' })
  })

  it("fin-constellation : active hors constellation (ou constellation vide/supprimée) → fin du ciel", () => {
    expect(placerNouvelle(ciel([etoile('a')]), 'a', 'fin-constellation')).toEqual({ position: 'fin' })
    expect(placerNouvelle(ciel([etoile('a', { constellationId: 'x' })]), 'a', 'fin-constellation')).toEqual({ position: 'fin' })
  })

  it('hors-constellation : fin du ciel, ni lien ni constellation', () => {
    const c = { id: 'c1', name: 'Travail', color: '#fff' }
    const s = ciel([etoile('a', { constellationId: 'c1' })], [c])
    expect(placerNouvelle(s, 'a', 'hors-constellation')).toEqual({ position: 'fin' })
  })
})

describe('placerEnfant', () => {
  it('reliée au parent, dans sa constellation', () => {
    const c = { id: 'c1', name: 'Travail', color: '#fff' }
    expect(placerEnfant(ciel([etoile('a', { constellationId: 'c1' })], [c]), 'a')).toEqual({ parentId: 'a', constellationId: 'c1', position: 'sous-parent' })
    expect(placerEnfant(ciel([etoile('a')]), 'a')).toEqual({ parentId: 'a', position: 'sous-parent' })
  })
  it('parent inconnu : fin du ciel', () => {
    expect(placerEnfant(ciel([]), 'a')).toEqual({ position: 'fin' })
  })
})

describe('domaineEnregistrable', () => {
  it('domaine enregistrable des adresses web', () => {
    expect(domaineEnregistrable('https://www.github.com/a/b')).toBe('github.com')
    expect(domaineEnregistrable('http://news.bbc.co.uk/')).toBe('bbc.co.uk')
    expect(domaineEnregistrable('https://a.exemple.localhost:8080/')).toBe('exemple.localhost')
  })
  it('rien pour une IP, localhost, lyra:// ou une adresse invalide', () => {
    for (const u of ['http://127.0.0.1:3000/', 'http://localhost/', 'lyra://newtab', 'file:///tmp/a.html', 'pas une url', '']) {
      expect(domaineEnregistrable(u)).toBeUndefined()
    }
  })
})

describe('planRegroupement', () => {
  const c = (id: string, name: string, auto?: boolean) => ({ id, name, color: '#fff', ...(auto ? { auto: true } : {}) })

  it('crée une constellation automatique si aucune ne porte le domaine', () => {
    expect(planRegroupement(ciel([]), 'github.com')).toEqual({ creer: 'github.com' })
  })

  it('réutilise la constellation automatique du domaine', () => {
    expect(planRegroupement(ciel([], [c('c1', 'github.com', true)]), 'github.com')).toEqual({ constellationId: 'c1' })
  })

  it("réutilise une constellation nommée par l'utilisateur au nom du domaine (sans la modifier)", () => {
    expect(planRegroupement(ciel([], [c('c1', 'GitHub.com')]), 'github.com')).toEqual({ constellationId: 'c1' })
  })

  it("une constellation automatique renommée par l'utilisateur n'est plus reconnue : on en crée une autre", () => {
    expect(planRegroupement(ciel([], [c('c1', 'Travail', true)]), 'github.com')).toEqual({ creer: 'github.com' })
  })
})

describe('TabTree : positions pour le placement', () => {
  it('fin-constellation : après la dernière étoile de la constellation', () => {
    const t = new TabTree()
    const c = t.creerConstellation({ name: 'Travail', color: '#fff' })
    const a = t.creer({ url: 'https://a.test/', constellationId: c.id, position: 'fin' })
    const b = t.creer({ url: 'https://b.test/', position: 'fin' })
    const d = t.creer({ url: 'https://d.test/', constellationId: c.id, position: 'fin-constellation' })
    expect(t.toJSON().stars.map((s) => s.id)).toEqual([a.id, d.id, b.id])
  })

  it('apres : après l’étoile et ses descendantes, sans devenir sa fille', () => {
    const t = new TabTree()
    const a = t.creer({ url: 'https://a.test/', position: 'fin' })
    const e = t.creer({ url: 'https://e.test/', parentId: a.id, position: 'sous-parent' })
    const b = t.creer({ url: 'https://b.test/', position: 'fin' })
    const n = t.creer({ url: 'https://n.test/', apresId: a.id, position: 'apres' })
    expect(t.toJSON().stars.map((s) => s.id)).toEqual([a.id, e.id, n.id, b.id])
    expect(n.parentId).toBeUndefined()
  })

  it('fin-constellation sans membre : fin du ciel', () => {
    const t = new TabTree()
    const a = t.creer({ url: 'https://a.test/', position: 'fin' })
    const d = t.creer({ url: 'https://d.test/', constellationId: 'x', position: 'fin-constellation' })
    expect(t.toJSON().stars.map((s) => s.id)).toEqual([a.id, d.id])
  })

  it('le regroupement automatique marque la constellation créée', () => {
    const t = new TabTree()
    const c = t.creerConstellation({ name: 'github.com', color: '#fff', auto: true })
    expect(t.constellation(c.id)?.auto).toBe(true)
  })
})

describe('TabTree : archivage', () => {
  it('fermer sans mémoriser ne rouvre rien avec rouvrirDerniere', () => {
    const t = new TabTree()
    t.creer({ url: 'https://a.test/', position: 'fin' })
    const b = t.creer({ url: 'https://b.test/', position: 'fin' })
    t.fermer(b.id, { memoriser: false })
    expect(t.rouvrirDerniere()).toBeNull()
  })

  it('rouvrir une étoile oublie son inactivité', () => {
    const t = new TabTree()
    t.creer({ url: 'https://a.test/', position: 'fin' })
    const b = t.creer({ url: 'https://b.test/', position: 'fin' })
    b.inactifDepuis = 5
    t.fermer(b.id)
    expect(t.rouvrirDerniere()?.inactifDepuis).toBeUndefined()
  })
})
