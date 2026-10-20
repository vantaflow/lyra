import { describe, expect, it } from 'vitest'
import type { RegleSite } from '../../shared/types'
import type { DetailsEntetes } from '../session/webRequestHub'
import { CSP_SANS_SCRIPT, ecouteurScripts, originesScriptsBloques } from './scripts'

type Sites = Record<string, RegleSite>
const HAUT = 'https://exemple.test/page'
const reponse = (url: string, entetes: Record<string, string[]>, o: Record<string, unknown> = {}): DetailsEntetes =>
  ({ id: 1, url, method: 'GET', resourceType: 'mainFrame', referrer: '', webContents: { getURL: () => HAUT }, responseHeaders: entetes, statusCode: 200, ...o }) as unknown as DetailsEntetes
const bloques: Sites = { 'exemple.test': { scripts: 'bloques' } }

describe('scripts « Bloqués » : Content-Security-Policy script-src \'none\'', () => {
  it('ajoute la CSP à la page principale', () => {
    const r = ecouteurScripts({ sites: () => bloques })(reponse('https://exemple.test/page', { 'Content-Type': ['text/html'] }))
    expect(CSP_SANS_SCRIPT).toBe("script-src 'none'")
    expect(r).toEqual({ responseHeaders: { 'Content-Type': ['text/html'], 'Content-Security-Policy': ["script-src 'none'"] } })
  })
  it('se cumule avec la CSP du site (valeur ajoutée, jamais fusionnée ni écrasée), quelle que soit la casse', () => {
    const csp = "default-src 'self'; script-src 'unsafe-inline' 'self'"
    const r = ecouteurScripts({ sites: () => bloques })(reponse('https://exemple.test/page', { 'content-security-policy': [csp] }))
    expect(r).toEqual({ responseHeaders: { 'content-security-policy': [csp, "script-src 'none'"] } })
  })
  it('s’applique aussi aux iframes de la page (règle de la page principale)', () => {
    const d = reponse('https://tiers.test/cadre', {}, { resourceType: 'subFrame' })
    expect(ecouteurScripts({ sites: () => bloques })(d)).toEqual({ responseHeaders: { 'Content-Security-Policy': ["script-src 'none'"] } })
  })
  it('ne touche ni les sous-ressources ni les sites « Autorisés » ou sans règle', () => {
    const e = ecouteurScripts({ sites: () => bloques })
    expect(e(reponse('https://exemple.test/a.js', {}, { resourceType: 'script' }))).toBeUndefined()
    expect(ecouteurScripts({ sites: () => ({ 'exemple.test': { scripts: 'autorises' } }) })(reponse('https://exemple.test/page', {}))).toBeUndefined()
    expect(ecouteurScripts({ sites: () => ({}) })(reponse('https://exemple.test/page', {}))).toBeUndefined()
  })
  it('ne touche que http(s) : file://, data: et pages internes n’ont pas d’en-têtes de réponse réseau', () => {
    const e = ecouteurScripts({ sites: () => ({ 'file://': { scripts: 'bloques' } }) })
    expect(e(reponse('file:///tmp/a.html', {}, { webContents: { getURL: () => 'file:///tmp/a.html' } }))).toBeUndefined()
  })
  it('la règle exacte supplante le motif *.hôte', () => {
    const sites: Sites = { '*.exemple.test': { scripts: 'bloques' }, 'https://www.exemple.test': { scripts: 'autorises' } }
    const e = ecouteurScripts({ sites: () => sites })
    expect(e(reponse('https://blog.exemple.test/', {}))).toBeDefined()
    expect(e(reponse('https://www.exemple.test/', {}))).toBeUndefined()
  })
})

describe('origines dont les service workers installés sont effacés', () => {
  it('hôte nu : https et http ; origine exacte : elle seule (schéma et port compris) ; « Autorisés » et autres champs : rien', () => {
    const sites: Sites = {
      'exemple.test': { scripts: 'bloques' },
      'http://127.0.0.1:8123': { scripts: 'bloques' },
      'https://autre.test:8443': { scripts: 'bloques' },
      'libre.test': { scripts: 'autorises' },
      'zoom.test': { zoom: 1.25 },
      'file://': { scripts: 'bloques' }
    }
    expect(originesScriptsBloques(sites)).toEqual(['http://127.0.0.1:8123', 'http://exemple.test', 'https://autre.test:8443', 'https://exemple.test'])
  })
  it('motif *.hôte : couvert par les workers en cours (seule liste disponible), seulement si la règle effective est « Bloqués »', () => {
    const sites: Sites = { '*.exemple.test': { scripts: 'bloques' }, 'https://www.exemple.test': { scripts: 'autorises' } }
    expect(originesScriptsBloques(sites)).toEqual([])
    expect(originesScriptsBloques(sites, ['https://blog.exemple.test', 'https://www.exemple.test', 'https://ailleurs.test', 'https://exemple.test'])).toEqual(['https://blog.exemple.test'])
  })
  it('une règle plus précise « Autorisés » retire l’origine ; pas de doublon, ordre stable', () => {
    const sites: Sites = { 'exemple.test': { scripts: 'bloques' }, 'https://exemple.test': { scripts: 'autorises' } }
    expect(originesScriptsBloques(sites, ['https://exemple.test', 'http://exemple.test'])).toEqual(['http://exemple.test'])
  })
  it('origines connues invalides ignorées', () => {
    expect(originesScriptsBloques({ 'exemple.test': { scripts: 'bloques' } }, ['chrome-extension://abc', 'pas une url'])).toEqual(['http://exemple.test', 'https://exemple.test'])
  })
})
