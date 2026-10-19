import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'
import { lancerLyra } from './helpers'

const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/telechargement.html')).href
const page = (app: ElectronApplication, url: string): Page | undefined => app.windows().find((w) => w.url().replace(/\/$/, '') === url)
const liste = (f: Page) => f.evaluate(() => window.lyra.invoke('downloads:list'))

test('un lien download aboutit à une entrée terminée, au fichier présent et à la ligne du panneau', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const userData = await app.evaluate(({ app: a }) => a.getPath('userData'))
    const dossier = join(userData, 'dl')
    await fenetre.evaluate((d) => window.lyra.invoke('settings:set', { telechargements: { dossier: d, demander: false } }), dossier)

    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)
    await expect.poll(() => page(app, FIXTURE)).toBeDefined()
    await page(app, FIXTURE)!.locator('#dl').click()

    await expect.poll(async () => (await liste(fenetre))[0]?.etat).toBe('termine')
    const [d] = await liste(fenetre)
    expect(d).toMatchObject({ nom: 'fichier.txt', chemin: join(dossier, 'fichier.txt') })
    expect(existsSync(join(dossier, 'fichier.txt'))).toBe(true)
    expect(readFileSync(join(dossier, 'fichier.txt'), 'utf8')).toBe('Bonjour depuis Lyra.\n')

    // Le panneau s'ouvre depuis le bouton du pied du ciel et affiche la ligne.
    await fenetre.getByRole('button', { name: 'Téléchargements' }).click()
    await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
    const overlay = app.windows().find((w) => w.url().includes('#overlay'))!
    await expect(overlay.locator('.pn-dl')).toBeVisible()
    await expect(overlay.locator('.dl-nom')).toHaveText('fichier.txt')
    await expect(overlay.locator('.dl-ext')).toHaveText('TXT')
    await expect(overlay.locator('.dl-etat')).toHaveText(/^Terminé · \d+ o · Téléchargements$/)

    // Un second téléchargement du même fichier reçoit un nom unique.
    await page(app, FIXTURE)!.locator('#dl').click()
    await expect.poll(async () => (await liste(fenetre)).filter((x) => x.etat === 'termine').length).toBe(2)
    expect(existsSync(join(dossier, 'fichier (2).txt'))).toBe(true)
  } finally {
    await app.close()
  }
})

test('lyra://downloads liste le téléchargement ; « Effacer la liste » la vide', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const userData = await app.evaluate(({ app: a }) => a.getPath('userData'))
    await fenetre.evaluate((d) => window.lyra.invoke('settings:set', { telechargements: { dossier: d, demander: false } }), join(userData, 'dl'))
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)
    await expect.poll(() => page(app, FIXTURE)).toBeDefined()
    await page(app, FIXTURE)!.locator('#dl').click()
    await expect.poll(async () => (await liste(fenetre))[0]?.etat).toBe('termine')

    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://downloads'))
    await expect.poll(() => page(app, 'lyra://downloads')).toBeDefined()
    const p = page(app, 'lyra://downloads')!
    await expect(p.locator('h1')).toHaveText('Téléchargements')
    await expect(p.locator('.dl-nom')).toHaveText('fichier.txt')
    await p.locator('#effacer-telechargements').click()
    await expect(p.locator('.dl-nom')).toHaveCount(0)
    expect(await liste(fenetre)).toEqual([])
  } finally {
    await app.close()
  }
})
