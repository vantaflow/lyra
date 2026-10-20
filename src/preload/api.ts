// API window.lyra commune aux preloads ui et internal (inlinée dans chaque bundle).
import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { variablesValides } from '../shared/variablesCss'
import type { LyraApi } from '../shared/ipc'
import { declarationsApparence, type ThemeInitial } from '../main/theme/initial'

/** Thème effectif posé avant le premier rendu (sinon une image s'afficherait avec les valeurs d'Indigo nuit clair). */
function poserThemeInitial(): void {
  try {
    const t = ipcRenderer.sendSync('theme:initial') as ThemeInitial | null
    if (!t) return
    const declarations = variablesValides(t.variables).map(([nom, valeur]) => `${nom}:${valeur}`).join(';')
    // Spécificité triple : l'emporte sur `:root`, `:root[data-mode]` et `:root.privee` de theme.css, quel que soit l'ordre de chargement.
    // Police, taille, densité et coins : même raison (sinon l'overlay s'ouvre une image en Manrope avant `settings:get`).
    const apparence = t.apparence ? declarationsApparence(t.apparence) : ''
    const toutes = [declarations, apparence].filter(Boolean).join(';')
    if (toutes) webFrame.insertCSS(`:root:root:root{${toutes}}`)
  } catch {
    // Pas de thème initial : theme.css et la diffusion `theme:variables` prennent le relais.
  }
}

export function exposerApi(): void {
  poserThemeInitial()
  const api: LyraApi = {
    invoke: (canal, data) => ipcRenderer.invoke(canal, data),
    on: (canal, cb) => {
      const ecouteur = (_e: unknown, data: Parameters<typeof cb>[0]): void => cb(data)
      ipcRenderer.on(canal, ecouteur)
      return () => {
        ipcRenderer.removeListener(canal, ecouteur)
      }
    },
    plateforme: process.platform
  }
  contextBridge.exposeInMainWorld('lyra', api)
}
