// Variables CSS venues du canal de thème : seuls un nom `--xxx` et une couleur (#hex, rgb(), rgba()) sont acceptés (jamais url(), calc…).
const NOM_VARIABLE = /^--[a-z0-9-]+$/
const VALEUR_COULEUR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\))$/

/** Couples [nom, valeur en minuscules] valides ; les autres sont ignorés. */
export function variablesValides(variables: Record<string, string>): Array<[string, string]> {
  return Object.entries(variables)
    .filter(([nom, valeur]) => NOM_VARIABLE.test(nom) && typeof valeur === 'string' && VALEUR_COULEUR.test(valeur))
    .map(([nom, valeur]) => [nom, valeur.toLowerCase()])
}
