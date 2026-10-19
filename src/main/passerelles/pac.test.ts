import { describe, it, expect } from 'vitest'
import { genererPac, pacDataUrl, regleProxy } from './pac'
import type { Candidat } from './liste'

const s5 = (n: number): Candidat => ({ type: 'socks5', hote: `8.8.8.${n}`, port: 1080 })
const h = (n: number): Candidat => ({ type: 'http', hote: `9.9.9.${n}`, port: 8080 })

/** Évalue le PAC comme Chromium : (url, host) avec l'hôte extrait de l'URL (crochets conservés pour IPv6). */
function evaluer(pac: string): (url: string) => string {
  const f = new Function(`${pac}\nreturn FindProxyForURL;`)() as (url: string, host: string) => string
  return (url) => {
    const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^:/?#]*)/i.exec(url)
    return f(url, m ? m[1] : '')
  }
}

describe('regleProxy', () => {
  it('SOCKS5 et PROXY', () => {
    expect(regleProxy(s5(1))).toBe('SOCKS5 8.8.8.1:1080')
    expect(regleProxy(h(1))).toBe('PROXY 9.9.9.1:8080')
  })
})

describe('genererPac', () => {
  const chaine = [s5(1), h(2)]
  const attendu = 'SOCKS5 8.8.8.1:1080; PROXY 9.9.9.2:8080'

  it('est une fonction autonome', () => {
    const pac = genererPac(['reddit.com'], chaine)
    expect(pac).toContain('function FindProxyForURL(url, host)')
    expect(pac).not.toMatch(/dnsDomainIs|shExpMatch|isInNet|dnsResolve|localHostOrDomainIs/)
  })

  it('site contourné en https/wss : chaîne ; sous-domaines couverts (Review Focus 5)', () => {
    const f = evaluer(genererPac(['reddit.com'], chaine))
    expect(f('https://reddit.com/')).toBe(attendu)
    expect(f('https://old.reddit.com/r/x')).toBe(attendu)
    expect(f('wss://ws.reddit.com/socket')).toBe(attendu)
    expect(f('https://REDDIT.com./')).toBe(attendu)
    expect(f('https://notreddit.com/')).toBe('DIRECT')
    expect(f('https://reddit.com.evil.fr/')).toBe('DIRECT')
    expect(f('https://autre.fr/')).toBe('DIRECT')
  })

  it('http: et ws: jamais via passerelle publique (Review Focus 1)', () => {
    const f = evaluer(genererPac(['reddit.com'], chaine))
    expect(f('http://reddit.com/')).toBe('DIRECT')
    expect(f('http://old.reddit.com/')).toBe('DIRECT')
    expect(f('ws://reddit.com/')).toBe('DIRECT')
    expect(f('ftp://reddit.com/')).toBe('DIRECT')
  })

  it('autoriserHttp (passerelle personnelle) : http: et ws: aussi', () => {
    const f = evaluer(genererPac(['reddit.com'], chaine, true))
    expect(f('http://reddit.com/')).toBe(attendu)
    expect(f('ws://a.reddit.com/')).toBe(attendu)
    expect(f('https://reddit.com/')).toBe(attendu)
    expect(f('http://autre.fr/')).toBe('DIRECT')
    expect(f('ftp://reddit.com/')).toBe('DIRECT')
  })

  it('lyra:, file:, localhost, IP privées : DIRECT même si listés', () => {
    const sites = ['reddit.com', 'localhost', 'foo.localhost', '10.0.0.1', '192.168.1.5', '127.0.0.1']
    for (const auto of [false, true]) {
      const f = evaluer(genererPac(sites, chaine, auto))
      for (const u of [
        'lyra://newtab', 'lyra://reddit.com/', 'file:///C:/x/reddit.com', 'file://reddit.com/x',
        'https://localhost/', 'https://foo.localhost/', 'https://LOCALHOST./', 'https://127.0.0.1/', 'https://127.1.2.3:8443/',
        'https://10.0.0.1/', 'https://10.255.0.9/', 'https://192.168.1.5/', 'https://172.16.0.1/', 'https://172.31.9.9/', 'https://169.254.169.254/',
        'https://0.0.0.0/', 'https://[::1]/', 'https://[fc00::1]/', 'https://[fd12:3456::1]/', 'https://[fe80::1]/'
      ])
        expect(f(u), u).toBe('DIRECT')
    }
  })

  it("IP publique listée : via la passerelle en https ; 172.32 n'est pas privée", () => {
    const f = evaluer(genererPac(['8.8.8.8', '172.32.0.1'], chaine))
    expect(f('https://8.8.8.8/')).toBe(attendu)
    expect(f('https://172.32.0.1/')).toBe(attendu)
  })

  it('chaîne limitée à 3, ordre conservé', () => {
    const f = evaluer(genererPac(['a.fr'], [s5(1), s5(2), s5(3), s5(4), s5(5)]))
    expect(f('https://a.fr/')).toBe('SOCKS5 8.8.8.1:1080; SOCKS5 8.8.8.2:1080; SOCKS5 8.8.8.3:1080')
  })

  it('aucun DIRECT en repli pour un site contourné, même chaîne vide', () => {
    const f = evaluer(genererPac(['a.fr'], []))
    const r = f('https://a.fr/')
    expect(r).not.toContain('DIRECT')
    expect(r).toBe('PROXY 127.0.0.1:9')
    expect(f('https://b.fr/')).toBe('DIRECT')
  })

  it('sans site : tout DIRECT', () => {
    expect(evaluer(genererPac([], chaine))('https://reddit.com/')).toBe('DIRECT')
  })

  it("les sites sont des données : pas d'injection de code", () => {
    const mechant = '");globalThis.pwned=1;("'
    const f = evaluer(genererPac([mechant, 'a.fr'], chaine))
    expect(f('https://a.fr/')).toBe(attendu)
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  })
  it('repli du proxy système pour les sites non contournés (proxy d’entreprise préservé)', () => {
    const f = evaluer(genererPac(['reddit.com'], chaine, false, { https: 'PROXY corp:8080', http: 'PROXY corp:3128' }))
    expect(f('https://reddit.com/')).toBe(attendu)
    expect(f('https://exemple.fr/')).toBe('PROXY corp:8080')
    expect(f('http://exemple.fr/')).toBe('PROXY corp:3128')
    // http d'un site contourné sans personnelle : jamais la passerelle publique, le chemin habituel.
    expect(f('http://reddit.com/')).toBe('PROXY corp:3128')
    // localhost, IP privées et schémas non web restent DIRECT.
    expect(f('https://localhost/')).toBe('DIRECT')
    expect(f('https://192.168.1.2/')).toBe('DIRECT')
    expect(f('https://10.0.0.1/')).toBe('DIRECT')
    expect(f('ftp://exemple.fr/')).toBe('DIRECT')
    // Forme courte : une seule règle pour les deux schémas.
    expect(evaluer(genererPac([], [], false, 'PROXY corp:8080'))('http://a.fr/')).toBe('PROXY corp:8080')
  })

})

describe('pacDataUrl', () => {
  it('data URL base64 décodable', () => {
    const pac = genererPac(['é.fr'], [s5(1)])
    const url = pacDataUrl(pac)
    expect(url.startsWith('data:application/x-ns-proxy-autoconfig;base64,')).toBe(true)
    expect(Buffer.from(url.split(',')[1], 'base64').toString('utf8')).toBe(pac)
  })
})
