/** Archivage des étoiles éteintes : retirées du ciel, retrouvables dans l'historique. Pur, sans Electron. */
import type { SkyState, Star } from '../../shared/types'
import type { History } from '../history/History'

const JOUR = 86_400_000
export const INTERVALLE_ARCHIVAGE_MS = 3_600_000

/**
 * Étoiles « éteintes » : dormantes depuis plus de `jours` jours. Jamais l'étoile active ni une épinglée ;
 * `null` (ou un seuil nul) = jamais ; une étoile dormante sans date d'inactivité n'est pas éteinte.
 */
export function etoilesEteintes(ciel: SkyState, maintenant: number, jours: number | null): Star[] {
  if (jours === null || !(jours > 0)) return []
  return ciel.stars.filter(
    (s) => s.dormant && !s.pinned && s.id !== ciel.activeId && s.inactifDepuis !== undefined && maintenant - s.inactifDepuis > jours * JOUR
  )
}

/**
 * Ciel lu sur disque, prêt à être restauré : toutes les étoiles dormantes, avec une date d'inactivité fiable. Une session
 * d'avant l'archivage (sans date), une date illisible (texte, NaN, négative) ou dans le futur reçoit la date de restauration ;
 * `auto` (constellation du regroupement par site) n'est gardé que s'il vaut exactement `true`. Pur : l'argument n'est pas modifié.
 */
export function cielRestaure(ciel: SkyState, maintenant: number): SkyState {
  const datee = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= maintenant ? v : maintenant)
  return {
    ...ciel,
    stars: ciel.stars.map((s) => ({ ...s, dormant: true, inactifDepuis: datee(s.inactifDepuis) })),
    constellations: ciel.constellations.map(({ auto, ...c }) => (auto === true ? { ...c, auto: true } : c))
  }
}

/** Ce que l'archivage demande à une fenêtre. */
export interface Archivable {
  ciel(): SkyState
  /** Retire l'étoile du ciel ; faux si elle ne peut pas l'être (devenue active, épinglée, éveillée…). */
  retirer(id: string): boolean
}

export interface OptionsArchivage {
  /** Fenêtre privée : on n'archive jamais (ni retrait, ni écriture). */
  prive: boolean
  jours: number | null
  maintenant: number
  historique: History | undefined
}

/** Archive les étoiles éteintes d'une fenêtre ; renvoie leur nombre. */
export function archiverFenetre(tabs: Archivable, o: OptionsArchivage): number {
  if (o.prive || !o.historique) return 0
  let n = 0
  for (const s of etoilesEteintes(tabs.ciel(), o.maintenant, o.jours)) {
    if (!tabs.retirer(s.id)) continue
    o.historique.garantir({ url: s.url, title: s.title, date: s.inactifDepuis ?? o.maintenant })
    n++
  }
  return n
}

export interface DepsArchivage {
  fenetres(): Array<{ tabs: Archivable; privee: boolean }>
  /** `apparence.archiverApresJours`, lu à chaque vérification. */
  jours(): number | null
  historique(): History | undefined
  /** Horloge injectable (ms) ; `Date.now` par défaut. */
  maintenant?: () => number
  intervalleMs?: number
}

export interface Archiveur {
  /** Vérifie tout de suite ; renvoie le nombre d'étoiles archivées. */
  verifier(): number
  arreter(): void
}

/** Vérifie au démarrage puis chaque heure. */
export function demarrerArchivage(d: DepsArchivage): Archiveur {
  const verifier = (): number => {
    const jours = d.jours()
    if (jours === null) return 0
    const maintenant = (d.maintenant ?? Date.now)()
    const historique = d.historique()
    let n = 0
    for (const f of d.fenetres()) {
      try {
        n += archiverFenetre(f.tabs, { prive: f.privee, jours, maintenant, historique })
      } catch {
        // Une fenêtre en cours de fermeture ne doit ni bloquer les autres ni faire tomber le minuteur (exception non gérée du main).
      }
    }
    return n
  }
  verifier()
  const minuteur = setInterval(verifier, d.intervalleMs ?? INTERVALLE_ARCHIVAGE_MS)
  minuteur.unref()
  return { verifier, arreter: () => clearInterval(minuteur) }
}
