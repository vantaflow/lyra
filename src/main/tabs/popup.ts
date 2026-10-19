/** Reconnaissance d'une vraie popup (fenêtre surgissante) parmi les `window.open`. */

/** Features qui ne décrivent pas une fenêtre : ils règlent seulement l'ouverture d'un onglet ordinaire. */
const NEUTRES = new Set(['noopener', 'noreferrer', 'attributionsrc'])

/**
 * Vraie popup : disposition « nouvelle fenêtre » (Chromium), ou features autres que `noopener` / `noreferrer` /
 * `attributionsrc` (largeur, hauteur, position…). `window.open(url, '_blank', 'noopener')` est un lien ordinaire.
 */
export function estVraiePopup(d: { disposition: string; features: string }): boolean {
  if (d.disposition === 'new-window') return true
  return d.features
    .split(',')
    .map((f) => f.trim().split('=')[0].trim().toLowerCase())
    .some((f) => f !== '' && !NEUTRES.has(f))
}
