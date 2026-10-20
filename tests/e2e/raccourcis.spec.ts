import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'

const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href
const page = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

const accelerateurMenu = (app: ElectronApplication, id: string): Promise<string | undefined> =>
  app.evaluate(({ Menu }, i) => Menu.getApplicationMenu()!.getMenuItemById(i)?.accelerator as string | undefined, id)

/** Touche envoyée à la page de l'étoile active (celle de FIXTURE) : passe par `before-input-event`, comme au clavier. */
const touche = (app: ElectronApplication, key: string, shift = false, alt = false): Promise<void> =>
  app.evaluate(({ webContents }, [adresse, k, maj, option]) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL() === adresse)!
    const modifiers = [process.platform === 'darwin' ? 'meta' : 'control', ...(maj ? ['shift'] : []), ...(option ? ['alt'] : [])] as ('meta' | 'control' | 'shift' | 'alt')[]
    wc.sendInputEvent({ type: 'keyDown', keyCode: k as string, modifiers })
    wc.sendInputEvent({ type: 'keyUp', keyCode: k as string, modifiers })
  }, [FIXTURE, key, shift, alt] as const)

const paletteVisible = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ BaseWindow }) => (BaseWindow.getAllWindows()[0].contentView.children.at(-1) as { getVisible(): boolean }).getVisible())

async function fermerPalette(app: ElectronApplication): Promise<void> {
  const overlay = app.windows().find((w) => w.url().includes('#overlay'))
  await overlay?.keyboard.press('Escape')
  await expect.poll(() => paletteVisible(app)).toBe(false)
}

const raccourcis = (fenetre: Page): Promise<Record<string, string>> => fenetre.evaluate(async () => (await window.lyra.invoke('settings:get')).raccourcis)

async function ouvrirReglages(app: ElectronApplication, fenetre: Page): Promise<Page> {
  await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/raccourcis'))
  await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
  const reglages = page(app, 'lyra://settings')!
  await expect(reglages.locator('[data-reglage="raccourcis-palette"]')).toBeVisible()
  return reglages
}

/** Retour à une étoile qui reçoit les touches (la page des réglages capte les siennes). */
async function ouvrirFixture(app: ElectronApplication, fenetre: Page): Promise<void> {
  await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)
  await expect.poll(() => page(app, FIXTURE)).toBeDefined()
}

test('par défaut : ⌘ L ouvre la palette depuis la page', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await ouvrirFixture(app, fenetre)
    expect(await paletteVisible(app)).toBe(false)
    await touche(app, 'L')
    await expect.poll(() => paletteVisible(app)).toBe(true)
    await fermerPalette(app)
  } finally {
    await app.close()
  }
})

test('redéfinir ⌘ L : l’ancienne combinaison ne fait plus rien, la nouvelle ouvre la palette ; « Par défaut » rétablit', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const reglages = await ouvrirReglages(app, fenetre)
    const ligne = reglages.locator('[data-reglage="raccourcis-palette"]')
    // Capture : clic, puis la combinaison.
    await ligne.locator('.touche').click()
    await expect(ligne.locator('.touche')).toContainText('Tapez la combinaison')
    await reglages.keyboard.press('ControlOrMeta+Shift+K')
    await expect.poll(() => raccourcis(fenetre)).toEqual({ palette: 'CmdOrCtrl+Shift+K' })
    await expect(ligne.locator('.touche')).toContainText('K')
    await expect(ligne.getByRole('button', { name: /par défaut/i })).toBeVisible()
    // Le menu d'application suit (reconstruction différée de 300 ms).
    await expect.poll(() => accelerateurMenu(app, 'palette'), { timeout: 5000 }).toBe('CmdOrCtrl+Shift+K')

    await ouvrirFixture(app, fenetre)
    await touche(app, 'L')
    await new Promise((r) => setTimeout(r, 600))
    expect(await paletteVisible(app)).toBe(false)
    await touche(app, 'K', true)
    await expect.poll(() => paletteVisible(app)).toBe(true)
    await fermerPalette(app)

    // « Par défaut » sur la ligne.
    await ouvrirReglages(app, fenetre)
    const ligne2 = page(app, 'lyra://settings')!.locator('[data-reglage="raccourcis-palette"]')
    await ligne2.getByRole('button', { name: /par défaut/i }).click()
    await expect.poll(() => raccourcis(fenetre)).toEqual({ palette: '' })
    await expect.poll(() => accelerateurMenu(app, 'palette'), { timeout: 5000 }).toBe('CmdOrCtrl+L')
    await ouvrirFixture(app, fenetre)
    await touche(app, 'L')
    await expect.poll(() => paletteVisible(app)).toBe(true)
    await fermerPalette(app)
  } finally {
    await app.close()
  }
})

