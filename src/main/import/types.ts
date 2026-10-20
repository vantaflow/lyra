/**
 * Modèle neutre de ce qui est importé depuis un autre navigateur. Il ne dépend d'aucun navigateur source :
 * les lecteurs (Chromium, Firefox, Safari, Orion) produisent tous ces structures, l'application dans Lyra
 * (jalon E, Task 3) et l'aperçu de l'interface (Task 5) n'en connaissent pas d'autres.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Sources et profils

export type NavigateurSource = 'chrome' | 'edge' | 'brave' | 'vivaldi' | 'firefox' | 'safari' | 'orion'

/** Navigateurs construits sur Chromium : même format de profil (Bookmarks, History, Preferences, Sessions…). */
export const NAVIGATEURS_CHROMIUM = ['chrome', 'edge', 'brave', 'vivaldi'] as const satisfies readonly NavigateurSource[]

export const NOMS_NAVIGATEURS: Record<NavigateurSource, string> = {
  chrome: 'Chrome',
  edge: 'Edge',
  brave: 'Brave',
  vivaldi: 'Vivaldi',
  firefox: 'Firefox',
  safari: 'Safari',
  orion: 'Orion'
}

export const estChromium = (n: NavigateurSource): boolean => (NAVIGATEURS_CHROMIUM as readonly string[]).includes(n)

export interface ProfilDetecte {
  navigateur: NavigateurSource
  /** Nom affiché dans le navigateur (« Khalil »), à défaut le nom du dossier. */
  nom: string
  /** Dossier du profil (Chromium : …/User Data/Default). Jamais écrit par Lyra. */
  chemin: string
  /** Dossier parent des profils (Chromium : « User Data », qui contient `Local State`). */
  racine: string
  /** Profil principal du navigateur (le dernier utilisé), à présélectionner. */
  parDefaut: boolean
  /** Le navigateur semble ouvert (verrou de profil présent) : la lecture se fait sur une copie, c'est sans danger. */
  ouvert?: boolean
}

// ---------------------------------------------------------------------------------------------------------------------
// Éléments importables (cases à cocher de l'interface)

export type ElementImport = 'favoris' | 'historique' | 'onglets' | 'moteurs' | 'extensions' | 'reglages'

export const ELEMENTS_IMPORT: readonly ElementImport[] = ['favoris', 'historique', 'onglets', 'moteurs', 'extensions', 'reglages']

/** Historique : fenêtre importée par défaut (« 92 jours » dans l'interface). */
export const JOURS_HISTORIQUE_PAR_DEFAUT = 92

/**
 * Nature d'un échec quand l'interface ou l'appelant peut vouloir réagir autrement qu'en affichant la raison :
 * - `verrouille` : fichier tenu par le navigateur ouvert (« fermez-le puis réessayez ») ;
 * - `acces` : accès refusé par le système (macOS : « Accès complet au disque » à accorder) ; la `raison` dit quoi faire ;
 * - `absent` : fichier absent ; `vide` : session valide sans aucun onglet ; `chiffre` : donnée chiffrée par le système ;
 * - `volumineux` : au-delà de la taille que Lyra accepte de lire ; `disque-plein` : copie temporaire impossible ;
 * - `memoire` : mémoire insuffisante ; `annule` : lecture abandonnée par l'appelant (`AbortSignal`).
 */
export type CodeErreurImport = 'verrouille' | 'acces' | 'absent' | 'vide' | 'chiffre' | 'volumineux' | 'disque-plein' | 'memoire' | 'annule'

/** Élément illisible : jamais d'exception qui remonte, une raison lisible par l'utilisateur. */
export interface Indisponible {
  indisponible: true
  raison: string
  code?: CodeErreurImport
}

export const indisponible = (raison: string, code?: CodeErreurImport): Indisponible => (code ? { indisponible: true, raison, code } : { indisponible: true, raison })

export const estIndisponible = (v: unknown): v is Indisponible =>
  typeof v === 'object' && v !== null && (v as Indisponible).indisponible === true && typeof (v as Indisponible).raison === 'string'

/** Erreur de lecture dont le message est destiné à l'utilisateur (`raison`), jamais un crash. */
export class ErreurImport extends Error {
  readonly code?: CodeErreurImport

