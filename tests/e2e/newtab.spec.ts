import { test, expect, type Page } from '@playwright/test'
import { lancerLyra } from './helpers'

test('lyra://newtab affiche « Bonsoir. » dans la vue de page', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    // Départ sur lyra://newtab ; on passe par les réglages pour tester une vraie navigation.
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings/historique'))
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://newtab'))
    const trouver = (): Page | undefined => app.windows().find((w) => w.url().startsWith('lyra://newtab'))
    await expect.poll(trouver).toBeDefined()
    const page = trouver()!
    await expect(page.getByText('Bonsoir.')).toBeVisible()
    await expect(page.getByText('Aucune donnée ne quitte cet ordinateur.')).toBeVisible()
    expect(await page.evaluate(() => typeof window.lyra.invoke)).toBe('function')
  } finally {
    await app.close()
  }
})
