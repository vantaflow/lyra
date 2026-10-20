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
    expect(reglesDePage({ 'exemple.test': { cookies: 'bloques' } }, HAUT, HAUT)).toEqual({ ua: '', cookies: true })
    expect(reglesDePage({}, HAUT, 'https://pixel.tiers.test/')).toEqual(AUCUNE_REGLE_PAGE)
  })
})
