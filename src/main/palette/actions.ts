/** Câblage IPC de la palette côté main (dépend d'Electron). */
import type { WebContents } from 'electron'
import { handle } from '../ipc'
import type { TabManager } from '../tabs/TabManager'
import type { Settings, Suggestion } from '../../shared/types'
import { moteurParId, urlDeRecherche } from './engines'
import { interpreterSaisie, suggerer, trouverCommande } from './suggest'

export interface DepsPalette {
  ongletsDe(wc: WebContents): TabManager
  reglages(): Settings
  creerFenetre(opts: { privee?: boolean }): void
}

let derniereNavigation: string | null = null

export function installerPalette(deps: DepsPalette): void {
  const commande = (id: string, tabs: TabManager): void => {
    if (id === 'nouvelle-etoile') tabs.ouvrir('lyra://newtab')
    else if (id === 'fenetre-privee') deps.creerFenetre({ privee: true })
    else if (id === 'reglages') tabs.ouvrir('lyra://settings')
  }

  handle('palette:open', (_d, e) => deps.ongletsDe(e.sender).ouvrirPalette())
  handle('palette:close', (_d, e) => deps.ongletsDe(e.sender).fermerPalette())
  handle('palette:suggest', ({ texte }, e) => {
    const tabs = deps.ongletsDe(e.sender)
    const { sky } = tabs.snapshot()
    return suggerer(texte, {
      etoiles: sky.stars,
      activeId: sky.activeId ?? undefined,
      constellations: sky.constellations,
      historique: [], // le module Historique arrive en tâche 10
      moteurParDefaut: deps.reglages().moteurParDefaut
    })
  })
  handle('palette:go', ({ suggestion, texte, nouvelleEtoile }, e) => {
    const tabs = deps.ongletsDe(e.sender)
    tabs.fermerPalette()
    const aller = (url: string): void => {
      derniereNavigation = url
      tabs.allerA(url, nouvelleEtoile)
    }
    const s: Suggestion | undefined = suggestion
    if (s) {
      if (s.type === 'etoile' && s.id) tabs.activer(s.id)
      else if (s.type === 'commande' && s.id) commande(s.id, tabs)
      else if (s.url) aller(s.url)
      return
    }
    const saisie = interpreterSaisie(texte, deps.reglages().moteurParDefaut)
    if (saisie.type === 'url') aller(saisie.url)
    else if (saisie.type === 'recherche') {
      if (saisie.requete) aller(urlDeRecherche(moteurParId(saisie.moteur), saisie.requete))
    } else {
      const c = trouverCommande(saisie.nom)
      if (c) commande(c.id, tabs)
    }
  })
  if (process.env.LYRA_TEST === '1') handle('test:lastNavigation', () => derniereNavigation)
}
