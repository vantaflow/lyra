/**
 * Route de la page de réglages vers les règles d'un site (menu ⋯, panneau des Boucliers, palette).
 * Pur : la même construction sert le main et les vues, pour que les trois entrées ouvrent exactement la même adresse.
 */

/** Origine (« https://hôte[:port] ») d'une page http(s) ; null pour tout le reste (lyra://, chrome-extension://, file:, about:, data:…). */
export function origineDeRegles(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

/** `lyra://settings#/sites/<origine encodée>` (avec `/style` : focus sur « Style personnalisé »), ou null si la page n'est pas un site http(s). */
export function routeReglesSite(url: string, sous?: 'style'): string | null {
  const origine = origineDeRegles(url)
  return origine === null ? null : `lyra://settings#/sites/${encodeURIComponent(origine)}${sous === 'style' ? '/style' : ''}`
}
