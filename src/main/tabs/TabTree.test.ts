import { describe, it, expect } from 'vitest'
import { TabTree } from './TabTree'

const A = 'https://a.test/'

describe('TabTree', () => {
  it('crée une étoile sous son parent, après le dernier descendant', () => {
    const t = new TabTree()
    const p = t.creer({ url: A, position: 'fin' })
    const q = t.creer({ url: A, position: 'fin' })
    const e1 = t.creer({ url: A, parentId: p.id, position: 'sous-parent' })
    const e2 = t.creer({ url: A, parentId: p.id, position: 'sous-parent' })
    const pe = t.creer({ url: A, parentId: e1.id, position: 'sous-parent' })
    expect(t.toJSON().stars.map((s) => s.id)).toEqual([p.id, e1.id, pe.id, e2.id, q.id])
    expect(t.toJSON().stars.map((s) => s.index)).toEqual([0, 1, 2, 3, 4])
    expect(e1.parentId).toBe(p.id)
  })

  it('« après » une étoile reliée : rangée après le sous-arbre de sa racine, sans couper celui-ci', () => {
    const t = new TabTree()
    const p = t.creer({ url: A, position: 'fin' })
    const e1 = t.creer({ url: A, parentId: p.id, position: 'sous-parent' })
    const e2 = t.creer({ url: A, parentId: p.id, position: 'sous-parent' })
    const pe = t.creer({ url: A, parentId: e1.id, position: 'sous-parent' })
    const q = t.creer({ url: A, position: 'fin' })
    const n = t.creer({ url: A, apresId: pe.id, position: 'apres' })
    expect(t.toJSON().stars.map((s) => s.id)).toEqual([p.id, e1.id, pe.id, e2.id, n.id, q.id])
    expect(n.parentId).toBeUndefined()
  })

  it("fermer un parent rattache ses enfants au grand-parent", () => {
    const t = new TabTree()
    const g = t.creer({ url: A, position: 'fin' })
    const p = t.creer({ url: A, parentId: g.id, position: 'sous-parent' })
    const e = t.creer({ url: A, parentId: p.id, position: 'sous-parent' })
    const r = t.fermer(p.id)
    expect(r.fermees.map((s) => s.id)).toEqual([p.id])
    expect(t.toJSON().stars.find((s) => s.id === e.id)?.parentId).toBe(g.id)
  })

  it('fermer une racine rend ses enfants orphelins', () => {
    const t = new TabTree()
    const p = t.creer({ url: A, position: 'fin' })
    const e = t.creer({ url: A, parentId: p.id, position: 'sous-parent' })
    t.fermer(p.id)
    expect(t.toJSON().stars.find((s) => s.id === e.id)?.parentId).toBeUndefined()
  })

  it('suivantActif : parent, sinon suivante, sinon précédente, sinon null', () => {
    const t = new TabTree()
    const a = t.creer({ url: A, position: 'fin' })
    const b = t.creer({ url: A, position: 'fin' })
    const c = t.creer({ url: A, parentId: b.id, position: 'sous-parent' })
    expect(t.fermer(c.id).suivantActif).toBe(b.id)
    expect(t.fermer(a.id).suivantActif).toBe(b.id)
    expect(t.fermer(b.id).suivantActif).toBeNull()
  })

  it('suivantActif : voisine précédente en dernier recours', () => {
    const t = new TabTree()
    const a = t.creer({ url: A, position: 'fin' })
    const b = t.creer({ url: A, position: 'fin' })
    expect(t.fermer(b.id).suivantActif).toBe(a.id)
  })

  it("fermer l'étoile active déplace l'activation", () => {
    const t = new TabTree()
    const a = t.creer({ url: A, position: 'fin' })
    const b = t.creer({ url: A, position: 'fin' })
    t.activer(a.id)
    t.fermer(a.id)
    expect(t.toJSON().activeId).toBe(b.id)
  })

  it('rouvrirDerniere restaure la dernière fermée, pile limitée à 25', () => {
    const t = new TabTree()
    expect(t.rouvrirDerniere()).toBeNull()
    t.creer({ url: A, position: 'fin' })
    for (let i = 0; i < 30; i++) {
      const s = t.creer({ url: `https://x.test/${i}`, position: 'fin' })
      t.fermer(s.id)
    }
    const r = t.rouvrirDerniere()!
    expect(r.url).toBe('https://x.test/29')
    expect(t.toJSON().stars.map((s) => s.url)).toContain('https://x.test/29')
    for (let i = 0; i < 30; i++) t.rouvrirDerniere()
    expect(t.toJSON().stars.length).toBe(1 + 25)
  })

  it('une étoile fermée endormie est rouverte non dormante', () => {
    const t = new TabTree()
    t.creer({ url: A, position: 'fin' })
    const s = t.creer({ url: A, position: 'fin' })
    t.star(s.id)!.dormant = true
    t.fermer(s.id)
    expect(t.rouvrirDerniere()!.dormant).toBe(false)
  })

  it('déplace une étoile (avec ses enfants) et empêche les cycles', () => {
    const t = new TabTree()
    const a = t.creer({ url: A, position: 'fin' })
    const b = t.creer({ url: A, position: 'fin' })
    const c = t.creer({ url: A, parentId: b.id, position: 'sous-parent' })
    t.deplacer(b.id, { parentId: a.id, index: 1 })
    expect(t.toJSON().stars.map((s) => s.id)).toEqual([a.id, b.id, c.id])
    expect(t.toJSON().stars[1].parentId).toBe(a.id)
    t.deplacer(a.id, { parentId: c.id, index: 0 })
    expect(t.toJSON().stars.find((s) => s.id === a.id)?.parentId).toBeUndefined()
  })

  it('épingle et sérialise aller-retour', () => {
    const t = new TabTree()
    const a = t.creer({ url: A, constellationId: 'k', position: 'fin' })
    t.creer({ url: A, parentId: a.id, position: 'sous-parent' })
    t.epingler(a.id, true)
    t.activer(a.id)
    const json = t.toJSON()
    expect(json.pinned).toEqual([a.id])
    const t2 = TabTree.fromJSON(JSON.parse(JSON.stringify(json)))
    expect(t2.toJSON()).toEqual(json)
  })
})

describe('TabTree.creerConstellation', () => {
  it('crée, retrouve par id et exporte la constellation', () => {
    const t = new TabTree()
    const c = t.creerConstellation({ name: 'Docs', color: '#5B8DEF' })
    expect(c).toMatchObject({ name: 'Docs', color: '#5B8DEF' })
    expect(c.id).toBeTruthy()
    expect(t.constellation(c.id)).toEqual(c)
    expect(t.constellation('x')).toBeUndefined()
    expect(t.toJSON().constellations).toEqual([c])
    const s = t.creer({ url: A, constellationId: c.id, position: 'fin' })
    expect(t.star(s.id)?.constellationId).toBe(c.id)
    expect(TabTree.fromJSON(t.toJSON()).constellation(c.id)).toEqual(c)
  })

  it('⌘ ⇧ T : une étoile dont la constellation a disparu (automatique vidée) revient sans constellation', () => {
    const t = new TabTree()
    const c = t.creerConstellation({ name: 'a.test', color: '#fff', auto: true })
    t.creer({ url: A, position: 'fin' })
    const e = t.creer({ url: A, constellationId: c.id, position: 'fin' })
    t.fermer(e.id)
    t.purgerAutoVides()
    expect(t.rouvrirDerniere()?.constellationId).toBeUndefined()
  })
})
