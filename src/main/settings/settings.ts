import type { Settings } from '../../shared/types'
import { reglagesParDefaut } from './defaults'
import { JsonStore } from './store'
import { validerPatch, validerSettings } from './validate'

export interface Reglages {
  getSettings(): Settings
  setSettings(patch: Partial<Settings>): Settings
  /** Équivalent de l'évènement `settings:changed` ; renvoie la fonction de désabonnement. */
  onChanged(cb: (s: Settings) => void): () => void
}

export function creerReglages(chemin: string, dossierTelechargements: string): Reglages {
  const defauts = reglagesParDefaut(dossierTelechargements)
  const store = new JsonStore<Settings>(chemin, defauts, (brut) => validerSettings(brut, defauts))
  return {
    getSettings: () => store.get(),
    setSettings: (patch) => store.set(validerPatch(patch) as Partial<Settings>),
    onChanged: (cb) => store.onChange(cb)
  }
}
