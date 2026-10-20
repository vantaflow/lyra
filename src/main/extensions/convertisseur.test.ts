import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { convertir } from './convertisseur'
import { suggestionChrome, cleDepuisGraine } from './firefox'
import { idDepuisCle } from './archives'

const FIXTURES = resolve(__dirname, 'fixtures/manifests')
let tmp: string
let dossier: string
let polyfill: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-conv-'))
  dossier = join(tmp, 'ext')
  mkdirSync(dossier)
  polyfill = join(tmp, 'browser-polyfill.js')
  writeFileSync(polyfill, '/* polyfill */')
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

/** Dépose le manifest de fixture dans un dossier d'extension, avec les fichiers listés (contenu quelconque). */
function preparer(fixture: string, fichiers: Record<string, string> = {}): void {
  writeFileSync(join(dossier, 'manifest.json'), readFileSync(join(FIXTURES, `${fixture}.json`)))
  for (const [nom, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(dossier, nom)), { recursive: true })
    writeFileSync(join(dossier, nom), contenu)
  }
}
const lire = (nom: string): string => readFileSync(join(dossier, nom), 'utf8')
const options = (plus: Partial<Parameters<typeof convertir>[1]> = {}): Parameters<typeof convertir>[1] => ({ enTete: [{ nom: 'browser-polyfill.js', source: polyfill }], ...plus })

describe('uBlock Origin (Firefox, MV2)', () => {
  it('rapport : clés et permissions retirées, MV2 conservé, polyfill en tête partout', async () => {
    preparer('ubo-ff', { 'background.html': '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>', 'popup-fenix.html': '<html><body></body></html>' })
    const { manifest: m, rapport } = await convertir(dossier, options({ svgVersPng: async () => undefined }))
    expect(rapport.refus).toBeUndefined()
    expect(rapport.cles_retirees).toEqual(expect.arrayContaining(['browser_specific_settings', 'sidebar_action', 'browser_action.browser_style']))
    expect(rapport.permissions_retirees).toEqual(['dns'])
    expect(m.manifest_version).toBe(2)
    expect(m.permissions).toEqual(['contextMenus', 'privacy', 'storage', 'tabs', 'unlimitedStorage', 'webNavigation', 'webRequest', 'webRequestBlocking', '<all_urls>'])
    expect(m.background).toEqual({ page: 'background.html', persistent: true })
    expect(rapport.transformations.some((t) => t.startsWith('MV2 conservé : background.page'))).toBe(true)
    // content scripts : polyfill d'abord, chemins d'origine conservés
    const cs = m.content_scripts as Array<{ js: string[] }>
    expect(cs[0].js).toEqual(['browser-polyfill.js', '/js/vapi.js', '/js/vapi-client.js', '/js/contentscript.js'])
    expect(cs[1].js[0]).toBe('browser-polyfill.js')
    // pages HTML : popup et page d'arrière-plan, le script est la première chose du <head>
    expect(lire('background.html')).toContain('<head><script src="browser-polyfill.js"></script>')
    expect(lire('popup-fenix.html')).toMatch(/^<html><script src="browser-polyfill.js"><\/script>/)
    expect(existsSync(join(dossier, 'browser-polyfill.js'))).toBe(true)
    // WAR MV2 : chaînes, sans « / » initial
    expect(m.web_accessible_resources).toEqual(['web_accessible_resources/*'])
    // icônes SVG sans moyen de conversion : retirées avec avertissement
    expect(rapport.avertissements.some((a) => a.includes('img/ublock.svg'))).toBe(true)
    expect(m.icons).toEqual({})
    // le manifest écrit sur disque est celui du rapport
    expect(JSON.parse(lire('manifest.json'))).toEqual(m)
  })
})

