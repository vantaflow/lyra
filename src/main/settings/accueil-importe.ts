/**
 * Page d'accueil importée d'un autre navigateur : l'importeur la dépose dans `import.reglagesEnAttente.pageAccueil`
 * (il ne connaissait pas `demarrage.pageAccueil`) ; le processus principal la consomme ici, une seule fois.
 */
import type { Settings } from '../../shared/types'
import { adresseWebValide } from '../../shared/accueil'
import type { Reglages } from './settings'

/**
 * Réglages après consommation de la page d'accueil en attente, ou `null` s'il n'y en a pas.
 * Copiée seulement si `demarrage.pageAccueil` est vide (une valeur choisie n'est jamais écrasée) et si c'est une adresse http(s) ;
 * dans tous les cas l'entrée en attente est vidée (elle ne reviendrait pas après un effacement volontaire).
 */
export function accueilImporteConsomme(s: Settings): Settings | null {
  const enAttente = s.import.reglagesEnAttente.pageAccueil
  if (enAttente === undefined) return null
  const { pageAccueil: _consommee, ...reste } = s.import.reglagesEnAttente
  const copier = s.demarrage.pageAccueil.trim() === '' && adresseWebValide(enAttente)
  return {
    ...s,
    demarrage: copier ? { ...s.demarrage, pageAccueil: enAttente } : s.demarrage,
    import: { ...s.import, reglagesEnAttente: reste }
  }
}

/** Consomme au démarrage, puis à chaque import qui dépose une page d'accueil. Renvoie la fonction de désabonnement. */
export function installerAccueilImporte(reglages: Pick<Reglages, 'getSettings' | 'onChanged' | 'consommerAccueilImporte'>): () => void {
  const consommer = (s: Settings): void => {
    if (s.import.reglagesEnAttente.pageAccueil !== undefined) reglages.consommerAccueilImporte()
  }
  consommer(reglages.getSettings())
  return reglages.onChanged(consommer)
}
