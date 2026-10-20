import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { describe, expect, it } from 'vitest'
import type { RegleSite, Settings } from '../../shared/types'
import { reglagesParDefaut } from '../settings/defaults'
import { CONFIG_MOTEUR } from '../shields/engine'
import { creerShields } from '../shields/Shields'
import { creerReglesSites, type SessionRegles } from './regles'

type Sites = Record<string, RegleSite>
type Rappel = (r: Record<string, unknown>) => void
type Ecouteur = (d: Record<string, unknown>, cb: Rappel) => void
type CookieT = { domain: string; name: string; path: string; secure: boolean }
type Changement = (e: unknown, c: CookieT, cause: string, supprime: boolean) => void

const HAUT = 'https://exemple.test/page'
const UA_LYRA = 'Mozilla/5.0 (Macintosh) Chrome/152.0.0.0 Safari/537.36'

function fausseSession(cookies: Array<{ domain: string; name: string; path: string; secure: boolean }> = []) {
  const s = {
    changes: [] as Changement[],
    effaces: [] as string[],
    workers: {} as Record<number, { scope: string }>,
    avant: undefined as Ecouteur | undefined,
    envoi: undefined as Ecouteur | undefined,
    entetes: undefined as Ecouteur | undefined,
    retires: [] as string[],
    vide: 0,
    webRequest: {
      onBeforeRequest: (_f: unknown, fn: unknown) => void (s.avant = fn as Ecouteur),
      onBeforeSendHeaders: (_f: unknown, fn: unknown) => void (s.envoi = fn as Ecouteur),
      onHeadersReceived: (_f: unknown, fn: unknown) => void (s.entetes = fn as Ecouteur)
    },
    cookies: {
      get: async () => cookies,
      remove: async (url: string, nom: string) => void s.retires.push(`${url}|${nom}`),
      flushStore: async () => void s.vide++,
      on: (_evt: string, fn: Changement) => void s.changes.push(fn)
    },
    clearStorageData: async (o: { origin?: string; storages?: string[] }) => void s.effaces.push(`${o.origin}|${o.storages?.join()}`),
    serviceWorkers: { getAllRunning: () => s.workers }
  }
  return s as typeof s & SessionRegles
}
const appel = (e: Ecouteur | undefined, d: Record<string, unknown>): Record<string, unknown> => {
  let r: Record<string, unknown> | undefined
  e!(d, (x) => (r = x))
  return r!
}
const reponse = (url: string, entetes: Record<string, string[]>, o: Record<string, unknown> = {}) =>
  ({ id: 1, url, method: 'GET', resourceType: 'image', referrer: HAUT, webContents: { getURL: () => HAUT }, responseHeaders: entetes, statusCode: 200, ...o })

describe('règles par site branchées sur le hub', () => {
  it('cookies, scripts et UA coexistent sur la même session et avec Boucliers (CSP des Boucliers conservée)', () => {
    const liste = readFileSync(join(__dirname, '../shields/fixtures/mini-liste.txt'), 'utf8')
    const reglages: Settings = reglagesParDefaut('/tmp')
    reglages.sites = { 'exemple.test': { cookies: 'bloques', scripts: 'bloques', ua: 'safari' } }
    const ses = fausseSession()
    creerShields({ moteurInitial: ElectronBlocker.parse(liste, CONFIG_MOTEUR), reglages: () => reglages }).attacher(ses)
    creerReglesSites({ sites: () => reglages.sites, chrome: '152.0.7977.167' }).equiper(ses, { privee: false })
    // Un seul écouteur Electron par évènement : les Boucliers n'ont pas été écrasés.
    const doc = appel(ses.entetes, reponse('https://exemple.test/page', { 'Set-Cookie': ['a=1'], 'Content-Type': ['text/html'] }, { resourceType: 'mainFrame' }))
    expect(doc.responseHeaders).toEqual({ 'Content-Type': ['text/html'], 'Content-Security-Policy': ["script-src 'none'"] })
    const env = appel(ses.envoi, { id: 2, url: 'https://exemple.test/a', method: 'GET', resourceType: 'image', referrer: HAUT, webContents: { getURL: () => HAUT }, requestHeaders: { 'User-Agent': UA_LYRA, Cookie: 'a=1' } })
    expect(env.requestHeaders).toEqual({ 'User-Agent': expect.stringContaining('Safari/605.1.15') })
    expect(appel(ses.avant, { id: 3, url: 'https://exemple.test/', method: 'GET', resourceType: 'mainFrame', referrer: '' })).toEqual({})
  })

  it('les règles ne voient jamais les extensions (chrome-extension://) : apresBoucliers', () => {
    const ses = fausseSession()
    creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'bloques', scripts: 'bloques', ua: 'safari' } }) }).equiper(ses, { privee: false })
    const ext = reponse('chrome-extension://abcdefghijklmnopabcdefghijklmnop/page.html', { 'Set-Cookie': ['a=1'] }, { resourceType: 'mainFrame' })
    expect(appel(ses.entetes, ext)).toEqual({})
    const env = { id: 2, url: 'https://exemple.test/a', method: 'GET', resourceType: 'xhr', initiatorOrigin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', referrer: HAUT, webContents: { getURL: () => HAUT }, requestHeaders: { Cookie: 'a=1' } }
    expect(appel(ses.envoi, env)).toEqual({})
  })

  it('la suppression de la règle rend le comportement par défaut sans redémarrage', () => {
    let sites: Sites = { 'exemple.test': { cookies: 'bloques' } }
    const ses = fausseSession()
    creerReglesSites({ sites: () => sites }).equiper(ses, { privee: false })
    const d = reponse('https://exemple.test/a', { 'Set-Cookie': ['a=1'] })
    expect(appel(ses.entetes, d)).toEqual({ responseHeaders: {} })
    sites = {}
    expect(appel(ses.entetes, d)).toEqual({})
  })
})

