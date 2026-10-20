/** Registre des extensions (`settings.extensions.installees`) : validation stricte et opérations sur la liste. Sans Electron. */
import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ExtensionInstallee, MagasinExtension, Settings, SourceExtension } from '../../shared/types'

export const SOURCES: readonly SourceExtension[] = ['cws', 'crx', 'zip', 'dossier', 'amo', 'xpi', 'ubo']
export const MAGASINS: readonly MagasinExtension[] = ['chrome', 'edge', 'firefox', 'inconnu']
export const MAX_EXTENSIONS = 200

export const ID_EXTENSION = /^[a-p]{32}$/
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/
/** Slug AMO, ou identifiant gecko (`nom@domaine`, `{uuid}`) : caractères sûrs pour une URL et un nom de fichier. */
export const SLUG_AMO = /^[A-Za-z0-9{][A-Za-z0-9._@{}-]{0,99}$/
const DATE_ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const propre = (o: Record<string, unknown>, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined)
const chaine = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined)

/** Dossier relatif à `userData/extensions/` : segments simples séparés par « / », sans « .. », sans racine. */
export function dossierRelatifValide(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 300) return false
  const segments = v.split('/')
  return segments.length <= 4 && segments.every((s) => s !== '..' && SEGMENT.test(s))
}

/** Une entrée du registre, ou undefined si un champ manque ou est invalide. */
function installee(v: unknown): ExtensionInstallee | undefined {
  if (!estObjet(v)) return undefined
  const id = propre(v, 'id')
  const nom = chaine(propre(v, 'nom'), 200)
  const version = chaine(propre(v, 'version'), 64)
  const source = SOURCES.find((s) => s === propre(v, 'source'))
  const magasin = MAGASINS.find((m) => m === propre(v, 'magasin'))
  const dossier = propre(v, 'dossier')
  const active = propre(v, 'active')
  const installeeLe = chaine(propre(v, 'installeeLe'), 40)
  const miseAJourLe = chaine(propre(v, 'miseAJourLe'), 40)
  const convertie = propre(v, 'convertie')
  const slugAmo = propre(v, 'slugAmo')
  if (typeof id !== 'string' || !ID_EXTENSION.test(id)) return undefined
  if (!nom || !version || !source || !magasin || !dossierRelatifValide(dossier) || typeof active !== 'boolean') return undefined
  if (!installeeLe || !DATE_ISO.test(installeeLe) || !miseAJourLe || !DATE_ISO.test(miseAJourLe)) return undefined
  if (convertie !== undefined && typeof convertie !== 'boolean') return undefined
  if (slugAmo !== undefined && (typeof slugAmo !== 'string' || !SLUG_AMO.test(slugAmo))) return undefined
  return { id, nom, version, source, magasin, dossier, active, installeeLe, miseAJourLe, ...(convertie !== undefined ? { convertie } : {}), ...(typeof slugAmo === 'string' ? { slugAmo } : {}) }
}

/**
 * Valide la liste : entrées invalides et doublons d'id ignorés (le premier gagne), au plus 200 entrées ; `[]` explicite
 * accepté. Une liste non vide entièrement invalide est ignorée (elle n'efface jamais le registre existant).
 */
export function validerInstallees(v: unknown): ExtensionInstallee[] | undefined {
  if (!Array.isArray(v)) return undefined
  const sortie: ExtensionInstallee[] = []
  const vus = new Set<string>()
  for (const e of v) {
    if (sortie.length >= MAX_EXTENSIONS) break
    const x = installee(e)
    if (!x || vus.has(x.id)) continue
    vus.add(x.id)
    sortie.push(x)
  }
  return v.length > 0 && sortie.length === 0 ? undefined : sortie
}

/** Id de dossier converti : comme Chromium pour une extension sans clé (sha256 du chemin, 32 premiers hexa → a-p). */
export function idPourDossier(chemin: string): string {
  const hex = createHash('sha256').update(chemin).digest('hex').slice(0, 32)
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')
}

/** Chemin absolu d'un dossier du registre ; lève si le résultat sort de `base` (jamais chargé ni supprimé hors de là). */
export function dossierAbsolu(base: string, dossier: string): string {
  if (!dossierRelatifValide(dossier)) throw new Error(`dossier d'extension invalide : ${dossier}`)
  const racine = resolve(base)
  const chemin = resolve(racine, ...dossier.split('/'))
  const rel = relative(racine, chemin)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) throw new Error(`dossier d'extension hors de ${racine}`)
  return chemin
}

/**
 * Avant la source `ubo`, uBlock Origin installé par Lyra était enregistré en `zip` et reconnu à son nom : ces entrées
 * passent en `ubo` (un zip local homonyme installé ensuite n'est plus pris pour lui). Retourne le nombre d'entrées migrées ;
 * rien n'est réécrit s'il n'y en a aucune.
 */
export function migrerSourceUbo(registre: Registre): number {
  const anciennes = registre.lister().filter((e) => e.source === 'zip' && e.nom.trim().toLowerCase() === 'ublock origin')
  for (const e of anciennes) registre.ajouter({ ...e, source: 'ubo' })
  return anciennes.length
}

export interface Registre {
  lister(): ExtensionInstallee[]
  trouver(id: string): ExtensionInstallee | undefined
  /** Ajoute en fin de liste ; une extension déjà présente est remplacée à sa place (ordre d'installation conservé). */
  ajouter(e: ExtensionInstallee): void
  activer(id: string, active: boolean): boolean
  retirer(id: string): boolean
}

export interface StoreReglages {
  getSettings(): Settings
  setSettings(patch: Partial<Settings>): Settings
}

export function creerRegistre(reglages: StoreReglages): Registre {
  const lister = (): ExtensionInstallee[] => reglages.getSettings().extensions.installees
  const ecrire = (installees: ExtensionInstallee[]): void => void reglages.setSettings({ extensions: { installees } } as Partial<Settings>)
  return {
    lister,
    trouver: (id) => lister().find((e) => e.id === id),
    ajouter(e) {
      const liste = lister()
      ecrire(liste.some((x) => x.id === e.id) ? liste.map((x) => (x.id === e.id ? e : x)) : [...liste, e])
    },
    activer(id, active) {
      if (!lister().some((e) => e.id === id)) return false
      ecrire(lister().map((e) => (e.id === id ? { ...e, active } : e)))
      return true
    },
    retirer(id) {
      if (!lister().some((e) => e.id === id)) return false
      ecrire(lister().filter((e) => e.id !== id))
      return true
    }
  }
}
