import { WebContentsView, session, type WebContents } from 'electron'
import type { LyraWindow } from '../window/WindowManager'
import { PRELOAD_INTERNAL, PRELOAD_PAGE } from '../preloads'
import { envoyer } from '../ipc'
import { TabTree } from './TabTree'
import { peutEndormir } from './dormance'
import type { FenetreSession, HistoriqueEtoile } from '../session/SessionStore'
import { categorieDe, type Categorie } from './categorie'
import { origineDe } from '../shields/Shields'
import { estZoomNormal, palierSuivant } from './zoom'
import { estUrlErreur, urlOriginale } from './erreurs'
import { arreter as arreterRechercheWc, rechercher as rechercherWc } from './find'
import { attacherComportements } from './comportements'
import type { CrochetsPasserelles } from '../passerelles/Passerelles'
import type { SkyState } from '../../shared/types'
import type { AncreMenu, CanalEvenement, DemandePermission, EtatEtoile, Evenements, RouteOverlay, SkyChange } from '../../shared/ipc'

const URL_NEWTAB = 'lyra://newtab'
const SCHEMAS_OUVRABLES = /^(https?|lyra|file):/i
const EN_TEST = process.env.LYRA_TEST === '1'

/** Un site ne peut faire ouvrir ni page Lyra ni fichier local (file:// n'existe que pour les e2e). */
const interditAuxSites = (url: string): boolean => /^lyra:/i.test(url) || (!EN_TEST && /^file:/i.test(url))

interface Extras {
  favicon?: string
  couleur?: string
}

/** Drapeau transmis aux preloads web : la sonde window.__lyraShields n'existe qu'en test. */
const ARGS_TEST = process.env.LYRA_TEST === '1' ? ['--lyra-test'] : []

/** Rappels vers l'historique ; absents pour une fenêtre privée. */
export interface RappelsHistorique {
  visite(url: string, titre: string, date: number): void
  titre(url: string, titre: string): void
}

/**
 * Une WebContentsView par étoile. Le preload est fixé à la création de la vue : une vue `interne`
 * (lyra://, preload avec window.lyra) ne montre jamais de site, une vue `web` (preload des Boucliers)
 * jamais de page lyra://. Quand une navigation change de catégorie, la vue est recréée (l'historique
 * Précédent/Suivant repart alors de zéro) ; une page web ne peut pas naviguer d'elle-même vers lyra://.
 */
/** Réglages de dormance et rappel de changement (sauvegarde de la session). */
export interface OptionsTabs {
  /** Minutes d'inactivité avant l'endormissement (0 ou moins : jamais). */
  endormirApresMin?: () => number
  surChangement?: () => void
  /** Zoom mémorisé pour une origine (facteur) et son enregistrement. */
  zoomDe?: (origine: string) => number | undefined
  memoriserZoom?: (origine: string, facteur: number) => void
  /** Adresse de recherche (moteur par défaut) pour un texte sélectionné. */
  rechercheUrl?: (texte: string) => string
  /** Passerelles (rotation, détection, icône de la pilule). */
  passerelles?: CrochetsPasserelles
}

export class TabManager {
  tree = new TabTree()
  private vues = new Map<string, WebContentsView>()
  private extras = new Map<string, Extras>()
  private categories = new Map<string, Categorie>()
  /** Popups ouvertes depuis nos pages (OAuth…) : ce sont aussi des pages web. */
  private popups = new Set<WebContents>()
  private minuteur: NodeJS.Timeout | undefined
  /** Historique de navigation des étoiles endormies. */
  private entrees = new Map<string, HistoriqueEtoile>()
  private minuteursSommeil = new Map<string, NodeJS.Timeout>()
  private inactifDepuis = new Map<string, number>()

  constructor(
    private fenetre: LyraWindow,
    private historique?: RappelsHistorique,
    private options: OptionsTabs = {}
  ) {
    fenetre.win.on('closed', () => {
      clearTimeout(this.minuteur)
      for (const t of this.minuteursSommeil.values()) clearTimeout(t)
      for (const v of this.vues.values()) if (!v.webContents.isDestroyed()) v.webContents.close()
      this.vues.clear()
    })
  }

