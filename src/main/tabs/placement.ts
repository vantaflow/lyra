/** Où naît une nouvelle étoile, et dans quelle constellation (placement et regroupement par site). Pur, sans Electron. */
import { parse } from 'tldts-experimental'
import type { SkyState } from '../../shared/types'
import { regrouper } from '../../renderer/ui/cielCommun'

export type ModePlacement = 'sous-active' | 'fin-constellation' | 'hors-constellation'

/** Consigne de placement, directement lisible par `TabTree.creer`. */
export interface Placement {
  parentId?: string
  /** Avec la position `apres` : l'étoile dont la racine (et tout le sous-arbre) précède la nouvelle, rangée sans lien. */
  apresId?: string
  constellationId?: string
  position: 'sous-parent' | 'apres' | 'fin' | 'fin-constellation'
}

type Ciel = Pick<SkyState, 'stars' | 'constellations'>

/**
 * « Nouvelle étoile ouverte » :
 * - `sous-active` : juste sous l'étoile active (après elle et ses étoiles reliées), dans sa constellation ; aucun lien tracé :
 *   une étoile reliée est une étoile ouverte *depuis* une page (voir `placerEnfant`) ;
 * - `fin-constellation` : à la fin de la constellation de l'étoile active, sans lien ; sans constellation : fin du ciel ;
 * - `hors-constellation` : fin du ciel, hors de toute constellation.
 * Sans étoile active (ciel vide, active inconnue) : fin du ciel.
 */
export function placerNouvelle(ciel: Ciel, activeId: string | null, mode: ModePlacement): Placement {
  const active = activeId === null ? undefined : ciel.stars.find((s) => s.id === activeId)
  if (!active || mode === 'hors-constellation') return { position: 'fin' }
  const constellationId = active.constellationId && ciel.constellations.some((c) => c.id === active.constellationId) ? active.constellationId : undefined
  if (mode === 'sous-active') return { apresId: active.id, ...(constellationId ? { constellationId } : {}), position: 'apres' }
  return constellationId ? { constellationId, position: 'fin-constellation' } : { position: 'fin' }
}

/** Ordre dans lequel le ciel est affiché (épinglées, étoiles libres, puis chaque constellation) : celui de ⌘ 1-9 et de Ctrl+Tab. */
export function ordreAffichage(ciel: Pick<SkyState, 'stars' | 'constellations'>): string[] {
  const { epinglees, sans, constellations } = regrouper({ ...ciel, activeId: null, pinned: [] })
  return [...epinglees, ...sans, ...constellations.flatMap((g) => g.etoiles)].map((s) => s.id)
}

/** Étoile ouverte depuis une autre (lien, popup) : toujours reliée à elle, dans sa constellation. */
export function placerEnfant(ciel: Ciel, parentId: string): Placement {
  const parent = ciel.stars.find((s) => s.id === parentId)
  if (!parent) return { position: 'fin' }
  const constellationId = parent.constellationId && ciel.constellations.some((c) => c.id === parent.constellationId) ? parent.constellationId : undefined
  return { parentId, ...(constellationId ? { constellationId } : {}), position: 'sous-parent' }
}

/** Domaine enregistrable d'une adresse http(s) (`www.bbc.co.uk` → `bbc.co.uk`) ; rien pour une IP, localhost, lyra://, file://. */
export function domaineEnregistrable(url: string): string | undefined {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return undefined
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
  return parse(u.hostname).domain ?? undefined
}

export type PlanRegroupement = { constellationId: string } | { creer: string }

/**
 * Constellation d'un domaine : celle qui porte déjà son nom (créée par le regroupement, ou nommée ainsi par l'utilisateur :
 * on y entre sans la modifier), sinon une nouvelle constellation automatique. Une constellation automatique que l'utilisateur
 * a renommée ne porte plus le domaine : elle n'est ni réutilisée, ni renommée, ni vidée.
 */
export function planRegroupement(ciel: Pick<SkyState, 'constellations'>, domaine: string): PlanRegroupement {
  const nom = domaine.toLowerCase()
  const c = ciel.constellations.find((x) => x.name.toLowerCase() === nom)
  return c ? { constellationId: c.id } : { creer: domaine }
}
