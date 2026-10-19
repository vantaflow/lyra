import { WebContentsView, session } from 'electron'
import type { LyraWindow } from '../window/WindowManager'
import { PRELOAD_INTERNAL, PRELOAD_PAGE } from '../preloads'
import { envoyer } from '../ipc'
import { TabTree } from './TabTree'
import type { EtatEtoile, SkyChange } from '../../shared/ipc'

const URL_NEWTAB = 'lyra://newtab'
const SCHEMAS_OUVRABLES = /^(https?|lyra|file):/i

interface Extras {
  favicon?: string
  couleur?: string
}

/**
 * Une WebContentsView par étoile. Limite connue : le preload est fixé à la création de la vue,
 * donc une étoile créée sur une page web n'a jamais l'API window.lyra, même si on la navigue
 * ensuite vers lyra://, et inversement (une étoile lyra:// garde le preload interne).
 */
export class TabManager {
  readonly tree = new TabTree()
  private vues = new Map<string, WebContentsView>()
  private extras = new Map<string, Extras>()
  private minuteur: NodeJS.Timeout | undefined

  constructor(private fenetre: LyraWindow) {
    fenetre.win.on('closed', () => {
      clearTimeout(this.minuteur)
      for (const v of this.vues.values()) if (!v.webContents.isDestroyed()) v.webContents.close()
      this.vues.clear()
    })
  }

  ouvrir(url: string, o: { parentId?: string; actif?: boolean } = {}): string {
    const star = this.tree.creer({ url, parentId: o.parentId, position: o.parentId ? 'sous-parent' : 'fin' })
    const vue = this.creerVue(star.id, url)
    this.vues.set(star.id, vue)
    if (o.actif ?? true) this.activer(star.id)
    void vue.webContents.loadURL(url).catch(() => undefined)
    this.notifier()
    return star.id
  }

  fermer(id: string): void {
    const vue = this.vues.get(id)
    if (!vue || !this.tree.star(id)) return
    const etaitActive = this.tree.toJSON().activeId === id
    const { suivantActif } = this.tree.fermer(id)
    this.vues.delete(id)
    this.extras.delete(id)
    this.fenetre.win.contentView.removeChildView(vue)
    if (!vue.webContents.isDestroyed()) vue.webContents.close()
    if (this.vues.size === 0) {
      this.fenetre.setPageView(null)
      this.ouvrir(URL_NEWTAB)
      return
    }
    if (etaitActive && suivantActif) this.activer(suivantActif)
    this.notifier()
  }

  activer(id: string): void {
    const vue = this.vues.get(id)
    if (!vue) return
    this.tree.activer(id)
    this.fenetre.setPageView(vue)
    vue.webContents.focus()
    this.notifier()
  }

  naviguer(id: string, url: string): void {
    void this.vues.get(id)?.webContents.loadURL(url).catch(() => undefined)
  }

  /** Navigue et attend la fin du chargement (test:navigate). */
  async naviguerEtAttendre(id: string, url: string): Promise<void> {
    await this.vues.get(id)?.webContents.loadURL(url).catch(() => undefined)
  }

  precedent(id: string): void {
    this.vues.get(id)?.webContents.navigationHistory.goBack()
  }

  suivant(id: string): void {
    this.vues.get(id)?.webContents.navigationHistory.goForward()
  }

  recharger(id: string): void {
    this.vues.get(id)?.webContents.reload()
  }

  deplacer(id: string, o: { parentId?: string; index: number }): void {
    this.tree.deplacer(id, o)
    this.notifier()
  }

  epingler(id: string, pinned: boolean): void {
    this.tree.epingler(id, pinned)
    this.notifier()
  }

  rouvrirDerniere(): void {
    const star = this.tree.rouvrirDerniere()
    if (!star) return
    const vue = this.creerVue(star.id, star.url)
    this.vues.set(star.id, vue)
    this.activer(star.id)
    void vue.webContents.loadURL(star.url).catch(() => undefined)
  }

