import { describe, expect, it } from 'vitest'
import type { RegleSite } from '../../shared/types'
import type { DetailsEntetes, DetailsEnvoi } from '../session/webRequestHub'
import { cookiesAPurger, cookiesJsNeutralises, cookiesVises, ecouteursCookies, MODE_BLOQUES, sansExpiration, urlDuCookie } from './cookies'

type Sites = Record<string, RegleSite>
const HAUT = 'https://exemple.test/page'

const reponse = (url: string, entetes: Record<string, string[]>, o: Record<string, unknown> = {}): DetailsEntetes =>
  ({ id: 1, url, method: 'GET', resourceType: 'image', referrer: HAUT, webContents: { getURL: () => HAUT }, responseHeaders: entetes, statusCode: 200, ...o }) as unknown as DetailsEntetes
const envoi = (url: string, entetes: Record<string, string>, o: Record<string, unknown> = {}): DetailsEnvoi =>
  ({ id: 1, url, method: 'GET', resourceType: 'image', referrer: HAUT, webContents: { getURL: () => HAUT }, requestHeaders: entetes, ...o }) as unknown as DetailsEnvoi

const avec = (cookies: RegleSite['cookies'], cle = 'exemple.test'): Sites => ({ [cle]: { cookies } })
const MAINTENANT = Date.parse('2026-10-20T12:00:00Z')
const ecouteurs = (sites: Sites) => ecouteursCookies({ sites: () => sites, maintenant: () => MAINTENANT })

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
  it('« Session seulement » : les Set-Cookie (tiers compris) perdent Expires et Max-Age, rien d’autre ne change', () => {
    const e = ecouteurs(avec('session'))
    expect(e.entetes(reponse('https://pixel.tiers.test/p', { 'Set-Cookie': ['t=1; Max-Age=3600; Path=/; Secure', 'u=2; Expires=Wed, 21 Oct 2037 07:28:00 GMT; HttpOnly'], Vary: ['Accept'] }))).toEqual({
      responseHeaders: { 'Set-Cookie': ['t=1; Path=/; Secure', 'u=2; HttpOnly'], Vary: ['Accept'] }
    })
    expect(e.entetes(reponse('https://exemple.test/p', { 'set-cookie': ['p=1; max-age=60'] }))).toEqual({ responseHeaders: { 'set-cookie': ['p=1'] } })
  })
  it('« Session seulement » : rien à changer sans Set-Cookie ou sans date ; une suppression par le serveur est conservée', () => {
    const e = ecouteurs(avec('session'))
    expect(e.entetes(reponse('https://exemple.test/p', { 'Content-Type': ['x'] }))).toBeUndefined()
    expect(e.entetes(reponse('https://exemple.test/p', { 'Set-Cookie': ['s=1; Path=/'] }))).toBeUndefined()
    expect(e.entetes(reponse('https://exemple.test/p', { 'Set-Cookie': ['s=; Max-Age=0'] }))).toBeUndefined()
  })
})

