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

/** Ne pas déranger : la vue chrome ne dessine plus que le rappel (ou le croissant seul), en haut à droite. */
export interface DndLayout {
  /** Rappel complet affiché (sinon : le croissant seul). */
  rappel: boolean
}

/** Zone de la vue chrome en mode Ne pas déranger : rappel complet (pilule + ombre) ou croissant seul. */
export const DND_RAPPEL = { width: 720, height: 100 }
export const DND_CROISSANT = { width: 84, height: 84 }

export interface Layout {
  chrome: Rect
  page: Rect
  overlay: Rect
}

/** Épaisseur de la bande du ciel (en haut ou en bas). */
export const BANDE = 56
/** Épaisseur du rail du ciel masqué (poignée dessinée par la vue chrome). */
export const RAIL = 14
/** Hauteur de la capsule de navigation (dessinée par la vue chrome au-dessus de la page). */
export const CAPSULE = 46

/** Bornes de la largeur du ciel (gauche / droite). */
export const LARGEUR_MIN = 200
export const LARGEUR_MAX = 420

/** Largeur du ciel ramenée dans les bornes. */
export const bornerLargeur = (l: number): number => Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, Math.round(l)))

/** Fenêtre minimale : la colonne la plus large du ciel laisse au moins 480 px à la page ; 400 px de haut. */
export const FENETRE_MIN = { width: LARGEUR_MAX + 480, height: 400 }

/** Position des boutons de fenêtre de macOS (feux tricolores) : centrés sur la bande quand le ciel est en haut. */
export function positionFeux(ciel: Pick<CielLayout, 'position' | 'masque'>): { x: number; y: number } {
  const y = ciel.position === 'haut' && !ciel.masque ? Math.round((BANDE - 12) / 2) : 14
  return { x: 14, y }
}

/**
 * Le chrome couvre toute la fenêtre quelle que soit la position : il dessine le ciel (colonne ou bande, ou rail en
 * masqué) et la capsule, la page se pose par-dessus la zone qui lui est réservée. `revele` (ciel masqué glissé par-dessus
 * la page) ne change donc aucun bounds : seul l'ordre des vues change (chrome au-dessus de la page, zone transparente).
 * En Ne pas déranger (`dnd`), la page est plein cadre et le chrome se réduit à la zone du rappel.
 * La capsule (46 px) reste en haut de la page dans tous les cas ; à gauche, à droite et en bas elle part du haut de la
 * fenêtre, en haut elle se place sous la bande du ciel (ou son rail).
 */
export function computeLayout(
  taille: { width: number; height: number },
  ciel: CielLayout,
  pleinEcran: boolean,
  _revele = false,
  dnd: DndLayout | null = null
): Layout {
  const { width, height } = taille
  const fenetre: Rect = { x: 0, y: 0, width, height }
  if (pleinEcran) return { chrome: { x: 0, y: 0, width: 0, height: 0 }, page: fenetre, overlay: fenetre }
  if (dnd) {
    // Ni ciel ni capsule : la page occupe tout, la vue chrome se réduit au rappel / croissant (haut droite).
    const z = dnd.rappel ? DND_RAPPEL : DND_CROISSANT
    const w = Math.min(width, z.width)
    const h = Math.min(height, z.height)
    return { chrome: { x: width - w, y: 0, width: w, height: h }, page: fenetre, overlay: fenetre }
  }

  const horizontal = ciel.position === 'haut' || ciel.position === 'bas'
  const total = horizontal ? height : width
  const epaisseur = Math.min(total, ciel.masque ? RAIL : horizontal ? BANDE : bornerLargeur(ciel.largeur))
  const reste = total - epaisseur
  const capsule = Math.min(height, CAPSULE)

  let page: Rect
  if (ciel.position === 'gauche') page = { x: epaisseur, y: capsule, width: reste, height: height - capsule }
  else if (ciel.position === 'droite') page = { x: 0, y: capsule, width: reste, height: height - capsule }
  else if (ciel.position === 'haut') {
    const y = Math.min(height, epaisseur + CAPSULE)
    page = { x: 0, y, width, height: height - y }
  } else {
    const h = Math.max(0, reste - capsule)
    page = { x: 0, y: capsule, width, height: h }
  }
  return { chrome: fenetre, page, overlay: fenetre }
}