  ouvrir(url: string, o: { parentId?: string; actif?: boolean } = {}): string {
    const star = this.tree.creer({ url, parentId: o.parentId, position: o.parentId ? 'sous-parent' : 'fin' })
    const vue = this.creerVue(star.id, url)
    this.vues.set(star.id, vue)
    if (o.actif ?? true) this.activer(star.id)
    else this.armer(star.id)
    void vue.webContents.loadURL(url).catch(() => undefined)
    this.notifier()
    return star.id
  }

  fermer(id: string): void {
    if (!this.tree.star(id)) return
    const vue = this.vues.get(id)
    const etaitActive = this.tree.toJSON().activeId === id
    const { suivantActif } = this.tree.fermer(id)
    this.vues.delete(id)
    this.extras.delete(id)
    this.categories.delete(id)
    this.entrees.delete(id)
    this.inactifDepuis.delete(id)
    clearTimeout(this.minuteursSommeil.get(id))
    this.minuteursSommeil.delete(id)
    if (vue) {
      this.fenetre.win.contentView.removeChildView(vue)
      if (!vue.webContents.isDestroyed()) vue.webContents.close()
    }
    if (this.tree.toJSON().stars.length === 0) {
      this.fenetre.setPageView(null)
      this.ouvrir(URL_NEWTAB)
      return
    }
    if (etaitActive && suivantActif) this.activer(suivantActif)
    this.notifier()
  }

  activer(id: string): void {
    if (this.tree.star(id)?.dormant) this.reveiller(id)
    const vue = this.vues.get(id)
    if (!vue) return
    const precedent = this.tree.toJSON().activeId
    this.tree.activer(id)
    clearTimeout(this.minuteursSommeil.get(id))
    this.inactifDepuis.delete(id)
    if (precedent && precedent !== id) this.armer(precedent)
    this.fenetre.setPageView(vue)
    vue.webContents.focus()
    this.notifier()
  }

  naviguer(id: string, url: string): void {
    if (this.tree.star(id)?.dormant) this.reveiller(id)
    void this.vueAdaptee(id, url)?.webContents.loadURL(url).catch(() => undefined)
  }

  /** Navigue et attend la fin du chargement (test:navigate). */
  async naviguerEtAttendre(id: string, url: string): Promise<void> {
    if (this.tree.star(id)?.dormant) this.reveiller(id)
    await this.vueAdaptee(id, url)?.webContents.loadURL(url).catch(() => undefined)
  }

  /** Vue de l'étoile, recréée avec le bon preload si `url` change de catégorie (interne / web). */
  private vueAdaptee(id: string, url: string): WebContentsView | undefined {
    const ancienne = this.vues.get(id)
    if (!ancienne || this.categories.get(id) === categorieDe(url)) return ancienne
    const vue = this.creerVue(id, url)
    this.vues.set(id, vue)
    this.extras.delete(id)
    if (this.tree.toJSON().activeId === id) {
      this.fenetre.setPageView(vue)
      vue.webContents.focus()
    }
    if (!ancienne.webContents.isDestroyed()) ancienne.webContents.close()
    this.notifier()
    return vue
  }

  precedent(id: string): void {
    this.vues.get(id)?.webContents.navigationHistory.goBack()
  }

  suivant(id: string): void {
    this.vues.get(id)?.webContents.navigationHistory.goForward()
  }

  recharger(id: string): void {
    const wc = this.vues.get(id)?.webContents
    if (!wc) return
    // Sur une page d'erreur, recharger = réessayer l'adresse d'origine.
    if (estUrlErreur(wc.getURL())) this.naviguer(id, urlOriginale(wc.getURL()))
    else wc.reload()
  }

  /** Étoile dont la vue est `wc`. */
  idDe(wc: WebContents): string | undefined {
    for (const [id, v] of this.vues) if (v.webContents === wc) return id
    return undefined
  }

  /** Zoom d'une étoile (l'active par défaut) : palier suivant, précédent ou 100 % ; mémorisé par site. */
  zoomer(id: string | undefined, o: { delta?: 1 | -1; reset?: boolean }): number {
    const cible = id ?? this.idActif()
    const wc = cible ? this.vues.get(cible)?.webContents : undefined
    if (!wc || wc.isDestroyed()) return 1
    const facteur = o.reset ? 1 : o.delta ? palierSuivant(wc.getZoomFactor(), o.delta) : wc.getZoomFactor()
    wc.setZoomFactor(facteur)
    const origine = origineDe(wc.getURL())
    if (origine) this.options.memoriserZoom?.(origine, facteur)
    this.notifier()
    return facteur
  }

