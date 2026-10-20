import { WebContentsView, session, type BaseWindow, type Session, type WebContents } from 'electron'
import type { LyraWindow } from '../window/WindowManager'
import { PRELOAD_INTERNAL, PRELOAD_PAGE } from '../preloads'
import { envoyer } from '../ipc'
import { CAPSULE } from '../window/layout'
import { TabTree } from './TabTree'
import { peutEndormir } from './dormance'
import { domaineEnregistrable, placerEnfant, placerNouvelle, planRegroupement, type ModePlacement, type Placement } from './placement'
import { cielRestaure } from './archivage'
import { PALETTE_CONSTELLATIONS } from '../../shared/couleurs'
import type { FenetreSession, HistoriqueEtoile } from '../session/SessionStore'
import { categorieDe, type Categorie } from './categorie'
import { origineDe } from '../shields/Shields'
import { estZoomNormal, palierSuivant } from './zoom'
import { optionsFenetreCachee, prefsPageCachee, testCache } from '../modeTest'
import { estUrlErreur, urlOriginale } from './erreurs'
import { pageDeReglagesEnCapture, raccourciPage } from './raccourcis'
import { estVraiePopup } from './popup'
import { arreter as arreterRechercheWc, rechercher as rechercherWc } from './find'
import { attacherComportements } from './comportements'
import { enTest } from '../modeTest'
import type { CrochetsPasserelles } from '../passerelles/Passerelles'
import type { Constellation, SkyState } from '../../shared/types'
import type { AncreMenu, CanalEvenement, DemandePermission, EtatEtoile, Evenements, RouteOverlay, SkyChange } from '../../shared/ipc'

const URL_NEWTAB = 'lyra://newtab'
const SCHEMAS_OUVRABLES = /^(https?|lyra|file):/i
const EN_TEST = enTest()

/** Un site ne peut faire ouvrir ni page Lyra ni fichier local (file:// n'existe que pour les e2e). */
const interditAuxSites = (url: string): boolean => /^lyra:/i.test(url) || (!EN_TEST && /^file:/i.test(url))

interface Extras {
  favicon?: string
  couleur?: string
  teinteFavicon?: string
}

