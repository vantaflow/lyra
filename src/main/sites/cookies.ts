/**
 * Cookies par site (règle `cookies`) : « 1re partie » retire les `Set-Cookie` tiers (et n'envoie pas les cookies aux tiers),
 * « Bloqués » les retire tous, « Session seulement » les garde mais signale leur hôte pour une purge à la fermeture.
 * La règle et la « 1re partie » sont celles de la page principale (domaine enregistrable, section privée de la PSL comprise).
 * Limite : seuls les cookies HTTP sont couverts ; `document.cookie` et les cookies déjà enregistrés ne passent pas par `webRequest`.
 */
import type { RegleSite, Settings } from '../../shared/types'
import { hautConnu, origineDe } from '../session/pageHaute'
import type { DetailsEntetes, DetailsEnvoi, ReponseEntetes, ReponseEnvoi } from '../session/webRequestHub'
import { resoudre } from '../settings/sites'
import { memePartie } from './domaine'
import { sansEntetes } from './entetes'

type Sites = Settings['sites']

export interface DepsCookies {
  sites: () => Sites
  /** « Session seulement » : une réponse de cet hôte a posé un cookie. */
  surCookieRecu?: (hote: string) => void
}

/** Une requête (ou sa réponse) doit-elle perdre ses cookies ? `haut` : page principale ('' si inconnue : on ne touche à rien). */
function retire(mode: RegleSite['cookies'], url: string, haut: string): boolean {
  if (haut === '') return false
  if (mode === 'bloques') return true
  return mode === 'premiere-partie' && !memePartie(url, haut)
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
      if (mode === 'session') {
        if (Object.keys(d.responseHeaders ?? {}).some(estSetCookie)) {
          try {
            deps.surCookieRecu?.(new URL(d.url).hostname.toLowerCase())
          } catch {
            // URL illisible : rien à purger
          }
        }
        return
      }
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

/**
 * Cookies à supprimer à la fermeture : ceux d'un hôte qui en a posé pendant une page « Session seulement » (`hotes`, domaine parent compris),
 * et ceux d'un site dont la règle (hôte exact) est « Session seulement » (reliquats d'un arrêt brutal).
 */
export function cookiesAPurger<C extends CookieMin>(cookies: readonly C[], sites: Sites, hotes: ReadonlySet<string>): C[] {
  return cookies.filter((c) => {
    if (!c.domain) return false
    const d = c.domain.replace(/^\./, '').toLowerCase()
    for (const h of hotes) if (h === d || h.endsWith(`.${d}`)) return true
    return resoudre(sites, `https://${d}`).cookies === 'session'
  })
}
