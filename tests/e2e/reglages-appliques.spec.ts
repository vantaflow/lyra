import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'

const COOKIES = pathToFileURL(resolve(__dirname, 'fixtures/cookies.html')).href
const page = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

async function ouvrirReglages(app: ElectronApplication, fenetre: Page, hash = ''): Promise<Page> {
  await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), `lyra://settings${hash}`)
  await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
  return page(app, 'lyra://settings')!
}

test('sommaire des réglages : chaque entrée ouvre une section non vide ; une section à venir le dit', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre)
    await expect(r.locator('h1')).toHaveText('Général')
    const liens = await r.locator('nav.nav a').evaluateAll((as) => as.map((a) => ({ href: a.getAttribute('href')!, titre: a.textContent!.trim() })))
    expect(liens.map((l) => l.titre)).toEqual(['Général', 'Extensions', 'Téléchargements', 'Réseau et identité', 'Importer et exporter', 'Historique', 'Favoris', 'À propos'])
    for (const l of liens.filter((x) => x.href.startsWith('#'))) {
      await r.evaluate((h) => (location.hash = h), l.href)
      await expect(r.locator('h1')).toHaveText(l.titre)
      // Contenu propre à la section, au-delà du titre.
      await expect.poll(async () => (await r.locator('main.contenu > :not(.entete)').allInnerTexts()).join('').trim().length, { message: l.titre }).toBeGreaterThan(0)
      await expect(r.locator('#section-a-venir')).toHaveCount(0)
    }
    // Adresse d'une section pas encore livrée : une phrase sobre, pas une page vide.
    await r.evaluate(() => (location.hash = '#/couleurs'))
    await expect(r.locator('h1')).toHaveText('Couleurs et thèmes')
    await expect(r.locator('#section-a-venir')).toHaveText('Cette section arrive dans la prochaine version de Lyra.')
  } finally {
    await app.close()
  }
})

test('réglages : « Masquer aussi les gênes » s’applique (listes des bandeaux de cookies chargées)', async () => {
  test.setTimeout(60_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const bloques = (): Promise<string[]> => fenetre.evaluate(() => window.lyra.invoke('shields:get').then((e) => e.dernieres))
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), COOKIES)
    await expect.poll(() => page(app, COOKIES)).toBeDefined()
    await expect.poll(() => page(app, COOKIES)!.evaluate(() => document.getElementById('resultat')?.textContent ?? '')).toContain('ERR')
    expect((await bloques()).some((u) => u.includes('cookielaw.js'))).toBe(false)

    const r = await ouvrirReglages(app, fenetre)
    const inter = r.getByRole('switch', { name: 'Masquer les gênes' })
    await expect(inter).toBeEnabled()
    await inter.click()
    await expect(inter).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => fenetre.evaluate(() => window.lyra.invoke('settings:get')).then((s) => s.boucliers.genes)).toBe(true)

    // Pages ouvertes ensuite : le script du bandeau est bloqué (moteur des gênes construit à la demande).
    await expect
      .poll(
        async () => {
          await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), COOKIES)
          await new Promise((ok) => setTimeout(ok, 800))
          return (await bloques()).some((u) => u.includes('cookielaw.js'))
        },
        { timeout: 30_000 }
      )
      .toBe(true)
  } finally {
    await app.close()
  }
})

test('réglages : thème, fréquence et langue — appliqués ou signalés « Bientôt »', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre)
    // Thème : l'aide dit précisément ce qui suit le choix dans cette version.
    await expect(r.getByText(/Appliqué aux sites web qui proposent un thème sombre/)).toBeVisible()
    await r.getByRole('button', { name: 'Sombre' }).click()
    await expect(r.getByRole('button', { name: 'Sombre' })).toHaveAttribute('aria-pressed', 'true')
    // Langue : désactivée, avec la mention.
    await expect(r.getByRole('button', { name: 'Langue' })).toBeDisabled()
    await expect(r.getByText(/^Bientôt : Lyra n'existe qu'en français/)).toBeVisible()
    // Fréquence des listes : enregistrée.
    await r.getByRole('button', { name: 'Fréquence de mise à jour' }).click()
    await r.getByRole('option', { name: '12 heures' }).click()
    await expect.poll(() => fenetre.evaluate(() => window.lyra.invoke('settings:get')).then((s) => s.boucliers.majHeures)).toBe(12)
  } finally {
    await app.close()
  }
})

test('réglages : cliquer chaque contrôle n’affiche jamais d’erreur technique', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  const erreurs: string[] = []
  try {
    const r = await ouvrirReglages(app, fenetre)
    r.on('pageerror', (e) => erreurs.push(`pageerror : ${e.message}`))
    r.on('console', (m) => m.type() === 'error' && erreurs.push(`console : ${m.text()}`))
    const ignorer = /Choisir|Exporter|Importer|WARP|Tester|Effacer|Ajouter|Retirer|Mettre à jour maintenant|Parcourir|Lancer|Choisir un fichier/
    for (const hash of ['#/general', '#/reseau']) {
      await r.evaluate((h) => (location.hash = h), hash)
      await r.waitForTimeout(300)
      const boutons = r.locator('main button:not([disabled])')
      const n = await boutons.count()
      for (let i = 0; i < n; i++) {
        const b = boutons.nth(i)
        const lib = ((await b.getAttribute('aria-label')) ?? (await b.innerText().catch(() => ''))).trim()
        if (ignorer.test(lib)) continue
        await b.click({ timeout: 2000 }).catch(() => undefined)
        await r.keyboard.press('Escape').catch(() => undefined)
      }
    }
    await r.waitForTimeout(500)
    const texte = await r.locator('main').innerText()
    expect(texte).not.toMatch(/parse|JSON|Error invoking|SyntaxError|TypeError|EPERM|ENOENT/i)
    expect(erreurs).toEqual([])
  } finally {
    await app.close()
  }
})
