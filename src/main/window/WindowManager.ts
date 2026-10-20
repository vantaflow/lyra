import { app, BaseWindow, WebContentsView, type WebContents } from 'electron'
import { join } from 'node:path'
import { PRELOAD_UI } from '../preloads'
import { FENETRE_MIN, bornerLargeur, computeLayout, positionFeux, type DndLayout, type Layout } from './layout'
import type { Settings } from '../../shared/types'
import type { RouteOverlay } from '../../shared/ipc'
import { envoyer } from '../ipc'
import { optionsFenetreCachee, prefsPageCachee } from '../modeTest'
import { cheminIcone, optionIconeFenetre } from '../icone'

/** Ciel du thème Aurore (fenêtres privées), cf. docs/design/project/Couleurs.dc.html. */
const CIEL_PRIVE = '#2A1540'

export interface LyraWindow {
  id: number
  /** Fenêtre privée : thème Aurore, session mémoire propre à la fenêtre. */
  privee: boolean
  win: BaseWindow
  chrome: WebContentsView
  overlay: WebContentsView
  setPageView(v: WebContentsView | null): void
  relayout(): void
  setPleinEcran(b: boolean): void
  /** Plein écran HTML en cours (la page prend toute la fenêtre). */
  estPleinEcran(): boolean
  /** Mode Ne pas déranger : page plein cadre, chrome réduit au rappel (ou au croissant) ; null pour en sortir. */
  setDnd(dnd: DndLayout | null): void
  /** Largeur mesurée de la pastille du rappel : la zone de la vue chrome la suit. */
  setDndLargeur(largeur: number): void
  /** Mode Ne pas déranger actif dans cette fenêtre. */
  estDnd(): boolean
  montrerOverlay(route: RouteOverlay): void
  /** Appelé à chaque changement de l'overlay : la route affichée, ou null quand il se ferme. */
  surOverlay(cb: (route: RouteOverlay | null) => void): void
  cacherOverlay(): void
  /** Mise en page courante (pour l'IPC layout:get). */
  bounds(): Layout
  /** Ciel masqué glissé par-dessus la page ? (toujours faux si le ciel n'est pas masqué) */
  estRevele(): boolean
  /** Révèle ou retire le ciel masqué ; sans effet si le ciel n'est pas masqué. Renvoie l'état obtenu. */
  reveler(b: boolean): boolean
  /** Glisser de l'en-tête du ciel en cours : la page est masquée pour laisser voir le bord visé. */
  glisserCiel(b: boolean): void
  /** Un glisser de l'en-tête du ciel est en cours (page masquée). */
  estEnGlisse(): boolean
  /** Ordre des vues, de la plus basse à la plus haute (pour les tests). */
  ordreVues(): Array<'chrome' | 'page' | 'overlay'>
}

function charger(vue: WebContentsView, hash = ''): void {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) void vue.webContents.loadURL(`${dev}/ui.html${hash}`)
  else void vue.webContents.loadFile(join(__dirname, '../renderer/ui.html'), hash ? { hash: hash.slice(1) } : undefined)
}

function creerVueUI(): WebContentsView {
  return new WebContentsView({
    webPreferences: { preload: PRELOAD_UI, sandbox: true, contextIsolation: true, ...prefsPageCachee() }
  })
}

export class WindowManager {
  private fenetres = new Map<number, LyraWindow>()

  /** Largeur en cours de réglage à la poignée (aperçu en direct, pas encore enregistrée). */
  private apercu: number | null = null

  constructor(private lireCielBrut: () => Settings['ciel']) {}

  /** Réglage du ciel, avec l'aperçu de largeur en cours. */
  private lireCiel(): Settings['ciel'] {
    const ciel = this.lireCielBrut()
    return this.apercu === null ? ciel : { ...ciel, largeur: this.apercu }
  }

  /** Aperçu en direct de la largeur du ciel (toutes les fenêtres) ; null l'efface. Rien n'est écrit. */
  apercuLargeur(largeur: number | null): void {
    this.apercu = largeur === null ? null : bornerLargeur(largeur)
    this.relayoutAll()
  }