describe('purge « Session seulement » à la fermeture', () => {
  const c = (domain: string, name: string, secure = false) => ({ domain, name, path: '/', secure })

  it('ne supprime que les cookies du site de la règle ; ceux d’un tiers (iframe) sont gardés ; puis écrit le magasin', async () => {
    const ses = fausseSession([c('.exemple.test', 'sid', true), c('.google.com', 'NID'), c('.pixel.tiers.test', 't'), c('.autre.test', 'garde')])
    const regles = creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'session' } }) })
    regles.equiper(ses, { privee: false })
    appel(ses.entetes, reponse('https://pixel.tiers.test/p.gif', { 'Set-Cookie': ['t=1'] }))
    await regles.purger(ses)
    expect(ses.retires).toEqual(['https://exemple.test/|sid'])
    expect(ses.vide).toBe(1)
  })
  it('« Session seulement » : les Set-Cookie de la page deviennent des cookies de session (Expires et Max-Age retirés), y compris en privé', () => {
    for (const privee of [false, true]) {
      const ses = fausseSession()
      creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'session' } }) }).equiper(ses, { privee })
      const r = appel(ses.entetes, reponse('https://www.exemple.test/p.gif', { 'Set-Cookie': ['t=1; Max-Age=3600; Secure'] }))
      expect(r).toEqual({ responseHeaders: { 'Set-Cookie': ['t=1; Secure'] } })
    }
  })
  it('un échec de suppression ne bloque pas la fermeture', async () => {
    const ses = fausseSession([c('.exemple.test', 'a'), c('.exemple.test', 'b')])
    ses.cookies.remove = async () => { throw new Error('boum') }
    const regles = creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'session' } }) })
    regles.equiper(ses, { privee: false })
    await expect(regles.purger(ses)).resolves.toBeUndefined()
  })
  it('sans règle « session » ni « bloqués » : aucune lecture des cookies', async () => {
    const ses = fausseSession([c('.exemple.test', 'a')])
    ses.cookies.get = async () => { throw new Error('ne doit pas être appelé') }
    const regles = creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'tous' } }) })
    await expect(regles.purger(ses)).resolves.toBeUndefined()
    expect(ses.vide).toBe(0)
  })
})

