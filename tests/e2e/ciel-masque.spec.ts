import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancerLyra } from './helpers'

const layout = (f: Page) => f.evaluate(() => window.lyra.invoke('layout:get'))
const menu = (app: ElectronApplication, id: string): Promise<void> =>
  app.evaluate(({ Menu }, i) => Menu.getApplicationMenu()!.getMenuItemById(i)!.click(), id)

test('« Replier le ciel » : page à 14 px, rail visible ; survol → ciel au-dessus ; sortie → retiré ; Épingler', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await expect(fenetre.locator('.rail')).toHaveCount(0)
    await fenetre.getByRole('button', { name: 'Replier le ciel' }).click()
    await expect(fenetre.locator('.rail .poignee')).toBeVisible()
    await expect(fenetre.locator('.ciel')).toHaveCount(0)
    let l = await layout(fenetre)
    expect(l.ciel.masque).toBe(true)
    expect(l.bounds.page.x).toBe(14)
    expect(l.revele).toBe(false)
    expect(l.ordre).toEqual(['chrome', 'page', 'overlay'])
    // La poignée reste visible dans la capsule : « Afficher le ciel ».
    await expect(fenetre.getByRole('button', { name: 'Afficher le ciel', exact: true })).toBeVisible()

    // Survol simulé du rail (fenêtres cachées : pas de vraie souris).
    await fenetre.locator('.rail').dispatchEvent('mouseenter')
    await expect(fenetre.locator('.ciel-revele')).toBeVisible()
    await expect(fenetre.getByRole('button', { name: 'Épingler le ciel' })).toBeVisible()
    l = await layout(fenetre)
    expect(l.revele).toBe(true)
    expect(l.ordre).toEqual(['page', 'chrome', 'overlay'])
    // La vue chrome garde toute la fenêtre : la capsule reste là, et le ciel fait 286 px (272 + rail).
    expect(l.bounds.chrome).toEqual(l.bounds.overlay)
    await expect(fenetre.locator('.pilule')).toBeVisible()
    await expect(fenetre.locator('.capsule')).toBeVisible()
    expect((await fenetre.locator('.ciel-revele').boundingBox())!.width).toBe(286)
    expect(l.bounds.page.x).toBe(14)

    // La souris dessus : rien ne bouge, même après le délai de retrait.
    await fenetre.locator('.ciel-revele').dispatchEvent('mouseleave')
    await fenetre.waitForTimeout(150)
    await fenetre.locator('.ciel-revele').dispatchEvent('mouseenter')
    await fenetre.waitForTimeout(500)
    expect((await layout(fenetre)).revele).toBe(true)

    // Sortie : retiré après 300 ms (+ glissement).
    await fenetre.locator('.ciel-revele').dispatchEvent('mouseleave')
    await expect.poll(async () => (await layout(fenetre)).revele).toBe(false)
    await expect(fenetre.locator('.ciel-revele')).toHaveCount(0)
    l = await layout(fenetre)
    expect(l.ordre).toEqual(['chrome', 'page', 'overlay'])
    expect(l.bounds.chrome).toEqual(l.bounds.overlay)

    // Un clic dans la zone transparente (au-dessus de la page) referme la révélation.
    await fenetre.locator('.rail').dispatchEvent('mouseenter')
    await expect(fenetre.locator('.voile')).toHaveCount(1)
    await fenetre.locator('.voile').dispatchEvent('mousedown')
    await expect.poll(async () => (await layout(fenetre)).revele).toBe(false)
    await expect(fenetre.locator('.ciel-revele')).toHaveCount(0)

    // « Épingler le ciel » = démasquer.
    await fenetre.evaluate(() => window.lyra.invoke('ciel:reveler', { actif: true }))
    await fenetre.getByRole('button', { name: 'Épingler le ciel' }).click()
    await expect(fenetre.locator('.ciel')).toBeVisible()
    await expect(fenetre.locator('.rail')).toHaveCount(0)
    l = await layout(fenetre)
    expect(l.ciel.masque).toBe(false)
    expect(l.bounds.page.x).toBe(272)
    expect(l.revele).toBe(false)
  } finally {
    await app.close()
  }
})

test('la poignée révèle, y compris sans révélation au survol ; le survol est alors sans effet', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { ciel: { masque: true, revelerAuSurvol: false } } as never))
    await expect(fenetre.locator('.rail')).toBeVisible()
    await fenetre.locator('.rail').dispatchEvent('mouseenter')
    await fenetre.waitForTimeout(300)
    expect((await layout(fenetre)).revele).toBe(false)
    await fenetre.locator('.poignee').click()
    await expect(fenetre.locator('.ciel-revele')).toBeVisible()
    expect((await layout(fenetre)).revele).toBe(true)
    // Échap retire le ciel révélé.
    // (L'écouteur est posé après le premier rendu : on renvoie la touche tant que le ciel est là.)
    await expect
      .poll(async () => {
        await fenetre.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
        return (await layout(fenetre)).revele
      })
      .toBe(false)
  } finally {
    await app.close()
  }
})

test('CmdOrCtrl+\\ (menu) bascule masqué / épinglé ; l’état replié est restauré au redémarrage', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'lyra-masque-e2e-'))
  const premier = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    const accel = await premier.app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('basculer-ciel')!.accelerator)
    expect(accel).toBe('CmdOrCtrl+\\')
    await menu(premier.app, 'basculer-ciel')
    await expect(premier.fenetre.locator('.rail')).toBeVisible()
    expect((await layout(premier.fenetre)).bounds.page.x).toBe(14)
    // Révélé, puis ⌘ \ : épinglé (révélation retirée).
    await premier.fenetre.locator('.rail').dispatchEvent('mouseenter')
    await expect(premier.fenetre.locator('.ciel-revele')).toBeVisible()
    await menu(premier.app, 'basculer-ciel')
    await expect(premier.fenetre.locator('.ciel')).toBeVisible()
    await expect(premier.fenetre.locator('.ciel-revele')).toHaveCount(0)
    expect((await layout(premier.fenetre)).bounds.page.x).toBe(272)
    await menu(premier.app, 'basculer-ciel')
    await expect(premier.fenetre.locator('.rail')).toBeVisible()
  } finally {
    await premier.app.close()
  }
  const { app, fenetre } = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    await expect(fenetre.locator('.rail')).toBeVisible()
    const l = await layout(fenetre)
    expect(l.ciel.masque).toBe(true)
    expect(l.bounds.page.x).toBe(14)
    expect(l.revele).toBe(false)
  } finally {
    await app.close()
  }
})
