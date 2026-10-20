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

function gelerProfond<T extends object>(o: T): T {
  for (const v of Object.values(o)) if (v && typeof v === 'object') gelerProfond(v)
  return Object.freeze(o)
}

/** Valeurs du thème « Indigo nuit » (design) : base qui complète un « Mes couleurs » incomplet. */
export const COULEURS_INDIGO_NUIT: CouleursTheme = gelerProfond({
  'ciel-fond': { clair: '#15152E', sombre: '#0E0E1E' },
  'ciel-texte': { clair: '#C9C9EA', sombre: '#C9C9EA' },
  'etoile-active': { clair: '#F4C56A', sombre: '#F4C56A' },
  'etoile-active-fond': { clair: '#262650', sombre: '#1E1E3C' },
  etoiles: { clair: '#A8A8D8', sombre: '#A8A8D8' },
  'etoiles-endormies': { clair: '#4E4E7A', sombre: '#44446A' },
  lignes: { clair: '#3B3B70', sombre: '#33335E' },
  'capsule-fond': { clair: '#FFFFFF', sombre: '#17172A' },
  'capsule-texte': { clair: '#1C1C2E', sombre: '#E8E8F4' },
  accent: { clair: '#5452C8', sombre: '#8B8AF0' },
  boucliers: { clair: '#1E7F6C', sombre: '#5FD3B3' },
  'pages-fond': { clair: '#F7F7FB', sombre: '#121214' },
  'nouvel-onglet-ciel': { clair: '#0F0F26', sombre: '#090916' }
})

export interface ScriptPerso {
  nom: string
  code: string
  actif: boolean
}

export type BouclierSite = boolean | 'desactives' | 'standard' | 'strict'

/** Ajouts de D à `RegleSite` (`boucliers` y est élargi, voir `types.ts`). */
export interface RegleSiteD {
  scriptletsYoutube?: boolean
  /** Niveau des Boucliers avant leur désactivation sur ce site (rétabli à la réactivation). */
  bouclierAvant?: 'standard' | 'strict'
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
  /** « À une heure fixe » : début de la plage sombre, `HH:MM` (24 h, heure locale). */
  heureSombre: string
  /** « À une heure fixe » : fin de la plage sombre (retour au clair), `HH:MM`. Début = fin : toujours sombre. */
  heureClair: string
  personnalisees: CouleursTheme | null
  /** Thème prêt dont « Mes couleurs » est la copie de départ (« modifié » se mesure par rapport à lui). */
  depart: NomTheme
  /** Thème importé servant de référence à « modifié » (prioritaire sur `depart`) ; null : `depart`. */
  reference: CouleursTheme | null
  /** Corrige automatiquement toute paire texte/fond sous 4,5:1 dans les variables diffusées (jamais la couleur enregistrée). */
  corrigerContraste: boolean
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
