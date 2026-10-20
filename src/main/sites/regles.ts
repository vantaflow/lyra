/**
 * Règles par site qui passent par `webRequest` (cookies, scripts, user-agent), enregistrées dans le hub de la session.
 * Sans dépendance à Electron (testable) ; `installer.ts` le branche sur les sessions réelles.
 * Chaque écouteur est enveloppé par `apresBoucliers` (jamais de chrome-extension:// ni de CRX) et passe après les Boucliers.
 */
import type { Settings } from '../../shared/types'
import { parLots } from '../session/borner'
import { apresBoucliers, hubDe, PRIORITE_APRES_BOUCLIERS, type SessionWeb } from '../session/webRequestHub'
import { ciblesCookies, cookiesVises, ecouteursCookies, MODE_BLOQUES, MODES_PURGE, urlDuCookie, type CookieMin, type ModeCookies } from './cookies'
import { ecouteurScripts, originesScriptsBloques } from './scripts'
import { ecouteurUaEnvoi } from './ua'

type Sites = Settings['sites']

export interface SessionRegles extends SessionWeb {
  cookies: {
    get(filtre: Record<string, never>): Promise<CookieMin[]>
    remove(url: string, nom: string): Promise<void>
    flushStore(): Promise<void>
    on(evenement: 'changed', ecouteur: (e: unknown, cookie: CookieMin, cause: string, supprime: boolean) => void): unknown
  }
  clearStorageData(options: { origin?: string; storages?: Array<'serviceworkers'> }): Promise<void>
  /** Workers en cours (seule liste dont Electron dispose : sert à couvrir les motifs `*.hôte`). */
  serviceWorkers?: { getAllRunning(): Record<string | number, { scope: string }> }
}

export interface DepsRegles {
  sites: () => Sites
  /** Version complète du Chrome embarqué (défaut : celui du processus). */
  chrome?: string
}

/** Origines des workers en cours (portées `https://hôte/chemin/` ramenées à l'origine). */
function originesConnues(ses: SessionRegles): string[] {
  try {
    return Object.values(ses.serviceWorkers?.getAllRunning() ?? {}).map((w) => new URL(w.scope).origin)
  } catch {
    return []
  }
}

export function creerReglesSites(deps: DepsRegles) {
  // Sessions persistantes équipées (jamais une session privée : rien ne s'y écrit ni ne s'y purge).
  const persistantes = new Set<SessionRegles>()

  async function supprimer(ses: SessionRegles, liste: readonly CookieMin[]): Promise<void> {
    // Huit à la fois : 10 000 cookies en séquence retarderaient la fermeture.
    await parLots(liste, 8, (c) => ses.cookies.remove(urlDuCookie(c), c.name).catch((err) => console.error('[sites] cookie non supprimé', err)))
  }
  /** Supprime les cookies des sites dont la règle est l'un des `modes`, puis écrit le magasin. N'échoue jamais. */
  async function purgerModes(ses: SessionRegles, modes: ReadonlySet<ModeCookies>): Promise<void> {
    try {
      const sites = deps.sites()
      if (ciblesCookies(sites, modes).length === 0) return
      await supprimer(ses, cookiesVises(await ses.cookies.get({}), sites, modes))
      await ses.cookies.flushStore()
    } catch (err) {
      console.error('[sites] purge des cookies impossible', err)
    }
  }
  /** Efface les service workers installés de ces origines. N'échoue jamais. */
  async function effacerWorkers(ses: SessionRegles, origines: readonly string[]): Promise<void> {
    // Quatre à la fois (pas en séquence : le démarrage attend ce nettoyage).
    const file = [...origines]
    const un = async (): Promise<void> => {
      for (let origin = file.shift(); origin !== undefined; origin = file.shift()) {
        await ses.clearStorageData({ origin, storages: ['serviceworkers'] }).catch((err) => console.error('[sites] service workers non effacés', err))
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, file.length) }, un))
  }

  return {
    /** Branche les règles sur la session (profil ou fenêtre privée : en privé, rien n'est purgé ni supprimé). */
    equiper(ses: SessionRegles, o: { privee: boolean }): void {
      const hub = hubDe(ses)
      const cookies = ecouteursCookies({ sites: deps.sites })
      hub.onBeforeSendHeaders('sites-cookies', apresBoucliers(cookies.envoi), PRIORITE_APRES_BOUCLIERS)
      hub.onBeforeSendHeaders('sites-ua', apresBoucliers(ecouteurUaEnvoi({ sites: deps.sites, chrome: deps.chrome })), PRIORITE_APRES_BOUCLIERS)
      hub.onHeadersReceived('sites-cookies', apresBoucliers(cookies.entetes), PRIORITE_APRES_BOUCLIERS)
      hub.onHeadersReceived('sites-scripts', apresBoucliers(ecouteurScripts({ sites: deps.sites })), PRIORITE_APRES_BOUCLIERS)
      if (o.privee) return
      persistantes.add(ses)
      // « Bloqués » : un cookie inséré par un autre chemin que Set-Cookie d'une page (service worker, API) est supprimé aussitôt.
      ses.cookies.on('changed', (_e, cookie, _cause, supprime) => {
        if (!supprime && cookiesVises([cookie], deps.sites(), MODE_BLOQUES).length > 0) void supprimer(ses, [cookie])
      })
    },

    /** Supprime les cookies « Session seulement » et « Bloqués » (fermeture de l'application, ou reliquats au démarrage). N'échoue jamais. */
    purger: (ses: SessionRegles): Promise<void> => purgerModes(ses, MODES_PURGE),

    /** Démarrage : purge des cookies, et service workers installés des sites aux scripts bloqués (à terminer avant la restauration des onglets). */
    async demarrer(ses: SessionRegles): Promise<void> {
      await purgerModes(ses, MODES_PURGE)
      await effacerWorkers(ses, originesScriptsBloques(deps.sites(), originesConnues(ses)))
    },

    /** Écriture d'une règle : cookies existants des sites devenus « Bloqués » supprimés, service workers des sites aux scripts devenus bloqués effacés. */
    async surSitesChanges(avant: Sites, apres: Sites): Promise<void> {
      const connus = new Set(ciblesCookies(avant, MODE_BLOQUES).map((t) => `${t.motif}|${t.hote}`))
      const nouveauxCookies = ciblesCookies(apres, MODE_BLOQUES).some((t) => !connus.has(`${t.motif}|${t.hote}`))
      for (const ses of persistantes) {
        if (nouveauxCookies) await purgerModes(ses, MODE_BLOQUES)
        const connues = originesConnues(ses)
        const avantO = new Set(originesScriptsBloques(avant, connues))
        await effacerWorkers(ses, originesScriptsBloques(apres, connues).filter((o) => !avantO.has(o)))
      }
    }
  }
}
