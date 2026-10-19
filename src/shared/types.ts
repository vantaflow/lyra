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
}

export interface RegleSite {
  /** false : Boucliers désactivés sur ce site. Absent : actifs. */
  boucliers?: boolean
}

export interface HistoryEntry {
  url: string
  title: string
  /** Horodatage de la dernière visite (ms). */
  visitedAt?: number
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
