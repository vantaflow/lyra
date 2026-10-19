import { BaseWindow, WebContentsView, type WebContents } from 'electron'
import { join } from 'node:path'
import { PRELOAD_UI } from '../preloads'
import { computeLayout, type Layout } from './layout'
import type { Settings } from '../../shared/types'
import type { RouteOverlay } from '../../shared/ipc'
import { envoyer } from '../ipc'
import { optionsFenetreCachee, prefsPageCachee } from '../modeTest'

export interface LyraWindow {
  id: number
  win: BaseWindow
  chrome: WebContentsView
  overlay: WebContentsView
  setPageView(v: WebContentsView | null): void
  relayout(): void
  setPleinEcran(b: boolean): void
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

  constructor(private lireCiel: () => Settings['ciel']) {}

  creerFenetre(opts: { privee?: boolean } = {}): LyraWindow {
    void opts.privee // la navigation privée est traitée par une tâche ultérieure
    const win = new BaseWindow({
      width: 1280,
      height: 800,
      title: 'Lyra',
      // Derrière le ciel révélé et la page : jamais de blanc quand la vue chrome change de taille.
      backgroundColor: '#15152E',
      ...optionsFenetreCachee(),
      ...(process.platform === 'darwin'
        ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 14 } }
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
    /** Ordre appliqué la dernière fois (révélé : le chrome passe au-dessus de la page). */
    let ordreRevele = false

    const estRevele = (): boolean => revele && this.lireCiel().masque && !pleinEcran
    const bounds = (): Layout => {
      const { width, height } = win.getContentBounds()
      return computeLayout({ width, height }, this.lireCiel(), pleinEcran, estRevele())
    }
    /** Chrome sous la page ; au-dessus pendant la révélation. L'overlay reste toujours tout en haut. */
    const ordonner = (): void => {
      const rev = estRevele()
      const vues = rev ? [pageView, chrome, overlay] : [chrome, pageView, overlay]
      for (const v of vues) if (v) win.contentView.addChildView(v)
      ordreRevele = rev
    }
    const relayout = (): void => {
      if (win.isDestroyed()) return
      if (!this.lireCiel().masque) revele = false
      if (estRevele() !== ordreRevele) {
        ordonner()
        envoyer(chrome.webContents, 'ciel:revele', estRevele())
      }
      const l = bounds()
      chrome.setBounds(l.chrome)
      chrome.setVisible(l.chrome.width > 0 && l.chrome.height > 0)
      overlay.setBounds(l.overlay)
      pageView?.setBounds(l.page)
    }

    const lw: LyraWindow = {
      id: win.id,
      win,
      chrome,
      overlay,
      bounds,
      relayout,
      estRevele,
      reveler(b) {
        revele = b
        relayout()
        return estRevele()
      },
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
    win.on('closed', () => {
      this.fenetres.delete(lw.id)
      for (const v of [chrome, overlay, pageView]) {
        if (v && !v.webContents.isDestroyed()) v.webContents.close()
      }
    })

    this.fenetres.set(lw.id, lw)
    relayout()
    charger(chrome)
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
