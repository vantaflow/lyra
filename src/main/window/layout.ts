/** Mise en page pure de la fenêtre (aucune dépendance à Electron). */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface CielLayout {
  position: 'gauche' | 'droite' | 'haut' | 'bas'
  largeur: number
  masque: boolean
}

export interface Layout {
  chrome: Rect
  page: Rect
  overlay: Rect
}

const BANDE = 56
const RAIL = 14

export function computeLayout(
  taille: { width: number; height: number },
  ciel: CielLayout,
  pleinEcran: boolean
): Layout {
  const { width, height } = taille
  const fenetre: Rect = { x: 0, y: 0, width, height }
  if (pleinEcran) return { chrome: { x: 0, y: 0, width: 0, height: 0 }, page: fenetre, overlay: fenetre }

  const horizontal = ciel.position === 'haut' || ciel.position === 'bas'
  const total = horizontal ? height : width
  const epaisseur = Math.min(total, ciel.masque ? RAIL : horizontal ? BANDE : ciel.largeur)
  const reste = total - epaisseur
  const debut = ciel.position === 'gauche' || ciel.position === 'haut'

  let chrome: Rect
  let page: Rect
  if (horizontal) {
    chrome = { x: 0, y: debut ? 0 : reste, width, height: epaisseur }
    page = { x: 0, y: debut ? epaisseur : 0, width, height: reste }
  } else {
    chrome = { x: debut ? 0 : reste, y: 0, width: epaisseur, height }
    page = { x: debut ? epaisseur : 0, y: 0, width: reste, height }
  }
  return { chrome, page, overlay: fenetre }
}
