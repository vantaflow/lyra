/** Reconnaissance d'une vraie popup (fenêtre surgissante) parmi les `window.open`. */

/** Features qui ne décrivent pas une fenêtre : ils règlent seulement l'ouverture d'un onglet ordinaire. */
const NEUTRES = new Set(['noopener', 'noreferrer', 'attributionsrc'])

/**
 * Vraie popup : features autres que `noopener` / `noreferrer` / `attributionsrc` (largeur, hauteur, position…).
 * `window.open(url, '_blank', 'noopener')` est un lien ordinaire. Une disposition « nouvelle fenêtre » sans aucun
 * feature est un Maj+clic sur un lien (un `window.open` sans features donne un onglet) : lien ordinaire, ouvert en étoile.
 */
export function estVraiePopup(d: { disposition: string; features: string }): boolean {
  return d.features
    .split(',')
    .map((f) => f.trim().split('=')[0].trim().toLowerCase())
    .some((f) => f !== '' && !NEUTRES.has(f))
}
