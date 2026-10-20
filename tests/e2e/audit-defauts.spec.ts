import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'

const LIENS = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href
const reglage = (f: Page, ciel: Record<string, unknown>) => f.evaluate((c) => window.lyra.invoke('settings:set', { ciel: c } as never), ciel)
const menuOuvert = (app: ElectronApplication): Page | undefined =>
  app.windows().find((w) => w.url().includes('#overlay') || w.url().includes('ui.html'))

const POSITIONS = [
  { position: 'gauche', masque: false },
  { position: 'droite', masque: false },
  { position: 'haut', masque: false },
  { position: 'bas', masque: false },
  { position: 'droite', masque: true }
]

test('la recherche dans la page ne recouvre aucun bouton de la capsule : ⋯ cliquable, menu ouvert, à chaque position du ciel', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), LIENS)
    await expect.poll(() => app.windows().some((w) => w.url() === LIENS)).toBe(true)
    for (const c of POSITIONS) {
      await reglage(fenetre, c)
      await expect(fenetre.locator(`.fenetre.pos-${c.position}`)).toBeVisible()
      await fenetre.getByRole('button', { name: 'Rechercher dans la page' }).click()
      await expect(fenetre.locator('.findbar')).toBeVisible()
      // Aucune intersection entre la barre et un bouton de la capsule.
      const inter = await fenetre.evaluate(() => {
        const f = document.querySelector('.findbar')!.getBoundingClientRect()
        return [...document.querySelectorAll('.capsule button')]
          .filter((b) => {
            const r = b.getBoundingClientRect()
            return r.width > 0 && r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top && !b.classList.contains('pilule')
          })
          .map((b) => b.getAttribute('aria-label'))
      })
      expect(inter, `position ${c.position}${c.masque ? ' masquée' : ''}`).toEqual([])
      await fenetre.getByRole('button', { name: 'Menu de la page' }).click({ timeout: 3000 })
      await expect.poll(async () => (await Promise.all(app.windows().map((w) => w.getByRole('menu', { name: 'Menu de la page' }).count().catch(() => 0)))).some((n) => n > 0)).toBe(true)
      await fenetre.keyboard.press('Escape')
      await expect.poll(async () => (await Promise.all(app.windows().map((w) => w.getByRole('menu', { name: 'Menu de la page' }).count().catch(() => 0)))).every((n) => n === 0)).toBe(true)
      await fenetre.locator('.findbar input').press('Escape').catch(() => undefined)
      await fenetre.getByRole('button', { name: 'Fermer la recherche' }).click({ timeout: 1000 }).catch(() => undefined)
      await expect(fenetre.locator('.findbar')).toHaveCount(0)
    }
  } finally {
    await app.close()
  }
})

test('allers-retours page web ↔ lyra:// : pas de fuite d’écouteurs sur la fenêtre', async () => {
  const { app, fenetre } = await lancerLyra()
  let sortie = ''
  app.process().stderr?.on('data', (d) => (sortie += String(d)))
  try {
    const id = (await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).sky.activeId!
    const ecouteurs = (): Promise<number> =>
      app.evaluate(({ BaseWindow }) => {
        const w = BaseWindow.getAllWindows()[0]
        return ['closed', 'focus', 'resized'].reduce((n, e) => n + w.listenerCount(e as 'closed'), 0)
      })
    await fenetre.evaluate(([i, u]) => window.lyra.invoke('tabs:navigate', { id: i, url: u }), [id, LIENS])
    await expect.poll(() => app.windows().some((w) => w.url() === LIENS)).toBe(true)
    const avant = await ecouteurs()
    for (let i = 0; i < 20; i++) {
      await fenetre.evaluate(([x]) => window.lyra.invoke('tabs:navigate', { id: x, url: 'lyra://newtab' }), [id])
      await expect.poll(() => app.windows().some((w) => w.url().startsWith('lyra://newtab') && w !== fenetre)).toBe(true)
      await fenetre.evaluate(([x, u]) => window.lyra.invoke('tabs:navigate', { id: x, url: u }), [id, LIENS])
      await expect.poll(() => app.windows().some((w) => w.url() === LIENS)).toBe(true)
    }
    expect(await ecouteurs()).toBeLessThanOrEqual(avant)
    expect(sortie).not.toContain('MaxListenersExceededWarning')
  } finally {
    await app.close()
  }
})
