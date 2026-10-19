import type { Suggestion } from '../../shared/types'

/**
 * Suggestion à ouvrir sur ↩. Si la liste affichée ne correspond pas au texte courant
 * (réponse de palette:suggest pas encore arrivée), on renvoie undefined : main réinterprète la saisie.
 */
export function choixPourEntree(texte: string, listePour: string | null, liste: Suggestion[], sel: number): Suggestion | undefined {
  return listePour === texte ? liste[sel] : undefined
}
