import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { TabManager } from './TabManager'

/** Menu d'application : les accélérateurs pilotent le TabManager de la fenêtre courante. */
export interface ActionsMenu {
  nouvelleFenetre(): void
  basculerFavori(m: TabManager): void
  /** Replie le ciel (rail) ou l'épingle de nouveau : bascule `ciel.masque`. */
  basculerCiel(): void
  /** Entre dans Ne pas déranger (1 h) ou en sort, dans la fenêtre courante. */
  basculerDnd(): void
}

export function installerMenu(courant: () => TabManager | undefined, actions: ActionsMenu): void {
  const agir = (f: (m: TabManager, actif: string | null) => void) => (): void => {
    const m = courant()
    if (m) f(m, m.idActif())
  }
  const numeros: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) => ({
    id: `etoile-${i + 1}`,
    label: i === 8 ? 'Dernière étoile' : `Étoile ${i + 1}`,
    accelerator: `CmdOrCtrl+${i + 1}`,
    click: agir((m) => m.numero(i + 1))
  }))
  const modele: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Fichier',
      submenu: [
        { id: 'nouvelle-etoile', label: 'Nouvelle étoile', accelerator: 'CmdOrCtrl+T', click: agir((m) => void m.ouvrir('lyra://newtab')) },
        { id: 'fermer-etoile', label: "Fermer l'étoile", accelerator: 'CmdOrCtrl+W', click: agir((m, id) => id && m.fermer(id)) },
        { id: 'rouvrir-etoile', label: 'Rouvrir la dernière étoile', accelerator: 'CmdOrCtrl+Shift+T', click: agir((m) => m.rouvrirDerniere()) },
        { id: 'nouvelle-fenetre', label: 'Nouvelle fenêtre', accelerator: 'CmdOrCtrl+N', click: actions.nouvelleFenetre },
        { type: 'separator' },
        { id: 'palette', label: 'Aller à…', accelerator: 'CmdOrCtrl+L', click: agir((m) => m.ouvrirPalette()) },
        ...(process.platform === 'darwin'
          ? []
          : [{ type: 'separator' as const }, { id: 'quitter', label: 'Quitter', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }])
      ]
    },
    { label: 'Édition', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'Affichage',
      submenu: [
        { id: 'recharger', label: 'Recharger', accelerator: 'CmdOrCtrl+R', click: agir((m, id) => id && m.recharger(id)) },
        { type: 'separator' },
        { id: 'trouver', label: 'Rechercher dans la page', accelerator: 'CmdOrCtrl+F', click: agir((m) => m.ouvrirRecherche()) },
        { id: 'zoom-plus', label: 'Zoom avant', accelerator: 'CmdOrCtrl+Plus', click: agir((m, id) => id && m.zoomer(id, { delta: 1 })) },
        { label: 'Zoom avant', accelerator: 'CmdOrCtrl+=', visible: false, click: agir((m, id) => id && m.zoomer(id, { delta: 1 })) },
        { id: 'zoom-moins', label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', click: agir((m, id) => id && m.zoomer(id, { delta: -1 })) },
        { id: 'zoom-zero', label: 'Taille réelle', accelerator: 'CmdOrCtrl+0', click: agir((m, id) => id && m.zoomer(id, { reset: true })) },
        { id: 'ne-pas-deranger', label: 'Ne pas déranger', accelerator: 'CmdOrCtrl+Shift+D', click: actions.basculerDnd },
        { id: 'basculer-ciel', label: 'Replier ou épingler le ciel', accelerator: 'CmdOrCtrl+\\', click: actions.basculerCiel },
        { type: 'separator' },
        { id: 'imprimer', label: 'Imprimer…', accelerator: 'CmdOrCtrl+P', click: agir((m) => m.imprimer()) },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Navigation',
      submenu: [
        { id: 'etoile-suivante', label: 'Étoile suivante', accelerator: 'Ctrl+Tab', click: agir((m) => m.voisine(1)) },
        { id: 'etoile-precedente', label: 'Étoile précédente', accelerator: 'Ctrl+Shift+Tab', click: agir((m) => m.voisine(-1)) },
        { id: 'favori', label: 'Ajouter aux favoris', accelerator: 'CmdOrCtrl+D', click: agir((m) => actions.basculerFavori(m)) },
        { id: 'historique', label: 'Historique', accelerator: 'CmdOrCtrl+Y', click: agir((m) => void m.ouvrir('lyra://history')) },
        { id: 'reglages', label: 'Réglages', accelerator: 'CmdOrCtrl+,', click: agir((m) => void m.ouvrir('lyra://settings')) },
        { type: 'separator' },
        ...numeros
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(modele))
}
