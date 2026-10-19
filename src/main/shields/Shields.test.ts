import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { CONFIG_MOTEUR } from './engine'
import { creerShields, origineDe, type SessionShields, type Shields } from './Shields'
import type { Settings } from '../../shared/types'
import { reglagesParDefaut } from '../settings/defaults'

type Rappel = (reponse: { cancel?: boolean; redirectURL?: string; responseHeaders?: Record<string, string[]> }) => void
type Ecouteur = (details: Record<string, unknown>, cb: Rappel) => void

const liste = readFileSync(join(__dirname, 'fixtures/mini-liste.txt'), 'utf8')
const moteurFixture = (): ElectronBlocker => ElectronBlocker.parse(liste, CONFIG_MOTEUR)

function fausseSession(): SessionShields & { avant?: Ecouteur; entetes?: Ecouteur } {
  const s: SessionShields & { avant?: Ecouteur; entetes?: Ecouteur } = {
    webRequest: {
      onBeforeRequest: (_f: unknown, fn: unknown) => void (s.avant = fn as Ecouteur),
      onHeadersReceived: (_f: unknown, fn: unknown) => void (s.entetes = fn as Ecouteur)
    }
  }
  return s
}

const requete = (url: string, o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  url,
  method: 'GET',
  resourceType: 'script',
  referrer: 'https://site.test/',
  webContentsId: 7,
  webContents: { getURL: () => 'https://site.test/page' },
  timestamp: 0,
  uploadData: [],
  ...o
})

function envoyer(s: ReturnType<typeof fausseSession>, details: Record<string, unknown>): Parameters<Rappel>[0] {
  let reponse: Parameters<Rappel>[0] | undefined
  s.avant!(details, (r) => (reponse = r))
  return reponse!
}

let reglages: Settings
let shields: Shields
let ses: ReturnType<typeof fausseSession>

beforeEach(() => {
  reglages = reglagesParDefaut('/tmp')
  shields = creerShields({ moteurInitial: moteurFixture(), reglages: () => reglages })
  ses = fausseSession()
  shields.attacher(ses)
})

describe('Shields garde', () => {
  it('annule avant le moteur, sous-ressources et cadre principal, même Boucliers désactivés', () => {
    const vus: string[] = []
    const s = creerShields({
      moteurInitial: moteurFixture(),
      reglages: () => ({ ...reglages, sites: { 'https://site.test': { boucliers: false } } }),
      garde: (d) => {
        vus.push(d.url)
        return d.url.startsWith('http://clair.test')
      }
    })
    const f = fausseSession()
    s.attacher(f)
    expect(envoyer(f, requete('http://clair.test/x.js'))).toEqual({ cancel: true })
    expect(envoyer(f, requete('http://clair.test/', { resourceType: 'mainFrame' }))).toEqual({ cancel: true })
    expect(envoyer(f, requete('https://site.test/app.js'))).toEqual({})
    expect(vus).toHaveLength(3)
    expect(s.bloques(7)).toBe(0)
  })
})

