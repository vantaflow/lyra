/** Raccourcis que la page ne doit pas avaler (traités dans `before-input-event`). */
import { correspond } from '../../shared/accelerateur'
import { COMMANDES, tableEffective, type RaccourciPage } from '../../shared/commandes'

export type { RaccourciPage }

/** Touche minimale d'un `before-input-event`. */
export interface ToucheEntree {
  type: string
  key: string
  code?: string
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  isAutoRepeat: boolean
}

/**
 * Le raccourci de la touche, ou null. `table` : `Settings.raccourcis` (commande → accélérateur, vide = défaut).
 * `agir` est faux pour une répétition automatique (touche maintenue) : l'événement reste consommé (ni la page ni le
 * menu ne le rejouent) mais l'action n'est déclenchée qu'une fois.
 */
export function raccourciPage(
  t: ToucheEntree,
  table: Record<string, string> = {},
  plateforme: string = process.platform
): { nom: RaccourciPage; agir: boolean } | null {
  if (t.type !== 'keyDown') return null
  // Toute frappe passe ici : une combinaison attribuable porte toujours ⌘/Ctrl ou une touche F, la saisie ordinaire sort tout de suite.
  if (!t.control && !t.meta && !/^F\d+$/.test(t.key)) return null
  const effective = tableEffective(table, plateforme)
  for (const c of COMMANDES) {
    if (c.page && effective[c.id] && correspond(effective[c.id], t, plateforme)) return { nom: c.page, agir: !t.isAutoRepeat }
  }
  return null
}

/**
 * La page `lyra://settings#/raccourcis` capte elle-même les touches pour redéfinir un raccourci : `before-input-event`
 * ne doit pas les traiter avant elle (sinon ⌘ L ouvrirait la palette au lieu d'être capturé).
 */
export function pageDeReglagesEnCapture(url: string): boolean {
  return /^lyra:\/\/settings\/?#\/raccourcis(\/|$)/.test(url)
}
