/**
 * Gestes de souris : précédent / suivant au défilement horizontal, ⌘ / Ctrl + molette = zoom, clic molette (voir `popup.ts`).
 * Logique pure (seuils, anti-rebond, interrupteurs `gestes.*`) et réception du relais `wheel` du preload des pages.
 * `before-input-event` ne voit pas la molette : le preload relaie seulement des deltas et des modificateurs.
 */
import type { IpcMain, IpcMainEvent, WebContents } from 'electron'
import type { ReglagesD } from '../../shared/types-reglages'

export type ReglagesGestes = ReglagesD['gestes']

/** Canal du relais (page → main) : jamais accepté d'une interface Lyra, seulement d'une étoile. */
export const CANAL_MOLETTE = 'gestes:molette'

export interface Molette {
  dx: number
  dy: number
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
  /**
   * Navigation par débordement : vrai si, au-dessus de la cible, aucune zone (ancêtres, document) ne peut encore défiler
   * horizontalement dans ce sens (mesuré par le preload ; seul ce booléen part de la page). Sans objet pour le zoom.
   */
  bord: boolean
}

export type Geste = 'precedent' | 'suivant' | 'zoom-plus' | 'zoom-moins'

/** Défilement horizontal cumulé (pixels) qui déclenche précédent / suivant. */
export const SEUIL_DEFILEMENT = 120
/** Après un déclenchement : pendant ce délai, et tant que l'inertie du pavé se prolonge, aucun autre. */
export const VERROU_MS = 700
/** Calme (ms) après lequel le cumul d'un geste est oublié (et le verrou levé). */
export const OUBLI_MS = 250
/** Défilement vertical cumulé (pixels) pour un palier de zoom ; au plus un palier toutes les `PAS_ZOOM_MS`. */
export const SEUIL_ZOOM = 40
export const PAS_ZOOM_MS = 120
/** Le défilement doit être nettement horizontal : |dx| strictement plus du double de |dy|. */
const RATIO_HORIZONTAL = 2
const BORNE_DELTA = 5000

export interface EtatMolette {
  /** Une zone de la page a défilé pendant ce geste : pas de navigation avant le calme (un carrousel qui arrive au bout ne fait pas reculer la page). */
  pageDefile: boolean
  cumulX: number
  dernierX: number
  verrouJusqua: number
  cumulZoom: number
  dernierZoomEvt: number
  dernierPalier: number
}

export const etatMolette = (): EtatMolette => ({ pageDefile: false, cumulX: 0, dernierX: -Infinity, verrouJusqua: -Infinity, cumulZoom: 0, dernierZoomEvt: -Infinity, dernierPalier: -Infinity })

const nombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const borne = (v: number): number => Math.max(-BORNE_DELTA, Math.min(BORNE_DELTA, v))

/** Charge du canal : exactement des deltas, des modificateurs et le booléen « au bord », rien d'autre (les champs en trop sont jetés). */
export function validerMolette(brut: unknown): Molette | null {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return null
  const o = brut as Record<string, unknown>
  if (!nombre(o.dx) || !nombre(o.dy)) return null
  if (typeof o.ctrl !== 'boolean' || typeof o.meta !== 'boolean' || typeof o.shift !== 'boolean' || typeof o.alt !== 'boolean' || typeof o.bord !== 'boolean') return null
  return { dx: borne(o.dx), dy: borne(o.dy), ctrl: o.ctrl, meta: o.meta, shift: o.shift, alt: o.alt, bord: o.bord }
}

/** Verrou de navigation partagé par le relais `wheel` et l'évènement `swipe` d'une même fenêtre : un geste ne déclenche jamais les deux. */
export interface EtatSwipe {
  verrouJusqua: number
}
export const etatSwipe = (): EtatSwipe => ({ verrouJusqua: -Infinity })

export interface OptionsMolette {
  /**
   * macOS : le réglage système « Balayer entre les pages » suit le défilement à deux doigts
   * (`systemPreferences.isSwipeTrackingFromScrollEventsEnabled()`) : l'évènement `swipe` n'arrive alors pas, le défilement horizontal navigue.
   */
  suiviParDefilementMac?: boolean
  /** Verrou partagé avec `swipe` (celui de la fenêtre). */
  verrou?: EtatSwipe
}

/**
 * Décision pour un message de molette ; `etat` est mis à jour (un état par page). Sous macOS le balayage passe par
 * l'évènement `swipe` de la fenêtre : le défilement horizontal n'y navigue que si le réglage système suit le défilement
 * (`options.suiviParDefilementMac`), avec le même verrou que `swipe`.
 */
