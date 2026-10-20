/**
 * « Masquer la capsule quand la souris ne bouge plus » : la page est une autre vue, le chrome ne voit pas ses mouvements.
 * Simple signal (10 par seconde au plus), sans aucune donnée de page. L'écouteur reste branché mais ne fait rien tant que
 * l'option est coupée (`actif()` est relu à chaque évènement : aucun branchement/débranchement à suivre).
 */
export interface DepsRelaisSouris {
  /** Réglage `apparence.capsuleAuto`, lu à chaque évènement. */
  actif: () => boolean
  maintenant: () => number
  /** `y` est compté depuis le haut réel de la capsule. */
  envoyer: (y: number) => void
  /** Hauteur de la capsule : la page commence juste dessous, donc `y` de la page + hauteur = `y` depuis le haut de la capsule. */
  hauteurCapsule: number
  /** Fenêtre détruite : rien à envoyer. */
  detruite: () => boolean
}

export function creerRelaisSouris(deps: DepsRelaisSouris): (ev: { type: string; y?: number }) => void {
  let dernier = 0
  return (ev) => {
    if (ev.type !== 'mouseMove' || !deps.actif() || deps.detruite()) return
    const maintenant = deps.maintenant()
    if (maintenant - dernier < 100) return
    dernier = maintenant
    deps.envoyer(deps.hauteurCapsule + (ev.y ?? 0))
  }
}
