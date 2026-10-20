import type { Settings } from '../../shared/types'
import { reglagesParDefaut } from './defaults'
import { JsonStore, conserverCopieCorrompue } from './store'
import { migrer } from './migrations'
import { validerPatch } from './validate'

export interface Reglages {
  getSettings(): Settings
  setSettings(patch: Partial<Settings>): Settings
  /** Retire `reseau.personnelle` (un patch ne peut pas supprimer de clé). */
  supprimerPersonnelle(): Settings
  /** Retire la règle d'un site (un patch ne peut pas supprimer de clé). */
  supprimerSite(cle: string): Settings
  /** Retire des champs d'une règle de site ; la règle disparaît si elle devient vide. */
  retirerChampsSite(cle: string, champs: readonly string[]): Settings
  /** Équivalent de l'évènement `settings:changed` ; renvoie la fonction de désabonnement. */
  onChanged(cb: (s: Settings) => void): () => void
}

export function creerReglages(chemin: string, dossierTelechargements: string): Reglages {
  const defauts = reglagesParDefaut(dossierTelechargements)
  const store = new JsonStore<Settings>(chemin, defauts, (brut) => {
    const { settings, avertissements } = migrer(brut, defauts)
    for (const a of avertissements) console.warn(`[reglages] ${a}`)
    if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) conserverCopieCorrompue(chemin)
    return settings
  })
  return {
    getSettings: () => store.get(),
    setSettings: (patch) => store.set(validerPatch(patch) as Partial<Settings>),
    supprimerPersonnelle: () =>
      store.remplacer((s) => {
        const { personnelle: _retiree, ...reseau } = s.reseau
        return { ...s, reseau }
      }),
    supprimerSite: (cle) =>
      store.remplacer((s) => {
        const { [cle]: _retiree, ...sites } = s.sites
        return { ...s, sites }
      }),
    retirerChampsSite: (cle, champs) =>
      store.remplacer((s) => {
        const regle = Object.hasOwn(s.sites, cle) ? s.sites[cle] : undefined
        if (!regle) return s
        const reste = Object.fromEntries(Object.entries(regle).filter(([k]) => !champs.includes(k)))
        const { [cle]: _ancienne, ...autres } = s.sites
        return { ...s, sites: Object.keys(reste).length ? { ...autres, [cle]: reste } : autres }
      }),
    onChanged: (cb) => store.onChange(cb)
  }
}
