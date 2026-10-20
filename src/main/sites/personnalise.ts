/**
 * Style et scripts personnalisés : ceux du site (règle résolue, la plus précise gagne) et ceux de la portée globale
 * (`Settings.styles`, section « Styles et scripts » : le champ dédié tient lieu de règle `*`, que les clés de `sites` n'admettent pas).
 * Modules purs ; le preload des pages applique le résultat (style avant le premier rendu, scripts dans un monde isolé).
 * Jamais sur une page interne (`lyra://`, extensions, pages d'erreur), ni sur une adresse non web : seules les pages http(s) en reçoivent.
 */
import type { RegleSite, ScriptPerso, Settings } from '../../shared/types'
import { resoudre } from '../settings/sites'

/** Monde isolé des scripts personnalisés : propre à Lyra, jamais le monde principal (0) ni ceux d'Electron (≤ 999). */
export const MONDE_SCRIPTS_PERSO = 1013

export type ReglagesGlobauxPerso = Settings['styles']

const estWeb = (url: string): boolean => /^https?:\/\//i.test(url)

/** Style à appliquer à une page : global puis site (le site vient après, il l'emporte à spécificité égale) ; '' si rien. */
export function stylePerso(globaux: ReglagesGlobauxPerso, sites: Record<string, RegleSite>, url: string): string {
  if (!estWeb(url)) return ''
  return [globaux.css, resoudre(sites, url).style ?? ''].filter((c) => c.length > 0).join('\n')
}

/** Scripts actifs à exécuter dans une page : globaux d'abord, puis ceux du site ; [] hors page web. */
export function scriptsPersoApplicables(globaux: ReglagesGlobauxPerso, sites: Record<string, RegleSite>, url: string): Array<Pick<ScriptPerso, 'nom' | 'code'>> {
  if (!estWeb(url)) return []
  return [...globaux.scripts, ...(resoudre(sites, url).scriptsPerso ?? [])].filter((s) => s.actif).map((s) => ({ nom: s.nom, code: s.code }))
}
