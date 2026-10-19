import { test, expect, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'

const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href
const page = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

test('premier lancement : choix du moteur (Kagi) puis la palette le propose', async () => {
  const { app, fenetre } = await lancerLyra({}, { premierLancement: true })
  try {
    await expect.poll(() => page(app, 'lyra://newtab')).toBeDefined()
    const n = page(app, 'lyra://newtab')!
    await expect(n.getByText('Quel moteur de recherche ?')).toBeVisible()
    await expect(n.locator('#recherche')).toHaveCount(0)
    await n.getByRole('radio', { name: 'Kagi' }).click()
    await n.getByRole('button', { name: "C'est parti" }).click()
    await expect(n.locator('#recherche')).toBeVisible()
    const s = await fenetre.evaluate(() => window.lyra.invoke('settings:get'))
    expect(s.moteurParDefaut).toBe('kagi')
    expect(s.moteurChoisi).toBe(true)
    const sugg = await fenetre.evaluate(() => window.lyra.invoke('palette:suggest', { texte: 'véga' }))
    expect(sugg.some((x) => x.type === 'recherche' && x.moteur === 'kagi')).toBe(true)
  } finally {
    await app.close()
  }
})

test('nouvel onglet : la saisie lance une recherche avec le moteur par défaut', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await expect.poll(() => page(app, 'lyra://newtab')).toBeDefined()
    const n = page(app, 'lyra://newtab')!
    await expect(n.getByText('Vos constellations')).toBeVisible()
    await n.fill('#recherche', 'véga')
    // La navigation remplace la cible Playwright : la fin de la frappe peut arriver trop tard.
    await n.press('#recherche', 'Enter').catch(() => undefined)
    await expect.poll(() => fenetre.evaluate(() => window.lyra.invoke('test:lastNavigation'))).toContain('duckduckgo.com')
  } finally {
    await app.close()
  }
})

test('réglages : thème sombre → une page web voit prefers-color-scheme: dark', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings'))
    await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
    const r = page(app, 'lyra://settings')!
    await expect(r.locator('h1')).toHaveText('Général')
    await r.getByRole('button', { name: 'Sombre' }).click()
    await expect.poll(() => fenetre.evaluate(() => window.lyra.invoke('settings:get')).then((s) => s.theme)).toBe('sombre')
    await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), FIXTURE)
    await expect.poll(() => page(app, FIXTURE)).toBeDefined()
    // Playwright émule « light » par défaut : on rend la main au thème réel du navigateur.
    await page(app, FIXTURE)!.emulateMedia({ colorScheme: null })
    await expect
      .poll(() => page(app, FIXTURE)!.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
      .toBe(true)
  } finally {
    await app.close()
  }
})
