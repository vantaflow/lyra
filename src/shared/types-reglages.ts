/** Types des réglages du jalon D (schéma v2) ; réexportés par `types.ts`. Purs : aucune dépendance à Electron. */
import type { DureeDnd } from './ipc'

/** Thèmes prêts + « Mes couleurs » (valeurs : `themes.ts`). */
export type NomTheme = 'indigo-nuit' | 'encre' | 'foret' | 'sable' | 'aurore' | 'clair-total' | 'nuit-complete' | 'mes-couleurs'
export const NOMS_THEMES: readonly NomTheme[] = ['indigo-nuit', 'encre', 'foret', 'sable', 'aurore', 'clair-total', 'nuit-complete', 'mes-couleurs']

/** Les 13 éléments colorables, dans l'ordre du design. */
export type CleCouleur =
  | 'ciel-fond' | 'ciel-texte' | 'etoile-active' | 'etoile-active-fond' | 'etoiles' | 'etoiles-endormies' | 'lignes'
  | 'capsule-fond' | 'capsule-texte' | 'accent' | 'boucliers' | 'pages-fond' | 'nouvel-onglet-ciel'
export const CLES_COULEUR: readonly CleCouleur[] = [
  'ciel-fond', 'ciel-texte', 'etoile-active', 'etoile-active-fond', 'etoiles', 'etoiles-endormies', 'lignes',
  'capsule-fond', 'capsule-texte', 'accent', 'boucliers', 'pages-fond', 'nouvel-onglet-ciel'
]
/** Une couleur `#RRGGBB` en clair et en sombre pour chaque élément. */
export type CouleursTheme = Record<CleCouleur, { clair: string; sombre: string }>

export interface ScriptPerso {
  nom: string
  code: string
  actif: boolean
}

export type BouclierSite = boolean | 'desactives' | 'standard' | 'strict'

/** Ajouts de D à `RegleSite` (`boucliers` y est élargi, voir `types.ts`). */
export interface RegleSiteD {
  scriptletsYoutube?: boolean
  cookies?: 'tous' | 'premiere-partie' | 'bloques' | 'session'
  scripts?: 'autorises' | 'bloques'
  lectureAuto?: 'autoriser' | 'sans-son' | 'bloquer'
  /** Clé d'un profil de user-agent nommé. */
  ua?: string
  /** CSS personnalisé du site (100 Ko au plus). */
  style?: string
  /** Scripts personnalisés du site (50 au plus, 100 Ko chacun). */
  scriptsPerso?: ScriptPerso[]
}

export interface ReglagesApparence {
  relierEnfants: boolean
  iconesSites: boolean
  /** Archive les étoiles éteintes depuis N jours ; null : jamais. */
  archiverApresJours: number | null
  nouvelleEtoile: 'sous-active' | 'fin-constellation' | 'hors-constellation'
  regrouperParSite: boolean
  police: string
  /** 11 à 17 px. */
  tailleTexte: number
  densite: 'confortable' | 'compacte'
  coinsArrondis: boolean
  capsuleAuto: boolean
}

export interface ReglagesCouleurs {
  actif: NomTheme
  /** Thème des fenêtres privées. */
  privee: NomTheme
  passage: 'systeme' | 'coucher' | 'heure' | 'jamais'
  personnalisees: CouleursTheme | null
  cielTeinteParSite: boolean
  couleurParConstellation: boolean
  prefersColorScheme: boolean
}

/** Blocs du jalon D, placés en fin de `Settings`. */
export interface ReglagesD {
  apparence: ReglagesApparence
  couleurs: ReglagesCouleurs
  palette: { suggestionsHistorique: boolean; suggestionsFavoris: boolean; suggestionsEnPrivee: boolean }
  /** Effacé à la fermeture. */
  confidentialite: { effacerHistorique: boolean; effacerCookies: boolean; effacerCache: boolean }
  /** Commande → accélérateur ; vide = défaut. */
  raccourcis: Record<string, string>
  gestes: { defilementHorizontal: boolean; clicMolette: boolean; molettePlusCmdZoom: boolean }
  dnd: { duree: DureeDnd }
  demarrage: { restaurer: boolean; pageAccueil: string; nouvelleFenetre: 'accueil' | 'session' | 'vide' }
  styles: { css: string; scripts: ScriptPerso[] }
  labo: Record<string, boolean>
}
