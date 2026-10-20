import { describe, expect, it } from 'vitest'
import { origineDeRegles, routeReglesSite } from './routeSite'

describe('origineDeRegles', () => {
  it('origine http(s), port conservé, chemin et requête retirés', () => {
    expect(origineDeRegles('https://youtube.com/watch?v=1#t')).toBe('https://youtube.com')
    expect(origineDeRegles('http://localhost:3000/a/b')).toBe('http://localhost:3000')
    expect(origineDeRegles('https://exemple.fr:8443/')).toBe('https://exemple.fr:8443')
  })
  it('port par défaut omis, hôte en minuscules', () => {
    expect(origineDeRegles('https://Exemple.FR:443/x')).toBe('https://exemple.fr')
    expect(origineDeRegles('http://exemple.fr:80/')).toBe('http://exemple.fr')
  })
  it('refuse lyra://, chrome-extension://, file:, about:, data:, javascript: et le vide', () => {
    for (const u of ['lyra://settings', 'lyra://newtab', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html', 'file:///tmp/x.html', 'about:blank', 'data:text/html,x', 'javascript:alert(1)', 'ftp://x.fr/', '', 'pas une url']) {
      expect(origineDeRegles(u), u).toBeNull()
    }
  })
})

describe('routeReglesSite', () => {
  it('lyra://settings#/sites/<origine encodée>', () => {
    expect(routeReglesSite('https://youtube.com/watch?v=1')).toBe('lyra://settings#/sites/https%3A%2F%2Fyoutube.com')
  })
  it('l’hôte garde son port, encodé', () => {
    expect(routeReglesSite('http://localhost:3000/')).toBe('lyra://settings#/sites/http%3A%2F%2Flocalhost%3A3000')
  })
  it('suffixe /style pour « Style perso pour ce site »', () => {
    expect(routeReglesSite('https://youtube.com/', 'style')).toBe('lyra://settings#/sites/https%3A%2F%2Fyoutube.com/style')
  })
  it('le décodage redonne l’origine, sans « / » brut dans le segment', () => {
    const r = routeReglesSite('https://exemple.fr:8443/a')!
    const segment = r.slice('lyra://settings#/sites/'.length)
    expect(segment).not.toContain('/')
    expect(decodeURIComponent(segment)).toBe('https://exemple.fr:8443')
  })
  it('null hors http(s)', () => {
    for (const u of ['lyra://settings', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/x', 'file:///x', '']) expect(routeReglesSite(u), u).toBeNull()
    expect(routeReglesSite('lyra://settings', 'style')).toBeNull()
  })
})
