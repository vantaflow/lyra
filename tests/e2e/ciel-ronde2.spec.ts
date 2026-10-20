import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lancerLyra } from './helpers'

const PERMISSIONS = pathToFileURL(resolve(__dirname, 'fixtures/permissions.html')).href
const layout = (f: Page) => f.evaluate(() => window.lyra.invoke('layout:get'))
const reglage = (f: Page, ciel: Record<string, unknown>) =>
  f.evaluate((c) => window.lyra.invoke('settings:set', { ciel: c } as never), ciel)
const overlay = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url().includes('#overlay'))
const pageWeb = (app: ElectronApplication, adresse: string): Page | undefined => app.windows().find((w) => w.url() === adresse)

/** Début d'un glisser de l'en-tête (évènements pointeur) jusqu'au point (x, y), sans relâcher. */
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

test('invite de permission et panneaux : visibles et dans la fenêtre, pour chaque position', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), PERMISSIONS)
    await expect.poll(() => pageWeb(app, PERMISSIONS)).toBeDefined()
    const p = pageWeb(app, PERMISSIONS)!
    for (const [position, masque] of [['gauche', false], ['droite', false], ['haut', false], ['bas', false], ['haut', true]] as const) {
      await reglage(fenetre, { position, masque })
      await expect(fenetre.locator(`.fenetre.pos-${position}`)).toHaveCount(1)
      const { bounds } = await layout(fenetre)

      // Invite de permission : sous la pilule, dans la zone de la page.
      await p.evaluate(() => void Notification.requestPermission())
      await expect.poll(() => overlay(app) !== undefined).toBe(true)
      const o = overlay(app)!
      const carte = o.locator('.perm-carte')
      await expect(carte).toBeVisible()
      const taille = await o.evaluate(() => ({ w: innerWidth, h: innerHeight }))
      let b = (await carte.boundingBox())!
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(taille.w + 1)
      expect(b.y + b.height).toBeLessThanOrEqual(taille.h + 1)
      // Jamais sur le ciel : dans le rectangle de la page (la capsule, 46 px, est au-dessus).
      expect(b.x).toBeGreaterThanOrEqual(bounds.page.x - 1)
      expect(b.x + b.width).toBeLessThanOrEqual(bounds.page.x + bounds.page.width + 1)
      expect(b.y).toBeGreaterThanOrEqual(bounds.page.y)
      // Strictement dans la page : aussi en bas, et juste sous la capsule (pas à l'autre bout de la zone).
      expect(b.y + b.height).toBeLessThanOrEqual(bounds.page.y + bounds.page.height + 1)
      expect(b.y).toBeLessThanOrEqual(bounds.page.y + 24)
      await o.getByRole('button', { name: 'Refuser' }).click()
      await expect(carte).toHaveCount(0)

      // Panneaux Boucliers et Téléchargements : dans la fenêtre ; en bande, à droite, sous ou sur la bande.
      for (const [canal, sel] of [['shields:open', '.pn-bouclier'], ['downloads:panel', '.pn-dl']] as const) {
        await fenetre.evaluate((c) => window.lyra.invoke(c as 'shields:open'), canal)
        const panneau = overlay(app)!.locator(sel)
        await expect(panneau).toBeVisible()
        b = (await panneau.boundingBox())!
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.x + b.width).toBeLessThanOrEqual(taille.w + 1)
        expect(b.y + b.height).toBeLessThanOrEqual(taille.h + 1)
        if (position === 'haut') {
          expect(b.y).toBeGreaterThanOrEqual(56)
          expect(b.x + b.width).toBeGreaterThan(taille.w - 20)
        }
        if (position === 'bas') {
          expect(b.y + b.height).toBeLessThanOrEqual(taille.h - 56 + 1)
          expect(b.x + b.width).toBeGreaterThan(taille.w - 20)
        }
        await overlay(app)!.evaluate(() => window.lyra.invoke('overlay:close'))
      }
    }
  } finally {
    await app.close()
  }
})

test('glisser de l’en-tête : Échap, perte du focus et rechargement du chrome annulent et rétablissent la page', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const libre = async (): Promise<void> => {
      await expect.poll(async () => (await layout(fenetre)).glisse).toBe(false)
      await expect(fenetre.locator('.cible-ciel')).toHaveCount(0)
      expect((await layout(fenetre)).ciel.position).toBe('gauche')
    }
    // Un micro-glisser reste sur le ciel : aucun repère, la page n'est pas retirée.
    await commencerGlisser(fenetre, 120, 40)
    await fenetre.waitForTimeout(150)
    expect((await layout(fenetre)).glisse).toBe(false)
    await expect(fenetre.locator('.cible-ciel')).toHaveCount(0)
    await fenetre.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { clientX: 120, clientY: 40, pointerId: 1 })))
    await libre()

    // Échap.
    await commencerGlisser(fenetre, 1200, 400)
    await expect.poll(async () => (await layout(fenetre)).glisse).toBe(true)
    await expect(fenetre.locator('.cible-ciel.cible-droite')).toHaveCount(1)
    await fenetre.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    await libre()

    // Perte du focus de la fenêtre.
    await commencerGlisser(fenetre, 640, 30)
    await expect.poll(async () => (await layout(fenetre)).glisse).toBe(true)
    await fenetre.evaluate(() => window.dispatchEvent(new Event('blur')))
    await libre()

    // La vue chrome se recharge en plein glisser : le main rétablit la page.
    await commencerGlisser(fenetre, 640, 770)
    await expect.poll(async () => (await layout(fenetre)).glisse).toBe(true)
    await fenetre.reload()
    await expect
      .poll(async () => (await layout(fenetre).catch(() => ({ glisse: true }))).glisse, { timeout: 10_000 })
      .toBe(false)
    expect((await layout(fenetre)).ciel.position).toBe('gauche')
  } finally {
    await app.close()
  }
})

