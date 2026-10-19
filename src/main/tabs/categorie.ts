/** Catégorie d'une vue d'étoile : `interne` (lyra://, preload avec window.lyra) ou `web` (preload des Boucliers). */
export type Categorie = 'interne' | 'web'

export const categorieDe = (url: string): Categorie => (/^lyra:/i.test(url.trim()) ? 'interne' : 'web')
