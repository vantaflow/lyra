import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'

// Colonne et détail « Extensions » de « Règles par site » (Tâche 20), sur l'extension de fixture de B (jamais une vraie extension).
const FIXTURES_EXT = resolve(__dirname, '../../src/main/extensions/fixtures')
const ID = 'eagihioebnkdnlbdklhbioanjmaamgag'
const NOM = 'Lyra fixture minimale'

const page = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

async function ouvrir(app: ElectronApplication, fenetre: Page, route: string): Promise<Page> {
  await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), `lyra://settings#/${route}`)
  await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
  const r = page(app, 'lyra://settings')!
  await r.evaluate((h) => { location.hash = h }, `#/${route}`)
  return r
}
const cellule = (r: Page, site: string) => r.locator(`tr[data-site="${site}"] td:nth-child(5)`)

test('Règles par site : colonne Extensions calculée (Toutes / Aucune / héritée), détail ✓/✗ et « Modifier » au format de B', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra({ LYRA_EXTENSIONS_FIXTURES: FIXTURES_EXT })
  try {
    expect((await fenetre.evaluate(() => window.lyra.invoke('extensions:lister')))[0]).toMatchObject({ id: ID, active: true })
    // Règles écrites au format de B (`settings:set`) : bloquée sur un site, motif qui la bloque, site sans règle d'extension.
    await fenetre.evaluate((id) => window.lyra.invoke('settings:set', {
      sites: { 'bloque.fr': { boucliers: 'standard', extensions: { [id]: false } }, '*.motif.fr': { extensions: { [id]: false } }, 'www.motif.fr': { boucliers: 'standard' }, 'libre.fr': { boucliers: 'standard' } }
    }), ID)
    const r = await ouvrir(app, fenetre, 'sites')
    await expect(cellule(r, 'bloque.fr')).toHaveText('Aucune')
    await expect(cellule(r, 'libre.fr')).toHaveText('Toutes')
    await expect(cellule(r, 'www.motif.fr')).toHaveText(/Aucune\s*hérité/)

    // Détail du site bloqué : ✗, puis autoriser → la règle ne porte plus `extensions`.
    await r.locator('tr[data-site="bloque.fr"]').click()
    const ligne = r.locator('[data-reglage="sites.extensions"]')
    await expect(ligne).toContainText(`${NOM} ✗`)
    await ligne.getByRole('button', { name: 'Modifier' }).click()
    await ligne.getByRole('checkbox', { name: NOM }).check()
    await ligne.getByRole('button', { name: 'Appliquer' }).click()
    await expect(ligne).toContainText(`${NOM} ✓`)
    await expect(cellule(r, 'bloque.fr')).toHaveText('Toutes')
    expect((await fenetre.evaluate(() => window.lyra.invoke('sites:lister')))['bloque.fr']).toEqual({ boucliers: 'standard' })

    // Détail d'un site libre : bloquer écrit `false` seulement pour l'extension bloquée.
    await r.locator('tr[data-site="libre.fr"]').click()
    await ligne.getByRole('button', { name: 'Modifier' }).click()
    await ligne.getByRole('checkbox', { name: NOM }).uncheck()
    await ligne.getByRole('button', { name: 'Appliquer' }).click()
    await expect(cellule(r, 'libre.fr')).toHaveText('Aucune')
    expect((await fenetre.evaluate(() => window.lyra.invoke('sites:lister')))['libre.fr']).toMatchObject({ extensions: { [ID]: false } })
    // Plus de contrôle inerte ni de « Bientôt » pour les extensions.
    await expect(ligne.getByText('Bientôt')).toHaveCount(0)
    await expect(ligne.getByRole('button', { name: 'Modifier' })).toBeEnabled()
  } finally {
    await app.close()
  }
})

test('À propos : version lue de l’application, licences (dont GPL-3.0 d’electron-chrome-extensions) et lien vers les versions publiées', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const version = await app.evaluate(({ app: a }) => a.getVersion())
    const r = await ouvrir(app, fenetre, 'apropos')
    await expect(r.getByText(`Version ${version} · Navigateur sous licence GPL-3.0`)).toBeVisible()
    await expect(r.getByText(/electron-chrome-extensions, sous licence GPL-3\.0/)).toBeVisible()
    await expect(r.getByText(/Ghostery adblocker, sous licence MPL-2\.0/)).toBeVisible()
    await expect(r.locator('#lien-releases')).toHaveAttribute('href', 'https://github.com/vantaflow/lyra/releases')
  } finally {
    await app.close()
  }
})
