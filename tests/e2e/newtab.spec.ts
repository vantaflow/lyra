import { test, expect, type Page } from '@playwright/test'
import { lancerLyra } from './helpers'

test('lyra://newtab affiche le salut dans la vue de page', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    // Départ sur lyra://newtab ; on passe par les réglages pour tester une vraie navigation.
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings/historique'))
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://newtab'))
    const trouver = (): Page | undefined => app.windows().find((w) => w.url().startsWith('lyra://newtab'))
    await expect.poll(trouver).toBeDefined()
    const page = trouver()!
    await expect(page.getByText(/^(Bonsoir|Bonjour)\.$/)).toBeVisible()
    await expect(page.getByText('Aucune donnée ne quitte cet ordinateur.')).toBeVisible()
    expect(await page.evaluate(() => typeof window.lyra.invoke)).toBe('function')
  } finally {
    await app.close()
  }
})

test('lyra:// renvoie 404 pour un fichier absent', async () => {
  const { app } = await lancerLyra()
  try {
    const trouver = (): Page | undefined => app.windows().find((w) => w.url().startsWith('lyra://newtab'))
    await expect.poll(trouver).toBeDefined()
    const statut = await trouver()!.evaluate(() => fetch('lyra://newtab/assets/absent.js').then((r) => r.status))
    expect(statut).toBe(404)
  } finally {
    await app.close()
  }
})

test('une étoile lyra://newtab a le favicon de Lyra, servi par lyra:// et chargé', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const etoile = async (): Promise<{ id: string; favicon?: string } | undefined> => {
      const { sky, etats } = await fenetre.evaluate(() => window.lyra.invoke('sky:get'))
      const s = sky.stars.find((e) => e.url.startsWith('lyra://newtab'))
      return s && { id: s.id, favicon: etats[s.id]?.favicon ?? s.favicon }
    }
    await expect.poll(async () => (await etoile())?.favicon).toBe('lyra://newtab/favicon.png')
    // Chargé pour de bon : la page du nouvel onglet obtient bien un PNG 64 px de lyra://.
    const page = app.windows().find((w) => w.url().startsWith('lyra://newtab'))!
    const res = await page.evaluate(async () => {
      const r = await fetch('/favicon.png')
      const bitmap = await createImageBitmap(await r.blob())
      return { statut: r.status, type: r.headers.get('content-type'), largeur: bitmap.width }
    })
    expect(res).toEqual({ statut: 200, type: 'image/png', largeur: 64 })
    // Et dans l'interface : l'épingle de l'étoile affiche l'image (la CSP du chrome admet lyra:).
    const id = (await etoile())!.id
    await fenetre.evaluate((i) => window.lyra.invoke('tabs:pin', { id: i, pinned: true }), id)
    const img = fenetre.locator('.pin img')
    await expect(img).toHaveAttribute('src', 'lyra://newtab/favicon.png')
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBe(64)
  } finally {
    await app.close()
  }
})

test('« À propos » affiche l\'icône à côté du nom et de la version', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings'))
    const trouver = (): Page | undefined => app.windows().find((w) => w.url().startsWith('lyra://settings'))
    await expect.poll(trouver).toBeDefined()
    const r = trouver()!
    await r.evaluate(() => (location.hash = '#/apropos'))
    await expect(r.getByText(/^Version \d+\.\d+\.\d+ · Navigateur sous licence GPL-3\.0$/)).toBeVisible()
    const img = r.locator('.card img')
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBe(64)
    // La page porte aussi son propre favicon.
    expect(await r.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href)).toBe('lyra://settings/favicon.png')
  } finally {
    await app.close()
  }
})