export function decisionMolette(etat: EtatMolette, m: Molette, maintenant: number, r: ReglagesGestes, plateforme: NodeJS.Platform, options: OptionsMolette = {}): Geste | null {
  if (m.ctrl || m.meta) {
    // Un modificateur de zoom : jamais de navigation, même défilement horizontal.
    etat.cumulX = 0
    if (!r.molettePlusCmdZoom || m.dy === 0) return null
    if (maintenant - etat.dernierZoomEvt > OUBLI_MS || Math.sign(etat.cumulZoom) !== Math.sign(m.dy)) etat.cumulZoom = 0
    etat.dernierZoomEvt = maintenant
    etat.cumulZoom += m.dy
    if (Math.abs(etat.cumulZoom) < SEUIL_ZOOM || maintenant - etat.dernierPalier < PAS_ZOOM_MS) return null
    const geste: Geste = etat.cumulZoom < 0 ? 'zoom-plus' : 'zoom-moins'
    etat.cumulZoom = 0
    etat.dernierPalier = maintenant
    return geste
  }
  etat.cumulZoom = 0
  const horizontal = m.dx !== 0 && !m.shift && !m.alt && Math.abs(m.dx) > RATIO_HORIZONTAL * Math.abs(m.dy)
  if (!horizontal || !r.defilementHorizontal || (plateforme === 'darwin' && !options.suiviParDefilementMac)) {
    etat.cumulX = 0
    return null
  }
  const calme = maintenant - etat.dernierX > OUBLI_MS
  etat.dernierX = maintenant
  if (calme) etat.pageDefile = false
  if (!m.bord) etat.pageDefile = true
  if (etat.pageDefile) {
    // La page (carrousel, tableau large, carte…) défile encore, ou vient de défiler dans ce geste : aucune navigation avant le calme.
    etat.cumulX = 0
    return null
  }
  // Le verrou de `swipe` vaut aussi pour le défilement : un balayage déjà traité par l'évènement ne navigue pas deux fois.
  if (options.verrou && maintenant < options.verrou.verrouJusqua) {
    etat.cumulX = 0
    return null
  }
  if (maintenant < etat.verrouJusqua) {
    // Inertie du pavé ou rebond : le verrou se prolonge tant que le défilement continue.
    if (!calme) etat.verrouJusqua = Math.max(etat.verrouJusqua, maintenant + OUBLI_MS)
    return null
  }
  if (calme || Math.sign(etat.cumulX) !== Math.sign(m.dx)) etat.cumulX = 0
  etat.cumulX += m.dx
  if (Math.abs(etat.cumulX) < SEUIL_DEFILEMENT) return null
  const geste: Geste = etat.cumulX < 0 ? 'precedent' : 'suivant'
  etat.cumulX = 0
  etat.verrouJusqua = maintenant + VERROU_MS
  if (options.verrou) options.verrou.verrouJusqua = maintenant + VERROU_MS
  return geste
}

/**
 * Évènement `swipe` d'une fenêtre (macOS, balayage à trois doigts, réglage système « Balayer entre les pages »).
 * Direction d'Electron : `left` = balayage vers la gauche (retour dans l'historique), `right` = avance.
 */
export function decisionSwipe(direction: unknown, r: ReglagesGestes | undefined, etat: EtatSwipe, maintenant: number): 'precedent' | 'suivant' | null {
  if (!r?.defilementHorizontal || (direction !== 'left' && direction !== 'right')) return null
  if (maintenant < etat.verrouJusqua) return null
  etat.verrouJusqua = maintenant + VERROU_MS
  return direction === 'left' ? 'precedent' : 'suivant'
}

/** Ce que le canal sait faire d'une étoile (le gestionnaire d'étoiles d'une fenêtre). */
export interface CibleGestes {
  idDe(wc: WebContents): string | undefined
  idActif(): string | null
  precedent(id: string): void
  suivant(id: string): void
  zoomer(id: string, o: { delta: 1 | -1 }): unknown
  /** Verrou de navigation de la fenêtre, partagé avec son évènement `swipe` (macOS). */
  verrouGeste?: EtatSwipe
}

export interface DepsGestes {
  /** Gestionnaire d'étoiles dont `wc` est une étoile (pas une interface Lyra, pas une popup) ; sinon `undefined`. */
  possede(wc: WebContents): CibleGestes | undefined
  /** `Settings.gestes` courant, relu à chaque message. */
  reglages(): ReglagesGestes
  maintenant?(): number
  plateforme?: NodeJS.Platform
  /** macOS : le défilement à deux doigts navigue-t-il (réglage système) ? Relu à chaque message ; absent : non. */
  suiviParDefilementMac?(): boolean
}

/** Branche le canal `gestes:molette` ; à appeler une fois au démarrage. */
export function installerGestesMolette(ipcMain: Pick<IpcMain, 'on'>, d: DepsGestes): void {
  const etats = new WeakMap<WebContents, EtatMolette>()
  ipcMain.on(CANAL_MOLETTE, (e: IpcMainEvent, brut: unknown) => {
    const wc = e.sender
    // Cadre principal d'une étoile seulement : ni iframe, ni interface, ni popup.
    if (e.senderFrame && e.senderFrame !== wc.mainFrame) return
    // Pages web seulement : jamais lyra:// (le preload n'y relaie rien, et le main ne l'accepterait pas non plus).
    if (!/^https?:/i.test(e.senderFrame?.url ?? wc.getURL())) return
    const tabs = d.possede(wc)
    const id = tabs?.idDe(wc)
    if (!tabs || !id || tabs.idActif() !== id) return
    const m = validerMolette(brut)
    if (!m) return
    let etat = etats.get(wc)
    if (!etat) etats.set(wc, (etat = etatMolette()))
    const plateforme = d.plateforme ?? process.platform
    let suivi = false
    try {
      suivi = plateforme === 'darwin' && d.suiviParDefilementMac?.() === true
    } catch {
      /* réglage système illisible : le défilement ne navigue pas */
    }
    const geste = decisionMolette(etat, m, d.maintenant?.() ?? Date.now(), d.reglages(), plateforme, { suiviParDefilementMac: suivi, verrou: tabs.verrouGeste })
    if (geste === 'precedent') tabs.precedent(id)
    else if (geste === 'suivant') tabs.suivant(id)
    else if (geste === 'zoom-plus') tabs.zoomer(id, { delta: 1 })
    else if (geste === 'zoom-moins') tabs.zoomer(id, { delta: -1 })
  })
}
