/**
 * Boucliers : branche le moteur Ghostery sur les sessions Electron, sans enableBlockingInSession
 * (scriptlets trop tardifs et handlers IPC globaux : voir la spec §6). Pur côté Electron : les
 * sessions et les détails de requêtes sont passés en paramètre, ce qui rend le module testable.
 */
import type { OnBeforeRequestListenerDetails, OnHeadersReceivedListenerDetails } from 'electron'
import { fromElectronDetails, type ElectronBlocker } from '@ghostery/adblocker-electron'
import { parse } from 'tldts-experimental'
import type { Settings } from '../../shared/types'
import { hubDe, type SessionWeb } from '../session/webRequestHub'
import { resoudre } from '../settings/sites'
import { Compteurs } from './compteurs'

/** Les Boucliers passent avant les règles par site (priorité par défaut du hub : 100). */
const PRIORITE_BOUCLIERS = 50

type ReponseAvant = { cancel?: boolean; redirectURL?: string }
type ReponseEntetes = { responseHeaders?: Record<string, string[] | string> }

/** Ce dont les Boucliers ont besoin d'une session Electron (Session y est assignable). */
export interface SessionShields {
  webRequest: SessionWeb['webRequest']
}

/** Les écouteurs ci-dessous rappellent de façon synchrone : adaptation à la forme « retourne la réponse » du hub. */
const enRetour =
  <D, R>(fn: (d: D, cb: (r: R) => void) => void) =>
  (d: D): R | void => {
    let reponse: R | undefined
    fn(d, (r) => (reponse = r))
    return reponse
  }

export interface OptionsShields {
  moteurInitial: ElectronBlocker
  reglages: () => Settings
  /** Appelé quand le compteur d'un onglet change (blocage ou remise à zéro). */
  onCompteur?: (wcId: number) => void
  /**
   * Garde appelée en tête de l'écouteur `onBeforeRequest` (il n'y en a qu'un par session) : vrai = requête
   * annulée, avant le moteur et même si les Boucliers sont désactivés pour le site.
   */
  garde?: (d: { url: string; resourceType?: string }) => boolean
}

export interface DemandeStyles {
  url: string
  urlPremierNiveau: string
  /** Absents au premier appel (règles de base et du site) ; présents pour les mises à jour du DOM. */
  classes?: string[]
  ids?: string[]
  hrefs?: string[]
  lifecycle?: 'start' | 'dom-update'
}

export interface Shields {
  attacher(ses: SessionShields): void
  remplacerMoteur(m: ElectronBlocker): void
  estActif(origine: string): boolean
  bloques(wcId: number): number
  dernieres(wcId: number): string[]
  reinitialiser(wcId: number): void
  semaine(): number
  /** Scriptlets à exécuter tôt dans la frame `url` (onglet dont la page est `urlPremierNiveau`). */
  scriptlets(url: string, urlPremierNiveau: string): string[]
  /** Feuille de styles cosmétique ('' si rien à cacher). */
  styles(d: DemandeStyles): string
}

const FILTRABLE = /^(https?|wss?):/i
const WEB = /^https?:/i

/** Origine servant de clé aux règles de site : « https://hôte[:port] », « file:// », ou '' . */
export function origineDe(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol === 'file:') return 'file://'
    return u.origin === 'null' ? '' : u.origin
  } catch {
    return ''
  }
}

/** URL de la page de premier niveau qui a émis la requête (le référent d'une iframe ne compte pas). */
function urlPremierNiveau(d: OnBeforeRequestListenerDetails | OnHeadersReceivedListenerDetails): string {
  if (d.resourceType === 'mainFrame') return d.url
  let url = ''
  try {
    url = d.webContents?.getURL() ?? ''
  } catch {
    // webContents détruit
  }
  return url || d.referrer || d.url
}

const estExtension = (d: { url: string; initiatorOrigin?: string }): boolean =>
  d.url.startsWith('chrome-extension://') || (d.initiatorOrigin?.startsWith('chrome-extension://') ?? false)

