import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { lancerLyra } from './helpers'

const FIXTURE = resolve(__dirname, '../../src/main/extensions/fixtures/minimale-mv3')
const ID_FIXTURE = 'eagihioebnkdnlbdklhbioanjmaamgag'
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

const pageFixture = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url().startsWith(urlPage))
const marqueur = (p: Page): Promise<string | undefined> => p.evaluate(() => document.documentElement.dataset.lyraExtension)

/** Zip de la fixture MV3 (fichiers à la racine de l'archive). */
function zipFixture(): Uint8Array {
  const fichiers: Record<string, Uint8Array> = {}
  for (const nom of readdirSync(FIXTURE)) fichiers[nom] = readFileSync(join(FIXTURE, nom))
  return zipSync(fichiers)
}

test("installer un .zip : l'extension est enregistrée, chargée et marque la page ; un zip hostile est refusé", async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'lyra-zip-'))
  const bon = join(dossier, 'fixture.zip')
  writeFileSync(bon, zipFixture())
  const mauvais = join(dossier, 'hostile.zip')
  writeFileSync(mauvais, zipSync({ 'manifest.json': strToU8('{}'), '../evil.js': strToU8('x') }))

  const { app, fenetre } = await lancerLyra()
  try {
    const refus = await fenetre.evaluate((s) => window.lyra.invoke('extensions:installer', { source: s }), mauvais)
    expect(refus.etat).toBe('erreur')
    expect(await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))).toEqual([])

    const r = await fenetre.evaluate((s) => window.lyra.invoke('extensions:installer', { source: s }), bon)
    expect(r).toMatchObject({ etat: 'installee', id: ID_FIXTURE, version: '1.0.0' })
    const liste = await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))
    expect(liste).toHaveLength(1)
    expect(liste[0]).toMatchObject({ id: ID_FIXTURE, source: 'zip', active: true, chargee: true })

    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), urlPage)
    await expect.poll(() => pageFixture(app)).toBeDefined()
    await expect.poll(() => marqueur(pageFixture(app)!)).toBe('ok')

    // Source inconnue : refus propre.
    expect(await fenetre.evaluate(() => window.lyra.invoke('extensions:installer', { source: '???' }))).toMatchObject({ etat: 'erreur' })
  } finally {
    await app.close()
  }
})
