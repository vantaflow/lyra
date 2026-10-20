import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'
import type { EtatBoucliers } from '../../src/shared/ipc'

const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/pub.html')).href

const etat = (f: Page): Promise<EtatBoucliers> => f.evaluate(() => window.lyra.invoke('shields:get'))
const pagePub = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url() === FIXTURE)
const resultat = (p: Page): Promise<string> => p.evaluate(() => document.getElementById('resultat')?.textContent ?? '')

// Le DNS de la machine de test renvoie 0.0.0.0 pour les domaines de pub : on vérifie donc le compteur du
// moteur (la requête a bien été annulée par Lyra), pas seulement l'échec réseau.
test('les Boucliers bloquent une pub et se désactivent par site', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)
    await expect.poll(() => pagePub(app)).toBeDefined()
    const page = pagePub(app)!
    await expect.poll(() => resultat(page)).toContain('ERR')
    await expect.poll(async () => (await etat(fenetre)).bloques).toBeGreaterThanOrEqual(1)
    const avant = await etat(fenetre)
    expect(avant).toMatchObject({ actif: true, origine: 'file://' })
    expect(avant.dernieres[0]).toContain('pagead2.googlesyndication.com')
    // Le pied du ciel affiche le compteur de l'étoile active.
    await expect(fenetre.locator('.boucliers-n')).toHaveText(String(avant.bloques))

    // Le panneau s'ouvre depuis le bouclier du pied.
    await fenetre.locator('.boucliers').click()
    await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
    const overlay = app.windows().find((w) => w.url().includes('#overlay'))!
    await expect(overlay.locator('.pn-bouclier')).toBeVisible()
    await expect(overlay.locator('.pn-nom')).toHaveText('fichiers locaux')
    await expect(overlay.locator('.pn-n').first()).toHaveText(String(avant.bloques))

    // Désactivation pour file:// depuis l'interrupteur : la page est rechargée sans blocage.
    await overlay.locator('.pn-tete .tg').click()
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(false)
    await expect.poll(() => resultat(page).catch(() => '')).not.toBe('')
    await page.waitForTimeout(500)
    expect((await etat(fenetre)).bloques).toBe(0)
    const reglages = await fenetre.evaluate(() => window.lyra.invoke('settings:get'))
    expect(reglages.sites['file://']).toEqual({ boucliers: 'desactives' })
  } finally {
    await app.close()
  }
})
