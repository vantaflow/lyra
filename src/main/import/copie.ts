/**
 * Lecture sans toucher au profil source : chaque fichier lu est d'abord copié (avec ses `-wal` / `-journal` s'ils
 * existent) dans un dossier temporaire unique, la copie est lue, puis le dossier est supprimé dans un `finally`.
 * Rien n'est jamais écrit dans le dossier du navigateur d'origine, et un navigateur ouvert (fichier verrouillé en
 * écriture mais lisible) ne gêne pas.
 */
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { ErreurImport } from './types'
import type { CodeErreurImport } from './types'

export interface OptionsCopie {
  /** Nom affiché du navigateur source, pour les messages (« Fermez Chrome puis réessayez »). */
  navigateur?: string
  /** Dossier dans lequel créer le dossier temporaire (par défaut : celui du système). Utile aux tests. */
  dossierTemp?: string
  plateforme?: NodeJS.Platform
}

/** Copies d'une base : le fichier, et ses fichiers annexes si le navigateur en avait. */
export interface FichiersCopies {
  fichier: string
  wal?: string
  journal?: string
}

/** Message pour l'utilisateur correspondant à une erreur du système de fichiers. */
export function raisonErreurFichier(err: unknown, nomFichier: string, navigateur = 'le navigateur', plateforme: NodeJS.Platform = process.platform): string {
  const code = (err as NodeJS.ErrnoException | null)?.code
  if (code === 'ENOENT' || code === 'ENOTDIR') return `Fichier introuvable : ${nomFichier}.`
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
    return plateforme === 'win32'
      ? `${nomFichier} est verrouillé : fermez ${navigateur} puis réessayez.`
      : `Accès refusé à ${nomFichier} : autorisez l'accès aux fichiers de ${navigateur}, ou fermez-le, puis réessayez.`
  }
  return `Lecture impossible (${nomFichier}) : ${code ?? (err instanceof Error ? err.message : String(err))}.`
}

/** Nature de l'erreur (fichier verrouillé par le navigateur ouvert, ou absent), `undefined` pour les autres. */
export function codeErreurFichier(err: unknown): CodeErreurImport | undefined {
  const code = (err as NodeJS.ErrnoException | null)?.code
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'absent'
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') return 'verrouille'
  return undefined
}

/** Dossier temporaire de l'import : les copies y vivent, le tout est supprimé par `avecCopieur`. */
export class Copieur {
  private n = 0
  constructor(
    readonly dossier: string,
    private opts: OptionsCopie = {}
  ) {}

  /**
   * Copie `source` et, si présents, `source-wal` et `source-journal`. Les annexes illisibles sont ignorées
   * (la base seule reste cohérente) ; la copie du fichier principal échoue avec une `ErreurImport` lisible.
   */
  async copier(source: string): Promise<FichiersCopies> {
    const dossier = join(this.dossier, String(this.n++))
    await mkdir(dossier, { recursive: true })
    const nom = basename(source)
    const fichier = join(dossier, nom)
    try {
      await copyFile(source, fichier)
    } catch (e) {
      throw new ErreurImport(raisonErreurFichier(e, nom, this.opts.navigateur, this.opts.plateforme), { cause: e, code: codeErreurFichier(e) })
    }
    const copies: FichiersCopies = { fichier }
    for (const [cle, suffixe] of [['wal', '-wal'], ['journal', '-journal']] as const) {
      try {
        await copyFile(source + suffixe, fichier + suffixe)
        copies[cle] = fichier + suffixe
      } catch {
        // absent (cas normal) ou verrouillé : on lit la base sans cette annexe
      }
    }
    return copies
  }

  /** Copie puis lit un fichier entier. */
  async lire(source: string): Promise<Buffer> {
    const { fichier } = await this.copier(source)
    try {
      return await readFile(fichier)
    } catch (e) {
      throw new ErreurImport(raisonErreurFichier(e, basename(source), this.opts.navigateur, this.opts.plateforme), { cause: e, code: codeErreurFichier(e) })
    }
  }

  /** Supprime une copie dès qu'elle a été lue (une base d'historique peut peser des centaines de Mo). */
  async liberer(copies: FichiersCopies): Promise<void> {
    await rm(dirname(copies.fichier), { recursive: true, force: true })
  }
}

/** Exécute `fn` avec un dossier temporaire unique, supprimé quoi qu'il arrive (succès, erreur, exception). */
export async function avecCopieur<T>(fn: (copieur: Copieur) => Promise<T>, opts: OptionsCopie = {}): Promise<T> {
  const dossier = await mkdtemp(join(opts.dossierTemp ?? tmpdir(), 'lyra-import-'))
  try {
    return await fn(new Copieur(dossier, opts))
  } finally {
    await rm(dossier, { recursive: true, force: true })
  }
}
