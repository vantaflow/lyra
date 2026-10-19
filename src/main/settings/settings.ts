import type { Settings } from '../../shared/types'
import { reglagesParDefaut } from './defaults'
import { JsonStore } from './store'

export interface Reglages {
  getSettings(): Settings
  setSettings(patch: Partial<Settings>): Settings
  /** Équivalent de l'évènement `settings:changed` ; renvoie la fonction de désabonnement. */
  onChanged(cb: (s: Settings) => void): () => void
}

export function creerReglages(chemin: string, dossierTelechargements: string): Reglages {
  const store = new JsonStore<Settings>(chemin, reglagesParDefaut(dossierTelechargements))
  return {
    getSettings: () => store.get(),
    setSettings: (patch) => store.set(patch),
    onChanged: (cb) => store.onChange(cb)
  }
}
