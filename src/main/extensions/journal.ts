/**
 * Journal de compatibilité par extension : `userData/extensions/journal/<id>.json` (écriture atomique).
 *
 * Mécanisme de comptage des API stubées (shim-head.js) : les shims incrémentent `globalThis.__lyraStubs` dans le contexte
 * de l'extension. Une extension ne peut pas écrire au processus principal ; le processus principal lit donc ce compteur
 * avec `webContents.executeJavaScript` sur chaque page `chrome-extension://<id>/` (arrière-plan, popup, options), à la
 * demande du journal (IPC `extensions:journal`) et toutes les quelques secondes. Chaque page garde son dernier relevé :
 * seule la différence est ajoutée (un compteur qui baisse = page rechargée, on ajoute son nouveau total).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JournalExtension, RapportConversion } from '../../shared/types'
import { ID_EXTENSION } from './registre'

export const NOTE_BOUCLIERS = 'blocage réseau assuré par les Boucliers'
const MAX_AVERTISSEMENTS = 50
const MAX_API = 200

/**
 * Permissions (et clés de manifest) dont l'API n'existe ni dans Electron ni dans electron-chrome-extensions : l'extension
 * se charge, mais la fonction est sans effet. Liste prudente, à compléter au fil des essais.
 */
const API_MANQUANTES = new Set([
  'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'declarativeNetRequestFeedback', 'commands', 'sidePanel',
  'nativeMessaging', 'fontSettings', 'theme', 'contextualIdentities', 'tabGroups', 'identity', 'gcm', 'tts', 'ttsEngine',
  'pageCapture', 'tabCapture', 'desktopCapture', 'proxy', 'processes', 'readingList', 'search'
])

type Json = Record<string, unknown>
const objet = (v: unknown): Json | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : undefined)
const textes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

const permissionsDe = (m: Json): string[] => [...textes(m.permissions), ...textes(m.optional_permissions)]

/** API du manifest que Lyra ne fournit pas (permissions, plus la clé `commands` et `side_panel`). */
export function apiManquantes(manifest: Record<string, unknown>): string[] {
  const trouvees = new Set<string>()
  for (const p of permissionsDe(manifest)) if (API_MANQUANTES.has(p)) trouvees.add(p)
  if (objet(manifest.commands) && Object.keys(objet(manifest.commands) as Json).length > 0) trouvees.add('commands')
  if (objet(manifest.side_panel)) trouvees.add('sidePanel')
  return [...trouvees].sort()
}

/** `webRequest` / `webRequestBlocking` déclarés : le blocage réseau est fait par les Boucliers (leur listener prime). */
export function redondanceBoucliers(manifest: Record<string, unknown>): boolean {
  return permissionsDe(manifest).some((p) => p === 'webRequest' || p === 'webRequestBlocking')
}

/** Raccourcis proposés par le manifest (`commands.*.suggested_key`), normalisés en minuscules. */
function raccourcis(manifest: Record<string, unknown>): Map<string, string> {
  const r = new Map<string, string>()
  for (const [nom, c] of Object.entries(objet(manifest.commands) ?? {})) {
    const cle = objet(objet(c)?.suggested_key)
    if (!cle) continue
    for (const v of Object.values(cle)) if (typeof v === 'string') r.set(v.trim().toLowerCase(), nom)
  }
  return r
}

/** Raccourcis de `manifest` déjà pris par l'un des `autres` (manifests des autres extensions installées). */
export function conflitsRaccourcis(manifest: Record<string, unknown>, autres: Array<{ nom: string; manifest: Record<string, unknown> }>): string[] {
  const miens = raccourcis(manifest)
  const sortie: string[] = []
  for (const a of autres) {
    for (const cle of raccourcis(a.manifest).keys()) if (miens.has(cle)) sortie.push(`${cle} : déjà utilisé par ${a.nom}`)
  }
  return sortie.sort()
}

const MAX_LISTE = 100
const MAX_TEXTE = 500
export const MAX_RAPPORT = 64 * 1024

const listeTextes = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.length <= MAX_LISTE && v.every((x) => typeof x === 'string' && x.length <= MAX_TEXTE) ? (v as string[]) : undefined

/** Forme d'un rapport de conversion : tableaux de chaînes bornés (cles_retirees, permissions_retirees, transformations, avertissements) et `refus` chaîne bornée. Undefined sinon. */
export function validerRapportConversion(v: unknown): RapportConversion | undefined {
  const o = objet(v)
  if (!o) return undefined
  const cles = listeTextes(o.cles_retirees)
  const perms = listeTextes(o.permissions_retirees)
  const transf = listeTextes(o.transformations)
  const avert = listeTextes(o.avertissements)
  if (!cles || !perms || !transf || !avert) return undefined
  if (o.refus !== undefined && (typeof o.refus !== 'string' || o.refus.length > MAX_TEXTE)) return undefined
  return { cles_retirees: cles, permissions_retirees: perms, transformations: transf, avertissements: avert, ...(typeof o.refus === 'string' ? { refus: o.refus } : {}) }
}

