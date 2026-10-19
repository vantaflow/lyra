import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'
import type { SkyChange } from '../../src/shared/ipc'

const url = (nom: string): string => pathToFileURL(resolve(__dirname, 'fixtures', nom)).href
const LIENS = url('liens.html')
const PERMISSIONS = url('permissions.html')

const ciel = (f: Page): Promise<SkyChange> => f.evaluate(() => window.lyra.invoke('sky:get'))
const menu = (app: ElectronApplication, id: string): Promise<void> =>
  app.evaluate(({ Menu }, i) => Menu.getApplicationMenu()!.getMenuItemById(i)!.click(), id)
const page = (app: ElectronApplication, adresse: string): Page | undefined => app.windows().find((w) => w.url() === adresse)
const overlay = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url().includes('#overlay'))
const zoomDe = (app: ElectronApplication, adresse: string): Promise<number> =>
  app.evaluate(({ webContents }, u) => webContents.getAllWebContents().find((w) => w.getURL() === u)?.getZoomFactor() ?? 0, adresse)

async function ouvrir(app: ElectronApplication, fenetre: Page, adresse: string): Promise<Page> {
  await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), adresse)
  await expect.poll(() => page(app, adresse)).toBeDefined()
  return page(app, adresse)!
}

test("l'agent utilisateur ne contient ni Electron ni lyra", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const p = await ouvrir(app, fenetre, LIENS)
    const ua = await p.evaluate(() => navigator.userAgent)
    expect(ua).toContain('Chrome/')
    expect(ua).not.toMatch(/electron/i)
    expect(ua).not.toMatch(/lyra/i)
  } finally {
    await app.close()
  }
})

test('⌘ F trouve un mot de la page et relaie le compteur', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await ouvrir(app, fenetre, LIENS)
    const id = (await ciel(fenetre)).sky.activeId!
    await fenetre.evaluate(() => {
      const w = window as unknown as { __find: { actif: number; total: number } | null }
      w.__find = null
      window.lyra.on('find:result', (r) => (w.__find = r))
    })
    await menu(app, 'trouver')
    const champ = fenetre.getByRole('textbox', { name: 'Rechercher dans la page' })
    await expect(champ).toBeFocused()
    await champ.fill('Lien')
    await expect.poll(() => fenetre.evaluate(() => (window as unknown as { __find: { total: number } | null }).__find?.total ?? 0)).toBeGreaterThanOrEqual(1)
    await expect(fenetre.locator('.findbar-n')).toHaveText(/^1\/[1-9]/)
    await fenetre.evaluate((i) => window.lyra.invoke('find:stop', { id: i }), id)
    await champ.press('Escape')
    await expect(champ).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test("une page introuvable ou injoignable affiche la page d'erreur Lyra", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const id = (await ciel(fenetre)).sky.activeId!
    const erreur = (): Page | undefined => app.windows().find((w) => w.url().startsWith('lyra://erreur'))
    await fenetre.evaluate((i) => window.lyra.invoke('tabs:navigate', { id: i, url: 'file:///nexiste/pas.html' }), id)
    await expect.poll(erreur).toBeDefined()
    await expect(erreur()!.locator('h1')).toHaveText('Cette page est introuvable')
    await expect(erreur()!.locator('.erreur-url')).toHaveText('file:///nexiste/pas.html')
    // La pilule garde l'adresse voulue ; « Continuer quand même » n'existe que pour un certificat.
    expect((await ciel(fenetre)).etats[id].url).toBe('file:///nexiste/pas.html')
    await expect(erreur()!.getByRole('button', { name: 'Continuer quand même' })).toHaveCount(0)

    await fenetre.evaluate((i) => window.lyra.invoke('tabs:navigate', { id: i, url: 'http://127.0.0.1:1/' }), id)
    await expect.poll(() => erreur()?.url()).toContain('type=reseau')
    await expect(erreur()!.locator('h1')).toHaveText('Connexion impossible')
    await expect(erreur()!.getByRole('button', { name: 'Réessayer' })).toBeVisible()
    // Réessayer recharge l'adresse d'origine (qui échoue encore : on reste sur une page d'erreur).
    await erreur()!.getByRole('button', { name: 'Réessayer' }).click()
    await expect.poll(() => erreur()?.url()).toContain('type=reseau')
  } finally {
    await app.close()
  }
})

