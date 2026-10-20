/**
 * Volume, abandon et sérialisation : bases synthétiques au schéma de Chrome générées à la volée (aucun profil réel).
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REQUETES_HISTORIQUE, choisirRequeteHistorique, lireProfilChromium, parcourirHistoriqueChromium } from './chromium'
import type { ParametresLecture } from './chromium'
import { detecterProfils } from './detection'
import { MAINTENANT_FIXTURES, baseHistoriqueVolumineuse } from './fixtures/generer'
import { ouvrirBase } from './sqlite'
import { estIndisponible } from './types'
import type { ProfilDetecte, Visite } from './types'

const FIXTURES = fileURLToPath(new URL('./fixtures/chromium', import.meta.url))
const MAINTENANT = MAINTENANT_FIXTURES
const IMPORT = fileURLToPath(new URL('.', import.meta.url))

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-volume-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function profilAvecHistorique(octets: Uint8Array): ProfilDetecte {
  const chemin = join(tmp, 'profil')
  mkdirSync(chemin, { recursive: true })
  writeFileSync(join(chemin, 'History'), octets)
  return { navigateur: 'chrome', nom: 'Synthétique', chemin, racine: tmp, parDefaut: true }
}

async function profilFixture(): Promise<ProfilDetecte> {
  return (await detecterProfils({ racines: { chrome: join(FIXTURES, 'chrome') }, navigateurs: ['chrome'] }))[0]
}

describe('historique volumineux : requête en flux', () => {
  // 30 000 adresses × 5 visites = 150 000 visites, avec les index de Chrome
  const URLS = 30_000
  const VISITES = 5

  it('la base de Chrome (avec visits_url_index) utilise la requête en flux, sans matérialisation', async () => {
    const SQL = await initSqlJs()
    const base = await ouvrirBase(baseHistoriqueVolumineuse(SQL, URLS, VISITES))
    expect(choisirRequeteHistorique(base)).toBe('flux')

    const plan = (sql: string): string =>
      base
        .lignes(`EXPLAIN QUERY PLAN ${sql}`, [0])
        .map((l) => String(l.detail))
        .join('\n')
    const flux = plan(REQUETES_HISTORIQUE.flux)
    expect(flux).toContain('visits_url_index')
    // pas de table temporaire pour le regroupement ni pour un tri : SQLite sort les lignes au fil de l'index
    expect(flux).not.toMatch(/TEMP B-TREE/)
    // la requête de repli, elle, matérialise (c'est ce qui bloquait la boucle d'événements sur 600 000 visites)
    expect(plan(REQUETES_HISTORIQUE.agrege)).toMatch(/TEMP B-TREE/)
    base.fermer()
  })

  it('même résultat que la requête de repli, sur toute la base', async () => {
    const SQL = await initSqlJs()
    const base = await ouvrirBase(baseHistoriqueVolumineuse(SQL, URLS, VISITES))
    const seuil = (Date.parse('2026-09-01T00:00:00Z') + 11_644_473_600_000) * 1000
    const tout = (sql: string): string[] =>
      base
        .lignes(sql, [seuil])
        .map((l) => `${l.url}|${l.titre}|${l.dernier}|${l.n}`)
        .sort()
    const flux = tout(REQUETES_HISTORIQUE.flux)
    const agrege = tout(REQUETES_HISTORIQUE.agrege)
    expect(flux.length).toBeGreaterThan(URLS * 0.9) // les adresses cachées (1/50) sont écartées
    expect(flux).toEqual(agrege)
    // la visite de sous-cadre (k = 3) n'est jamais comptée : 4 visites sur 5
    expect(flux[0].endsWith('|4')).toBe(true)
    base.fermer()
  })

  it('sans visits_url_index : repli sur la requête agrégée, même contenu', async () => {
    const SQL = await initSqlJs()
    const octets = baseHistoriqueVolumineuse(SQL, 2000, 3, false)
    const base = await ouvrirBase(octets)
    expect(choisirRequeteHistorique(base)).toBe('agrege')
    base.fermer()

    const sansIndex = await lireProfilChromium(profilAvecHistorique(octets), { elements: ['historique'], maintenant: MAINTENANT })
    const avecIndex = await lireProfilChromium(profilAvecHistorique(baseHistoriqueVolumineuse(SQL, 2000, 3, true)), { elements: ['historique'], maintenant: MAINTENANT })
    expect(sansIndex.donnees.historique).toEqual(avecIndex.donnees.historique)
    expect((sansIndex.donnees.historique as Visite[]).length).toBeGreaterThan(1900)
  })

  it('sans table visits : requête sur urls', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run('CREATE TABLE urls(id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, last_visit_time INTEGER, hidden INTEGER DEFAULT 0)')
    const base = await ouvrirBase(db.export())
    expect(choisirRequeteHistorique(base)).toBe('urls')
    base.fermer()
  })

  it('lecture par lots : tailles respectées, progression croissante, rien accumulé côté lecteur', async () => {
    const SQL = await initSqlJs()
    const p = profilAvecHistorique(baseHistoriqueVolumineuse(SQL, URLS, VISITES))
    const tailles: number[] = []
    const progression: number[] = []
    const resume = await parcourirHistoriqueChromium(p, { maintenant: MAINTENANT, tailleLot: 1000, surProgression: (e) => progression.push(e.fait) }, (lot) => void tailles.push(lot.length))
    if (estIndisponible(resume)) throw new Error(resume.raison)
    expect(tailles.every((t) => t <= 1000)).toBe(true)
    expect(tailles.length).toBeGreaterThan(20)
    expect(tailles.reduce((s, t) => s + t, 0)).toBe(resume.pages)
    expect(resume.visites).toBe(resume.pages * 4)
    expect(progression.at(-1)).toBe(resume.pages)
    expect(progression).toEqual([...progression].sort((a, b) => a - b))
  }, 60_000)

  it('lireProfilChromium rend l’historique du plus récent au plus ancien malgré la requête sans tri', async () => {
    const SQL = await initSqlJs()
    const r = await lireProfilChromium(profilAvecHistorique(baseHistoriqueVolumineuse(SQL, 3000, 2)), { elements: ['historique'], maintenant: MAINTENANT })
    const dates = (r.donnees.historique as Visite[]).map((v) => v.date)
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
  })
})

describe('taille maximale', () => {
  it('base trop volumineuse : message lisible avec les tailles, code « volumineux », rien ne traîne', async () => {
    const SQL = await initSqlJs()
    const dossierTemp = join(tmp, 'temp')
    mkdirSync(dossierTemp)
    const p = profilAvecHistorique(baseHistoriqueVolumineuse(SQL, 3000, 3)) // ~ quelques centaines de Ko
    const r = await lireProfilChromium(p, { elements: ['historique'], dossierTemp, tailleMaxBase: 100_000, plateforme: 'win32' })
    expect(r.donnees.historique).toMatchObject({ indisponible: true, code: 'volumineux' })
    const raison = estIndisponible(r.donnees.historique) ? r.donnees.historique.raison : ''
    expect(raison).toMatch(/^L'historique est trop volumineux \(\d+ Mo, maximum 1 Mo\) : réduisez-le dans Chrome puis réessayez\.$/)
    expect(readdirSync(dossierTemp)).toEqual([])
  })

  it('fichier JSON trop volumineux (limite des fichiers ordinaires)', async () => {
    const p = profilAvecHistorique(new Uint8Array())
    writeFileSync(join(p.chemin, 'Bookmarks'), JSON.stringify({ roots: {}, remplissage: 'x'.repeat(5000) }))
    const r = await lireProfilChromium(p, { elements: ['favoris'], tailleMaxFichier: 1000 })
    expect(r.donnees.favoris).toMatchObject({ indisponible: true, code: 'volumineux' })
  })

  it('limites par défaut : 64 Mio pour les fichiers, 1 Gio pour les bases', async () => {
    const { TAILLE_MAX_BASE, TAILLE_MAX_FICHIER } = await import('./copie')
    expect(TAILLE_MAX_FICHIER).toBe(64 * 1024 * 1024)
    expect(TAILLE_MAX_BASE).toBe(1024 * 1024 * 1024)
  })
})

describe('abandon (AbortSignal)', () => {
  it('signal déjà levé : tout est Indisponible « annulée », rien ne traîne', async () => {
    const dossierTemp = join(tmp, 'temp')
    mkdirSync(dossierTemp)
    const controle = new AbortController()
    controle.abort()
    const r = await lireProfilChromium(await profilFixture(), { dossierTemp, signal: controle.signal })
    for (const v of Object.values(r.donnees)) expect(v).toMatchObject({ indisponible: true, code: 'annule', raison: 'Lecture annulée.' })
    expect(r.compteurs).toEqual({})
    expect(readdirSync(dossierTemp)).toEqual([])
  })

  it('vérifié entre deux lots : le flux s’arrête, les lots déjà livrés restent livrés', async () => {
    const SQL = await initSqlJs()
    const dossierTemp = join(tmp, 'temp')
    mkdirSync(dossierTemp)
    const p = profilAvecHistorique(baseHistoriqueVolumineuse(SQL, 5000, 2))
    const controle = new AbortController()
    const lots: number[] = []
    const r = await parcourirHistoriqueChromium(p, { maintenant: MAINTENANT, tailleLot: 500, dossierTemp, signal: controle.signal }, (lot) => {
      lots.push(lot.length)
      if (lots.length === 2) controle.abort()
    })
    expect(r).toMatchObject({ indisponible: true, code: 'annule' })
    expect(lots).toHaveLength(2) // abandon pris en compte dès la fin du lot en cours
    expect(readdirSync(dossierTemp)).toEqual([])
  })

  it('vérifié entre deux éléments : ceux qui suivent un abandon sont annulés, ceux d’avant restent lus', async () => {
    const controle = new AbortController()
    const r = await lireProfilChromium(await profilFixture(), {
      elements: ['favoris', 'reglages', 'moteurs'],
      maintenant: MAINTENANT,
      signal: controle.signal,
      surProgression: (e) => {
        if (e.element === 'reglages') controle.abort() // après la lecture des favoris, avant celle des réglages
      }
    })
    expect(estIndisponible(r.donnees.favoris)).toBe(false)
    expect(r.donnees.moteurs).toMatchObject({ indisponible: true, code: 'annule' })
  })
})

describe('prêt pour un utilityProcess', () => {
  it('le résultat est sérialisable (structuredClone) et identique après copie', async () => {
    const r = await lireProfilChromium(await profilFixture(), { maintenant: MAINTENANT })
    expect(structuredClone(r)).toEqual(r)
    expect(JSON.parse(JSON.stringify(r))).toEqual(r)
  })

  it('les paramètres sont de simples données : une copie JSON donne le même résultat', async () => {
    const parametres: ParametresLecture = { elements: ['favoris', 'historique'], depuisJours: 365, maintenant: MAINTENANT, tailleLot: 3, dossierTemp: tmp, tailleMaxBase: 50_000_000, tailleMaxFichier: 10_000_000 }
    const profil = JSON.parse(JSON.stringify(await profilFixture())) as ProfilDetecte
    const direct = await lireProfilChromium(await profilFixture(), parametres)
    const viaMessage = await lireProfilChromium(profil, JSON.parse(JSON.stringify(parametres)) as ParametresLecture)
    expect(viaMessage).toEqual(direct)
  })

  // Seuls `processus.ts` (lance le utilityProcess) et `ipc.ts` (handlers) ont le droit de toucher Electron.
  const AUTORISES_ELECTRON = ['processus.ts', 'ipc.ts']
  it('aucun module du dossier d’import (hors tests) ne dépend d’Electron', () => {
    const sources = readdirSync(IMPORT).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !AUTORISES_ELECTRON.includes(f))
    expect(sources.length).toBeGreaterThan(5)
    for (const f of sources) {
      expect(readFileSync(join(IMPORT, f), 'utf8'), f).not.toMatch(/from ['"]electron['"]|require\(['"]electron['"]\)/)
    }
  })
})

/** Copie récursive à la main : `fs.cpSync` de Node 22 déforme les chemins non ASCII sous Windows (dossier « ZoÃ« »). */
function copierDossier(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true })
  for (const e of readdirSync(source, { withFileTypes: true })) {
    if (e.isDirectory()) copierDossier(join(source, e.name), join(destination, e.name))
    else copyFileSync(join(source, e.name), join(destination, e.name))
  }
}

describe('chemins Unicode et caractères spéciaux', () => {
  it('profil sous un dossier « Zoë #1 %20 日本 & co » : détection, copie et lecture de tous les éléments', async () => {
    const racine = join(tmp, 'Zoë #1 %20 日本 & co', 'User Data')
    copierDossier(join(FIXTURES, 'chrome'), racine)
    const dossierTemp = join(tmp, 'Température 日本')
    mkdirSync(dossierTemp)
    const [profil] = await detecterProfils({ racines: { chrome: racine }, navigateurs: ['chrome'] })
    expect(profil).toMatchObject({ nom: 'Khalil', chemin: join(racine, 'Default') })
    const attendu = await lireProfilChromium(await profilFixture(), { maintenant: MAINTENANT })
    const r = await lireProfilChromium(profil, { maintenant: MAINTENANT, dossierTemp })
    expect(r).toEqual(attendu)
    expect(Object.values(r.donnees).some(estIndisponible)).toBe(false)
    expect(readdirSync(dossierTemp)).toEqual([])
  })
})
