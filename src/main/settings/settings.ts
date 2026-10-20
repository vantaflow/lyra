import type { Settings } from '../../shared/types'
import { reglagesParDefaut } from './defaults'
import { JsonStore, conserverCopieCorrompue, fusion } from './store'
import { migrer } from './migrations'
import { moteursHerites, validerPatch } from './validate'
import { accueilImporteConsomme } from './accueil-importe'

export interface Reglages {
  getSettings(): Settings
  setSettings(patch: Partial<Settings>): Settings
  /** Retire `reseau.personnelle` (un patch ne peut pas supprimer de clé). */
  supprimerPersonnelle(): Settings
  /** Retire la règle d'un site (un patch ne peut pas supprimer de clé). */
  supprimerSite(cle: string): Settings
  /** Retire des champs d'une règle de site ; la règle disparaît si elle devient vide. */
  retirerChampsSite(cle: string, champs: readonly string[]): Settings
  /** Retire des champs d'une règle de site puis y fusionne `ecrire` (validé), en une seule écriture et une seule diffusion. */
  modifierSite(cle: string, ecrire: Record<string, unknown>, retirer: readonly string[]): Settings
  /** Applique la page d'accueil importée en attente (voir `accueil-importe.ts`) ; ne fait rien s'il n'y en a pas. */
  consommerAccueilImporte(): Settings
  /** Écrit tout de suite une écriture différée en attente (fermeture de l'application). */
  vider(): void
  /** Équivalent de l'évènement `settings:changed` ; renvoie la fonction de désabonnement. */
  onChanged(cb: (s: Settings) => void): () => void
}

/** `delaiEcritureMs` : intervalle minimal entre deux écritures disque (60 ms en production : un sélecteur de couleur en envoie en rafale). */
export function creerReglages(chemin: string, dossierTelechargements: string, delaiEcritureMs = 0): Reglages {
  const defauts = reglagesParDefaut(dossierTelechargements)
  const store = new JsonStore<Settings>(chemin, defauts, (brut) => {
    const { settings, avertissements } = migrer(brut, defauts)
    for (const a of avertissements) console.warn(`[reglages] ${a}`)
    if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) conserverCopieCorrompue(chemin)
    return settings
  }, delaiEcritureMs)
  return {
    getSettings: () => store.get(),
    setSettings: (patch) => {
      const valide = validerPatch(patch) as Record<string, unknown>
      // Une page renvoie la liste complète des moteurs : ceux hérités d'une version précédente ne sont pas perdus.
      const herites = moteursHerites(patch, valide.moteursPerso, store.get().moteursPerso as unknown as Array<Record<string, unknown>>)
      if (herites) valide.moteursPerso = herites
      return store.set(valide as Partial<Settings>)
    },
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
    modifierSite: (cle, ecrire, retirer) =>
      store.remplacer((s) => {
        const valide = (validerPatch({ sites: { [cle]: ecrire } } as Partial<Settings>).sites ?? {})[cle] ?? {}
        const existante = Object.hasOwn(s.sites, cle) ? s.sites[cle] : {}
        const reste = Object.fromEntries(Object.entries(existante).filter(([k]) => !retirer.includes(k)))
        const regle = fusion(reste, valide)
        const { [cle]: _ancienne, ...autres } = s.sites
        return { ...s, sites: Object.keys(regle).length ? { ...autres, [cle]: regle } : autres }
      }),
    consommerAccueilImporte: () => store.remplacer((s) => accueilImporteConsomme(s) ?? s),
    vider: () => store.vider(),
    onChanged: (cb) => store.onChange(cb)
  }
}
