/**
 * Blocage d'une extension par une règle plus large (module pur) : `extensions[id] === false` sur `*.d.fr` ou sur l'hôte `d.fr` bloque
 * aussi `www.d.fr` (le motif de correspondance des scripts de contenu n'exprime pas d'exception : la règle large l'emporte).
 */
import type { RegleSite } from './types'
import { cleDe } from '../main/settings/sites'

/** Hôte (minuscules) visé par une clé de règle ; '' pour une origine `file://`. */
function hoteDeCle(cle: string): string | null {
  const c = cleDe(cle)
  if (!c) return null
  if (c.type === 'motif' || c.type === 'hote') return c.valeur
  if (c.valeur === 'file://') return ''
  try {
    return new URL(c.valeur).hostname
  } catch {
    return null
  }
}

/** Clé de la règle PLUS LARGE (motif `*.d` ou hôte `d` couvrant la clé donnée) qui bloque l'extension ; null si aucune. */
export function bloqueePar(sites: Record<string, RegleSite>, cle: string, id: string): string | null {
  const cible = cleDe(cle)
  const hote = hoteDeCle(cle)
  if (!cible || !hote) return null
  const bloquants: string[] = []
  for (const [k, r] of Object.entries(sites)) {
    if (k === cle || r?.extensions?.[id] !== false) continue
    const c = cleDe(k)
    if (!c) continue
    // `*.d` couvre `d` et ses sous-domaines (sauf un motif identique, déjà exclu : k === cle).
    if (c.type === 'motif' && (hote === c.valeur || hote.endsWith(`.${c.valeur}`)) && !(cible.type === 'motif' && cible.valeur === c.valeur)) bloquants.push(k)
    // `d` (hôte nu) couvre ses origines (`https://d:8443`) ; ni un motif ni un autre hôte.
    else if (c.type === 'hote' && cible.type === 'origine' && c.valeur === hote) bloquants.push(k)
  }
  return bloquants.sort()[0] ?? null
}
