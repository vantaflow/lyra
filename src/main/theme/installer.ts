/** Thème effectif : diffusion de `theme:variables` aux vues Lyra, `theme:effectif` pour le rattrapage au chargement, `nativeTheme`. */
import { app, nativeTheme, webContents } from 'electron'
import { envoyer, handle } from '../ipc'
import type { Reglages } from '../settings/settings'
import { GestionnaireTheme, type NativeThemeLike } from '../settings/theme'

export interface DepsTheme {
  reglages: Reglages
}

/** Vue Lyra (interface, overlay, page lyra://) : jamais une page web. */
const estVueLyra = (url: string): boolean => url.startsWith('lyra://') || url.includes('ui.html')

export function installerTheme(deps: DepsTheme): GestionnaireTheme {
  const { reglages } = deps
  const gestionnaire = new GestionnaireTheme({
    reglages: () => {
      const { theme, couleurs } = reglages.getSettings()
      return { theme, couleurs }
    },
    nativeTheme: nativeTheme as unknown as NativeThemeLike,
    // Toutes les vues dans la même boucle d'évènements : elles appliquent les variables dans la même image.
    diffuser: (theme) => {
      for (const wc of webContents.getAllWebContents()) if (estVueLyra(wc.getURL())) envoyer(wc, 'theme:variables', theme)
    }
  })
  handle('theme:effectif', () => gestionnaire.effectif())
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
