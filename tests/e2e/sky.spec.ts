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

test('le ciel et la page prennent toute la hauteur, pied ancré en bas', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const haut = await fenetre.evaluate(() => window.innerHeight)
    const pied = await fenetre.locator('.ciel-pied').boundingBox()
    // Le ciel a 12 px de marge basse (design) : le pied doit y être collé.
    expect(pied!.y + pied!.height).toBeGreaterThanOrEqual(haut - 12 - 2)
    const ciel = await fenetre.locator('.ciel').boundingBox()
    expect(ciel!.y + ciel!.height).toBeGreaterThanOrEqual(haut - 2)
    const carte = await fenetre.locator('.carte').boundingBox()
    expect(carte!.y + carte!.height).toBeGreaterThanOrEqual(haut - 2)
  } finally {
    await app.close()
  }
})

test('la capsule : précédent désactivé, la pilule ouvre la palette', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await expect(fenetre.locator('.cb[aria-label="Page précédente"]')).toBeDisabled()
    await fenetre.locator('.pilule').click()
    await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
    const overlay = app.windows().find((w) => w.url().includes('#overlay'))!
    await expect(overlay.locator('#palette')).toBeFocused()
  } finally {
    await app.close()
  }
})
