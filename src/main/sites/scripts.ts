/**
 * Scripts « Bloqués » (règle `scripts`) : `Content-Security-Policy: script-src 'none'` ajouté aux documents http(s) de la page
 * principale et de ses iframes. Une valeur d'en-tête supplémentaire se cumule avec la CSP du site (les politiques s'intersectent).
 * `script-src 'none'` bloque aussi l'inline, les gestionnaires d'évènements et les `javascript:` lancés par la page (testé). Hors de
 * portée, par construction : les documents sans réponse réseau (`file://`, `data:`, `blob:`, `about:blank`), un `javascript:` lancé par
 * l'utilisateur lui-même (barre d'adresse, signet : testé), et ce que Lyra ou ses extensions injectent.
 */
import type { Settings } from '../../shared/types'
import { hautConnu, origineDe } from '../session/pageHaute'
import type { DetailsEntetes, ReponseEntetes } from '../session/webRequestHub'
import { resoudre } from '../settings/sites'
import { cleEntete } from './entetes'

export const CSP_SANS_SCRIPT = "script-src 'none'"

export function ecouteurScripts(deps: { sites: () => Settings['sites'] }): (d: DetailsEntetes) => ReponseEntetes | void {
  return (d) => {
    if ((d.resourceType !== 'mainFrame' && d.resourceType !== 'subFrame') || !/^https?:/i.test(d.url)) return
    if (resoudre(deps.sites(), origineDe(hautConnu(d))).scripts !== 'bloques') return
    const responseHeaders: Record<string, string[] | string> = { ...(d.responseHeaders ?? {}) }
    const cle = cleEntete(responseHeaders, 'content-security-policy') ?? 'Content-Security-Policy'
    const existant = responseHeaders[cle]
    responseHeaders[cle] = [...(Array.isArray(existant) ? existant : existant === undefined ? [] : [existant]), CSP_SANS_SCRIPT]
    return { responseHeaders }
  }
}
