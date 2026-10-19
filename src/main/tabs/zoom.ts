/** Niveaux de zoom proposés par ⌘ + / ⌘ − (facteurs, comme Chromium), de 25 % à 500 %. */
export const PALIERS_ZOOM = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

/** Palier suivant (delta = 1) ou précédent (-1) ; reste dans les bornes. */
export function palierSuivant(facteur: number, delta: 1 | -1): number {
  if (delta > 0) return PALIERS_ZOOM.find((p) => p > facteur + 0.001) ?? PALIERS_ZOOM[PALIERS_ZOOM.length - 1]
  return [...PALIERS_ZOOM].reverse().find((p) => p < facteur - 0.001) ?? PALIERS_ZOOM[0]
}

/** Zoom « normal » : rien à mémoriser ni à afficher. */
export const estZoomNormal = (f: number): boolean => Math.abs(f - 1) < 0.001
