/** Raccourcis que la page ne doit pas avaler (traités dans `before-input-event`). */

export type RaccourciPage = 'palette' | 'nouvelle-etoile' | 'recherche' | 'ne-pas-deranger'

/** Touche minimale d'un `before-input-event`. */
export interface ToucheEntree {
  type: string
  key: string
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  isAutoRepeat: boolean
}

/**
 * Le raccourci de la touche, ou null. `agir` est faux pour une répétition automatique (touche maintenue) : l'événement
 * reste consommé (ni la page ni le menu ne le rejouent) mais l'action n'est déclenchée qu'une fois.
 */
export function raccourciPage(t: ToucheEntree): { nom: RaccourciPage; agir: boolean } | null {
  if (t.type !== 'keyDown' || !(t.control || t.meta) || t.alt) return null
  const k = t.key.toLowerCase()
  const nom: RaccourciPage | null =
    k === 'l' && !t.shift ? 'palette' : k === 't' && !t.shift ? 'nouvelle-etoile' : k === 'f' && !t.shift ? 'recherche' : k === 'd' && t.shift ? 'ne-pas-deranger' : null
  return nom ? { nom, agir: !t.isAutoRepeat } : null
}
