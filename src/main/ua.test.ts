import { describe, expect, it } from 'vitest'
import { majeurDeChromeReel, nettoyerUserAgent, profilUa } from './ua'

describe('nettoyerUserAgent', () => {
  it('retire Electron et le nom de l’application', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) lyra/0.1.0 Chrome/140.0.0.0 Electron/44.9.0 Safari/537.36'
    const net = nettoyerUserAgent(ua)
    expect(net).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')
  })
})

describe('profils nommés', () => {
  const chrome = '152.0.7977.167'
  it('le profil par défaut ne change rien (UA de la session)', () => {
    expect(profilUa('lyra', chrome)).toBeNull()
    expect(profilUa(undefined, chrome)).toBeNull()
    expect(profilUa('inconnu', chrome)).toBeNull()
  })
  it('Chrome (Windows) : Chromium, N lu du vrai Chrome, plateforme Windows', () => {
    const p = profilUa('chrome-windows', chrome)!
    expect(p.ua).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36')
    expect(p).toMatchObject({ chromium: true, plateforme: 'Windows', mobile: false, plateformeNav: 'Win32', vendeur: 'Google Inc.' })
  })
  it('Chrome (Android) : mobile', () => {
    const p = profilUa('chrome-android', chrome)!
    expect(p.ua).toContain('Android')
    expect(p.ua).toContain('Chrome/152.0.0.0 Mobile Safari/537.36')
    expect(p).toMatchObject({ chromium: true, plateforme: 'Android', mobile: true, plateformeNav: 'Linux armv81' })
  })
  it('Firefox et Safari : non Chromium (aucun indice client)', () => {
    expect(profilUa('firefox', chrome)).toMatchObject({ chromium: false, plateformeNav: 'Win32', vendeur: '' })
    expect(profilUa('firefox', chrome)!.ua).toMatch(/Gecko\/20100101 Firefox\/\d+\.0$/)
    expect(profilUa('safari', chrome)).toMatchObject({ chromium: false, plateformeNav: 'MacIntel', vendeur: 'Apple Computer, Inc.' })
    expect(profilUa('safari', chrome)!.ua).toMatch(/Version\/\d+\.\d+ Safari\/605\.1\.15$/)
    expect(profilUa('safari', chrome)!.ua).not.toContain('Chrome')
  })
  it('appVersion : l’UA sans « Mozilla/ » (Firefox : forme courte)', () => {
    expect(profilUa('chrome-windows', chrome)!.appVersion).toBe(profilUa('chrome-windows', chrome)!.ua.replace('Mozilla/', ''))
    expect(profilUa('safari', chrome)!.appVersion.startsWith('5.0 (Macintosh;')).toBe(true)
    expect(profilUa('firefox', chrome)!.appVersion).toBe('5.0 (Windows)')
  })
  it('majeurDeChromeReel lit process.versions.chrome', () => {
    expect(majeurDeChromeReel(chrome)).toBe(152)
    expect(majeurDeChromeReel(undefined)).toBeUndefined()
  })
})
