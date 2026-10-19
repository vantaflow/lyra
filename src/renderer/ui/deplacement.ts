import type { PositionCiel } from './state'

/** Distance (px) à partir de laquelle un appui sur l'en-tête devient un glisser. */
export const SEUIL_GLISSER = 6

/**
 * Bord visé par un point de la fenêtre : la fenêtre est partagée par ses deux diagonales en quatre moitiés
 * (gauche, droite, haut, bas) ; le point tombe dans celle du bord le plus proche.
 */
export function positionDepuisPoint(x: number, y: number, largeur: number, hauteur: number): PositionCiel {
  const u = x / Math.max(1, largeur) - 0.5
  const v = y / Math.max(1, hauteur) - 0.5
  if (Math.abs(u) >= Math.abs(v)) return u < 0 ? 'gauche' : 'droite'
  return v < 0 ? 'haut' : 'bas'
}
