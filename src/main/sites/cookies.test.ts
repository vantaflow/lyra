import { describe, expect, it } from 'vitest'
import type { RegleSite } from '../../shared/types'
import type { DetailsEntetes, DetailsEnvoi } from '../session/webRequestHub'
import { cookiesAPurger, ecouteursCookies } from './cookies'

type Sites = Record<string, RegleSite>
const HAUT = 'https://exemple.test/page'

const reponse = (url: string, entetes: Record<string, string[]>, o: Record<string, unknown> = {}): DetailsEntetes =>
  ({ id: 1, url, method: 'GET', resourceType: 'image', referrer: HAUT, webContents: { getURL: () => HAUT }, responseHeaders: entetes, statusCode: 200, ...o }) as unknown as DetailsEntetes
const envoi = (url: string, entetes: Record<string, string>, o: Record<string, unknown> = {}): DetailsEnvoi =>
  ({ id: 1, url, method: 'GET', resourceType: 'image', referrer: HAUT, webContents: { getURL: () => HAUT }, requestHeaders: entetes, ...o }) as unknown as DetailsEnvoi

const avec = (cookies: RegleSite['cookies'], cle = 'exemple.test'): Sites => ({ [cle]: { cookies } })
const ecouteurs = (sites: Sites, vus: string[] = []) => ecouteursCookies({ sites: () => sites, surCookieRecu: (h) => vus.push(h) })

describe('Set-Cookie selon la règle du site de la page principale', () => {
  it('« 1re partie » : un cookie tiers est retiré, les autres en-têtes restent', () => {
    const r = ecouteurs(avec('premiere-partie')).entetes(reponse('https://pixel.tiers.test/p.gif', { 'Set-Cookie': ['t=1'], 'Content-Type': ['image/gif'] }))
    expect(r).toEqual({ responseHeaders: { 'Content-Type': ['image/gif'] } })
  })
  it('« 1re partie » : un cookie de la 1re partie (sous-domaine compris) est gardé', () => {
    const e = ecouteurs(avec('premiere-partie'))
    expect(e.entetes(reponse('https://exemple.test/a.gif', { 'set-cookie': ['p=1'] }))).toBeUndefined()
    expect(e.entetes(reponse('https://static.exemple.test/a.gif', { 'Set-Cookie': ['p=1'] }))).toBeUndefined()
  })
  it('« 1re partie » : la navigation principale est toujours 1re partie', () => {
    const d = reponse('https://exemple.test/', { 'Set-Cookie': ['p=1'] }, { resourceType: 'mainFrame', webContents: undefined, referrer: '' })
    expect(ecouteurs(avec('premiere-partie')).entetes(d)).toBeUndefined()
  })
  it('« 1re partie » : a.github.io et b.github.io sont deux sites (section privée de la PSL)', () => {
    const sites: Sites = { 'a.github.io': { cookies: 'premiere-partie' } }
    const haut = 'https://a.github.io/'
    const e = ecouteurs(sites)
    const tiers = e.entetes(reponse('https://b.github.io/p.gif', { 'Set-Cookie': ['t=1'] }, { webContents: { getURL: () => haut } }))
    expect(tiers).toEqual({ responseHeaders: {} })
    expect(e.entetes(reponse('https://cdn.a.github.io/p.gif', { 'Set-Cookie': ['t=1'] }, { webContents: { getURL: () => haut } }))).toBeUndefined()
  })
  it('« 1re partie » : a.co.uk et b.co.uk sont deux sites', () => {
    const sites: Sites = { 'a.co.uk': { cookies: 'premiere-partie' } }
    const haut = 'https://a.co.uk/'
    const e = ecouteurs(sites)
    expect(e.entetes(reponse('https://b.co.uk/p', { 'Set-Cookie': ['t=1'] }, { webContents: { getURL: () => haut } }))).toEqual({ responseHeaders: {} })
    expect(e.entetes(reponse('https://img.a.co.uk/p', { 'Set-Cookie': ['t=1'] }, { webContents: { getURL: () => haut } }))).toBeUndefined()
  })
  it('« Bloqués » : tous les Set-Cookie sont retirés, même 1re partie', () => {
    const r = ecouteurs(avec('bloques')).entetes(reponse('https://exemple.test/a.gif', { 'SET-COOKIE': ['a=1', 'b=2'], Vary: ['Accept'] }))
    expect(r).toEqual({ responseHeaders: { Vary: ['Accept'] } })
  })
  it('« Tous » ou aucune règle : rien ne change', () => {
    expect(ecouteurs(avec('tous')).entetes(reponse('https://pixel.tiers.test/p', { 'Set-Cookie': ['t=1'] }))).toBeUndefined()
    expect(ecouteurs({}).entetes(reponse('https://pixel.tiers.test/p', { 'Set-Cookie': ['t=1'] }))).toBeUndefined()
  })
  it('la règle est celle de la page principale, pas celle de la requête', () => {
    const sites: Sites = { 'exemple.test': { cookies: 'tous' }, 'pixel.tiers.test': { cookies: 'bloques' } }
    expect(ecouteurs(sites).entetes(reponse('https://pixel.tiers.test/p', { 'Set-Cookie': ['t=1'] }))).toBeUndefined()
  })
  it('la règle d’un motif *.hôte s’applique à un sous-domaine, la règle exacte la supplante', () => {
    const sites: Sites = { '*.exemple.test': { cookies: 'bloques' }, 'https://www.exemple.test': { cookies: 'tous' } }
    const d = (haut: string) => reponse('https://pixel.tiers.test/p', { 'Set-Cookie': ['t=1'] }, { webContents: { getURL: () => haut } })
    const e = ecouteurs(sites)
    expect(e.entetes(d('https://blog.exemple.test/'))).toEqual({ responseHeaders: {} })
    expect(e.entetes(d('https://www.exemple.test/'))).toBeUndefined()
  })
  it('page principale inconnue : aucun changement', () => {
    const d = reponse('https://pixel.tiers.test/p', { 'Set-Cookie': ['t=1'] }, { webContents: undefined, referrer: '' })
    expect(ecouteurs(avec('bloques')).entetes(d)).toBeUndefined()
  })
  it('sans Set-Cookie : rien à faire', () => {
    expect(ecouteurs(avec('bloques')).entetes(reponse('https://pixel.tiers.test/p', { 'Content-Type': ['image/gif'] }))).toBeUndefined()
  })
  it('« Session seulement » : les cookies sont gardés, l’hôte est signalé pour la purge', () => {
    const vus: string[] = []
    const e = ecouteurs(avec('session'), vus)
    expect(e.entetes(reponse('https://pixel.tiers.test/p', { 'Set-Cookie': ['t=1'] }))).toBeUndefined()
    expect(e.entetes(reponse('https://exemple.test/p', { 'Content-Type': ['x'] }))).toBeUndefined()
    expect(vus).toEqual(['pixel.tiers.test'])
  })
})