  rechercher(id: string, texte: string, o: { suivant?: boolean; precedent?: boolean } = {}): void {
    const wc = this.vues.get(id)?.webContents
    if (wc) rechercherWc(wc, texte, o)
  }

  /** Efface la recherche ; le focus revient à la page si c'est l'étoile affichée. */
  arreterRecherche(id: string): void {
    const wc = this.vues.get(id)?.webContents
    if (!wc) return
    arreterRechercheWc(wc)
    if (!wc.isDestroyed() && this.tree.toJSON().activeId === id) wc.focus()
  }

  /** ⌘ F : la capsule affiche la barre de recherche et lui donne le focus. */
  ouvrirRecherche(): void {
    this.envoyerAuChrome('find:open', undefined)
    this.fenetre.chrome.webContents.focus()
  }

  imprimer(): void {
    this.wcActif()?.print()
  }

  outilsDeveloppement(): void {
    this.wcActif()?.openDevTools({ mode: 'detach' })
  }

  arreter(id: string): void {
    this.vues.get(id)?.webContents.stop()
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

  /** Minuterie d'endormissement d'une étoile inactive, réarmée à chaque activation. */
  private armer(id: string): void {
    clearTimeout(this.minuteursSommeil.get(id))
    this.inactifDepuis.set(id, Date.now())
    const min = this.options.endormirApresMin?.() ?? 0
    if (min <= 0) return
    const t = setTimeout(() => {
      if (this.vues.has(id) && !this.endormir(id)) this.armer(id)
    }, min * 60_000)
    t.unref()
    this.minuteursSommeil.set(id, t)
  }

  /** Libère la vue d'une étoile en gardant son historique ; false si elle ne peut pas dormir. */
  endormir(id: string): boolean {
    const vue = this.vues.get(id)
    const star = this.tree.star(id)
    if (!vue || !star || vue.webContents.isDestroyed()) return false
    const wc = vue.webContents
    const ok = peutEndormir({
      active: this.tree.toJSON().activeId === id,
      epinglee: star.pinned,
      audible: wc.isCurrentlyAudible(),
      chargement: wc.isLoading(),
      dormante: star.dormant
    })
    if (!ok) return false
    const h = this.historiqueDe(wc)
    if (h) this.entrees.set(id, h)
    star.url = wc.getURL() || star.url
    star.title = wc.getTitle() || star.title
    star.dormant = true
    clearTimeout(this.minuteursSommeil.get(id))
    this.minuteursSommeil.delete(id)
    this.inactifDepuis.delete(id)
    this.vues.delete(id)
    this.extras.delete(id)
    this.fenetre.win.contentView.removeChildView(vue)
    wc.close()
    this.notifier()
    return true
  }

  /** Recrée la vue d'une étoile endormie ; l'historique est restauré avant tout chargement. */
  reveiller(id: string): void {
    const star = this.tree.star(id)
    if (!star || !star.dormant || this.vues.has(id)) return
    const h = this.entrees.get(id)
    const url = h ? h.entries[h.index].url : star.url
    const vue = this.creerVue(id, url)
    this.vues.set(id, vue)
    star.dormant = false
    this.entrees.delete(id)
    if (this.tree.toJSON().activeId !== id) this.armer(id)
    if (star.favicon) this.extras.set(id, { favicon: star.favicon })
    if (h) void vue.webContents.navigationHistory.restore({ entries: h.entries, index: h.index }).catch(() => undefined)
    else void vue.webContents.loadURL(url).catch(() => undefined)
    this.notifier()
  }

  private historiqueDe(wc: WebContents): HistoriqueEtoile | undefined {
    const entries = wc.navigationHistory.getAllEntries()
    return entries.length > 0 ? { entries, index: Math.max(0, wc.navigationHistory.getActiveIndex()) } : undefined
  }

  /** État à sauvegarder : ciel et historiques (réels pour les vues vivantes, mémorisés pour les endormies). */
  exporter(): FenetreSession {
    const entrees: Record<string, HistoriqueEtoile> = {}
    for (const [id, h] of this.entrees) entrees[id] = h
    for (const [id, vue] of this.vues) {
      if (vue.webContents.isDestroyed()) continue
      const h = this.historiqueDe(vue.webContents)
      if (h) entrees[id] = h
    }
    return { ciel: this.tree.toJSON(), entrees }
  }

  /** Recrée le ciel sauvegardé : étoiles endormies (sans vue) sauf l'active, réveillée. */
  restaurer(f: FenetreSession): void {
    const ciel: SkyState = {
      ...f.ciel,
      stars: f.ciel.stars.map((s) => ({ ...s, dormant: true }))
    }
    const actif = ciel.stars.find((s) => s.id === ciel.activeId) ?? ciel.stars[0]
    this.tree = TabTree.fromJSON({ ...ciel, activeId: actif.id })
    for (const [id, h] of Object.entries(f.entrees)) if (this.tree.star(id)) this.entrees.set(id, h)
    this.activer(actif.id)
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

  ouvrirPalette(texteInitial?: string): void {
    this.fenetre.montrerOverlay('palette')
    envoyer(this.fenetre.overlay.webContents, 'palette:open', { texteInitial })
  }

  ouvrirOverlay(route: RouteOverlay): void {
    this.fenetre.montrerOverlay(route)
  }

  get fenetreId(): number {
    return this.fenetre.id
  }

  /** webContents.id de l'overlay de la fenêtre. */
  get overlayId(): number {
    return this.fenetre.overlay.webContents.id
  }

  surOverlay(cb: (route: RouteOverlay | null) => void): void {
    this.fenetre.surOverlay(cb)
  }

  /** Montre la demande de permission d'une page dans l'overlay. */
  demanderPermission(demande: DemandePermission): void {
    this.fenetre.montrerOverlay('permission')
    envoyer(this.fenetre.overlay.webContents, 'permission:ask', demande)
  }

  /** Envoie au menu ⋯ (overlay) son ancre et l'état de la page, en coordonnées de la fenêtre. */
  ancrerMenu(a: AncreMenu): void {
    envoyer(this.fenetre.overlay.webContents, 'menu:ancre', a)
  }

  /** WebContents de l'étoile active. */
  wcActif(): WebContents | undefined {
    const id = this.idActif()
    const wc = id ? this.vues.get(id)?.webContents : undefined
    return wc && !wc.isDestroyed() ? wc : undefined
  }

  /** Vrai si `wc` est une page web de cette fenêtre (étoile ou popup), jamais l'interface. */
  possede(wc: WebContents): boolean {
    if (this.popups.has(wc)) return true
    for (const v of this.vues.values()) if (v.webContents === wc) return true
    return false
  }

  envoyerAuChrome<K extends CanalEvenement>(canal: K, data: Evenements[K]): void {
    if (!this.fenetre.win.isDestroyed()) envoyer(this.fenetre.chrome.webContents, canal, data)
  }

  /** Referme l'overlay (palette ou panneau) et rend le focus à la page active. */
  fermerOverlay(): void {
    this.fenetre.cacherOverlay()
    const id = this.idActif()
    if (id) this.vues.get(id)?.webContents.focus()
  }

  /** Active une étoile (ou en ouvre une) et y charge l'URL : navigation depuis la palette. */
  allerA(url: string, nouvelleEtoile: boolean): void {
    const id = this.idActif()
    if (nouvelleEtoile || !id) this.ouvrir(url)
    else {
      this.naviguer(id, url)
      this.activer(id)
    }
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
        url: urlOriginale(wc.getURL()) || star?.url || '',
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        viaPasserelle: this.options.passerelles?.viaPasserelle(wc.getURL()) ?? false,
        ...(estZoomNormal(wc.getZoomFactor()) ? {} : { zoom: wc.getZoomFactor() }),
        ...(this.inactifDepuis.has(id) ? { inactifDepuis: this.inactifDepuis.get(id) } : {}),
        ...(ex.favicon ? { favicon: ex.favicon } : {}),
        ...(ex.couleur ? { couleur: ex.couleur } : {})
      }
    }
    return { sky: this.tree.toJSON(), etats }
  }

