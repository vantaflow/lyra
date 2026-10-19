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
/** Épaisseur du rail du ciel masqué (poignée dessinée par la vue chrome). */
export const RAIL = 14
/** Hauteur de la capsule de navigation (dessinée par la vue chrome au-dessus de la page). */
export const CAPSULE = 46

/**
 * `revele` : le ciel masqué est glissé par-dessus la page (révélation au survol). Seule la vue chrome change :
 * elle s'élargit à la largeur du ciel (rail compris) ; la page garde ses bounds de ciel masqué.
 */
export function computeLayout(
  taille: { width: number; height: number },
  ciel: CielLayout,
  pleinEcran: boolean,
  revele = false
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
  if (ciel.position === 'gauche') {
    // Le chrome couvre toute la fenêtre (ciel ou rail à gauche, capsule au-dessus de la page, qui se pose par-dessus).
    // Révélé, il se réduit à la largeur du ciel (rail compris) et passe au-dessus de la page.
    const haut = Math.min(height, CAPSULE)
    chrome = revele && ciel.masque ? { x: 0, y: 0, width: Math.min(width, ciel.largeur + RAIL), height } : fenetre
    page = { x: epaisseur, y: haut, width: reste, height: height - haut }
  } else if (horizontal) {
    chrome = { x: 0, y: debut ? 0 : reste, width, height: epaisseur }
    page = { x: 0, y: debut ? epaisseur : 0, width, height: reste }
  } else {
    chrome = { x: debut ? 0 : reste, y: 0, width: epaisseur, height }
    page = { x: debut ? epaisseur : 0, y: 0, width: reste, height }
  }
  if (revele && ciel.masque && ciel.position !== 'gauche') {
    // Mêmes bords que le rail, mais à l'épaisseur du ciel : il recouvre la page.
    if (horizontal) {
      const h = Math.min(height, BANDE + RAIL)
      chrome = { x: 0, y: debut ? 0 : height - h, width, height: h }
    } else {
      const w = Math.min(width, ciel.largeur + RAIL)
      chrome = { x: debut ? 0 : width - w, y: 0, width: w, height }
    }
  }
  return { chrome, page, overlay: fenetre }
}
