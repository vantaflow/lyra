/** Comportements d'une vue d'étoile : zoom mémorisé, résultats de recherche, plein écran HTML, erreurs, clic droit. */
import type { WebContents } from 'electron'
import type { LyraWindow } from '../window/WindowManager'
import type { CanalEvenement, Evenements } from '../../shared/ipc'
import { origineDe } from '../shields/Shields'
import { installerMenuContextuel } from '../menu/contextMenu'
import { relayerResultats } from './find'
import { typeErreur, urlErreur } from './erreurs'
import type { CrochetsPasserelles } from '../passerelles/Passerelles'

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
  /** Recharge l'adresse dans l'étoile (rotation ou essai de passerelle). */
  recharger?(url: string): void
  /** Passerelles : décision après un échec, confirmation après un succès. */
  passerelles?: CrochetsPasserelles
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
  // Avec les passerelles, la décision (rotation, essai de détection, page) est asynchrone : elle est
  // abandonnée si une autre navigation a commencé entre-temps.
  const p = d.passerelles
  let generation = 0
  // http vers un site contourné : arrêt immédiat et page d'explication (jamais le chemin habituel).
  const refuser = (url: string | null): void => {
    if (!url) return
    wc.stop()
    setImmediate(() => d.erreur(url))
  }
  wc.on('did-start-navigation', (e) => {
    if (!e.isMainFrame || e.isSameDocument) return
    generation++
    // Une autre adresse met fin à l'essai de détection ou à la rotation suivis.
    if (p) refuser(p.surDebut(wc.id, e.url))
  })
  wc.on('did-redirect-navigation', (e) => {
    if (p && e.isMainFrame) refuser(p.refusHttp(e.url))
  })
  wc.on('did-fail-load', (_e, code, _desc, urlEchec, principal) => {
    if (!principal || code === -3 || !/^(https?|file):/i.test(urlEchec)) return
    if (!p || !d.recharger) {
      setImmediate(() => d.erreur(urlErreur(typeErreur(code), urlEchec)))
      return
    }
    const g = generation
    const cle = wc.id
    void p
      .surEchec(cle, urlEchec, code)
      .catch(() => ({ action: 'erreur' as const, url: urlErreur(typeErreur(code), urlEchec) }))
      .then((r) =>
        setImmediate(() => {
          if (wc.isDestroyed() || g !== generation) return p.oublier(cle)
          if (r.action === 'recharger') d.recharger?.(urlEchec)
          else d.erreur(r.url)
        })
      )
  })
  if (p) {
    wc.on('did-navigate', (_e, url, codeHttp) => p.surSucces(wc.id, url, codeHttp))
    const cle = wc.id
    wc.once('destroyed', () => p.oublier(cle))
  }

  installerMenuContextuel(wc, {
    fenetre: d.fenetre.win,
    ouvrirDansEtoile: d.ouvrirLien,
    rechercheUrl: (t) => d.rechercheUrl?.(t) ?? `https://duckduckgo.com/?q=${encodeURIComponent(t)}`
  })
}
