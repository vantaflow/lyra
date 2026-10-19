import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'
import type { SkyChange } from '../../src/shared/ipc'

const DND = pathToFileURL(resolve(__dirname, 'fixtures/dnd.html')).href

const layout = (f: Page) => f.evaluate(() => window.lyra.invoke('layout:get'))
const etat = (f: Page) => f.evaluate(() => window.lyra.invoke('dnd:get'))
const ciel = (f: Page): Promise<SkyChange> => f.evaluate(() => window.lyra.invoke('sky:get'))
const livraisons = (f: Page) => f.evaluate(() => window.lyra.invoke('test:livraisons'))
const menu = (app: ElectronApplication, id: string): Promise<void> =>
  app.evaluate(({ Menu }, i) => Menu.getApplicationMenu()!.getMenuItemById(i)!.click(), id)
const page = (app: ElectronApplication, adresse: string): Page | undefined => app.windows().find((w) => w.url() === adresse)

async function ouvrir(app: ElectronApplication, fenetre: Page, adresse: string): Promise<Page> {
  await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), adresse)
  await expect.poll(() => page(app, adresse)).toBeDefined()
  return page(app, adresse)!
}

/** Largeur et hauteur de la zone de contenu de la fenêtre (la page est plein cadre en mode Ne pas déranger). */
const fenetreTaille = (app: ElectronApplication): Promise<{ width: number; height: number }> =>
  app.evaluate(({ BaseWindow }) => {
    const [w] = BaseWindow.getAllWindows()
    const { width, height } = w.getContentBounds()
    return { width, height }
  })

test('⌘ ⇧ D (menu) : page plein cadre, ni ciel ni capsule, rappel conforme, croissant ensuite ; aucun rechargement', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const p = await ouvrir(app, fenetre, DND)
    const origineAvant = await p.evaluate(() => performance.timeOrigin)
    expect((await etat(fenetre)).actif).toBe(false)
    await expect(fenetre.locator('.ciel')).toBeVisible()

    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(true)
    const t = await fenetreTaille(app)
    const l = await layout(fenetre)
    expect(l.bounds.page).toEqual({ x: 0, y: 0, ...t })
    expect(l.ordre).toEqual(['page', 'chrome', 'overlay'])
    // La vue chrome ne couvre plus que le coin haut droit.
    expect(l.bounds.chrome.x + l.bounds.chrome.width).toBe(t.width)
    expect(l.bounds.chrome.y).toBe(0)
    expect(l.bounds.chrome.width).toBeLessThan(t.width)
    await expect(fenetre.locator('.ciel')).toHaveCount(0)
    await expect(fenetre.locator('.capsule')).toHaveCount(0)
    // Rappel (NePasDeranger.dc.html) : titre, compteur et temps restant, Échap, bouton pour quitter.
    const rappel = fenetre.locator('.dnd-rappel')
    await expect(rappel).toBeVisible()
    await expect(rappel).toContainText('Ne pas déranger')
    await expect(rappel).toContainText('aucune notification retenue · encore 1 h')
    await expect(rappel.locator('kbd')).toHaveText('Échap')
    await expect(fenetre.getByRole('button', { name: 'Quitter le mode Ne pas déranger' })).toBeVisible()

    // Le rappel s'efface au bout de quelques secondes : seul le croissant reste, la vue chrome rétrécit.
    await expect(fenetre.locator('.dnd-croissant')).toBeVisible({ timeout: 10_000 })
    await expect(rappel).toHaveCount(0)
    const petit = (await layout(fenetre)).bounds.chrome
    expect(petit.width).toBeLessThan(l.bounds.chrome.width)
    expect((await layout(fenetre)).bounds.page).toEqual({ x: 0, y: 0, ...t })

    // Sortie par le menu (⌘ ⇧ D) : le ciel et la capsule reviennent, la page retrouve sa place.
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(false)
    await expect(fenetre.locator('.ciel')).toBeVisible()
    await expect(fenetre.locator('.capsule')).toBeVisible()
    const apres = await layout(fenetre)
    expect(apres.bounds.page.x).toBeGreaterThan(0)
    expect(apres.ordre).toEqual(['chrome', 'page', 'overlay'])
    // Aucun onglet rechargé à l'entrée ni à la sortie.
    expect(await p.evaluate(() => performance.timeOrigin)).toBe(origineAvant)
  } finally {
    await app.close()
  }
})

