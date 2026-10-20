import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'

const FIXTURES_EXT = resolve(__dirname, '../../src/main/extensions/fixtures')
const ID_FIXTURE = 'eagihioebnkdnlbdklhbioanjmaamgag'
const LIENS = readFileSync(resolve(__dirname, 'fixtures/liens.html'), 'utf8')

// Une extension chargée avec allowFileAccess: false n'agit pas sur file:// : la page de fixture est servie en http local.
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

const pageFixture = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url().startsWith(urlPage))
const marqueur = (p: Page): Promise<string | undefined> => p.evaluate(() => document.documentElement.dataset.lyraExtension)

test("l'extension de fixture marque la page, se désactive à chaud et se désinstalle", async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_EXTENSIONS_FIXTURES: FIXTURES_EXT })
  try {
    // Registre : la fixture est installée et chargée.
    const liste = await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))
    expect(liste).toHaveLength(1)
    expect(liste[0]).toMatchObject({ id: ID_FIXTURE, active: true, chargee: true, source: 'dossier' })

    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), urlPage)
    await expect.poll(() => pageFixture(app)).toBeDefined()
    const page = pageFixture(app)!
    await expect.poll(() => marqueur(page)).toBe('ok')

    // Désactivation à chaud : la page rechargée n'a plus le marqueur.
    expect(await fenetre.evaluate((id) => window.lyra.invoke('extensions:activer', { id, active: false }), ID_FIXTURE)).toBe(true)
    const apres = await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))
    expect(apres[0]).toMatchObject({ active: false, chargee: false })
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    expect(await marqueur(page)).toBeUndefined()

    // Réactivation : le marqueur revient.
    expect(await fenetre.evaluate((id) => window.lyra.invoke('extensions:activer', { id, active: true }), ID_FIXTURE)).toBe(true)
    await page.reload()
    await expect.poll(() => marqueur(page)).toBe('ok')

    // Identifiant invalide : refusé sans effet.
    expect(await fenetre.evaluate(() => window.lyra.invoke('extensions:activer', { id: '../x', active: false }))).toBe(false)
    expect(await fenetre.evaluate(() => window.lyra.invoke('extensions:desinstaller', { id: '../x' }))).toBe(false)

    // Désinstallation : plus dans le registre.
    expect(await fenetre.evaluate((id) => window.lyra.invoke('extensions:desinstaller', { id }), ID_FIXTURE)).toBe(true)
    expect(await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))).toEqual([])
    const reglages = await fenetre.evaluate(() => window.lyra.invoke('settings:get'))
    expect(reglages.extensions.installees).toEqual([])
  } finally {
    await app.close()
  }
})

test('sans fixture, la liste des extensions est vide', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    expect(await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))).toEqual([])
  } finally {
    await app.close()
  }
})
