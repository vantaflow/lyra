import { COMMANDES } from '../../shared/commandes'
import { SECTIONS } from './sections'

/** Un enregistrement de l'index : une section (`id` = id de section) ou une ligne de réglage (`id` = `<section>.<réglage>`, porté en `data-reglage`). */
export interface EntreeIndex {
  id: string
  section: string
  libelle: string
  motsCles: string[]
}

export interface Resultat extends EntreeIndex {
  type: 'section' | 'ligne'
}

/** Synonymes ajoutés aux mots-clés d'une section (en plus de ceux de `sections.ts`). */
const SYNONYMES_SECTIONS: Record<string, string[]> = {
  couleurs: ['sombre', 'nuit', 'mode sombre'],
  sites: ['zoom', 'cookies', 'agrandir', 'permissions'],
  confidentialite: ['cookies', 'données de site', 'traces'],
  raccourcis: ['raccourci', 'clavier', 'touches']
}

function ligne(section: string, reglage: string, libelle: string, motsCles: string[] = []): EntreeIndex {
  return { id: `${section}.${reglage}`, section, libelle, motsCles }
}

/**
 * Index de recherche. Les sections viennent de `sections.ts` ; les lignes sont déclarées ici et chacune doit porter
 * `reglage="<id>"` dans son composant (garde : `recherche.test.ts`). Une tâche qui ajoute des lignes les ajoute ici
 * (et le fichier de la section est ajouté à la liste du test de garde).
 */
export const INDEX: EntreeIndex[] = [
  ...SECTIONS.map((s) => ({ id: s.id, section: s.id, libelle: s.libelle, motsCles: [...s.motsCles, ...(SYNONYMES_SECTIONS[s.id] ?? [])] })),
  ligne('general', 'langue', "Langue de l'interface", ['français', 'anglais', 'traduction']),
  ligne('general', 'historique', 'Historique de navigation', ['effacer', 'supprimer', 'pages visitées']),
  ligne('apparence', 'revelerSurvol', 'Révéler le ciel masqué au survol du bord', ['ciel', 'masqué', 'bord']),
  ligne('apparence', 'largeur', 'Largeur du ciel', ['ciel', 'taille', 'pixels']),
  ligne('apparence', 'glisser', "Glisser l'en-tête du ciel vers un bord pour le déplacer", ['ciel', 'déplacer', 'position']),
  ligne('apparence', 'theme', 'Thème', ['clair', 'sombre', 'système', 'apparence', 'programmé']),
  ligne('apparence', 'relier', "Relier un onglet à celui qui l'a ouvert", ['constellation', 'lignes', 'parent']),
  ligne('apparence', 'icones', 'Afficher les icônes des sites à la place des points', ['favicon', 'étoiles', 'points']),
  ligne('apparence', 'ternir', 'Ternir une étoile inactive après', ['inactif', 'discrète', 'minutes']),
  ligne('apparence', 'endormir', 'Endormir une étoile inactive après', ['mémoire', 'décharger', 'veille', 'inactif']),
  ligne('apparence', 'archiver', 'Archiver les étoiles éteintes depuis', ['historique', 'retirer', 'jours']),
  ligne('apparence', 'nouvelleEtoile', 'Nouvelle étoile ouverte', ['sous', 'fin de constellation', 'hors constellation', 'placement']),
  ligne('apparence', 'regrouper', 'Regrouper automatiquement par site', ['constellation', 'domaine', 'groupes']),
  ligne('apparence', 'couleurEtoile', "Couleur de l'étoile active", ['or', 'menthe', 'rose', 'pastille', 'couleur']),
  ligne('apparence', 'couleurCiel', 'Couleur du ciel', ['indigo', 'noir', 'ardoise', 'forêt', 'fond', 'couleur']),
  ligne('apparence', 'police', "Police de l'interface", ['texte', 'manrope', 'caractères']),
  ligne('apparence', 'tailleTexte', "Taille du texte de l'interface", ['police', 'agrandir', 'pixels']),
  ligne('apparence', 'densite', 'Densité', ['compacte', 'confortable', 'lignes', 'espacement']),
  ligne('apparence', 'coins', 'Coins arrondis de la page', ['rayon', 'cadre', 'arrondi']),
  ligne('apparence', 'capsuleAuto', 'Masquer la capsule quand la souris ne bouge plus', ['barre', 'automatique', 'souris']),
  ligne('couleurs', 'themes', 'Thèmes', ['indigo nuit', 'encre', 'forêt', 'sable', 'aurore', 'clair total', 'nuit complète', 'mes couleurs', 'importer', 'exporter']),
  ligne('couleurs', 'cielFond', 'Ciel — fond', ['couleur', 'hexadécimal']),
  ligne('couleurs', 'cielTexte', 'Ciel — texte', ['couleur']),
  ligne('couleurs', 'etoileActive', 'Étoile active', ['couleur', 'lueur']),
  ligne('couleurs', 'etoileActiveFond', 'Étoile active — fond', ['couleur']),
  ligne('couleurs', 'etoiles', 'Étoiles', ['couleur']),
  ligne('couleurs', 'etoilesEndormies', 'Étoiles endormies', ['couleur']),
  ligne('couleurs', 'lignes', 'Lignes de constellation', ['couleur', 'traits']),
  ligne('couleurs', 'capsuleFond', 'Capsule — fond', ['couleur']),
  ligne('couleurs', 'capsuleTexte', 'Capsule — texte', ['couleur']),
  ligne('couleurs', 'accent', 'Accent', ['couleur', 'boutons', 'liens']),
  ligne('couleurs', 'boucliers', 'Boucliers', ['couleur', 'bouclier']),
  ligne('couleurs', 'pagesFond', 'Pages de Lyra — fond', ['couleur', 'nouvel onglet', 'réglages']),
  ligne('couleurs', 'nouvelOngletCiel', 'Nouvel onglet — ciel', ['couleur']),
  ligne('couleurs', 'contraste', 'Contraste insuffisant ?', ['lisibilité', '4,5:1', 'accessibilité']),
  ligne('couleurs', 'teinteSite', 'Le ciel prend la teinte du site actif', ['theme-color', 'icône', 'site']),
  ligne('couleurs', 'constellation', 'Chaque constellation a sa couleur', ['groupe', 'étoile active', 'lignes']),
  ligne('couleurs', 'passage', 'Passer en sombre', ['système', 'coucher du soleil', 'heure fixe', 'jamais', 'thème', 'mode sombre']),
  ligne('couleurs', 'heure', 'Sombre de … à … (à une heure fixe)', ['passer en sombre', 'heure', 'plage', 'nuit', 'horaire', 'minuit']),
  ligne('couleurs', 'privee', 'Fenêtres privées', ['thème', 'privé', 'navigation privée']),
  ligne('couleurs', 'themeSite', 'Thème du site dans la page', ['prefers-color-scheme', 'sombre', 'sites']),
  ligne('boucliers', 'niveau', 'Niveau de protection', ['publicités', 'traqueurs', 'bloquer', 'bouclier']),
  ligne('boucliers', 'genes', 'Masquer aussi les gênes', ['bandeaux', 'cookies', 'invitation']),
  ligne('boucliers', 'frequence', 'Mettre à jour les listes toutes les', ['fréquence', 'listes', 'jours']),
  ligne('boucliers', 'listes', 'Listes de blocage', ['mise à jour', 'filtres']),
  ligne('palette', 'moteur', 'Moteur par défaut', ['recherche', 'google', 'nouvel onglet', 'palette']),
  ligne('reseau', 'passerelles', 'Passerelles pour les sites bloqués', ['proxy', 'contourner', 'réseau']),
  ligne('reseau', 'detection', 'Détecter les sites bloqués automatiquement', ['automatique', 'passerelle']),
  ligne('reseau', 'etat', 'État', ['passerelle', 'tester', 'réseau']),
  ligne('telechargements', 'dossier', 'Dossier de téléchargement', ['enregistrer', 'fichiers']),
  ligne('telechargements', 'demander', 'Demander où enregistrer chaque fichier', ['dossier', 'demander']),
  // Une ligne par commande serait dynamique (`reglage` calculé) : le tableau est indexé d'un bloc, avec les libellés des commandes.
  ligne('raccourcis', 'commandes', 'Raccourcis des commandes', ['combinaison', 'redéfinir', 'par défaut', 'réinitialiser', ...COMMANDES.map((c) => c.libelle)])
]

