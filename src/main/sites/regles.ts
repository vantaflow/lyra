/**
 * Règles par site qui passent par `webRequest` (cookies, scripts, user-agent), enregistrées dans le hub de la session.
 * Sans dépendance à Electron (testable) ; `installer.ts` le branche sur les sessions réelles.
 * Chaque écouteur est enveloppé par `apresBoucliers` (jamais de chrome-extension:// ni de CRX) et passe après les Boucliers.
 */
import type { Settings } from '../../shared/types'
import { apresBoucliers, hubDe, PRIORITE_APRES_BOUCLIERS, type SessionWeb } from '../session/webRequestHub'
import { cookiesAPurger, ecouteursCookies, type CookieMin } from './cookies'
import { ecouteurScripts } from './scripts'
import { ecouteurUaEnvoi } from './ua'

export interface SessionRegles extends SessionWeb {
  cookies: {
    get(filtre: Record<string, never>): Promise<CookieMin[]>
    remove(url: string, nom: string): Promise<void>
    flushStore(): Promise<void>
  }
}

export interface DepsRegles {
  sites: () => Settings['sites']
  /** Version complète du Chrome embarqué (défaut : celui du processus). */
  chrome?: string
}

export function creerReglesSites(deps: DepsRegles) {
  // Hôtes qui ont posé un cookie sous une page « Session seulement », par session (jamais en fenêtre privée).
  const hotes = new WeakMap<object, Set<string>>()
  return {
    /** Branche les règles sur la session (profil ou fenêtre privée : en privé, aucune purge n'est programmée). */
    equiper(ses: SessionRegles, o: { privee: boolean }): void {
      const hub = hubDe(ses)
      const vus = new Set<string>()
      hotes.set(ses, vus)
      const cookies = ecouteursCookies({ sites: deps.sites, surCookieRecu: o.privee ? undefined : (h) => void vus.add(h) })
      hub.onBeforeSendHeaders('sites-cookies', apresBoucliers(cookies.envoi), PRIORITE_APRES_BOUCLIERS)
      hub.onBeforeSendHeaders('sites-ua', apresBoucliers(ecouteurUaEnvoi({ sites: deps.sites, chrome: deps.chrome })), PRIORITE_APRES_BOUCLIERS)
      hub.onHeadersReceived('sites-cookies', apresBoucliers(cookies.entetes), PRIORITE_APRES_BOUCLIERS)
      hub.onHeadersReceived('sites-scripts', apresBoucliers(ecouteurScripts({ sites: deps.sites })), PRIORITE_APRES_BOUCLIERS)
    },

    /** Supprime les cookies « Session seulement » (fermeture de l'application, ou reliquats au démarrage). N'échoue jamais. */
    async purger(ses: SessionRegles): Promise<void> {
      try {
        const liste = cookiesAPurger(await ses.cookies.get({}), deps.sites(), hotes.get(ses) ?? new Set())
        for (const c of liste) {
          const url = `${c.secure ? 'https' : 'http'}://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`
          await ses.cookies.remove(url, c.name).catch((err) => console.error('[sites] cookie « session » non supprimé', err))
        }
        await ses.cookies.flushStore()
      } catch (err) {
        console.error('[sites] purge des cookies « session » impossible', err)
      }
    }
  }
}
