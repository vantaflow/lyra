/**
 * Répartiteur `webRequest` : Electron ne garde qu'un écouteur par évènement et par session (le second
 * remplace le premier). Boucliers, règles par site, cookies, CSP et user-agent s'enregistrent donc ici,
 * et un unique écouteur Electron par évènement enchaîne les leurs.
 */
import type {
  OnBeforeRequestListenerDetails,
  OnBeforeSendHeadersListenerDetails,
  OnHeadersReceivedListenerDetails,
  WebRequestFilter
} from 'electron'

export type DetailsAvant = OnBeforeRequestListenerDetails
export type DetailsEnvoi = OnBeforeSendHeadersListenerDetails
export type DetailsEntetes = OnHeadersReceivedListenerDetails
export type ReponseAvant = { cancel?: boolean; redirectURL?: string }
export type ReponseEnvoi = { cancel?: boolean; requestHeaders?: Record<string, string | string[]> }
export type ReponseEntetes = { responseHeaders?: Record<string, string[] | string>; statusLine?: string }

export interface Hub {
  onBeforeRequest(id: string, fn: (d: DetailsAvant) => ReponseAvant | void, priorite?: number): () => void
  onBeforeSendHeaders(id: string, fn: (d: DetailsEnvoi) => ReponseEnvoi | void, priorite?: number): () => void
  onHeadersReceived(id: string, fn: (d: DetailsEntetes) => ReponseEntetes | void, priorite?: number): () => void
}

/** Ce dont le hub a besoin d'une session Electron (Session y est assignable). */
export interface SessionWeb {
  webRequest: {
    onBeforeRequest(filtre: WebRequestFilter, ecouteur: (d: DetailsAvant, cb: (r: ReponseAvant) => void) => void): void
    onBeforeSendHeaders(filtre: WebRequestFilter, ecouteur: (d: DetailsEnvoi, cb: (r: ReponseEnvoi) => void) => void): void
    onHeadersReceived(filtre: WebRequestFilter, ecouteur: (d: DetailsEntetes, cb: (r: ReponseEntetes) => void) => void): void
  }
}

const TOUTES: WebRequestFilter = { urls: ['<all_urls>'] }
const PRIORITE_PAR_DEFAUT = 100

interface Entree<D, R> {
  id: string
  fn: (d: D) => R | void
  priorite: number
  ordre: number
}

/** Liste d'écouteurs d'un évènement et exécution de la chaîne. `suite` fusionne la sortie dans les détails. */
function creerChaine<D, R extends object>(
  nom: string,
  suite: (d: D, r: R) => D,
  arret: (r: R) => boolean,
  inscrire: (ecouteur: (d: D, cb: (r: R) => void) => void) => void
) {
  const entrees = new Map<string, Entree<D, R>>()
  let compteur = 0
  let inscrit = false

  const executer = (d: D, cb: (r: R) => void): void => {
    let courant = d
    let sortie = {} as R
    const triees = [...entrees.values()].sort((a, b) => a.priorite - b.priorite || a.ordre - b.ordre)
    for (const e of triees) {
      let r: R | void
      try {
        r = e.fn(courant)
      } catch (err) {
        console.error(`[webRequest] écouteur « ${e.id} » (${nom}) en échec, ignoré :`, err)
        continue
      }
      if (!r) continue
      sortie = { ...sortie, ...r }
      if (arret(r)) break
      courant = suite(courant, r)
    }
    cb(sortie)
  }

  return {
    ajouter(id: string, fn: (d: D) => R | void, priorite = PRIORITE_PAR_DEFAUT): () => void {
      const entree: Entree<D, R> = { id, fn, priorite, ordre: compteur++ }
      entrees.set(id, entree)
      if (!inscrit) {
        inscrit = true
        inscrire(executer)
      }
      return () => {
        // Ne retire que sa propre inscription : un remplaçant du même id reste en place.
        if (entrees.get(id) === entree) entrees.delete(id)
      }
    }
  }
}

const hubs = new WeakMap<object, Hub>()

/** Hub de la session (créé à la première demande ; l'écouteur Electron n'est posé qu'à la 1re inscription). */
export function hubDe(ses: SessionWeb): Hub {
  const existant = hubs.get(ses)
  if (existant) return existant
  const avant = creerChaine<DetailsAvant, ReponseAvant>(
    'onBeforeRequest',
    (d) => d,
    (r) => r.cancel === true || r.redirectURL !== undefined,
    (e) => ses.webRequest.onBeforeRequest(TOUTES, e)
  )
  const envoi = creerChaine<DetailsEnvoi, ReponseEnvoi>(
    'onBeforeSendHeaders',
    (d, r) => (r.requestHeaders ? { ...d, requestHeaders: r.requestHeaders as DetailsEnvoi['requestHeaders'] } : d),
    (r) => r.cancel === true,
    (e) => ses.webRequest.onBeforeSendHeaders(TOUTES, e)
  )
  const entetes = creerChaine<DetailsEntetes, ReponseEntetes>(
    'onHeadersReceived',
    (d, r) => ({
      ...d,
      ...(r.responseHeaders ? { responseHeaders: r.responseHeaders as DetailsEntetes['responseHeaders'] } : {}),
      ...(r.statusLine ? { statusLine: r.statusLine } : {})
    }),
    () => false,
    (e) => ses.webRequest.onHeadersReceived(TOUTES, e)
  )
  const hub: Hub = {
    onBeforeRequest: avant.ajouter,
    onBeforeSendHeaders: envoi.ajouter,
    onHeadersReceived: entetes.ajouter
  }
  hubs.set(ses, hub)
  return hub
}
