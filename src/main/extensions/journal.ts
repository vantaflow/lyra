/**
 * Journal de compatibilité par extension : `userData/extensions/journal/<id>.json` (écriture atomique).
 *
 * Mécanisme de comptage des API stubées (shim-head.js) : les shims incrémentent `globalThis.__lyraStubs` dans le contexte
 * de l'extension. Une extension ne peut pas écrire au processus principal ; le processus principal lit donc ce compteur
 * avec `webContents.executeJavaScript` sur chaque page `chrome-extension://<id>/` (arrière-plan, popup, options), à la
 * demande du journal (IPC `extensions:journal`) et toutes les quelques secondes. Chaque page garde son dernier relevé :
 * seule la différence est ajoutée (un compteur qui baisse = page rechargée, on ajoute son nouveau total).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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

const vide = (): JournalExtension => ({ avertissementsChargement: [], apiStubees: {}, apiManquantes: [], conflitsRaccourcis: [], redondanceBoucliers: false })

function nettoyer(v: unknown): JournalExtension {
  const o = objet(v)
  if (!o) return vide()
  const stubs: Record<string, number> = {}
  for (const [k, n] of Object.entries(objet(o.apiStubees) ?? {})) if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && Object.keys(stubs).length < MAX_API) stubs[k] = Math.floor(n)
  const rb = o.redondanceBoucliers === true
  const conv = objet(o.conversion)
  return {
    avertissementsChargement: textes(o.avertissementsChargement).slice(0, MAX_AVERTISSEMENTS),
    apiStubees: stubs,
    apiManquantes: textes(o.apiManquantes).slice(0, MAX_API),
    conflitsRaccourcis: textes(o.conflitsRaccourcis).slice(0, MAX_API),
    redondanceBoucliers: rb,
    ...(rb ? { noteBoucliers: NOTE_BOUCLIERS } : {}),
    ...(conv ? { conversion: conv as unknown as RapportConversion } : {})
  }
}

export interface Journal {
  /** Calcul fait au chargement : API manquantes, redondance, raccourcis en conflit, rapport de conversion ; l'historique des appels est gardé. */
  enregistrerChargement(id: string, o: { manifest: Record<string, unknown>; autres?: Array<{ nom: string; manifest: Record<string, unknown> }>; conversion?: RapportConversion }): void
  avertissement(id: string, texte: string): void
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
      for (const [api, n] of Object.entries(releve)) {
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || !/^[\w.$-]{1,120}$/.test(api)) continue
        const prec = avant[api] ?? 0
        const delta = n >= prec ? n - prec : n
        if (delta === 0) continue
        if (!(api in j.apiStubees) && Object.keys(j.apiStubees).length >= MAX_API) continue
        j.apiStubees[api] = (j.apiStubees[api] ?? 0) + Math.floor(delta)
        change = true
      }
      releves.set(cle, { ...releve })
      if (change) sauver(id, j)
    },
    lire(id) {
      if (!valide(id)) return undefined
      if (!cache.has(id) && !existsSync(fichier(id))) return undefined
      const j = charger(id)
      return { ...j, avertissementsChargement: [...j.avertissementsChargement], apiStubees: { ...j.apiStubees } }
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
}

const HOTE_EXTENSION = /^chrome-extension:\/\/([a-p]{32})\//

/** Lit le compteur `__lyraStubs` de chaque page d'extension et l'ajoute au journal. Ne lève jamais. */
export async function collecterStubs(o: OptionsCollecte, seulement?: string): Promise<void> {
  await Promise.all(
    o.pages().map(async (p) => {
      if (p.isDestroyed()) return
      const m = HOTE_EXTENSION.exec(p.getURL())
      if (!m || (seulement && m[1] !== seulement)) return
      try {
        const brut = await p.executeJavaScript('JSON.stringify(globalThis.__lyraStubs || null)')
        const releve = typeof brut === 'string' ? (JSON.parse(brut) as Record<string, number> | null) : null
        if (releve && typeof releve === 'object') o.journal.releverStubs(m[1], p.id, releve)
      } catch {
        /* page en cours de chargement ou détruite */
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
