import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { zipSync } from 'fflate'
import { lancerLyra } from './helpers'

const FIXTURE = resolve(__dirname, '../../src/main/extensions/fixtures/minimale-mv3')
const CAPTURES = resolve(__dirname, '../../.superpowers/sdd/2026-10-19-lyra-jalon-b')
const LIENS = readFileSync(resolve(__dirname, 'fixtures/liens.html'), 'utf8')

function zipFixture(): string {
  const fichiers: Record<string, Uint8Array> = {}
  for (const nom of readdirSync(FIXTURE)) fichiers[nom] = readFileSync(join(FIXTURE, nom))
  const chemin = join(mkdtempSync(join(tmpdir(), 'lyra-fin-ext-')), 'fixture.zip')
  writeFileSync(chemin, zipSync(fichiers))
  return chemin
}

let serveur: Server
let urlPage = ''
test.beforeAll(async () => {
  serveur = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(LIENS)
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  const a = serveur.address()
  urlPage = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}/liens.html`
})
test.afterAll(() => new Promise<void>((ok) => serveur.close(() => ok())))

const page = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))
const interfaces = (app: ElectronApplication): Page[] => app.windows().filter((p) => p.url().includes('ui.html') && !p.url().includes('#overlay'))
const id = (c: string): string => c.repeat(32)

test("jamais en fenêtre privée : pas d'extension dans la session privée, installation et file refusées, bandeau", async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_CHOIX_EXTENSION: zipFixture() })
  try {
    const r = await fenetre.evaluate(() => window.lyra.invoke('extensions:installer', { choisir: 'fichier' }))
    expect(r.etat).toBe('installee')
    const ext = r.etat === 'installee' ? r.id : ''
    // Fenêtre normale : le content script agit.
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), urlPage)
    await expect.poll(() => page(app, urlPage)).toBeDefined()
    await expect.poll(() => page(app, urlPage)!.evaluate(() => document.documentElement.dataset.lyraExtension)).toBe('ok')

    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
    await expect.poll(() => interfaces(app).find((p) => p.url().includes('#privee'))).toBeDefined()
    const privee = interfaces(app).find((p) => p.url().includes('#privee'))!
    await privee.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), urlPage)
    await expect.poll(() => app.windows().filter((w) => w.url().startsWith(urlPage)).length).toBe(2)
    const dansPrivee = app.windows().filter((w) => w.url().startsWith(urlPage)).find((w) => w !== page(app, urlPage))!
    await dansPrivee.waitForLoadState('domcontentloaded')
    await new Promise((ok) => setTimeout(ok, 800))
    expect(await dansPrivee.evaluate(() => document.documentElement.dataset.lyraExtension)).toBeUndefined()

    // Installation, options et file d'import : refusées depuis la fenêtre privée.
    expect(await privee.evaluate(() => window.lyra.invoke('extensions:installer', { choisir: 'fichier' }))).toMatchObject({ etat: 'erreur' })
    expect(await privee.evaluate((i) => window.lyra.invoke('extensions:options', { id: i }), ext)).toBe(false)
    await expect(privee.evaluate(() => window.lyra.invoke('extensions:consommerFile', { confirmees: [] }))).rejects.toThrow()

    // lyra://extensions dans une fenêtre privée : bandeau.
    await privee.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://extensions' }))
    await expect.poll(() => page(app, 'lyra://extensions')).toBeDefined()
    await expect(page(app, 'lyra://extensions')!.getByText("Les extensions ne s'exécutent pas en fenêtre privée.").first()).toBeVisible()
  } finally {
    await app.close()
  }
})

test("file d'import : 5 entrées (une erreur, une imposée, une Edge), progression et résultat dans lyra://extensions", async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_FILE_SIMULEE: '1', LYRA_CHOIX_EXTENSION: zipFixture() })
  try {
    await fenetre.evaluate(() => window.lyra.invoke('extensions:installer', { choisir: 'fichier' }))
    await fenetre.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://extensions' }))
    await expect.poll(() => page(app, 'lyra://extensions')).toBeDefined()
    const p = page(app, 'lyra://extensions')!
    await expect(p.getByRole('heading', { name: 'Installées — 1' })).toBeVisible()

    // La file est lue par le processus principal (réglages) : la page ne l'envoie pas.
    const entrees = [
      { id: id('a'), nom: 'Alpha', magasin: 'chrome' as const, actif: true, source: 'chrome' as const, date: 1 },
      { id: id('b'), nom: 'Bravo (erreur)', magasin: 'chrome' as const, actif: true, source: 'chrome' as const, date: 2 },
      { id: 'dark-reader', nom: 'Dark Reader', magasin: 'firefox' as const, actif: true, source: 'firefox' as const, date: 3 },
      { id: id('d'), nom: 'Delta imposée', magasin: 'chrome' as const, actif: true, source: 'chrome' as const, date: 4, imposee: true },
      { id: 'edge-ext', nom: 'Echo (Edge)', magasin: 'edge' as const, actif: true, source: 'edge' as const, date: 5 }
    ]
    await fenetre.evaluate((e) => window.lyra.invoke('test:fileImport', e), entrees)
    const r = await fenetre.evaluate(() => window.lyra.invoke('extensions:consommerFile'))
    expect(r.resultats.map((x) => x.etat)).toEqual(['installee', 'erreur', 'installee', 'a-confirmer', 'manuel'])
    expect(r.restantes.map((x) => x.nom)).toEqual(['Bravo (erreur)', 'Delta imposée'])

    const carte = p.getByRole('status', { name: "Réinstallation depuis l'import" })
    await expect(carte.getByText('2 sur 5 réinstallées, 1 à installer à la main, 1 en erreur, 1 à confirmer')).toBeVisible()
    await expect(carte.getByText('Echo (Edge)')).toBeVisible()
    await expect(carte.getByText('À installer à la main', { exact: true })).toBeVisible()
    await expect(carte.getByText('Hors ligne (simulé).')).toBeVisible()
    await p.screenshot({ path: join(CAPTURES, 'capture-extensions-6.png') })

    // Le processus principal a réécrit la file : les entrées restantes sont intactes (tous leurs champs).
    expect(await fenetre.evaluate(() => window.lyra.invoke('test:fileImport'))).toEqual([entrees[1], entrees[3]])

    // L'imposée n'est installée que sur choix explicite : un identifiant seul ne confirme rien, « Installer quand même » oui.
    const sansCle = await fenetre.evaluate((i) => window.lyra.invoke('extensions:consommerFile', { confirmees: [i] }), id('d'))
    expect(sansCle.resultats.find((x) => x.entree.nom === 'Delta imposée')!.etat).toBe('a-confirmer')
    await p.getByRole('button', { name: 'Installer quand même Delta imposée' }).click()
    await expect(carte.getByText('1 sur 2 réinstallées, 1 en erreur')).toBeVisible()
    expect(await fenetre.evaluate(() => window.lyra.invoke('test:fileImport'))).toEqual([entrees[1]])
  } finally {
    await app.close()
  }
})

test('Réglages → Réseau et identité : mise à jour automatique des extensions', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/reseau'))
    await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
    const r = page(app, 'lyra://settings')!
    await expect(r.getByText('Mettre à jour les extensions automatiquement (toutes les 6 h)')).toBeVisible()
    const tg = r.getByRole('switch', { name: 'Mise à jour automatique des extensions' })
    await expect(tg).toHaveAttribute('aria-checked', 'true')
    await tg.click()
    await expect(tg).toHaveAttribute('aria-checked', 'false')
    expect((await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).extensions.majAuto).toBe(false)
    await tg.click()
    await expect(tg).toHaveAttribute('aria-checked', 'true')
    expect((await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).extensions.majAuto).toBe(true)
    // « À propos » mentionne la licence d'electron-chrome-extensions.
    await r.evaluate(() => (location.hash = '#/apropos'))
    await expect(r.getByText(/electron-chrome-extensions, sous licence GPL-3\.0/)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('fidélité au design : boutons de ligne, Options en échec, panneau du pied du ciel', async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_CHOIX_EXTENSION: zipFixture() })
  try {
    const inst = await fenetre.evaluate(() => window.lyra.invoke('extensions:installer', { choisir: 'fichier' }))
    if (inst.etat !== 'installee') throw new Error(JSON.stringify(inst))
    // `dossier` n'est pas communiqué aux pages.
    expect((await fenetre.evaluate(() => window.lyra.invoke('extensions:lister')))[0]).not.toHaveProperty('dossier')

    await fenetre.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://extensions' }))
    await expect.poll(() => page(app, 'lyra://extensions')).toBeDefined()
    const p = page(app, 'lyra://extensions')!
    const ligne = p.locator('.ext').first()
    const boutons = (): Promise<string[]> => ligne.locator('button').evaluateAll((bs) => bs.map((b) => (b.textContent || '').trim() || b.getAttribute('aria-label') || ''))
    // Ligne repliée : Options · Sites · Journal · interrupteur (pas de Supprimer).
    expect(await boutons()).toEqual(['Options', 'Sites', 'Journal', 'Activer Lyra fixture minimale'])
    // Dépliée : Options · Sites · Replier (à la place de Journal) · Supprimer · interrupteur.
    await ligne.getByRole('button', { name: 'Journal' }).click()
    expect(await boutons()).toEqual(['Options', 'Sites', 'Replier', 'Supprimer', 'Activer Lyra fixture minimale'])
    await expect(ligne.getByRole('button', { name: 'Supprimer' })).toHaveClass(/danger/)
    await ligne.getByRole('button', { name: 'Replier' }).click()
    expect(await boutons()).toEqual(['Options', 'Sites', 'Journal', 'Activer Lyra fixture minimale'])

    // Options qui échoue (extension désactivée) : un message, pas un silence.
    await ligne.getByRole('switch').click()
    await expect(ligne.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await ligne.getByRole('button', { name: 'Options' }).click()
    await expect(ligne.getByRole('alert')).toContainText("La page d'options n'a pas pu s'ouvrir")
    await ligne.getByRole('switch').click()

    // Panneau du pied du ciel : séparateur #eeeef4 et 8 px sous la rangée d'icônes.
    await fenetre.locator('button.sb[aria-label="Extensions"]').click()
    await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
    const overlay = app.windows().find((w) => w.url().includes('#overlay'))!
    const rangee = overlay.locator('.pn-ext-rangee')
    await expect(rangee).toBeVisible()
    const css = await rangee.evaluate((el) => {
      const s = getComputedStyle(el)
      return { bas: s.paddingBottom, bordure: s.borderBottomWidth, style: s.borderBottomStyle, couleur: s.borderBottomColor }
    })
    expect(css).toEqual({ bas: '8px', bordure: '1px', style: 'solid', couleur: 'rgb(238, 238, 244)' })
    await overlay.screenshot({ path: join(CAPTURES, 'capture-panneau-6.png') })
  } finally {
    await app.close()
  }
})
