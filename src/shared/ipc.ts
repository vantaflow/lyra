import type { Settings, SkyState } from './types'

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
  'tabs:move': [{ id: string; parentId?: string; index: number }, void]
  'tabs:pin': [{ id: string; pinned: boolean }, void]
  'tabs:reopen': [void, void]
  'sky:get': [void, SkyChange]
  /** Test uniquement (LYRA_TEST=1) : charge une URL dans la vue de page. */
  'test:navigate': [string, void]
}

/** Évènements main → renderer : canal → données. */
export type Evenements = {
  'settings:changed': Settings
  'sky:changed': SkyChange
  'palette:open': undefined
}

export type CanalRequete = keyof Requetes
export type CanalEvenement = keyof Evenements

/** API exposée par le preload UI sous window.lyra. */
export interface LyraApi {
  invoke<K extends CanalRequete>(canal: K, data?: Requetes[K][0]): Promise<Requetes[K][1]>
  on<K extends CanalEvenement>(canal: K, cb: (data: Evenements[K]) => void): () => void
  plateforme: NodeJS.Platform
}
