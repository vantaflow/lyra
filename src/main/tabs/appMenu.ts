import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { analyser, detecterConflit } from '../../shared/accelerateur'
import { commandeParId, tableEffective } from '../../shared/commandes'
import type { TabManager } from './TabManager'

/** Menu d'application : les accélérateurs pilotent le TabManager de la fenêtre courante. */
export interface ActionsMenu {
  nouvelleFenetre(): void
  nouvelleFenetrePrivee(): void
  basculerFavori(m: TabManager): void
  /** Replie le ciel (rail) ou l'épingle de nouveau : bascule `ciel.masque`. */
  basculerCiel(): void
  /** Entre dans Ne pas déranger (1 h) ou en sort, dans la fenêtre courante. */
  basculerDnd(): void
}

/**
 * Modèle du menu d'application. Les ids d'éléments sont stables (`COMMANDES[].idMenu`) ; les accélérateurs viennent
 * de `settings.raccourcis` (`table`, vide = défaut) via `tableEffective` (valeurs invalides ou en conflit écartées).
 * Pur (hors `app.quit` d'un clic) : testé sans fenêtre.
 */
export function construireModele(
  courant: () => TabManager | undefined,
  actions: ActionsMenu,
  table: Record<string, string>,
  plateforme: string
): MenuItemConstructorOptions[] {
  const effective = tableEffective(table, plateforme)
  const agir = (f: (m: TabManager, actif: string | null) => void) => (): void => {
    const m = courant()
    if (m) f(m, m.idActif())
  }
  /** Élément de la commande `id` : id de menu, libellé et accélérateur de la table. */
  const item = (id: string, click: () => void, extra: Partial<MenuItemConstructorOptions> = {}): MenuItemConstructorOptions => {
    const c = commandeParId(id)!
    return { id: c.idMenu, label: c.libelle, accelerator: effective[id], click, ...extra }
  }
  const numeros: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) =>
    item(i === 8 ? 'derniereEtoile' : `etoile${i + 1}`, agir((m) => m.numero(i + 1)))
  )
  // « Zoom avant » : sur un clavier où « + » demande Maj, ⌘ = doit aussi zoomer. Alias caché, sauf conflit.
  const zoomAlias: MenuItemConstructorOptions[] = []
  const zoom = effective.zoomAvant && analyser(effective.zoomAvant)
  if (zoom && zoom.touche === 'Plus') {
    const alias = effective.zoomAvant.replace(/Plus$/, '=')
    if (detecterConflit(effective, 'zoomAvant', alias, plateforme) === null) {
      zoomAlias.push({ label: commandeParId('zoomAvant')!.libelle, accelerator: alias, visible: false, click: agir((m, id) => id && m.zoomer(id, { delta: 1 })) })
    }
  }
  return [
    ...(plateforme === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Fichier',
      submenu: [
        item('nouvelleEtoile', agir((m) => void m.ouvrir('lyra://newtab'))),
        item('fermerEtoile', agir((m, id) => id && m.fermer(id))),
        item('rouvrirEtoile', agir((m) => m.rouvrirDerniere())),
        item('nouvelleFenetre', actions.nouvelleFenetre),
        item('fenetrePrivee', actions.nouvelleFenetrePrivee),
        { type: 'separator' },
        item('palette', agir((m) => m.ouvrirPalette())),
        ...(plateforme === 'darwin' ? [] : [{ type: 'separator' as const }, item('quitter', () => app.quit())])
      ]
    },
    { label: 'Édition', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'Affichage',
      submenu: [
        item('recharger', agir((m, id) => id && m.recharger(id))),
        { type: 'separator' },
        item('trouver', agir((m) => m.ouvrirRecherche())),
        item('zoomAvant', agir((m, id) => id && m.zoomer(id, { delta: 1 }))),
        ...zoomAlias,
        item('zoomArriere', agir((m, id) => id && m.zoomer(id, { delta: -1 }))),
        item('zoomZero', agir((m, id) => id && m.zoomer(id, { reset: true }))),
        item('dnd', actions.basculerDnd),
        item('basculerCiel', actions.basculerCiel),
        { type: 'separator' },
        item('imprimer', agir((m) => m.imprimer())),
        item('pleinEcran', agir((m) => m.basculerPleinEcran())),
        item('outils', agir((m) => m.outilsDeveloppement()))
      ]
    },
    {
      label: 'Navigation',
      submenu: [
        item('etoileSuivante', agir((m) => m.voisine(1))),
        item('etoilePrecedente', agir((m) => m.voisine(-1))),
        item('favori', agir((m) => actions.basculerFavori(m))),
        item('favoris', agir((m) => void m.ouvrir('lyra://bookmarks'))),
        item('historique', agir((m) => void m.ouvrir('lyra://history'))),
        item('telechargements', agir((m) => void m.ouvrir('lyra://downloads'))),
        item('reglages', agir((m) => void m.ouvrir('lyra://settings'))),
        { type: 'separator' },
        ...numeros
      ]
    }
  ]
}