  /** Étoile voisine dans l'ordre du ciel ; delta = +1 / -1, circulaire. */
  voisine(delta: number): void {
    const { stars, activeId } = this.tree.toJSON()
    if (stars.length === 0) return
    const i = stars.findIndex((s) => s.id === activeId)
    this.activer(stars[(i + delta + stars.length) % stars.length].id)
  }

  /** n-ième étoile (1-based) ; n = 9 → la dernière. */
  numero(n: number): void {
    const { stars } = this.tree.toJSON()
    const cible = n >= 9 ? stars.at(-1) : stars[n - 1]
    if (cible) this.activer(cible.id)
  }

  idActif(): string | null {
    return this.tree.toJSON().activeId
  }

  ouvrirPalette(): void {
    envoyer(this.fenetre.chrome.webContents, 'palette:open', undefined)
  }

  snapshot(): SkyChange {
    const etats: Record<string, EtatEtoile> = {}
    for (const [id, vue] of this.vues) {
      const wc = vue.webContents
      if (wc.isDestroyed()) continue
      const star = this.tree.star(id)
      const ex = this.extras.get(id) ?? {}
      etats[id] = {
        chargement: wc.isLoading(),
        titre: wc.getTitle() || star?.title || '',
        url: wc.getURL() || star?.url || '',
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        ...(ex.favicon ? { favicon: ex.favicon } : {}),
        ...(ex.couleur ? { couleur: ex.couleur } : {})
      }
    }
    return { sky: this.tree.toJSON(), etats }
  }

  private notifier(): void {
    if (this.minuteur) return
    this.minuteur = setTimeout(() => {
      this.minuteur = undefined
      if (this.fenetre.win.isDestroyed()) return
      envoyer(this.fenetre.chrome.webContents, 'sky:changed', this.snapshot())
    }, 30)
  }

  private creerVue(id: string, url: string): WebContentsView {
    const vue = new WebContentsView({
      webPreferences: {
        session: session.fromPartition('persist:lyra'),
        sandbox: true,
        contextIsolation: true,
        preload: url.startsWith('lyra://') ? PRELOAD_INTERNAL : PRELOAD_PAGE
      }
    })
    const wc = vue.webContents
    const maj = (): void => {
      const star = this.tree.star(id)
      if (star) {
        star.url = wc.getURL() || star.url
        star.title = wc.getTitle() || star.title
      }
      this.notifier()
    }
    for (const evt of [
      'did-start-loading',
      'did-stop-loading',
      'did-navigate',
      'did-navigate-in-page',
      'page-title-updated'
    ] as const) {
      wc.on(evt as 'did-stop-loading', maj)
    }
    wc.on('page-favicon-updated', (_e, favicons) => {
      this.extras.set(id, { ...this.extras.get(id), favicon: favicons[0] })
      this.notifier()
    })
    wc.on('did-change-theme-color', (_e, couleur) => {
      this.extras.set(id, { ...this.extras.get(id), couleur: couleur ?? undefined })
      this.notifier()
    })
    wc.on('before-input-event', (_e, input) => {
      if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return
      const k = input.key.toLowerCase()
      // La page ne doit pas avaler ces raccourcis : preventDefault coupe aussi le menu, on agit donc ici.
      if (k === 'l' && !input.shift) {
        _e.preventDefault()
        this.ouvrirPalette()
      } else if (k === 't' && !input.shift) {
        _e.preventDefault()
        this.ouvrir(URL_NEWTAB)
      }
    })
    wc.setWindowOpenHandler((details) => {
      if (details.features) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 500,
            height: 640,
            webPreferences: { sandbox: true, contextIsolation: true, preload: PRELOAD_PAGE }
          }
        }
      }
      if (SCHEMAS_OUVRABLES.test(details.url)) {
        this.ouvrir(details.url, { parentId: id, actif: details.disposition !== 'background-tab' })
      }
      return { action: 'deny' }
    })
    return vue
  }
}
