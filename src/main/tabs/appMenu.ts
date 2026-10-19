import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { TabManager } from './TabManager'

/** Menu d'application : les accélérateurs pilotent le TabManager de la fenêtre courante. */
export function installerMenu(courant: () => TabManager | undefined): void {
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
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Navigation',
      submenu: [
        { id: 'etoile-suivante', label: 'Étoile suivante', accelerator: 'Ctrl+Tab', click: agir((m) => m.voisine(1)) },
        { id: 'etoile-precedente', label: 'Étoile précédente', accelerator: 'Ctrl+Shift+Tab', click: agir((m) => m.voisine(-1)) },
        { type: 'separator' },
        ...numeros
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(modele))
}
