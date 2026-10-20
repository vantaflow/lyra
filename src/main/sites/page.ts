/**
 * Ce que le preload des pages demande au processus principal, frame par frame (canal synchrone `page:regles-site`) :
 * le script d'identité (user-agent), l'indicateur « cookies JavaScript neutralisés », le script de lecture automatique, le style
 * personnalisé (inséré avant le premier rendu : la réponse est synchrone) et, pour la frame principale seulement, les scripts
 * personnalisés (exécutés dans un monde isolé). La page principale est toujours celle de l'expéditeur, jamais une adresse annoncée
 * par la frame.
 */
import type { ScriptPerso, Settings } from '../../shared/types'
import { cookiesJsNeutralises } from './cookies'
import { fonctionLectureAuto, modeLectureAuto } from './lectureAuto'
import { scriptsPersoApplicables, stylePerso, type ReglagesGlobauxPerso } from './personnalise'
import { resoudre } from '../settings/sites'
import { fonctionUaPourPage } from './ua'

export interface ReglesPage {
  /** Fonction d'identité `function (w) {…}` (source) à appliquer avant les scripts de la page ('' : identité par défaut). */
  ua: string
  /** `document.cookie` et `cookieStore` doivent être neutralisés dans cette frame. */
  cookies: boolean
  /** Fonction de lecture automatique `function (w) {…}` (source) à appliquer avant les scripts de la page ('' : lecture autorisée). */
  lecture: string
  /** CSS personnalisé (global + site) à insérer tout de suite, avant le premier rendu ('' : aucun). */
  style: string
  /** Scripts personnalisés actifs (globaux puis du site) : frame principale seulement. */
  scripts: Array<Pick<ScriptPerso, 'nom' | 'code'>>
}
export const AUCUNE_REGLE_PAGE: ReglesPage = { ua: '', cookies: false, lecture: '', style: '', scripts: [] }

/** Style et scripts personnalisés : réglages globaux (`Settings.styles`) et nature de la frame. Absents : rien de personnalisé. */
export interface PersoPage {
  globaux: ReglagesGlobauxPerso
  /** La frame est celle de la page principale (les scripts ne s'exécutent que dans celle-là). */
  principale: boolean
}

/**
 * Adresse qui désigne une frame pour la règle de cookies : son URL web, sinon (about:blank, srcdoc, blob:) son origine héritée ;
 * '' si elle n'a aucune origine web (origine opaque : fail-closed pour « 1re partie »).
 */
export function urlDeFrame(url: string, origine: string): string {
  if (/^https?:/i.test(url)) return url
  return /^https?:/i.test(origine) ? origine : ''
}

export function reglesDePage(sites: Settings['sites'], urlHaut: string, urlFrame: string, chrome?: string, perso?: PersoPage): ReglesPage {
  const mode = modeLectureAuto(resoudre(sites, urlHaut).lectureAuto)
  return {
    ua: fonctionUaPourPage(sites, urlHaut, chrome),
    cookies: cookiesJsNeutralises(sites, urlHaut, urlFrame),
    // La lecture suit la page principale (comme l'identité) ; le style, la règle de la frame elle-même (l'iframe d'un autre site n'hérite
    // pas du style de la page qui l'héberge, seulement du style global).
    lecture: mode ? fonctionLectureAuto(mode) : '',
    style: perso ? stylePerso(perso.globaux, sites, urlFrame) : '',
    scripts: perso?.principale ? scriptsPersoApplicables(perso.globaux, sites, urlHaut) : []
  }
}