test('⌘ + zoome la page et le zoom est mémorisé par site', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await ouvrir(app, fenetre, LIENS)
    expect(await zoomDe(app, LIENS)).toBeCloseTo(1, 2)
    await menu(app, 'zoom-plus')
    await expect.poll(() => zoomDe(app, LIENS)).toBeGreaterThan(1)
    await expect(fenetre.locator('.zoom-ind')).toHaveText('110 %')
    const reglages = await fenetre.evaluate(() => window.lyra.invoke('settings:get'))
    expect(reglages.sites['file://']?.zoom).toBe(1.1)
    // Rechargée, la page retrouve son zoom.
    const id = (await ciel(fenetre)).sky.activeId!
    await fenetre.evaluate(({ i, u }) => window.lyra.invoke('tabs:navigate', { id: i, url: u }), { i: id, u: LIENS + '?autre' })
    await expect.poll(() => zoomDe(app, LIENS + '?autre')).toBeGreaterThan(1)
    await menu(app, 'zoom-zero')
    await expect.poll(() => zoomDe(app, LIENS + '?autre')).toBeCloseTo(1, 2)
    await expect(fenetre.locator('.zoom-ind')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test("une demande de permission s'affiche dans l'overlay ; Refuser la refuse", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const p = await ouvrir(app, fenetre, PERMISSIONS)
    await p.evaluate(() => void Notification.requestPermission().then((r) => (document.title = `notif:${r}`)))
    await expect.poll(() => overlay(app) !== undefined).toBe(true)
    const o = overlay(app)!
    await expect(o.locator('.perm-texte')).toContainText('souhaite afficher des notifications')
    await o.getByRole('button', { name: 'Refuser' }).click()
    await expect.poll(() => p.title()).toBe('notif:denied')
    expect(await p.evaluate(() => Notification.permission)).toBe('denied')
  } finally {
    await app.close()
  }
})

test('« Autoriser » avec « Se souvenir » mémorise la décision, sans nouvelle demande', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const p = await ouvrir(app, fenetre, PERMISSIONS)
    await p.evaluate(() => void Notification.requestPermission().then((r) => (document.title = `notif:${r}`)))
    await expect.poll(() => overlay(app) !== undefined).toBe(true)
    const o = overlay(app)!
    await o.getByLabel('Se souvenir pour ce site').check()
    await o.getByRole('button', { name: 'Autoriser' }).click()
    await expect.poll(() => p.title()).toBe('notif:granted')
    const reglages = await fenetre.evaluate(() => window.lyra.invoke('settings:get'))
    expect(reglages.sites['file://']?.permissions?.notifications).toBe('autoriser')
  } finally {
    await app.close()
  }
})

test('un site ne peut pas faire ouvrir une page Lyra', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const p = await ouvrir(app, fenetre, PERMISSIONS)
    const avant = (await ciel(fenetre)).sky.stars.length
    await p.click('#interdit')
    await p.click('#interdit-popup')
    // Témoin : un lien permis crée bien une étoile (traité après les deux autres, dans l'ordre).
    await p.click('#autorise')
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(avant + 1)
    const { sky } = await ciel(fenetre)
    expect(sky.stars.some((s) => s.url.startsWith('lyra://settings'))).toBe(false)
    expect(app.windows().some((w) => w.url().startsWith('lyra://settings'))).toBe(false)
  } finally {
    await app.close()
  }
})

test('le menu ⋯ de la capsule s’ouvre sous le bouton et agit', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await ouvrir(app, fenetre, LIENS)
    await fenetre.getByRole('button', { name: 'Menu de la page' }).click()
    await expect.poll(() => overlay(app) !== undefined).toBe(true)
    const o = overlay(app)!
    await expect(o.getByRole('menuitem')).toHaveCount(12)
    await expect(o.getByRole('menuitem', { name: /Règles pour/ })).toBeVisible()
    await o.getByRole('button', { name: 'Zoom avant' }).click()
    await expect(o.getByRole('button', { name: 'Revenir à 100 %' })).toHaveText('110 %')
    await expect.poll(() => zoomDe(app, LIENS)).toBeGreaterThan(1)
    await o.getByRole('menuitem', { name: /Nouvelle étoile/ }).click()
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(3)
  } finally {
    await app.close()
  }
})
