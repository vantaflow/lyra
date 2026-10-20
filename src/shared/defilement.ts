/**
 * Navigation par débordement (comme Chrome et Edge) : un défilement horizontal ne doit faire reculer ou avancer la page que si
 * rien, entre la cible de la molette et le document, ne peut encore défiler horizontalement dans ce sens. Logique pure : le preload
 * des pages mesure les ancêtres (`getComputedStyle`, `scrollLeft`…) et n'envoie au main qu'un booléen « au bord ».
 */

/** Mesure d'un ancêtre de la cible (ou du document, `racine`), prise au moment de la molette. */
export interface MesureDefilement {
  /** Valeur calculée de `overflow-x`. */
  overflowX: string
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
  /** Écriture de droite à gauche : `scrollLeft` est alors négatif ou nul. */
  rtl?: boolean
  /** Le document : défile même avec `overflow-x: visible` (seuls `hidden` et `clip` l'en empêchent). */
  racine?: boolean
}

/** Marge (pixels) pour les positions fractionnaires de `scrollLeft` (zoom, écrans à échelle non entière). */
const TOLERANCE = 1

const defilable = (o: string, racine: boolean): boolean => o === 'auto' || o === 'scroll' || o === 'overlay' || (racine && o !== 'hidden' && o !== 'clip')

/** Cette zone peut-elle encore défiler horizontalement dans le sens de `dx` (positif : vers la droite) ? */
export function peutDefiler(m: MesureDefilement, dx: number): boolean {
  if (!defilable(m.overflowX, m.racine === true)) return false
  const max = m.scrollWidth - m.clientWidth
  if (!(max > TOLERANCE) || dx === 0) return false
  if (dx > 0) return m.scrollLeft < (m.rtl ? 0 : max) - TOLERANCE
  return m.scrollLeft > (m.rtl ? -max : 0) + TOLERANCE
}

/** Vrai si aucune des zones (de la cible vers le document) ne peut encore défiler dans le sens de `dx` : le geste déborde de la page. */
export const auBord = (zones: readonly MesureDefilement[], dx: number): boolean => !zones.some((z) => peutDefiler(z, dx))
