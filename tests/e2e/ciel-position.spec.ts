import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lancerLyra } from './helpers'

const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href
/** Les boîtes du DOM sont en pixels fractionnaires (mise à l'échelle de l'écran) : tolérance d'un pixel. */
const proche = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(1.5)
const layout = (f: Page) => f.evaluate(() => window.lyra.invoke('layout:get'))
const fenetreTaille = (app: ElectronApplication) =>
  app.evaluate(({ BaseWindow }) => {
    const b = BaseWindow.getAllWindows()[0].getContentBounds()
    return { width: b.width, height: b.height }
  })
const reglage = (f: Page, ciel: Record<string, unknown>) =>
  f.evaluate((c) => window.lyra.invoke('settings:set', { ciel: c } as never), ciel)
/** Vues web existantes (id:url), et compteur des chargements lancés depuis qu'on les surveille. */
const surveiller = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) => {
    const g = globalThis as unknown as { __charges?: number }
    g.__charges = 0
    for (const wc of webContents.getAllWebContents()) wc.on('did-start-loading', () => (g.__charges = (g.__charges ?? 0) + 1))
    return webContents
      .getAllWebContents()
      .map((w) => `${w.id}:${w.getURL()}`)
      .sort()
  })
const charges = (app: ElectronApplication) => app.evaluate(() => (globalThis as unknown as { __charges?: number }).__charges ?? 0)
const palette = (f: Page, id: string, titre: string) =>
  f.evaluate(
    ([i, t]) => window.lyra.invoke('palette:go', { suggestion: { type: 'commande', id: i, titre: t, icone: '⌘' }, texte: '' } as never),
    [id, titre]
  )

test('positions du ciel : bounds attendues, changement à chaud sans recharger les onglets, par réglage et par palette', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)
    await expect.poll(() => app.windows().some((w) => w.url() === FIXTURE)).toBe(true)
    const { width, height } = await fenetreTaille(app)
    const avant = await surveiller(app)
    const page = async (): Promise<{ x: number; y: number; width: number; height: number }> => (await layout(fenetre)).bounds.page

    // Droite : miroir, colonne de 272 px à droite, capsule au-dessus de la page.
    await reglage(fenetre, { position: 'droite' })
    await expect(fenetre.locator('.fenetre.pos-droite .ciel.pos-droite')).toBeVisible()
    expect(await page()).toEqual({ x: 0, y: 46, width: width - 272, height: height - 46 })
    const ciel = (await fenetre.locator('.ciel').boundingBox())!
    proche(ciel.x, width - 272)
    proche(ciel.width, 272)
    await expect(fenetre.locator('.capsule')).toBeVisible()
    expect(await fenetre.locator('.carte').evaluate((e) => getComputedStyle(e).borderRadius)).toBe('0px 12px 12px 0px')

    // Haut : bande de 56 px, capsule sous la bande.
    await reglage(fenetre, { position: 'haut' })
    await expect(fenetre.locator('.bande.bande-haut')).toBeVisible()
    expect(await page()).toEqual({ x: 0, y: 102, width, height: height - 102 })
    const bande = (await fenetre.locator('.bande').boundingBox())!
    expect([bande.x, bande.y, bande.height]).toEqual([0, 0, 56])
    expect((await fenetre.locator('.capsule').boundingBox())!.y).toBe(56)
    await expect(fenetre.locator('.bande .hs.active')).toHaveCount(1)

    // Bas : capsule en haut, bande de 56 px en bas.
    await reglage(fenetre, { position: 'bas' })
    await expect(fenetre.locator('.bande.bande-bas')).toBeVisible()
    expect(await page()).toEqual({ x: 0, y: 46, width, height: height - 46 - 56 })
    const bas = (await fenetre.locator('.bande').boundingBox())!
    proche(bas.y, height - 56)
    expect(bas.height).toBe(56)
    expect((await fenetre.locator('.capsule').boundingBox())!.y).toBe(0)

    // Par la palette.
    await palette(fenetre, 'ciel-gauche', 'Déplacer le ciel à gauche')
    await expect(fenetre.locator('.ciel.pos-gauche')).toBeVisible()
    expect(await page()).toEqual({ x: 272, y: 46, width: width - 272, height: height - 46 })
    await palette(fenetre, 'ciel-droite', 'Déplacer le ciel à droite')
    await expect(fenetre.locator('.ciel.pos-droite')).toBeVisible()
    expect((await page()).width).toBe(width - 272)
    await palette(fenetre, 'ciel-haut', 'Déplacer le ciel en haut')
    await expect(fenetre.locator('.bande.bande-haut')).toBeVisible()
    expect((await page()).y).toBe(102)
    await palette(fenetre, 'ciel-bas', 'Déplacer le ciel en bas')
    await expect(fenetre.locator('.bande.bande-bas')).toBeVisible()
    expect((await page()).height).toBe(height - 46 - 56)
    // La commande démasque le ciel.
    await reglage(fenetre, { masque: true })
    await palette(fenetre, 'ciel-droite', 'Déplacer le ciel à droite')
    expect((await layout(fenetre)).ciel).toMatchObject({ position: 'droite', masque: false })

    // Aucune vue web recréée ni rechargée.
    expect(await surveiller(app)).toEqual(avant)
    expect(await charges(app)).toBe(0)
  } finally {
    await app.close()
  }
})

