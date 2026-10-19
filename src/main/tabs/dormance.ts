/** Ce qu'il faut savoir d'une étoile pour décider de l'endormir. Pur, sans Electron. */
export interface EtatDormance {
  active: boolean
  epinglee: boolean
  audible: boolean
  chargement: boolean
  dormante: boolean
}

/**
 * Jamais d'étoile active, épinglée, qui joue du son ou se charge encore.
 * Hors v1 : une page avec un formulaire modifié (beforeunload) peut être endormie ; sa détection
 * demanderait du code dans le preload page (Boucliers), volontairement laissé intact.
 */
export function peutEndormir(e: EtatDormance): boolean {
  return !e.active && !e.epinglee && !e.audible && !e.chargement && !e.dormante
}
