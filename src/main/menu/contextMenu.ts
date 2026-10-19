/** Menu contextuel maison d'une vue (clic droit) : navigation, liens, images, sélection, orthographe. */
import { clipboard, Menu, type BaseWindow, type WebContents } from 'electron'
import { modeleMenu, type DepsMenuContextuel } from './modeleMenu'

export function installerMenuContextuel(wc: WebContents, deps: Omit<DepsMenuContextuel, 'copier'> & { fenetre: BaseWindow }): void {
  wc.on('context-menu', (_e, params) => {
    const modele = modeleMenu(wc, params, { ...deps, copier: (t) => clipboard.writeText(t) })
    Menu.buildFromTemplate(modele).popup({ window: deps.fenetre })
  })
}
