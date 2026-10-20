import { variablesApparence, type VariablesApparence } from '../../shared/apparence'
import type { Settings } from '../../shared/types'

export interface ThemeInitial {
  mode: string
  variables: Record<string, string>
  /** Police, taille, densité et coins : posés avec le thème avant le premier rendu (sinon l'overlay s'ouvre une image en Manrope). */
  apparence: VariablesApparence
}

/** Réponse synchrone `theme:initial` des preloads des vues Lyra. */
export function themeInitial(
  t: { mode: string; variables: Record<string, string>; privee: Record<string, string> },
  privee: boolean,
  apparence: Settings['apparence']
): ThemeInitial {
  return { mode: t.mode, variables: privee ? t.privee : t.variables, apparence: variablesApparence(apparence) }
}

/** Déclarations CSS des variables d'apparence (valeurs issues de listes fixes du main : jamais de texte venu d'une page). */
export const declarationsApparence = (a: VariablesApparence): string =>
  Object.entries(a)
    .map(([nom, valeur]) => `${nom}:${valeur}`)
    .join(';')