test('croissant du pied du ciel : entre ; bouton du rappel : sort ; Échap sort ; la minuterie survit à un changement de position', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const p = await ouvrir(app, fenetre, DND)
    await fenetre.getByRole('button', { name: 'Ne pas déranger', exact: true }).click()
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(true)
    const fin = (await etat(fenetre)).fin
    expect(fin).not.toBeNull()

    // La position du ciel change pendant le mode : la minuterie et le mode restent, la page reste plein cadre.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { ciel: { position: 'bas' } } as never))
    await fenetre.waitForTimeout(300)
    const e = await etat(fenetre)
    expect(e.actif).toBe(true)
    expect(e.fin).toBe(fin)
    const t = await fenetreTaille(app)
    expect((await layout(fenetre)).bounds.page).toEqual({ x: 0, y: 0, ...t })

    // Sortie par le bouton du rappel.
    await fenetre.getByRole('button', { name: 'Quitter le mode Ne pas déranger' }).click()
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(false)
    expect((await layout(fenetre)).bounds.page.y).toBe(46)

    // Échap dans la page.
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(true)
    // Échap tapé dans la page : l'évènement before-input-event de la vue (le clavier synthétique de Playwright ne le déclenche pas
    // dans une fenêtre cachée, on l'émet donc sur la vue de la page).
    await app.evaluate(({ webContents }, u) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL() === u)!
      wc.emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', key: 'Escape', isAutoRepeat: false, control: false, meta: false, alt: false, shift: false })
    }, DND)
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(false)

    // Échap dans la vue chrome (rappel ou croissant).
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(true)
    await fenetre.keyboard.press('Escape')
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(false)
  } finally {
    await app.close()
  }
})

test('palette : « Ne pas déranger pendant 30 min », puis « Quitter le mode Ne pas déranger »', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await ouvrir(app, fenetre, DND)
    const suggestions = (texte: string) => fenetre.evaluate((t) => window.lyra.invoke('palette:suggest', { texte: t }), texte)
    const titres = (await suggestions('>ne pas deranger')).map((s) => s.titre)
    expect(titres).toEqual(['Ne pas déranger pendant 1 h', 'Ne pas déranger pendant 30 min', "Ne pas déranger jusqu'à l'arrêt"])
    const trente = (await suggestions('>30 min'))[0]
    await fenetre.evaluate((s) => window.lyra.invoke('palette:go', { suggestion: s, texte: '', nouvelleEtoile: false }), trente)
    await expect.poll(async () => (await etat(fenetre)).duree).toBe(30)
    const e = await etat(fenetre)
    expect(e.fin! - Date.now()).toBeGreaterThan(29 * 60_000)
    const quitter = await suggestions('>quitter')
    expect(quitter.map((s) => s.titre)).toEqual(['Quitter le mode Ne pas déranger'])
    await fenetre.evaluate((s) => window.lyra.invoke('palette:go', { suggestion: s, texte: '', nouvelleEtoile: false }), quitter[0])
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(false)
  } finally {
    await app.close()
  }
})

