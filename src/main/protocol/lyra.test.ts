import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { resolveLyraPath } from './lyra'

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
