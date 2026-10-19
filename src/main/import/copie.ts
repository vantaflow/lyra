/**
 * Lecture sans toucher au profil source : chaque fichier lu est d'abord copié (avec ses `-wal` / `-journal` s'ils
 * existent) dans un dossier temporaire unique, la copie est lue, puis le dossier est supprimé dans un `finally`.
 * Rien n'est jamais écrit dans le dossier du navigateur d'origine, et un navigateur ouvert (fichier verrouillé en
 * écriture mais lisible) ne gêne pas.
 *
 * Garde-fous :
 * - taille : `stat` avant toute copie. Au-delà de `TAILLE_MAX_FICHIER` (JSON, sessions) ou `TAILLE_MAX_BASE` (SQLite),
 *   on refuse avec un message lisible plutôt que de saturer la mémoire (une base est lue entièrement en mémoire, plus
 *   sa copie dans le dossier temporaire) ;
 * - nettoyage : la suppression du dossier temporaire ne remplace jamais le résultat ni l'erreur d'origine (sous
 *   Windows, antivirus et indexeur peuvent la faire échouer) ; `balayerOrphelins()` rattrape les restes d'un arrêt brutal.
 *
 * Aucune dépendance à Electron : ce module tourne tel quel dans un `utilityProcess` ou un `worker_threads`.
 */
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { ErreurImport } from './types'
import type { CodeErreurImport } from './types'

/** Plus gros fichier non SQLite lu (Bookmarks, Preferences, session, manifestes) : 64 Mio. */
export const TAILLE_MAX_FICHIER = 64 * 1024 * 1024
/**
 * Plus grosse base SQLite lue : 1 Gio. Elle est chargée entièrement en mémoire (≈ sa taille, le double avec un
 * `-wal`) et copiée dans le dossier temporaire ; Node refuse de toute façon de lire plus de 2 Gio d'un coup.
 */
export const TAILLE_MAX_BASE = 1024 * 1024 * 1024

/** Préfixe des dossiers temporaires de l'import (suivi des 6 caractères aléatoires de `mkdtemp`). */
export const PREFIXE_TEMP = 'lyra-import-'
const DOSSIER_TEMP = /^lyra-import-[A-Za-z0-9]{6}$/

export interface OptionsCopie {
  /** Nom affiché du navigateur source, pour les messages (« Fermez Chrome puis réessayez »). */
  navigateur?: string
  /** Dossier dans lequel créer le dossier temporaire (par défaut : celui du système). Utile aux tests. */
  dossierTemp?: string
  plateforme?: NodeJS.Platform
  /** Remplacent `TAILLE_MAX_FICHIER` / `TAILLE_MAX_BASE` (tests). */
  tailleMaxFichier?: number
  tailleMaxBase?: number
}

/** Précisions pour un fichier copié. */
export interface OptionsFichier {
  /** Base SQLite (limite `TAILLE_MAX_BASE`) plutôt que fichier ordinaire. */
  base?: boolean
  /** Sujet des messages : « L'historique », « La base des moteurs de recherche »… (par défaut : « Le fichier X »). */
  sujet?: string
}

/** Copies d'une base : le fichier, et ses fichiers annexes si le navigateur en avait. */
export interface FichiersCopies {
  fichier: string
  wal?: string
  journal?: string
}

const mo = (octets: number): number => Math.max(1, Math.round(octets / (1024 * 1024)))

/** Message pour l'utilisateur correspondant à une erreur du système de fichiers. */
export function raisonErreurFichier(err: unknown, nomFichier: string, navigateur = 'le navigateur', plateforme: NodeJS.Platform = process.platform): string {
  const code = (err as NodeJS.ErrnoException | null)?.code
  if (code === 'ENOENT' || code === 'ENOTDIR') return `Fichier introuvable : ${nomFichier}.`
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
    return plateforme === 'win32'
      ? `${nomFichier} est verrouillé : fermez ${navigateur} puis réessayez.`
      : `Accès refusé à ${nomFichier} : autorisez l'accès aux fichiers de ${navigateur}, ou fermez-le, puis réessayez.`
  }
  if (code === 'ENOSPC' || code === 'EDQUOT') return `Espace disque insuffisant pour copier ${nomFichier} : libérez de la place puis réessayez.`
  if (code === 'ERR_FS_FILE_TOO_LARGE') return `${nomFichier} est trop volumineux pour être lu.`
  if (code === 'ENOMEM') return `Mémoire insuffisante pour lire ${nomFichier}.`
  return `Lecture impossible (${nomFichier}) : ${code ?? (err instanceof Error ? err.message : String(err))}.`
}

/** Nature de l'erreur (verrouillé, absent, disque plein, trop gros), `undefined` pour les autres. */
export function codeErreurFichier(err: unknown): CodeErreurImport | undefined {
  const code = (err as NodeJS.ErrnoException | null)?.code
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'absent'
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') return 'verrouille'
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'disque-plein'
  if (code === 'ERR_FS_FILE_TOO_LARGE') return 'volumineux'
  if (code === 'ENOMEM') return 'memoire'
  return undefined
}