export interface OptionsReconstructeur {
  /** Délai (ms) avant reconstruction : un menu ouvert se ferme quand on le remplace. */
  delaiMs: number
  /** `Settings.raccourcis` courant. */
  lire(): Record<string, string>
  plateforme: string
  /** Remplace réellement le menu d'application. */
  construire(): void
  /** Un menu est-il ouvert à l'écran ? (la reconstruction attend sa fermeture) */
  menuOuvert(): boolean
}

/** Au bout de ce nombre d'attentes, on reconstruit quand même (un évènement « fermé » perdu ne doit rien bloquer). */
const ATTENTES_MAX = 10

/**
 * Reconstruction différée du menu : `planifier()` à chaque changement de réglage ; ne fait rien si les accélérateurs
 * effectifs sont inchangés, regroupe une rafale de changements, et attend qu'aucun menu ne soit ouvert.
 */
export function reconstructeurDiffere(o: OptionsReconstructeur): { planifier(): void; reconstruire(): void } {
  const signature = (): string => JSON.stringify(tableEffective(o.lire(), o.plateforme))
  // Le menu courant correspond aux réglages au moment de l'appel (l'installation initiale appelle `reconstruire`).
  let appliquee = signature()
  let minuteur: ReturnType<typeof setTimeout> | undefined
  let attentes = 0
  const arreter = (): void => {
    if (minuteur) clearTimeout(minuteur)
    minuteur = undefined
    attentes = 0
  }
  const reconstruire = (): void => {
    arreter()
    appliquee = signature()
    o.construire()
  }
  const armer = (): void => {
    minuteur = setTimeout(() => {
      minuteur = undefined
      if (o.menuOuvert() && attentes < ATTENTES_MAX) {
        attentes++
        armer()
      } else reconstruire()
    }, o.delaiMs)
  }
  return {
    reconstruire,
    planifier: () => {
      if (signature() === appliquee) return arreter()
      if (minuteur) clearTimeout(minuteur)
      attentes = 0
      armer()
    }
  }
}

/** Suit l'ouverture des menus (au clic sur « Fichier »…) : `menu-will-show` / `menu-will-close` du menu et de ses sous-menus. */
function surveillerOuverture(menu: Menu, ouverts: Set<Menu>): void {
  menu.on('menu-will-show', () => ouverts.add(menu))
  menu.on('menu-will-close', () => ouverts.delete(menu))
  for (const i of menu.items) if (i.submenu) surveillerOuverture(i.submenu, ouverts)
}

/**
 * Installe le menu d'application ; renvoie `planifier`, à appeler à chaque changement de réglages (le menu n'est
 * reconstruit, 300 ms plus tard, que si un raccourci a vraiment changé).
 */
export function installerMenu(
  courant: () => TabManager | undefined,
  actions: ActionsMenu,
  raccourcis: () => Record<string, string> = () => ({})
): { planifier(): void } {
  const ouverts = new Set<Menu>()
  const construire = (): void => {
    ouverts.clear()
    const menu = Menu.buildFromTemplate(construireModele(courant, actions, raccourcis(), process.platform))
    surveillerOuverture(menu, ouverts)
    Menu.setApplicationMenu(menu)
  }
  const r = reconstructeurDiffere({ delaiMs: 300, lire: raccourcis, plateforme: process.platform, construire, menuOuvert: () => ouverts.size > 0 })
  r.reconstruire()
  return { planifier: r.planifier }
}
