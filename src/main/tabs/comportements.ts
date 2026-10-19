/** Comportements d'une vue d'étoile : zoom mémorisé, résultats de recherche, plein écran HTML, erreurs, clic droit. */
import type { WebContents } from 'electron'
import type { LyraWindow } from '../window/WindowManager'
import type { CanalEvenement, Evenements } from '../../shared/ipc'
import { origineDe } from '../shields/Shields'
import { installerMenuContextuel } from '../menu/contextMenu'
import { relayerResultats } from './find'
import { typeErreur, urlErreur } from './erreurs'

export interface DepsComportements {
  id: string
  fenetre: LyraWindow
  zoomDe?: (origine: string) => number | undefined
  rechercheUrl?: (texte: string) => string
  envoyerAuChrome<K extends CanalEvenement>(canal: K, data: Evenements[K]): void
  /** L'étoile est celle que la fenêtre affiche. */
  estActive(): boolean
  /** Charge la page d'erreur (adresse lyra://erreur…) dans l'étoile. */
  erreur(url: string): void
  /** Ouvre l'adresse dans une étoile reliée, si son schéma est permis. */
  ouvrirLien(url: string): void
}

/** Fenêtres que seule une page a mises en plein écran (pour les rendre à leur état en sortant). */
const parPage = new WeakSet<object>()

export function attacherComportements(wc: WebContents, d: DepsComportements): void {
  // Le zoom mémorisé du site est rappliqué à chaque navigation (Chromium repart de 100 %).
  wc.on('did-navigate', () => {
    const origine = origineDe(wc.getURL())
    const voulu = (origine && d.zoomDe?.(origine)) || 1
    if (Math.abs(wc.getZoomFactor() - voulu) > 0.001) wc.setZoomFactor(voulu)
    d.envoyerAuChrome('find:result', { id: d.id, actif: 0, total: 0 })
  })
  relayerResultats(wc, (r) => d.envoyerAuChrome('find:result', { id: d.id, ...r }))

  // Plein écran HTML : la page prend toute la fenêtre (le chrome disparaît), Échap est géré par Chromium.
  const plein = (actif: boolean): void => {
    if (!d.estActive()) return
    d.fenetre.setPleinEcran(actif)
    const win = d.fenetre.win
    if (actif && !win.isFullScreen()) {
      win.setFullScreen(true)
      parPage.add(win)
    } else if (!actif && parPage.delete(win)) win.setFullScreen(false)
  }
  wc.on('enter-html-full-screen', () => plein(true))
  wc.on('leave-html-full-screen', () => plein(false))

  // Page injoignable : page d'erreur Lyra (la vue change de catégorie, donc elle est recréée).
  wc.on('did-fail-load', (_e, code, _desc, urlEchec, principal) => {
    if (!principal || code === -3 || !/^(https?|file):/i.test(urlEchec)) return
    setImmediate(() => d.erreur(urlErreur(typeErreur(code), urlEchec)))
  })

  installerMenuContextuel(wc, {
    fenetre: d.fenetre.win,
    ouvrirDansEtoile: d.ouvrirLien,
    rechercheUrl: (t) => d.rechercheUrl?.(t) ?? `https://duckduckgo.com/?q=${encodeURIComponent(t)}`
  })
}
