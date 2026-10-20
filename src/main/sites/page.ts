/**
 * Ce que le preload des pages demande au processus principal, frame par frame (canal synchrone `page:regles-site`) :
 * le script d'identité (user-agent) et l'indicateur « cookies JavaScript neutralisés ». La page principale est toujours celle
 * de l'expéditeur, jamais une adresse annoncée par la frame.
 */
import type { Settings } from '../../shared/types'
import { cookiesJsNeutralises } from './cookies'
import { fonctionUaPourPage } from './ua'

export interface ReglesPage {
  /** Fonction d'identité `function (w) {…}` (source) à appliquer avant les scripts de la page ('' : identité par défaut). */
  ua: string
  /** `document.cookie` et `cookieStore` doivent être neutralisés dans cette frame. */
  cookies: boolean
}
export const AUCUNE_REGLE_PAGE: ReglesPage = { ua: '', cookies: false }

/**
 * Adresse qui désigne une frame pour la règle de cookies : son URL web, sinon (about:blank, srcdoc, blob:) son origine héritée ;
 * '' si elle n'a aucune origine web (origine opaque : fail-closed pour « 1re partie »).
 */
export function urlDeFrame(url: string, origine: string): string {
  if (/^https?:/i.test(url)) return url
  return /^https?:/i.test(origine) ? origine : ''
}

export function reglesDePage(sites: Settings['sites'], urlHaut: string, urlFrame: string, chrome?: string): ReglesPage {
  return { ua: fonctionUaPourPage(sites, urlHaut, chrome), cookies: cookiesJsNeutralises(sites, urlHaut, urlFrame) }
}