describe('en-tête Cookie envoyé', () => {
  it('« 1re partie » : retiré vers un tiers, gardé vers la 1re partie', () => {
    const e = ecouteurs(avec('premiere-partie'))
    expect(e.envoi(envoi('https://pixel.tiers.test/p', { Cookie: 't=1', Accept: '*/*' }))).toEqual({ requestHeaders: { Accept: '*/*' } })
    expect(e.envoi(envoi('https://exemple.test/p', { Cookie: 'p=1' }))).toBeUndefined()
  })
  it('« Bloqués » : retiré partout', () => {
    expect(ecouteurs(avec('bloques')).envoi(envoi('https://exemple.test/p', { cookie: 'p=1' }))).toEqual({ requestHeaders: {} })
  })
  it('« Tous » et « Session » : rien ne change', () => {
    expect(ecouteurs(avec('tous')).envoi(envoi('https://pixel.tiers.test/p', { Cookie: 't=1' }))).toBeUndefined()
    expect(ecouteurs(avec('session')).envoi(envoi('https://pixel.tiers.test/p', { Cookie: 't=1' }))).toBeUndefined()
  })
})

describe('purge des cookies « Session seulement »', () => {
  const c = (domain: string, name = 'n') => ({ domain, name, path: '/', secure: false })
  it('purge les cookies des hôtes signalés (domaine parent compris) et ceux d’un site à règle « session » (hôte exact : www.exemple.test n’est pas exemple.test)', () => {
    const sites: Sites = { 'exemple.test': { cookies: 'session' }, 'autre.test': { cookies: 'tous' } }
    const liste = [c('exemple.test'), c('.exemple.test'), c('www.exemple.test'), c('.pixel.tiers.test'), c('autre.test'), c('.ailleurs.test')]
    const a = cookiesAPurger(liste, sites, new Set(['pixel.tiers.test']))
    expect(a.map((x) => x.domain)).toEqual(['exemple.test', '.exemple.test', '.pixel.tiers.test'])
  })
  it('ne purge rien sans règle ni hôte signalé', () => {
    expect(cookiesAPurger([c('exemple.test')], { 'exemple.test': { cookies: 'tous' } }, new Set())).toEqual([])
  })
})