/** Lit `lyra-conversion.json` (≤ 64 Ko, forme validée) ; `avertissement` si le fichier existe mais est refusé. */
export function lireRapportConversion(chemin: string): { rapport?: RapportConversion; avertissement?: string } {
  if (!existsSync(chemin)) return {}
  try {
    if (statSync(chemin).size > MAX_RAPPORT) return { avertissement: 'rapport de conversion ignoré : fichier trop volumineux' }
    const rapport = validerRapportConversion(JSON.parse(readFileSync(chemin, 'utf8')))
    return rapport ? { rapport } : { avertissement: 'rapport de conversion ignoré : forme invalide' }
  } catch {
    return { avertissement: 'rapport de conversion ignoré : illisible' }
  }
}

const vide = (): JournalExtension => ({ avertissementsChargement: [], apiStubees: {}, apiManquantes: [], conflitsRaccourcis: [], redondanceBoucliers: false })

function nettoyer(v: unknown): JournalExtension {
  const o = objet(v)
  if (!o) return vide()
  const stubs: Record<string, number> = {}
  for (const [k, n] of Object.entries(objet(o.apiStubees) ?? {})) if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && Object.keys(stubs).length < MAX_API) stubs[k] = Math.floor(n)
  const rb = o.redondanceBoucliers === true
  const conv = validerRapportConversion(o.conversion)
  return {
    avertissementsChargement: textes(o.avertissementsChargement).slice(0, MAX_AVERTISSEMENTS),
    apiStubees: stubs,
    apiManquantes: textes(o.apiManquantes).slice(0, MAX_API),
    conflitsRaccourcis: textes(o.conflitsRaccourcis).slice(0, MAX_API),
    redondanceBoucliers: rb,
    ...(rb ? { noteBoucliers: NOTE_BOUCLIERS } : {}),
    ...(conv ? { conversion: conv } : {})
  }
}

export interface Journal {
  /** Calcul fait au chargement : API manquantes, redondance, raccourcis en conflit, rapport de conversion ; l'historique des appels est gardé. */
  enregistrerChargement(id: string, o: { manifest: Record<string, unknown>; autres?: Array<{ nom: string; manifest: Record<string, unknown> }>; conversion?: RapportConversion }): void
  avertissement(id: string, texte: string): void
  /** Oublie le relevé précédent d'une page (page détruite). */
  oublierPage(page: number): void
  /** `releve` = compteurs courants d'une page (clé = identifiant de la page) ; seule la différence avec le relevé précédent est ajoutée. */
  releverStubs(id: string, page: number, releve: Record<string, number>): void
  lire(id: string): JournalExtension | undefined
  supprimer(id: string): void
}

