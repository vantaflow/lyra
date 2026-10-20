import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lireRapportConversion, validerRapportConversion, apiManquantes, collecterStubs, conflitsRaccourcis, creerJournal, enregistrerMessageConsole, NOTE_BOUCLIERS, redondanceBoucliers } from './journal'

const ID = 'a'.repeat(32)
const ID2 = 'b'.repeat(32)
const dossiers: string[] = []
afterEach(() => {
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true })
})
const nouveau = (): { dossier: string; j: ReturnType<typeof creerJournal> } => {
  const dossier = join(mkdtempSync(join(tmpdir(), 'lyra-journal-')), 'journal')
  dossiers.push(join(dossier, '..'))
  return { dossier, j: creerJournal({ dossier }) }
}

describe('calculs', () => {
  it('API manquantes : permissions, optional_permissions, commands, side_panel', () => {
    expect(apiManquantes({ permissions: ['storage', 'declarativeNetRequest', 'sidePanel', 'https://x/*'], optional_permissions: ['nativeMessaging'], commands: { a: { suggested_key: { default: 'Ctrl+A' } } } })).toEqual([
      'commands', 'declarativeNetRequest', 'nativeMessaging', 'sidePanel'
    ])
    expect(apiManquantes({ permissions: ['storage', 'tabs'], commands: {} })).toEqual([])
    expect(apiManquantes({})).toEqual([])
  })

  it('redondance : webRequest ou webRequestBlocking', () => {
    expect(redondanceBoucliers({ permissions: ['webRequest', 'webRequestBlocking'] })).toBe(true)
    expect(redondanceBoucliers({ permissions: ['webRequest'] })).toBe(true)
    expect(redondanceBoucliers({ permissions: ['storage'] })).toBe(false)
  })

  it('conflits de raccourcis entre extensions', () => {
    const a = { commands: { x: { suggested_key: { default: 'Ctrl+Shift+F', mac: 'Command+Shift+F' } } } }
    const b = { commands: { y: { suggested_key: { default: 'ctrl+shift+f' } } } }
    expect(conflitsRaccourcis(a, [{ nom: 'Autre', manifest: b }])).toEqual(['ctrl+shift+f : déjà utilisé par Autre'])
    expect(conflitsRaccourcis(a, [{ nom: 'Autre', manifest: {} }])).toEqual([])
  })
})

describe('journal', () => {
  it('enregistre le chargement, persiste en JSON et relit après redémarrage', () => {
    const { dossier, j } = nouveau()
    j.enregistrerChargement(ID, { manifest: { manifest_version: 2, permissions: ['webRequest', 'webRequestBlocking', 'sidePanel'] }, conversion: { cles_retirees: ['sidebar_action'], permissions_retirees: ['dns'], transformations: [], avertissements: [] } })
    const lu = j.lire(ID)!
    expect(lu).toMatchObject({ redondanceBoucliers: true, noteBoucliers: NOTE_BOUCLIERS, apiManquantes: ['sidePanel'], conversion: { permissions_retirees: ['dns'] } })
    expect(lu.avertissementsChargement[0]).toContain('manifest_version 2')
    expect(JSON.parse(readFileSync(join(dossier, `${ID}.json`), 'utf8')).redondanceBoucliers).toBe(true)
    // pas de fichier temporaire oublié (écriture atomique)
    expect(readdirSync(dossier)).toEqual([`${ID}.json`])
    expect(creerJournal({ dossier }).lire(ID)).toEqual(lu)
  })

  it('comptage : seule la différence par page est ajoutée, un rechargement de page repart de son total', () => {
    const { j } = nouveau()
    j.releverStubs(ID, 1, { 'browserAction.setBadgeText': 2 })
    j.releverStubs(ID, 1, { 'browserAction.setBadgeText': 2 })
    j.releverStubs(ID, 1, { 'browserAction.setBadgeText': 5, 'windows.getAll': 1 })
    j.releverStubs(ID, 2, { 'browserAction.setBadgeText': 1 })
    expect(j.lire(ID)!.apiStubees).toEqual({ 'browserAction.setBadgeText': 6, 'windows.getAll': 1 })
    j.releverStubs(ID, 1, { 'browserAction.setBadgeText': 1 }) // page rechargée
    expect(j.lire(ID)!.apiStubees['browserAction.setBadgeText']).toBe(7)
  })

  it('refuse les noms d’API ou identifiants hostiles', () => {
    const { dossier, j } = nouveau()
    j.releverStubs(ID, 1, { '../x': 1, '__proto__': 1, ok: 1 })
    j.releverStubs('../evil', 1, { a: 1 })
    expect(j.lire(ID)!.apiStubees).toEqual({ ok: 1 })
    expect(j.lire('../evil')).toBeUndefined()
    expect(existsSync(join(dossier, '..', 'evil.json'))).toBe(false)
  })

  it('avertissements dédoublonnés et bornés ; supprimer efface le fichier', () => {
    const { dossier, j } = nouveau()
    j.avertissement(ID, 'a')
    j.avertissement(ID, 'a')
    for (let i = 0; i < 80; i++) j.avertissement(ID, `w${i}`)
    expect(j.lire(ID)!.avertissementsChargement).toHaveLength(50)
    j.supprimer(ID)
    expect(existsSync(join(dossier, `${ID}.json`))).toBe(false)
    expect(j.lire(ID)).toBeUndefined()
  })

  it('un fichier corrompu donne un journal vide', () => {
    const { dossier, j } = nouveau()
    j.avertissement(ID, 'x')
    require('node:fs').writeFileSync(join(dossier, `${ID}.json`), '{pas du json')
    expect(creerJournal({ dossier }).lire(ID)).toMatchObject({ apiStubees: {}, redondanceBoucliers: false })
  })
})

