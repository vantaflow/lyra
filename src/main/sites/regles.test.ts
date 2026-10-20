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

const HAUT = 'https://exemple.test/page'
const UA_LYRA = 'Mozilla/5.0 (Macintosh) Chrome/152.0.0.0 Safari/537.36'

function fausseSession(cookies: Array<{ domain: string; name: string; path: string; secure: boolean }> = []) {
  const s = {
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
      flushStore: async () => void s.vide++
    }
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

  it('supprime les cookies des hôtes qui en ont posé sous une page « Session seulement », puis écrit le magasin', async () => {
    const ses = fausseSession([c('.exemple.test', 'sid', true), c('.pixel.tiers.test', 't'), c('.autre.test', 'garde')])
    const regles = creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'session' } }) })
    regles.equiper(ses, { privee: false })
    appel(ses.entetes, reponse('https://pixel.tiers.test/p.gif', { 'Set-Cookie': ['t=1'] }))
    await regles.purger(ses)
    expect(ses.retires.sort()).toEqual(['http://pixel.tiers.test/|t', 'https://exemple.test/|sid'])
    expect(ses.vide).toBe(1)
  })
  it('fenêtre privée : rien n’est programmé (session en mémoire, aucune écriture)', async () => {
    const ses = fausseSession([c('.pixel.tiers.test', 't')])
    const regles = creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'session' } }) })
    regles.equiper(ses, { privee: true })
    appel(ses.entetes, reponse('https://pixel.tiers.test/p.gif', { 'Set-Cookie': ['t=1'] }))
    await regles.purger(ses)
    expect(ses.retires).toEqual([])
  })
  it('un échec de suppression ne bloque pas la fermeture', async () => {
    const ses = fausseSession([c('.exemple.test', 'a'), c('.exemple.test', 'b')])
    ses.cookies.remove = async () => { throw new Error('boum') }
    const regles = creerReglesSites({ sites: () => ({ 'exemple.test': { cookies: 'session' } }) })
    regles.equiper(ses, { privee: false })
    await expect(regles.purger(ses)).resolves.toBeUndefined()
  })
})
