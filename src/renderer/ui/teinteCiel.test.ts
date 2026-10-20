import { describe, expect, it } from 'vitest'
import type { EtatEtoile } from '../../shared/ipc'
import { couleurDuSite, styleConstellation, teinteDuCiel } from './teinteCiel'

const etat = (extra: Partial<EtatEtoile> = {}): EtatEtoile => ({ chargement: false, titre: '', url: '', canGoBack: false, canGoForward: false, viaPasserelle: false, ...extra })

describe('couleur d’une constellation (étoile active et lignes)', () => {
  it('étoile active, halos et lignes prennent Constellation.color', () => {
    const s = styleConstellation('#5B8DEF', true)!
    expect(s['--etoile-active']).toBe('#5B8DEF')
    expect(s['--lignes']).toBe('#5B8DEF')
    expect(s['--halo-etoile']).toBe('rgba(91,141,239,0.7)')
    expect(s['--halo-anneau']).toBe('rgba(91,141,239,0.22)')
  })
  it('réglage désactivé ou couleur invalide : aucun style', () => {
    expect(styleConstellation('#5B8DEF', false)).toBeUndefined()
    expect(styleConstellation('rouge', true)).toBeUndefined()
    expect(styleConstellation('url(x)', true)).toBeUndefined()
  })
})

describe('teinte du site actif', () => {
  it('theme-color d’abord, sinon le favicon en cache, sinon rien', () => {
    expect(couleurDuSite(etat({ couleur: '#112233', teinteFavicon: '#445566' }))).toBe('#112233')
    expect(couleurDuSite(etat({ teinteFavicon: '#445566' }))).toBe('#445566')
    expect(couleurDuSite(etat())).toBeNull()
    expect(couleurDuSite(undefined)).toBeNull()
  })
  it('une couleur de page invalide (theme-color rgb(), texte) est ignorée', () => {
    expect(couleurDuSite(etat({ couleur: 'rgb(1,2,3)', teinteFavicon: '#445566' }))).toBe('#445566')
  })
  it('fondue à 18 % dans le ciel ; désactivée : aucun changement', () => {
    expect(teinteDuCiel('#000000', etat({ couleur: '#FF0000' }), true)).toBe('#2e0000')
    expect(teinteDuCiel('#000000', etat({ couleur: '#FF0000' }), false)).toBeUndefined()
    expect(teinteDuCiel('#000000', etat(), true)).toBeUndefined()
  })
})
