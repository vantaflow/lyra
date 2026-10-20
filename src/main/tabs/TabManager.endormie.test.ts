import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ WebContentsView: class {}, session: {} }))
vi.mock('../ipc', () => ({ envoyer: vi.fn(), handle: vi.fn() }))
import { TabManager } from './TabManager'

function creer(): TabManager {
  const fenetre = { win: { on: () => undefined, isDestroyed: () => true } }
  return new TabManager(fenetre as never)
}

describe('TabManager.ouvrirEndormie', () => {
  it('étoile endormie sans vue, dans sa constellation, avec entrée de navigation exportée', () => {
    const t = creer()
    const c = t.creerConstellation({ name: 'Docs', color: '#5B8DEF' })
    const id = t.ouvrirEndormie('https://docs.fr/a', { constellationId: c.id, titre: 'Doc A', epingle: true })
    const s = t.tree.star(id)!
    expect(s).toMatchObject({ url: 'https://docs.fr/a', title: 'Doc A', dormant: true, pinned: true, constellationId: c.id })
    const ex = t.exporter()
    expect(ex.entrees[id]).toEqual({ entries: [{ url: 'https://docs.fr/a', title: 'Doc A' }], index: 0 })
    expect(ex.ciel.constellations).toEqual([c])
    expect(ex.ciel.pinned).toEqual([id])
  })

  it('sans options : étoile libre ; constellation inconnue ignorée ; n\'active pas', () => {
    const t = creer()
    const id = t.ouvrirEndormie('https://a.fr/', { constellationId: 'inconnue' })
    expect(t.tree.star(id)).toMatchObject({ dormant: true, pinned: false, title: '' })
    expect(t.tree.star(id)?.constellationId).toBeUndefined()
    expect(t.tree.toJSON().activeId).toBeNull()
  })
})
