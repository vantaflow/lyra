import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SkyState } from '../../shared/types'

export interface EntreeNav {
  url: string
  title: string
  pageState?: string
}

export interface HistoriqueEtoile {
  entries: EntreeNav[]
  index: number
}

export interface FenetreSession {
  ciel: SkyState
  entrees: Record<string, HistoriqueEtoile>
}

export interface EtatSession {
  version: 1
  fenetres: FenetreSession[]
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function entreeValide(e: unknown): e is EntreeNav {
  return estObjet(e) && typeof e.url === 'string' && typeof e.title === 'string' && (e.pageState === undefined || typeof e.pageState === 'string')
}

function historiqueValide(h: unknown): h is HistoriqueEtoile {
  return (
    estObjet(h) &&
    Array.isArray(h.entries) &&
    h.entries.length > 0 &&
    h.entries.every(entreeValide) &&
    Number.isInteger(h.index) &&
    (h.index as number) >= 0 &&
    (h.index as number) < h.entries.length
  )
}

function cielValide(c: unknown): c is SkyState {
  return (
    estObjet(c) &&
    Array.isArray(c.stars) &&
    c.stars.length > 0 &&
    c.stars.every((s) => estObjet(s) && typeof s.id === 'string' && typeof s.url === 'string') &&
    Array.isArray(c.constellations) &&
    (c.activeId === null || typeof c.activeId === 'string')
  )
}

/** Valide un contenu brut ; null si inexploitable. Les historiques invalides sont écartés un à un. */
function valider(brut: unknown): EtatSession | null {
  if (!estObjet(brut) || brut.version !== 1 || !Array.isArray(brut.fenetres)) return null
  const fenetres: FenetreSession[] = []
  for (const f of brut.fenetres) {
    if (!estObjet(f) || !cielValide(f.ciel)) continue
    const entrees: Record<string, HistoriqueEtoile> = {}
    if (estObjet(f.entrees)) {
      for (const [id, h] of Object.entries(f.entrees)) if (historiqueValide(h)) entrees[id] = h
    }
    fenetres.push({ ciel: f.ciel, entrees })
  }
  return fenetres.length > 0 ? { version: 1, fenetres } : null
}

/** userData/session.json : écriture atomique différée (debounce), lecture tolérante. Pur Node. */
export class SessionStore {
  private enAttente: EtatSession | undefined
  private minuteur: NodeJS.Timeout | undefined

  constructor(
    private chemin: string,
    private delaiMs = 2000
  ) {}

  charger(): EtatSession | null {
    try {
      return valider(JSON.parse(readFileSync(this.chemin, 'utf8')))
    } catch {
      return null
    }
  }

  sauvegarder(etat: EtatSession): void {
    this.enAttente = etat
    if (this.minuteur) return
    this.minuteur = setTimeout(() => this.vider(), this.delaiMs)
    this.minuteur.unref()
  }

  /** Écrit tout de suite l'état en attente (fermeture de l'application). */
  vider(): void {
    clearTimeout(this.minuteur)
    this.minuteur = undefined
    const etat = this.enAttente
    this.enAttente = undefined
    if (!etat) return
    const tmp = `${this.chemin}.tmp`
    try {
      mkdirSync(dirname(this.chemin), { recursive: true })
      writeFileSync(tmp, JSON.stringify(etat))
      renameSync(tmp, this.chemin)
    } catch {
      rmSync(tmp, { force: true })
    }
  }
}