test('largeur : aperçu en direct sans rien écrire, enregistrée une seule fois au relâchement ; Échap annule', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const poignee = async (): Promise<{ x: number; y: number }> => {
      const p = (await fenetre.locator('.poignee-largeur').boundingBox())!
      return { x: p.x + 3, y: 300 }
    }
    // Compte les diffusions de réglages reçues par le chrome pendant le glisser.
    await fenetre.evaluate(() => {
      const w = window as unknown as { __diffusions: number }
      w.__diffusions = 0
      window.lyra.on('settings:changed', () => (w.__diffusions += 1))
    })
    let d = await poignee()
    await fenetre.mouse.move(d.x, d.y)
    await fenetre.mouse.down()
    await fenetre.mouse.move(310, 300)
    await fenetre.mouse.move(350, 300)
    // En direct : la page suit, le réglage enregistré n'a pas bougé.
    await expect.poll(async () => (await layout(fenetre)).bounds.page.x).toBe(350)
    expect((await layout(fenetre)).ciel.largeur).toBe(272)
    expect(await fenetre.evaluate(() => (window as unknown as { __diffusions: number }).__diffusions)).toBe(0)
    await fenetre.mouse.up()
    await expect.poll(async () => (await layout(fenetre)).ciel.largeur).toBe(350)
    expect((await layout(fenetre)).bounds.page.x).toBe(350)
    expect(await fenetre.evaluate(() => (window as unknown as { __diffusions: number }).__diffusions)).toBe(1)

    // Échap : retour à 350, rien d'écrit.
    d = await poignee()
    await fenetre.mouse.move(d.x, d.y)
    await fenetre.mouse.down()
    await fenetre.mouse.move(400, 300)
    await expect.poll(async () => (await layout(fenetre)).bounds.page.x).toBe(400)
    await fenetre.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    await expect.poll(async () => (await layout(fenetre)).bounds.page.x).toBe(350)
    expect((await layout(fenetre)).ciel.largeur).toBe(350)
    await fenetre.mouse.up()
  } finally {
    await app.close()
  }
})

test('ciel:apercu hors bornes : bornée à 200-420, valeur non numérique ignorée, null rétablit ; rien d’écrit', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const apercu = (largeur: unknown): Promise<void> => fenetre.evaluate((l) => window.lyra.invoke('ciel:apercu', { largeur: l as number }), largeur)
    const pageX = async (): Promise<number> => (await layout(fenetre)).bounds.page.x
    expect(await pageX()).toBe(272)
    await apercu(9999)
    await expect.poll(pageX).toBe(420)
    await apercu(-5)
    await expect.poll(pageX).toBe(200)
    await apercu(310)
    await expect.poll(pageX).toBe(310)
    // Valeurs invalides : l'aperçu courant reste.
    await apercu('large')
    await apercu(undefined)
    await fenetre.waitForTimeout(150)
    expect(await pageX()).toBe(310)
    await apercu(null)
    await expect.poll(pageX).toBe(272)
    expect((await layout(fenetre)).ciel.largeur).toBe(272)
  } finally {
    await app.close()
  }
})

test('Windows : l’en-tête du ciel à droite passe sous les boutons de fenêtre, même à 200 px ; taille minimale de la fenêtre', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const [minL, minH] = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].getMinimumSize())
    expect([minL, minH]).toEqual([900, 400])
    await reglage(fenetre, { position: 'droite', largeur: 200 })
    await expect(fenetre.locator('.ciel.pos-droite')).toBeVisible()
    const replier = (await fenetre.getByRole('button', { name: 'Replier le ciel' }).boundingBox())!
    const ciel = (await fenetre.locator('.ciel').boundingBox())!
    // Dans le ciel, jamais déborder à gauche ni à droite.
    expect(replier.x).toBeGreaterThanOrEqual(ciel.x)
    expect(replier.x + replier.width).toBeLessThanOrEqual(ciel.x + ciel.width + 0.5)
    if (process.platform === 'win32') {
      // Les boutons natifs (titleBarOverlay) font 32 px de haut : le bouton est dessous.
      expect(replier.y).toBeGreaterThanOrEqual(32)
    }
  } finally {
    await app.close()
  }
})

test('la bande défile : molette, étoile active dans la vue, « Nouvelle étoile » toujours visible', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await reglage(fenetre, { position: 'haut' })
    await expect(fenetre.locator('.bande-haut')).toBeVisible()
    for (let i = 0; i < 14; i++) await fenetre.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://newtab' }))
    const nav = fenetre.locator('.bande-etoiles')
    await expect.poll(async () => nav.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true)
    const largeur = await fenetre.evaluate(() => innerWidth)
    // « + » hors du défilement et dans la fenêtre.
    const plus = (await fenetre.locator('.nouvelle-icone').boundingBox())!
    expect(plus.x + plus.width).toBeLessThanOrEqual(largeur)
    // L'étoile active (la dernière ouverte) est ramenée dans la vue.
    await expect
      .poll(async () =>
        fenetre.evaluate(() => {
          const n = document.querySelector('.bande-etoiles')!.getBoundingClientRect()
          const a = document.querySelector('.bande-etoiles .hs.active')!.getBoundingClientRect()
          return a.left >= n.left - 1 && a.right <= n.right + 1
        })
      )
      .toBe(true)
    // La molette (verticale) fait défiler horizontalement.
    await nav.evaluate((e) => (e.scrollLeft = 0))
    const b = (await nav.boundingBox())!
    await fenetre.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await fenetre.mouse.wheel(0, 240)
    await expect.poll(async () => nav.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0)
  } finally {
    await app.close()
  }
})
