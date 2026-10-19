import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function fusion<T>(base: T, patch: unknown): T {
  if (!estObjet(base) || !estObjet(patch)) return (patch === undefined ? base : patch) as T
  const sortie: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) sortie[k] = fusion(base[k], v)
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

  onChange(cb: (v: T) => void): () => void {
    this.ecouteurs.add(cb)
    return () => this.ecouteurs.delete(cb)
  }

  private lire(): T {
    try {
      const brut: unknown = JSON.parse(readFileSync(this.chemin, 'utf8'))
      if (this.migrer) return this.migrer(brut)
      return fusion(this.defauts, brut)
    } catch {
      return this.defauts
    }
  }

  private ecrire(): void {
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