test('ciel masqué : rail sur le bord de chaque position, capsule conservée, révélation par-dessus la page', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const { width, height } = await fenetreTaille(app)
    const cas = [
      { position: 'droite', rail: [width - 14, 0, 14, height], page: { x: 0, y: 46, width: width - 14, height: height - 46 } },
      { position: 'haut', rail: [0, 0, width, 14], page: { x: 0, y: 60, width, height: height - 60 } },
      { position: 'bas', rail: [0, height - 14, width, 14], page: { x: 0, y: 46, width, height: height - 46 - 14 } }
    ] as const
    for (const c of cas) {
      await reglage(fenetre, { position: c.position, masque: true })
      await expect(fenetre.locator('.rail')).toBeVisible()
      const r = (await fenetre.locator('.rail').boundingBox())!
      c.rail.forEach((v, i) => proche([r.x, r.y, r.width, r.height][i], v))
      const l = await layout(fenetre)
      expect(l.bounds.page).toEqual(c.page)
      expect(l.bounds.chrome).toEqual(l.bounds.overlay)
      await expect(fenetre.locator('.capsule')).toBeVisible()
      await expect(fenetre.locator('.pilule')).toBeVisible()
      // Révélation : chrome au-dessus de la page, page inchangée.
      await fenetre.locator('.rail').dispatchEvent('mouseenter')
      await expect(fenetre.locator(c.position === 'droite' ? '.ciel-revele' : '.bande-revele')).toBeVisible()
      const rev = await layout(fenetre)
      expect(rev.revele).toBe(true)
      expect(rev.ordre).toEqual(['page', 'chrome', 'overlay'])
      expect(rev.bounds.page).toEqual(c.page)
      await fenetre.evaluate(() => window.lyra.invoke('ciel:reveler', { actif: false }))
      await expect(fenetre.locator('.rail')).toBeVisible()
    }
    // Droite : le ciel révélé fait 286 px (272 + rail) et touche le bord droit.
    await reglage(fenetre, { position: 'droite', masque: true })
    await fenetre.locator('.rail').dispatchEvent('mouseenter')
    await expect(fenetre.locator('.ciel-revele')).toBeVisible()
    await fenetre.waitForTimeout(400)
    // (Fenêtre cachée : l'animation de glissement ne progresse pas ; on lit donc le placement CSS, pas la boîte animée.)
    const b = await fenetre.locator('.ciel-revele').evaluate((e) => ({ right: getComputedStyle(e).right, width: e.getBoundingClientRect().width }))
    expect(b).toEqual({ right: '0px', width: 286 })
  } finally {
    await app.close()
  }
})

