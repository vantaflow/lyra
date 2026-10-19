import { test, expect, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'

// Sous LYRA_TEST=1 l'historique enregistre aussi file:// (enregistrerFichiers) : la fixture locale suffit.
const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href

const page = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

test('naviguer puis lyra://history affiche l’entrée ; la suppression la retire', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), FIXTURE)
    await expect
      .poll(() => fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: 'liens' })).then((r) => r.length))
      .toBe(1)
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://history'))
    await expect.poll(() => page(app, 'lyra://history')).toBeDefined()
    const h = page(app, 'lyra://history')!
    await expect(h.locator('h1')).toHaveText('Historique')
    await expect(h.locator('.jour h2')).toHaveText("Aujourd'hui")
    await expect(h.locator('.entree .titre')).toHaveText('Liens')
    await expect(h.locator('.entree .url')).toHaveText(FIXTURE)
    await h.getByRole('button', { name: /Supprimer/ }).click()
    await expect(h.locator('.entree')).toHaveCount(0)
    expect(await fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: '' }))).toEqual([])
  } finally {
    await app.close()
  }
})

test('l’étoile de la capsule se remplit après bookmarks:toggle et lyra://bookmarks liste l’entrée', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), FIXTURE)
    const etoile = fenetre.locator('.capsule .cb[aria-label$="aux favoris"], .capsule .cb[aria-label$="des favoris"]')
    await expect(etoile).toHaveAttribute('aria-label', 'Ajouter aux favoris')
    expect(await fenetre.evaluate((u) => window.lyra.invoke('bookmarks:toggle', { url: u, title: 'Liens' }), FIXTURE)).toBe(true)
    await expect(etoile).toHaveAttribute('aria-label', 'Retirer des favoris')
    await expect(etoile.locator('svg')).toHaveAttribute('fill', 'currentColor')
    expect(await fenetre.evaluate((u) => window.lyra.invoke('bookmarks:exists', { url: u }), FIXTURE)).toBe(true)

    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://bookmarks'))
    await expect.poll(() => page(app, 'lyra://bookmarks')).toBeDefined()
    const f = page(app, 'lyra://bookmarks')!
    await expect(f.locator('h1')).toHaveText('Favoris')
    await expect(f.locator('.entree .titre')).toHaveText('Liens')
    await f.getByRole('button', { name: /Retirer/ }).click()
    await expect(f.locator('.entree')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
