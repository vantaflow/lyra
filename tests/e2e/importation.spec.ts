import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { lancerLyra } from './helpers'

// Page Réglages « Importer et exporter » (jalon E, Task 5) : pilotée comme un utilisateur (clics), sur les profils
// fabriqués de src/main/import/fixtures (jamais les vrais profils). LYRA_TEST=1 : aucune boîte de dialogue, aucune fenêtre
// visible ; les chemins de fichiers sont fournis au main par une file (voir `fournirChemins`).
const FIXTURES = resolve(__dirname, '../../src/main/import/fixtures')
const DARWIN = process.platform === 'darwin'
let racine = ''
let dossier = ''

test.beforeAll(() => {
  racine = mkdtempSync(join(tmpdir(), 'lyra-importation-racine-'))
  dossier = mkdtempSync(join(tmpdir(), 'lyra-importation-'))
  for (const [source, cible] of [['chromium/chrome', 'chrome'], ['chromium/edge', 'edge'], ['chromium/brave', 'brave'], ['firefox', 'firefox'], ['safari', 'safari'], ['orion', 'orion']]) {
    mkdirSync(join(racine, cible), { recursive: true })
    cpSync(join(FIXTURES, source), join(racine, cible), { recursive: true })
  }
})
test.afterAll(() => {
  rmSync(racine, { recursive: true, force: true })
  rmSync(dossier, { recursive: true, force: true })
})

const page = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

async function ouvrirImport(app: ElectronApplication, depuis: Page): Promise<Page> {
  await depuis.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://settings' }))
  await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
  const r = page(app, 'lyra://settings')!
  await r.waitForLoadState('domcontentloaded')
  await expect.poll(() => r.evaluate(() => typeof window.lyra?.invoke)).toBe('function')
  await r.evaluate(() => (location.hash = '#/importer'))
  await expect(r.getByRole('heading', { name: 'Importer et exporter', level: 1 })).toBeVisible()
  return r
}

/** Sous LYRA_TEST=1 le main n'ouvre aucune boîte de dialogue : il prend les chemins dans cette file (chemins de fichiers de test). */
const fournirChemins = (app: ElectronApplication, chemins: string[]): Promise<void> =>
  app.evaluate((_, liste) => {
    ;(globalThis as { __lyraCheminsTest?: string[] }).__lyraCheminsTest = [...liste]
  }, chemins)

const carte = (r: Page, n: string) => r.locator(`.src[data-navigateur="${n}"]`)

test('les sept navigateurs et « Un fichier », avec leur état', async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_IMPORT_RACINE: racine })
  try {
    const r = await ouvrirImport(app, fenetre)
    await expect(r.getByText('Apportez tout ce qui compte depuis votre navigateur actuel')).toBeVisible()
    for (const n of ['chrome', 'edge', 'brave', 'vivaldi', 'firefox', 'safari', 'orion']) await expect(carte(r, n)).toHaveCount(1)
    await expect(carte(r, 'chrome')).toContainText(/2 profils détectés/)
    await expect(carte(r, 'edge')).toContainText('1 profil détecté')
    await expect(carte(r, 'vivaldi')).toContainText('Non installé')
    await expect(carte(r, 'vivaldi')).toBeDisabled()
    await expect(carte(r, 'firefox')).toContainText(/profils? détectés?/)
    if (DARWIN) {
      await expect(carte(r, 'safari')).toContainText('1 profil détecté')
      await expect(carte(r, 'orion')).toContainText(/profils? détectés?/)
    }
    await expect(r.locator('.src[data-navigateur="fichier"]')).toContainText('Favoris HTML, CSV, JSON, paquet .lyra')
    // Chrome est présélectionné.
    await expect(carte(r, 'chrome')).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await app.close()
  }
})

