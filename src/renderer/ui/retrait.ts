/** Retrait du ciel révélé (ciel masqué) : logique pure, sans DOM. */

/** Délai entre le départ de la souris vers la page et le retrait du ciel révélé : le temps de viser un bouton. */
export const DELAI_RETRAIT_MS = 500

export type PositionCiel = 'gauche' | 'droite' | 'haut' | 'bas'

/** Boîte de mise en page du ciel révélé (sans la translation du glissement), en px de la fenêtre. */
export interface Boite {
  x: number
  y: number
  largeur: number
  hauteur: number
}

/**
 * La souris a-t-elle quitté le ciel révélé vers la page ? Seul le côté opposé au bord du rail compte (droite pour un
 * ciel à gauche, gauche pour un ciel à droite, bas pour une bande en haut, haut pour une bande en bas), et le point de
 * sortie doit être dans la fenêtre. Une sortie par le bord de la fenêtre, ou vers une zone non cliente posée sur le
 * ciel (boutons de fenêtre, bord de redimensionnement : le point de sortie reste alors dans le ciel), ne retire rien.
 */
export function sortieVersPage(position: PositionCiel, boite: Boite, point: { x: number; y: number }, fenetre: { largeur: number; hauteur: number }): boolean {
  const { x, y } = point
  if (x < 0 || y < 0 || x >= fenetre.largeur || y >= fenetre.hauteur) return false
  switch (position) {
    case 'gauche':
      return x >= boite.x + boite.largeur - 1
    case 'droite':
      return x < boite.x + 1
    case 'haut':
      return y >= boite.y + boite.hauteur - 1
    case 'bas':
      return y < boite.y + 1
  }
}