describe('sansExpiration', () => {
  it('retire Max-Age et Expires, quelle que soit la casse, et garde les autres attributs dans l’ordre', () => {
    expect(sansExpiration('a=b; Path=/; MAX-AGE=10; SameSite=None; Secure', MAINTENANT)).toBe('a=b; Path=/; SameSite=None; Secure')
    expect(sansExpiration('a=b; expires=Wed, 21 Oct 2037 07:28:00 GMT; Path=/', MAINTENANT)).toBe('a=b; Path=/')
    expect(sansExpiration('a=b; Max-Age=10; Expires=Wed, 21 Oct 2037 07:28:00 GMT', MAINTENANT)).toBe('a=b')
  })
  it('un cookie qui s’expire (Max-Age ≤ 0 ou Expires passé) reste une suppression, Max-Age l’emporte sur Expires', () => {
    for (const v of ['a=; Max-Age=0', 'a=; Max-Age=-1', 'a=; Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'a=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0']) expect(sansExpiration(v, MAINTENANT)).toBe(v)
    expect(sansExpiration('a=b; Max-Age=10; Expires=Thu, 01 Jan 1970 00:00:00 GMT', MAINTENANT)).toBe('a=b')
    expect(sansExpiration('a=b; Max-Age=0; Expires=Wed, 21 Oct 2037 07:28:00 GMT', MAINTENANT)).toBe('a=b; Max-Age=0; Expires=Wed, 21 Oct 2037 07:28:00 GMT')
  })
  it('une valeur contenant « = » ou une date illisible ne casse rien', () => {
    expect(sansExpiration('a=x=y==; Max-Age=5', MAINTENANT)).toBe('a=x=y==')
    expect(sansExpiration('a=b; Expires=n’importe quoi', MAINTENANT)).toBe('a=b')
  })
})

describe('cookies JavaScript neutralisés (par frame)', () => {
  const HAUT_URL = 'https://exemple.test/page'
  it('« 1re partie » : une iframe tierce, oui ; la page elle-même et ses iframes du même site, non', () => {
    const sites = avec('premiere-partie')
    expect(cookiesJsNeutralises(sites, HAUT_URL, 'https://pixel.tiers.test/cadre')).toBe(true)
    expect(cookiesJsNeutralises(sites, HAUT_URL, HAUT_URL)).toBe(false)
    expect(cookiesJsNeutralises(sites, HAUT_URL, 'https://static.exemple.test/cadre')).toBe(false)
  })
  it('« 1re partie » : une frame sans origine web (opaque) est neutralisée, une frame héritée a l’origine de son créateur', () => {
    const sites = avec('premiere-partie')
    expect(cookiesJsNeutralises(sites, HAUT_URL, '')).toBe(true)
    expect(cookiesJsNeutralises(sites, HAUT_URL, 'https://pixel.tiers.test')).toBe(true)
    expect(cookiesJsNeutralises(sites, HAUT_URL, 'https://exemple.test')).toBe(false)
  })
  it('« Bloqués » : toutes les frames, la page principale comprise', () => {
    const sites = avec('bloques')
    expect(cookiesJsNeutralises(sites, HAUT_URL, HAUT_URL)).toBe(true)
    expect(cookiesJsNeutralises(sites, HAUT_URL, 'https://pixel.tiers.test/cadre')).toBe(true)
  })
  it('« Tous », « Session », aucune règle, autre site : jamais', () => {
    for (const sites of [avec('tous'), avec('session'), {}, avec('bloques', 'autre.test')]) expect(cookiesJsNeutralises(sites, HAUT_URL, 'https://pixel.tiers.test/cadre')).toBe(false)
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

describe('cookies visés par une règle « Session seulement » ou « Bloqués »', () => {
  const c = (domain: string, name = 'n') => ({ domain, name, path: '/', secure: false })
  it('ne vise que les cookies du site de la règle : ceux d’un tiers (iframe) ne sont jamais purgés', () => {
    const sites: Sites = { 'exemple.test': { cookies: 'session' }, 'autre.test': { cookies: 'tous' } }
    const liste = [c('exemple.test'), c('.exemple.test'), c('www.exemple.test'), c('.google.com'), c('.pixel.tiers.test'), c('autre.test')]
    expect(cookiesAPurger(liste, sites).map((x) => x.domain)).toEqual(['exemple.test', '.exemple.test'])
  })
  it('un cookie de domaine d’un parent est visé si la règle du parent est elle-même visée', () => {
    const sites: Sites = { 'www.exemple.test': { cookies: 'bloques' }, 'exemple.test': { cookies: 'bloques' } }
    expect(cookiesAPurger([c('.exemple.test'), c('exemple.test'), c('www.exemple.test'), c('api.www.exemple.test')], sites).map((x) => x.domain)).toEqual(['.exemple.test', 'exemple.test', 'www.exemple.test'])
  })
  it('un cookie de domaine d’un parent sans règle est épargné (posé par un autre sous-domaine), comme un cookie hôte d’un parent ou d’un sous-domaine', () => {
    const sites: Sites = { 'www.exemple.test': { cookies: 'bloques' } }
    expect(cookiesAPurger([c('.exemple.test'), c('exemple.test'), c('www.exemple.test'), c('api.www.exemple.test')], sites).map((x) => x.domain)).toEqual(['www.exemple.test'])
    expect(cookiesAPurger([c('.exemple.test')], { 'www.exemple.test': { cookies: 'bloques' }, 'exemple.test': { cookies: 'tous' } })).toEqual([])
  })
  it('les règles par origine http:// et avec port comptent (cookies sans schéma ni port)', () => {
    const sites: Sites = { 'http://127.0.0.1:8123': { cookies: 'session' }, 'https://exemple.test:8443': { cookies: 'bloques' } }
    expect(cookiesAPurger([c('127.0.0.1'), c('exemple.test'), c('ailleurs.test')], sites).map((x) => x.domain)).toEqual(['127.0.0.1', 'exemple.test'])
  })
  it('un motif *.hôte vise les sous-domaines (et le cookie de domaine du motif), pas l’hôte nu', () => {
    const sites: Sites = { '*.exemple.test': { cookies: 'bloques' } }
    expect(cookiesAPurger([c('blog.exemple.test'), c('.exemple.test'), c('exemple.test'), c('autre.test')], sites).map((x) => x.domain)).toEqual(['blog.exemple.test', '.exemple.test'])
  })
  it('une règle plus précise qui contredit « session » ou « bloqués » l’emporte', () => {
    const sites: Sites = { '*.exemple.test': { cookies: 'bloques' }, 'https://www.exemple.test': { cookies: 'tous' } }
    expect(cookiesAPurger([c('www.exemple.test'), c('blog.exemple.test')], sites).map((x) => x.domain)).toEqual(['blog.exemple.test'])
  })
  it('« Tous », « 1re partie » ou sans règle : rien n’est purgé', () => {
    expect(cookiesAPurger([c('exemple.test')], { 'exemple.test': { cookies: 'tous' } })).toEqual([])
    expect(cookiesAPurger([c('exemple.test')], { 'exemple.test': { cookies: 'premiere-partie' } })).toEqual([])
    expect(cookiesAPurger([c('exemple.test')], {})).toEqual([])
  })
  it('seul « Bloqués » vise un cookie inséré (écouteur `changed`) : « Session seulement » le garde', () => {
    expect(cookiesVises([c('exemple.test')], { 'exemple.test': { cookies: 'bloques' } }, MODE_BLOQUES)).toHaveLength(1)
    expect(cookiesVises([c('exemple.test')], { 'exemple.test': { cookies: 'session' } }, MODE_BLOQUES)).toEqual([])
  })
  it('un cookie sans domaine n’est jamais visé ; l’adresse de suppression vient du domaine, du chemin et de secure', () => {
    expect(cookiesAPurger([{ name: 'x' }], { 'exemple.test': { cookies: 'bloques' } })).toEqual([])
    expect(urlDuCookie({ domain: '.exemple.test', name: 'x', path: '/a', secure: true })).toBe('https://exemple.test/a')
    expect(urlDuCookie({ domain: 'exemple.test', name: 'x' })).toBe('http://exemple.test/')
  })
})