/** Lignes parfois absentes de la page (affichées sous condition) : la recherche saute alors à la ligne qui les commande. */
export const REPLI_LIGNE: Record<string, string> = { 'couleurs.heure': 'couleurs.passage' }

/** Minuscules sans accents. */
export const normaliser = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** 0 libellé exact, 1 préfixe du libellé, 2 libellé contenant la requête ou tous ses mots, 3 mot-clé seulement ; -1 si un mot manque. */
function rang(e: EntreeIndex, requete: string, mots: string[]): number {
  const libelle = normaliser(e.libelle)
  const tout = [libelle, ...e.motsCles.map(normaliser)].join(' ')
  if (!mots.every((m) => tout.includes(m))) return -1
  if (libelle === requete) return 0
  if (libelle.startsWith(requete)) return 1
  if (mots.every((m) => libelle.includes(m))) return 2
  return 3
}

/** Entrées de l'index contenant tous les mots de la requête (sans casse ni accents), triées par pertinence puis ordre de l'index. */
export function chercher(requete: string, index: EntreeIndex[] = INDEX): Resultat[] {
  const q = normaliser(requete).trim().replace(/\s+/g, ' ')
  if (!q) return []
  const mots = q.split(' ')
  return index
    .map((e, ordre) => ({ e, ordre, r: rang(e, q, mots) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.ordre - b.ordre)
    .map((x) => ({ ...x.e, type: x.e.id === x.e.section ? ('section' as const) : ('ligne' as const) }))
}
