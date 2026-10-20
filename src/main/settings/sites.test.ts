import { describe, it, expect } from 'vitest'
import { cleDe, cleCanonique, resoudre, ResolveurSites, desactiverBoucliers, reactiverBoucliers } from './sites'
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
  it('extensions (jalon B) fusionnées par identifiant : la règle la plus précise gagne', () => {
    const a = 'a'.repeat(32)
    const b = 'b'.repeat(32)
    const c = 'c'.repeat(32)
    const s: Record<string, RegleSite> = {
      '*.a.com': { extensions: { [a]: false, [b]: false } },
      'x.a.com': { extensions: { [c]: false } },
      'https://x.a.com': { extensions: { [a]: true } }
    }
    expect(resoudre(s, 'https://x.a.com').extensions).toEqual({ [a]: true, [b]: false, [c]: false })
    expect(resoudre(s, 'https://y.a.com').extensions).toEqual({ [a]: false, [b]: false })
    expect(resoudre(s, 'https://z.fr').extensions).toBeUndefined()
  })
  it('extensions par site : validées (ids a-p sur 32 lettres, booléens) et conservées', () => {
    const a = 'a'.repeat(32)
    const p = validerPatch({ sites: { '*.a.com': { extensions: { [a]: false, zzz: false, ['b'.repeat(32)]: 'non' } } } })
    expect(p.sites?.['*.a.com']).toEqual({ extensions: { [a]: false } })
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

describe('clés canoniques', () => {
  it('forme canonique : minuscules, port par défaut et point final retirés', () => {
    expect(cleCanonique('A.com')).toBe('a.com')
    expect(cleCanonique('A.com.')).toBe('a.com')
    expect(cleCanonique('https://A.com:443')).toBe('https://a.com')
    expect(cleCanonique('http://a.com:80/')).toBeNull()
    expect(cleCanonique('http://a.com:8080')).toBe('http://a.com:8080')
    expect(cleCanonique('https://a.com.')).toBe('https://a.com')
    expect(cleCanonique('*.A.com.')).toBe('*.a.com')
    // Nom international : la clé est le punycode que voit la page (`new URL(...).hostname`), point final compris.
    expect(cleCanonique('münchen.de')).toBe('xn--mnchen-3ya.de')
    expect(cleCanonique('MÜNCHEN.de.')).toBe('xn--mnchen-3ya.de')
    expect(cleCanonique('*.bücher.example')).toBe('*.xn--bcher-kva.example')
    expect(cleCanonique('https://münchen.de')).toBe('https://xn--mnchen-3ya.de')
    expect(cleCanonique('münchen.de#x')).toBeNull()
    expect(cleCanonique('xn--mnchen-3ya.de')).toBe('xn--mnchen-3ya.de')
    // La règle saisie en Unicode s'applique à la page (dont l'URL est en punycode).
    expect(resoudre({ [cleCanonique('münchen.de')!]: { zoom: 1.5 } }, 'https://münchen.de/x').zoom).toBe(1.5)
    expect(cleCanonique('https://-a')).toBeNull()
    expect(cleCanonique('https://.a')).toBeNull()
  })
  it('https://a.com:443 correspond à https://a.com', () => {
    expect(resoudre({ 'https://a.com:443': { zoom: 2 } }, 'https://a.com/').zoom).toBe(2)
  })
  it('validation : formes canoniques enregistrées, collision = dernière gagne', () => {
    const v = validerSettings({ sites: { 'A.com': { zoom: 2 }, 'a.com': { zoom: 1.5 }, 'https://B.com:443': { zoom: 2 } } }, reglagesParDefaut(''))
    expect(v.sites).toEqual({ 'a.com': { zoom: 1.5 }, 'https://b.com': { zoom: 2 } })
  })
})

describe('boucliers : désactiver puis réactiver', () => {
  const cycle = (sites: Record<string, RegleSite>, origine: string, cle: string): Record<string, RegleSite> => {
    let s = fusion(sites, { [cle]: desactiverBoucliers(sites, origine).ecrire }) as Record<string, RegleSite>
    expect(resoudre(s, origine).boucliers).toBe('desactives')
    const { ecrire, retirer } = reactiverBoucliers(s, origine)
    const r = { ...(s[cle] ?? {}) } as Record<string, unknown>
    for (const k of retirer) delete r[k]
    s = { ...s, [cle]: fusion(r, ecrire) as RegleSite }
    if (Object.keys(s[cle]).length === 0) delete s[cle]
    return s
  }
  it('Strict venant d’un motif est retrouvé, sans règle exacte résiduelle', () => {
    const base = { '*.exemple.net': { boucliers: 'strict' as const } }
    const s = cycle(base, 'https://a.exemple.net', 'https://a.exemple.net')
    expect(resoudre(s, 'https://a.exemple.net').boucliers).toBe('strict')
    expect(s['https://a.exemple.net']).toBeUndefined()
  })
  it('Strict exact est retrouvé', () => {
    const s = cycle({ 'https://a.com': { boucliers: 'strict' } }, 'https://a.com', 'https://a.com')
    expect(s['https://a.com']).toEqual({ boucliers: 'strict' })
  })
  it('standard par défaut : plus aucune règle', () => {
    expect(cycle({}, 'https://a.com', 'https://a.com')).toEqual({})
  })
  it('motif désactivé : la réactivation écrit standard dans la règle exacte', () => {
    const s = cycle({ '*.a.com': { boucliers: 'desactives' } }, 'https://x.a.com', 'https://x.a.com')
    expect(s['https://x.a.com']).toEqual({ boucliers: 'standard' })
  })
})