  constructor(
    readonly raison: string,
    options?: { cause?: unknown; code?: CodeErreurImport }
  ) {
    super(raison, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ErreurImport'
    this.code = options?.code
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Favoris

export interface LienFavori {
  type: 'lien'
  titre: string
  url: string
  /** Date d'ajout (ms depuis 1970), 0 si inconnue. */
  date: number
}

export interface DossierFavori {
  type: 'dossier'
  titre: string
  date: number
  enfants: NoeudFavori[]
}

export type NoeudFavori = LienFavori | DossierFavori

export interface FavorisImportes {
  /** Contenu de la barre de favoris. */
  barre: NoeudFavori[]
  /** Autres favoris (et, si présents, favoris mobiles rangés dans un dossier). */
  autres: NoeudFavori[]
}

// ---------------------------------------------------------------------------------------------------------------------
// Historique

export interface Visite {
  url: string
  titre: string
  /** Dernière visite (ms depuis 1970). */
  date: number
  /** Nombre de visites dans la fenêtre importée (au moins 1). */
  visites: number
}

// ---------------------------------------------------------------------------------------------------------------------
// Onglets ouverts et groupes (→ constellations)

/** Couleurs de groupe communes aux navigateurs ; `couleurGroupeHex` donne un point de départ pour la palette de Lyra. */
export type CouleurGroupe = 'gris' | 'bleu' | 'rouge' | 'jaune' | 'vert' | 'rose' | 'violet' | 'cyan' | 'orange'

export const COULEURS_GROUPE: Record<CouleurGroupe, string> = {
  gris: '#5f6368',
  bleu: '#1a73e8',
  rouge: '#d93025',
  jaune: '#f9ab00',
  vert: '#1e8e3e',
  rose: '#d01884',
  violet: '#9334e6',
  cyan: '#007b83',
  orange: '#fa903e'
}

export interface OngletImporte {
  url: string
  titre: string
  /** Identifiant du groupe (voir `GroupeImporte.id`) dans la même fenêtre. */
  groupe?: string
  epingle?: boolean
}

export interface GroupeImporte {
  /** Identifiant propre au navigateur source, stable dans la fenêtre. */
  id: string
  /** Nom du groupe ; vide si l'utilisateur ne l'a pas nommé. */
  nom: string
  couleur: CouleurGroupe
}

export interface FenetreImportee {
  /** Dans l'ordre d'affichage. */
  onglets: OngletImporte[]
  groupes: GroupeImporte[]
}

export interface OngletsImportes {
  fenetres: FenetreImportee[]
}

// ---------------------------------------------------------------------------------------------------------------------
// Moteurs de recherche et mots-clés

export interface Moteur {
  nom: string
  /** Mot-clé de la barre d'adresse (« w » pour Wikipédia). */
  motCle: string
  /** Modèle d'adresse de recherche ; `%s` remplace les termes. */
  url: string
  /** Moteur de recherche par défaut du navigateur source (si connu). */
  parDefaut?: boolean
  /** Raccourci créé par l'utilisateur (par opposition aux moteurs proposés par le navigateur). */
  perso: boolean
}

// ---------------------------------------------------------------------------------------------------------------------
// Extensions

export interface ExtensionImportee {
  /** Identifiant dans le magasin d'origine (Chrome Web Store : 32 lettres a–p). */
  id: string
  nom: string
  /**
   * Magasin d'où elle vient. Lyra ne réinstalle depuis le réseau que celles du Chrome Web Store (jalon B) ;
   * `edge` (Edge Add-ons) et `firefox` (addons.mozilla.org) sont signalées pour l'aperçu ; `inconnu` : installée hors
   * magasin (à la main, dépaquetée) — le « 1 inconnue » de l'aperçu. Les extensions préinstallées ou internes du
   * navigateur ne sont jamais listées.
   */
  magasin: 'chrome' | 'edge' | 'firefox' | 'inconnu'
  /** Activée dans le navigateur source. */
  actif: boolean
  /** Imposée par une stratégie d'entreprise (Chromium `location` 7 ou 9) : décochée par défaut dans l'aperçu. */
  imposee?: boolean
}

// ---------------------------------------------------------------------------------------------------------------------
// Réglages transposables

export interface ReglagesImportes {
  pageAccueil?: string
  dossierTelechargement?: string
  /** Première langue préférée (étiquette BCP 47 telle que le navigateur l'écrit, ex. « fr-FR »). */
  langue?: string
  /** Facteur de zoom par hôte (1 = 100 %). */
  zoomParSite?: Record<string, number>
}

// ---------------------------------------------------------------------------------------------------------------------
// Ensemble

/** Éléments lus. Un élément non demandé est absent ; un élément illisible vaut `Indisponible`. */
export interface DonneesImportees {
  favoris?: FavorisImportes | Indisponible
  historique?: Visite[] | Indisponible
  onglets?: OngletsImportes | Indisponible
  moteurs?: Moteur[] | Indisponible
  extensions?: ExtensionImportee[] | Indisponible
  reglages?: ReglagesImportes | Indisponible
}

/** Chiffres de l'aperçu (« 1 284 favoris, 37 dossiers », « 23 onglets, 3 groupes »…). Absents si l'élément est indisponible. */
export interface Compteurs {
  favoris?: { favoris: number; dossiers: number }
  historique?: { pages: number; visites: number }
  onglets?: { fenetres: number; onglets: number; groupes: number }
  /** `moteurs` : moteurs proposés par le navigateur ; `motsCles` : raccourcis créés par l'utilisateur. */
  moteurs?: { moteurs: number; motsCles: number }
  /** `chrome` : réinstallables depuis le Chrome Web Store (« 5 sur 6 ») ; `edge`, `firefox` : autres magasins ; `inconnues` : hors magasin (« 1 inconnue »). */
  extensions?: { total: number; chrome: number; edge: number; firefox: number; inconnues: number }
  reglages?: { total: number }
}

export function compterFavoris(f: FavorisImportes): { favoris: number; dossiers: number } {
  let favoris = 0
  let dossiers = 0
  const parcourir = (noeuds: NoeudFavori[]): void => {
    for (const n of noeuds) {
      if (n.type === 'lien') favoris++
      else {
        dossiers++
        parcourir(n.enfants)
      }
    }
  }
  parcourir(f.barre)
  parcourir(f.autres)
  return { favoris, dossiers }
}

export function compter(d: DonneesImportees): Compteurs {
  const c: Compteurs = {}
  if (d.favoris && !estIndisponible(d.favoris)) c.favoris = compterFavoris(d.favoris)
  if (d.historique && !estIndisponible(d.historique)) {
    c.historique = { pages: d.historique.length, visites: d.historique.reduce((s, v) => s + v.visites, 0) }
  }
  if (d.onglets && !estIndisponible(d.onglets)) {
    const f = d.onglets.fenetres
    c.onglets = {
      fenetres: f.length,
      onglets: f.reduce((s, w) => s + w.onglets.length, 0),
      groupes: f.reduce((s, w) => s + w.groupes.length, 0)
    }
  }
  if (d.moteurs && !estIndisponible(d.moteurs)) {
    const perso = d.moteurs.filter((m) => m.perso).length
    c.moteurs = { moteurs: d.moteurs.length - perso, motsCles: perso }
  }
  if (d.extensions && !estIndisponible(d.extensions)) {
    const liste = d.extensions
    const dans = (m: ExtensionImportee['magasin']): number => liste.filter((e) => e.magasin === m).length
    c.extensions = { total: liste.length, chrome: dans('chrome'), edge: dans('edge'), firefox: dans('firefox'), inconnues: dans('inconnu') }
  }
  if (d.reglages && !estIndisponible(d.reglages)) {
    const r = d.reglages
    c.reglages = {
      total: [r.pageAccueil, r.dossierTelechargement, r.langue].filter((v) => v !== undefined).length + Object.keys(r.zoomParSite ?? {}).length
    }
  }
  return c
}

// ---------------------------------------------------------------------------------------------------------------------
// Résultat de l'application dans Lyra (jalon E, Task 3.3)

/** `ok` : tout est écrit ; `partiel` : écrit mais des éléments ont été ignorés ou la lecture s'est arrêtée en route ; `indisponible` : rien d'écrit ; `annule` : abandonné ; `ignore` : non demandé. */
export type EtatElement = 'ok' | 'partiel' | 'indisponible' | 'annule' | 'ignore'

export interface ElementResultat {
  etat: EtatElement
  ajoutes: number
  /** Déjà présents dans Lyra (rien d'écrit). */
  presents: number
  /** Refusés ou non transposables (schéma interdit, doublon dans la source, moteur absent de Lyra…). */
  ignores: number
  /** Arbitrages et précisions lisibles (mots-clés renommés, zoom conservé, langue ignorée, page d'accueil en attente…). */
  notes: string[]
  code?: CodeErreurImport
  raison?: string
}

export interface ResultatImport extends Record<ElementImport, ElementResultat> {
  /** Durée de l'application (ms). */
  duree: number
  source: NavigateurSource
  /** Nom du profil importé. */
  profil: string
}

export interface OptionsApplication {
  /** `courante` : tout dans la fenêtre courante (défaut) ; `nouvelle-par-fenetre` : une fenêtre Lyra par fenêtre importée. */
  fenetre: 'courante' | 'nouvelle-par-fenetre'
  /** Charger les 10 premières étoiles créées (sinon elles restent endormies). */
  ouvrirMaintenant: boolean
  /** L'utilisateur confirme que le moteur par défaut importé remplace celui de Lyra même s'il en avait déjà choisi un. */
  moteurParDefaut: boolean
  /** Identifiants des extensions imposées par une stratégie que l'utilisateur a explicitement cochées. */
  extensionsChoisies: string[]
}