export function creerJournal(o: { dossier: string }): Journal {
  const cache = new Map<string, JournalExtension>()
  const releves = new Map<string, Record<string, number>>()
  const fichier = (id: string): string => join(o.dossier, `${id}.json`)

  const charger = (id: string): JournalExtension => {
    let j = cache.get(id)
    if (!j) {
      try {
        j = nettoyer(JSON.parse(readFileSync(fichier(id), 'utf8')))
      } catch {
        j = vide()
      }
      cache.set(id, j)
    }
    return j
  }
  const sauver = (id: string, j: JournalExtension): void => {
    try {
      mkdirSync(o.dossier, { recursive: true })
      const tmp = `${fichier(id)}.tmp`
      writeFileSync(tmp, JSON.stringify(j, null, 2))
      renameSync(tmp, fichier(id))
    } catch (e) {
      console.warn(`[extensions] journal de ${id} non écrit : ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const valide = (id: string): boolean => ID_EXTENSION.test(id)

  return {
    enregistrerChargement(id, d) {
      if (!valide(id)) return
      const j = charger(id)
      j.apiManquantes = apiManquantes(d.manifest)
      j.redondanceBoucliers = redondanceBoucliers(d.manifest)
      if (j.redondanceBoucliers) j.noteBoucliers = NOTE_BOUCLIERS
      else delete j.noteBoucliers
      j.conflitsRaccourcis = conflitsRaccourcis(d.manifest, d.autres ?? [])
      if (d.conversion) j.conversion = d.conversion
      else delete j.conversion
      if (d.manifest.manifest_version === 2) {
        const dep = "manifest_version 2 : format que Chromium abandonne ; chargé avec la couche de compatibilité de Lyra"
        if (!j.avertissementsChargement.includes(dep)) j.avertissementsChargement.unshift(dep)
        j.avertissementsChargement = j.avertissementsChargement.slice(0, MAX_AVERTISSEMENTS)
      }
      sauver(id, j)
    },
    avertissement(id, texte) {
      if (!valide(id)) return
      const j = charger(id)
      const t = texte.slice(0, 300)
      if (j.avertissementsChargement.includes(t) || j.avertissementsChargement.length >= MAX_AVERTISSEMENTS) return
      j.avertissementsChargement.push(t)
      sauver(id, j)
    },
    releverStubs(id, page, releve) {
      if (!valide(id)) return
      const cle = `${id}:${page}`
      const avant = releves.get(cle) ?? {}
      const j = charger(id)
      let change = false
      const retenu: Record<string, number> = {}
      for (const [api, n] of Object.entries(releve)) {
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || !/^[\w.$-]{1,120}$/.test(api)) continue
        if (Object.keys(retenu).length >= MAX_API) break
        retenu[api] = n
        const prec = avant[api] ?? 0
        const delta = n >= prec ? n - prec : n
        if (delta === 0) continue
        if (!(api in j.apiStubees) && Object.keys(j.apiStubees).length >= MAX_API) continue
        j.apiStubees[api] = (j.apiStubees[api] ?? 0) + Math.floor(delta)
        change = true
      }
      releves.set(cle, retenu)
      if (change) sauver(id, j)
    },
    lire(id) {
      if (!valide(id)) return undefined
      if (!cache.has(id) && !existsSync(fichier(id))) return undefined
      const j = charger(id)
      return { ...j, avertissementsChargement: [...j.avertissementsChargement], apiStubees: { ...j.apiStubees } }
    },
    oublierPage(page) {
      for (const k of [...releves.keys()]) if (k.endsWith(`:${page}`)) releves.delete(k)
    },
    supprimer(id) {
      if (!valide(id)) return
      cache.delete(id)
      for (const k of [...releves.keys()]) if (k.startsWith(`${id}:`)) releves.delete(k)
      rmSync(fichier(id), { force: true })
    }
  }
}

// ------------------------------------------------------------------------------------------------- collecte (Electron)

/** Ce que la collecte utilise d'un `WebContents` ; simulable en test. */
export interface PageExtension {
  id: number
  getURL(): string
  isDestroyed(): boolean
  executeJavaScript(code: string): Promise<unknown>
}

export interface OptionsCollecte {
  journal: Journal
  pages: () => PageExtension[]
  /** Délai maximal par page, en ms (2000 par défaut) ; au-delà, le résultat est ignoré. */
  delaiMs?: number
}

const HOTE_EXTENSION = /^chrome-extension:\/\/([a-p]{32})\//
const MAX_RELEVE = 16 * 1024
/** Pages dont un relevé est en cours : pas de nouvelle collecte tant que le précédent n'est pas terminé (même s'il a expiré). */
const enCours = new Set<number>()

/** Lit le compteur `__lyraStubs` de chaque page d'extension et l'ajoute au journal. Ne lève jamais, ne dépasse pas `delaiMs`. */
export async function collecterStubs(o: OptionsCollecte, seulement?: string): Promise<void> {
  const delai = o.delaiMs ?? 2000
  await Promise.all(
    o.pages().map(async (p) => {
      if (p.isDestroyed() || enCours.has(p.id)) return
      const m = HOTE_EXTENSION.exec(p.getURL())
      if (!m || (seulement && m[1] !== seulement)) return
      enCours.add(p.id)
      let minuteur: NodeJS.Timeout | undefined
      try {
        const lecture = Promise.resolve(p.executeJavaScript('JSON.stringify(globalThis.__lyraStubs || null)'))
        lecture.then(
          () => enCours.delete(p.id),
          () => enCours.delete(p.id)
        )
        const brut = await Promise.race([lecture, new Promise<undefined>((ok) => { minuteur = setTimeout(() => ok(undefined), delai) })])
        if (typeof brut !== 'string' || brut.length > MAX_RELEVE) return
        const releve = JSON.parse(brut) as Record<string, number> | null
        if (releve && typeof releve === 'object' && !Array.isArray(releve)) o.journal.releverStubs(m[1], p.id, releve)
      } catch {
        /* page en cours de chargement ou détruite */
      } finally {
        if (minuteur) clearTimeout(minuteur)
      }
    })
  )
}

/** Message de console (warning / error) d'une page d'extension → avertissement du journal. */
export function enregistrerMessageConsole(journal: Journal, url: string, niveau: string, message: string): void {
  const m = HOTE_EXTENSION.exec(url)
  if (!m || (niveau !== 'warning' && niveau !== 'error')) return
  journal.avertissement(m[1], `${niveau === 'error' ? 'erreur' : 'avertissement'} : ${message}`)
}
