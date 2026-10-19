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

/**
 * Rend un ciel lu sur disque cohérent : ids uniques (première occurrence gardée), parents connus et
 * sans cycle, champs normalisés, index séquentiels, constellations connues, étoile active valide. Pur.
 */
export function assainirCiel(ciel: SkyState): SkyState {
  const vus = new Set<string>()
  const stars = ciel.stars
    .filter((s) => !vus.has(s.id) && vus.add(s.id))
    .map((s) => ({ ...s, title: typeof s.title === 'string' ? s.title : '', pinned: s.pinned === true, dormant: s.dormant === true }))
  const constellations = ciel.constellations.filter((c) => estObjet(c) && typeof c.id === 'string')
  const connues = new Set(constellations.map((c) => c.id))
  const parParId = new Map(stars.map((s) => [s.id, s]))
  for (const s of stars) {
    if (s.constellationId !== undefined && !connues.has(s.constellationId)) delete s.constellationId
    if (s.parentId !== undefined && !parParId.has(s.parentId)) delete s.parentId
  }
  for (const s of stars) {
    // Cycle : en remontant les parents on retombe sur l'étoile ; on la rend racine.
    const chaine = new Set([s.id])
    for (let p = s.parentId; p !== undefined; p = parParId.get(p)?.parentId) {
      if (chaine.has(p)) {
        delete s.parentId
        break
      }
      chaine.add(p)
    }
  }
  stars.forEach((s, i) => (s.index = i))
  const activeId = ciel.activeId !== null && parParId.has(ciel.activeId) ? ciel.activeId : (stars[0]?.id ?? null)
  return { stars, constellations, activeId, pinned: stars.filter((s) => s.pinned).map((s) => s.id) }
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
    fenetres.push({ ciel: assainirCiel(f.ciel), entrees })
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
