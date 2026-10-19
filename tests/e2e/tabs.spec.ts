import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'
import type { SkyChange } from '../../src/shared/ipc'

const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href

const ciel = (f: Page): Promise<SkyChange> => f.evaluate(() => window.lyra.invoke('sky:get'))
const menu = (app: ElectronApplication, id: string): Promise<void> =>
  app.evaluate(({ Menu }, i) => Menu.getApplicationMenu()!.getMenuItemById(i)!.click(), id)
const pageFixture = (app: ElectronApplication, suffixe = ''): Page | undefined =>
  app.windows().find((w) => w.url() === FIXTURE + suffixe)

test('⌘T crée une étoile lyra://newtab', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    expect((await ciel(fenetre)).sky.stars).toHaveLength(1)
    await menu(app, 'nouvelle-etoile')
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(2)
    const { sky } = await ciel(fenetre)
    expect(sky.stars[1].url).toBe('lyra://newtab')
    expect(sky.activeId).toBe(sky.stars[1].id)
  } finally {
    await app.close()
  }
})

test('un lien _blank ouvre une étoile enfant', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)
    await expect.poll(() => pageFixture(app)).toBeDefined()
    const origine = (await ciel(fenetre)).sky.activeId!
    await pageFixture(app)!.click('#blank')
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(3)
    const enfant = (await ciel(fenetre)).sky.stars[2]
    expect(enfant.parentId).toBe(origine)
  } finally {
    await app.close()
  }
})

test('la popup OAuth garde window.opener', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)
    await expect.poll(() => pageFixture(app)).toBeDefined()
    await pageFixture(app)!.click('#oauth')
    await expect.poll(() => pageFixture(app, '?oauth')).toBeDefined()
    expect(await pageFixture(app, '?oauth')!.evaluate(() => window.opener !== null)).toBe(true)
    // Une popup n'est pas une étoile.
    expect((await ciel(fenetre)).sky.stars).toHaveLength(2)
  } finally {
    await app.close()
  }
})

test('fermer toutes les étoiles ouvre une étoile lyra://newtab', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await menu(app, 'nouvelle-etoile')
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(2)
    for (const s of (await ciel(fenetre)).sky.stars) {
      await fenetre.evaluate((id) => window.lyra.invoke('tabs:close', { id }), s.id)
    }
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(1)
    const { sky } = await ciel(fenetre)
    expect(sky.stars[0].url).toBe('lyra://newtab')
    expect(sky.activeId).toBe(sky.stars[0].id)
  } finally {
    await app.close()
  }
})
