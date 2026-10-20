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

/** Délai (ms) pendant lequel un clic molette récent explique l'ouverture d'un lien en arrière-plan. */
export const DELAI_CLIC_MOLETTE_MS = 1500

/**
 * Le lien vient-il d'un clic molette ? Chromium ouvre alors le lien avec la disposition `background-tab` (comme ⌘ / Ctrl + clic) :
 * Electron appelle donc déjà `setWindowOpenHandler`, et l'étoile s'ouvre sans écouteur `auxclick` dans la page. Seul un clic
 * molette (bouton du milieu vu par `input-event`) dans le délai se distingue de ⌘ / Ctrl + clic, qui ne dépend pas de ce réglage.
 */
export function ouvertureParClicMolette(o: { disposition: string; dernierClicMolette: number; maintenant: number }): boolean {
  const ecart = o.maintenant - o.dernierClicMolette
  return o.disposition === 'background-tab' && ecart >= 0 && ecart <= DELAI_CLIC_MOLETTE_MS
}

/** Lien à refuser : ouvert par un clic molette alors que `gestes.clicMolette` est coupé (le clic ne fait alors rien). */
export function clicMoletteRefuse(o: { disposition: string; dernierClicMolette: number; maintenant: number; clicMolette: boolean }): boolean {
  return !o.clicMolette && ouvertureParClicMolette(o)
}
