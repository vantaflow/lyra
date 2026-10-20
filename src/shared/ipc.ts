import type { DemandeExportFichier, DemandeExportPaquet, DemandeImportFichier, DemandeSauvegardeAuto, EtatSauvegardeAutoIpc, ReponseImportFichier, ReponseSauvegardeAuto, ResultatExport } from '../main/export/types'
import type { Compteurs, ElementImport, ExtensionImportee, Indisponible, OptionsApplication, ProfilDetecte, ResultatImport } from '../main/import/types'
import type { Mode } from './contraste'
import type { NomTheme } from './types-reglages'
import type { DecisionPermission, DownloadInfo, EntreeFileExtensions, HistoryEntry, InfoExtension, JournalExtension, PasserellePerso, ProgressionFile, RegleSite, ResultatFile, ResultatInstallation, Settings, SiteContourne, SkyState, Suggestion, TypePermission } from './types'

export interface RectIpc {
  x: number
  y: number
  width: number
  height: number
}

/** État dynamique d'une étoile, relayé à l'UI avec le ciel. */
export interface EtatEtoile {
  chargement: boolean
  titre: string
  favicon?: string
  url: string
  canGoBack: boolean
  canGoForward: boolean
  couleur?: string
  /** Couleur dominante du favicon déjà en cache (aucune requête réseau) ; sert de teinte quand la page n'a pas de `theme-color`. */
  teinteFavicon?: string
  /** Timestamp (ms) depuis lequel l'étoile est inactive ; absent pour l'étoile active. */
  inactifDepuis?: number
  /** Facteur de zoom de la page ; absent à 100 %. */
  zoom?: number
  /** La page passe par une passerelle prête (site contourné, https). */
  viaPasserelle: boolean
  /** Lyra cherche une passerelle pour cette étoile (détection ou rotation en cours) ; absent sinon. */
  recherchePasserelle?: boolean
}

/** État des passerelles (`passerelles:etat`, `passerelles:changed`). */
export interface EtatPasserelles {
  /** Fonction activée dans les réglages. */
  actif: boolean
  auto: boolean
  sites: SiteContourne[]
  /** Nombre de passerelles prêtes. */
  pret: number
  /** Date (ISO) de la liste publique utilisée ; null si aucune. */
  dateListe: string | null
  personnelle?: PasserellePerso
  /** injoignable : passerelle personnelle en échec ; aucune : aucun candidat ne répond ; liste : liste indisponible. */
  erreur?: 'injoignable' | 'aucune' | 'liste'
  /** Une recherche ou un test est en cours. */
  enCours: boolean
}

/** État des Boucliers pour l'étoile active d'une fenêtre. */
export interface EtatBoucliers {
  actif: boolean
  bloques: number
  /** Origine de la page (« https://hôte », « file:// ») ; '' pour une page interne. */
  origine: string
  /** 20 dernières adresses bloquées, la plus récente d'abord. */
  dernieres: string[]
  /** Fenêtre privée : la règle par site ne peut pas être changée (rien n'est écrit dans les réglages). */
  privee?: boolean
}

/** Favori tel que l'exposent les pages internes. */
export interface FavoriIpc {
  url: string
  title: string
  dossier?: string
  date: number
}

/** Importation depuis un autre navigateur (jalon E) : `profil` est celui rendu par `import:detecter`. */
export interface DemandeApercuImport {
  profil: ProfilDetecte
  elements: ElementImport[]
  /** Fenêtre d'historique en jours ; `null` : tout. */
  depuisJours: number | null
}

export interface ReponseApercuImport {
  compteurs: Compteurs
  indisponibles: Partial<Record<ElementImport, Indisponible>>
  extensions?: ExtensionImportee[]
}

export interface DemandeImport extends DemandeApercuImport {
  options: OptionsApplication
}

/** `en-cours` : un import tourne déjà ; `prive` : appelé depuis une fenêtre privée (rien n'est écrit) ; `invalide` : profil ou éléments inconnus. */
export type ReponseImport = { id: string } | { erreur: 'en-cours' | 'prive' | 'invalide' }

export interface ProgressionImport {
  id: string
  element: ElementImport
  fait: number
  total?: number
  phase: 'lecture' | 'ecriture'
}

/** Statistiques des Boucliers : éléments bloqués cette semaine, date et origine des listes. */
export interface StatsBoucliers {
  semaine: number
  date: string
  source: string
}

/**
 * Thème effectif diffusé à toutes les vues Lyra (interface, overlay, pages lyra://) : `variables` pour une vue normale,
 * `privee` pour une vue portant la classe `privee` (thème des fenêtres privées). Chaque vue pose ces variables sur <html>.
 */
