import { describe, expect, it } from 'vitest'
import { interpreterSaisie, suggerer } from './suggest'
import { urlDeRecherche, moteurParId } from './engines'
import type { Star } from '../../shared/types'

const DEF = 'duckduckgo'
const etoile = (id: string, title: string, url: string, extra: Partial<Star> = {}): Star => ({
  id, url, title, pinned: false, dormant: false, index: 0, ...extra
})

describe('interpreterSaisie', () => {
  it('domaine nu → https', () => expect(interpreterSaisie('exemple.fr', DEF)).toEqual({ type: 'url', url: 'https://exemple.fr' }))
  it('localhost:port', () => expect(interpreterSaisie('localhost:3000', DEF)).toEqual({ type: 'url', url: 'https://localhost:3000' }))
  it('IP', () => expect(interpreterSaisie('192.168.1.1', DEF)).toEqual({ type: 'url', url: 'https://192.168.1.1' }))
  it('deux mots → recherche', () =>
    expect(interpreterSaisie('deux mots', DEF)).toEqual({ type: 'recherche', moteur: DEF, requete: 'deux mots' }))
  it('un mot sans point → recherche', () =>
    expect(interpreterSaisie('véga', DEF)).toEqual({ type: 'recherche', moteur: DEF, requete: 'véga' }))
  it('? force la recherche', () => expect(interpreterSaisie('?lyre', DEF)).toEqual({ type: 'recherche', moteur: DEF, requete: 'lyre' }))
  it('? force la recherche même pour un domaine', () =>
    expect(interpreterSaisie('? exemple.fr', DEF)).toEqual({ type: 'recherche', moteur: DEF, requete: 'exemple.fr' }))
  it('mot-clé', () => expect(interpreterSaisie('w véga', DEF)).toEqual({ type: 'recherche', moteur: 'wikipedia', requete: 'véga' }))
  it('mot-clé yt', () => expect(interpreterSaisie('yt lyre', DEF)).toEqual({ type: 'recherche', moteur: 'youtube', requete: 'lyre' }))
  it('> commande', () => expect(interpreterSaisie('>réglages', DEF)).toEqual({ type: 'commande', nom: 'réglages' }))
  it('schéma https', () => expect(interpreterSaisie('https://a.b', DEF)).toEqual({ type: 'url', url: 'https://a.b' }))
  it('lyra://', () => expect(interpreterSaisie('lyra://settings', DEF)).toEqual({ type: 'url', url: 'lyra://settings' }))
  it('file://', () => expect(interpreterSaisie('file:///tmp/a.html', DEF)).toEqual({ type: 'url', url: 'file:///tmp/a.html' }))
  it('mot-clé inconnu avec espace → recherche complète', () =>
    expect(interpreterSaisie('zz véga', DEF)).toEqual({ type: 'recherche', moteur: DEF, requete: 'zz véga' }))
})

describe('urlDeRecherche', () => {
  it('encode la requête', () =>
    expect(urlDeRecherche(moteurParId('wikipedia'), 'véga')).toBe('https://fr.wikipedia.org/w/index.php?search=v%C3%A9ga'))
})

describe('suggerer', () => {
  const etoiles = [etoile('1', 'Accueil', 'https://a.fr'), etoile('2', 'Véga — Wikipédia', 'https://fr.wikipedia.org/wiki/Véga')]
  const ctx = { etoiles, historique: [{ url: 'https://atlas.fr/vega', title: 'Véga, étoile étalon' }], moteurParDefaut: DEF }

  it('étoile ouverte en premier', () => {
    const r = suggerer('vega', ctx)
    expect(r[0]).toMatchObject({ type: 'etoile', id: '2' })
    expect(r.map((s) => s.type)).toEqual(['etoile', 'historique', 'recherche', 'recherche'])
  })
  it('la recherche suit le moteur du mot-clé', () => {
    const r = suggerer('w véga', ctx)
    const rech = r.find((s) => s.type === 'recherche')!
    expect(rech.url).toBe('https://fr.wikipedia.org/w/index.php?search=v%C3%A9ga')
  })
  it('> ne garde que les commandes', () => {
    const r = suggerer('>régl', ctx)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ type: 'commande', id: 'reglages' })
  })
  it('saisie vide : étoiles puis commandes', () => {
    const r = suggerer('', ctx)
    expect(r.map((s) => s.type)).toEqual(['etoile', 'etoile', ...Array(7).fill('commande')])
  })
  it('> déplacer : les quatre positions du ciel', () => {
    const r = suggerer('>déplacer le ciel', ctx)
    expect(r.map((s) => s.id)).toEqual(['ciel-gauche', 'ciel-droite', 'ciel-haut', 'ciel-bas'])
    expect(r[1].titre).toBe('Déplacer le ciel à droite')
    expect(r[2].titre).toBe('Déplacer le ciel en haut')
  })
  it('# filtre par constellation', () => {
    const c = { etoiles: [etoile('1', 'A', 'https://a.fr', { constellationId: 'c1' }), etoile('2', 'B', 'https://b.fr')], historique: [], moteurParDefaut: DEF,
      constellations: [{ id: 'c1', name: 'Astronomie', color: '#fff' }] }
    expect(suggerer('#astro', c).map((s) => s.id)).toEqual(['1'])
  })
  it('une URL saisie donne une ligne « aller à »', () => {
    const r = suggerer('exemple.fr', ctx)
    expect(r.find((s) => s.type === 'recherche')).toMatchObject({ url: 'https://exemple.fr' })
  })
  it('plafonné à 12', () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) => etoile(String(i), `lyre ${i}`, `https://x${i}.fr`))
    expect(suggerer('lyre', { etoiles: beaucoup, historique: [], moteurParDefaut: DEF }).length).toBeLessThanOrEqual(12)
  })
})