test('conflit, combinaison sans ⌘/Ctrl et réservée : refusées avec un message, rien n’est enregistré', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const reglages = await ouvrirReglages(app, fenetre)
    const ligne = reglages.locator('[data-reglage="raccourcis-palette"]')
    // ⌘ R est déjà « Recharger ».
    await ligne.locator('.touche').click()
    await reglages.keyboard.press('ControlOrMeta+R')
    await expect(reglages.getByRole('alert')).toHaveText('Déjà utilisée par « Recharger ».')
    // Une lettre seule.
    await ligne.locator('.touche').click()
    await reglages.keyboard.press('K')
    await expect(reglages.getByRole('alert')).toContainText('⌘ ou Ctrl')
    // Une touche d'édition (⌘ ← efface, Ctrl Retour arrière efface un mot) gênerait la saisie de texte.
    await ligne.locator('.touche').click()
    await reglages.keyboard.press('ControlOrMeta+Backspace')
    await expect(reglages.getByRole('alert')).toContainText('écrire du texte')
    // Réservée au système.
    if (process.platform === 'darwin') {
      await ligne.locator('.touche').click()
      await reglages.keyboard.press('Meta+Q')
      await expect(reglages.getByRole('alert')).toContainText('système')
    }
    // Échap annule la saisie.
    await ligne.locator('.touche').click()
    await reglages.keyboard.press('Escape')
    await expect(ligne.locator('.touche')).not.toContainText('Tapez')
    expect(await raccourcis(fenetre)).toEqual({})
  } finally {
    await app.close()
  }
})

test('« Tout par défaut » rétablit toutes les commandes (réglages et menu)', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { raccourcis: { palette: 'CmdOrCtrl+Shift+K', trouver: 'CmdOrCtrl+Shift+G' } }))
    const reglages = await ouvrirReglages(app, fenetre)
    await expect.poll(() => accelerateurMenu(app, 'trouver'), { timeout: 5000 }).toBe('CmdOrCtrl+Shift+G')
    await reglages.getByRole('button', { name: 'Tout par défaut' }).click()
    await expect.poll(() => raccourcis(fenetre)).toEqual({ palette: '', trouver: '' })
    await expect.poll(() => accelerateurMenu(app, 'trouver'), { timeout: 5000 }).toBe('CmdOrCtrl+F')
    await expect.poll(() => accelerateurMenu(app, 'palette'), { timeout: 5000 }).toBe('CmdOrCtrl+L')
    await expect(reglages.getByRole('button', { name: 'Tout par défaut' })).toBeDisabled()
  } finally {
    await app.close()
  }
})

test('l’interface affiche les raccourcis effectifs et suit une redéfinition (ciel, info-bulle, menu ⋯)', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const mac = process.platform === 'darwin'
    const affiche = (ctrlMaj: string, mac_: string): string => (mac ? mac_ : ctrlMaj)
    const kbdPalette = fenetre.locator('.ciel button.palette kbd')
    await expect(kbdPalette).toHaveText(affiche('Ctrl+L', '⌘ L'))
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { raccourcis: { palette: 'CmdOrCtrl+Shift+K', nouvelleEtoile: 'CmdOrCtrl+Shift+E' } }))
    await expect(kbdPalette).toHaveText(affiche('Ctrl+Maj+K', '⌘ ⇧ K'))
    await expect(fenetre.locator('.ciel button.nouvelle kbd')).toHaveText(affiche('Ctrl+Maj+E', '⌘ ⇧ E'))
    // Le menu ⋯ (vue overlay) lit les mêmes réglages ; « Historique » : ⌘ Y sur macOS, Ctrl+H ailleurs.
    await fenetre.evaluate(() => window.lyra.invoke('menu:open', { droite: 600, bas: 40 }))
    await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
    const menu = app.windows().find((w) => w.url().includes('#overlay'))!.locator('.menu-capsule')
    await expect(menu.getByRole('menuitem', { name: /^Nouvelle étoile/ })).toContainText(affiche('Ctrl+Maj+E', '⌘ ⇧ E'))
    await expect(menu.getByRole('menuitem', { name: /^Historique/ })).toContainText(affiche('Ctrl+H', '⌘ Y'))
  } finally {
    await app.close()
  }
})
