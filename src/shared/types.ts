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
}
