/** Canal `sites:*` : lecture et écriture des règles par site, et diffusion `sites:changed` aux vues internes. */
import { webContents, type WebContents } from 'electron'
import type { RegleSite } from '../../shared/types'
import { envoyer, handle } from '../ipc'
import type { Reglages } from '../settings/settings'
import { creerServiceSites } from './service'

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
