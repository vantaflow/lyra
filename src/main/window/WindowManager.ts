import { BaseWindow, WebContentsView, type WebContents } from 'electron'
import { join } from 'node:path'
import { PRELOAD_UI } from '../preloads'
import { computeLayout, type Layout } from './layout'
import type { Settings } from '../../shared/types'

export interface LyraWindow {
  id: number
  win: BaseWindow
  chrome: WebContentsView
  overlay: WebContentsView
  setPageView(v: WebContentsView | null): void
  relayout(): void
  setPleinEcran(b: boolean): void
  montrerOverlay(route: 'palette'): void
  cacherOverlay(): void
  /** Mise en page courante (pour l'IPC layout:get). */
  bounds(): Layout
}

function charger(vue: WebContentsView, hash = ''): void {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) void vue.webContents.loadURL(`${dev}/ui.html${hash}`)
  else void vue.webContents.loadFile(join(__dirname, '../renderer/ui.html'), hash ? { hash: hash.slice(1) } : undefined)
}

function creerVueUI(): WebContentsView {
  return new WebContentsView({
    webPreferences: { preload: PRELOAD_UI, sandbox: true, contextIsolation: true }
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
    overlay.setVisible(false)
    win.contentView.addChildView(chrome)
    win.contentView.addChildView(overlay)

    let pageView: WebContentsView | null = null
    let pleinEcran = false

    const bounds = (): Layout => {
      const { width, height } = win.getContentBounds()
      return computeLayout({ width, height }, this.lireCiel(), pleinEcran)
    }
    const relayout = (): void => {
      if (win.isDestroyed()) return
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
      setPageView(v) {
        if (pageView && pageView !== v) win.contentView.removeChildView(pageView)
        pageView = v
        if (v) {
          // La page se place entre le chrome et l'overlay.
          win.contentView.addChildView(v, 1)
          if (overlay.getVisible()) win.contentView.addChildView(overlay)
        }
        relayout()
      },
      setPleinEcran(b) {
        pleinEcran = b
        relayout()
      },
      montrerOverlay(_route) {
        win.contentView.addChildView(overlay)
        overlay.setVisible(true)
        overlay.webContents.focus()
      },
      cacherOverlay() {
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
