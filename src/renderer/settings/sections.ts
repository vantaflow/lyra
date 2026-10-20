/** Sommaire des réglages : 19 entrées, dans l'ordre et avec les libellés de Parametres.dc.html (module pur). */
export interface SectionReglages {
  id: string
  libelle: string
  /** Mots que la recherche « Rechercher un réglage… » rapproche de la section (en plus du libellé). */
  motsCles: string[]
  route: string
}

function section(id: string, libelle: string, motsCles: string[]): SectionReglages {
  return { id, libelle, motsCles, route: `#/${id}` }
}

export const SECTIONS: SectionReglages[] = [
  section('general', 'Général', ['langue', 'interface', 'exporter', 'importer']),
  section('apparence', "Le ciel et l'apparence", ['ciel', 'position', 'largeur', 'étoiles', 'thème', 'sombre', 'clair', 'masqué']),
  section('couleurs', 'Couleurs et thèmes', ['couleur', 'thème', 'sombre', 'contraste', 'accent']),
  section('palette', 'Palette et recherche', ['moteur', 'recherche', 'palette', 'mot-clé']),
  section('boucliers', 'Boucliers', ['bouclier', 'publicités', 'traqueurs', 'listes', 'blocage']),
  section('sites', 'Règles par site', ['site', 'cookies', 'zoom', 'permissions', 'scripts']),
  section('extensions', 'Extensions', ['extension', 'module', 'chrome']),
  section('confidentialite', 'Confidentialité', ['historique', 'effacer', 'vie privée']),
  section('telechargements', 'Téléchargements', ['dossier', 'fichier', 'enregistrer']),
  section('raccourcis', 'Raccourcis clavier', ['clavier', 'touche', 'raccourci']),
  section('gestes', 'Gestes et souris', ['geste', 'souris', 'molette']),
  section('nepasderanger', 'Ne pas déranger', ['silence', 'notifications', 'dnd']),
  section('demarrage', 'Démarrage et sessions', ['démarrage', 'session', "page d'accueil", 'restaurer']),
  section('styles', 'Styles et scripts', ['css', 'style', 'script', 'javascript']),
  section('reseau', 'Réseau et identité', ['proxy', 'dns', 'user-agent', 'réseau', 'identité']),
  section('importer', 'Importer et exporter', ['importer', 'exporter', 'navigateur', 'favoris']),
  section('sauvegarde', 'Sauvegarde et profils', ['sauvegarde', 'profil', 'synchronisation']),
  section('labo', 'Labo', ['expérimental', 'bêta']),
  section('apropos', 'À propos', ['version', 'licence', 'mise à jour'])
]

/** Routes valides qui ne figurent pas au sommaire (absentes du design) : lyra://history, lyra://bookmarks restent ouverts. */
const ROUTES_HORS_SOMMAIRE = ['historique', 'favoris']

/** Hôtes lyra:// qui ouvrent directement une section (lyra://history → #/historique). */
export const SECTION_DE_L_HOTE: Record<string, string> = { history: 'historique', bookmarks: 'favoris', downloads: 'telechargements' }

/** Route courante : le hash (`#/historique`) prime, sinon l'hôte lyra://, sinon « general » (aussi pour une route inconnue). */
export function routeDepuisHash(hash: string, hote: string): string {
  const brute = hash.replace(/^#\/?/, '').split('/')[0] || SECTION_DE_L_HOTE[hote] || 'general'
  return SECTIONS.some((s) => s.id === brute) || ROUTES_HORS_SOMMAIRE.includes(brute) ? brute : 'general'
}