  /** Renvoie l'état du ciel au chrome (ex. : passerelles prêtes ou non). */
  actualiser(): void {
    this.notifier()
  }

  private notifier(): void {
    if (this.minuteur) return
    this.minuteur = setTimeout(() => {
      this.minuteur = undefined
      if (this.fenetre.win.isDestroyed()) return
      envoyer(this.fenetre.chrome.webContents, 'sky:changed', this.snapshot())
      this.options.surChangement?.()
    }, 30)
  }

  private creerVue(id: string, url: string): WebContentsView {
    const categorie = categorieDe(url)
    const interne = categorie === 'interne'
    this.categories.set(id, categorie)
    const vue = new WebContentsView({
      webPreferences: {
        session: session.fromPartition('persist:lyra'),
        sandbox: true,
        contextIsolation: true,
        // Un seul mécanisme de preload : webPreferences.preload (pas de session.registerPreloadScript,
        // qui l'exécuterait une seconde fois). nodeIntegrationInSubFrames le fait aussi tourner dans les
        // iframes (toujours en sandbox, sans Node) : les scriptlets couvrent ainsi les lecteurs intégrés.
        preload: interne ? PRELOAD_INTERNAL : PRELOAD_PAGE,
        nodeIntegrationInSubFrames: !interne,
        additionalArguments: interne ? [] : ARGS_TEST
      }
    })
    const wc = vue.webContents
    // Navigation lancée par la page : jamais d'un site vers lyra:// ; une page interne qui ouvre un site
    // passe par naviguer(), qui recrée la vue avec le preload web (window.lyra n'est jamais exposé à un site).
    const garde = (e: { url: string; preventDefault(): void }, relancer: boolean): void => {
      if (categorieDe(e.url) === categorie) return
      e.preventDefault()
      if (relancer && interne) setImmediate(() => this.vues.get(id) === vue && this.naviguer(id, e.url))
    }
    wc.on('will-navigate', (e) => garde(e, true))
    wc.on('will-redirect', (e) => garde(e, false))
    wc.on('will-frame-navigate', (e) => {
      if (!e.isMainFrame && !interne && categorieDe(e.url) === 'interne') e.preventDefault()
    })
    const maj = (): void => {
      const star = this.tree.star(id)
      if (star) {
        star.url = urlOriginale(wc.getURL()) || star.url
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
    // L'historique se nourrit des navigations de page principale ; le titre arrive après, on le complète.
    // Pas d'entrée pour une page d'erreur HTTP (>= 400) ; did-fail-load n'ajoute rien. Le filtrage des
    // schémas (about:blank, data:, chrome-error://…) est fait par History.
    wc.on('did-navigate', (_e, urlNavigue, codeHttp) => {
      if (codeHttp === undefined || codeHttp < 400) this.historique?.visite(urlNavigue, '', Date.now())
    })
    wc.on('page-title-updated', (_e, titre) => this.historique?.titre(wc.getURL(), titre))
    wc.on('page-favicon-updated', (_e, favicons) => {
      this.extras.set(id, { ...this.extras.get(id), favicon: favicons[0] })
      const etoile = this.tree.star(id)
      if (etoile && favicons[0]) etoile.favicon = favicons[0]
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
      } else if (k === 'f' && !input.shift) {
        _e.preventDefault()
        this.ouvrirRecherche()
      }
    })
    attacherComportements(wc, {
      id,
      fenetre: this.fenetre,
      zoomDe: this.options.zoomDe,
      rechercheUrl: this.options.rechercheUrl,
      envoyerAuChrome: (canal, data) => this.envoyerAuChrome(canal, data),
      estActive: () => this.tree.toJSON().activeId === id,
      erreur: (url) => this.vues.get(id) === vue && this.naviguer(id, url),
      recharger: (url) => this.vues.get(id) === vue && this.naviguer(id, url),
      passerelles: this.options.passerelles,
      ouvrirLien: (u) => {
        if (categorie === 'web' ? /^https?:/i.test(u) || (EN_TEST && /^file:/i.test(u)) : SCHEMAS_OUVRABLES.test(u)) this.ouvrir(u, { parentId: id })
      }
    })
    wc.on('did-create-window', (popup) => {
      const pwc = popup.webContents
      this.popups.add(pwc)
      pwc.once('destroyed', () => this.popups.delete(pwc))
    })
    wc.setWindowOpenHandler((details) => {
      if (categorie === 'web' && interditAuxSites(details.url)) return { action: 'deny' }
      if (details.features) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 500,
            height: 640,
            webPreferences: { sandbox: true, contextIsolation: true, preload: PRELOAD_PAGE, nodeIntegrationInSubFrames: true, additionalArguments: ARGS_TEST }
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
