/**
 * Pont entre Lyra et `electron-chrome-extensions` (API chrome.tabs / chrome.windows des extensions).
 * Un seul exemplaire par processus, sur la session `persist:lyra` : jamais de fenêtre privée (la bibliothèque
 * ne sait pas isoler une session privée ; `lyra://extensions` le dit).
 */
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import type { BaseWindow, Session, WebContents } from 'electron'
import { testCache } from '../modeTest'

/** Ce que les extensions demandent aux étoiles (implémenté par `index.ts` au-dessus des `TabManager`). */
export interface PontEtoiles {
  /** Ouvre une étoile (fenêtre indiquée, sinon la fenêtre courante) ; undefined si aucune fenêtre ne convient. */
  ouvrir(url: string, o: { fenetreId?: number; actif: boolean }): { wc: WebContents; win: BaseWindow } | undefined
  /** Une extension demande l'activation de cette étoile. */
  activer(wc: WebContents): void
  /** Une extension ferme cette étoile (chrome.tabs.remove). */
  fermer(wc: WebContents): void
}

/** Fenêtres créées ou fermées par les extensions (chrome.windows) ; sous `LYRA_TEST`, cachées (WindowManager.creerFenetre). */
export interface PontFenetres {
  creer(url?: string): BaseWindow
  fermer(win: BaseWindow): void
}

export interface OptionsExtensions {
  session: Session
  /** Session de la vue d'interface : la seule qui sert les icônes d'action `crx://`. */
  sessionUI?: Session
  tabs: PontEtoiles
  fenetres: PontFenetres
}

export interface Extensions {
  /** À appeler pour chaque étoile web créée dans une fenêtre normale. */
  addTab(wc: WebContents, win: BaseWindow): void
  /** À appeler quand l'étoile se ferme (avant la destruction du webContents). */
  removeTab(wc: WebContents): void
  /** À appeler quand une étoile devient active. */
  selectTab(wc: WebContents): void
  readonly session: Session
}

let singleton: Extensions | undefined

export function creerExtensions(o: OptionsExtensions): Extensions {
  if (singleton) throw new Error('Extensions est déjà créé')
  /** Fermetures initiées par Lyra : le rappel `removeTab` de la bibliothèque ne doit pas refermer l'étoile une seconde fois. */
  const retraitsLyra = new Set<WebContents>()

  const lib = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: o.session,
    createTab: async (details) => {
      const r = o.tabs.ouvrir(details.url ?? 'lyra://newtab', { fenetreId: details.windowId, actif: details.active !== false })
      if (!r) throw new Error("création d'étoile impossible")
      return [r.wc, r.win]
    },
    selectTab: (wc) => o.tabs.activer(wc),
    removeTab: (wc) => {
      if (!retraitsLyra.has(wc)) o.tabs.fermer(wc)
    },
    createWindow: async (details) => o.fenetres.creer(Array.isArray(details.url) ? details.url[0] : details.url),
    removeWindow: (win) => o.fenetres.fermer(win),
    // Permissions optionnelles : toujours refusées (limite assumée, dite dans lyra://extensions).
    requestPermissions: async () => false,
    assignTabDetails: (details) => {
      // Les extensions ne vivent jamais en fenêtre privée.
      details.incognito = false
    }
  })
  // La bibliothèque retire une fenêtre de son registre quand sa dernière étoile web part, puis la ré-observe (focus, resized,
  // closed : jamais retirés) à l'`addTab` suivant. Un aller-retour page web <-> lyra:// dans une même étoile fait donc fuiter
  // 3 écouteurs sur la fenêtre (MaxListenersExceededWarning) et émet un `windows.onCreated` parasite. On n'annonce
  // `window-added` qu'une seule fois par fenêtre ; le registre de la bibliothèque, lui, reste à jour.
  const store = (lib as unknown as { ctx?: { store?: { emit: (e: string | symbol, ...a: unknown[]) => boolean } } }).ctx?.store
  if (store && typeof store.emit === 'function') {
    const observees = new WeakSet<object>()
    const emit = store.emit.bind(store)
    store.emit = (evenement, ...args) => {
      if (evenement === 'window-added' && args[0] && typeof args[0] === 'object') {
        if (observees.has(args[0])) return false
        observees.add(args[0])
      }
      return emit(evenement, ...args)
    }
  }
  // Popups d'action : fenêtre native ancrée au bouton (spec §9, réponse 4). Sous `LYRA_TEST`, jamais affichée : la fenêtre
  // existe et charge son HTML (le popup est testable) mais `show()` n'est pas appelé.
  if (testCache()) lib.on('browser-action-popup-created', (popup) => void ((popup as unknown as { show: () => void }).show = () => undefined))
  // Icônes d'action (<browser-action-list>) : protocole crx:// servi à la session de l'interface seulement. Les sites de
  // `persist:lyra` ne l'ont pas : une page web ne peut pas lire les icônes (ni énumérer les extensions) par <img src="crx://…">.
  if (o.sessionUI && o.sessionUI !== o.session) ElectronChromeExtensions.handleCRXProtocol(o.sessionUI)

  singleton = {
    session: o.session,
    addTab: (wc, win) => lib.addTab(wc, win),
    removeTab: (wc) => {
      retraitsLyra.add(wc)
      try {
        lib.removeTab(wc)
      } finally {
        retraitsLyra.delete(wc)
      }
    },
    selectTab: (wc) => lib.selectTab(wc)
  }
  return singleton
}

/** L'exemplaire créé au démarrage ; undefined avant `creerExtensions`. */
export const extensions = (): Extensions | undefined => singleton