describe('collecte', () => {
  const page = (id: number, url: string, compteurs: unknown, detruite = false) => ({
    id,
    getURL: () => url,
    isDestroyed: () => detruite,
    executeJavaScript: async () => JSON.stringify(compteurs)
  })

  it('lit le compteur des pages chrome-extension:// seulement', async () => {
    const { j } = nouveau()
    await collecterStubs({
      journal: j,
      pages: () => [
        page(1, `chrome-extension://${ID}/_generated_background_page.html`, { 'browserAction.setBadgeText': 3 }),
        page(2, 'https://exemple.org/', { 'x.y': 9 }),
        page(3, `chrome-extension://${ID2}/popup.html`, { 'a.b': 1 }),
        page(4, `chrome-extension://${ID}/x.html`, {}, true)
      ]
    }, ID)
    expect(j.lire(ID)!.apiStubees).toEqual({ 'browserAction.setBadgeText': 3 })
    expect(j.lire(ID2)).toBeUndefined()
  })

  it('une page qui échoue ou rend du n’importe quoi est ignorée', async () => {
    const { j } = nouveau()
    const casse = { id: 1, getURL: () => `chrome-extension://${ID}/a.html`, isDestroyed: () => false, executeJavaScript: async () => { throw new Error('x') } }
    await expect(collecterStubs({ journal: j, pages: () => [casse, page(2, `chrome-extension://${ID}/b.html`, null)] })).resolves.toBeUndefined()
    expect(j.lire(ID)).toBeUndefined()
  })

  it('console : warning et error seulement, pages d’extension seulement', () => {
    const { j } = nouveau()
    enregistrerMessageConsole(j, `chrome-extension://${ID}/bg.html`, 'error', 'Uncaught TypeError')
    enregistrerMessageConsole(j, `chrome-extension://${ID}/bg.html`, 'info', 'bonjour')
    enregistrerMessageConsole(j, 'https://x.org/', 'error', 'autre')
    expect(j.lire(ID)!.avertissementsChargement).toEqual(['erreur : Uncaught TypeError'])
  })
})

