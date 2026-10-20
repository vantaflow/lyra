import { describe, expect, it } from 'vitest'
import type { RegleSite } from '../../shared/types'
import { AUCUNE_REGLE_PAGE, reglesDePage, urlDeFrame } from './page'

type Sites = Record<string, RegleSite>
const HAUT = 'https://exemple.test/page'

describe('urlDeFrame', () => {
  it('l’URL web de la frame, sinon l’origine héritée (about:blank, srcdoc, blob:), sinon rien (opaque)', () => {
    expect(urlDeFrame('https://a.test/x', 'https://a.test')).toBe('https://a.test/x')
    expect(urlDeFrame('about:blank', 'https://a.test')).toBe('https://a.test')
    expect(urlDeFrame('about:srcdoc', 'https://a.test')).toBe('https://a.test')
    expect(urlDeFrame('blob:https://a.test/uuid', 'https://a.test')).toBe('https://a.test')
    expect(urlDeFrame('about:blank', 'null')).toBe('')
    expect(urlDeFrame('data:text/html,x', '')).toBe('')
  })
})

describe('reglesDePage : ce que le preload d’une frame reçoit', () => {
  it('identité et cookies décidés par la règle de la page principale, frame par frame', () => {
    const sites: Sites = { 'exemple.test': { ua: 'safari', cookies: 'premiere-partie' } }
    const principale = reglesDePage(sites, HAUT, HAUT)
    expect(principale.ua).toContain('Safari/605.1.15')
    expect(principale.cookies).toBe(false)
    const tierce = reglesDePage(sites, HAUT, 'https://pixel.tiers.test/cadre')
    expect(tierce.ua).toBe(principale.ua)
    expect(tierce.cookies).toBe(true)
  })
  it('frame héritée sous un tiers : neutralisée ; sous le site : non, et l’identité suit la page principale', () => {
    const sites: Sites = { 'exemple.test': { ua: 'firefox', cookies: 'premiere-partie' } }
    expect(reglesDePage(sites, HAUT, urlDeFrame('about:blank', 'https://pixel.tiers.test')).cookies).toBe(true)
    const heritee = reglesDePage(sites, HAUT, urlDeFrame('about:blank', 'https://exemple.test'))
    expect(heritee.cookies).toBe(false)
    expect(heritee.ua).toContain('Firefox')
  })
  it('« Bloqués » : même la page principale ; sans règle : rien', () => {
    expect(reglesDePage({ 'exemple.test': { cookies: 'bloques' } }, HAUT, HAUT)).toEqual({ ...AUCUNE_REGLE_PAGE, cookies: true })
    expect(reglesDePage({}, HAUT, 'https://pixel.tiers.test/')).toEqual(AUCUNE_REGLE_PAGE)
  })
})

describe('reglesDePage : lecture automatique, style et scripts personnalisés', () => {
  const globaux = { css: 'a{margin:0}', scripts: [{ nom: 'g', code: 'window.g = 1', actif: true }] }
  const perso = (principale: boolean) => ({ globaux, principale })

  it('lecture automatique : la règle de la page principale vaut pour toutes ses frames', () => {
    const sites: Sites = { 'exemple.test': { lectureAuto: 'bloquer' } }
    expect(reglesDePage(sites, HAUT, HAUT).lecture).toContain('NotAllowedError')
    expect(reglesDePage(sites, HAUT, 'https://video.tiers.test/cadre').lecture).toContain('NotAllowedError')
    expect(reglesDePage({ 'exemple.test': { lectureAuto: 'autoriser' } }, HAUT, HAUT).lecture).toBe('')
    expect(reglesDePage({}, HAUT, HAUT).lecture).toBe('')
  })
  it('style : global + site de la frame elle-même ; une iframe tierce ne reçoit que le global', () => {
    const sites: Sites = { 'exemple.test': { style: 'body{color:red}' } }
    expect(reglesDePage(sites, HAUT, HAUT, undefined, perso(true)).style).toBe('a{margin:0}\nbody{color:red}')
    expect(reglesDePage(sites, HAUT, 'https://pixel.tiers.test/', undefined, perso(false)).style).toBe('a{margin:0}')
  })
  it('style : une frame sans origine web (opaque) ne reçoit rien', () => {
    expect(reglesDePage({}, HAUT, '', undefined, perso(false)).style).toBe('')
  })
  it('scripts : seulement pour la frame principale, globaux puis du site, actifs seulement', () => {
    const sites: Sites = { 'exemple.test': { scriptsPerso: [{ nom: 's', code: 'window.s = 1', actif: true }, { nom: 'off', code: 'x', actif: false }] } }
    expect(reglesDePage(sites, HAUT, HAUT, undefined, perso(true)).scripts.map((x) => x.nom)).toEqual(['g', 's'])
    expect(reglesDePage(sites, HAUT, 'https://exemple.test/cadre', undefined, perso(false)).scripts).toEqual([])
  })
  it('sans réglages globaux fournis : rien de personnalisé', () => {
    const r = reglesDePage({ 'exemple.test': { style: 'x', scriptsPerso: [{ nom: 's', code: 'c', actif: true }] } }, HAUT, HAUT)
    expect(r.style).toBe('')
    expect(r.scripts).toEqual([])
  })
})
