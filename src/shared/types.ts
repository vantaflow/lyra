/** Types partagés entre processus (purs, sans dépendance à Electron). */

export interface Star {
  id: string
  url: string
  title: string
  favicon?: string
  parentId?: string
  constellationId?: string
  pinned: boolean
  dormant: boolean
  index: number
}

export interface Constellation {
  id: string
  name: string
  color: string
}

export interface SkyState {
  stars: Star[]
  constellations: Constellation[]
  activeId: string | null
  pinned: string[]
}

export interface Settings {
  version: 1
  langue: string
  theme: 'systeme' | 'clair' | 'sombre'
  moteurParDefaut: string
  moteurChoisi: boolean
  ciel: {
    position: 'gauche' | 'droite' | 'haut' | 'bas'
    largeur: number
    masque: boolean
    /** Ciel masqué : se révèle au survol du rail (sinon seulement par la poignée, le bouton de la capsule ou ⌘ \). */
    revelerAuSurvol: boolean
    /** Glisser l'en-tête du ciel vers un bord pour le déplacer. */
    deplacerParGlisser: boolean
    ternirApresMin: number
    endormirApresMin: number
  }
  boucliers: {
    niveau: 'standard'
    genes: boolean
    majHeures: number
  }
  telechargements: {
    dossier: string
    demander: boolean
  }
  /** Règles par site, indexées par origine (« https://exemple.fr », « file:// »). */
  sites: Record<string, RegleSite>
  reseau: {
    /** Passerelles pour les sites bloqués. */
    passerelles: boolean
    /** Détection automatique des sites bloqués. */
    auto: boolean
    /** Sites contournés (max 500). */
    sites: SiteContourne[]
    /** Passerelle personnelle ; si présente, utilisée à la place des publiques. */
    personnelle?: PasserellePerso
  }
}

export interface SiteContourne {
  /** Nom de domaine sans schéma ; couvre aussi ses sous-domaines. */
  hote: string
  origine: 'auto' | 'manuel'
  /** Horodatage d'ajout (ms). */
  date: number
}

export interface PasserellePerso {
  type: 'socks5' | 'http'
  hote: string
  port: number
}

export type TypePermission = 'camera' | 'micro' | 'notifications' | 'geolocalisation' | 'presse-papiers'
export type DecisionPermission = 'autoriser' | 'refuser'
export const TYPES_PERMISSION: readonly TypePermission[] = ['camera', 'micro', 'notifications', 'geolocalisation', 'presse-papiers']

export interface RegleSite {
  /** false : Boucliers désactivés sur ce site. Absent : actifs. */
  boucliers?: boolean
  /** Décisions mémorisées pour ce site ; absent : on demande. */
  permissions?: Partial<Record<TypePermission, DecisionPermission>>
  /** Facteur de zoom mémorisé (0.25 à 5) ; absent : 100 %. */
  zoom?: number
  /** true : les notifications et popups de ce site passent même en mode Ne pas déranger. Absent : retenues. */
  exceptionDnd?: boolean
}

export interface HistoryEntry {
  url: string
  title: string
  /** Horodatage de la dernière visite (ms). */
  visitedAt?: number
  /** Nombre de visites (historique). */
  visites?: number
  favori?: boolean
}

/** Une ligne de la palette ⌘ L. */
export interface Suggestion {
  type: 'etoile' | 'historique' | 'favori' | 'recherche' | 'commande'
  titre: string
  sousTitre?: string
  /** Adresse à ouvrir (déjà calculée pour une recherche). */
  url?: string
  /** Identifiant de l'étoile ou de la commande. */
  id?: string
  /** Identifiant du moteur (recherche). */
  moteur?: string
  /** Lettre ou glyphe de l'icône. */
  icone?: string
}

export type EtatTelechargement = 'en-cours' | 'pause' | 'termine' | 'annule' | 'erreur'

/** Un téléchargement, tel que l'exposent le panneau et la page lyra://downloads. */
export interface DownloadInfo {
  id: string
  nom: string
  /** Chemin complet du fichier ('' tant qu'il n'est pas connu). */
  chemin: string
  url: string
  /** Taille totale en octets (0 : inconnue). */
  total: number
  recu: number
  etat: EtatTelechargement
  /** Début du téléchargement (ms). */
  date: number
  /** Octets par seconde, tant que le téléchargement est en cours. */
  vitesse?: number
}
