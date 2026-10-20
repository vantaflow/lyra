import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElementImport } from '../../src/main/import/types'
import { lancerLyra } from './helpers'

// Importation depuis un autre navigateur (jalon E, 3.5) : contrat IPC `import:*` appelé depuis une page lyra://settings,
// lecture réelle dans le utilityProcess, sur des profils fabriqués (jamais les vrais profils de la machine).
const FIXTURES = resolve(__dirname, '../../src/main/import/fixtures')
let racine = ''

test.beforeAll(() => {
  racine = mkdtempSync(join(tmpdir(), 'lyra-import-racine-'))
  for (const [source, cible] of [['chromium/chrome', 'chrome'], ['chromium/edge', 'edge'], ['chromium/brave', 'brave'], ['firefox', 'firefox'], ['safari', 'safari'], ['orion', 'orion']]) {
    mkdirSync(join(racine, cible), { recursive: true })
    cpSync(join(FIXTURES, source), join(racine, cible), { recursive: true })
  }
})
test.afterAll(() => rmSync(racine, { recursive: true, force: true }))

const page = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

async function ouvrirReglages(app: ElectronApplication, depuis: Page): Promise<Page> {
  await depuis.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://settings' }))
  await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
  const r = page(app, 'lyra://settings')!
  await r.waitForLoadState('domcontentloaded')
  await expect.poll(() => r.evaluate(() => typeof window.lyra?.invoke)).toBe('function')
  return r
}

const interfaces = (app: ElectronApplication): Page[] => app.windows().filter((p) => p.url().includes('ui.html') && !p.url().includes('#overlay'))

test('détection, aperçu, import favoris + onglets puis réimport, lecture réelle dans le utilityProcess', async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_IMPORT_RACINE: racine })
  try {
    const r = await ouvrirReglages(app, fenetre)

    // Détection : Chrome, Edge, Brave, Firefox ; Vivaldi « non installé » (Safari et Orion : selon la plateforme).
    const profils = await r.evaluate(() => window.lyra.invoke('import:detecter'))
    const navigateurs = new Set(profils.map((p) => p.navigateur))
    for (const n of ['chrome', 'edge', 'brave', 'firefox'] as const) expect(navigateurs.has(n), n).toBe(true)
    expect(navigateurs.has('vivaldi')).toBe(false)
    const khalil = profils.find((p) => p.navigateur === 'chrome' && p.nom === 'Khalil')!
    expect(khalil).toBeDefined()

    // Aperçu : compteurs, sans rien écrire.
    const apercu = await r.evaluate((profil) => window.lyra.invoke('import:apercu', { profil, elements: ['favoris', 'onglets', 'moteurs'], depuisJours: 92 }), khalil)
    expect(apercu.compteurs.favoris).toEqual({ favoris: 4, dossiers: 3 })
    expect(apercu.compteurs.onglets?.groupes).toBe(2)
    expect(await fenetre.evaluate(() => window.lyra.invoke('bookmarks:list'))).toEqual([])

    // Un profil que la détection n'a pas rendu est refusé.
    await expect(r.evaluate((profil) => window.lyra.invoke('import:apercu', { profil: { ...profil, chemin: '/tmp' }, elements: ['favoris'], depuisJours: 92 }), khalil)).rejects.toThrow()

    // Import (évènements écoutés dans la page).
    await r.evaluate(() => {
      const w = window as unknown as { __termines: unknown[]; __progressions: unknown[] }
      w.__termines = []
      w.__progressions = []
      window.lyra.on('import:termine', (e) => w.__termines.push(e))
      window.lyra.on('import:progression', (e) => w.__progressions.push(e))
    })
    const options = { fenetre: 'courante' as const, ouvrirMaintenant: false, moteurParDefaut: false, extensionsChoisies: [] }
    const lancer = (): Promise<{ id: string } | { erreur: string }> =>
      r.evaluate((d) => window.lyra.invoke('import:lancer', d), { profil: khalil, elements: ['favoris', 'onglets'] as ElementImport[], depuisJours: 92, options })
    const termines = (): Promise<Array<{ id: string; resultat: any }>> => r.evaluate(() => (window as unknown as { __termines: any[] }).__termines)

    const a = await lancer()
    expect('id' in a).toBe(true)
    await expect.poll(async () => (await termines()).length, { timeout: 20_000 }).toBe(1)
    const premier = (await termines())[0]
    expect(premier.id).toBe((a as { id: string }).id)
    expect(premier.resultat.source).toBe('chrome')
    expect(premier.resultat.favoris).toMatchObject({ etat: 'ok', ajoutes: 4, presents: 0 })
    expect(premier.resultat.onglets).toMatchObject({ etat: 'ok' })
    expect(premier.resultat.onglets.ajoutes).toBeGreaterThan(0)
    expect(premier.resultat.historique.etat).toBe('ignore')

    const favoris = await fenetre.evaluate(() => window.lyra.invoke('bookmarks:list'))
    expect(favoris).toHaveLength(4)
    expect(favoris.every((f) => f.dossier?.startsWith('Importés de Chrome'))).toBe(true)
    expect(favoris.map((f) => f.dossier)).toContain('Importés de Chrome / Lecture')

    const { sky } = await fenetre.evaluate(() => window.lyra.invoke('sky:get'))
    const lecture = sky.constellations.find((c) => c.name === 'Lecture')
    expect(lecture).toBeDefined()
    expect(sky.constellations.some((c) => c.name === 'Travail')).toBe(true)
    const etoilesLecture = sky.stars.filter((s) => s.constellationId === lecture!.id)
    expect(etoilesLecture.length).toBeGreaterThan(0)
    expect(etoilesLecture.every((s) => s.dormant === true)).toBe(true)
    expect(sky.stars.some((s) => s.url === 'https://fr.wikipedia.org/' && s.pinned)).toBe(true)

    // Réimport : favoris « déjà présents », aucun doublon.
    const b = await lancer()
    expect('id' in b).toBe(true)
    await expect.poll(async () => (await termines()).length, { timeout: 20_000 }).toBe(2)
    const second = (await termines())[1].resultat
    expect(second.favoris).toMatchObject({ etat: 'ok', ajoutes: 0, presents: 4 })
    expect(await fenetre.evaluate(() => window.lyra.invoke('bookmarks:list'))).toHaveLength(4)

    // Les évènements de progression sont allés à la page qui a lancé l'import.
    expect(await r.evaluate(() => (window as unknown as { __progressions: unknown[] }).__progressions.length)).toBeGreaterThan(0)

    // Le canal est refusé depuis le chrome (autre origine que lyra://settings).
    await expect(fenetre.evaluate(() => window.lyra.invoke('import:detecter'))).rejects.toThrow()
  } finally {
    await app.close()
  }
})

