import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import vm from 'node:vm'
import { appliquerStubs, FICHIER_HEAD, FICHIER_POST, MARQUEUR_STUBS } from './stubs'

const RES = resolve(__dirname, '../../../resources/extensions')
const shims = { head: join(RES, 'shim-head.js'), post: join(RES, 'shim-post.js') }
const lire = (f: string): string => readFileSync(f, 'utf8')

const dossiers: string[] = []
afterEach(() => {
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true })
})
function extension(manifest: Record<string, unknown>, fichiers: Record<string, string> = {}): string {
  const d = mkdtempSync(join(tmpdir(), 'lyra-stubs-'))
  dossiers.push(d)
  writeFileSync(join(d, 'manifest.json'), JSON.stringify(manifest))
  for (const [n, c] of Object.entries(fichiers)) {
    mkdirSync(join(d, n, '..'), { recursive: true })
    writeFileSync(join(d, n), c)
  }
  return d
}

describe('shims dans un contexte simulé', () => {
  /** Contexte d'extension MV2 : `chrome` sans browserAction, polyfill simulé qui crée `browser`. */
  function contexte(chrome: Record<string, unknown>, avecBrowser = true): vm.Context {
    const ctx = vm.createContext({ chrome, console })
    vm.runInContext(lire(shims.head), ctx)
    if (avecBrowser) vm.runInContext('globalThis.browser = { runtime: chrome.runtime, alarms: {} }', ctx)
    vm.runInContext(lire(shims.post), ctx)
    return ctx
  }

  it('un MV2 sans browserAction ne plante plus : callback et promesse résolus, appel compté', async () => {
    const ctx = contexte({ runtime: {}, webRequest: {} })
    const r = vm.runInContext(
      `(async () => {
        let cbAppele = false
        chrome.browserAction.setBadgeText({ text: '1' }, () => { cbAppele = true })
        chrome.browserAction.setBadgeText({ text: '2' })
        await chrome.contextMenus.create({ id: 'x' })
        chrome.windows.onRemoved.addListener(() => {})
        return { cbAppele, none: chrome.windows.WINDOW_ID_NONE }
      })()`,
      ctx
    )
    expect(await r).toEqual({ cbAppele: true, none: -1 })
    expect(JSON.parse(vm.runInContext('JSON.stringify(globalThis.__lyraStubs)', ctx))).toEqual({ 'browserAction.setBadgeText': 2, 'contextMenus.create': 1 })
  })

  it('chrome figé (Electron) : remplacé par un proxy, le reste de chrome.* est conservé', () => {
    const runtime = { id: 'x' }
    const chrome = Object.freeze({ runtime, browserAction: Object.freeze({ natif: true }) })
    const ctx = vm.createContext({ console })
    vm.runInContext('globalThis.chrome = null', ctx)
    ctx.chrome = chrome
    vm.runInContext(lire(shims.head), ctx)
    vm.runInContext('chrome.pageAction.show(1); chrome.menus.create({})', ctx)
    expect(JSON.parse(vm.runInContext('JSON.stringify(globalThis.__lyraStubs)', ctx))).toEqual({ 'pageAction.show': 1, 'menus.create': 1 })
    expect(vm.runInContext('chrome.runtime.id', ctx)).toBe('x')
    expect(vm.runInContext('chrome.browserAction.natif', ctx)).toBe(true)
    expect(vm.runInContext('"pageAction" in chrome && Object.keys(chrome).includes("pageAction")', ctx)).toBe(true)
    expect(vm.runInContext('globalThis.__lyraStubsInstalles.includes("browserAction")', ctx)).toBe(false)
  })

  it("n'écrase pas une API déjà fournie", () => {
    const natif = { create: () => 'natif' }
    const ctx = contexte({ runtime: {}, contextMenus: natif })
    expect(vm.runInContext('chrome.contextMenus.create()', ctx)).toBe('natif')
    expect(vm.runInContext('globalThis.__lyraStubsInstalles.includes("contextMenus")', ctx)).toBe(false)
    expect(vm.runInContext('globalThis.__lyraStubsInstalles.includes("browserAction")', ctx)).toBe(true)
  })

  it('post complète browser.* avec tout ce que chrome.* a en plus (API electron-chrome-extensions et stubs)', () => {
    const natif = { setBadgeText: () => 'natif' }
    const ctx = contexte({ runtime: {}, browserAction: natif })
    // browser natif de Chromium : sans browserAction ni stubs ; la copie se fait dans contexte() via shim-post.
    expect(vm.runInContext('browser.browserAction.setBadgeText()', ctx)).toBe('natif')
    vm.runInContext('browser.pageAction.show(1); chrome.pageAction.show(2)', ctx)
    expect(JSON.parse(vm.runInContext('JSON.stringify(globalThis.__lyraStubs)', ctx))).toEqual({ 'pageAction.show': 2 })
  })

  it('browser figé : remplacé par un proxy qui complète avec chrome (cas uBlock Origin : self.chrome = self.browser)', () => {
    const chrome = Object.freeze({ runtime: {}, browserAction: Object.freeze({ natif: true }) })
    const ctx = vm.createContext({ console })
    ctx.chrome = chrome
    ctx.browser = Object.freeze({ runtime: {}, alarms: {} })
    vm.runInContext(lire(shims.head), ctx)
    vm.runInContext(lire(shims.post), ctx)
    // uBO : chrome devient browser.
    vm.runInContext('globalThis.chrome = globalThis.browser', ctx)
    expect(vm.runInContext('chrome.browserAction.natif', ctx)).toBe(true)
    vm.runInContext('chrome.pageAction.show(1)', ctx)
    expect(JSON.parse(vm.runInContext('JSON.stringify(globalThis.__lyraStubs)', ctx))).toEqual({ 'pageAction.show': 1 })
    expect(vm.runInContext('chrome.alarms !== undefined', ctx)).toBe(true)
  })

  it('sans browser (pas de polyfill), post ne fait rien et ne lève pas', () => {
    expect(() => contexte({ runtime: {} }, false)).not.toThrow()
  })

  it('idempotent : exécuter deux fois ne double rien', () => {
    const ctx = contexte({ runtime: {} })
    vm.runInContext(lire(shims.head), ctx)
    vm.runInContext(lire(shims.post), ctx)
    vm.runInContext('chrome.browserAction.setBadgeText({})', ctx)
    expect(JSON.parse(vm.runInContext('JSON.stringify(globalThis.__lyraStubs)', ctx))).toEqual({ 'browserAction.setBadgeText': 1 })
  })

  it('un appel qui lève dans le callback ne casse pas le stub', () => {
    const ctx = contexte({ runtime: {} })
    expect(() => vm.runInContext('chrome.browserAction.getBadgeText({}, () => { throw new Error("x") })', ctx)).not.toThrow()
  })
})

