/**
 * Cookies par site (règle `cookies`) : « 1re partie » retire les `Set-Cookie` tiers (et n'envoie pas les cookies aux tiers),
 * « Bloqués » les retire tous, « Session seulement » retire `Expires` / `Max-Age` des `Set-Cookie` de la page (cookies de session :
 * ils ne survivent pas à la fermeture de l'application ; ceux d'autres sites ne sont jamais purgés).
 * La règle et la « 1re partie » sont celles de la page principale (domaine enregistrable, section privée de la PSL comprise).
 * `document.cookie` et `cookieStore` ne passent pas par `webRequest` : `cookiesJsNeutralises` dit au preload des pages (par frame)
 * s'il faut les neutraliser. Les cookies déjà enregistrés et ceux posés hors page (service worker) sont traités par `cookiesVises`
 * (suppression à l'écriture de la règle, au démarrage, à la fermeture et à l'insertion pour « Bloqués »).
 */
import type { RegleSite, Settings } from '../../shared/types'
import { hautConnu, origineDe } from '../session/pageHaute'
import type { DetailsEntetes, DetailsEnvoi, ReponseEntetes, ReponseEnvoi } from '../session/webRequestHub'
import { cleDe, resoudre } from '../settings/sites'
import { memePartie } from './domaine'
import { sansEntetes } from './entetes'

type Sites = Settings['sites']

export interface DepsCookies {
  sites: () => Sites
  /** Horloge injectable (test). */
  maintenant?: () => number
}

/** Une requête (ou sa réponse) doit-elle perdre ses cookies ? `haut` : page principale ('' si inconnue : on ne touche à rien). */
function retire(mode: RegleSite['cookies'], url: string, haut: string): boolean {
  if (haut === '') return false
  if (mode === 'bloques') return true
  return mode === 'premiere-partie' && !memePartie(url, haut)
}

/** `Set-Cookie` sans `Expires` ni `Max-Age` (cookie de session) ; un cookie qui s'expire lui-même (suppression par le serveur) reste tel quel. */
export function sansExpiration(valeur: string, maintenant: number = Date.now()): string {
  const [debut, ...attributs] = valeur.split(';')
  const nom = (a: string): string => a.split('=')[0].trim().toLowerCase()
  const val = (a: string): string => a.slice(a.indexOf('=') + 1).trim()
  const maxAge = attributs.find((a) => nom(a) === 'max-age')
  const expires = attributs.find((a) => nom(a) === 'expires')
  // Max-Age l'emporte sur Expires (RFC 6265) ; sans les deux, rien à retirer.
  if (maxAge !== undefined && /^-?\d+$/.test(val(maxAge))) {
    if (Number.parseInt(val(maxAge), 10) <= 0) return valeur
  } else if (expires !== undefined) {
    const t = Date.parse(val(expires))
    if (Number.isFinite(t) && t <= maintenant) return valeur
  }
  if (maxAge === undefined && expires === undefined) return valeur
  return [debut, ...attributs.filter((a) => nom(a) !== 'max-age' && nom(a) !== 'expires')].join(';')
}

/** « Session seulement » : tous les `Set-Cookie` de la réponse deviennent des cookies de session ; `undefined` si rien ne change. */
function enSession(entetes: Record<string, string[] | string> | undefined, estSetCookie: (k: string) => boolean, maintenant: number): ReponseEntetes | undefined {
  if (!entetes) return undefined
  let change = false
  const responseHeaders: Record<string, string[] | string> = {}
  for (const [k, v] of Object.entries(entetes)) {
    if (!estSetCookie(k)) {
      responseHeaders[k] = v
      continue
    }
    const liste = (Array.isArray(v) ? v : [v]).map((x) => sansExpiration(x, maintenant))
    if (liste.some((x, i) => x !== (Array.isArray(v) ? v : [v])[i])) change = true
    responseHeaders[k] = Array.isArray(v) ? liste : liste[0]
  }
  return change ? { responseHeaders } : undefined
}

/**
 * Les cookies JavaScript (`document.cookie`, `cookieStore`) de CETTE frame doivent-ils être neutralisés ?
 * `urlHaut` : page principale (la règle est la sienne) ; `urlFrame` : adresse de la frame ('' si elle n'a pas d'origine web : fail-closed).
 * « Bloqués » : toutes les frames. « 1re partie » : les frames d'un autre site que la page principale.
 */
export function cookiesJsNeutralises(sites: Sites, urlHaut: string, urlFrame: string): boolean {
  const mode = resoudre(sites, origineDe(urlHaut)).cookies
  if (mode === 'bloques') return true
  return mode === 'premiere-partie' && !memePartie(urlFrame, urlHaut)
}

export function ecouteursCookies(deps: DepsCookies): {
  entetes(d: DetailsEntetes): ReponseEntetes | void
  envoi(d: DetailsEnvoi): ReponseEnvoi | void
} {
  const modeDe = (haut: string): RegleSite['cookies'] => resoudre(deps.sites(), origineDe(haut)).cookies
  const estSetCookie = (k: string): boolean => k.toLowerCase() === 'set-cookie'
  const estCookie = (k: string): boolean => k.toLowerCase() === 'cookie'
  return {
    entetes(d) {
      const haut = hautConnu(d)
      const mode = modeDe(haut)
      if (mode === undefined || mode === 'tous') return
      if (mode === 'session') return enSession(d.responseHeaders, estSetCookie, deps.maintenant?.() ?? Date.now())
      if (!retire(mode, d.url, haut)) return
      const responseHeaders = sansEntetes(d.responseHeaders, estSetCookie)
      return responseHeaders ? { responseHeaders } : undefined
    },
    envoi(d) {
      const haut = hautConnu(d)
      if (!retire(modeDe(haut), d.url, haut)) return
      const requestHeaders = sansEntetes(d.requestHeaders, estCookie)
      return requestHeaders ? { requestHeaders } : undefined
    }
  }
}