test('historique réel (Firefox) : lots appliqués via le utilityProcess, un seul import à la fois', async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_IMPORT_RACINE: racine })
  try {
    const r = await ouvrirReglages(app, fenetre)
    const profils = await r.evaluate(() => window.lyra.invoke('import:detecter'))
    const ff = profils.find((p) => p.navigateur === 'firefox' && p.nom.includes('default'))!
    expect(ff).toBeDefined()
    await r.evaluate(() => {
      const w = window as unknown as { __termines: unknown[] }
      w.__termines = []
      window.lyra.on('import:termine', (e) => w.__termines.push(e))
    })
    const options = { fenetre: 'courante' as const, ouvrirMaintenant: false, moteurParDefaut: false, extensionsChoisies: [] }
    const demande = { profil: ff, elements: ['favoris', 'historique'] as Array<'favoris' | 'historique'>, depuisJours: null, options }
    // Deux demandes simultanées : une seule passe.
    const [x, y] = await r.evaluate((d) => Promise.all([window.lyra.invoke('import:lancer', d), window.lyra.invoke('import:lancer', d)]), demande)
    expect([x, y].filter((v) => 'id' in v)).toHaveLength(1)
    expect([x, y].filter((v) => 'erreur' in v)).toEqual([{ erreur: 'en-cours' }])
    await expect.poll(() => r.evaluate(() => (window as unknown as { __termines: unknown[] }).__termines.length), { timeout: 20_000 }).toBe(1)
    const res = await r.evaluate(() => (window as unknown as { __termines: Array<{ resultat: any }> }).__termines[0].resultat)
    expect(res.favoris.etat).toBe('ok')
    expect(res.historique.etat).toBe('ok')
    expect(res.historique.ajoutes).toBeGreaterThan(0)
    const trouvees = await fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: '', limite: 50 }))
    expect(trouvees.length).toBeGreaterThan(0)
  } finally {
    await app.close()
  }
})

test('lancement refusé depuis une fenêtre privée : rien n’est écrit', async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_IMPORT_RACINE: racine })
  try {
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
    await expect.poll(() => interfaces(app).find((p) => p.url().includes('#privee'))).toBeDefined()
    const privee = interfaces(app).find((p) => p.url().includes('#privee'))!
    const r = await ouvrirReglages(app, privee)
    const options = { fenetre: 'courante' as const, ouvrirMaintenant: false, moteurParDefaut: false, extensionsChoisies: [] }
    const profil = { navigateur: 'chrome' as const, nom: 'Khalil', chemin: join(racine, 'chrome', 'Default'), racine: join(racine, 'chrome'), parDefaut: true }
    expect(await r.evaluate((d) => window.lyra.invoke('import:lancer', d), { profil, elements: ['favoris', 'onglets'] as ElementImport[], depuisJours: 92, options })).toEqual({ erreur: 'prive' })
    await expect(r.evaluate(() => window.lyra.invoke('import:detecter'))).rejects.toThrow()
    expect(await fenetre.evaluate(() => window.lyra.invoke('bookmarks:list'))).toEqual([])
    const { sky } = await fenetre.evaluate(() => window.lyra.invoke('sky:get'))
    expect(sky.constellations).toEqual([])
  } finally {
    await app.close()
  }
})