test('Chrome « Khalil » : compteurs, import favoris + onglets, résumé, réimport « déjà présents », aperçu détaillé', async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_IMPORT_RACINE: racine })
  try {
    const r = await ouvrirImport(app, fenetre)
    await expect(r.locator('#titre-quoi')).toHaveText('2. Quoi importer — Chrome, profil « Khalil »')
    const ligne = (e: string) => r.locator(`#elements .chk[data-element="${e}"]`)
    await expect(ligne('favoris')).toContainText('4 favoris, 3 dossiers → barre et dossiers conservés')
    await expect(ligne('favoris')).toContainText('Prêt')
    await expect(ligne('onglets')).toContainText('2 groupes')
    // Mots de passe et cookies : désactivés, avec leur raison.
    await expect(ligne('mots-de-passe').locator('input')).toBeDisabled()
    await expect(ligne('mots-de-passe')).toContainText('Lyra ne stocke pas de mots de passe')
    await expect(ligne('cookies').locator('input')).toBeDisabled()
    await expect(ligne('cookies')).toContainText('indisponibles en v1')
    await expect(r.locator('#elements')).not.toContainText('Boucliers')

    // Seulement favoris et onglets.
    for (const e of ['historique', 'extensions', 'moteurs', 'reglages']) {
      const c = ligne(e).locator('input')
      if (await c.isChecked()) await c.uncheck()
    }
    await expect(fenetre.evaluate(() => window.lyra.invoke('bookmarks:list'))).resolves.toEqual([])

    await r.getByRole('button', { name: 'Importer maintenant' }).click()
    const resume = r.locator('#resume-import')
    await expect(resume).toBeVisible({ timeout: 20_000 })
    await expect(resume.locator('[data-element="favoris"]')).toContainText('4 ajoutés · 0 déjà présent')
    await expect(resume.locator('[data-element="onglets"]')).toContainText('ajouté')
    await expect(resume.locator('[data-element="historique"]')).toHaveCount(0)
    expect(await fenetre.evaluate(() => window.lyra.invoke('bookmarks:list'))).toHaveLength(4)

    // Aperçu détaillé : notes de l'import.
    await r.getByRole('button', { name: 'Aperçu détaillé' }).click()
    await expect(r.locator('#apercu-detaille')).toContainText('constellation')

    // Second import : « déjà présents ».
    await r.getByRole('button', { name: 'Importer maintenant' }).click()
    await expect(r.locator('#resume-import [data-element="favoris"]')).toContainText('0 ajouté · 4 déjà présents', { timeout: 20_000 })
    expect(await fenetre.evaluate(() => window.lyra.invoke('bookmarks:list'))).toHaveLength(4)
  } finally {
    await app.close()
  }
})