describe('Dark Reader (Firefox, MV2)', () => {
  it("permission « theme » retirée journalisée, scripts d'arrière-plan précédés du polyfill, MV2 conservé", async () => {
    preparer('dark-reader-ff', { 'ui/popup/index.html': '<html><head></head></html>', 'ui/stylesheet-editor/index.html': '<body></body>' })
    const { manifest: m, rapport } = await convertir(dossier, options())
    expect(rapport.refus).toBeUndefined()
    expect(rapport.permissions_retirees).toEqual(['theme'])
    expect(m.permissions).toEqual(['alarms', 'fontSettings', 'storage', 'tabs', '<all_urls>'])
    expect(m.background).toEqual({ scripts: ['browser-polyfill.js', 'background/index.js'], persistent: true })
    expect(m.manifest_version).toBe(2)
    expect(lire('ui/popup/index.html')).toContain('<script src="../../browser-polyfill.js"></script>')
    expect(lire('ui/stylesheet-editor/index.html')).toMatch(/^<script src="..\/..\/browser-polyfill.js"><\/script>/)
    expect(suggestionChrome('addon@darkreader.org', 'Dark Reader')).toEqual({ id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh', nom: 'Dark Reader' })
  })
})

describe('Bitwarden (Firefox, MV2)', () => {
  it('sidebar_action retirée (il y a une action), commande de barre latérale retirée, permissions inconnues journalisées', async () => {
    preparer('bitwarden')
    const { manifest: m, rapport } = await convertir(dossier, options())
    expect(rapport.refus).toBeUndefined()
    expect(rapport.cles_retirees).toEqual(expect.arrayContaining(['sidebar_action', 'commands._execute_sidebar_action', 'browser_action.browser_style']))
    expect(rapport.permissions_retirees).toEqual(['browserSettings', 'internal:emailAutofill'])
    expect(m.permissions).toEqual(expect.arrayContaining(['webRequestBlocking', 'nativeMessaging', 'privacy', 'tabs']))
    expect(rapport.permissions_retirees).not.toContain('nativeMessaging')
    // MV2 : la commande de l'action garde son nom Chrome MV2
    expect(Object.keys(m.commands as object)).toContain('_execute_browser_action')
    expect(suggestionChrome('{446900e4-71c2-419f-a6a7-df9c091e268b}', 'Bitwarden Password Manager')).toEqual({ id: 'nngceckbapebfimnlniiiahkandclblb', nom: 'Bitwarden' })
  })
})

describe('Tree Style Tab : refus motivé', () => {
  it('sidebar_action seul moyen d\'interaction : refusé, dossier intact', async () => {
    preparer('tree-style-tab')
    const avant = lire('manifest.json')
    const { rapport } = await convertir(dossier, options())
    expect(rapport.refus).toMatch(/sidebar_action/)
    expect(lire('manifest.json')).toBe(avant)
    expect(existsSync(join(dossier, 'browser-polyfill.js'))).toBe(false)
  })

  it('le motif nomme sidebar_action et « seul moyen d\'interaction » ; avec une action, la même clé est seulement retirée', async () => {
    preparer('tree-style-tab')
    expect((await convertir(dossier, options())).rapport.refus).toMatch(/seul moyen d'interaction/)
    const m = JSON.parse(lire('manifest.json')) as Record<string, unknown>
    m.browser_action = { default_title: 'TST' }
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify(m))
    const { rapport } = await convertir(dossier, options())
    expect(rapport.refus).toBeUndefined()
    expect(rapport.cles_retirees).toEqual(expect.arrayContaining(['sidebar_action', 'theme_experiment']))
  })

  it('experiment_apis : refusé', async () => {
    preparer('dark-reader-ff')
    const m = JSON.parse(lire('manifest.json')) as Record<string, unknown>
    m.experiment_apis = { monApi: { schema: 'schema.json' } }
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify(m))
    expect((await convertir(dossier, options())).rapport.refus).toMatch(/experiment_apis/)
  })

  it('thème : refusé', async () => {
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify({ manifest_version: 2, name: 'T', version: '1', theme: { colors: {} } }))
    expect((await convertir(dossier, options())).rapport.refus).toMatch(/thème/)
  })

  it('manifest illisible ou version inconnue : refusé', async () => {
    writeFileSync(join(dossier, 'manifest.json'), '{ pas du json')
    expect((await convertir(dossier, options())).rapport.refus).toMatch(/illisible/)
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify({ manifest_version: 1 }))
    expect((await convertir(dossier, options())).rapport.refus).toMatch(/manifest_version/)
  })
})

