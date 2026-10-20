/** Câblage IPC de la palette côté main (dépend d'Electron). */
import type { WebContents } from 'electron'
import { handle } from '../ipc'
import { enTest } from '../modeTest'
import type { TabManager } from '../tabs/TabManager'
import type { HistoryEntry, Settings, Suggestion } from '../../shared/types'
import { moteurParId, moteursDisponibles, urlDeRecherche } from './engines'
import type { History } from '../history/History'
import type { Bookmarks } from '../bookmarks/Bookmarks'
import { suggestionsDuProfilAutorisees } from './prive'
import { interpreterSaisie, suggerer, trouverCommande } from './suggest'

export interface DepsPalette {
  ongletsDe(wc: WebContents): TabManager
  reglages(): Settings
  historique: History
  favoris: Bookmarks
  creerFenetre(opts: { privee?: boolean }): void
  /** La fenêtre de cet onglet est privée (la palette n'y propose pas l'historique ni les favoris, sauf réglage). */
  privee?(tabs: TabManager): boolean
  /** Déplace le ciel (démasqué) à la position donnée. */
  deplacerCiel(position: 'gauche' | 'droite' | 'haut' | 'bas'): void
  /** Ne pas déranger est actif dans la fenêtre de cet onglet. */
  dndActif(tabs: TabManager): boolean
  /** Entre dans Ne pas déranger (durée) ou en sort. */
  dnd(tabs: TabManager, action: 30 | 60 | 'arret' | 'sortir'): void
}

/** Favoris puis historique correspondant à la saisie (les favoris sont marqués pour la palette). */
function historiquePalette(deps: DepsPalette, texte: string): HistoryEntry[] {
  const t = texte.trim()
  if (!t || /^[>?#]/.test(t)) return []
  const favoris: HistoryEntry[] = deps.favoris.rechercher(t).map((f) => ({ url: f.url, title: f.title, favori: true }))
  const vus = new Set(favoris.map((f) => f.url))
  const histo = deps.historique.rechercher(t, 8).filter((h) => !vus.has(h.url))
  return [...favoris, ...histo]
}

let derniereNavigation: string | null = null

export function installerPalette(deps: DepsPalette): void {
  const commande = (id: string, tabs: TabManager): void => {
    if (id === 'nouvelle-etoile') tabs.ouvrir('lyra://newtab')
    else if (id === 'fenetre-privee') deps.creerFenetre({ privee: true })
    else if (id === 'reglages') tabs.ouvrir('lyra://settings')
    else if (id === 'dnd-30') deps.dnd(tabs, 30)
    else if (id === 'dnd-60') deps.dnd(tabs, 60)
    else if (id === 'dnd-arret') deps.dnd(tabs, 'arret')
    else if (id === 'dnd-sortir') deps.dnd(tabs, 'sortir')
    else if (id === 'ciel-gauche' || id === 'ciel-droite' || id === 'ciel-haut' || id === 'ciel-bas') deps.deplacerCiel(id.slice(5) as 'gauche' | 'droite' | 'haut' | 'bas')
  }

  handle('palette:open', (_d, e) => deps.ongletsDe(e.sender).ouvrirPalette())
  handle('palette:close', (_d, e) => deps.ongletsDe(e.sender).fermerOverlay())
  handle('palette:suggest', ({ texte }, e) => {
    const tabs = deps.ongletsDe(e.sender)
    const { sky } = tabs.snapshot()
    return suggerer(texte, {
      etoiles: sky.stars,
      activeId: sky.activeId ?? undefined,
      constellations: sky.constellations,
      historique: suggestionsDuProfilAutorisees(deps.privee?.(tabs) === true, deps.reglages().palette) ? historiquePalette(deps, texte) : [],
      moteurParDefaut: deps.reglages().moteurParDefaut,
      moteurs: moteursDisponibles(deps.reglages()),
      // Démasqué seulement : masqué, « à gauche » est une vraie commande (elle réaffiche le ciel).
      positionCiel: deps.reglages().ciel.masque ? undefined : deps.reglages().ciel.position,
      dnd: deps.dndActif(tabs)
    })
  })
  handle('palette:go', ({ suggestion, texte, nouvelleEtoile }, e) => {
    const tabs = deps.ongletsDe(e.sender)
    tabs.fermerOverlay()
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
    const moteurs = moteursDisponibles(deps.reglages())
    const saisie = interpreterSaisie(texte, deps.reglages().moteurParDefaut, moteurs)
    if (saisie.type === 'url') aller(saisie.url)
    else if (saisie.type === 'recherche') {
      if (saisie.requete) aller(urlDeRecherche(moteurParId(saisie.moteur, moteurs), saisie.requete))
    } else {
      const c = trouverCommande(saisie.nom)
      if (c) commande(c.id, tabs)
    }
  })
  if (enTest()) handle('test:lastNavigation', () => derniereNavigation)
}
