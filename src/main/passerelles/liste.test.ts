import { describe, it, expect } from 'vitest'
import { lireListe, fusionner, hoteCouvert, estIpv4Publique, hoteValide } from './liste'

describe('estIpv4Publique', () => {
  it('accepte les adresses publiques', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '193.168.1.1']) expect(estIpv4Publique(ip)).toBe(true)
  })
  it('rejette privées, locales, réservées et malformées', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.1.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255', '256.1.1.1', '1.2.3', '01.2.3.4', 'a.b.c.d', '1.2.3.4.5'])
      expect(estIpv4Publique(ip)).toBe(false)
  })
})

describe('lireListe', () => {
  it('lit IP:port, avec ou sans préfixe, et ignore le reste', () => {
    const texte = ['8.8.8.8:1080', 'socks5://1.1.1.1:9050', 'http://9.9.9.9:8080', '# commentaire', '', 'texte quelconque', '8.8.4.4', '8.8.4.4:0', '8.8.4.4:70000', 'socks4://5.5.5.5:1080', '10.0.0.1:8080', '127.0.0.1:1080', '[::1]:80', '  4.4.4.4:3128  \r'].join('\n')
    expect(lireListe(texte, 'socks5')).toEqual([
      { type: 'socks5', hote: '8.8.8.8', port: 1080 },
      { type: 'socks5', hote: '1.1.1.1', port: 9050 },
      { type: 'http', hote: '9.9.9.9', port: 8080 },
      { type: 'socks5', hote: '4.4.4.4', port: 3128 }
    ])
  })
  it('dédoublonne', () => {
    expect(lireListe('8.8.8.8:80\n8.8.8.8:80\n8.8.8.8:81', 'http')).toHaveLength(2)
  })
  it('texte vide ou non textuel : liste vide', () => {
    expect(lireListe('', 'http')).toEqual([])
    expect(lireListe(undefined as unknown as string, 'http')).toEqual([])
  })
})

describe('fusionner', () => {
  it('fusionne et dédoublonne (même type, hôte, port)', () => {
    const a = { type: 'socks5' as const, hote: '8.8.8.8', port: 1 }
    const b = { type: 'http' as const, hote: '8.8.8.8', port: 1 }
    expect(fusionner([a], [a, b])).toEqual([a, b])
    expect(fusionner()).toEqual([])
  })
  it('linéaire : 40 000 candidats fusionnés en moins de 500 ms', () => {
    const l = Array.from({ length: 40_000 }, (_, i) => ({ type: 'socks5' as const, hote: `8.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, port: 1080 }))
    const t = performance.now()
    expect(fusionner(l, l)).toHaveLength(40_000)
    expect(performance.now() - t).toBeLessThan(500)
  })
})

describe('hoteCouvert', () => {
  it('égal ou sous-domaine, pas de simple suffixe', () => {
    expect(hoteCouvert('reddit.com', ['reddit.com'])).toBe(true)
    expect(hoteCouvert('old.reddit.com', ['reddit.com'])).toBe(true)
    expect(hoteCouvert('a.b.reddit.com', ['reddit.com'])).toBe(true)
    expect(hoteCouvert('notreddit.com', ['reddit.com'])).toBe(false)
    expect(hoteCouvert('reddit.com.evil.fr', ['reddit.com'])).toBe(false)
    expect(hoteCouvert('com', ['reddit.com'])).toBe(false)
  })
  it('insensible à la casse, point final ignoré', () => {
    expect(hoteCouvert('Old.Reddit.COM.', ['reddit.com'])).toBe(true)
    expect(hoteCouvert('reddit.com', ['REDDIT.com.'])).toBe(true)
  })
  it('liste vide ou hôte vide : faux', () => {
    expect(hoteCouvert('a.fr', [])).toBe(false)
    expect(hoteCouvert('', ['a.fr'])).toBe(false)
    expect(hoteCouvert('a.fr', [''])).toBe(false)
  })
})

describe('hoteValide', () => {
  it('domaines seulement', () => {
    expect(hoteValide('reddit.com')).toBe(true)
    expect(hoteValide('a-b.xn--p1ai')).toBe(true)
    for (const h of ['', 'https://a.fr', 'a.fr/x', 'a.fr:80', 'localhost', '1.2.3.4', '-a.fr', 'a..fr', 'a b.fr', '__proto__']) expect(hoteValide(h)).toBe(false)
  })
})