describe('« Bloqués » : cookies existants, insérés et service workers', () => {
  const c = (domain: string, name: string) => ({ domain, name, path: '/', secure: false })
  const inserer = (ses: ReturnType<typeof fausseSession>, cookie: ReturnType<typeof c>, supprime = false) => ses.changes.forEach((f) => f({}, cookie, 'explicit', supprime))
  const attendre = () => new Promise((ok) => setTimeout(ok, 0))

  it('un cookie inséré dont le site est « Bloqués » est supprimé ; autre site, « session » ou suppression : gardé', async () => {
    const ses = fausseSession()
    creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'bloques' }, 'sess.test': { cookies: 'session' } }) }).equiper(ses, { privee: false })
    inserer(ses, c('.exemple.test', 'a'))
    inserer(ses, c('autre.test', 'b'))
    inserer(ses, c('sess.test', 'd'))
    inserer(ses, c('exemple.test', 'e'), true)
    await attendre()
    expect(ses.retires).toEqual(['http://exemple.test/|a'])
  })
  it('fenêtre privée : aucun écouteur de cookies (rien n’y est écrit)', () => {
    const ses = fausseSession()
    creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'bloques' } }) }).equiper(ses, { privee: true })
    expect(ses.changes).toEqual([])
  })
  it('écriture de la règle : les cookies existants du site sont supprimés, ceux des autres sites restent', async () => {
    const ses = fausseSession([c('.exemple.test', 'a'), c('exemple.test', 'b'), c('.google.com', 'NID')])
    const regles = creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'bloques' } }) })
    regles.equiper(ses, { privee: false })
    await regles.surSitesChanges({}, { 'exemple.test': { cookies: 'bloques' } })
    expect(ses.retires.sort()).toEqual(['http://exemple.test/|a', 'http://exemple.test/|b'])
    expect(ses.vide).toBe(1)
  })
  it('écriture d’une règle sans rapport (zoom) ou règle « Bloqués » déjà connue : aucune lecture des cookies', async () => {
    const ses = fausseSession([c('exemple.test', 'a')])
    ses.cookies.get = async () => { throw new Error('ne doit pas être appelé') }
    const regles = creerReglesSites({ sites: () => ({}) })
    regles.equiper(ses, { privee: false })
    const avant = { 'exemple.test': { cookies: 'bloques' as const } }
    await regles.surSitesChanges(avant, { ...avant, 'zoom.test': { zoom: 1.5 } })
    await regles.surSitesChanges({}, { 'zoom.test': { zoom: 1.5 } })
    expect(ses.vide).toBe(0)
  })
  it('écriture d’une règle « scripts bloqués » : service workers des origines nouvellement bloquées effacés, pas ceux d’une règle déjà connue', async () => {
    const ses = fausseSession()
    const regles = creerReglesSites({ sites: () => ({}) })
    regles.equiper(ses, { privee: false })
    const avant = { 'ancien.test': { scripts: 'bloques' as const } }
    await regles.surSitesChanges(avant, { ...avant, 'exemple.test': { scripts: 'bloques' } })
    expect(ses.effaces.sort()).toEqual(['http://exemple.test|serviceworkers', 'https://exemple.test|serviceworkers'])
  })
  it('écriture d’une règle sur un motif : les workers en cours des sous-domaines concernés sont effacés', async () => {
    const ses = fausseSession()
    ses.workers = { 1: { scope: 'https://blog.exemple.test/app/' }, 2: { scope: 'https://ailleurs.test/' } }
    const regles = creerReglesSites({ sites: () => ({}) })
    regles.equiper(ses, { privee: false })
    await regles.surSitesChanges({}, { '*.exemple.test': { scripts: 'bloques' } })
    expect(ses.effaces).toEqual(['https://blog.exemple.test|serviceworkers'])
  })
  it('démarrage : cookies « session » et « bloqués » purgés, service workers des sites aux scripts bloqués effacés', async () => {
    const ses = fausseSession([c('.exemple.test', 'a'), c('sess.test', 'b'), c('.google.com', 'NID')])
    const regles = creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'bloques', scripts: 'bloques' }, 'sess.test': { cookies: 'session' } }) })
    regles.equiper(ses, { privee: false })
    await regles.demarrer(ses)
    expect(ses.retires.sort()).toEqual(['http://exemple.test/|a', 'http://sess.test/|b'])
    expect(ses.effaces.sort()).toEqual(['http://exemple.test|serviceworkers', 'https://exemple.test|serviceworkers'])
  })
  it('un échec d’effacement des workers ne casse pas le démarrage', async () => {
    const ses = fausseSession()
    ses.clearStorageData = async () => { throw new Error('boum') }
    const regles = creerReglesSites({ sites: () => ({ 'exemple.test': { scripts: 'bloques' } }) })
    await expect(regles.demarrer(ses)).resolves.toBeUndefined()
  })
})