  creerFenetre(opts: { privee?: boolean } = {}): LyraWindow {
    const privee = opts.privee === true
    const win = new BaseWindow({
      width: 1280,
      height: 800,
      // Assez large pour la colonne la plus large du ciel plus une page, et pour que la bande reste lisible.
      minWidth: FENETRE_MIN.width,
      minHeight: FENETRE_MIN.height,
      title: 'Lyra',
      // Derrière le ciel révélé et la page : jamais de blanc quand la vue chrome change de taille.
      backgroundColor: privee ? CIEL_PRIVE : '#15152E',
      ...optionsFenetreCachee(),
      // Fenêtre et barre des tâches (Windows, Linux) ; macOS prend l'icône du paquet.
      ...optionIconeFenetre(process.platform, cheminIcone(app.isPackaged, process.resourcesPath, app.getAppPath())),
      ...(process.platform === 'darwin'
        ? { titleBarStyle: 'hidden' as const, trafficLightPosition: positionFeux(this.lireCiel()) }
        : {}),
      ...(process.platform === 'win32'
        ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#00000000', symbolColor: '#888888', height: 32 } }
        : {})
    })
    const chrome = creerVueUI()
    const overlay = creerVueUI()
    overlay.setBackgroundColor('#00000000')
    // Le chrome dessine son propre fond (opaque, ou transparent autour du ciel révélé).
    chrome.setBackgroundColor('#00000000')
    overlay.setVisible(false)
    win.contentView.addChildView(chrome)
    win.contentView.addChildView(overlay)

    let pageView: WebContentsView | null = null
    const ecouteursOverlay: Array<(route: RouteOverlay | null) => void> = []
    let pleinEcran = false
    let revele = false
    let glisse = false
    let dnd: DndLayout | null = null
    /** Position des feux tricolores (macOS) appliquée la dernière fois. */
    let feux = positionFeux(this.lireCiel())
    /** Ordre appliqué la dernière fois (révélé : le chrome passe au-dessus de la page). */
    let ordreRevele = false

    const estRevele = (): boolean => revele && this.lireCiel().masque && !pleinEcran && !dnd
    const bounds = (): Layout => {
      const { width, height } = win.getContentBounds()
      return computeLayout({ width, height }, this.lireCiel(), pleinEcran, estRevele(), dnd)
    }
    /** Chrome sous la page ; au-dessus pendant la révélation. L'overlay reste toujours tout en haut. */
    const ordonner = (): void => {
      // Ne pas déranger : la page est plein cadre, la vue chrome (rappel, croissant) passe par-dessus.
      const rev = estRevele() || dnd !== null
      const vues = rev ? [pageView, chrome, overlay] : [chrome, pageView, overlay]
      for (const v of vues) if (v) win.contentView.addChildView(v)
      ordreRevele = rev
    }
    const relayout = (): void => {
      if (win.isDestroyed()) return
      if (!this.lireCiel().masque) revele = false
      const dessus = estRevele() || dnd !== null
      if (dessus !== ordreRevele) {
        ordonner()
        envoyer(chrome.webContents, 'ciel:revele', estRevele())
      }
      const l = bounds()
      chrome.setBounds(l.chrome)
      chrome.setVisible(l.chrome.width > 0 && l.chrome.height > 0)
      overlay.setBounds(l.overlay)
      pageView?.setBounds(l.page)
      pageView?.setVisible(!glisse)
      if (process.platform === 'darwin') {
        // Centrés sur la bande quand le ciel est en haut, à leur place habituelle sinon.
        const f = positionFeux(this.lireCiel())
        if (f.x !== feux.x || f.y !== feux.y) {
          feux = f
          win.setWindowButtonPosition(f)
        }
      }
    }
    /** Un glisser (en-tête, poignée de largeur) est perdu, la vue chrome ayant planté ou rechargé : tout revient à la normale. */
    const finGlisse = (): void => {
      if (!glisse && this.apercu === null) return
      glisse = false
      this.apercu = null
      this.relayoutAll()
    }

    const lw: LyraWindow = {
      id: win.id,
      privee,
      win,
      chrome,
      overlay,
      bounds,
      relayout,
      estRevele,
      reveler(b) {
        // Ignoré pendant Ne pas déranger ou le plein écran : aucun état latent à la sortie du mode.
        if (b && (dnd !== null || pleinEcran)) return false
        revele = b
        relayout()
        return estRevele()
      },
      glisserCiel(b) {
        glisse = b
        relayout()
      },
      estEnGlisse: () => glisse,
      ordreVues() {
        const ordre = win.contentView.children
        return ([['chrome', chrome], ['page', pageView], ['overlay', overlay]] as const)
          .filter((x): x is readonly [typeof x[0], WebContentsView] => x[1] !== null && ordre.includes(x[1]))
          .sort((a, b) => ordre.indexOf(a[1]) - ordre.indexOf(b[1]))
          .map((x) => x[0])
      },
      setPageView(v) {
        if (pageView && pageView !== v) win.contentView.removeChildView(pageView)
        pageView = v
        // La page se place entre le chrome et l'overlay (ou sous le chrome pendant la révélation).
        ordonner()
        relayout()
      },
      setPleinEcran(b) {
        pleinEcran = b
        relayout()
      },
      estPleinEcran: () => pleinEcran,
      estDnd: () => dnd !== null,
      setDnd(d) {
        // La largeur mesurée du rappel survit aux changements d'état (compteur, délai) tant que le mode dure.
        dnd = d ? { ...d, largeur: d.largeur ?? dnd?.largeur } : null
        if (d) {
          // Plus de ciel révélé ni de glisser en cours.
          revele = false
          glisse = false
          envoyer(chrome.webContents, 'ciel:revele', false)
        }
        ordonner()
        relayout()
      },
      setDndLargeur(largeur) {
        if (!dnd || !Number.isFinite(largeur) || largeur <= 0 || dnd.largeur === largeur) return
        dnd = { ...dnd, largeur }
        relayout()
      },
      surOverlay(cb) {
        ecouteursOverlay.push(cb)
      },
      montrerOverlay(route) {
        for (const cb of ecouteursOverlay) cb(route)
        envoyer(overlay.webContents, 'overlay:route', route)
        win.contentView.addChildView(overlay)
        overlay.setVisible(true)
        overlay.webContents.focus()
      },
      cacherOverlay() {
        for (const cb of ecouteursOverlay) cb(null)
        overlay.setVisible(false)
      }
    }

    win.on('resize', relayout)
    // Filet de sécurité : si la vue chrome plante ou se recharge pendant un glisser, la page ne reste pas masquée.
    chrome.webContents.on('render-process-gone', finGlisse)
    chrome.webContents.on('did-start-loading', finGlisse)
    win.on('closed', () => {
      // Fermée pendant le glissement de la poignée : l'aperçu de largeur ne reste pas sur les autres fenêtres.
      finGlisse()
      this.fenetres.delete(lw.id)
      for (const v of [chrome, overlay, pageView]) {
        if (v && !v.webContents.isDestroyed()) v.webContents.close()
      }
    })

    this.fenetres.set(lw.id, lw)
    relayout()
    charger(chrome, privee ? '#privee' : '')
    charger(overlay, '#overlay')
    return lw
  }

  fenetre(id: number): LyraWindow | undefined {
    return this.fenetres.get(id)
  }

  /** Fenêtre dont le chrome ou l'overlay est l'expéditeur donné. */
  deWebContents(wc: WebContents): LyraWindow | undefined {
    for (const f of this.fenetres.values()) {
      if (f.chrome.webContents === wc || f.overlay.webContents === wc) return f
    }
    return undefined
  }

  relayoutAll(): void {
    for (const f of this.fenetres.values()) f.relayout()
  }

  premiere(): LyraWindow | undefined {
    return this.fenetres.values().next().value
  }
}
