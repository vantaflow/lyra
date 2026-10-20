import type { Constellation, Settings, SkyState, Star } from '../../shared/types'

/** Racines d'un groupe : étoiles dont le parent n'est pas dans le groupe. */
export function racines(groupe: Star[]): Star[] {
  const ids = new Set(groupe.map((s) => s.id))
  return groupe.filter((s) => !s.parentId || !ids.has(s.parentId))
}

export interface GroupesCiel {
  epinglees: Star[]
  /** Étoiles ouvertes hors de toute constellation. */
  sans: Star[]
  /** Constellations non vides, avec leurs étoiles ouvertes. */
  constellations: Array<{ constellation: Constellation; etoiles: Star[] }>
}

/** Regroupement du ciel, commun à la colonne et à la bande : épinglées, étoiles libres, constellations. */
export function regrouper(sky: SkyState): GroupesCiel {
  const ouvertes = sky.stars.filter((s) => !s.pinned)
  const connues = new Set(sky.constellations.map((c) => c.id))
  return {
    epinglees: sky.stars.filter((s) => s.pinned),
    sans: ouvertes.filter((s) => !s.constellationId || !connues.has(s.constellationId)),
    constellations: sky.constellations
      .map((constellation) => ({ constellation, etoiles: ouvertes.filter((s) => s.constellationId === constellation.id) }))
      .filter((g) => g.etoiles.length > 0)
  }
}

/** Écrit un morceau des réglages du ciel (le main valide et diffuse). */
export const reglerCiel = (ciel: Partial<Settings['ciel']>): Promise<Settings> =>
  window.lyra.invoke('settings:set', { ciel } as unknown as Partial<Settings>)
