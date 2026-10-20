import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { lancerLyra } from './helpers'

const LIENS = readFileSync(resolve(__dirname, 'fixtures/liens.html'), 'utf8')
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#c0392b"/></svg>'

let serveur: Server
let urlPage = ''
test.beforeAll(async () => {
  serveur = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(LIENS)
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  const adresse = serveur.address()
  urlPage = `http://127.0.0.1:${typeof adresse === 'object' && adresse ? adresse.port : 0}/liens.html`
})
test.afterAll(() => new Promise<void>((ok) => serveur.close(() => ok())))

const pageTest = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url().startsWith(urlPage))

/** Mini extension Firefox MV2 : un content script qui passe par browser.storage.local (polyfill requis) puis pose un marqueur. */
function xpiMini(): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(
      JSON.stringify({
        manifest_version: 2,
        name: 'Mini Firefox',
        version: '1.0.0',
        browser_specific_settings: { gecko: { id: 'mini-firefox@lyra.test' } },
        icons: { '48': 'icon.svg' },
        permissions: ['storage', 'theme', 'http://127.0.0.1/*'],
        content_scripts: [{ matches: ['http://127.0.0.1/*'], js: ['cs.js'], run_at: 'document_idle' }]
      })
    ),
    'cs.js': strToU8("browser.storage.local.set({ m: 'ok' }).then(() => browser.storage.local.get('m')).then((r) => { document.documentElement.dataset.lyraXpi = r.m })"),
    'icon.svg': strToU8(SVG),
    'META-INF/mozilla.rsa': strToU8('signature')
  })
}

test('installer un .xpi : converti, chargé, content script avec browser.* qui marque la page ; Tree Style Tab refusé', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'lyra-xpi-'))
  const xpi = join(dossier, 'mini.xpi')
  writeFileSync(xpi, xpiMini())
  const tst = join(dossier, 'tst.xpi')
  writeFileSync(
    tst,
    zipSync({
      'manifest.json': strToU8(JSON.stringify({ manifest_version: 2, name: 'Tree Style Tab', version: '3', sidebar_action: { default_panel: 'sidebar.html' }, background: { scripts: ['b.js'] } })),
      'b.js': strToU8('//')
    })
  )

  const { app, fenetre } = await lancerLyra()
  try {
    const refus = await fenetre.evaluate((s) => window.lyra.invoke('extensions:installer', { source: s }), tst)
    expect(refus).toMatchObject({ etat: 'erreur' })
    expect(refus.etat === 'erreur' && refus.raison).toMatch(/sidebar_action/)
    expect(await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))).toEqual([])

    const r = await fenetre.evaluate((s) => window.lyra.invoke('extensions:installer', { source: s }), xpi)
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    expect(r).toMatchObject({ nom: 'Mini Firefox', version: '1.0.0', convertie: true })
    expect(r.rapport?.permissions_retirees).toEqual(['theme'])
    const liste = await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))
    expect(liste[0]).toMatchObject({ id: r.id, source: 'xpi', magasin: 'firefox', convertie: true, active: true, chargee: true })

    // L'icône SVG a été convertie en PNG par la fenêtre cachée.
    const userData = await app.evaluate(() => process.env.LYRA_USER_DATA ?? '')
    const dossierExt = join(userData, 'extensions', r.id, '1.0.0')
    expect(r.rapport?.transformations.some((t) => t.startsWith('icône SVG → PNG'))).toBe(true)
    const png = readFileSync(join(dossierExt, 'icon-48.png'))
    expect(png.subarray(0, 4).toString('hex')).toBe('89504e47')
    expect(existsSync(join(dossierExt, 'META-INF'))).toBe(false)

    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), urlPage)
    await expect.poll(() => pageTest(app)).toBeDefined()
    await expect.poll(() => pageTest(app)!.evaluate(() => document.documentElement.dataset.lyraXpi), { timeout: 20_000 }).toBe('ok')
  } finally {
    await app.close()
  }
})
