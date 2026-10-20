import type { Settings } from '../../shared/types'

/**
 * L'historique et les favoris du profil normal peuvent-ils être proposés par la palette ?
 * Une fenêtre privée ne les propose que si `palette.suggestionsEnPrivee` est activé (défaut : non).
 */
export function suggestionsDuProfilAutorisees(privee: boolean, palette: Pick<Settings['palette'], 'suggestionsEnPrivee'>): boolean {
  return !privee || palette.suggestionsEnPrivee
}

/** Sources que la palette peut proposer : `palette.suggestionsHistorique` / `suggestionsFavoris`, et la règle des fenêtres privées. */
export function sourcesDeSuggestions(privee: boolean, palette: Settings['palette']): { historique: boolean; favoris: boolean } {
  const autorise = suggestionsDuProfilAutorisees(privee, palette)
  return { historique: autorise && palette.suggestionsHistorique, favoris: autorise && palette.suggestionsFavoris }
}
