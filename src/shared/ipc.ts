import type { Settings, SkyState, Suggestion } from './types'

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
}

/** État des Boucliers pour l'étoile active d'une fenêtre. */
export interface EtatBoucliers {
  actif: boolean
  bloques: number
  /** Origine de la page (« https://hôte », « file:// ») ; '' pour une page interne. */
  origine: string
  /** 20 dernières adresses bloquées, la plus récente d'abord. */
  dernieres: string[]
}

export type RouteOverlay = 'palette' | 'shields'

export interface SkyChange {
  sky: SkyState
  etats: Record<string, EtatEtoile>
}

/** Requêtes renderer → main : canal → [données, réponse]. Complétée par les tâches suivantes. */
export type Requetes = {
  'settings:get': [void, Settings]
  'settings:set': [Partial<Settings>, Settings]
  'layout:get': [void, { ciel: Settings['ciel']; bounds: { chrome: RectIpc; page: RectIpc; overlay: RectIpc } }]
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
  'shields:stats': [void, { semaine: number; date: string; source: string }]
  /** Chrome → main : ouvre le panneau des Boucliers dans l'overlay. */
  'shields:open': [void, void]
  /** Overlay → main : referme l'overlay (Échap, clic à côté). */
  'overlay:close': [void, void]
  /** Test uniquement (LYRA_TEST=1) : charge une URL dans la vue de page. */
  'test:navigate': [string, void]
  /** Test uniquement (LYRA_TEST=1) : dernière URL demandée par la palette. */
  'test:lastNavigation': [void, string | null]
}

/** Évènements main → renderer : canal → données. */
export type Evenements = {
  'settings:changed': Settings
  'sky:changed': SkyChange
  /** Main → overlay : la palette s'affiche. */
  'palette:open': { texteInitial?: string }
  /** Main → overlay : panneau à afficher. */
  'overlay:route': RouteOverlay
  /** Main → chrome : le compteur ou l'état des Boucliers de l'étoile active a changé. */
  'shields:changed': EtatBoucliers
}

export type CanalRequete = keyof Requetes
export type CanalEvenement = keyof Evenements

/** API exposée par le preload UI sous window.lyra. */
export interface LyraApi {
  invoke<K extends CanalRequete>(canal: K, data?: Requetes[K][0]): Promise<Requetes[K][1]>
  on<K extends CanalEvenement>(canal: K, cb: (data: Evenements[K]) => void): () => void
  plateforme: NodeJS.Platform
}