describe('collecte robuste', () => {
  const url = `chrome-extension://${ID}/bg.html`
  it("une page qui ne répond jamais n'empêche pas l'IPC de rendre la main ; pas de nouvelle collecte tant que la première n'est pas finie", async () => {
    const { j } = nouveau()
    let appels = 0
    const muette = { id: 9001, getURL: () => url, isDestroyed: () => false, executeJavaScript: () => { appels++; return new Promise<unknown>(() => {}) } }
    const t0 = Date.now()
    await collecterStubs({ journal: j, pages: () => [muette], delaiMs: 50 }, ID)
    expect(Date.now() - t0).toBeLessThan(1000)
    await collecterStubs({ journal: j, pages: () => [muette], delaiMs: 50 }, ID)
    expect(appels).toBe(1)
    expect(j.lire(ID)).toBeUndefined()
  })

  it('une réponse de 1 Mo est rejetée avant JSON.parse', async () => {
    const { j } = nouveau()
    const gros = { id: 9002, getURL: () => url, isDestroyed: () => false, executeJavaScript: async () => JSON.stringify({ a: 'x'.repeat(1024 * 1024) }) }
    await collecterStubs({ journal: j, pages: () => [gros] }, ID)
    expect(j.lire(ID)).toBeUndefined()
  })

  it('le verrou est levé une fois la page répondue (collecte suivante possible)', async () => {
    const { j } = nouveau()
    let n = 0
    const p = { id: 9003, getURL: () => url, isDestroyed: () => false, executeJavaScript: async () => JSON.stringify({ 'a.b': ++n }) }
    await collecterStubs({ journal: j, pages: () => [p] }, ID)
    await collecterStubs({ journal: j, pages: () => [p] }, ID)
    expect(j.lire(ID)!.apiStubees).toEqual({ 'a.b': 2 })
  })

  it('au plus 200 clés valides retenues dans le relevé ; oublierPage efface le relevé', () => {
    const { j } = nouveau()
    const releve: Record<string, number> = {}
    for (let i = 0; i < 300; i++) releve[`api.k${i}`] = 1
    j.releverStubs(ID, 7, releve)
    expect(Object.keys(j.lire(ID)!.apiStubees)).toHaveLength(200)
    j.oublierPage(7)
    j.releverStubs(ID, 7, { 'api.k0': 1 })
    expect(j.lire(ID)!.apiStubees['api.k0']).toBe(2) // relevé oublié : la page repart de son total
  })
})

describe('rapport de conversion', () => {
  const bon = { cles_retirees: ['a'], permissions_retirees: [], transformations: ['t'], avertissements: [], refus: 'non' }
  it('forme validée : tableaux de chaînes bornés et refus chaîne bornée', () => {
    expect(validerRapportConversion(bon)).toEqual(bon)
    expect(validerRapportConversion({ ...bon, cles_retirees: [1] })).toBeUndefined()
    expect(validerRapportConversion({ ...bon, transformations: 'x' })).toBeUndefined()
    expect(validerRapportConversion({ ...bon, avertissements: Array(101).fill('a') })).toBeUndefined()
    expect(validerRapportConversion({ ...bon, avertissements: ['x'.repeat(501)] })).toBeUndefined()
    expect(validerRapportConversion({ ...bon, refus: 5 })).toBeUndefined()
    expect(validerRapportConversion({ cles_retirees: [] })).toBeUndefined()
    expect(validerRapportConversion(null)).toBeUndefined()
  })
  it('lecture : absent = rien ; trop gros, invalide ou illisible = ignoré avec avertissement', () => {
    const { dossier } = nouveau()
    require('node:fs').mkdirSync(dossier, { recursive: true })
    const f = join(dossier, 'r.json')
    expect(lireRapportConversion(f)).toEqual({})
    writeFileSync(f, JSON.stringify(bon))
    expect(lireRapportConversion(f).rapport).toEqual(bon)
    writeFileSync(f, JSON.stringify({ ...bon, transformations: ['x'.repeat(70_000)] }))
    expect(lireRapportConversion(f)).toMatchObject({ avertissement: expect.stringContaining('volumineux') })
    writeFileSync(f, JSON.stringify({ cles_retirees: 3 }))
    expect(lireRapportConversion(f)).toMatchObject({ avertissement: expect.stringContaining('invalide') })
    writeFileSync(f, '{pas json')
    expect(lireRapportConversion(f).avertissement).toBeDefined()
  })
  it('un rapport invalide déjà présent dans le fichier du journal est écarté à la relecture', () => {
    const { dossier, j } = nouveau()
    j.avertissement(ID, 'x')
    const f = join(dossier, `${ID}.json`)
    const o = JSON.parse(readFileSync(f, 'utf8'))
    writeFileSync(f, JSON.stringify({ ...o, conversion: { cles_retirees: 'pirate' } }))
    expect(creerJournal({ dossier }).lire(ID)!.conversion).toBeUndefined()
  })
})