test('largeur du ciel : bornée 200-420, poignée de redimensionnement (gauche et droite)', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const { width } = await fenetreTaille(app)
    const tirer = async (versX: number): Promise<void> => {
      const p = (await fenetre.locator('.poignee-largeur').boundingBox())!
      await fenetre.mouse.move(p.x + 3, 300)
      await fenetre.mouse.down()
      await fenetre.mouse.move(p.x + 3 + (versX - (p.x + 3)) / 2, 300)
      await fenetre.mouse.move(versX, 300)
      await fenetre.mouse.up()
    }
    await expect(fenetre.locator('.poignee-largeur')).toHaveCount(1)
    await tirer(340)
    await expect.poll(async () => (await layout(fenetre)).ciel.largeur).toBe(340)
    expect((await layout(fenetre)).bounds.page.x).toBe(340)
    // Bornes : au-delà, la largeur est ramenée à 420 puis 200.
    await tirer(900)
    await expect.poll(async () => (await layout(fenetre)).ciel.largeur).toBe(420)
    await tirer(20)
    await expect.poll(async () => (await layout(fenetre)).ciel.largeur).toBe(200)
    // Droite : la poignée est sur le bord gauche du ciel.
    await reglage(fenetre, { position: 'droite', largeur: 300 })
    await expect(fenetre.locator('.ciel.pos-droite')).toBeVisible()
    proche((await fenetre.locator('.poignee-largeur').boundingBox())!.x, width - 300)
    await tirer(width - 380)
    await expect.poll(async () => Math.abs((await layout(fenetre)).ciel.largeur - 380)).toBeLessThanOrEqual(1)
    const l = await layout(fenetre)
    expect(l.bounds.page.width).toBe(width - l.ciel.largeur)
    // Le réglage est aussi borné côté main (validation).
    await reglage(fenetre, { largeur: 999 })
    expect((await layout(fenetre)).ciel.largeur).toBe(l.ciel.largeur)
  } finally {
    await app.close()
  }
})

test('glisser l’en-tête du ciel vers un bord le déplace ; l’interrupteur le désactive', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const { width, height } = await fenetreTaille(app)
    const glisser = async (x: number, y: number): Promise<void> => {
      const e = (await fenetre.locator('.ciel-entete, .bande-entete').first().boundingBox())!
      await fenetre.mouse.move(e.x + 30, e.y + 15)
      await fenetre.mouse.down()
      await fenetre.mouse.move(e.x + 60, e.y + 40)
      await fenetre.mouse.move(x, y)
      await fenetre.mouse.up()
    }
    // Fenêtre cachée : les zones de déplacement de la fenêtre ne sont levées qu'au rendu suivant, qui n'a pas lieu ; les
    // glissers qui traversent la capsule sont donc joués en évènements pointeur (la logique est la même).
    const glisserSynthetique = (x: number, y: number): Promise<void> =>
      fenetre.evaluate(
        ([x1, y1]) => {
          const cible = document.querySelector('.marque-lyra')!
          const r = cible.getBoundingClientRect()
          const ev = (type: string, cx: number, cy: number): PointerEvent =>
            new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: cx, clientY: cy })
          cible.dispatchEvent(ev('pointerdown', r.x + 4, r.y + 4))
          window.dispatchEvent(ev('pointermove', r.x + 30, r.y + 30))
          window.dispatchEvent(ev('pointermove', x1, y1))
          window.dispatchEvent(ev('pointerup', x1, y1))
        },
        [x, y]
      )
    const vers = async (x: number, y: number, position: string, synthetique = true): Promise<void> => {
      if (synthetique) await glisserSynthetique(x, y)
      else await glisser(x, y)
      await expect.poll(async () => (await layout(fenetre)).ciel.position).toBe(position)
      // L'interface a fini de se redessiner (sinon le glisser suivant démarrerait sur l'ancien ciel).
      await expect(fenetre.locator(`.fenetre.pos-${position}`)).toHaveCount(1)
    }
    await vers(width - 60, height / 2, 'droite', false)
    await vers(width / 2, 30, 'haut')
    await vers(width / 2, height - 30, 'bas')
    await vers(40, height / 2, 'gauche')
    // La page est rétablie après le glisser ; un simple clic (sous le seuil) ne déplace rien.
    expect((await layout(fenetre)).ordre).toEqual(['chrome', 'page', 'overlay'])
    const e = (await fenetre.locator('.ciel-entete').boundingBox())!
    await fenetre.mouse.click(e.x + 30, e.y + 15)
    expect((await layout(fenetre)).ciel.position).toBe('gauche')
    // Interrupteur désactivé : le glisser ne fait rien.
    await reglage(fenetre, { deplacerParGlisser: false })
    await expect(fenetre.locator('.ciel-entete.deplacable')).toHaveCount(0)
    await glisserSynthetique(width - 60, height / 2)
    await fenetre.waitForTimeout(300)
    expect((await layout(fenetre)).ciel.position).toBe('gauche')
  } finally {
    await app.close()
  }
})