test('export des favoris, paquet .lyra puis import par « Un fichier » ; phrase trop courte refusée', async () => {
  // Deux lancements et deux dérivations de clé (création puis ouverture du paquet, attendue jusqu'à 20 s) : sous
  // Windows le test dépasse les 30 s par défaut (22 s au run 39471673032, 30 s au run 39500586216).
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra({ LYRA_IMPORT_RACINE: racine })
  try {
    const favoris = join(dossier, 'favoris.html')
    const paquet = join(dossier, 'sauvegarde.lyra')
    await fenetre.evaluate(() => window.lyra.invoke('bookmarks:toggle', { url: 'https://exemple.fr/a', title: 'Exemple A' }))
    const r = await ouvrirImport(app, fenetre)
    await fournirChemins(app, [favoris, paquet])

    // Favoris : export HTML.
    await r.getByRole('button', { name: 'Exporter Favoris' }).click()
    await expect(r.locator('#message-export')).toContainText('Favoris')
    await expect.poll(() => existsSync(favoris)).toBe(true)
    expect(readFileSync(favoris, 'utf8')).toContain('https://exemple.fr/a')

    // Phrase de passe courte : refusée avec un message, aucun fichier.
    await r.getByRole('button', { name: 'Créer le paquet…' }).click()
    await r.locator('#phrase-paquet').fill('court')
    await r.locator('#phrase-paquet-confirmation').fill('court')
    await r.getByRole('button', { name: 'Créer', exact: true }).click()
    await expect(r.locator('#message-export')).toContainText('au moins 8 caractères')
    expect(existsSync(paquet)).toBe(false)

    // Deux phrases différentes : bouton désactivé, message, aucun fichier.
    await r.locator('#phrase-paquet').fill('phrase de passe e2e solide')
    await r.locator('#phrase-paquet-confirmation').fill('une autre phrase de passe')
    await expect(r.locator('#phrases-differentes-paquet')).toHaveText('Les deux phrases ne correspondent pas.')
    await expect(r.locator('#valider-paquet')).toBeDisabled()
    expect(existsSync(paquet)).toBe(false)

    // Sauvegarde automatique : même contrôle.
    await r.locator('#choisir-dossier').click()
    await r.locator('#phrase-auto').fill('phrase de passe e2e solide')
    await r.locator('#phrase-auto-confirmation').fill('différente')
    await expect(r.locator('#phrases-differentes-auto')).toBeVisible()
    await expect(r.locator('#valider-auto')).toBeDisabled()
    await r.locator('#choisir-dossier').click()

    // Paquet complet.
    await r.locator('#phrase-paquet-confirmation').fill('phrase de passe e2e solide')
    await r.getByRole('button', { name: 'Créer', exact: true }).click()
    await expect.poll(() => existsSync(paquet)).toBe(true)
    await expect(r.locator('#message-export')).toContainText('Paquet Lyra')
    expect(statSync(paquet).size).toBeGreaterThan(0)

    // Import du paquet dans un profil neuf, par « Un fichier ».
    const neuf = await lancerLyra({ LYRA_IMPORT_RACINE: racine })
    try {
      expect(await neuf.fenetre.evaluate(() => window.lyra.invoke('bookmarks:list'))).toEqual([])
      const p2 = await ouvrirImport(neuf.app, neuf.fenetre)
      await fournirChemins(neuf.app, [paquet, paquet])
      await p2.locator('.src[data-navigateur="fichier"]').click()
      await p2.getByRole('button', { name: 'Paquet .lyra', exact: true }).click()
      await p2.locator('#phrase-import').fill('mauvaise phrase de passe')
      await p2.getByRole('button', { name: 'Choisir le fichier…' }).click()
      await expect(p2.locator('#message-fichier')).toBeVisible()
      expect(await neuf.fenetre.evaluate(() => window.lyra.invoke('bookmarks:list'))).toEqual([])
      await p2.locator('#phrase-import').fill('phrase de passe e2e solide')
      await p2.getByRole('button', { name: 'Choisir le fichier…' }).click()
      await expect(p2.locator('#resume-import')).toBeVisible({ timeout: 20_000 })
      await expect(p2.locator('#resume-import [data-element="favoris"]')).toContainText('1 ajouté')
      expect(await neuf.fenetre.evaluate(() => window.lyra.invoke('bookmarks:list'))).toHaveLength(1)
    } finally {
      await neuf.app.close()
    }
  } finally {
    await app.close()
  }
})

test('fenêtre privée : la détection est refusée, la page l’explique et n’importe rien', async () => {
  const { app } = await lancerLyra({ LYRA_IMPORT_RACINE: racine })
  try {
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
    const interfaces = (): Page[] => app.windows().filter((p) => p.url().includes('ui.html') && !p.url().includes('#overlay'))
    await expect.poll(() => interfaces().find((p) => p.url().includes('#privee'))).toBeDefined()
    const r = await ouvrirImport(app, interfaces().find((p) => p.url().includes('#privee'))!)
    await expect(r.locator('#erreur-detection')).toContainText('Impossible de chercher les navigateurs')
    await expect(r.locator('.src[data-navigateur="chrome"]')).toBeDisabled()
  } finally {
    await app.close()
  }
})
