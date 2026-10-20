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
  ligne('boucliers', 'frequence', 'Mettre à jour les listes toutes les', ['fréquence', 'listes', 'jours']),
  ligne('boucliers', 'listes', 'Listes de blocage', ['mise à jour', 'filtres']),
  ligne('boucliers', 'sites', 'Boucliers site par site', ['règles par site', 'désactiver', 'strict', 'exception']),
  ligne('sites', 'nouvelle', 'Nouvelle règle', ['site', 'ajouter', 'origine', 'hôte', 'motif']),
  ligne('sites', 'boucliers', 'Boucliers du site', ['strict', 'standard', 'désactivés', 'publicités', 'règle']),
  ligne('sites', 'scriptlets', 'Scriptlets anti-publicité YouTube', ['youtube', 'publicités', 'scriptlets']),
  ligne('sites', 'cookies', 'Cookies du site', ['1re partie', 'première partie', 'bloqués', 'session seulement', 'règle']),
  ligne('sites', 'scripts', 'Scripts du site', ['javascript', 'autorisés', 'bloqués', 'site', 'règle']),
  ligne('sites', 'zoom', 'Zoom du site', ['agrandir', 'réduire', 'pourcentage', 'taille', 'site', 'règle']),
  ligne('sites', 'lectureAuto', 'Lecture automatique des vidéos', ['sans le son', 'bloquer', 'autoriser', 'vidéo', 'site']),
  ligne('sites', 'notifications', 'Notifications du site', ['demander', 'autoriser', 'refuser', 'permission']),
  ligne('sites', 'extensions', 'Extensions autorisées sur ce site', ['module', 'site', 'règle']),
  ligne('sites', 'dnd', 'Ne pas déranger : laisser passer les notifications de ce site', ['exception', 'silence', 'dnd', 'site']),
  ligne('sites', 'ua', 'Identité du navigateur (user-agent)', ['user-agent', 'firefox', 'safari', 'chrome', 'site']),
  ligne('sites', 'style', 'Style personnalisé', ['css', 'feuille de style', 'site', 'règle']),
  ligne('sites', 'scriptsPerso', 'Script personnalisé', ['javascript', 'script', 'site', 'règle']),
  ligne('palette', 'moteur', 'Moteur par défaut', ['recherche', 'google', 'nouvel onglet', 'palette']),
  ligne('palette', 'moteurs', 'Mots-clés de la palette', ['moteur', 'recherche', 'raccourci', 'wikipédia', 'youtube']),
  ligne('palette', 'ajouterMoteur', 'Ajouter un moteur de recherche', ['personnalisé', 'moteur', 'adresse', 'url', 'mot-clé']),
  ligne('palette', 'suggestionsHistorique', "Proposer l'historique", ['suggestions', 'palette', 'pages visitées']),
  ligne('palette', 'suggestionsFavoris', 'Proposer les favoris', ['suggestions', 'palette', 'marque-pages']),
  ligne('palette', 'suggestionsEnPrivee', 'Suggestions en fenêtre privée', ['historique', 'favoris', 'privé', 'navigation privée']),
  ligne('reseau', 'passerelles', 'Passerelles pour les sites bloqués', ['proxy', 'contourner', 'réseau']),
  ligne('reseau', 'detection', 'Détecter les sites bloqués automatiquement', ['automatique', 'passerelle']),
  ligne('reseau', 'etat', 'État', ['passerelle', 'tester', 'réseau']),
  ligne('confidentialite', 'effacerHistorique', "Effacer l'historique de navigation", ['fermeture', 'quitter', 'supprimer', 'pages visitées']),
  ligne('confidentialite', 'effacerCookies', 'Effacer les cookies', ['fermeture', 'quitter', 'déconnecter', 'données de site']),
  ligne('confidentialite', 'effacerCache', 'Vider le cache', ['fermeture', 'quitter', 'fichiers temporaires']),
  ligne('confidentialite', 'historique', 'Historique de navigation', ['effacer', 'supprimer', 'pages visitées']),
  ligne('confidentialite', 'purge', 'Historique, cookies et cache', ['tout effacer', 'purger', 'maintenant', 'vider', 'données de navigation']),
  ligne('telechargements', 'dossier', 'Dossier de téléchargement', ['enregistrer', 'fichiers']),
  ligne('telechargements', 'demander', 'Demander où enregistrer chaque fichier', ['dossier', 'demander']),
  ligne('gestes', 'defilementHorizontal', 'Page précédente ou suivante en défilant horizontalement', ['balayage', 'pavé tactile', 'précédent', 'suivant', 'retour', 'historique', 'trois doigts']),
  ligne('gestes', 'clicMolette', "Ouvrir un lien dans une nouvelle étoile d'un clic molette", ['souris', 'bouton du milieu', 'nouvel onglet', 'arrière-plan', 'lien']),
  // Pas de « zoom » dans le libellé ni les mots-clés : la recherche « zoom » mène à Règles par site seulement (e2e reglages.spec.ts).
  ligne('gestes', 'molettePlusCmdZoom', 'Agrandir ou réduire la page avec ⌘ ou Ctrl + molette', ['agrandir', 'réduire', 'souris', 'commande', 'contrôle', 'taille de la page']),
  ligne('nepasderanger', 'duree', 'Durée par défaut', ['30 minutes', '1 heure', "jusqu'à l'arrêt", 'silence', 'dnd']),
  ligne('nepasderanger', 'exceptions', 'Sites qui peuvent vous déranger', ['exception', 'notifications', 'fenêtres surgissantes', 'retirer']),
  ligne('demarrage', 'restaurer', 'Rouvrir les étoiles de la dernière session', ['restaurer', 'session', 'onglets', 'démarrage']),
  ligne('demarrage', 'pageAccueil', "Page d'accueil", ['démarrage', 'adresse', 'nouvel onglet', 'site de départ']),
  ligne('demarrage', 'nouvelleFenetre', 'Nouvelle fenêtre', ['démarrage', 'fenêtre', 'nouvel onglet', 'page d\'accueil', 'vide']),
  ligne('styles', 'css', 'Feuille de style globale', ['css', 'style', 'tous les sites', 'personnalisé']),
  ligne('styles', 'scripts', 'Scripts globaux', ['javascript', 'script', 'tous les sites', 'personnalisé']),
  ligne('sauvegarde', 'exporter', 'Exporter et importer vos données', ['sauvegarde', 'réglages', 'favoris', 'copie']),
  // Une ligne par commande serait dynamique (`reglage` calculé) : le tableau est indexé d'un bloc. Les libellés des commandes
  // n'y figurent pas : « zoom » ou « historique » ne doivent pas faire surgir cette section (e2e reglages.spec.ts).
  ligne('raccourcis', 'commandes', 'Raccourcis des commandes', ['combinaison', 'redéfinir', 'par défaut', 'réinitialiser'])
]

/** Lignes parfois absentes de la page (affichées sous condition) : la recherche saute alors à la ligne qui les commande. */
export const REPLI_LIGNE: Record<string, string> = {
  'couleurs.heure': 'couleurs.passage',
  // Le détail d'une règle n'existe que pour le site choisi : sans site choisi, la recherche saute au bouton « Nouvelle règle ».
  ...Object.fromEntries(
    ['boucliers', 'scriptlets', 'cookies', 'scripts', 'zoom', 'lectureAuto', 'notifications', 'extensions', 'dnd', 'ua', 'style', 'scriptsPerso'].map((r) => [`sites.${r}`, 'sites.nouvelle'])
  )
}

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
