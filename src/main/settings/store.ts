import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Codes d'un fichier tenu un instant par un autre processus (Windows). */
const VERROUS = new Set(['EPERM', 'EBUSY', 'EACCES'])
const ESSAIS_RENOMMAGE = 4
/** Pause synchrone courte (l'écriture des réglages est synchrone). */
const attendre = (ms: number): void => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

const CLES_INTERDITES = new Set(['__proto__', 'constructor', 'prototype'])

export function fusion<T>(base: T, patch: unknown): T {
  if (!estObjet(base) || !estObjet(patch)) return (patch === undefined ? base : patch) as T
  const sortie: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && !CLES_INTERDITES.has(k)) sortie[k] = fusion(base[k], v)
  }
  return sortie as T
}

/** Stockage JSON : lecture tolérante, écriture atomique (.tmp + rename). */
export class JsonStore<T extends object> {
  private valeur: T
  private ecouteurs = new Set<(v: T) => void>()

  constructor(
    private chemin: string,
    private defauts: T,
    private migrer?: (brut: unknown) => T
  ) {
    this.valeur = this.lire()
  }

  get(): T {
    return this.valeur
  }

  set(patch: Partial<T>): T {
    this.valeur = fusion(this.valeur, patch)
    this.ecrire()
    for (const cb of this.ecouteurs) cb(this.valeur)
    return this.valeur
  }

  /** Remplace la valeur entière (seul moyen de supprimer une clé : `fusion` n'en retire jamais). */
  remplacer(fn: (v: T) => T): T {
    this.valeur = fn(this.valeur)
    this.ecrire()
    for (const cb of this.ecouteurs) cb(this.valeur)
    return this.valeur
  }

  onChange(cb: (v: T) => void): () => void {
    this.ecouteurs.add(cb)
    return () => this.ecouteurs.delete(cb)
  }

  private lire(): T {
    try {
      return this.lireFichier(this.chemin)
    } catch (e) {
      // Fichier présent mais illisible (écriture directe interrompue) : la copie de sauvegarde prise juste avant.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        try {
          const v = this.lireFichier(`${this.chemin}.bak`)
          console.warn(`[réglages] ${this.chemin} illisible, copie de sauvegarde relue :`, e)
          return v
        } catch {
          // Pas de copie lisible : valeurs par défaut.
        }
      }
      return this.defauts
    }
  }

  private lireFichier(chemin: string): T {
    // Un fichier réenregistré par le Bloc-notes de Windows commence par un BOM : JSON.parse le refuserait.
    const brut: unknown = JSON.parse(readFileSync(chemin, 'utf8').replace(/^\uFEFF/, ''))
    if (this.migrer) return this.migrer(brut)
    return fusion(this.defauts, brut)
  }

  /**
   * Écriture atomique (.tmp puis renommage). Sous Windows, un antivirus ou l'indexeur qui ouvre le fichier un instant
   * fait échouer le renommage (EPERM, EBUSY, EACCES) : on réessaie, puis on écrit directement (après une copie .bak). Si rien ne passe, la
   * valeur reste appliquée en mémoire (les écouteurs sont prévenus) et l'erreur part au journal.
   */
  private ecrire(): void {
    const tmp = `${this.chemin}.tmp`
    const contenu = JSON.stringify(this.valeur, null, 2)
    try {
      mkdirSync(dirname(this.chemin), { recursive: true })
      writeFileSync(tmp, contenu)
      for (let essai = 0; ; essai++) {
        try {
          renameSync(tmp, this.chemin)
          return
        } catch (e) {
          if (!VERROUS.has((e as NodeJS.ErrnoException).code ?? '') || essai >= ESSAIS_RENOMMAGE) throw e
          attendre(15 * (essai + 1))
        }
      }
    } catch (e) {
      rmSync(tmp, { force: true })
      try {
        // Écriture directe, non atomique : copie de l'ancien fichier d'abord, relue si l'écriture est interrompue.
        if (existsSync(this.chemin)) copyFileSync(this.chemin, `${this.chemin}.bak`)
        writeFileSync(this.chemin, contenu)
        console.warn(`[réglages] renommage impossible, écriture directe de ${this.chemin} :`, e)
      } catch (e2) {
        console.warn(`[réglages] ${this.chemin} non écrit (valeur gardée en mémoire) :`, e2)
      }
    }
  }
}