export interface ThemeDiffuse {
  mode: Mode
  /** Thème actif du profil (`couleurs.actif`). */
  nom: NomTheme
  variables: Record<string, string>
  privee: Record<string, string>
}

/** Durée du mode Ne pas déranger : minutes, ou jusqu'à l'arrêt. */
export type DureeDnd = 30 | 60 | 'arret'

/** État du mode Ne pas déranger d'une fenêtre (diffusé à la vue chrome). */
export interface EtatDnd {
  actif: boolean
  duree: DureeDnd | null
  /** Fin de la minuterie (ms) ; null jusqu'à l'arrêt ou hors mode. */
  fin: number | null
  /** Notifications retenues. */
  notifications: number
  /** Popups retenues. */
  popups: number
  /** Rappel complet visible (sinon : le croissant seul). */
  rappel: boolean
}

export type RouteOverlay = 'palette' | 'shields' | 'downloads' | 'menu' | 'permission' | 'extensions'

/** Entrées actives du menu ⋯ de la capsule. */
export type ActionMenu =
  | 'nouvelle-etoile'
  | 'nouvelle-fenetre'
  | 'fenetre-privee'
  | 'favori'
  | 'recherche'
  | 'imprimer'
  | 'devtools'
  | 'extensions'
  | 'historique'
  | 'reglages'

/** Contexte du menu ⋯ : ancre (coordonnées de la fenêtre) et état de la page active. */
export interface AncreMenu {
  droite: number
  bas: number
  hote: string
  /** Page https dont l'hôte peut être basculé (entrée « Passer par une passerelle »). */
  basculable?: boolean
  /** L'hôte est déjà dans la liste des sites contournés. */
  contourne?: boolean
  favori: boolean
  /** Fenêtre privée : l'ajout aux favoris est indisponible (rien n'est écrit). */
  privee?: boolean
  zoom: number
}

export interface DemandePermission {
  id: number
  origine: string
  types: TypePermission[]
}

export interface SkyChange {
  sky: SkyState
  etats: Record<string, EtatEtoile>
}