test("notification web : retenue pendant le mode (rien d'affiché), livrée à la sortie avec son étoile d'origine", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    // Les notifications du site sont autorisées : sans le mode, elles s'afficheraient.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { sites: { 'file://': { permissions: { notifications: 'autoriser' } } } }))
    const p = await ouvrir(app, fenetre, DND)
    const id = (await ciel(fenetre)).sky.activeId!
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(true)

    // La page reçoit un objet qui se comporte comme une Notification.
    const resume = await p.evaluate(() => {
      const a = new Notification('Première', { body: 'corps A', tag: 'x' })
      a.onclick = () => undefined
      new Notification('Seconde', { body: 'corps B' })
      const c = new Notification('À fermer')
      c.close()
      return { titre: a.title, corps: a.body, instance: a instanceof Notification, permission: Notification.permission, nom: Notification.name }
    })
    expect(resume).toEqual({ titre: 'Première', corps: 'corps A', instance: true, permission: 'granted', nom: 'Notification' })
    await expect.poll(async () => (await etat(fenetre)).notifications).toBe(2)
    // Rien n'est livré (donc rien d'affiché) pendant le mode ; le rappel compte.
    expect(await livraisons(fenetre)).toEqual([])
    await expect(fenetre.locator('.dnd-rappel, .dnd-croissant').first()).toBeVisible()

    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(false)
    // Livrées à la sortie, dans l'ordre, avec l'étoile d'origine.
    expect(await livraisons(fenetre)).toEqual([
      { titre: 'Première', corps: 'corps A', origine: 'file://', etoileId: id },
      { titre: 'Seconde', corps: 'corps B', origine: 'file://', etoileId: id }
    ])
    expect((await etat(fenetre)).notifications).toBe(0)
  } finally {
    await app.close()
  }
})

test("popup (window.open avec features) retenue et comptée, ouverte en étoile d'arrière-plan à la sortie", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const p = await ouvrir(app, fenetre, DND)
    const avant = await ciel(fenetre)
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(true)
    const fenetresAvant = app.windows().length
    await p.evaluate(() => void document.getElementById('popup')!.click())
    await expect.poll(async () => (await etat(fenetre)).popups).toBe(1)
    await expect(fenetre.locator('.dnd-rappel, .dnd-croissant').first()).toBeVisible()
    // Aucune fenêtre ouverte, aucune étoile créée.
    expect(app.windows().length).toBe(fenetresAvant)
    expect((await ciel(fenetre)).sky.stars.length).toBe(avant.sky.stars.length)

    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(avant.sky.stars.length + 1)
    const apres = await ciel(fenetre)
    // Étoile d'arrière-plan, reliée à l'étoile qui l'a ouverte ; l'étoile active ne change pas.
    expect(apres.sky.activeId).toBe(avant.sky.activeId)
    const nouvelle = apres.sky.stars.find((s) => !avant.sky.stars.some((a) => a.id === s.id))!
    expect(nouvelle.url).toContain('liens.html?popup')
    expect(nouvelle.parentId).toBe(avant.sky.activeId)
  } finally {
    await app.close()
  }
})

test("exception par site : la popup de ce site s'ouvre normalement même en mode", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { sites: { 'file://': { exceptionDnd: true } } }))
    const p = await ouvrir(app, fenetre, DND)
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(true)
    const avant = app.windows().length
    await p.evaluate(() => void document.getElementById('popup')!.click())
    await expect.poll(() => app.windows().length).toBeGreaterThan(avant)
    expect((await etat(fenetre)).popups).toBe(0)
    // La règle se retire : le site redevient soumis au mode.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { sites: { 'file://': { exceptionDnd: false } } }))
    const maintenant = app.windows().length
    await p.evaluate(() => void document.getElementById('popup')!.click())
    await expect.poll(async () => (await etat(fenetre)).popups).toBe(1)
    expect(app.windows().length).toBe(maintenant)
  } finally {
    await app.close()
  }
})

test("le mode n'est pas restauré au redémarrage", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(true)
  } finally {
    await app.close()
  }
  // Un nouveau lancement démarre toujours hors du mode : l'état n'est jamais écrit.
  const { app: app2, fenetre: f2 } = await lancerLyra()
  try {
    expect((await etat(f2)).actif).toBe(false)
    await expect(f2.locator('.ciel')).toBeVisible()
  } finally {
    await app2.close()
  }
})
