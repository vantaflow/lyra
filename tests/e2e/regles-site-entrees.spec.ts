import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { lancerLyra } from './helpers'
import type { SkyChange } from '../../src/shared/ipc'

// Jalon D, tâche 15 : entrées contextuelles vers les règles du site (menu ⋯, panneau des Boucliers, palette).
// On vérifie l'adresse de la vue ouverte (`lyra://settings#/sites/<origine encodée>[/style]`), pas le contenu du détail.

let serveur: Server
let BASE = ''
let ROUTE = ''
test.beforeAll(async () => {
  serveur = createServer((_q, r) => {
    r.setHeader('content-type', 'text/html')
    r.end('<!doctype html><title>site</title><p>site de test</p>')
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  const port = (serveur.address() as AddressInfo).port
  BASE = `http://127.0.0.1:${port}`
  ROUTE = `lyra://settings#/sites/${encodeURIComponent(BASE)}`
})
test.afterAll(() => serveur.close())

const ciel = (f: Page): Promise<SkyChange> => f.evaluate(() => window.lyra.invoke('sky:get'))
const active = async (f: Page): Promise<{ id: string; url: string; title?: string } | undefined> => {
  const { sky } = await ciel(f)
  return sky.stars.find((s) => s.id === sky.activeId)
}
const urls = async (f: Page): Promise<string[]> => (await ciel(f)).sky.stars.map((s) => s.url)
const overlayDe = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url().includes('#overlay'))

async function ouvrirSite(f: Page): Promise<void> {
  await f.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/page`)
  await expect.poll(async () => (await active(f))?.url).toBe(`${BASE}/page`)
  // La page doit avoir fini de charger : le menu lit l'adresse du contenu actif.
  await expect.poll(async () => (await active(f))?.title).toBe('site')
}

async function menuOuvert(app: ElectronApplication, f: Page): Promise<Page> {
  await f.getByRole('button', { name: 'Menu de la page' }).click()
  // Chaque fenêtre (normale ou privée) a son overlay : on prend celui dont le menu est affiché.
  let trouve: Page | undefined
  await expect
    .poll(async () => {
      for (const w of app.windows().filter((p) => p.url().includes('#overlay'))) {
        if (await w.locator('.menu-capsule').isVisible().catch(() => false)) trouve = w
      }
      return trouve !== undefined
    })
    .toBe(true)
  return trouve!
}

async function palette(app: ElectronApplication, texte: string): Promise<void> {
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('palette')!.click())
  await expect.poll(() => overlayDe(app)).toBeDefined()
  const overlay = overlayDe(app)!
  await expect(overlay.locator('#palette')).toBeFocused()
  await overlay.fill('#palette', texte)
  await expect(overlay.locator('.pal', { hasText: 'Règles de ce site' }).first()).toBeVisible()
  await overlay.press('#palette', 'Enter')
}

test('menu ⋯ : « Règles pour <hôte> » et « Style perso pour ce site » ouvrent la route du site', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await ouvrirSite(fenetre)
    let overlay = await menuOuvert(app, fenetre)
    const regles = overlay.getByRole('menuitem', { name: 'Règles pour 127.0.0.1' })
    await expect(regles).not.toHaveAttribute('aria-disabled', 'true')
    await expect(overlay.getByRole('menuitem', { name: 'Style perso pour ce site' })).not.toHaveAttribute('aria-disabled', 'true')
    await regles.click()
    await expect.poll(() => urls(fenetre)).toContain(ROUTE)
    // La vue ouverte est bien la page de réglages, avec le hash du site.
    await expect.poll(() => app.windows().some((w) => w.url().startsWith('lyra://settings') && w.url().includes('#/sites/'))).toBe(true)

    // Retour à la page du site, puis « Style perso » : même route, suffixe /style.
    const site = (await ciel(fenetre)).sky.stars.find((s) => s.url === `${BASE}/page`)!
    await fenetre.evaluate((id) => window.lyra.invoke('tabs:activate', { id }), site.id)
    await expect.poll(async () => (await ciel(fenetre)).sky.activeId).toBe(site.id)
    overlay = await menuOuvert(app, fenetre)
    await overlay.getByRole('menuitem', { name: 'Style perso pour ce site' }).click()
    await expect.poll(() => urls(fenetre)).toContain(`${ROUTE}/style`)
  } finally {
    await app.close()
  }
})

test('menu ⋯ sur une page de Lyra : les deux entrées restent présentes mais inertes', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const avant = await urls(fenetre)
    const overlay = await menuOuvert(app, fenetre)
    const regles = overlay.getByRole('menuitem', { name: 'Règles pour ce site' })
    await expect(regles).toHaveAttribute('aria-disabled', 'true')
    await expect(overlay.getByRole('menuitem', { name: 'Style perso pour ce site' })).toHaveAttribute('aria-disabled', 'true')
    await regles.click({ force: true })
    await fenetre.waitForTimeout(300)
    expect(await urls(fenetre)).toEqual(avant)
  } finally {
    await app.close()
  }
})

test('panneau des Boucliers : « Règles de ce site » ouvre la route du site', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await ouvrirSite(fenetre)
    await fenetre.locator('.boucliers').click()
    await expect.poll(() => overlayDe(app)).toBeDefined()
    const overlay = overlayDe(app)!
    await expect(overlay.locator('.pn-bouclier')).toBeVisible()
    await expect(overlay.locator('.pn-nom')).toHaveText(`127.0.0.1:${BASE.split(':')[2]}`)
    await overlay.locator('.pn-liens a', { hasText: 'Règles de ce site' }).click()
    await expect.poll(() => urls(fenetre)).toContain(ROUTE)
  } finally {
    await app.close()
  }
})

test('palette : commande « Règles de ce site » (site seulement)', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    // Sur une page de Lyra, la commande n'est pas proposée.
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('palette')!.click())
    await expect.poll(() => overlayDe(app)).toBeDefined()
    const sans = overlayDe(app)!
    await expect(sans.locator('#palette')).toBeFocused()
    await sans.fill('#palette', '>Règles de ce site')
    await fenetre.waitForTimeout(300)
    await expect(sans.locator('.pal', { hasText: 'Règles de ce site' })).toHaveCount(0)
    await sans.keyboard.press('Escape')

    await ouvrirSite(fenetre)
    await palette(app, '>Règles de ce site')
    await expect.poll(() => urls(fenetre)).toContain(ROUTE)
  } finally {
    await app.close()
  }
})

test('fenêtre privée : entrées présentes, elles ouvrent les réglages, l’écriture des règles y est refusée', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const interfaces = (): Page[] => app.windows().filter((p) => p.url().includes('ui.html') && !p.url().includes('#overlay'))
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
    await expect.poll(() => interfaces().find((p) => p.url().includes('#privee'))).toBeDefined()
    const privee = interfaces().find((p) => p.url().includes('#privee'))!
    await ouvrirSite(privee)
    const overlay = await menuOuvert(app, privee)
    const regles = overlay.getByRole('menuitem', { name: 'Règles pour 127.0.0.1' })
    await expect(regles).not.toHaveAttribute('aria-disabled', 'true')
    await regles.click()
    await expect.poll(() => urls(privee)).toContain(ROUTE)
    // Écriture depuis la fenêtre privée : refusée côté main, aucune règle créée.
    await privee.evaluate((cle) => window.lyra.invoke('sites:ecrire', { cle, regle: { zoom: 1.5 } }), BASE)
    await privee.waitForTimeout(300)
    expect(await fenetre.evaluate(() => window.lyra.invoke('sites:lister'))).toEqual({})
  } finally {
    await app.close()
  }
})
