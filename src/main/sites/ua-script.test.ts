import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { profilUa } from '../ua'
import { scriptNavigateur } from './ua-script'

const CHROME = '152.0.7977.167'

/** Un « navigateur » minimal : Navigator et NavigatorUAData ont leurs propriétés sur le prototype, comme Chromium. */
function monde() {
  class Navigator {
    get userAgent() { return 'reel' }
    get appVersion() { return 'reel' }
    get platform() { return 'MacIntel' }
    get vendor() { return 'Google Inc.' }
    get userAgentData() { return new NavigatorUAData() }
  }
  class NavigatorUAData {
    get platform() { return 'macOS' }
    get mobile() { return false }
  }
  const navigator = new Navigator()
  const ctx: Record<string, unknown> = { Navigator, NavigatorUAData, navigator }
  ctx.window = ctx
  return ctx
}
const evaluer = (cle: string, code: string) => {
  const ctx = monde()
  const script = scriptNavigateur(profilUa(cle, CHROME)!)
  runInNewContext(script, ctx)
  return runInNewContext(code, ctx)
}

describe('scriptNavigateur : navigator aligné sur le profil (monde principal)', () => {
  it('userAgent et appVersion suivent le profil', () => {
    const p = profilUa('safari', CHROME)!
    expect(evaluer('safari', 'navigator.userAgent')).toBe(p.ua)
    expect(evaluer('safari', 'navigator.appVersion')).toBe(p.appVersion)
    expect(evaluer('firefox', 'navigator.appVersion')).toBe('5.0 (Windows)')
  })
  it('Firefox : plateforme Windows, vendeur vide, pas de userAgentData', () => {
    expect(evaluer('firefox', 'navigator.platform')).toBe('Win32')
    expect(evaluer('firefox', 'navigator.vendor')).toBe('')
    expect(evaluer('firefox', 'navigator.userAgentData')).toBeUndefined()
  })
  it('Safari : MacIntel, Apple, pas de userAgentData', () => {
    expect(evaluer('safari', 'navigator.platform')).toBe('MacIntel')
    expect(evaluer('safari', 'navigator.vendor')).toBe('Apple Computer, Inc.')
    expect(evaluer('safari', 'navigator.userAgentData')).toBeUndefined()
  })
  it('Chrome (Windows) : userAgentData gardé, plateforme et mobile alignés', () => {
    expect(evaluer('chrome-windows', 'navigator.platform')).toBe('Win32')
    expect(evaluer('chrome-windows', 'navigator.userAgentData.platform')).toBe('Windows')
    expect(evaluer('chrome-windows', 'navigator.userAgentData.mobile')).toBe(false)
  })
  it('Chrome (Android) : mobile', () => {
    expect(evaluer('chrome-android', 'navigator.userAgentData.mobile')).toBe(true)
    expect(evaluer('chrome-android', 'navigator.userAgentData.platform')).toBe('Android')
  })
  it('ne lève jamais, même sans NavigatorUAData (Firefox réel, worker)', () => {
    const ctx = monde()
    delete ctx.NavigatorUAData
    expect(() => runInNewContext(scriptNavigateur(profilUa('chrome-windows', CHROME)!), ctx)).not.toThrow()
  })
})
