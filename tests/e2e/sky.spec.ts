import { test, expect } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'

const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href

test('le ciel affiche les étoiles, la capsule la page active', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://newtab' }))
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)

    const etoiles = fenetre.locator('.star')
    // La première étoile (newtab de départ) + les deux ouvertes.
    await expect(etoiles).toHaveCount(3)
    await expect(etoiles.last()).toHaveClass(/active/)
    await expect(etoiles.last().locator('.t')).toHaveText('Liens')
    await expect(etoiles.first().locator('.t')).toHaveText('Nouvelle étoile')

    // Fichier local : la pilule dit « fichier local » suivi du nom du fichier.
    await expect(fenetre.locator('.pilule')).toContainText('fichier local')
    await expect(fenetre.locator('.pilule')).toContainText('liens.html')

    // Le × ferme l'étoile.
    await etoiles.last().hover()
    await etoiles.last().locator('.x').click()
    await expect(etoiles).toHaveCount(2)
    await expect(etoiles.last()).toHaveClass(/active/)
  } finally {
    await app.close()
  }
})

test('la capsule : précédent désactivé, palette émise', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await expect(fenetre.locator('.cb[aria-label="Page précédente"]')).toBeDisabled()
    await fenetre.evaluate(() => {
      ;(window as unknown as { __palette: number }).__palette = 0
      window.lyra.on('palette:open', () => ((window as unknown as { __palette: number }).__palette += 1))
    })
    await fenetre.locator('.pilule').click()
    await expect.poll(() => fenetre.evaluate(() => (window as unknown as { __palette: number }).__palette)).toBe(1)
  } finally {
    await app.close()
  }
})
