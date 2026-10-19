import type { DecisionPermission, DownloadInfo, HistoryEntry, PasserellePerso, Settings, SiteContourne, SkyState, Suggestion, TypePermission } from './types'

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

/** Statistiques des Boucliers : éléments bloqués cette semaine, date et origine des listes. */
export interface StatsBoucliers {
  semaine: number
  date: string
  source: string
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

export type RouteOverlay = 'palette' | 'shields' | 'downloads' | 'menu' | 'permission'

/** Entrées actives du menu ⋯ de la capsule. */
export type ActionMenu =
  | 'nouvelle-etoile'
  | 'nouvelle-fenetre'
  | 'fenetre-privee'
  | 'favori'
  | 'recherche'
  | 'imprimer'
  | 'devtools'
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
  'shields:stats': [void, StatsBoucliers]
  /** Relit les listes de blocage maintenant ; renvoie les statistiques à jour. */
  'shields:update': [void, StatsBoucliers | { ignore: true; date: string }]
  /** Boîte de dialogue : dossier de téléchargement choisi, ou null si annulé. */
  'settings:choisirDossier': [void, string | null]
  /** Boîte de dialogue : enregistre les réglages en JSON ; vrai si le fichier est écrit. */
  'settings:export': [void, boolean]
  /** Boîte de dialogue : lit un JSON de réglages, le valide et l'applique ; null si annulé ou illisible. */
  'settings:import': [void, Settings | null]
  /** Chrome → main : ouvre le panneau des Boucliers dans l'overlay. */
  'shields:open': [void, void]
  /** Overlay → main : referme l'overlay (Échap, clic à côté). */
  'overlay:close': [void, void]
  'history:search': [{ texte: string; limite?: number }, HistoryEntry[]]
  'history:delete': [{ url: string }, void]
  'history:clear': [void, void]
  'history:frequent': [{ n: number }, HistoryEntry[]]
  /** Renvoie vrai si l'adresse est désormais en favori. */
  'bookmarks:toggle': [{ url: string; title: string }, boolean]
  'bookmarks:exists': [{ url: string }, boolean]
  'bookmarks:list': [void, FavoriIpc[]]
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
  'test:endormir': [string, boolean]
  /** Test uniquement (LYRA_TEST=1) : dernière URL demandée par la palette. */
  'test:lastNavigation': [void, string | null]
}

/** Évènements main → renderer : canal → données. */
export type Evenements = {
  'settings:changed': Settings
  /** Main → chrome : le ciel masqué est révélé (vue chrome élargie au-dessus de la page) ou retiré. */
  'ciel:revele': boolean
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
}

export type CanalRequete = keyof Requetes
export type CanalEvenement = keyof Evenements

/** API exposée par le preload UI sous window.lyra. */
export interface LyraApi {
  invoke<K extends CanalRequete>(canal: K, data?: Requetes[K][0]): Promise<Requetes[K][1]>
  on<K extends CanalEvenement>(canal: K, cb: (data: Evenements[K]) => void): () => void
  plateforme: NodeJS.Platform
}
