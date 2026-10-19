import { BANDE, RAIL, bornerLargeur, type CielLayout } from '../../main/window/layout'

type CielPlace = Pick<CielLayout, 'position' | 'largeur' | 'masque'>

/** Épaisseur du ciel (ou du rail s'il est masqué) sur son bord. */
export function epaisseurCiel(ciel: CielPlace): number {
  if (ciel.masque) return RAIL
  return ciel.position === 'haut' || ciel.position === 'bas' ? BANDE : bornerLargeur(ciel.largeur)
}

/** Marges laissées par le ciel : la carte de permission se centre sous la pilule, dans la zone de la page. */
export function marges(ciel: CielPlace | undefined): { left: string; right: string; top: string } {
  if (!ciel) return { left: '0', right: '0', top: '52px' }
  const e = epaisseurCiel(ciel)
  // La capsule (46 px) est en haut de la page ; en haut, elle se place sous la bande (ou son rail).
  const haut = ciel.position === 'haut' ? e : 0
  return {
    left: ciel.position === 'gauche' ? `${e}px` : '0',
    right: ciel.position === 'droite' ? `${e}px` : '0',
    top: `${haut + 52}px`
  }
}

/** Position d'un panneau (Boucliers, Téléchargements) : collé au pied du ciel ; en bande, sous ou sur ses boutons, à droite. */
export function placement(ciel: Pick<CielLayout, 'position'> | undefined): Record<string, string> {
  switch (ciel?.position) {
    case 'droite':
      return { right: '12px', bottom: '56px' }
    case 'haut':
      return { right: '12px', top: `${BANDE + 8}px` }
    case 'bas':
      return { right: '12px', bottom: `${BANDE + 8}px` }
    default:
      return { left: '12px', bottom: '56px' }
  }
}
