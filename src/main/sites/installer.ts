/** Canal `sites:*` : lecture et écriture des règles par site, et diffusion `sites:changed` aux vues internes. */
import { ipcMain, webContents, type WebContents } from 'electron'
import type { RegleSite } from '../../shared/types'
import { envoyer, estVueLyra, handle } from '../ipc'
import type { Reglages } from '../settings/settings'
import { creerReglesSites } from './regles'
import { creerServiceSites } from './service'
import { AUCUNE_REGLE_PAGE, reglesDePage, urlDeFrame } from './page'

export interface DepsSites {
  reglages: Reglages
  /** Fenêtre privée : aucune règle de site n'y est écrite. */
  estPrivee(wc: WebContents): boolean
}

export function installerSites(deps: DepsSites): void {
  const service = creerServiceSites<WebContents>({
    reglages: deps.reglages,
    estPrivee: deps.estPrivee,
    estInterne: (wc) => estVueLyra(wc.getURL()),
    vues: () => webContents.getAllWebContents(),
    envoyer: (wc, regles) => envoyer(wc, 'sites:changed', regles)
  })
  handle('sites:lister', () => service.lister())
  handle('sites:ecrire', (d, e) => service.ecrire(d as { cle: string; regle: Record<string, unknown> }, e.sender))
  handle('sites:supprimer', (cle, e) => service.supprimer(cle, e.sender))
}

/**
 * Règles par site passant par `webRequest` (cookies, scripts, user-agent) : à brancher sur chaque session par `equiper`.
 * `onChanged` des règles : cookies et service workers des sites devenus « Bloqués » nettoyés à l'écriture de la règle.
 */
export function installerReglesSites(deps: { reglages: Reglages; estPage(wc: WebContents): boolean }) {
  const sites = (): Record<string, RegleSite> => deps.reglages.getSettings().sites
  // Synchrone : le preload des pages attend la réponse avant le premier script de la frame. Ce canal n'est pas sous `sites:*` (réservé
  // aux vues internes, refusé aux pages) : il est ouvert aux preloads des pages web, comme `shields:scriptlets`, d'où la garde `estPage`
  // (l'expéditeur est un onglet de Lyra) et l'absence de toute donnée fournie par la page : la page principale est celle de l'expéditeur
  // (`getURL`), la frame est celle qui envoie (`senderFrame`, origine héritée comprise pour about:blank / srcdoc / blob:).
  ipcMain.on('page:regles-site', (e) => {
    try {
      const f = e.senderFrame
      if (!f || !deps.estPage(e.sender)) {
        e.returnValue = AUCUNE_REGLE_PAGE
        return
      }
      // Une fenced frame n'a pas de parent mais n'est pas la frame principale de l'onglet : ni scripts perso, ni page « haute » à elle.
      const principale = !f.parent && f === e.sender.mainFrame
      e.returnValue = reglesDePage(sites(), principale ? f.url : e.sender.getURL(), urlDeFrame(f.url, f.origin), undefined, {
        globaux: deps.reglages.getSettings().styles,
        principale
      })
    } catch (err) {
      console.warn('[sites] règles de la frame :', err)
      e.returnValue = AUCUNE_REGLE_PAGE
    }
  })
  const regles = creerReglesSites({ sites })
  let precedent = sites()
  deps.reglages.onChanged((s) => {
    if (s.sites === precedent) return
    const avant = precedent
    precedent = s.sites
    void regles.surSitesChanges(avant, s.sites).catch((err) => console.error('[sites] nettoyage à l’écriture de la règle', err))
  })
  return regles
}

/** Règles de zoom : à chaque écriture de `sites`, les étoiles ouvertes des sites concernés prennent leur nouveau zoom (sans recharger). */
export function installerZoomSites(deps: { reglages: Reglages; onglets(): Iterable<{ zoomsChanges(avant: Record<string, RegleSite>, apres: Record<string, RegleSite>): void }> }): void {
  let precedent = deps.reglages.getSettings().sites
  deps.reglages.onChanged((s) => {
    if (s.sites === precedent) return
    const avant = precedent
    precedent = s.sites
    for (const tm of deps.onglets()) tm.zoomsChanges(avant, s.sites)
  })
}