describe('Return YouTube Dislike', () => {
  it('MV2 (fixture Firefox réelle) : conservé, et le rapport le dit', async () => {
    preparer('ryd-mv2', { 'popup.html': '<html><head></head></html>' })
    const { manifest: m, rapport } = await convertir(dossier, options())
    expect(rapport.refus).toBeUndefined()
    expect(m.manifest_version).toBe(2)
    expect(m.background).toEqual({ scripts: ['browser-polyfill.js', 'background.js'], persistent: true })
    expect(rapport.transformations).toContain('MV2 conservé : background.scripts gardé (persistent: true), avec browser-polyfill.js en tête')
    expect(existsSync(join(dossier, 'background.sw.js'))).toBe(false)
    expect(m.web_accessible_resources).toEqual(['ryd.script.js', 'ryd.script.js.map', 'icons/icon48.png'])
    expect(rapport.cles_retirees).toEqual(expect.arrayContaining(['browser_specific_settings', 'browser_action.browser_style', 'options_ui.browser_style']))
    expect(suggestionChrome('{762f9885-5a13-4abd-9c77-433dcd38b8fd}', 'Return YouTube Dislike')?.id).toBe('gebbhagfogifgggkldgodflihgfeippi')
  })

  it('MV3 Firefox avec background.scripts : service worker, CSP objet, WAR objets, hôtes dans host_permissions', async () => {
    preparer('ryd-mv3', { 'popup.html': '<html></html>' })
    const { manifest: m, rapport } = await convertir(dossier, options())
    expect(rapport.refus).toBeUndefined()
    expect(m.background).toEqual({ service_worker: 'background.sw.js' })
    expect(lire('background.sw.js')).toBe('importScripts("browser-polyfill.js", "background.js");\n')
    expect(m.content_security_policy).toEqual({ extension_pages: "script-src 'self'; object-src 'self'" })
    expect(m.web_accessible_resources).toEqual([{ resources: ['ryd.script.js', 'icons/icon48.png'], matches: ['<all_urls>'] }])
    expect(m.host_permissions).toEqual(['https://*.youtube.com/*'])
    expect(m.optional_host_permissions).toEqual(['https://returnyoutubedislikeapi.com/*'])
    expect(m.permissions).toEqual(['activeTab', 'storage', 'contextMenus'])
    expect(rapport.permissions_retirees).toEqual(['webRequestBlocking', 'tabHide'])
    expect(m.action).toEqual({ default_popup: 'popup.html' })
    expect(m.browser_action).toBeUndefined()
    expect(m.commands).toEqual({ _execute_action: { suggested_key: { default: 'Alt+Shift+R' } } })
    expect(rapport.transformations).toEqual(expect.arrayContaining(['permissions : menus → contextMenus', 'browser_action → action', 'commands._execute_browser_action → _execute_action']))
    expect((m.content_scripts as Array<{ js: string[] }>)[0].js).toEqual(['browser-polyfill.js', 'ryd.content-script.js'])
    expect(lire('popup.html')).toContain('<script src="browser-polyfill.js"></script>')
  })

  it("MV3 : une CSP que Chromium refuse est retirée avec avertissement", async () => {
    preparer('ryd-mv3')
    const m = JSON.parse(lire('manifest.json')) as Record<string, unknown>
    m.content_security_policy = "script-src 'self' 'unsafe-eval'; object-src 'self'"
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify(m))
    const r = (await convertir(dossier, options())).rapport
    expect(r.cles_retirees).toContain('content_security_policy')
    expect(JSON.parse(lire('manifest.json')).content_security_policy).toBeUndefined()
  })
})

