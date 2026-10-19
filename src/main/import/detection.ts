/**
 * Détection des navigateurs installés et de leurs profils. Lecture seule : on ne fait que lister des dossiers et
 * lire `Local State` (petit JSON que Chromium réécrit de façon atomique, donc lisible navigateur ouvert).
 *
 * Racines injectables, pour les tests :
 * - `opts.racines` : un dossier par navigateur ;
 * - `LYRA_IMPORT_RACINE` (acceptée **seulement si `LYRA_TEST=1`**) : un dossier contenant un sous-dossier par
 *   navigateur (`<racine>/chrome`, `<racine>/edge`…), chacun étant le dossier « User Data » du navigateur. Quand elle
 *   est active, les vrais dossiers de la machine ne sont jamais consultés.
 *
 * Extension prévue (Task 2) : Firefox (`profiles.ini`), Safari (`~/Library/Safari`), Orion — ajouter leur détecteur
 * dans `DETECTEURS` et leur dossier dans `racinesParDefaut`, rien d'autre ne change.
 */
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { NAVIGATEURS_CHROMIUM, NOMS_NAVIGATEURS } from './types'
import type { NavigateurSource, ProfilDetecte } from './types'

export type Racines = Partial<Record<NavigateurSource, string>>

export interface OptionsDetection {
  /** Dossier racine de chaque navigateur ; remplace les chemins système. */
  racines?: Racines
  /** Limiter la détection à ces navigateurs (tous par défaut). */
  navigateurs?: readonly NavigateurSource[]
  plateforme?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  /** Dossier personnel (par défaut : celui de l'utilisateur). */
  maison?: string
}

/** `LYRA_IMPORT_RACINE`, uniquement si `LYRA_TEST=1`. */
export function racineImportDeTest(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.LYRA_TEST === '1' && env.LYRA_IMPORT_RACINE ? env.LYRA_IMPORT_RACINE : undefined
}

/** Dossiers « User Data » des navigateurs Chromium (et, plus tard, des autres) selon la plateforme. */
export function racinesParDefaut(plateforme: NodeJS.Platform, env: NodeJS.ProcessEnv, maison: string): Racines {
  if (plateforme === 'win32') {
    const local = env.LOCALAPPDATA ?? join(maison, 'AppData', 'Local')
    return {
      chrome: join(local, 'Google', 'Chrome', 'User Data'),
      edge: join(local, 'Microsoft', 'Edge', 'User Data'),
      brave: join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
      vivaldi: join(local, 'Vivaldi', 'User Data')
    }
  }
  if (plateforme === 'darwin') {
    const support = join(maison, 'Library', 'Application Support')
    return {
      chrome: join(support, 'Google', 'Chrome'),
      edge: join(support, 'Microsoft Edge'),
      brave: join(support, 'BraveSoftware', 'Brave-Browser'),
      vivaldi: join(support, 'Vivaldi')
    }
  }
  const config = env.XDG_CONFIG_HOME ?? join(maison, '.config')
  return {
    chrome: join(config, 'google-chrome'),
    edge: join(config, 'microsoft-edge'),
    brave: join(config, 'BraveSoftware', 'Brave-Browser'),
    vivaldi: join(config, 'vivaldi')
  }
}

const estDossier = (chemin: string): boolean => {
  try {
    return lstatSync(chemin).isDirectory()
  } catch {
    return false
  }
}

function lireJson(chemin: string): unknown {
  try {
    return JSON.parse(readFileSync(chemin, 'utf8').replace(/^﻿/, ''))
  } catch {
    return undefined
  }
}

const objet = (v: unknown): Record<string, unknown> | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)
const texte = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Verrou de profil de Chromium : `lockfile` (Windows, supprimé à la fermeture), `SingletonLock` (macOS, Linux : lien). */
function navigateurOuvert(racine: string): boolean {
  if (existsSync(join(racine, 'lockfile'))) return true
  try {
    lstatSync(join(racine, 'SingletonLock')) // lien symbolique parfois « cassé » : existsSync mentirait
    return true
  } catch {
    return false
  }
}

const NOM_PROFIL = /^(Default|Profile \d+)$/

/**
 * Nom de dossier de profil sûr : enfant direct de la racine. Les clés de `info_cache` viennent d'un fichier qui peut
 * avoir été copié d'ailleurs ; ni `.` ni `..`, ni séparateur, ni lettre de lecteur (`C:`), ni chemin absolu, ni octet nul.
 */
export function nomDeProfilSur(nom: string, racine: string): boolean {
  if (nom === '' || nom === '.' || nom === '..' || /[\\/:\0]/.test(nom)) return false
  return dirname(resolve(racine, nom)) === resolve(racine)
}

/** Ordre stable : Default d'abord, puis Profile 1, 2, 10… */
const ordreProfils = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true })

async function profilsChromium(navigateur: NavigateurSource, racine: string): Promise<ProfilDetecte[]> {
  if (!estDossier(racine)) return []
  const localState = objet(lireJson(join(racine, 'Local State')))
  const profile = objet(localState?.profile)
  const cache = objet(profile?.info_cache)
  const dernier = texte(profile?.last_used) ?? 'Default'

  let dossiers = Object.keys(cache ?? {}).filter((d) => nomDeProfilSur(d, racine) && estDossier(join(racine, d)))
  if (dossiers.length === 0) {
    // Pas de Local State exploitable : repli sur les dossiers connus.
    dossiers = (await readdir(racine, { withFileTypes: true }).catch(() => []))
      .filter((e) => e.isDirectory() && NOM_PROFIL.test(e.name))
      .map((e) => e.name)
  }
  dossiers.sort(ordreProfils)

  const ouvert = navigateurOuvert(racine)
  const defaut = dossiers.includes(dernier) ? dernier : dossiers[0]
  return dossiers.map((d) => {
    const info = objet(cache?.[d])
    return {
      navigateur,
      nom: texte(info?.name) ?? texte(info?.gaia_name) ?? texte(info?.user_name) ?? d,
      chemin: join(racine, d),
      racine,
      parDefaut: d === defaut,
      ouvert
    }
  })
}

type Detecteur = (navigateur: NavigateurSource, racine: string) => Promise<ProfilDetecte[]>

/** Un détecteur par navigateur ; Firefox, Safari et Orion arrivent avec la Task 2. */
const DETECTEURS: Partial<Record<NavigateurSource, Detecteur>> = Object.fromEntries(NAVIGATEURS_CHROMIUM.map((n) => [n, profilsChromium]))

/** Profils installés (tous navigateurs pris en charge) ; liste vide si rien n'est installé. Ne lève jamais. */
export async function detecterProfils(opts: OptionsDetection = {}): Promise<ProfilDetecte[]> {
  const env = opts.env ?? process.env
  const racineTest = racineImportDeTest(env)
  const racines: Racines = {
    ...(racineTest
      ? Object.fromEntries((Object.keys(NOMS_NAVIGATEURS) as NavigateurSource[]).map((n) => [n, join(racineTest, n)]))
      : racinesParDefaut(opts.plateforme ?? process.platform, env, opts.maison ?? homedir())),
    ...opts.racines
  }
  const profils: ProfilDetecte[] = []
  for (const navigateur of opts.navigateurs ?? (Object.keys(NOMS_NAVIGATEURS) as NavigateurSource[])) {
    const racine = racines[navigateur]
    const detecter = DETECTEURS[navigateur]
    if (!racine || !detecter) continue
    try {
      profils.push(...(await detecter(navigateur, racine)))
    } catch {
      // un navigateur illisible n'empêche pas de lister les autres
    }
  }
  return profils
}