/** Drapeau transmis aux preloads web : la sonde window.__lyraShields n'existe qu'en test. */
const ARGS_TEST = enTest() ? ['--lyra-test'] : []

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
  /** Session des pages web (fenêtre privée : partition mémoire propre à la fenêtre) ; `persist:lyra` par défaut. */
  session?: Session
  /** Minutes d'inactivité avant l'endormissement (0 ou moins : jamais). */
  endormirApresMin?: () => number
  surChangement?: () => void
  /** Réglages d'apparence lus à chaque étoile ouverte : placement (« Nouvelle étoile ouverte ») et regroupement par site. Absent : fin du ciel, sans regroupement. */
  placement?: () => { nouvelleEtoile: ModePlacement; regrouperParSite: boolean }
  /** Horloge (ms) : début d'inactivité des étoiles dormantes ; `Date.now` par défaut. */
  maintenant?: () => number
  /** Zoom mémorisé pour une origine (facteur) et son enregistrement. */
  zoomDe?: (origine: string) => number | undefined
  memoriserZoom?: (origine: string, facteur: number) => void
  /** Adresse de recherche (moteur par défaut) pour un texte sélectionné. */
  rechercheUrl?: (texte: string) => string
  /** Passerelles (rotation, détection, icône de la pilule). */
  passerelles?: CrochetsPasserelles
  /** Échap dans une page : sort du mode Ne pas déranger s'il est actif. */
  surEchap?: () => void
  /** ⌘ ⇧ D dans une page (le site ne peut pas l'avaler) : entre dans Ne pas déranger ou en sort. */
  basculerDnd?: () => void
  /** Ne pas déranger : retient une popup (`window.open` avec features) ; faux si elle doit s'ouvrir normalement. */
  retenirPopup?: (popup: { url: string; origine: string; etoileId: string }) => boolean
  /** Couleur dominante d'un favicon déjà en cache (« Le ciel prend la teinte du site actif ») ; `null` : aucune. */
  couleurFavicon?: (wc: WebContents, url: string) => Promise<string | null>
  /** `Settings.raccourcis` courant (commande → accélérateur, vide = défaut) : les raccourcis de page suivent les réglages. */
  raccourcis?: () => Record<string, string>
  /** Extensions : suivi des étoiles web (chrome.tabs) ; absent pour une fenêtre privée (jamais d'extensions). */
  extensions?: {
    ajouter(wc: WebContents, win: BaseWindow): void
    retirer(wc: WebContents): void
    selectionner(wc: WebContents): void
  }
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
      for (const v of this.vues.values()) this.fermerVue(v)
      this.vues.clear()
    })
  }

  ouvrir(url: string, o: { parentId?: string; actif?: boolean } = {}): string {
    const star = this.tree.creer({ url, ...this.placer(url, o.parentId) })
    const vue = this.creerVue(star.id, url)
    this.vues.set(star.id, vue)
    if (o.actif ?? true) this.activer(star.id)
    else this.armer(star.id)
    void vue.webContents.loadURL(url).catch(() => undefined)
    this.notifier()
    return star.id
  }

  /**
   * Où naît une étoile : sous son parent (lien ou popup : toujours reliée, dans la constellation du parent) ; sinon selon
   * « Nouvelle étoile ouverte ». Puis « Regrouper automatiquement par site » : une étoile encore hors constellation
   * entre dans celle de son domaine, créée au besoin (jamais une étoile déjà rangée, jamais une constellation modifiée).
   */
  private placer(url: string, parentId?: string): Placement {
    const reglages = this.options.placement?.()
    const ciel = this.tree.lecture()
    const parentOk = parentId !== undefined && this.tree.star(parentId) !== undefined
    const p: Placement = parentOk ? placerEnfant(ciel, parentId) : placerNouvelle(ciel, ciel.activeId, reglages?.nouvelleEtoile ?? 'hors-constellation')
    if (p.constellationId || !reglages?.regrouperParSite) return p
    const constellationId = this.constellationDuSite(url)
    if (!constellationId) return p
    return { ...p, constellationId, position: p.position === 'sous-parent' ? 'sous-parent' : 'fin-constellation' }
  }

  /** Constellation du domaine de l'adresse (créée si elle n'existe pas) ; rien sans domaine enregistrable. */
  private constellationDuSite(url: string): string | undefined {
    const domaine = domaineEnregistrable(url)
    if (!domaine) return undefined
    const { constellations } = this.tree.lecture()
    const plan = planRegroupement({ constellations }, domaine)
    if ('constellationId' in plan) return plan.constellationId
    const couleur = PALETTE_CONSTELLATIONS[constellations.length % PALETTE_CONSTELLATIONS.length]
    return this.tree.creerConstellation({ name: plan.creer, color: couleur, auto: true }).id
  }

  /** Étoile ouverte sur une page Lyra (nouvel onglet) qui part vers un site : elle entre alors dans la constellation du site. */
  private regrouperSiteVisite(id: string, url: string): void {
    const star = this.tree.star(id)
    if (!star || star.constellationId || !this.options.placement?.().regrouperParSite) return
    if (categorieDe(star.url) !== 'interne' || categorieDe(url) !== 'web') return
    const c = this.constellationDuSite(url)
    if (c) this.tree.assigner(id, c)
  }

  /**
   * Étoile endormie sans vue (import) : aucun chargement, titre affiché tout de suite, entrée de navigation comme
   * `restaurer`, la vue naît au premier clic (`reveiller`). N'active rien. Constellation inconnue : ignorée.
   */
  ouvrirEndormie(url: string, o: { constellationId?: string; titre?: string; epingle?: boolean } = {}): string {
    const constellationId = o.constellationId && this.tree.constellation(o.constellationId) ? o.constellationId : undefined
    const star = this.tree.creer({ url, constellationId, position: 'fin' })
    star.title = o.titre ?? ''
    star.pinned = o.epingle === true
    star.dormant = true
    star.inactifDepuis = this.maintenant()
    this.entrees.set(star.id, { entries: [{ url, title: star.title }], index: 0 })
    this.notifier()
    return star.id
  }

  constellations(): Constellation[] {
    return this.tree.toJSON().constellations
  }

  creerConstellation(o: { name: string; color: string }): Constellation {
    // Seuls nom et couleur : `auto` est réservé au regroupement par site.
    const c = this.tree.creerConstellation({ name: o.name, color: o.color })
    this.notifier()
    return c
  }

  fermer(id: string, o: { memoriser?: boolean } = {}): void {
    if (!this.tree.star(id)) return
    const vue = this.vues.get(id)
    const etaitActive = this.tree.toJSON().activeId === id
    const { suivantActif } = this.tree.fermer(id, o)
    this.tree.purgerAutoVides()
    this.vues.delete(id)
    this.extras.delete(id)
    this.categories.delete(id)
    this.entrees.delete(id)
    this.inactifDepuis.delete(id)
    clearTimeout(this.minuteursSommeil.get(id))
    this.minuteursSommeil.delete(id)
    if (vue) {
      this.fenetre.win.contentView.removeChildView(vue)
      this.fermerVue(vue)
    }
    if (this.tree.toJSON().stars.length === 0) {
      this.fenetre.setPageView(null)
      this.ouvrir(URL_NEWTAB)
      return
    }
    if (etaitActive && suivantActif) this.activer(suivantActif)
    this.notifier()
  }

  /** État du ciel (sans l'envoyer) : lu par l'archivage. */
  ciel(): SkyState {
    return this.tree.toJSON()
  }

  /** Archivage d'une étoile éteinte : retirée du ciel sans pouvoir être rouverte par ⌘ ⇧ T. Faux si elle n'est plus dormante, ou est active ou épinglée. */
  retirerArchivee(id: string): boolean {
    const star = this.tree.star(id)
    if (!star || !star.dormant || star.pinned || this.vues.has(id) || this.idActif() === id) return false
    this.fermer(id, { memoriser: false })
    return true
  }

  private maintenant(): number {
    return (this.options.maintenant ?? Date.now)()
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
    this.options.extensions?.selectionner(vue.webContents)
    this.notifier()
  }

  /** Ferme la page d'une vue : les extensions cessent d'abord de la suivre (le webContents doit encore exister). */
  private fermerVue(vue: WebContentsView): void {
    const wc = vue.webContents
    if (wc.isDestroyed()) return
    this.options.extensions?.retirer(wc)
    wc.close()
  }

  /** WebContents d'une étoile, s'il existe (étoile éveillée). */
  webContentsDe(id: string): WebContents | undefined {
    const wc = this.vues.get(id)?.webContents
    return wc && !wc.isDestroyed() ? wc : undefined
  }

  naviguer(id: string, url: string): void {
    if (this.tree.star(id)?.dormant) this.reveiller(id)
    this.regrouperSiteVisite(id, url)
    void this.vueAdaptee(id, url)?.webContents.loadURL(url).catch(() => undefined)
  }

  /** Navigue et attend la fin du chargement (test:navigate). */
  async naviguerEtAttendre(id: string, url: string): Promise<void> {
    if (this.tree.star(id)?.dormant) this.reveiller(id)
    this.regrouperSiteVisite(id, url)
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
    this.fermerVue(ancienne)
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

  /** Plein écran de la fenêtre (raccourci « Plein écran » du menu). */
  basculerPleinEcran(): void {
    const w = this.fenetre.win
    w.setFullScreen(!w.isFullScreen())
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
    this.inactifDepuis.set(id, this.maintenant())
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
    // Début de l'inactivité (celui de la minuterie d'endormissement) : l'archivage des étoiles éteintes en part.
    star.inactifDepuis = this.inactifDepuis.get(id) ?? this.maintenant()
    clearTimeout(this.minuteursSommeil.get(id))
    this.minuteursSommeil.delete(id)
    this.inactifDepuis.delete(id)
    this.vues.delete(id)
    this.extras.delete(id)
    this.fenetre.win.contentView.removeChildView(vue)
    this.fermerVue(vue)
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
    delete star.inactifDepuis
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
    const ciel = cielRestaure(f.ciel, this.maintenant())
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

  /** Sortie de Ne pas déranger : popup retenue ouverte en étoile d'arrière-plan, reliée à son opener s'il existe encore. */
  ouvrirRetenue(url: string, etoileId?: string): void {
    if (!SCHEMAS_OUVRABLES.test(url) || interditAuxSites(url)) return
    this.ouvrir(url, { parentId: etoileId && this.tree.star(etoileId) ? etoileId : undefined, actif: false })
  }

  /** Active l'étoile d'origine d'une notification, si elle existe encore (réveillée si endormie). */
  focaliserEtoile(etoileId: string | undefined): boolean {
    if (!etoileId || !this.tree.star(etoileId)) return false
    this.activer(etoileId)
    return true
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
        ...(this.options.passerelles?.enRecherche(wc.id) ? { recherchePasserelle: true } : {}),
        ...(estZoomNormal(wc.getZoomFactor()) ? {} : { zoom: wc.getZoomFactor() }),
        ...(this.inactifDepuis.has(id) ? { inactifDepuis: this.inactifDepuis.get(id) } : {}),
        ...(ex.favicon ? { favicon: ex.favicon } : {}),
        ...(ex.couleur ? { couleur: ex.couleur } : {}),
        ...(ex.teinteFavicon ? { teinteFavicon: ex.teinteFavicon } : {})
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
        session: this.options.session ?? session.fromPartition('persist:lyra'),
        sandbox: true,
        contextIsolation: true,
        // Un seul mécanisme de preload : webPreferences.preload (pas de session.registerPreloadScript,
        // qui l'exécuterait une seconde fois). nodeIntegrationInSubFrames le fait aussi tourner dans les
        // iframes (toujours en sandbox, sans Node) : les scriptlets couvrent ainsi les lecteurs intégrés.
        preload: interne ? PRELOAD_INTERNAL : PRELOAD_PAGE,
        nodeIntegrationInSubFrames: !interne,
        additionalArguments: interne ? [] : ARGS_TEST,
        ...prefsPageCachee()
      }
    })
    const wc = vue.webContents
    // Les extensions suivent les pages web de cette fenêtre (chrome.tabs) ; jamais les pages lyra://.
    if (!interne) this.options.extensions?.ajouter(wc, this.fenetre.win)
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
      this.extras.set(id, { ...this.extras.get(id), favicon: favicons[0], teinteFavicon: undefined })
      const etoile = this.tree.star(id)
      if (etoile && favicons[0]) etoile.favicon = favicons[0]
      this.notifier()
      // Teinte du site à défaut de `theme-color` : lue dans le cache, jamais sur le réseau.
      if (favicons[0] && this.options.couleurFavicon) {
        void this.options.couleurFavicon(wc, favicons[0]).then((teinte) => {
          if (!teinte || wc.isDestroyed() || this.extras.get(id)?.favicon !== favicons[0]) return
          this.extras.set(id, { ...this.extras.get(id), teinteFavicon: teinte })
          this.notifier()
        })
      }
    })
    wc.on('did-change-theme-color', (_e, couleur) => {
      this.extras.set(id, { ...this.extras.get(id), couleur: couleur ?? undefined })
      this.notifier()
    })
    // « Masquer la capsule quand la souris ne bouge plus » : la page est une autre vue, le chrome ne voit pas ses mouvements.
    // Simple signal (10 par seconde au plus), sans aucune donnée de page ; `y` est compté depuis le haut réel de la capsule.
    let dernierMouvement = 0
    wc.on('input-event', (_e, ev) => {
      if (ev.type !== 'mouseMove' || this.fenetre.win.isDestroyed()) return
      const maintenant = Date.now()
      if (maintenant - dernierMouvement < 100) return
      dernierMouvement = maintenant
      const page = this.fenetre.bounds().page
      envoyer(this.fenetre.chrome.webContents, 'capsule:souris', { y: page.y + ((ev as { y?: number }).y ?? 0) - (page.y - CAPSULE) })
    })
    wc.on('before-input-event', (_e, input) => {
      // Échap sort de Ne pas déranger (sauf en plein écran HTML : Échap y sert d'abord à en sortir). La page le reçoit aussi.
      if (input.type === 'keyDown' && input.key === 'Escape' && !input.isAutoRepeat && !input.control && !input.meta && !input.alt && !input.shift && !this.fenetre.estPleinEcran()) {
        this.options.surEchap?.()
      }
      // La page ne doit pas avaler ces raccourcis : preventDefault coupe aussi le menu, on agit donc ici.
      // Réglages > Raccourcis clavier capte lui-même les touches : on ne les traite pas avant elle.
      if (pageDeReglagesEnCapture(wc.getURL())) return
      const raccourci = raccourciPage(input, this.options.raccourcis?.())
      if (!raccourci) return
      _e.preventDefault()
      if (!raccourci.agir) return
      if (raccourci.nom === 'palette') this.ouvrirPalette()
      else if (raccourci.nom === 'nouvelle-etoile') this.ouvrir(URL_NEWTAB)
      else if (raccourci.nom === 'recherche') this.ouvrirRecherche()
      else this.options.basculerDnd?.()
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
      // Vraie popup : disposition « nouvelle fenêtre » ou features de fenêtre. `noopener` / `noreferrer` seuls
      // (lien ordinaire cliqué par l'utilisateur) ouvrent une étoile comme `target=_blank`.
      if (estVraiePopup(details)) {
        // Ne pas déranger : la popup est retenue (comptée ; ouverte à la sortie si elle a une adresse web), la page n'en reçoit pas de fenêtre.
        if (this.options.retenirPopup?.({ url: details.url, origine: origineDe(wc.getURL()), etoileId: id })) return { action: 'deny' }
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 500,
            height: 640,
            ...optionsFenetreCachee(),
            ...(testCache() ? { paintWhenInitiallyHidden: true } : {}),
            webPreferences: { sandbox: true, contextIsolation: true, preload: PRELOAD_PAGE, nodeIntegrationInSubFrames: true, additionalArguments: ARGS_TEST, ...prefsPageCachee() }
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
