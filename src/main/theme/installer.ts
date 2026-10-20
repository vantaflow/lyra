/** Thème effectif : diffusion de `theme:variables` aux vues Lyra, `theme:effectif` pour le rattrapage au chargement, `nativeTheme`. */
import { app, ipcMain, nativeTheme, powerMonitor, webContents, type WebContents } from 'electron'
import { envoyer, estVueLyra, handle } from '../ipc'
import type { Reglages } from '../settings/settings'
import { enTest } from '../modeTest'
import { GestionnaireTheme, type NativeThemeLike } from '../settings/theme'
import { themeInitial } from './initial'

export interface DepsTheme {
  reglages: Reglages
  /** La fenêtre de cette vue est privée : elle reçoit le thème privé. */
  estPrivee(wc: WebContents): boolean
}

/**
 * Horloge de test : `LYRA_TEST_HORLOGE` (date ISO) fixe l'heure de départ, qui continue ensuite d'avancer en temps réel.
 * Réservée aux tests (`enTest()`) ; sinon (ou date invalide) l'horloge du système.
 */
export function horlogeDeTest(env: NodeJS.ProcessEnv = process.env, test: boolean = enTest()): (() => Date) | undefined {
  const depart = test ? Date.parse(env.LYRA_TEST_HORLOGE ?? '') : NaN
  if (Number.isNaN(depart)) return undefined
  const decalage = depart - Date.now()
  return () => new Date(Date.now() + decalage)
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
    horloge: horlogeDeTest(),
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
    e.returnValue = themeInitial(t, deps.estPrivee(e.sender), reglages.getSettings().apparence)
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