describe('Shields.attacher', () => {
  it('annule une requête de pub', () => {
    expect(envoyer(ses, requete('https://ads.exemple.test/pub.js'))).toEqual({ cancel: true })
  })

  it('laisse passer une requête ordinaire', () => {
    expect(envoyer(ses, requete('https://site.test/app.js'))).toEqual({})
  })

  it("n'interrompt jamais une requête d'extension", () => {
    expect(envoyer(ses, requete('https://ads.exemple.test/pub.js', { initiatorOrigin: 'chrome-extension://abc' }))).toEqual({})
    expect(envoyer(ses, requete('chrome-extension://abc/ads.exemple.test/pub.js'))).toEqual({})
    expect(shields.bloques(7)).toBe(0)
  })

  it('ne bloque jamais la navigation principale', () => {
    expect(envoyer(ses, requete('https://ads.exemple.test/', { resourceType: 'mainFrame' }))).toEqual({})
  })

  it('compte les blocages par webContentsId et garde les dernières URL', () => {
    envoyer(ses, requete('https://ads.exemple.test/a.js'))
    envoyer(ses, requete('https://ads.exemple.test/b.js'))
    envoyer(ses, requete('https://ads.exemple.test/c.js', { webContentsId: 9 }))
    expect(shields.bloques(7)).toBe(2)
    expect(shields.bloques(9)).toBe(1)
    expect(shields.dernieres(7)).toEqual(['https://ads.exemple.test/b.js', 'https://ads.exemple.test/a.js'])
    expect(shields.semaine()).toBe(3)
  })

  it("remet le compteur à zéro à la navigation principale de l'onglet", () => {
    envoyer(ses, requete('https://ads.exemple.test/a.js'))
    envoyer(ses, requete('https://site.test/', { resourceType: 'mainFrame' }))
    expect(shields.bloques(7)).toBe(0)
  })

  it('ne bloque rien sur un site dont le bouclier est désactivé', () => {
    reglages = { ...reglages, sites: { 'https://site.test': { boucliers: false } } }
    expect(shields.estActif('https://site.test')).toBe(false)
    expect(envoyer(ses, requete('https://ads.exemple.test/pub.js'))).toEqual({})
    expect(shields.bloques(7)).toBe(0)
    // Le site de premier niveau compte, pas le référent d'une iframe.
    expect(envoyer(ses, requete('https://ads.exemple.test/pub.js', { referrer: 'https://autre.test/' }))).toEqual({})
  })

  it('désactivation par file:// pour les pages locales', () => {
    reglages = { ...reglages, sites: { 'file://': { boucliers: false } } }
    const local = { webContents: { getURL: () => 'file:///tmp/pub.html' }, referrer: '' }
    expect(envoyer(ses, requete('https://ads.exemple.test/pub.js', local))).toEqual({})
  })

  it('remplace le moteur à chaud', () => {
    shields.remplacerMoteur(ElectronBlocker.parse('||autre-pub.test^', CONFIG_MOTEUR))
    expect(envoyer(ses, requete('https://ads.exemple.test/pub.js'))).toEqual({})
    expect(envoyer(ses, requete('https://autre-pub.test/x.js'))).toEqual({ cancel: true })
  })

  it('notifie le changement de compteur', () => {
    const vus: number[] = []
    shields = creerShields({ moteurInitial: moteurFixture(), reglages: () => reglages, onCompteur: (id) => vus.push(id) })
    shields.attacher(ses)
    envoyer(ses, requete('https://ads.exemple.test/a.js'))
    expect(vus).toEqual([7])
  })
})

describe('Shields CSP', () => {
  const reponse = (moteur: ElectronBlocker, entetes: Record<string, string[]>) => {
    const sh = creerShields({ moteurInitial: moteur, reglages: () => reglages })
    const s = fausseSession()
    sh.attacher(s)
    let r: Parameters<Rappel>[0] | undefined
    s.entetes!(requete('https://site.test/', { resourceType: 'mainFrame', responseHeaders: entetes }), (x) => (r = x))
    return r!
  }
  const csp = () => ElectronBlocker.parse('||site.test^$csp=script-src-elem none', CONFIG_MOTEUR)

  it('ajoute la politique du moteur comme valeur séparée, sans toucher celles du site', () => {
    const r = reponse(csp(), { 'Content-Security-Policy': ["default-src 'self'"], 'X-Autre': ['1'] })
    expect(r.responseHeaders).toEqual({
      'Content-Security-Policy': ["default-src 'self'", 'script-src-elem none'],
      'X-Autre': ['1']
    })
  })

  it('crée l’en-tête si le site n’en a pas', () => {
    expect(reponse(csp(), {}).responseHeaders).toEqual({ 'Content-Security-Policy': ['script-src-elem none'] })
  })

  it('ne touche à rien sans directive du moteur', () => {
    expect(reponse(moteurFixture(), { 'content-security-policy': ["default-src 'self'"] })).toEqual({})
  })
})

describe('Shields cosmétique', () => {
  it('styles du site, vides si le bouclier est désactivé', () => {
    expect(shields.styles({ url: 'https://exemple.test/', urlPremierNiveau: 'https://exemple.test/' })).toContain('.bandeau-pub')
    reglages = { ...reglages, sites: { 'https://exemple.test': { boucliers: false } } }
    expect(shields.styles({ url: 'https://exemple.test/', urlPremierNiveau: 'https://exemple.test/' })).toBe('')
  })

  it('pas de scriptlets hors http(s)', () => {
    expect(shields.scriptlets('file:///tmp/a.html', 'file:///tmp/a.html')).toEqual([])
  })
})

describe('origineDe', () => {
  it('normalise les origines', () => {
    expect(origineDe('https://www.youtube.com/watch?v=x')).toBe('https://www.youtube.com')
    expect(origineDe('file:///tmp/a.html')).toBe('file://')
    expect(origineDe('pas une url')).toBe('')
  })
})
