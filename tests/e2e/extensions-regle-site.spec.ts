import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { lancerLyra } from './helpers'

// Règle par site des extensions APPLIQUÉE : sur un site bloqué, les content scripts du manifest ne s'exécutent plus (fixture de B, jamais une vraie extension).
const FIXTURES_EXT = resolve(__dirname, '../../src/main/extensions/fixtures')
const ID = 'eagihioebnkdnlbdklhbioanjmaamgag'
const LIENS = readFileSync(resolve(__dirname, 'fixtures/liens.html'), 'utf8')

const serveurs: Server[] = []
const ports: number[] = []
test.beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    const s = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(LIENS)
    })
    await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok))
    serveurs.push(s)
    const a = s.address()
    ports.push(typeof a === 'object' && a ? a.port : 0)
  }
})
test.afterAll(() => Promise.all(serveurs.map((s) => new Promise<void>((ok) => s.close(() => ok())))))

const pageDe = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))
const marqueur = (p: Page): Promise<string | undefined> => p.evaluate(() => document.documentElement.dataset.lyraExtension)

test("la règle { [id]: false } d'un site retire les scripts de contenu de l'extension, la lever les rétablit, un autre site reste marqué", async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra({ LYRA_EXTENSIONS_FIXTURES: FIXTURES_EXT })
  try {
    const urlA = `http://127.0.0.1:${ports[0]}/liens.html`
    const urlB = `http://localhost:${ports[1]}/liens.html`
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), urlA)
    await expect.poll(() => pageDe(app, urlA)).toBeDefined()
    const a = pageDe(app, urlA)!
    await expect.poll(() => marqueur(a)).toBe('ok')
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), urlB)
    await expect.poll(() => pageDe(app, urlB)).toBeDefined()
    const b = pageDe(app, urlB)!
    await expect.poll(() => marqueur(b)).toBe('ok')

    const dossierUser = await app.evaluate(({ app: x }) => x.getPath('userData'))
    const manifest = (): string => readFileSync(join(dossierUser, 'extensions', ID, '1.0.0', 'manifest.json'), 'utf8')
    const attendreRechargee = async (motif: boolean): Promise<void> => {
      await expect.poll(manifest).toEqual(motif ? expect.stringContaining(`127.0.0.1:${ports[0]}/*`) : expect.not.stringContaining('127.0.0.1'))
      await expect.poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('extensions:lister')))[0]?.chargee).toBe(true)
    }

    // Blocage de l'origine A : après rechargement de la page, plus de marqueur ; B reste marquée.
    expect(await fenetre.evaluate(([id, o]) => window.lyra.invoke('extensions:regleSite', { id, origine: o, active: false }), [ID, `http://127.0.0.1:${ports[0]}`])).toBe(true)
    await attendreRechargee(true)
    await a.reload()
    await a.waitForLoadState('domcontentloaded')
    expect(await marqueur(a)).toBeUndefined()
    await b.reload()
    await expect.poll(() => marqueur(b)).toBe('ok')

    // Règle levée : A de nouveau marquée.
    expect(await fenetre.evaluate(([id, o]) => window.lyra.invoke('extensions:regleSite', { id, origine: o, active: true }), [ID, `http://127.0.0.1:${ports[0]}`])).toBe(true)
    await attendreRechargee(false)
    await a.reload()
    await expect.poll(() => marqueur(a)).toBe('ok')
  } finally {
    await app.close()
  }
})
