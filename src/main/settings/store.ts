import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { dirname } from 'node:path'

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const CLES_INTERDITES = new Set(['__proto__', 'constructor', 'prototype'])

export function fusion<T>(base: T, patch: unknown): T {
  if (!estObjet(base) || !estObjet(patch)) return (patch === undefined ? base : patch) as T
  const sortie: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && !CLES_INTERDITES.has(k)) sortie[k] = fusion(base[k], v)
  }
  return sortie as T
}

/** Garde `<fichier>.corrompu` avant que la première écriture ne remplace un fichier illisible. */
export function conserverCopieCorrompue(chemin: string): void {
  try {
    copyFileSync(chemin, `${chemin}.corrompu`)
    console.warn(`[reglages] copie du fichier illisible : ${chemin}.corrompu`)
  } catch {
    // Copie impossible : les défauts restent utilisés, rien de plus à faire.
  }
}

/** Stockage JSON : lecture tolérante, écriture atomique (.tmp + rename). */
export class JsonStore<T extends object> {
  private valeur: T
  private ecouteurs = new Set<(v: T) => void>()
  private minuteur: ReturnType<typeof setTimeout> | undefined
  private derniereEcriture = 0

  /** `delaiEcritureMs` : intervalle minimal entre deux écritures disque (0 : chaque changement est écrit tout de suite). */
  constructor(
    private chemin: string,
    private defauts: T,
    private migrer?: (brut: unknown) => T,
    private delaiEcritureMs = 0
  ) {
    this.valeur = this.lire()
  }

  get(): T {
    return this.valeur
  }

  set(patch: Partial<T>): T {
    this.valeur = fusion(this.valeur, patch)
    this.planifierEcriture()
    for (const cb of this.ecouteurs) cb(this.valeur)
    return this.valeur
  }

  /** Remplace la valeur entière (seul moyen de supprimer une clé : `fusion` n'en retire jamais). */
  remplacer(fn: (v: T) => T): T {
    this.valeur = fn(this.valeur)
    this.planifierEcriture()
    for (const cb of this.ecouteurs) cb(this.valeur)
    return this.valeur
  }

  /** Écrit tout de suite une écriture différée en attente (fermeture de l'application). */
  vider(): void {
    if (this.minuteur === undefined) return
    clearTimeout(this.minuteur)
    this.minuteur = undefined
    this.ecrire()
  }

  onChange(cb: (v: T) => void): () => void {
    this.ecouteurs.add(cb)
    return () => this.ecouteurs.delete(cb)
  }

  private lire(): T {
    let texte: string
    try {
      texte = readFileSync(this.chemin, 'utf8')
    } catch {
      return this.defauts
    }
    try {
      const brut: unknown = JSON.parse(texte)
      if (this.migrer) return this.migrer(brut)
      return fusion(this.defauts, brut)
    } catch (e) {
      console.warn(`[reglages] fichier illisible, valeurs par défaut utilisées : ${(e as Error).message}`)
      conserverCopieCorrompue(this.chemin)
      return this.defauts
    }
  }

  /** Premier changement : écrit tout de suite ; dans la fenêtre du délai : une seule écriture différée, avec la dernière valeur. */
  private planifierEcriture(): void {
    const attente = this.derniereEcriture + this.delaiEcritureMs - Date.now()
    if (this.minuteur !== undefined) return
    if (this.delaiEcritureMs <= 0 || attente <= 0) {
      this.ecrire()
      return
    }
    this.minuteur = setTimeout(() => {
      this.minuteur = undefined
      try {
        this.ecrire()
      } catch (e) {
        console.warn(`[reglages] écriture différée impossible : ${(e as Error).message}`)
      }
    }, attente)
    this.minuteur.unref?.()
  }

  private ecrire(): void {
    this.derniereEcriture = Date.now()
    const tmp = `${this.chemin}.tmp`
    try {
      mkdirSync(dirname(this.chemin), { recursive: true })
      writeFileSync(tmp, JSON.stringify(this.valeur, null, 2))
      renameSync(tmp, this.chemin)
    } catch (e) {
      rmSync(tmp, { force: true })
      throw e
    }
  }
}