test('la position, la largeur et le masquage sont restaurés au démarrage', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'lyra-position-e2e-'))
  const premier = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    await reglage(premier.fenetre, { position: 'droite', largeur: 330 })
    await expect(premier.fenetre.locator('.ciel.pos-droite')).toBeVisible()
  } finally {
    await premier.app.close()
  }
  const second = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    await expect(second.fenetre.locator('.ciel.pos-droite')).toBeVisible()
    const { width } = await fenetreTaille(second.app)
    const l = await layout(second.fenetre)
    expect(l.ciel).toMatchObject({ position: 'droite', largeur: 330, masque: false })
    expect(l.bounds.page).toMatchObject({ x: 0, y: 46, width: width - 330 })
    await reglage(second.fenetre, { position: 'bas', masque: true })
  } finally {
    await second.app.close()
  }
  const troisieme = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    await expect(troisieme.fenetre.locator('.rail.rail-bas')).toBeVisible()
    expect((await layout(troisieme.fenetre)).ciel).toMatchObject({ position: 'bas', masque: true })
  } finally {
    await troisieme.app.close()
  }
})

test('les réglages : vignettes de position, curseur de largeur', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://settings' }))
    await expect.poll(() => app.windows().some((w) => w.url().startsWith('lyra://settings'))).toBe(true)
    const r = app.windows().find((w) => w.url().startsWith('lyra://settings'))!
    await expect(r.locator('.pos')).toHaveText(['Gauche', 'Droite', 'Haut', 'Bas', 'Masqué'])
    await expect(r.locator('.pos[aria-pressed="true"]')).toHaveText('Gauche')
    await r.getByRole('button', { name: 'Droite' }).click()
    await expect.poll(async () => (await layout(fenetre)).ciel.position).toBe('droite')
    await expect(r.locator('.pos[aria-pressed="true"]')).toHaveText('Droite')
    await r.getByRole('button', { name: 'Masqué' }).click()
    await expect.poll(async () => (await layout(fenetre)).ciel.masque).toBe(true)
    await expect(r.locator('.pos[aria-pressed="true"]')).toHaveText('Masqué')
    await r.getByRole('button', { name: 'Bas' }).click()
    await expect.poll(async () => (await layout(fenetre)).ciel).toMatchObject({ position: 'bas', masque: false })
    const rng = r.getByRole('slider', { name: 'Largeur du ciel' })
    await expect(rng).toHaveAttribute('min', '200')
    await expect(rng).toHaveAttribute('max', '420')
    await rng.fill('360')
    await expect.poll(async () => (await layout(fenetre)).ciel.largeur).toBe(360)
  } finally {
    await app.close()
  }
})