/** Requêtes renderer → main : canal → [données, réponse]. Complétée par les tâches suivantes. */
export type Requetes = {
  'settings:get': [void, Settings]
  /** Registre des extensions, avec l'état de chargement de chacune. */
  'extensions:lister': [void, InfoExtension[]]
  /** Active ou désactive à chaud ; faux si l'extension est inconnue ou ne se charge pas. */
  'extensions:activer': [{ id: string; active: boolean }, boolean]
  /** Retire l'extension, son dossier et son entrée du registre. */
  'extensions:desinstaller': [{ id: string }, boolean]
  /**
   * Installe une extension Chrome : `source` = identifiant, URL du Chrome Web Store ou « ubo » ; `choisir` ouvre un sélecteur
   * natif (fichier .crx/.zip ou dossier). Un chemin passé en `source` n'est accepté que sous `LYRA_TEST`.
   */
  'extensions:installer': [{ source?: string; choisir?: 'fichier' | 'dossier' }, ResultatInstallation]
  /** Ouvre la page d'options de l'extension dans une nouvelle étoile ; faux si elle n'en a pas. */
  'extensions:options': [{ id: string }, boolean]
  /** Règle par site : `active: false` enregistre `settings.sites[origine].extensions[id] = false`. */
  'extensions:regleSite': [{ id: string; origine: string; active: boolean }, boolean]
  /** Panneau des extensions (icônes d'action) depuis le pied du ciel. */
  'extensions:panel': [void, void]
  /** Journal de compatibilité d'une extension (undefined si inconnue). */
  'extensions:journal': [{ id: string }, JournalExtension | undefined]
  /**
   * File d'import (jalon E) : le processus principal lit `settings.import.extensionsEnAttente`, installe les entrées en série et
   * réécrit lui-même les restantes. Les entrées imposées exigent leur clé `magasin:id` dans `confirmees` (seule donnée de la page).
   * Rend un résultat par entrée et la file restante.
   */
  'extensions:consommerFile': [{ confirmees?: string[] } | undefined, ResultatFile]
  /** Cherche et installe les mises à jour maintenant (ignore le réglage automatique). */
  'extensions:majTout': [void, { misesAJour: Array<{ id: string; nom: string; de: string; vers: string }>; erreurs: string[]; derniereVerification?: string }]
  'settings:set': [Partial<Settings>, Settings]
  'layout:get': [
    void,
    {
      ciel: Settings['ciel']
      bounds: { chrome: RectIpc; page: RectIpc; overlay: RectIpc }
      /** Ciel masqué glissé par-dessus la page. */
      revele: boolean
      /** Glisser de l'en-tête du ciel en cours (la page est masquée). */
      glisse: boolean
      /** Ordre des vues, de la plus basse à la plus haute. */
      ordre: Array<'chrome' | 'page' | 'overlay'>
    }
  ]
  /** État du mode Ne pas déranger de la fenêtre de l'expéditeur. */
  'dnd:get': [void, EtatDnd]
  /** Chrome ou page interne → main : la fenêtre de l'expéditeur est-elle privée ? */
  'fenetre:privee': [void, boolean]
  /** Chrome → main : entre dans le mode (durée par défaut : 1 h) ou le quitte. */
  'dnd:basculer': [{ duree?: DureeDnd } | void, void]
  /** Chrome → main : sort du mode (Échap, croissant, ×). */
  'dnd:sortir': [void, void]
  /** Chrome → main : réaffiche le rappel complet (survol du croissant). */
  'dnd:rappel': [void, void]
  /** Largeur mesurée de la pastille du rappel (la vue chrome ne couvre que sa surface). */
  'dnd:taille': [{ largeur: number }, void]
  /** Test uniquement (LYRA_TEST=1) : notifications livrées à la sortie (au lieu d'être affichées). */
  'test:livraisons': [void, Array<{ titre: string; corps?: string; origine: string; etoileId?: string }>]
  /** Chrome → main : révèle (actif) ou retire le ciel masqué ; renvoie l'état obtenu. */
  'ciel:reveler': [{ actif: boolean }, boolean]
  /** Chrome → main : un glisser de l'en-tête du ciel commence ou finit (la page se retire le temps du glisser). */
  'ciel:glisse': [{ actif: boolean }, void]
  /** Chrome → main : largeur du ciel en cours de réglage à la poignée (aperçu en direct, rien n'est écrit) ; null l'efface. */
  'ciel:apercu': [{ largeur: number | null }, void]
  'tabs:open': [{ url: string; parentId?: string; actif?: boolean }, string]
  'tabs:close': [{ id: string }, void]
  'tabs:activate': [{ id: string }, void]
  'tabs:navigate': [{ id: string; url: string }, void]
  'tabs:back': [{ id: string }, void]
  'tabs:forward': [{ id: string }, void]
  'tabs:reload': [{ id: string }, void]
  'tabs:stop': [{ id: string }, void]
  /** Chrome → main : ouvre la palette (overlay). */
  'palette:open': [void, void]
  'palette:suggest': [{ texte: string }, Suggestion[]]
  'palette:go': [{ suggestion?: Suggestion; texte: string; nouvelleEtoile: boolean }, void]
  'palette:close': [void, void]
  'tabs:move': [{ id: string; parentId?: string; index: number }, void]
  'tabs:pin': [{ id: string; pinned: boolean }, void]
  'tabs:reopen': [void, void]
  'sky:get': [void, SkyChange]
  'shields:get': [void, EtatBoucliers]
  'shields:toggleSite': [{ origine: string; actif: boolean }, void]
  /** Règles par site (clé : origine, hôte nu ou motif `*.hôte`, enregistrée sous forme canonique ; un champ à `null` est retiré). Écriture refusée en fenêtre privée. */
  'sites:lister': [void, Record<string, RegleSite>]
  'sites:ecrire': [{ cle: string; regle: { [C in keyof RegleSite]?: RegleSite[C] | null } }, void]
  'sites:supprimer': [string, void]
  /** Vue Lyra (interface, overlay, page lyra://) → main : thème effectif courant (rattrapage au chargement ; ensuite `theme:variables`). */
  'theme:effectif': [void, ThemeDiffuse]
  'shields:stats': [void, StatsBoucliers]
  /** Relit les listes de blocage maintenant ; renvoie les statistiques à jour. */
  'shields:update': [void, StatsBoucliers | { ignore: true; date: string }]
  /** Boîte de dialogue : dossier de téléchargement choisi, ou null si annulé. */
  'settings:choisirDossier': [void, string | null]
  /** Boîte de dialogue : enregistre les réglages en JSON ; vrai si le fichier est écrit. */
  'settings:export': [void, boolean]
  /** Boîte de dialogue : lit un JSON de réglages, le valide et l'applique ; null si annulé ou illisible. */
  'settings:import': [void, Settings | null]
  /** Boîte de dialogue : lit un thème JSON `{ nom, couleurs }` et l'applique comme « Mes couleurs » ; null si annulé, `erreur` si invalide. */
  'themes:importer': [void, { nom: string } | { erreur: string } | null]
  /** Boîte de dialogue : enregistre « Mes couleurs » en JSON `{ nom, couleurs }` ; vrai si le fichier est écrit, `erreur` si l'écriture échoue. */
  'themes:exporter': [void, boolean | { erreur: string }]
  /** Chrome → main : ouvre le panneau des Boucliers dans l'overlay. */
  'shields:open': [void, void]
  /** Overlay → main : referme l'overlay (Échap, clic à côté). */
  'overlay:close': [void, void]
  'history:search': [{ texte: string; limite?: number }, HistoryEntry[]]
  'history:delete': [{ url: string }, void]
  'history:clear': [void, void]
  /** Efface maintenant l'historique, les cookies et le cache des pages web (le bouton avec confirmation de « Confidentialité »). */
  'confidentialite:purger': [void, void]
  'history:frequent': [{ n: number }, HistoryEntry[]]
  /** Renvoie vrai si l'adresse est désormais en favori. */
  'bookmarks:toggle': [{ url: string; title: string }, boolean]
  'bookmarks:exists': [{ url: string }, boolean]
  'bookmarks:list': [void, FavoriIpc[]]
  /** Pages `lyra://settings` seulement, jamais une fenêtre privée (jalon E). */
  'import:detecter': [void, ProfilDetecte[]]
  'import:apercu': [DemandeApercuImport, ReponseApercuImport]
  'import:lancer': [DemandeImport, ReponseImport]
  'import:annuler': [{ id: string }, void]
  /** Export (jalon E, Task 4) : mêmes règles que `import:*` (page de réglages, jamais une fenêtre privée : refus par exception). */
  'export:favoris': [DemandeExportFichier, ResultatExport]
  'export:historique': [DemandeExportFichier, ResultatExport]
  'export:ciel': [DemandeExportFichier, ResultatExport]
  'export:reglages': [DemandeExportFichier, ResultatExport]
  'export:paquet': [DemandeExportPaquet, ResultatExport]
  'export:sauvegardeAuto': [DemandeSauvegardeAuto, ReponseSauvegardeAuto]
  'export:sauvegardeEtat': [void, EtatSauvegardeAutoIpc]
  /** Import d'un fichier (favoris HTML, historique CSV, ciel JSON, réglages JSON, paquet `.lyra`) ; fenêtre privée : `{ ok: false, erreur: 'prive' }`. */
  'import:fichier': [DemandeImportFichier, ReponseImportFichier]
  'bookmarks:remove': [{ url: string }, void]
  'downloads:list': [void, DownloadInfo[]]
  'downloads:pause': [{ id: string }, void]
  'downloads:resume': [{ id: string }, void]
  'downloads:cancel': [{ id: string }, void]
  'downloads:open': [{ id: string }, void]
  'downloads:reveal': [{ id: string }, void]
  'downloads:clear': [void, void]
  /** Chrome → main : ouvre le panneau des téléchargements dans l'overlay. */
  'downloads:panel': [void, void]
  /** Chrome → main : ouvre le menu ⋯ ancré sous le bouton (coordonnées du chrome). */
  'menu:open': [{ droite: number; bas: number }, void]
  'menu:action': [{ action: ActionMenu }, void]
  /** Overlay → main : réponse à une demande de permission (refus si abandonnée). */
  'permission:answer': [{ id: number; decision: DecisionPermission; memoriser: boolean }, void]
  'find:start': [{ id: string; texte: string; suivant?: boolean; precedent?: boolean }, void]
  'find:stop': [{ id: string }, void]
  /** Zoom de l'étoile (active si `id` est absent) ; renvoie le facteur obtenu. */
  'tabs:zoom': [{ id?: string; delta?: 1 | -1; reset?: boolean }, number]
  /** Page d'erreur Lyra : recharge l'adresse d'origine. */
  'erreur:reessayer': [{ url: string }, void]
  /** Page d'erreur Lyra : accepte le certificat de l'hôte pour la session puis recharge. */
  'erreur:continuer': [{ url: string }, void]
  /** Page d'erreur Lyra : ajoute l'hôte de la page (son URL, jamais les données) aux sites contournés puis recharge. */
  /** Réponse `{ erreur }` : l'ajout a été refusé (liste pleine…), message à afficher sur la page. */
  'erreur:passerelle': [{ url: string }, { erreur?: string }]
  'passerelles:etat': [void, EtatPasserelles]
  /** Ajoute un site (hôte ou adresse https) ; lève une erreur expliquée si la saisie est refusée. */
  'passerelles:ajouter': [{ hote: string }, EtatPasserelles]
  'passerelles:retirer': [{ hote: string }, EtatPasserelles]
  /** Menu ⋯ : ajoute l'hôte, ou retire les sites qui le couvrent. */
  'passerelles:basculerSite': [{ hote: string }, EtatPasserelles]
  /** « Tester maintenant » : nouvelle recherche (ou test de la personnelle). */
  'passerelles:tester': [void, EtatPasserelles]
  /** Définit (puis teste) ou supprime (null) la passerelle personnelle. */
  'passerelles:personnelle': [{ config: PasserellePerso | null }, EtatPasserelles]
  /** Cloudflare WARP : personnelle SOCKS5 127.0.0.1:40000, puis test. */
  'passerelles:warp': [void, EtatPasserelles]
  /** Test uniquement (LYRA_TEST=1) : charge une URL dans la vue de page. */
  'test:navigate': [string, void]
  /** Mode test (`enTest()`) : pose la file d'import des réglages (`import.extensionsEnAttente`) et rend celle qui reste. */
  'test:fileImport': [unknown[] | undefined, unknown[]]
  'test:endormir': [string, boolean]
  /** Mode test (`enTest()`) : avance l'horloge de l'archivage des étoiles éteintes de `avanceMs`, vérifie, renvoie le nombre archivé. */
  /** Mode test (`enTest()`) : crée une constellation nommée (hors regroupement automatique) ; renvoie son id. */
  'test:constellation': [{ nom: string }, string]
  'test:archiver': [{ avanceMs: number }, number]
  /** Test uniquement (LYRA_TEST=1) : dernière URL demandée par la palette. */
  'test:lastNavigation': [void, string | null]
}

