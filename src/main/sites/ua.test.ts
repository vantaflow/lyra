import { describe, expect, it } from 'vitest'
import type { RegleSite } from '../../shared/types'
import type { DetailsEnvoi } from '../session/webRequestHub'
import { profilUa } from '../ua'
import { ecouteurUaEnvoi, enTetesPourProfil, fonctionUaPourPage } from './ua'

type Sites = Record<string, RegleSite>
const CHROME = '152.0.7977.167'
const UA_LYRA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
const HAUT = 'https://exemple.test/page'

const CLIENT = {
  'User-Agent': UA_LYRA,
  'Sec-CH-UA': '"Chromium";v="152", "Not A Brand";v="24"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"macOS"',
  'Sec-CH-UA-Platform-Version': '"15.0.0"',
  'Sec-CH-UA-Arch': '"arm"',
  Accept: '*/*'
}
const envoi = (url: string, o: Record<string, unknown> = {}): DetailsEnvoi =>
  ({ id: 1, url, method: 'GET', resourceType: 'image', referrer: HAUT, webContents: { getURL: () => HAUT }, requestHeaders: { ...CLIENT }, ...o }) as unknown as DetailsEnvoi
const sites = (ua: string): Sites => ({ 'exemple.test': { ua } })

describe('enTetesPourProfil', () => {
  it('Safari (non Chromium) : User-Agent remplacé, tous les Sec-CH-UA* retirés', () => {
    const h = enTetesPourProfil({ ...CLIENT }, profilUa('safari', CHROME)!)
    expect(h['User-Agent']).toContain('Version/')
    expect(Object.keys(h).filter((k) => /^sec-ch-ua/i.test(k))).toEqual([])
    expect(h.Accept).toBe('*/*')
  })
  it('Firefox : idem', () => {
    const h = enTetesPourProfil({ ...CLIENT }, profilUa('firefox', CHROME)!)
    expect(h['User-Agent']).toContain('Firefox/')
    expect(Object.keys(h).filter((k) => /^sec-ch-ua/i.test(k))).toEqual([])
  })
  it('Chrome (Windows) : indices gardés mais plateforme alignée, détails de plate-forme retirés', () => {
    const h = enTetesPourProfil({ ...CLIENT }, profilUa('chrome-windows', CHROME)!)
    expect(h['Sec-CH-UA']).toBe(CLIENT['Sec-CH-UA'])
    expect(h['Sec-CH-UA-Platform']).toBe('"Windows"')
    expect(h['Sec-CH-UA-Mobile']).toBe('?0')
    expect(h['Sec-CH-UA-Platform-Version']).toBeUndefined()
    expect(h['Sec-CH-UA-Arch']).toBeUndefined()
  })
  it('Chrome (Android) : mobile', () => {
    const h = enTetesPourProfil({ ...CLIENT }, profilUa('chrome-android', CHROME)!)
    expect(h['Sec-CH-UA-Mobile']).toBe('?1')
    expect(h['Sec-CH-UA-Platform']).toBe('"Android"')
  })
  it('sans User-Agent dans la requête (clé en minuscules) : la clé existante est réutilisée', () => {
    const h = enTetesPourProfil({ 'user-agent': 'x' }, profilUa('safari', CHROME)!)
    expect(Object.keys(h)).toEqual(['user-agent'])
  })
})

describe('User-Agent par site (onBeforeSendHeaders)', () => {
  const ecouteur = (s: Sites) => ecouteurUaEnvoi({ sites: () => s, chrome: CHROME })

  it('remplace l’UA des requêtes du site (et de ses sous-ressources tierces) et retire Sec-CH-UA pour Safari', () => {
    const r = ecouteur(sites('safari'))(envoi('https://cdn.tiers.test/a.png'))!
    expect(r.requestHeaders!['User-Agent']).toBe(profilUa('safari', CHROME)!.ua)
    expect(Object.keys(r.requestHeaders!).some((k) => /^sec-ch-ua/i.test(k))).toBe(false)
  })
  it('c’est l’origine de la page principale qui compte, pas celle de la requête', () => {
    // Requête VERS exemple.test depuis une autre page : UA par défaut.
    const autre = envoi('https://exemple.test/api', { webContents: { getURL: () => 'https://autre.test/' }, referrer: 'https://autre.test/' })
    expect(ecouteur(sites('safari'))(autre)).toBeUndefined()
  })
  it('la navigation principale prend l’UA du site visité', () => {
    const d = envoi('https://exemple.test/', { resourceType: 'mainFrame', webContents: undefined, referrer: '' })
    expect(ecouteur(sites('firefox'))(d)!.requestHeaders!['User-Agent']).toContain('Firefox/')
  })
  it('profil par défaut, inconnu ou absent : rien n’est réécrit', () => {
    expect(ecouteur(sites('lyra'))(envoi('https://exemple.test/a'))).toBeUndefined()
    expect(ecouteur(sites('netscape'))(envoi('https://exemple.test/a'))).toBeUndefined()
    expect(ecouteur({})(envoi('https://exemple.test/a'))).toBeUndefined()
  })
  it('la règle du motif *.hôte s’applique, la règle exacte la supplante', () => {
    const s: Sites = { '*.exemple.test': { ua: 'safari' }, 'https://www.exemple.test': { ua: 'lyra' } }
    const depuis = (haut: string) => envoi('https://exemple.test/a', { webContents: { getURL: () => haut } })
    expect(ecouteur(s)(depuis('https://blog.exemple.test/'))).toBeDefined()
    expect(ecouteur(s)(depuis('https://www.exemple.test/'))).toBeUndefined()
  })
})

describe('script navigator du preload', () => {
  it('fourni pour une page dont la règle a un profil alternatif, vide sinon', () => {
    const js = fonctionUaPourPage(sites('firefox'), 'https://exemple.test/page', CHROME)
    expect(js).toContain("'platform', \"Win32\"")
    expect(fonctionUaPourPage(sites('lyra'), 'https://exemple.test/page', CHROME)).toBe('')
    expect(fonctionUaPourPage({}, 'https://exemple.test/page', CHROME)).toBe('')
    expect(fonctionUaPourPage(sites('firefox'), 'https://autre.test/page', CHROME)).toBe('')
    expect(fonctionUaPourPage(sites('firefox'), 'file:///tmp/a.html', CHROME)).toBe('')
  })
})
