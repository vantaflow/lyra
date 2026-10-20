import { describe, expect, it } from 'vitest'
import type { SkyState } from '../../shared/types'
import { cielDepuisJson, cielVersJson, cielVersOnglets } from './ciel'

const ciel: SkyState = {
  constellations: [
    { id: 'c1', name: 'Travail', color: '#5B8DEF' },
    { id: 'c2', name: 'Loisirs', color: '#E0604F' }
  ],
  stars: [
    { id: 's1', url: 'https://a.fr/', title: 'A', pinned: true, dormant: false, index: 0, constellationId: 'c1' },
    { id: 's2', url: 'https://b.fr/', title: 'B', pinned: false, dormant: true, index: 1, constellationId: 'c2', parentId: 's1' },
    { id: 's3', url: 'lyra://newtab', title: 'Nouvel onglet', pinned: false, dormant: false, index: 2 },
    { id: 's4', url: 'https://d.fr/', title: 'D', pinned: false, dormant: false, index: 3 }
  ],
  activeId: 's1',
  pinned: ['s1']
}

describe('ciel JSON', () => {
  it('exporte constellations, étoiles et épingles, sans les pages internes', () => {
    const j = JSON.parse(cielVersJson(ciel, new Date('2026-01-02T03:04:05Z')))
    expect(j).toMatchObject({ format: 'lyra-ciel', version: 1, date: '2026-01-02T03:04:05.000Z' })
    expect(j.constellations).toEqual([
      { id: 'c1', nom: 'Travail', couleur: '#5B8DEF' },
      { id: 'c2', nom: 'Loisirs', couleur: '#E0604F' }
    ])
    expect(j.etoiles.map((e: { url: string }) => e.url)).toEqual(['https://a.fr/', 'https://b.fr/', 'https://d.fr/'])
    expect(j.etoiles[0]).toMatchObject({ epingle: true, constellation: 'c1' })
  })

  it('aller-retour : mêmes étoiles, mêmes constellations (nom et couleur exacte), mêmes épingles', () => {
    const lu = cielDepuisJson(cielVersJson(ciel))
    const onglets = cielVersOnglets(lu)
    expect(onglets.fenetres).toHaveLength(1)
    const [w] = onglets.fenetres
    expect(w.groupes.map((g) => [g.id, g.nom, g.couleurHex])).toEqual([['c1', 'Travail', '#5B8DEF'], ['c2', 'Loisirs', '#E0604F']])
    expect(w.onglets.map((o) => [o.url, o.titre, o.groupe, o.epingle])).toEqual([
      ['https://a.fr/', 'A', 'c1', true],
      ['https://b.fr/', 'B', 'c2', false],
      ['https://d.fr/', 'D', undefined, false]
    ])
  })

  it('refuse un fichier d’un autre format ou d’une version plus récente', () => {
    expect(() => cielDepuisJson('{"format":"autre","version":1}')).toThrow(/ciel/i)
    expect(() => cielDepuisJson('{"format":"lyra-ciel","version":2,"constellations":[],"etoiles":[]}')).toThrow(/version/i)
    expect(() => cielDepuisJson('pas du json')).toThrow()
  })

  it('assainit : champs mal typés ignorés, constellation inconnue détachée, couleur invalide retirée, bornes', () => {
    const lu = cielDepuisJson(
      JSON.stringify({
        format: 'lyra-ciel',
        version: 1,
        constellations: [{ id: 'c', nom: 'N', couleur: 'rouge' }, { id: 5 }, null],
        etoiles: [{ url: 'https://a.fr/', titre: 7, constellation: 'inconnue' }, { url: 3 }, { url: 'https://b.fr/', titre: 'B', constellation: 'c', epingle: 'oui' }]
      })
    )
    const [w] = cielVersOnglets(lu).fenetres
    expect(w.groupes).toHaveLength(1)
    expect(w.groupes[0].couleurHex).toBeUndefined()
    expect(w.onglets.map((o) => [o.url, o.titre, o.groupe, o.epingle])).toEqual([
      ['https://a.fr/', '', undefined, false],
      ['https://b.fr/', 'B', 'c', false]
    ])
  })

  it('fichier réenregistré par le Bloc-notes de Windows (BOM UTF-8) : relu', () => {
    expect(cielDepuisJson('\uFEFF' + cielVersJson(ciel)).format).toBe('lyra-ciel')
  })
})