/** Évènements main → renderer : canal → données. */
export type Evenements = {
  /** Réglages sans les règles par site (`sites` y est vide : voir `sites:changed`). */
  'settings:changed': Settings
  /** Règles par site : diffusé seulement quand elles changent. */
  'sites:changed': Record<string, RegleSite>
  /** Main → vues Lyra (jamais une page web) : variables CSS du thème effectif, posées sur <html> sans rechargement. */
  'theme:variables': ThemeDiffuse
  /** Main → page des extensions : progression de la file d'import (début et fin de chaque extension). */
  'extensions:progressionFile': ProgressionFile
  /** Main → page des extensions : la file d'import est terminée (résultat de chaque entrée, file restante). */
  'extensions:finFile': ResultatFile
  /** Main → chrome : le ciel masqué est révélé (vue chrome élargie au-dessus de la page) ou retiré. */
  'ciel:revele': boolean
  /** Main → chrome : la souris bouge sur la page web ; `y` = hauteur du curseur depuis le haut de la capsule (la page est sous elle, donc ≥ 46). Aucune donnée de page. */
  'capsule:souris': { y: number }
  /** Main → chrome : l'état du mode Ne pas déranger a changé. */
  'dnd:changed': EtatDnd
  'sky:changed': SkyChange
  /** Main → overlay : la palette s'affiche. */
  'palette:open': { texteInitial?: string }
  /** Main → overlay : panneau à afficher. */
  'overlay:route': RouteOverlay
  /** Main → chrome : la liste des favoris a changé. */
  'bookmarks:changed': void
  /** Main → chrome : le compteur ou l'état des Boucliers de l'étoile active a changé. */
  'shields:changed': EtatBoucliers
  /** Main → chrome, overlay et pages internes : la liste des téléchargements a changé (à relire). */
  'downloads:changed': void
  /** Main → overlay : contexte du menu ⋯ qui vient de s'ouvrir. */
  'menu:ancre': AncreMenu
  /** Main → overlay : une page demande une permission. */
  'permission:ask': DemandePermission
  /** Main → chrome : ouvre la barre de recherche dans la page (⌘ F). */
  'find:open': void
  /** Main → chrome : résultat de la recherche (actif : occurrence courante, 1-based). */
  'find:result': { id: string; actif: number; total: number }
  /** Main → chrome, overlay et pages internes : l'état des passerelles a changé. */
  'passerelles:changed': EtatPasserelles
  /** Main → page de réglages qui a lancé l'import. */
  'import:progression': ProgressionImport
  'import:termine': { id: string; resultat: ResultatImport }
}

export type CanalRequete = keyof Requetes
export type CanalEvenement = keyof Evenements

/** API exposée par le preload UI sous window.lyra. */
export interface LyraApi {
  invoke<K extends CanalRequete>(canal: K, data?: Requetes[K][0]): Promise<Requetes[K][1]>
  on<K extends CanalEvenement>(canal: K, cb: (data: Evenements[K]) => void): () => void
  plateforme: NodeJS.Platform
}
