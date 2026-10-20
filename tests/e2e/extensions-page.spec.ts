import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { zipSync } from 'fflate'
import { lancerLyra } from './helpers'

const FIXTURE = resolve(__dirname, '../../src/main/extensions/fixtures/minimale-mv3')
const CAPTURE = resolve(__dirname, '../../.superpowers/sdd/2026-10-19-lyra-jalon-b/capture-extensions.png')

function zipFixture(): string {
  const fichiers: Record<string, Uint8Array> = {}
  for (const nom of readdirSync(FIXTURE)) fichiers[nom] = readFileSync(join(FIXTURE, nom))
  const chemin = join(mkdtempSync(join(tmpdir(), 'lyra-page-ext-')), 'fixture.zip')
  writeFileSync(chemin, zipSync(fichiers))
  return chemin
}

const pageExtensions = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url().startsWith('lyra://extensions'))

test('lyra://extensions : en-tête, cartes, installation par fichier, interrupteur, journal, désinstallation', async () => {
  // Repères horodatés (diagnostic d'un blocage sous Windows en CI).
  const t0 = Date.now()
  const repere = (m: string): void => console.log(`[extensions-page] ${Date.now() - t0} ms : ${m}`)
  const { app, fenetre } = await lancerLyra({ LYRA_CHOIX_EXTENSION: zipFixture() })
  try {
    await fenetre.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://extensions' }))
    await expect.poll(() => pageExtensions(app)).toBeDefined()
    const p = pageExtensions(app)!

    repere("// En-tête et cartes d'installation")
    // En-tête et cartes d'installation (Extensions.dc.html).
    await expect(p.getByRole('heading', { level: 1 })).toHaveText('Extensions')
    await expect(p.getByText('Chrome et Firefox, côte à côte. Ce qui ne marche pas est dit, pas caché.')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Tout mettre à jour' })).toBeVisible()
    await expect(p.getByText(/érifiées/)).toBeVisible()
    await expect(p.getByLabel('Identifiant ou adresse du Chrome Web Store')).toBeVisible()
    await expect(p.getByLabel('Nom ou adresse addons.mozilla.org')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Choisir…' })).toBeVisible()
    await expect(p.getByRole('heading', { name: 'Installer' })).toBeVisible()
    await expect(p.getByRole('heading', { name: 'Installées — 0' })).toBeVisible()
    // Limites honnêtes (spec §7) et fenêtres privées.
    await expect(p.getByText('declarativeNetRequest').first()).toBeVisible()
    await expect(p.getByText("Les extensions ne s'exécutent pas en fenêtre privée").first()).toBeVisible()

    // Installation par le sélecteur de fichier (chemin injecté sous LYRA_TEST).
    repere("await test.step('installation'")
    await test.step('installation', async () => {
      await p.getByRole('button', { name: 'Choisir…' }).click()
      await expect(p.getByRole('heading', { name: 'Installées — 1' })).toBeVisible()
    })
    const ligne = p.locator('.ext').first()
    await expect(ligne.locator('strong')).toHaveText('Lyra fixture minimale')
    await expect(ligne.getByText('1.0.0')).toBeVisible()
    await expect(ligne.locator('.tag')).toHaveText('Chrome')
    await expect(ligne.getByText('Tous les sites')).toBeVisible()
    const interrupteur = p.getByRole('switch', { name: 'Activer Lyra fixture minimale' })
    await expect(interrupteur).toHaveAttribute('aria-checked', 'true')
    await p.screenshot({ path: CAPTURE })

    // Options : la page d'options de l'extension s'ouvre dans une nouvelle étoile.
    repere("await test.step('options'")
    await test.step('options', async () => {
      await ligne.getByRole('button', { name: 'Options' }).click()
      await expect.poll(() => app.windows().some((w) => /^chrome-extension:\/\/[a-p]{32}\/options\.html$/.test(w.url()))).toBe(true)
    })

    repere("// Interrupteur : l'extension")
    // Interrupteur : l'extension est désactivée dans le registre.
    await interrupteur.click()
    await expect(interrupteur).toHaveAttribute('aria-checked', 'false')
    await expect.poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('extensions:lister')))[0]?.active).toBe(false)
    // Comme Chrome : la page d'options de l'extension désactivée s'est fermée.
    await expect.poll(() => app.windows().some((w) => w.url().startsWith('chrome-extension://'))).toBe(false)
    await interrupteur.click()
    await expect(interrupteur).toHaveAttribute('aria-checked', 'true')

    repere('// Journal déplié')
    // Journal déplié (monospace, ✓ – ℹ), puis replié.
    await ligne.getByRole('button', { name: 'Journal' }).click()
    await expect(p.locator('.log')).toBeVisible()
    await expect(p.locator('.log')).toContainText(/[✓–ℹ]/)
    await expect(p.getByRole('button', { name: 'Replier' })).toBeVisible()

    repere('// Règle par site')
    // Règle par site : enregistrée dans les réglages.
    await p.getByRole('button', { name: 'Sites' }).click()
    await p.getByLabel('Site à exclure').fill('youtube.com')
    await p.getByRole('button', { name: 'Exclure' }).click()
    await expect.poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).sites['https://youtube.com']?.extensions).toBeDefined()
    await expect(p.getByText('Tous les sites sauf youtube.com (règle par site)')).toBeVisible()

    // Désinstallation.
    repere("await test.step('désinstallation'")
    await test.step('désinstallation', async () => {
      await p.getByRole('button', { name: 'Supprimer' }).click()
      await expect(p.getByRole('heading', { name: 'Installées — 0' })).toBeVisible()
      expect(await fenetre.evaluate(() => window.lyra.invoke('extensions:lister'))).toEqual([])
    })
  } finally {
    repere("await test.step('fermeture'")
    await test.step('fermeture', () => app.close())
  }
})

test("le pied du ciel ouvre le panneau des extensions avec l'icône d'action ; le menu ⋯ ouvre lyra://extensions", async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_CHOIX_EXTENSION: zipFixture() })
  try {
    await fenetre.evaluate(() => window.lyra.invoke('extensions:installer', { choisir: 'fichier' }))
    await fenetre.getByRole('button', { name: 'Extensions' }).click()
    await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
    const overlay = app.windows().find((w) => w.url().includes('#overlay'))!
    await expect(overlay.getByRole('dialog', { name: 'Panneau des extensions' })).toBeVisible()
    await expect(overlay.locator('browser-action-list')).toHaveCount(1)
    await expect(overlay.locator('browser-action-list button.action')).toHaveCount(1)
    await overlay.getByRole('link', { name: 'Gérer' }).click()
    await expect.poll(() => pageExtensions(app)).toBeDefined()
  } finally {
    await app.close()
  }
})

test('menu ⋯ : l\'action « extensions » ouvre lyra://extensions', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('menu:action', { action: 'extensions' }))
    await expect.poll(() => pageExtensions(app)).toBeDefined()
  } finally {
    await app.close()
  }
})
