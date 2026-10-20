import { test, expect, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'

const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href
const page = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

test('premier lancement : choix du moteur (Kagi) puis la palette le propose', async () => {
  const { app, fenetre } = await lancerLyra({}, { premierLancement: true })
  try {
    await expect.poll(() => page(app, 'lyra://newtab')).toBeDefined()
    const n = page(app, 'lyra://newtab')!
    await expect(n.getByText('Quel moteur de recherche ?')).toBeVisible()
    await expect(n.locator('#recherche')).toHaveCount(0)
    await n.getByRole('radio', { name: 'Kagi' }).click()
    await n.getByRole('button', { name: "C'est parti" }).click()
    await expect(n.locator('#recherche')).toBeVisible()
    const s = await fenetre.evaluate(() => window.lyra.invoke('settings:get'))
    expect(s.moteurParDefaut).toBe('kagi')
    expect(s.moteurChoisi).toBe(true)
    const sugg = await fenetre.evaluate(() => window.lyra.invoke('palette:suggest', { texte: 'véga' }))
    expect(sugg.some((x) => x.type === 'recherche' && x.moteur === 'kagi')).toBe(true)
  } finally {
    await app.close()
  }
})

test('nouvel onglet : la saisie lance une recherche avec le moteur par défaut', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await expect.poll(() => page(app, 'lyra://newtab')).toBeDefined()
    const n = page(app, 'lyra://newtab')!
    await expect(n.getByText('Vos constellations')).toBeVisible()
    await n.fill('#recherche', 'véga')
    // La navigation remplace la cible Playwright : la fin de la frappe peut arriver trop tard.
    await n.press('#recherche', 'Enter').catch(() => undefined)
    await expect.poll(() => fenetre.evaluate(() => window.lyra.invoke('test:lastNavigation'))).toContain('duckduckgo.com')
  } finally {
    await app.close()
  }
})

test('réglages : thème sombre → une page web voit prefers-color-scheme: dark', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/apparence'))
    await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
    const r = page(app, 'lyra://settings')!
    await expect(r.locator('h1')).toHaveText("Le ciel et l'apparence")
    await r.getByRole('button', { name: 'Sombre' }).click()
    await expect.poll(() => fenetre.evaluate(() => window.lyra.invoke('settings:get')).then((s) => s.theme)).toBe('sombre')
    await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), FIXTURE)
    await expect.poll(() => page(app, FIXTURE)).toBeDefined()
    // Playwright émule « light » par défaut : on rend la main au thème réel du navigateur.
    await expect
      .poll(async () => {
        const p = page(app, FIXTURE)!
        await p.emulateMedia({ colorScheme: null })
        return p.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)
      })
      .toBe(true)
  } finally {
    await app.close()
  }
})

test('pages internes, thème clair par défaut : #app = rgb(247, 247, 251) sur réglages, historique et téléchargements', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    for (const url of ['lyra://settings', 'lyra://history', 'lyra://downloads']) {
      await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), url)
      await expect.poll(() => page(app, url)).toBeDefined()
      // Attendre le chargement des feuilles de style (sur macOS en CI, la première lecture peut précéder le CSS).
      await expect
        .poll(() => page(app, url)!.evaluate(() => { const a = document.getElementById('app'); return a ? getComputedStyle(a).backgroundColor : '' }), { message: url })
        .toBe('rgb(247, 247, 251)')
    }
  } finally {
    await app.close()
  }
})

test('réglages : le sommaire compte 19 entrées, la recherche les filtre, lyra://history ouvre Historique', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings'))
    await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
    const r = page(app, 'lyra://settings')!
    await expect(r.locator('.nav a')).toHaveCount(19)
    await expect(r.locator('h1')).toHaveText('Général')
    await r.fill('#chercher-reglage', 'moteur')
    await expect(r.locator('.nav a')).toHaveText(['Palette et recherche'])
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://history'))
    await expect.poll(() => page(app, 'lyra://history')).toBeDefined()
    await expect(page(app, 'lyra://history')!.locator('h1')).toHaveText('Historique')
  } finally {
    await app.close()
  }
})

test('réglages : « zoom » mène à Règles par site (route + mise en évidence), « sombre » à Couleurs et thèmes, Échap vide', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings'))
    await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
    const r = page(app, 'lyra://settings')!
    await r.fill('#chercher-reglage', 'zoom')
    await expect(r.locator('.nav a')).toHaveText(['Règles par site'])
    await r.locator('.nav a', { hasText: 'Règles par site' }).click()
    await expect(r.locator('h1')).toHaveText('Règles par site')
    await expect(r.locator('[data-reglage="sites"]')).toHaveClass(/trouve/)
    await r.fill('#chercher-reglage', 'sombre')
    await expect(r.locator('.nav a')).toContainText(['Couleurs et thèmes'])
    await r.locator('.nav a', { hasText: 'Couleurs et thèmes' }).click()
    await expect(r.locator('h1')).toHaveText('Couleurs et thèmes')
    await r.fill('#chercher-reglage', 'largeur ciel')
    await r.locator('[data-resultat="apparence.largeur"]').click()
    await expect(r.locator('h1')).toHaveText("Le ciel et l'apparence")
    await expect(r.locator('[data-reglage="apparence.largeur"]')).toHaveClass(/trouve/)
    await expect.poll(() => r.evaluate(() => document.activeElement?.getAttribute('data-reglage'))).toBe('apparence.largeur')
    // Clavier : flèches dans les résultats, Entrée ouvre l'option sélectionnée (focus sur la cible)
    await r.fill('#chercher-reglage', 'moteur')
    await r.press('#chercher-reglage', 'ArrowDown')
    await r.press('#chercher-reglage', 'ArrowDown')
    await expect(r.locator('[role="option"][aria-selected="true"]')).toHaveAttribute('data-resultat', 'palette.moteur')
    await expect(r.locator('#chercher-reglage')).toHaveAttribute('aria-activedescendant', 'opt-palette.moteur')
    await r.press('#chercher-reglage', 'Enter')
    await expect(r.locator('h1')).toHaveText('Palette et recherche')
    await expect.poll(() => r.evaluate(() => document.activeElement?.getAttribute('data-reglage'))).toBe('palette.moteur')
    await r.press('#chercher-reglage', 'Escape')
    await expect(r.locator('#chercher-reglage')).toHaveValue('')
    await expect(r.locator('.nav a')).toHaveCount(19)
  } finally {
    await app.close()
  }
})
