import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EtatEtoile } from '../../shared/ipc'
import { rapport } from '../../shared/contraste'
import { THEMES, deriver } from '../../shared/themes'
import { couleurDuSite, creerLisseur, styleConstellation, teinteDuCiel } from './teinteCiel'

const etat = (extra: Partial<EtatEtoile> = {}): EtatEtoile => ({ chargement: false, titre: '', url: '', canGoBack: false, canGoForward: false, viaPasserelle: false, ...extra })
const ACTIF = { actif: true, privee: false }

describe('couleur d’une constellation (étoile active et lignes)', () => {
  it('étoile active, halos et lignes prennent Constellation.color quand elle est déjà lisible', () => {
    const s = styleConstellation('#5B8DEF', true, '#0E0E1E')!
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
  it('toujours ≥ 3:1 sur le ciel : l’or sur Sable (1,15:1) est assombri, halos compris', () => {
    for (const nom of ['sable', 'clair-total', 'indigo-nuit', 'foret'] as const) {
      for (const mode of ['clair', 'sombre'] as const) {
        const ciel = deriver(THEMES[nom].couleurs, mode)['--ciel']
        for (const couleur of ['#F4C56A', '#5B8DEF', '#E0604F', '#8A8AB0', '#FFFFFF', '#000000']) {
          const s = styleConstellation(couleur, true, ciel)!
          expect(rapport(s['--etoile-active'], ciel), `${nom} ${mode} ${couleur}`).toBeGreaterThanOrEqual(3)
          expect(s['--lignes']).toBe(s['--etoile-active'])
        }
      }
    }
    expect(rapport('#F4C56A', '#E9DEC8')).toBeLessThan(1.5)
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
  it('fondue à 18 % dans le ciel quand les textes restent lisibles ; désactivée ou sans couleur : undefined', () => {
    const v = { '--ciel': '#000000' }
    expect(teinteDuCiel(v, etat({ couleur: '#FF0000' }), ACTIF)).toBe('#2e0000')
    expect(teinteDuCiel(v, etat({ couleur: '#FF0000' }), { actif: false, privee: false })).toBeUndefined()
    expect(teinteDuCiel(v, etat(), ACTIF)).toBeUndefined()
    expect(teinteDuCiel({}, etat({ couleur: '#FF0000' }), ACTIF)).toBeUndefined()
  })
  it('jamais en fenêtre privée : le ciel privé reste celui du thème privé', () => {
    const v = deriver(THEMES.aurore.couleurs, 'clair')
    expect(teinteDuCiel(v, etat({ couleur: '#FF0000' }), { actif: true, privee: true })).toBeUndefined()
    expect(teinteDuCiel(v, etat({ couleur: '#112233' }), ACTIF)).toBeDefined()
  })
  it('theme-color #FFFFFF et #000000 : les textes du ciel restent lisibles (4,5:1 texte, étoiles, Boucliers ; 3:1 libellés) ou pas de teinte', () => {
    let teintes = 0
    for (const nom of ['indigo-nuit', 'foret', 'sable', 'clair-total'] as const) {
      for (const mode of ['clair', 'sombre'] as const) {
        const v = deriver(THEMES[nom].couleurs, mode)
        for (const site of ['#FFFFFF', '#000000']) {
          const t = teinteDuCiel(v, etat({ couleur: site }), ACTIF)
          if (!t) continue
          teintes++
          for (const [n, seuil] of [['--ciel-texte', 4.5], ['--etoiles', 4.5], ['--bouclier-ciel', 4.5], ['--libelles-ciel', 3], ['--libelles-groupe', 3]] as const)
            expect(rapport(v[n], t), `${nom} ${mode} ${site} ${n}`).toBeGreaterThanOrEqual(seuil)
        }
      }
    }
    expect(teintes).toBeGreaterThan(0)
  })
  it('réduit la part au besoin : un texte du ciel à la limite empêche 18 % mais pas 3 %', () => {
    const v = { '--ciel': '#000000', '--etoiles': '#808080' } // #808080 sur noir ≈ 5,3:1
    const t = teinteDuCiel(v, etat({ couleur: '#FFFFFF' }), ACTIF)!
    expect(t).not.toBe('#2e2e2e') // 18 % de blanc : 4,2:1, refusé
    expect(rapport('#808080', t)).toBeGreaterThanOrEqual(4.5)
    expect(teinteDuCiel({ '--ciel': '#000000', '--etoiles': '#6e6e6e' }, etat({ couleur: '#FFFFFF' }), ACTIF)).toBeUndefined() // aucune part ne convient
  })
})

describe('lisseur : au plus un changement par seconde', () => {
  beforeEach(() => vi.useFakeTimers({ now: 0 }))
  afterEach(() => vi.useRealTimers())
  it('la première valeur est immédiate, une rafale ne change que la dernière valeur, une fois par seconde', () => {
    const vues: Array<string | undefined> = []
    const viser = creerLisseur<string | undefined>((v) => vues.push(v))
    viser('#111111')
    expect(vues).toEqual(['#111111'])
    for (const c of ['#222222', '#333333', '#444444', '#555555']) {
      vi.advanceTimersByTime(100)
      viser(c)
    }
    expect(vues).toEqual(['#111111']) // 400 ms : rien d'autre n'est affiché
    vi.advanceTimersByTime(600)
    expect(vues).toEqual(['#111111', '#555555'])
    vi.advanceTimersByTime(5000)
    viser('#666666')
    expect(vues.at(-1)).toBe('#666666') // plus d'une seconde écoulée : immédiat
    viser('#666666')
    expect(vues).toHaveLength(3)
  })
  it('revenir à la valeur affichée pendant le délai n’affiche rien', () => {
    const vues: string[] = []
    const viser = creerLisseur<string>((v) => vues.push(v))
    viser('a')
    vi.advanceTimersByTime(200)
    viser('b')
    viser('a')
    vi.advanceTimersByTime(2000)
    expect(vues).toEqual(['a'])
  })
})
