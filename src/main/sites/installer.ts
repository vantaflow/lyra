/** Canal `sites:*` : lecture et écriture des règles par site, et diffusion `sites:changed`. */
import { webContents, type WebContents } from 'electron'
import type { RegleSite } from '../../shared/types'
import { envoyer, handle } from '../ipc'
import { cleDe } from '../settings/sites'
import type { Reglages } from '../settings/settings'

export interface DepsSites {
  reglages: Reglages
  /** Fenêtre privée : aucune règle de site n'y est écrite. */
  estPrivee(wc: WebContents): boolean
}

export function installerSites(deps: DepsSites): void {
  const { reglages } = deps
  let precedent = reglages.getSettings().sites
  reglages.onChanged((s) => {
    if (s.sites === precedent) return
    precedent = s.sites
    for (const wc of webContents.getAllWebContents()) envoyer(wc, 'sites:changed', s.sites)
  })

  handle('sites:lister', () => reglages.getSettings().sites)
  handle('sites:ecrire', (d, e) => {
    if (deps.estPrivee(e.sender)) return
    if (typeof d?.cle !== 'string' || !cleDe(d.cle) || typeof d.regle !== 'object' || d.regle === null) return
    reglages.setSettings({ sites: { [d.cle]: d.regle as RegleSite } })
  })
  handle('sites:supprimer', (cle, e) => {
    if (deps.estPrivee(e.sender)) return
    if (typeof cle !== 'string' || !Object.hasOwn(reglages.getSettings().sites, cle)) return
    reglages.supprimerSite(cle)
  })
}
