import type { Settings } from '../../shared/types'
import { reglagesParDefaut } from './defaults'
import { JsonStore } from './store'
import { validerPatch, validerSettings } from './validate'

export interface Reglages {
  getSettings(): Settings
  setSettings(patch: Partial<Settings>): Settings
  /** Retire `reseau.personnelle` (un patch ne peut pas supprimer de clé). */
  supprimerPersonnelle(): Settings
  /** Équivalent de l'évènement `settings:changed` ; renvoie la fonction de désabonnement. */
  onChanged(cb: (s: Settings) => void): () => void
}

export function creerReglages(chemin: string, dossierTelechargements: string): Reglages {
  const defauts = reglagesParDefaut(dossierTelechargements)
  const store = new JsonStore<Settings>(chemin, defauts, (brut) => validerSettings(brut, defauts))
  return {
    getSettings: () => store.get(),
    setSettings: (patch) => store.set(validerPatch(patch) as Partial<Settings>),
    supprimerPersonnelle: () =>
      store.remplacer((s) => {
        const { personnelle: _retiree, ...reseau } = s.reseau
        return { ...s, reseau }
      }),
    onChanged: (cb) => store.onChange(cb)
  }
}
