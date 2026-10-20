import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { lancerLyra } from './helpers'

const trouver = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))
const variable = (p: Page, nom: string): Promise<string> => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nom)
const fond = (p: Page, sel: string): Promise<string> => p.evaluate((s) => getComputedStyle(document.querySelector(s)!).backgroundColor, sel)
/** Les réglages se fusionnent en profondeur : un patch partiel d'un bloc est accepté à l'exécution. */
const poser = (p: Page, patch: object): Promise<unknown> => p.evaluate((x) => window.lyra.invoke('settings:set', x as never), patch)
const interfaces = (app: ElectronApplication): Page[] => app.windows().filter((p) => p.url().includes('ui.html') && !p.url().includes('#overlay'))

async function ouvrirReglages(app: ElectronApplication, fenetre: Page): Promise<Page> {
  await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/apparence'))
  await expect.poll(() => trouver(app, 'lyra://settings')).toBeDefined()
  const r = trouver(app, 'lyra://settings')!
  await expect(r.locator('h1')).toBeVisible()
  return r
}

test('thème : « Nuit complète » change --ciel dans la vue UI et la page réglages sans rechargement', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre)
    // Marqueurs : si une vue était rechargée, ils disparaîtraient.
    await fenetre.evaluate(() => ((window as unknown as { __marque: number }).__marque = 1))
    await r.evaluate(() => ((window as unknown as { __marque: number }).__marque = 1))
    expect(await variable(fenetre, '--ciel')).toBe('#15152e')
    await expect.poll(() => variable(r, '--ciel')).toBe('#15152e')
    await poser(fenetre, { couleurs: { actif: 'nuit-complete' } })
    await expect.poll(() => variable(fenetre, '--ciel')).toBe('#0e0e1e')
    await expect.poll(() => variable(r, '--ciel')).toBe('#0e0e1e')
    expect(await fenetre.evaluate(() => (window as unknown as { __marque?: number }).__marque)).toBe(1)
    expect(await r.evaluate(() => (window as unknown as { __marque?: number }).__marque)).toBe(1)
    // Nuit complète est sombre même en mode clair : la capsule l'est aussi (fond = ciel éclairci de 4 %).
    await expect.poll(() => fond(fenetre, '.carte')).toBe('rgb(24, 24, 39)')
  } finally {
    await app.close()
  }
})

test('thème : theme « sombre » bascule la capsule et la page des réglages, « clair » les ramène', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre)
    await expect.poll(() => fond(fenetre, '.carte')).toBe('rgb(255, 255, 255)')
    await poser(fenetre, { theme: 'sombre' })
    await expect.poll(() => fond(fenetre, '.carte')).toBe('rgb(23, 23, 42)')
    await expect.poll(() => r.evaluate(() => getComputedStyle(document.getElementById('app')!).backgroundColor)).toBe('rgb(18, 18, 20)')
    await expect(fenetre.locator('html')).toHaveAttribute('data-mode', 'sombre')
    // « danger » et « attention » restent distincts, la bordure des champs est visible sur la capsule.
    const [danger, attention] = [await variable(fenetre, '--danger'), await variable(fenetre, '--attention')]
    expect(danger).not.toBe(attention)
    await poser(fenetre, { theme: 'clair' })
    await expect.poll(() => fond(fenetre, '.carte')).toBe('rgb(255, 255, 255)')
    await expect.poll(() => r.evaluate(() => getComputedStyle(document.getElementById('app')!).backgroundColor)).toBe('rgb(247, 247, 251)')
  } finally {
    await app.close()
  }
})

test('thème : la vue d’une fenêtre privée garde Aurore, même quand le profil change de thème ou passe en sombre', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
    await expect.poll(() => interfaces(app).find((p) => p.url().includes('#privee'))).toBeDefined()
    const privee = interfaces(app).find((p) => p.url().includes('#privee'))!
    await expect.poll(() => variable(privee, '--ciel')).toBe('#2a1540')
    await poser(fenetre, { theme: 'sombre', couleurs: { actif: 'foret' } })
    await expect.poll(() => variable(fenetre, '--ciel')).toBe('#0c1914')
    await expect.poll(() => fond(privee, '.carte')).not.toBe('rgb(255, 255, 255)') // capsule sombre, ciel toujours Aurore
    expect(await variable(privee, '--ciel')).toBe('#2a1540')
    // Changer le thème privé change la fenêtre privée seulement.
    await poser(fenetre, { couleurs: { privee: 'foret' } })
    await expect.poll(() => variable(privee, '--ciel')).toBe('#12261f')
  } finally {
    await app.close()
  }
})

test('thème : « Programmé » + coucher se calcule sans erreur et themeSource suit le mode', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await poser(fenetre, { theme: 'programme', couleurs: { passage: 'coucher' } })
    const source = (): Promise<string> => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)
    const mode = (): Promise<string | null> => fenetre.evaluate(() => document.documentElement.getAttribute('data-mode'))
    await expect.poll(async () => ((await mode()) === 'sombre') === ((await source()) === 'dark')).toBe(true)
    await poser(fenetre, { theme: 'sombre', couleurs: { prefersColorScheme: false } })
    await expect.poll(source).toBe('light')
    await expect.poll(mode).toBe('sombre')
    await poser(fenetre, { couleurs: { prefersColorScheme: true } })
    await expect.poll(source).toBe('dark')
  } finally {
    await app.close()
  }
})
