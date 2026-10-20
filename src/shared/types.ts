/** Types partagés entre processus (purs, sans dépendance à Electron). */
import type { NavigateurSource } from '../main/import/types'
import type { BouclierSite, ReglagesD, RegleSiteD } from './types-reglages'

export * from './types-reglages'

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

export interface Settings extends ReglagesD {
  version: 2
  langue: string
  theme: 'systeme' | 'clair' | 'sombre' | 'programme'
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
  /** Moteurs de recherche ajoutés par l'utilisateur ou importés (s'ajoutent aux moteurs intégrés). */
  moteursPerso: MoteurPerso[]
  /** Import depuis d'autres navigateurs : file d'attente consommée par d'autres jalons. */
  import: {
    /** Extensions à (ré)installer par le jalon B (200 au plus, dédoublonnées sur id + magasin). */
    extensionsEnAttente: ExtensionEnAttente[]
    /** Réglages importés dont Lyra n'a pas encore le champ (appliqués plus tard sans réimporter). */
    reglagesEnAttente: { pageAccueil?: string }
  }
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
  extensions: SettingsExtensions
}

export type SourceExtension = 'cws' | 'crx' | 'zip' | 'dossier' | 'amo' | 'xpi'
export type MagasinExtension = 'chrome' | 'edge' | 'firefox' | 'inconnu'

/** Extension du registre (`settings.extensions.installees`). */
export interface ExtensionInstallee {
  /** Identifiant Chrome : 32 lettres a-p. */
  id: string
  nom: string
  version: string
  source: SourceExtension
  magasin: MagasinExtension
  /** Dossier chargé, relatif à `userData/extensions/` (ex. « <id>/1.0.0 »). */
  dossier: string
  active: boolean
  /** Date ISO. */
  installeeLe: string
  miseAJourLe: string
  /** Extension Firefox convertie en extension Chrome. */
  convertie?: boolean
  /** Identifiant AMO (slug), pour les mises à jour des extensions installées depuis addons.mozilla.org. */
  slugAmo?: string
}

/** Issue d'une installation d'extension (jamais d'exception : l'erreur est une valeur). */
export type ResultatInstallation =
  | { etat: 'installee'; id: string; nom: string; version: string; convertie?: boolean; rapport?: RapportConversion; suggestionChrome?: SuggestionChrome }
  /** À installer à la main (autre magasin, source inconnue) : `raison` l'explique. */
  | { etat: 'manuel'; raison: string }
  /** Plusieurs extensions AMO ressemblent à la saisie : rien n'est installé, l'utilisateur choisit (par slug). */
  | { etat: 'choix'; raison: string; candidats: CandidatAmo[] }
  | { etat: 'erreur'; raison: string; rapport?: RapportConversion; suggestionChrome?: SuggestionChrome }

/**
 * Entrée de la file d'import (structurellement compatible avec `ExtensionEnAttente` du jalon E ; renommée pour ne pas heurter `EntreeImport` de l'importeur).
 * `imposee` : extension imposée par une règle du navigateur d'origine, jamais installée sans choix explicite.
 */
export interface EntreeFileExtensions {
  id: string
  nom: string
  magasin: MagasinExtension
  actif?: boolean
  imposee?: boolean
}

export type EtatEntreeFile = 'installee' | 'manuel' | 'erreur' | 'a-confirmer'

export interface ResultatEntreeFile {
  entree: EntreeFileExtensions
  etat: EtatEntreeFile
  raison?: string
}

export interface ResultatFile {
  resultats: ResultatEntreeFile[]
  /** File à réécrire : entrées à confirmer et erreurs (réessayables). */
  restantes: EntreeFileExtensions[]
}

/** Progression de la file d'import (`extensions:progressionFile`). */
export interface ProgressionFile {
  index: number
  total: number
  nom: string
  etat?: EtatEntreeFile
  raison?: string
}

export interface CandidatAmo {
  nom: string
  slug: string
  auteur: string
}