describe('appliquerStubs', () => {
  const mv2 = {
    manifest_version: 2,
    name: 'x',
    version: '1',
    background: { scripts: ['browser-polyfill.js', 'bg.js'] },
    browser_action: { default_popup: 'popup.html' },
    options_page: 'o/options.html'
  }
  const fichiers = {
    'browser-polyfill.js': '//',
    'bg.js': '//',
    'popup.html': '<html><head><script src="browser-polyfill.js"></script><script src="p.js"></script></head></html>',
    'o/options.html': '<!doctype html><html><head><title>o</title></head><body></body></html>'
  }

  it('MV2 : head avant le polyfill, post juste après, pages patchées, marqueur écrit', () => {
    const d = extension(mv2, fichiers)
    const r = appliquerStubs(d, { ...mv2 }, shims)
    expect(r).toMatchObject({ applique: true, scripts: true })
    const m = JSON.parse(lire(join(d, 'manifest.json')))
    expect(m.background.scripts).toEqual([FICHIER_HEAD, 'browser-polyfill.js', FICHIER_POST, 'bg.js'])
    expect(lire(join(d, 'popup.html'))).toContain(`<script src="/${FICHIER_HEAD}"></script><script src="browser-polyfill.js"></script><script src="/${FICHIER_POST}"></script><script src="p.js">`)
    expect(lire(join(d, 'o/options.html'))).toContain(`<head><script src="/${FICHIER_HEAD}"></script><script src="/${FICHIER_POST}"></script><title>`)
    expect(existsSync(join(d, MARQUEUR_STUBS))).toBe(true)
    expect(lire(join(d, FICHIER_HEAD))).toBe(lire(shims.head))
  })

  it('sans polyfill : head puis post en tête des scripts', () => {
    const m = { ...mv2, background: { scripts: ['bg.js'] } }
    const d = extension(m, fichiers)
    appliquerStubs(d, m, shims)
    expect(JSON.parse(lire(join(d, 'manifest.json'))).background.scripts).toEqual([FICHIER_HEAD, FICHIER_POST, 'bg.js'])
  })

  it('idempotent : un second appel ne change rien', () => {
    const d = extension(mv2, fichiers)
    appliquerStubs(d, { ...mv2 }, shims)
    const avant = [lire(join(d, 'manifest.json')), lire(join(d, 'popup.html'))]
    expect(appliquerStubs(d, { ...mv2 }, shims)).toEqual({ applique: false, raison: 'deja-applique' })
    expect([lire(join(d, 'manifest.json')), lire(join(d, 'popup.html'))]).toEqual(avant)
  })

  it('MV3 : aucun stub, aucun fichier', () => {
    const m = { manifest_version: 3, name: 'x', version: '1', background: { service_worker: 'sw.js' } }
    const d = extension(m, { 'sw.js': '//' })
    expect(appliquerStubs(d, m, shims)).toEqual({ applique: false, raison: 'mv3' })
    expect(existsSync(join(d, FICHIER_HEAD))).toBe(false)
    expect(existsSync(join(d, MARQUEUR_STUBS))).toBe(false)
    expect(JSON.parse(lire(join(d, 'manifest.json')))).toEqual(m)
  })

  it('une page hors de l’extension (../) est ignorée', () => {
    const m = { ...mv2, options_page: '../dehors.html' }
    const d = extension(m, fichiers)
    expect(appliquerStubs(d, m, shims).pages).toEqual(['popup.html'])
  })
})
