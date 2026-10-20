import { describe, it, expect } from 'vitest'
import { cleDe, resoudre, ResolveurSites } from './sites'
import { validerSettings, validerPatch } from './validate'
import { reglagesParDefaut } from './defaults'
import { fusion } from './store'
import { creerShields } from '../shields/Shields'
import type { RegleSite, Settings } from '../../shared/types'
import { ElectronBlocker } from '@ghostery/adblocker-electron'

describe('cleDe', () => {
  it('reconnaît origine, hôte et motif', () => {
    expect(cleDe('https://Exemple.net:8443')).toEqual({ type: 'origine', valeur: 'https://exemple.net:8443' })
    expect(cleDe('file://')).toEqual({ type: 'origine', valeur: 'file://' })
    expect(cleDe('youtube.com')).toEqual({ type: 'hote', valeur: 'youtube.com' })
    expect(cleDe('*.exemple.net')).toEqual({ type: 'motif', valeur: 'exemple.net' })
  })
  it('refuse le reste', () => {
    for (const k of ['*', 'a b', '', '*.', '*.*.a.b', 'a..b', 'https://', '*exemple.net', 'x'.repeat(400)]) expect(cleDe(k)).toBeNull()
  })
})

describe('resoudre', () => {
  const sites: Record<string, RegleSite> = {
    '*.exemple.net': { cookies: 'bloques', zoom: 1.5, boucliers: 'strict' },
    'exemple.net': { zoom: 1.25 },
    'https://a.exemple.net': { zoom: 2 }
  }
  it('la plus précise gagne, champ par champ', () => {
    const r = resoudre(sites, 'https://a.exemple.net/page')
    expect(r.zoom).toBe(2)
    expect(r.cookies).toBe('bloques')
    expect(r.boucliers).toBe('strict')
  })
  it('hôte nu = hôte exact, motif ne couvre pas la racine', () => {
    expect(resoudre({ 'youtube.com': { zoom: 2 } }, 'https://www.youtube.com/').zoom).toBeUndefined()
    expect(resoudre({ 'youtube.com': { zoom: 2 } }, 'https://youtube.com/').zoom).toBe(2)
    expect(resoudre({ '*.exemple.net': { zoom: 2 } }, 'https://a.b.exemple.net/').zoom).toBe(2)
    expect(resoudre({ '*.exemple.net': { zoom: 2 } }, 'https://exemple.net/').zoom).toBeUndefined()
  })
  it('motif le plus long gagne ; origine avec port distincte', () => {
    const s = { '*.net': { zoom: 1.1 }, '*.exemple.net': { zoom: 1.2 } }
    expect(resoudre(s, 'https://x.exemple.net').zoom).toBe(1.2)
    const p = { 'https://localhost:3000': { zoom: 2 } }
    expect(resoudre(p, 'http://localhost:3000/x').zoom).toBeUndefined() // http != https
    expect(resoudre({ 'http://localhost:3000': { zoom: 2 } }, 'http://localhost:3000/x').zoom).toBe(2)
    expect(resoudre({ 'http://localhost:3000': { zoom: 2 } }, 'http://localhost:4000/x').zoom).toBeUndefined()
  })
  it('boucliers tri-état : false → desactives, absent → standard, true → standard', () => {
    expect(resoudre({ 'a.com': { boucliers: false } }, 'https://a.com').boucliers).toBe('desactives')
    expect(resoudre({ 'a.com': { boucliers: true } }, 'https://a.com').boucliers).toBe('standard')
    expect(resoudre({}, 'https://a.com').boucliers).toBe('standard')
    expect(resoudre({}, 'about:blank').boucliers).toBe('standard')
  })
  it('permissions fusionnées par type', () => {
    const s: Record<string, RegleSite> = { '*.a.com': { permissions: { camera: 'refuser', micro: 'autoriser' } }, 'https://x.a.com': { permissions: { camera: 'autoriser' } } }
    expect(resoudre(s, 'https://x.a.com').permissions).toEqual({ camera: 'autoriser', micro: 'autoriser' })
  })
  it('file:// et URL invalide', () => {
    expect(resoudre({ 'file://': { zoom: 2 } }, 'file:///tmp/a.html').zoom).toBe(2)
    expect(resoudre({ 'file://': { zoom: 2 } }, 'n’importe quoi').zoom).toBeUndefined()
  })
  it('ResolveurSites : cache invalidé à chaque maj', () => {
    const r = new ResolveurSites({ 'a.com': { zoom: 2 } })
    expect(r.resoudre('https://a.com').zoom).toBe(2)
    r.maj({ 'a.com': { zoom: 3 } })
    expect(r.resoudre('https://a.com').zoom).toBe(3)
    r.maj({})
    expect(r.resoudre('https://a.com').zoom).toBeUndefined()
  })
})

describe('validation des clés', () => {
  const defauts = reglagesParDefaut('')
  it('accepte hôte nu et motif, refuse le reste, plafonne à 10 000', () => {
    const v = validerSettings({ sites: { 'youtube.com': { zoom: 2 }, '*.exemple.net': { zoom: 2 }, '*': { zoom: 2 }, 'a b': { zoom: 2 }, 'https://a.com:81': { zoom: 2 } } }, defauts)
    expect(Object.keys(v.sites).sort()).toEqual(['*.exemple.net', 'https://a.com:81', 'youtube.com'])
    const beaucoup: Record<string, unknown> = {}
    for (let i = 0; i < 10_001; i++) beaucoup[`h${i}.com`] = { zoom: 2 }
    expect(Object.keys(validerSettings({ sites: beaucoup }, defauts).sites)).toHaveLength(10_000)
  })
  it('tolère le booléen boucliers', () => {
    expect(validerPatch({ sites: { 'a.com': { boucliers: false } } }).sites?.['a.com']?.boucliers).toBe(false)
  })
})

describe('cohérence entre consommateurs', () => {
  it('Shields et les lecteurs de zoom, permissions, Dnd lisent la même règle', () => {
    const s: Settings = fusion(reglagesParDefaut(''), {
      sites: { '*.exemple.net': { boucliers: 'desactives', zoom: 1.5, exceptionDnd: true, permissions: { camera: 'autoriser' } } }
    })
    const shields = creerShields({ moteurInitial: ElectronBlocker.parse('', {} as never), reglages: () => s })
    const url = 'https://a.exemple.net/p'
    const r = resoudre(s.sites, url)
    expect(shields.estActif('https://a.exemple.net')).toBe(r.boucliers !== 'desactives')
    expect(r.boucliers).toBe('desactives')
    expect([r.zoom, r.exceptionDnd, r.permissions?.camera]).toEqual([1.5, true, 'autoriser'])
    expect(shields.estActif('https://exemple.net')).toBe(true)
  })
})
