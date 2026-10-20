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

test('CmdOrCtrl+'+String.fromCharCode(92)+' (menu) : épinglé, masqué, révélé, épinglé, masqué ; l’état replié est restauré au redémarrage', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'lyra-masque-e2e-'))
  const premier = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    const accel = await premier.app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('basculer-ciel')!.accelerator)
    expect(accel).toBe('CmdOrCtrl+\\')
    // Épinglé : ⌘ + antislash masque.
    await menu(premier.app, 'basculer-ciel')
    await expect(premier.fenetre.locator('.rail')).toBeVisible()
    expect((await layout(premier.fenetre)).bounds.page.x).toBe(14)
    // Masqué : il révèle.
    await menu(premier.app, 'basculer-ciel')
    await expect(premier.fenetre.locator('.ciel-revele')).toBeVisible()
    expect((await layout(premier.fenetre)).revele).toBe(true)
    // Révélé : il épingle.
    await menu(premier.app, 'basculer-ciel')
    await expect(premier.fenetre.locator('.ciel')).toBeVisible()
    await expect(premier.fenetre.locator('.ciel-revele')).toHaveCount(0)
    const l = await layout(premier.fenetre)
    expect(l.bounds.page.x).toBe(272)
    expect(l.revele).toBe(false)
    // Épinglé : masqué (état gardé pour le redémarrage).
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

/** Début d'un glisser de l'en-tête du ciel révélé jusqu'au point (x, y), sans relâcher. */
const commencerGlisser = (f: Page, x: number, y: number): Promise<void> =>
  f.evaluate(
    ([x1, y1]) => {
      const cible = document.querySelector('.marque-lyra')!
      const r = cible.getBoundingClientRect()
      const ev = (type: string, cx: number, cy: number): PointerEvent =>
        new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: cx, clientY: cy })
      cible.dispatchEvent(ev('pointerdown', r.x + 4, r.y + 4))
      window.dispatchEvent(ev('pointermove', r.x + 30, r.y + 30))
      window.dispatchEvent(ev('pointermove', x1, y1))
    },
    [x, y]
  )

test('ciel révélé : on vise à partir du ciel affiché (pas du rail de 14 px) ; Échap pendant le glisser rétablit la page', async () => {
  test.setTimeout(60_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { ciel: { masque: true } } as never))
    await expect(fenetre.locator('.rail')).toBeVisible()
    const reveler = async (): Promise<void> => {
      await fenetre.evaluate(() => window.lyra.invoke('ciel:reveler', { actif: true }))
      await expect(fenetre.locator('.ciel-revele')).toBeVisible()
    }
    await reveler()
    // (200, 5) : sur le ciel révélé (272 px) mais hors du rail (14 px) ; mesuré depuis le rail il viserait le haut
    // (coin supérieur gauche, plus proche du haut). La position ne change pas, pas de repère.
    await commencerGlisser(fenetre, 200, 5)
    await fenetre.waitForTimeout(200)
    expect((await layout(fenetre)).glisse).toBe(false)
    await expect(fenetre.locator('.cible-ciel')).toHaveCount(0)
    await fenetre.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, clientY: 5, pointerId: 1 })))
    expect((await layout(fenetre)).ciel.position).toBe('gauche')

    // Glisser vers l'autre bord : repère, page retirée ; Échap annule et rétablit la page, le ciel reste replié à gauche.
    await commencerGlisser(fenetre, 1200, 400)
    await expect.poll(async () => (await layout(fenetre)).glisse).toBe(true)
    await expect(fenetre.locator('.cible-ciel.cible-droite')).toHaveCount(1)
    await fenetre.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    await expect.poll(async () => (await layout(fenetre)).glisse).toBe(false)
    await expect(fenetre.locator('.cible-ciel')).toHaveCount(0)
    await expect.poll(async () => (await layout(fenetre)).revele).toBe(false)
    const l = await layout(fenetre)
    expect(l.ciel).toMatchObject({ position: 'gauche', masque: true })
    expect(l.bounds.page.x).toBe(14)
    expect(l.ordre).toEqual(['chrome', 'page', 'overlay'])
  } finally {
    await app.close()
  }
})

test('⌘ \\ pendant Ne pas déranger : aucun ciel révélé à la sortie du mode', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { ciel: { masque: true } } as never))
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('dnd:get'))).actif).toBe(true)
    await menu(app, 'basculer-ciel')
    await fenetre.evaluate(() => window.lyra.invoke('dnd:sortir'))
    await expect.poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('dnd:get'))).actif).toBe(false)
    const l = await layout(fenetre)
    expect(l.revele).toBe(false)
    expect(l.ordre).toEqual(['chrome', 'page', 'overlay'])
  } finally {
    await app.close()
  }
})

test("fenêtre fermée pendant le glissement de la poignée : l'aperçu de largeur est levé", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const x0 = (await layout(fenetre)).bounds.page.x
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
    const interfaces = (): Page[] => app.windows().filter((p) => p.url().includes('#privee') && !p.url().includes('#overlay'))
    await expect.poll(() => interfaces().length).toBe(1)
    const privee = interfaces()[0]
    await privee.evaluate(() => window.lyra.invoke('ciel:apercu', { largeur: 400 }))
    await expect.poll(async () => (await layout(fenetre)).bounds.page.x).toBeGreaterThan(x0)
    // Fermeture de la fenêtre qui glissait (la plus récente), sans fin de glissement.
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().sort((a, b) => b.id - a.id)[0].close())
    await expect.poll(async () => (await layout(fenetre)).bounds.page.x).toBe(x0)
  } finally {
    await app.close()
  }
})
