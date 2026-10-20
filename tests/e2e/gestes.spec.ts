import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'
import type { SkyChange } from '../../src/shared/ipc'

const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href

const ciel = (f: Page): Promise<SkyChange> => f.evaluate(() => window.lyra.invoke('sky:get'))
const pageFixture = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url() === FIXTURE)

/** Clic du bouton du milieu sur `#normal`, injecté dans la vue de la page (chemin d'entrée réel de Chromium). */
async function clicMolette(app: ElectronApplication): Promise<void> {
  const centre = await pageFixture(app)!.evaluate(() => {
    const r = document.getElementById('normal')!.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
  await app.evaluate(({ webContents }, [adresse, c]) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL() === adresse)!
    wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'middle', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'middle', clickCount: 1 })
  }, [FIXTURE, centre] as const)
}

test('clic molette sur un lien : nouvelle étoile reliée en arrière-plan ; refusé quand le geste est coupé', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)
    await expect.poll(() => pageFixture(app)).toBeDefined()
    const avant = (await ciel(fenetre)).sky
    expect(avant.stars).toHaveLength(2)

    await clicMolette(app)
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(3)
    const { sky } = await ciel(fenetre)
    expect(sky.stars[2].parentId).toBe(avant.activeId)
    expect(sky.stars[2].url).toContain('liens.html?normal')
    expect(sky.activeId).toBe(avant.activeId)

    // Interrupteur coupé : le même clic ne fait plus rien.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { gestes: { defilementHorizontal: true, clicMolette: false, molettePlusCmdZoom: true } }))
    await clicMolette(app)
    await new Promise((r) => setTimeout(r, 1000))
    expect((await ciel(fenetre)).sky.stars).toHaveLength(3)

    // Réactivé : le clic molette ouvre de nouveau l'étoile.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { gestes: { defilementHorizontal: true, clicMolette: true, molettePlusCmdZoom: true } }))
    await clicMolette(app)
    await expect.poll(async () => (await ciel(fenetre)).sky.stars.length).toBe(4)
  } finally {
    await app.close()
  }
})

test('réglages : la section Gestes et souris montre les trois interrupteurs, qui écrivent gestes.*', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/gestes'))
    await expect.poll(() => app.windows().find((w) => w.url().startsWith('lyra://settings'))).toBeDefined()
    const r = app.windows().find((w) => w.url().startsWith('lyra://settings'))!
    await expect(r.locator('h1')).toHaveText('Gestes et souris')
    for (const id of ['defilementHorizontal', 'clicMolette', 'molettePlusCmdZoom']) {
      await expect(r.locator(`[data-reglage="gestes.${id}"] button[role="switch"]`)).toHaveAttribute('aria-checked', 'true')
    }
    await r.locator('[data-reglage="gestes.clicMolette"] button[role="switch"]').click()
    await expect.poll(() => fenetre.evaluate(async () => (await window.lyra.invoke('settings:get')).gestes)).toEqual({ defilementHorizontal: true, clicMolette: false, molettePlusCmdZoom: true })
    await expect(r.locator('[data-reglage="gestes.clicMolette"] button[role="switch"]')).toHaveAttribute('aria-checked', 'false')
  } finally {
    await app.close()
  }
})
