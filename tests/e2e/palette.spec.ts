import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'
import type { SkyChange } from '../../src/shared/ipc'

const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href

const ciel = (f: Page): Promise<SkyChange> => f.evaluate(() => window.lyra.invoke('sky:get'))
const menu = (app: ElectronApplication, id: string): Promise<void> =>
  app.evaluate(({ Menu }, i) => Menu.getApplicationMenu()!.getMenuItemById(i)!.click(), id)

async function ouvrirPalette(app: ElectronApplication): Promise<Page> {
  await menu(app, 'palette')
  await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
  const overlay = app.windows().find((w) => w.url().includes('#overlay'))!
  await expect(overlay.locator('#palette')).toBeFocused()
  return overlay
}

test('⌘L ouvre la palette, le champ est focalisé, Échap la ferme', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const overlay = await ouvrirPalette(app)
    await expect(overlay.locator('.pal').first()).toBeVisible()
    await expect(overlay.locator('.ph').first()).toHaveText('Onglets ouverts')
    await overlay.keyboard.press('Escape')
    // Échap ferme l'overlay côté main : la vue n'est plus visible.
    await expect.poll(() => app.evaluate(({ BaseWindow }) => {
      const v = BaseWindow.getAllWindows()[0].contentView.children.at(-1) as { getVisible(): boolean }
      return v.getVisible()
    })).toBe(false)
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(1)
  } finally {
    await app.close()
  }
})

test('un chemin file:// + ↩ navigue l’étoile active', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const overlay = await ouvrirPalette(app)
    await overlay.fill('#palette', FIXTURE)
    await overlay.press('#palette', 'Enter')
    await expect.poll(async () => (await ciel(fenetre)).sky.stars[0].url).toBe(FIXTURE)
    expect((await ciel(fenetre)).sky.stars).toHaveLength(1)
  } finally {
    await app.close()
  }
})

test('⌘↩ ouvre dans une nouvelle étoile', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const overlay = await ouvrirPalette(app)
    await overlay.fill('#palette', FIXTURE)
    await overlay.press('#palette', 'ControlOrMeta+Enter')
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(2)
  } finally {
    await app.close()
  }
})

test('« w véga » demande la recherche Wikipédia', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const overlay = await ouvrirPalette(app)
    await overlay.fill('#palette', 'w véga')
    await expect(overlay.locator('.pal.on .t')).toContainText('Wikipédia')
    await overlay.press('#palette', 'Enter')
    await expect
      .poll(() => fenetre.evaluate(() => window.lyra.invoke('test:lastNavigation')))
      .toBe('https://fr.wikipedia.org/w/index.php?search=v%C3%A9ga')
  } finally {
    await app.close()
  }
})

test('un clic hors du panneau ferme la palette', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const overlay = await ouvrirPalette(app)
    await overlay.mouse.click(5, 5)
    await expect.poll(() => app.evaluate(({ BaseWindow }) => {
      const v = BaseWindow.getAllWindows()[0].contentView.children.at(-1) as { getVisible(): boolean }
      return v.getVisible()
    })).toBe(false)
    await menu(app, 'palette')
    await expect(overlay.locator('#palette')).toBeFocused()
    expect((await ciel(fenetre)).sky.stars).toHaveLength(1)
  } finally {
    await app.close()
  }
})
