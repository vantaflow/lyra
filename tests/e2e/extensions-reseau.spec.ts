import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'

const ID_DARK_READER = 'eimadpbcbfnmbkopoojfekhnkhdbieeh'
const LIENS = readFileSync(resolve(__dirname, 'fixtures/liens.html'), 'utf8')

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

test('@reseau Dark Reader depuis le Chrome Web Store agit sur une page', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await fenetre.evaluate((id) => window.lyra.invoke('extensions:installer', { source: id }), ID_DARK_READER)
    expect(r.etat === 'installee' ? 'ok' : JSON.stringify(r)).toBe('ok')
    expect(r).toMatchObject({ etat: 'installee', id: ID_DARK_READER })
    const liste = await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))
    expect(liste[0]).toMatchObject({ id: ID_DARK_READER, source: 'cws', magasin: 'chrome', active: true, chargee: true })

    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), urlPage)
    await expect.poll(() => pageTest(app)).toBeDefined()
    const page = pageTest(app)!
    await expect.poll(() => page.evaluate(() => document.querySelector('style.darkreader') !== null), { timeout: 30_000 }).toBe(true)
  } finally {
    await app.close()
  }
})

test('@reseau Dark Reader depuis addons.mozilla.org (xpi converti) agit sur une page', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await fenetre.evaluate(() => window.lyra.invoke('extensions:installer', { source: 'darkreader' }))
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    expect(r).toMatchObject({ nom: 'Dark Reader', convertie: true })
    console.log('rapport de conversion :', JSON.stringify(r.rapport))
    const liste = await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))
    expect(liste[0]).toMatchObject({ id: r.id, source: 'amo', magasin: 'firefox', convertie: true, active: true, chargee: true })

    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), urlPage)
    await expect.poll(() => pageTest(app)).toBeDefined()
    const page = pageTest(app)!
    await expect.poll(() => page.evaluate(() => document.querySelector('style.darkreader') !== null), { timeout: 30_000 }).toBe(true)
  } finally {
    await app.close()
  }
})

test('@reseau uBlock Origin (release GitHub, MV2) démarre sans erreur et le journal note la redondance avec les Boucliers', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await fenetre.evaluate(() => window.lyra.invoke('extensions:installer', { source: 'ubo' }))
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    const journal = () => fenetre.evaluate((i) => window.lyra.invoke('extensions:journal', { id: i }), r.id)
    await expect.poll(async () => (await journal())?.redondanceBoucliers, { timeout: 20_000 }).toBe(true)
    // Laisse l'arrière-plan s'initialiser puis relève les appels stubés.
    await new Promise((ok) => setTimeout(ok, 8000))
    const j = (await journal())!
    console.log('journal uBO :', JSON.stringify(j))
    expect(j.noteBoucliers).toBe('blocage réseau assuré par les Boucliers')
    expect(j.avertissementsChargement.filter((m) => m.startsWith('erreur'))).toEqual([])
    // L'arrière-plan de uBO est allé au bout de son initialisation (vAPI défini, pas de TypeError sur browserAction).
    expect(await app.evaluate(async ({ webContents }) => {
      const w = webContents.getAllWebContents().find((x) => x.getType() === 'backgroundPage')
      return w ? await w.executeJavaScript('typeof globalThis.vAPI === "object" && typeof vAPI.browserAction === "object"') : false
    })).toBe(true)
    const liste = await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))
    expect(liste[0]).toMatchObject({ id: r.id, chargee: true })
  } finally {
    await app.close()
  }
})