/** Rapport d'audit de la conversion d'une extension Firefox en extension Chrome. */
export interface RapportConversion {
  /** Clés du manifest retirées (« sidebar_action », « browser_action.browser_style »…). */
  cles_retirees: string[]
  permissions_retirees: string[]
  /** Réécritures faites (« menus → contextMenus », « background.scripts → background.sw.js »…). */
  transformations: string[]
  avertissements: string[]
  /** Motif du refus : l'extension n'est pas installée. */
  refus?: string
}

/** Journal de compatibilité d'une extension (`userData/extensions/journal/<id>.json`). */
export interface JournalExtension {
  /** Avertissements au chargement et messages (warning/error) de la console de l'arrière-plan. */
  avertissementsChargement: string[]
  /** API absentes de Lyra, simulées par les stubs MV2, avec le nombre d'appels (« browserAction.setBadgeText » → 3). */
  apiStubees: Record<string, number>
  /** Permissions ou clés du manifest dont l'API n'existe ni dans Electron ni dans electron-chrome-extensions. */
  apiManquantes: string[]
  /** Raccourcis (`commands`) déjà déclarés par une autre extension. */
  conflitsRaccourcis: string[]
  /** L'extension déclare `webRequest` / `webRequestBlocking` : le blocage réseau est assuré par les Boucliers. */
  redondanceBoucliers: boolean
  /** Texte affiché quand `redondanceBoucliers` est vrai. */
  noteBoucliers?: string
  /** Rapport de conversion (extension Firefox convertie). */
  conversion?: RapportConversion
}

/** « Une version Chrome existe » : id de l'extension sur le Chrome Web Store. */
export interface SuggestionChrome {
  id: string
  nom: string
}

export interface SettingsExtensions {
  /** Dans l'ordre d'installation (c'est l'ordre de chargement au démarrage). */
  installees: ExtensionInstallee[]
  majAuto: boolean
  /** Date ISO de la dernière vérification des mises à jour. */
  derniereVerification?: string
}

export interface MoteurPerso {
  id: string
  nom: string
  /** Mot-clé de la palette (sans espace, 24 caractères au plus). */
  motCle: string
  /** Adresse de recherche avec `%s` pour la requête. */
  url: string
}

/** Extension importée, en attente d'installation. */
export interface ExtensionEnAttente {
  id: string
  nom: string
  magasin: 'chrome' | 'edge' | 'firefox' | 'inconnu'
  actif: boolean
  source: NavigateurSource
  /** Horodatage de mise en file (ms). */
  date: number
  /** Imposée par une stratégie d'entreprise dans le navigateur source. */
  imposee?: boolean
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

export interface RegleSite extends RegleSiteD {
  /** false ou 'desactives' : Boucliers désactivés sur ce site ; 'standard' ou 'strict' : niveau. Absent : actifs (écriture canonique : tri-état). */
  boucliers?: BouclierSite
  /** Décisions mémorisées pour ce site ; absent : on demande. */
  permissions?: Partial<Record<TypePermission, DecisionPermission>>
  /** Facteur de zoom mémorisé (0.25 à 5) ; absent : 100 %. */
  zoom?: number
  /** true : les notifications et popups de ce site passent même en mode Ne pas déranger. Absent : retenues. */
  exceptionDnd?: boolean
  /** Règle par site des extensions (`false` : l'extension ne doit pas agir sur ce site). Absent ou `true` : elle agit. */
  extensions?: Record<string, boolean>
}

/** Sites sur lesquels agit une extension, d'après son manifest. */
export interface PorteeExtension {
  /** `<all_urls>` ou équivalent. */
  tous: boolean
  /** Hôtes visés quand `tous` est faux (« youtube.com »). */
  hotes: string[]
}

/** Entrée du registre avec ce que la page des extensions affiche. */
/** Le dossier d'installation reste dans le processus principal : il n'est pas communiqué aux pages. */
export interface InfoExtension extends Omit<ExtensionInstallee, 'dossier'> {
  /** Chargée dans la session (une extension active qui ne se charge pas est « Incompatible »). */
  chargee: boolean
  /** L'extension a une page d'options. */
  aOptions: boolean
  portee: PorteeExtension
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
