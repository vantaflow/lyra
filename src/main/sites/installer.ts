/** Canal `sites:*` : lecture et écriture des règles par site, et diffusion `sites:changed` aux vues internes. */
import { ipcMain, webContents, type WebContents } from 'electron'
import type { RegleSite } from '../../shared/types'
import { envoyer, handle } from '../ipc'
import type { Reglages } from '../settings/settings'
import { creerReglesSites } from './regles'
import { creerServiceSites } from './service'
import { scriptUaPourPage } from './ua'

export interface DepsSites {
  reglages: Reglages
  /** Fenêtre privée : aucune règle de site n'y est écrite. */
  estPrivee(wc: WebContents): boolean
}

export function installerSites(deps: DepsSites): void {
  const service = creerServiceSites<WebContents>({
    reglages: deps.reglages,
    estPrivee: deps.estPrivee,
    vues: () => webContents.getAllWebContents(),
    envoyer: (wc, regles) => envoyer(wc, 'sites:changed', regles)
  })
  handle('sites:lister', () => service.lister())
  handle('sites:ecrire', (d, e) => service.ecrire(d as { cle: string; regle: Record<string, unknown> }, e.sender))
  handle('sites:supprimer', (cle, e) => service.supprimer(cle, e.sender))
}

/** Règles par site passant par `webRequest` (cookies, scripts, user-agent) : à brancher sur chaque session par `equiper`. */
export function installerReglesSites(deps: { reglages: Reglages }) {
  const sites = (): Record<string, RegleSite> => deps.reglages.getSettings().sites
  // Synchrone : le preload des pages attend la réponse avant le premier script de la page. La page principale est celle de l'expéditeur
  // (jamais l'adresse que la page annonce), et seules les pages web reçoivent un script.
  ipcMain.on('sites:ua-script', (e) => {
    try {
      e.returnValue = scriptUaPourPage(sites(), e.sender.getURL())
    } catch (err) {
      console.warn('[sites] script du user-agent :', err)
      e.returnValue = ''
    }
  })
  return creerReglesSites({ sites })
}
