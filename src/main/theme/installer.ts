/** Thème effectif : diffusion de `theme:variables` aux vues Lyra, `theme:effectif` pour le rattrapage au chargement, `nativeTheme`. */
import { app, ipcMain, nativeTheme, powerMonitor, webContents, type WebContents } from 'electron'
import { envoyer, estVueLyra, handle } from '../ipc'
import type { Reglages } from '../settings/settings'
import { GestionnaireTheme, type NativeThemeLike } from '../settings/theme'

export interface DepsTheme {
  reglages: Reglages
  /** La fenêtre de cette vue est privée : elle reçoit le thème privé. */
  estPrivee(wc: WebContents): boolean
}

export function installerTheme(deps: DepsTheme): GestionnaireTheme {
  const { reglages } = deps
  const gestionnaire = new GestionnaireTheme({
    reglages: () => {
      const { theme, couleurs } = reglages.getSettings()
      return { theme, couleurs }
    },
    nativeTheme: nativeTheme as unknown as NativeThemeLike,
    energie: powerMonitor,
    // Toutes les vues dans la même boucle d'évènements : elles appliquent les variables dans la même image.
    diffuser: (theme) => {
      for (const wc of webContents.getAllWebContents()) if (estVueLyra(wc.getURL())) envoyer(wc, 'theme:variables', theme)
    }
  })
  handle('theme:effectif', () => gestionnaire.effectif())
  // Preloads des vues Lyra : le thème est posé avant le premier rendu (appel synchrone, aucune image avec l'ancien thème).
  ipcMain.on('theme:initial', (e) => {
    if (!estVueLyra(e.senderFrame?.url ?? '')) {
      e.returnValue = null
      return
    }
    const t = gestionnaire.effectif()
    e.returnValue = { mode: t.mode, variables: deps.estPrivee(e.sender) ? t.privee : t.variables }
  })
  let precedent = JSON.stringify([reglages.getSettings().theme, reglages.getSettings().couleurs])
  reglages.onChanged((s) => {
    const courant = JSON.stringify([s.theme, s.couleurs])
    if (courant === precedent) return
    precedent = courant
    gestionnaire.recalculer()
  })
  // Écritures disque throttlées (60 ms) : la dernière valeur est écrite avant de quitter.
  app.on('will-quit', () => {
    gestionnaire.arreter()
    reglages.vider()
  })
  gestionnaire.demarrer()
  return gestionnaire
}
