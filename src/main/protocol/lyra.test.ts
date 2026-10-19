import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { resolveLyraPath, urlDev } from './lyra'

const racine = join('/', 'app', 'renderer')

describe('resolveLyraPath', () => {
  it('lyra://newtab sert newtab.html', () => {
    expect(resolveLyraPath('lyra://newtab', racine)).toBe(join(racine, 'newtab.html'))
    expect(resolveLyraPath('lyra://newtab/', racine)).toBe(join(racine, 'newtab.html'))
  })
  it('les autres hôtes internes sont servis par settings.html', () => {
    expect(resolveLyraPath('lyra://settings/historique', racine)).toBe(join(racine, 'settings.html'))
    for (const h of ['settings', 'extensions', 'history', 'bookmarks', 'downloads', 'shields']) {
      expect(resolveLyraPath(`lyra://${h}`, racine)).toBe(join(racine, 'settings.html'))
    }
  })
  it('les assets sont résolus sous la racine', () => {
    expect(resolveLyraPath('lyra://newtab/assets/x.js', racine)).toBe(join(racine, 'assets', 'x.js'))
  })
  it('refuse la traversée de chemin', () => {
    expect(resolveLyraPath('lyra://newtab/../secret', racine)).toBeNull()
    expect(resolveLyraPath('lyra://newtab/assets/../../secret', racine)).toBeNull()
    expect(resolveLyraPath('lyra://newtab/assets/%2e%2e/secret', racine)).toBeNull()
  })
  it('refuse un hôte inconnu ou un autre schéma', () => {
    expect(resolveLyraPath('lyra://inconnu/assets/x.js', racine)).toBeNull()
    expect(resolveLyraPath('https://newtab/', racine)).toBeNull()
  })
})

describe('urlDev', () => {
  const base = 'http://localhost:5173'
  it('sert la page HTML pour l\'hôte et les routes sans point', () => {
    expect(urlDev('lyra://newtab', base)).toBe(`${base}/newtab.html`)
    expect(urlDev('lyra://newtab/', base)).toBe(`${base}/newtab.html`)
    expect(urlDev('lyra://settings/historique', base)).toBe(`${base}/settings.html`)
    expect(urlDev('lyra://shields', base)).toBe(`${base}/settings.html`)
  })
  it('proxifie tels quels les chemins Vite, query comprise', () => {
    expect(urlDev('lyra://newtab/@vite/client', base)).toBe(`${base}/@vite/client`)
    expect(urlDev('lyra://newtab/@react-refresh', base)).toBe(`${base}/@react-refresh`)
    expect(urlDev('lyra://newtab/@id/x', base)).toBe(`${base}/@id/x`)
    expect(urlDev('lyra://newtab/node_modules/.vite/deps/preact.js?v=abc', base)).toBe(
      `${base}/node_modules/.vite/deps/preact.js?v=abc`
    )
    expect(urlDev('lyra://newtab/src/renderer/newtab/main.tsx?t=123', base)).toBe(
      `${base}/src/renderer/newtab/main.tsx?t=123`
    )
    expect(urlDev('lyra://newtab/newtab/main.tsx?import', base)).toBe(`${base}/newtab/main.tsx?import`)
  })
  it('refuse hôte inconnu, traversée et autre schéma', () => {
    expect(urlDev('lyra://inconnu/x.js', base)).toBeNull()
    expect(urlDev('lyra://newtab/../x', base)).toBeNull()
    expect(urlDev('https://newtab/', base)).toBeNull()
  })
})
