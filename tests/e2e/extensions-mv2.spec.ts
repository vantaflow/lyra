import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { lancerLyra } from './helpers'

/**
 * Extension MV2 réduite façon uBlock Origin : l'arrière-plan appelle des API que ni Electron ni electron-chrome-extensions
 * ne fournissent en MV2 (`pageAction`, `menus`, `dns` : planterait sans stubs), puis pose un blocage `webRequest` ; les
 * appels qui suivent prouvent que le script est allé au bout. `browserAction` est natif (non compté).
 */
function zipMv2(): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(
      JSON.stringify({
        manifest_version: 2,
        name: 'Mini bloqueur MV2',
        version: '1.0.0',
        permissions: ['webRequest', 'webRequestBlocking', '<all_urls>', 'declarativeNetRequest'],
        background: { scripts: ['bg.js'] },
        browser_action: { default_title: 'Mini' }
      })
    ),
    'bg.js': strToU8(
      `chrome.browserAction.setBadgeText({ text: '1' })
chrome.pageAction.show(1)
chrome.webRequest.onBeforeRequest.addListener(() => ({ cancel: false }), { urls: ['<all_urls>'] }, ['blocking'])
chrome.pageAction.show(2)
chrome.menus.create({ id: 'm', title: 'x' })
chrome.dns.resolve('example.org', [], () => {})
`
    )
  })
}

test("extension MV2 : démarre grâce aux stubs, l'API ignorée est comptée, redondance avec les Boucliers", async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'lyra-mv2-'))
  const zip = join(dossier, 'mini-mv2.zip')
  writeFileSync(zip, zipMv2())
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await fenetre.evaluate((s) => window.lyra.invoke('extensions:installer', { source: s }), zip)
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    const id = r.id
    const journal = async () => fenetre.evaluate((i) => window.lyra.invoke('extensions:journal', { id: i }), id)
    // Le second `pageAction.show` n'a lieu que si le premier n'a pas planté.
    await expect.poll(async () => (await journal())?.apiStubees['pageAction.show'], { timeout: 20_000 }).toBe(2)
    const j = (await journal())!
    console.log('journal :', JSON.stringify(j))
    expect(j.apiStubees).toEqual({ 'pageAction.show': 2, 'menus.create': 1, 'dns.resolve': 1 })
    expect(j.redondanceBoucliers).toBe(true)
    expect(j.noteBoucliers).toBe('blocage réseau assuré par les Boucliers')
    expect(j.apiManquantes).toContain('declarativeNetRequest')
    // Aucune erreur dans la console de l'arrière-plan.
    expect(j.avertissementsChargement.filter((m) => m.startsWith('erreur'))).toEqual([])
    expect(await fenetre.evaluate(() => window.lyra.invoke('extensions:journal', { id: 'x'.repeat(32) }))).toBeUndefined()
  } finally {
    await app.close()
  }
})
