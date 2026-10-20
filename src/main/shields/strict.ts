/**
 * Niveau « Strict » des Boucliers : le moteur standard (unique) plus une garde « script tiers hors liste ».
 * Pur : aucune dépendance Electron, la décision ne dépend que des URL.
 */
import { parse } from 'tldts-experimental'

/** CDN de bibliothèques et de polices que beaucoup de sites chargent légitimement (sous-domaines compris). */
export const CDN_CONNUS: readonly string[] = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'ajax.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'code.jquery.com',
  'stackpath.bootstrapcdn.com',
  'maxcdn.bootstrapcdn.com'
]

const WEB = /^https?:/i

const sousDomaineDe = (hote: string, parent: string): boolean => hote === parent || hote.endsWith(`.${parent}`)

/** Domaine enregistrable, ou l'hôte lui-même (IP, localhost). */
const racine = (hote: string, url: string): string => parse(url).domain ?? hote

/**
 * Vrai si la requête doit être bloquée en Strict : un `script` http(s), hors de la 1re partie (même domaine
 * enregistrable que la page de premier niveau) et hors des CDN connus. Page inconnue → autorisé.
 */
export function bloqueScriptTiers(url: string, type: string | undefined, urlHaut: string): boolean {
  if (type !== 'script' || !WEB.test(url)) return false
  let hote: string
  try {
    hote = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (CDN_CONNUS.some((c) => sousDomaineDe(hote, c))) return false
  let hoteHaut: string
  try {
    const u = new URL(urlHaut)
    if (u.protocol === 'file:') return true
    if (!WEB.test(u.protocol)) return false
    hoteHaut = u.hostname.toLowerCase()
  } catch {
    return false
  }
  return racine(hote, url) !== racine(hoteHaut, urlHaut)
}