describe('autres règles', () => {
  it('META-INF supprimé, clé écrite, commentaires du manifest tolérés', async () => {
    writeFileSync(join(dossier, 'manifest.json'), '﻿// commentaire\n{"manifest_version":2,"name":"A","version":"1.0","applications":{"gecko":{"id":"a@b"}}}')
    mkdirSync(join(dossier, 'META-INF'))
    writeFileSync(join(dossier, 'META-INF/mozilla.rsa'), 'x')
    const { manifest: m, rapport } = await convertir(dossier, options({ cle: 'Y2xl' }))
    expect(existsSync(join(dossier, 'META-INF'))).toBe(false)
    expect(rapport.cles_retirees).toEqual(['applications'])
    expect(m.key).toBe('Y2xl')
  })

  it('icône SVG convertie en PNG, références réécrites, rapport', async () => {
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify({ manifest_version: 2, name: 'A', version: '1.0', icons: { '48': 'img/a.svg' }, browser_action: { default_icon: 'img/a.svg' } }))
    mkdirSync(join(dossier, 'img'))
    writeFileSync(join(dossier, 'img/a.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const tailles: number[] = []
    const { manifest: m, rapport } = await convertir(dossier, options({ svgVersPng: async (_svg, t) => (tailles.push(t), Buffer.from('PNG' + t)) }))
    expect(m.icons).toEqual({ '48': 'img/a-48.png' })
    expect((m.browser_action as { default_icon: string }).default_icon).toBe('img/a-128.png')
    expect(tailles).toEqual([48, 128])
    expect(readFileSync(join(dossier, 'img/a-48.png'), 'utf8')).toBe('PNG48')
    expect(rapport.transformations.filter((t) => t.startsWith('icône SVG → PNG'))).toHaveLength(2)
  })

  it('chemin d\'icône hors du dossier : jamais lu', async () => {
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify({ manifest_version: 2, name: 'A', version: '1.0', icons: { '48': '../../secret.svg' } }))
    let lu = false
    const { rapport } = await convertir(dossier, options({ svgVersPng: async () => ((lu = true), Buffer.from('x')) }))
    expect(lu).toBe(false)
    expect(rapport.avertissements[0]).toMatch(/introuvable|retirée/)
  })

  it("module d'arrière-plan MV3 : service worker en modules ES", async () => {
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'A', version: '1.0', background: { scripts: ['/bg.js'], type: 'module' } }))
    const { manifest: m } = await convertir(dossier, options())
    expect(m.background).toEqual({ service_worker: 'background.sw.js', type: 'module' })
    expect(lire('background.sw.js')).toBe('import "./browser-polyfill.js";\nimport "./bg.js";\n')
  })

  it("un fichier de même nom mais différent n'est pas écrasé : l'en-tête prend le préfixe lyra-", async () => {
    writeFileSync(join(dossier, 'browser-polyfill.js'), '/* celui de l\'extension */')
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify({ manifest_version: 2, name: 'A', version: '1.0', background: { scripts: ['b.js'] } }))
    const { manifest: m } = await convertir(dossier, options())
    expect((m.background as { scripts: string[] }).scripts).toEqual(['lyra-browser-polyfill.js', 'b.js'])
    expect(lire('browser-polyfill.js')).toBe("/* celui de l'extension */")
  })

  it('commande ordinaire sans description : description ajoutée', async () => {
    writeFileSync(join(dossier, 'manifest.json'), JSON.stringify({ manifest_version: 2, name: 'A', version: '1.0', commands: { ouvrir: { suggested_key: { default: 'Ctrl+Y' } } } }))
    const { manifest: m } = await convertir(dossier, options())
    expect((m.commands as Record<string, { description: string }>).ouvrir.description).toBe('ouvrir')
  })
})

describe('identité stable', () => {
  it("la clé dérive de la graine : même graine, même identifiant ; autre graine, autre identifiant", () => {
    const a = cleDepuisGraine('addon@darkreader.org')
    expect(cleDepuisGraine('addon@darkreader.org')).toBe(a)
    expect(idDepuisCle(a)).toMatch(/^[a-p]{32}$/)
    expect(idDepuisCle(cleDepuisGraine('autre@exemple.org'))).not.toBe(idDepuisCle(a))
  })
})

describe('polyfill embarqué', () => {
  it('resources/extensions/browser-polyfill.js est celui de webextension-polyfill 0.12.0', () => {
    const embarque = readFileSync(resolve(__dirname, '../../../resources/extensions/browser-polyfill.js'))
    const paquet = resolve(__dirname, '../../../node_modules/webextension-polyfill')
    expect(JSON.parse(readFileSync(join(paquet, 'package.json'), 'utf8')).version).toBe('0.12.0')
    expect(embarque.equals(readFileSync(join(paquet, 'dist/browser-polyfill.js')))).toBe(true)
  })
})