/** Suppression qui n'échoue jamais : les erreurs sont avalées (le balayage des orphelins reprendra les restes). */
async function supprimer(chemin: string): Promise<void> {
  try {
    await rm(chemin, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch {
    // EBUSY/EPERM (antivirus, indexeur) : jamais au détriment du résultat de la lecture
  }
}

/** Dossier temporaire de l'import : les copies y vivent, le tout est supprimé par `avecCopieur`. */
export class Copieur {
  private n = 0
  constructor(
    readonly dossier: string,
    private opts: OptionsCopie = {}
  ) {}

  private erreur(err: unknown, nom: string): ErreurImport {
    return new ErreurImport(raisonErreurFichier(err, nom, this.opts.navigateur, this.opts.plateforme), { cause: err, code: codeErreurFichier(err) })
  }

  /** Vérifie la taille d'un fichier avant de le copier ; lève une `ErreurImport` lisible si elle dépasse la limite. */
  private async verifierTaille(source: string, nom: string, opts: OptionsFichier): Promise<void> {
    const max = opts.base ? (this.opts.tailleMaxBase ?? TAILLE_MAX_BASE) : (this.opts.tailleMaxFichier ?? TAILLE_MAX_FICHIER)
    let taille: number
    try {
      taille = (await stat(source)).size
    } catch (e) {
      throw this.erreur(e, nom)
    }
    if (taille > max) {
      const nomNavigateur = this.opts.navigateur ?? 'le navigateur'
      throw new ErreurImport(
        `${opts.sujet ?? `Le fichier ${nom}`} est trop volumineux (${mo(taille)} Mo, maximum ${mo(max)} Mo) : réduisez-le dans ${nomNavigateur} puis réessayez.`,
        { code: 'volumineux' }
      )
    }
  }

  /**
   * Copie `source` et, si présents, `source-wal` et `source-journal`. Les annexes illisibles sont ignorées
   * (la base seule reste cohérente) ; la copie du fichier principal échoue avec une `ErreurImport` lisible.
   * Taille contrôlée avant la copie (fichier et `-wal`).
   */
  async copier(source: string, opts: OptionsFichier = {}): Promise<FichiersCopies> {
    const nom = basename(source)
    await this.verifierTaille(source, nom, opts)
    const dossier = join(this.dossier, String(this.n++))
    await mkdir(dossier, { recursive: true })
    const fichier = join(dossier, nom)
    try {
      await copyFile(source, fichier)
    } catch (e) {
      throw this.erreur(e, nom)
    }
    const copies: FichiersCopies = { fichier }
    for (const [cle, suffixe] of [['wal', '-wal'], ['journal', '-journal']] as const) {
      if (!existsSync(source + suffixe)) continue // cas normal : pas d'annexe
      if (cle === 'wal') await this.verifierTaille(source + suffixe, nom + suffixe, { ...opts, sujet: `Le journal ${nom}${suffixe}` })
      try {
        await copyFile(source + suffixe, fichier + suffixe)
        copies[cle] = fichier + suffixe
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOSPC') throw this.erreur(e, nom + suffixe) // disque plein : inutile d'insister
        // verrouillé : on lit la base sans cette annexe
      }
    }
    return copies
  }

  /** Copie puis lit un fichier entier (limite `TAILLE_MAX_FICHIER`). */
  async lire(source: string, opts: Omit<OptionsFichier, 'base'> = {}): Promise<Buffer> {
    const { fichier } = await this.copier(source, opts)
    try {
      return await readFile(fichier)
    } catch (e) {
      throw this.erreur(e, basename(source))
    }
  }

  /** Supprime une copie dès qu'elle a été lue (une base d'historique peut peser des centaines de Mo). Ne lève jamais. */
  async liberer(copies: FichiersCopies): Promise<void> {
    await supprimer(dirname(copies.fichier))
  }
}

/**
 * Exécute `fn` avec un dossier temporaire unique, supprimé quoi qu'il arrive (succès, erreur, exception).
 * Un échec de suppression ne remplace ni le résultat ni l'erreur d'origine.
 */
export async function avecCopieur<T>(fn: (copieur: Copieur) => Promise<T>, opts: OptionsCopie = {}): Promise<T> {
  const dossier = await mkdtemp(join(opts.dossierTemp ?? tmpdir(), PREFIXE_TEMP))
  try {
    return await fn(new Copieur(dossier, opts))
  } finally {
    await supprimer(dossier)
  }
}

export interface OptionsBalayage {
  /** Dossier à balayer (par défaut : le dossier temporaire du système). */
  dossierTemp?: string
  /** Âge minimal, en ms, d'un dossier pour être supprimé (une heure par défaut). */
  ageMaxMs?: number
  /** « Maintenant » (ms), pour les tests. */
  maintenant?: number
}

/**
 * Supprime les dossiers `lyra-import-XXXXXX` de plus d'une heure laissés par un arrêt brutal ou une suppression
 * refusée (ils contiennent des copies de données personnelles). À appeler au démarrage (Task 3). Ne touche que
 * des dossiers (jamais un lien symbolique ni un fichier) au nom exact de ceux de `mkdtemp`. Renvoie le nombre de
 * dossiers supprimés ; ne lève jamais.
 */
export async function balayerOrphelins(opts: OptionsBalayage = {}): Promise<number> {
  const racine = opts.dossierTemp ?? tmpdir()
  const ageMax = opts.ageMaxMs ?? 3_600_000
  const maintenant = opts.maintenant ?? Date.now()
  let supprimes = 0
  try {
    for (const e of await readdir(racine, { withFileTypes: true })) {
      if (!e.isDirectory() || !DOSSIER_TEMP.test(e.name)) continue
      const chemin = join(racine, e.name)
      try {
        if (maintenant - (await stat(chemin)).mtimeMs <= ageMax) continue
      } catch {
        continue
      }
      await supprimer(chemin)
      if (!existsSync(chemin)) supprimes++
    }
  } catch {
    // dossier temporaire illisible : rien à balayer
  }
  return supprimes
}
