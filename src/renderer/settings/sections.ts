/**
 * Sommaire des réglages. Les sections sans contenu dans cette version (`disponible: false`) n'apparaissent ni dans le
 * sommaire ni dans la recherche ; le jalon D les réactive en passant `disponible` à vrai (ou en retirant le champ).
 */
export interface Section {
  id: string
  titre: string
  /** Faux : section pas encore livrée (masquée du sommaire, message sobre si on l'ouvre par son adresse). */
  disponible: boolean
}

export const SECTIONS: readonly Section[] = [
  { id: 'general', titre: 'Général', disponible: true },
  { id: 'apparence', titre: "Le ciel et l'apparence", disponible: false },
  { id: 'couleurs', titre: 'Couleurs et thèmes', disponible: false },
  { id: 'palette', titre: 'Palette et recherche', disponible: false },
  { id: 'boucliers', titre: 'Boucliers', disponible: false },
  { id: 'sites', titre: 'Règles par site', disponible: false },
  { id: 'extensions', titre: 'Extensions', disponible: true },
  { id: 'confidentialite', titre: 'Confidentialité', disponible: false },
  { id: 'telechargements', titre: 'Téléchargements', disponible: true },
  { id: 'raccourcis', titre: 'Raccourcis clavier', disponible: false },
  { id: 'gestes', titre: 'Gestes et souris', disponible: false },
  { id: 'nepasderanger', titre: 'Ne pas déranger', disponible: false },
  { id: 'demarrage', titre: 'Démarrage et sessions', disponible: false },
  { id: 'styles', titre: 'Styles et scripts', disponible: false },
  { id: 'reseau', titre: 'Réseau et identité', disponible: true },
  { id: 'importer', titre: 'Importer et exporter', disponible: true },
  { id: 'sauvegarde', titre: 'Sauvegarde et profils', disponible: false },
  { id: 'historique', titre: 'Historique', disponible: true },
  { id: 'favoris', titre: 'Favoris', disponible: true },
  { id: 'labo', titre: 'Labo', disponible: false },
  { id: 'apropos', titre: 'À propos', disponible: true }
]

/** Sections du sommaire (et de la recherche des réglages) : celles qui ont un contenu dans cette version. */
export const sectionsVisibles = (): Section[] => SECTIONS.filter((s) => s.disponible)

/** Phrase affichée à la place d'une section pas encore livrée, ouverte par son adresse (#/section). */
export const MESSAGE_SECTION_A_VENIR = 'Cette section arrive dans la prochaine version de Lyra.'

/** Hôtes lyra:// qui ouvrent directement une section (lyra://history → #/historique). */
const SECTION_DE_L_HOTE: Record<string, string> = { history: 'historique', bookmarks: 'favoris', downloads: 'telechargements' }

/** Route courante : le hash (`#/historique`) prime, sinon l'hôte lyra://, sinon « general ». */
export function routeDepuisHash(hash: string, hote: string): string {
  return hash.replace(/^#\/?/, '').split('/')[0] || SECTION_DE_L_HOTE[hote] || 'general'
}

/** Section d'une route ; `undefined` pour une adresse inconnue. */
export const sectionDe = (route: string): Section | undefined => SECTIONS.find((s) => s.id === route)
