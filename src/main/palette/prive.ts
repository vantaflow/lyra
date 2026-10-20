import type { Settings } from '../../shared/types'

/**
 * L'historique et les favoris du profil normal peuvent-ils être proposés par la palette ?
 * Une fenêtre privée ne les propose que si `palette.suggestionsEnPrivee` est activé (défaut : non).
 */
export function suggestionsDuProfilAutorisees(privee: boolean, palette: Pick<Settings['palette'], 'suggestionsEnPrivee'>): boolean {
  return !privee || palette.suggestionsEnPrivee
}
