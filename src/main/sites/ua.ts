/**
 * User-agent par site (règle `ua`) : l'identité alternative n'est envoyée qu'aux requêtes dont la PAGE PRINCIPALE est le site
 * (origine de la frame principale, pas celle de la requête) ; `navigator` (userAgent, userAgentData…) et les `Sec-CH-UA*` y concordent.
 *
 * `navigator.userAgent` n'est PAS posé par `webContents.setUserAgent` : Chromium recharge la page visible quand on l'appelle pendant
 * une navigation alors que cette page a elle-même un UA réécrit (la navigation en cours est alors annulée : observé). Le preload des
 * pages applique donc une fonction (`fonctionNavigateur`) avant tout script de la page. Les workers gardent l'UA réel dans `navigator`.
 */
import type { Settings } from '../../shared/types'
import { hautConnu, origineDe } from '../session/pageHaute'
import type { DetailsEnvoi, ReponseEnvoi } from '../session/webRequestHub'
import { resoudre } from '../settings/sites'
import { profilUa, type ProfilUa } from '../ua'
import { cleEntete, sansEntetes } from './entetes'
import { fonctionNavigateur } from './ua-script'

type Sites = Settings['sites']
type EntetesEnvoi = Record<string, string | string[]>

const INDICE_CLIENT = (k: string): boolean => /^sec-ch-ua/i.test(k)
/** Indices qui décrivent la machine réelle : faux dès que la plate-forme annoncée change. */
const INDICE_PLATEFORME = (k: string): boolean => /^sec-ch-ua-(platform-version|arch|bitness|model|wow64|full-version)/i.test(k)

/** En-têtes de requête d'un profil : `User-Agent` remplacé, indices client retirés (non Chromium) ou alignés (Chromium). */
export function enTetesPourProfil(entetes: EntetesEnvoi, profil: ProfilUa): EntetesEnvoi {
  const sortie: EntetesEnvoi = sansEntetes(entetes, profil.chromium ? INDICE_PLATEFORME : INDICE_CLIENT) ?? { ...entetes }
  sortie[cleEntete(sortie, 'user-agent') ?? 'User-Agent'] = profil.ua
  if (profil.chromium) {
    for (const [nom, valeur] of [
      ['sec-ch-ua-platform', `"${profil.plateforme}"`],
      ['sec-ch-ua-mobile', profil.mobile ? '?1' : '?0']
    ] as const) {
      const cle = cleEntete(sortie, nom)
      if (cle) sortie[cle] = valeur
    }
  }
  return sortie
}

export interface DepsUaEnvoi {
  sites: () => Sites
  /** Version complète du Chrome embarqué (défaut : celui du processus). */
  chrome?: string
}

/** `onBeforeSendHeaders` : réécrit l'UA et les indices client des requêtes dont la page principale a une règle `ua`. */
export function ecouteurUaEnvoi(deps: DepsUaEnvoi): (d: DetailsEnvoi) => ReponseEnvoi | void {
  return (d) => {
    const profil = profilUa(resoudre(deps.sites(), origineDe(hautConnu(d))).ua, deps.chrome)
    if (profil) return { requestHeaders: enTetesPourProfil(d.requestHeaders, profil) }
  }
}

/** Fonction `function (w) {…}` (source) que le preload applique à une page web avant ses propres scripts (aligne `navigator` sur le profil) ; '' si le site n'a pas de profil alternatif. */
export function fonctionUaPourPage(sites: Sites, urlHaut: string, chrome?: string): string {
  if (!/^https?:/i.test(urlHaut)) return ''
  const profil = profilUa(resoudre(sites, origineDe(urlHaut)).ua, chrome)
  return profil ? fonctionNavigateur(profil) : ''
}
