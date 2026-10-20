import { join } from 'node:path'

/**
 * Chemin de l'icône de Lyra (PNG 1024 px, `build/icon.png`) : copiée en ressource à côté de l'asar une fois empaquetée
 * (`extraResources` d'electron-builder), lue dans `build/` en développement. Fonction pure : testable sans Electron.
 */
export function cheminIcone(empaquetee: boolean, dossierRessources: string, dossierApp: string): string {
  return empaquetee ? join(dossierRessources, 'icon.png') : join(dossierApp, 'build', 'icon.png')
}

/** Icône de fenêtre pour Windows et Linux ; macOS prend celle du paquet (et `app.dock.setIcon` en développement). */
export function optionIconeFenetre(plateforme: NodeJS.Platform, chemin: string): { icon?: string } {
  return plateforme === 'darwin' ? {} : { icon: chemin }
}
