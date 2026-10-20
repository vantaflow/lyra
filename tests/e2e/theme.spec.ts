import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { lancerLyra } from './helpers'

let serveur: Server
let BASE = ''
test.beforeAll(async () => {
  serveur = createServer((_q, r) => {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    r.end('<!doctype html><title>Site rouge</title><meta name="theme-color" content="#ff0000"><p>rouge</p>')
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  BASE = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`
})
test.afterAll(() => serveur.close())

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

test('thème : « Le ciel prend la teinte du site actif » fond 18 % du theme-color de la page dans le ciel, et seulement si le réglage est actif', async () => {
  test.setTimeout(60_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const cielRendu = (): Promise<string> => fenetre.evaluate(() => getComputedStyle(document.querySelector('.fenetre')!).getPropertyValue('--ciel').trim())
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), BASE)
    await expect.poll(() => fenetre.evaluate(() => window.lyra.invoke('sky:get').then((c) => Object.values(c.etats).some((e) => e.couleur)))).toBe(true)
    expect(await cielRendu()).toBe('#15152e')
    await poser(fenetre, { couleurs: { cielTeinteParSite: true } })
    // #15152E fondu à 18 % avec #FF0000.
    await expect.poll(cielRendu).toBe('#3f1126')
    await poser(fenetre, { couleurs: { cielTeinteParSite: false } })
    await expect.poll(cielRendu).toBe('#15152e')
  } finally {
    await app.close()
  }
})

test('thème : en sombre, la première couleur lue sur lyra://settings (avant tout script de page) est déjà sombre', async () => {
  test.setTimeout(60_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await poser(fenetre, { theme: 'sombre' })
    const r = await ouvrirReglages(app, fenetre)
    await expect.poll(() => fond(fenetre, '.carte')).toBe('rgb(23, 23, 42)')
    // Lecture au plus tôt (DOMContentLoaded : après le module de la page, avant la réponse de `theme:effectif`) après un rechargement.
    await r.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const w = window as unknown as { __premier?: { page: string; fond: string } }
        w.__premier = {
          page: getComputedStyle(document.documentElement).getPropertyValue('--page').trim(),
          fond: getComputedStyle(document.getElementById('app')!).backgroundColor
        }
      })
    })
    await r.reload()
    await expect(r.locator('h1')).toBeVisible()
    const premier = await r.evaluate(() => (window as unknown as { __premier?: { page: string; fond: string } }).__premier)
    expect(premier).toEqual({ page: '#121214', fond: 'rgb(18, 18, 20)' })
  } finally {
    await app.close()
  }
})

test('thème : « À une heure fixe » bascule à l’heure dite (horloge de test), sombre de 21:00 à 07:00', async () => {
  test.setTimeout(90_000)
  // 20 h 59 min 53 s à Paris : la bascule survient quelques secondes plus tard, sans toucher aux réglages.
  const { app, fenetre } = await lancerLyra({ LYRA_TEST_HORLOGE: '2026-06-21T20:59:53+02:00', TZ: 'Europe/Paris' })
  try {
    const mode = (): Promise<string | null> => fenetre.evaluate(() => document.documentElement.getAttribute('data-mode'))
    const source = (): Promise<string> => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)
    await poser(fenetre, { theme: 'programme', couleurs: { passage: 'heure', heureSombre: '21:00', heureClair: '07:00' } })
    await expect.poll(mode).toBe('clair')
    await expect.poll(mode, { timeout: 20_000 }).toBe('sombre')
    expect(await source()).toBe('dark')
    // Début = fin : toujours sombre ; plage de jour qui ne couvre pas l'heure : clair.
    await poser(fenetre, { couleurs: { heureSombre: '08:00', heureClair: '09:00' } })
    await expect.poll(mode).toBe('clair')
    await poser(fenetre, { couleurs: { heureClair: '08:00' } })
    await expect.poll(mode).toBe('sombre')
    // Valeur invalide refusée : la plage garde ses heures.
    await poser(fenetre, { couleurs: { heureSombre: '25:00' } })
    expect(await fenetre.evaluate(() => window.lyra.invoke('settings:get').then((s) => s.couleurs.heureSombre))).toBe('08:00')
  } finally {
    await app.close()
  }
})