export function creerShields(opts: OptionsShields): Shields {
  let moteur = opts.moteurInitial
  const compteurs = new Compteurs()

  const estActif = (origine: string): boolean => resoudre(opts.reglages().sites ?? {}, origine).boucliers !== 'desactives'

  const requeteGhostery = (d: OnBeforeRequestListenerDetails | OnHeadersReceivedListenerDetails, haut: string) =>
    // Sans référent (page file://, requête initiale), la page de premier niveau sert de source.
    fromElectronDetails({ ...d, referrer: d.referrer || (WEB.test(haut) ? haut : '') } as OnBeforeRequestListenerDetails)

  const avant = (d: OnBeforeRequestListenerDetails, cb: (r: ReponseAvant) => void): void => {
    if (opts.garde?.(d)) return cb({ cancel: true })
    if (estExtension(d) || !FILTRABLE.test(d.url)) return cb({})
    if (d.resourceType === 'mainFrame') {
      // La navigation elle-même n'est jamais bloquée ; elle remet le compteur de l'onglet à zéro.
      if (d.webContentsId !== undefined && compteurs.bloques(d.webContentsId) > 0) {
        compteurs.reinitialiser(d.webContentsId)
        opts.onCompteur?.(d.webContentsId)
      }
      return cb({})
    }
    const haut = urlPremierNiveau(d)
    if (!estActif(origineDe(haut))) return cb({})
    const { match, redirect } = moteur.match(requeteGhostery(d, haut))
    if (!match && !redirect) return cb({})
    compteurs.ajouter(d.webContentsId, d.url)
    if (d.webContentsId !== undefined) opts.onCompteur?.(d.webContentsId)
    cb(redirect ? { redirectURL: redirect.dataUrl } : { cancel: true })
  }

  const entetes = (d: OnHeadersReceivedListenerDetails, cb: (r: ReponseEntetes) => void): void => {
    if ((d.resourceType !== 'mainFrame' && d.resourceType !== 'subFrame') || estExtension(d) || !WEB.test(d.url)) return cb({})
    const haut = urlPremierNiveau(d)
    if (!estActif(origineDe(haut))) return cb({})
    const csp = moteur.getCSPDirectives(requeteGhostery(d, haut))
    if (csp === undefined) return cb({})
    // Valeur d'en-tête supplémentaire : chaque politique s'applique indépendamment (concaténer avec « ; »
    // ferait ignorer les directives en double, donc affaiblirait la CSP du site).
    const responseHeaders: Record<string, string[]> = { ...(d.responseHeaders ?? {}) }
    const cle = Object.keys(responseHeaders).find((k) => k.toLowerCase() === 'content-security-policy') ?? 'Content-Security-Policy'
    responseHeaders[cle] = [...(responseHeaders[cle] ?? []), csp]
    cb({ responseHeaders })
  }

  const cosmetique = (url: string, haut: string, o: Partial<DemandeStyles>, scripts: boolean) => {
    if (!WEB.test(url) || !estActif(origineDe(haut))) return undefined
    const { hostname = '', domain = '' } = parse(url)
    const premier = o.classes === undefined && o.ids === undefined && o.hrefs === undefined
    return moteur.getCosmeticsFilters({
      url,
      hostname: hostname ?? '',
      domain: domain ?? '',
      classes: o.classes,
      ids: o.ids,
      hrefs: o.hrefs,
      getBaseRules: !scripts && premier,
      getInjectionRules: scripts,
      getExtendedRules: false,
      getRulesFromHostname: scripts || premier,
      getRulesFromDOM: !scripts && !premier,
      callerContext: { lifecycle: o.lifecycle }
    })
  }

  return {
    attacher(ses) {
      const hub = hubDe(ses)
      hub.onBeforeRequest('boucliers', enRetour(avant), PRIORITE_BOUCLIERS)
      hub.onHeadersReceived('boucliers', enRetour(entetes), PRIORITE_BOUCLIERS)
    },
    remplacerMoteur(m) {
      moteur = m
    },
    estActif,
    bloques: (id) => compteurs.bloques(id),
    dernieres: (id) => compteurs.dernieres(id),
    reinitialiser(id) {
      compteurs.reinitialiser(id)
      opts.onCompteur?.(id)
    },
    semaine: () => compteurs.semaine(),
    scriptlets(url, haut) {
      const r = cosmetique(url, haut, {}, true)
      return r?.active ? r.scripts : []
    },
    styles(d) {
      const r = cosmetique(d.url, d.urlPremierNiveau, d, false)
      return r?.active ? r.styles : ''
    }
  }
}