/** Ce qu'il faut d'un cookie d'Electron (`domain`, `path` et `secure` y sont facultatifs). */
export interface CookieMin {
  domain?: string
  name: string
  path?: string
  secure?: boolean
}

export type ModeCookies = 'session' | 'bloques'
export const MODES_PURGE: ReadonlySet<ModeCookies> = new Set(['session', 'bloques'])
export const MODE_BLOQUES: ReadonlySet<ModeCookies> = new Set(['bloques'])

/** Site d'une règle : hôte, et motif (`*.hôte` : sous-domaines). L'origine exacte (port, schéma) ne compte pas pour un cookie. */
interface Cible {
  hote: string
  motif: boolean
}
const cibles = new WeakMap<object, Map<string, Cible[]>>()

/** Sites dont la règle EFFECTIVE de cookies est l'un des `modes` (clés d'origine `http://` et avec port comprises). Mémorisé par objet `sites`. */
export function ciblesCookies(sites: Sites, modes: ReadonlySet<ModeCookies>): Cible[] {
  const cle = [...modes].sort().join()
  let parModes = cibles.get(sites)
  if (!parModes) cibles.set(sites, (parModes = new Map()))
  const en = parModes.get(cle)
  if (en) return en
  const liste: Cible[] = []
  for (const [k, r] of Object.entries(sites)) {
    if (!r.cookies || !(modes as ReadonlySet<string>).has(r.cookies)) continue
    const c = cleDe(k)
    if (!c || c.valeur === 'file://') continue
    const hote = c.type === 'origine' ? new URL(c.valeur).hostname.replace(/^\[|\]$/g, '') : c.valeur
    // La règle plus précise peut contredire celle-ci pour ce site : seule la règle effective compte.
    const rep = c.type === 'origine' ? c.valeur : c.type === 'hote' ? `https://${hote}` : `https://x.${hote}`
    const effectif = resoudre(sites, rep).cookies
    if (effectif && (modes as ReadonlySet<string>).has(effectif)) liste.push({ hote, motif: c.type === 'motif' })
  }
  parModes.set(cle, liste)
  return liste
}

/**
 * Cookies qui relèvent d'un site dont la règle est l'un des `modes` : cookie de cet hôte, cookie de domaine d'un parent de cet hôte
 * seulement si la règle résolue pour ce parent est elle-même visée, ou, pour un motif `*.hôte`, cookie d'un sous-domaine.
 * Les cookies d'un autre site (tiers d'un iframe) ne sont jamais visés. Une règle d'origine avec port (`https://hôte:8443`) vise les cookies
 * de l'hôte pour tous les ports (un cookie n'a ni port ni schéma).
 */
export function cookiesVises<C extends CookieMin>(cookies: readonly C[], sites: Sites, modes: ReadonlySet<ModeCookies>): C[] {
  const liste = ciblesCookies(sites, modes)
  if (liste.length === 0) return []
  return cookies.filter((c) => {
    if (!c.domain) return false
    const domaine = c.domain.startsWith('.')
    const d = c.domain.replace(/^\./, '').toLowerCase()
    return liste.some((t) => {
      if (!t.motif) {
        if (d === t.hote) return true
        // Cookie de domaine d'un parent : visé seulement si la règle de ce parent est elle-même visée (sinon il appartient aussi à des
        // sites sans règle, accounts.google.com pour .google.com : le supprimer les déconnecterait). La page elle-même reste protégée
        // par le retrait de l'en-tête Cookie de ses requêtes.
        if (!domaine || !t.hote.endsWith(`.${d}`)) return false
        const effectif = resoudre(sites, `https://${d}`).cookies
        return effectif !== undefined && (modes as ReadonlySet<string>).has(effectif)
      }
      // Motif : sous-domaines (et cookie de domaine du motif lui-même, envoyé à ses sous-domaines) ; une règle plus précise peut les contredire.
      const sonde = d.endsWith(`.${t.hote}`) ? d : domaine && d === t.hote ? `x.${t.hote}` : ''
      const effectif = sonde ? resoudre(sites, `https://${sonde}`).cookies : undefined
      return effectif !== undefined && (modes as ReadonlySet<string>).has(effectif)
    })
  })
}

/** Cookies à supprimer au démarrage et à la fermeture : ceux des sites dont la règle est « Session seulement » ou « Bloqués ». */
export const cookiesAPurger = <C extends CookieMin>(cookies: readonly C[], sites: Sites): C[] => cookiesVises(cookies, sites, MODES_PURGE)

/** Adresse qui désigne un cookie pour `session.cookies.remove`. */
export const urlDuCookie = (c: CookieMin): string => `${c.secure ? 'https' : 'http'}://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`
