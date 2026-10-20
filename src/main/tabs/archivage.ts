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
    for (const f of d.fenetres()) n += archiverFenetre(f.tabs, { prive: f.privee, jours, maintenant, historique })
    return n
  }
  verifier()
  const minuteur = setInterval(verifier, d.intervalleMs ?? INTERVALLE_ARCHIVAGE_MS)
  minuteur.unref()
  return { verifier, arreter: () => clearInterval(minuteur) }
}
