/**
 * Démarrage des Boucliers : moteur (cache ou listes embarquées), sessions, IPC des pages et de
 * l'interface, mise à jour périodique des listes. Les handlers IPC sont enregistrés une seule fois.
 */
import { app, ipcMain, type IpcMainEvent, type Session, type WebContents } from 'electron'
import { join } from 'node:path'
import type { Settings } from '../../shared/types'
import type { EtatBoucliers, StatsBoucliers } from '../../shared/ipc'
import { handle } from '../ipc'
import { enTest } from '../modeTest'
import type { Reglages } from '../settings/settings'
import type { TabManager } from '../tabs/TabManager'
import { construireMoteur, mettreAJour, type OptionsMoteur, type ResultatMoteur } from './engine'
import { chargerListesEmbarquees, dossierListesEmbarquees } from './listes'
import { creerMajGardee } from './majGardee'
import { creerShields, origineDe, type Shields } from './Shields'

export interface DepsBoucliers {
  reglages: Reglages
  sessions: Session[]
  cacheDir: string
  onglets(): Iterable<TabManager>
  /** Fenêtre privée : aucune règle par site n'y est écrite. */
  privee?: (tm: TabManager) => boolean
  ongletsDe(wc: WebContents): TabManager
  /** Annule une requête avant le moteur de blocage (ex. http vers un site contourné). */
  garde?: (d: { url: string; resourceType?: string }) => boolean
}

const DELAI_PREMIERE_MAJ = 30_000
const DEBOUNCE_COMPTEUR = 200
const URL_MAX = 8192

const estUrl = (v: unknown): v is string => typeof v === 'string' && v.length <= URL_MAX
const listeDeTextes = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.length <= 10_000 && v.every((x) => typeof x === 'string' && x.length <= 2048) ? v : undefined

/** Nom du scriptlet uBO contenu dans un script (pour les journaux d'erreur). */
export function nomScriptlet(code: string): string {
  const noms = [...code.matchAll(/\(function\s+([\w$]+)\s*\(/g)].map((m) => m[1])
  return noms.at(-1) ?? 'inconnu'
}

export async function demarrerBoucliers(deps: DepsBoucliers): Promise<Shields> {
  const dossier = app.isPackaged ? dossierListesEmbarquees() : join(app.getAppPath(), 'resources/shields')
  const listes = await chargerListesEmbarquees(dossier)
  let majHeures = deps.reglages.getSettings().boucliers.majHeures
  const options: OptionsMoteur = { cacheDir: deps.cacheDir, listesEmbarquees: listes, listesDistantes: listes.urls ?? [], majHeures }
  // Moteur des gênes : construit à la première activation de l'option (cache ou listes embarquées), jamais avant.
  const optionsGenes: OptionsMoteur | undefined = listes.genes
    ? { cacheDir: deps.cacheDir, listesEmbarquees: { textes: listes.genes.textes, resources: listes.resources, date: listes.date }, listesDistantes: listes.genes.urls, majHeures, nomCache: 'engine-genes' }
    : undefined
  let genes: ResultatMoteur | undefined
  let genesEnCours: Promise<void> | undefined
  // Pas de réseau au démarrage : cache (même périmé) ou listes embarquées, en moins d'une seconde.
  let actuel: ResultatMoteur = await construireMoteur(options)

  const minuteurs = new Map<number, NodeJS.Timeout>()
  const shields = creerShields({
    moteurInitial: actuel.moteur,
    reglages: () => deps.reglages.getSettings(),
    garde: deps.garde,
    onCompteur: (wcId) => {
      if (minuteurs.has(wcId)) return
      minuteurs.set(
        wcId,
        setTimeout(() => {
          minuteurs.delete(wcId)
          for (const tm of deps.onglets()) if (tm.wcActif()?.id === wcId) tm.envoyerAuChrome('shields:changed', etat(tm))
        }, DEBOUNCE_COMPTEUR)
      )
    }
  })
  for (const ses of deps.sessions) shields.attacher(ses)

  const assurerGenes = (): Promise<void> => {
    if (genes || !optionsGenes || deps.reglages.getSettings().boucliers.genes !== true) return Promise.resolve()
    genesEnCours ??= construireMoteur(optionsGenes)
      .then((r) => {
        genes = r
        shields.remplacerMoteurGenes(r.moteur)
      })
      .catch((e: unknown) => console.warn('[boucliers] listes des gênes illisibles :', e))
      .finally(() => (genesEnCours = undefined))
    return genesEnCours
  }
  void assurerGenes()

  const etat = (tm: TabManager): EtatBoucliers => {
    const wc = tm.wcActif()
    const origine = origineDe(wc?.getURL() ?? '')
    return {
      actif: origine !== '' && shields.estActif(origine),
      bloques: wc ? shields.bloques(wc.id) : 0,
      origine,
      dernieres: wc ? shields.dernieres(wc.id) : [],
      privee: deps.privee?.(tm) === true
    }
  }

  // Compteur par page : remis à zéro à chaque navigation principale (y compris file://), oublié à la fermeture.
  app.on('web-contents-created', (_e, wc) => {
    wc.on('did-start-navigation', (d) => {
      if (d.isMainFrame && !d.isSameDocument) shields.reinitialiser(wc.id)
    })
    const id = wc.id
    wc.once('destroyed', () => shields.reinitialiser(id))
  })

  // --- IPC des pages web (expéditeur = un site) : on vérifie que c'est bien une de nos pages. ---
  const estPage = (wc: WebContents): boolean => {
    for (const tm of deps.onglets()) if (tm.possede(wc)) return true
    return false
  }
  const urlHaut = (e: IpcMainEvent, url: string): string => (e.senderFrame?.parent ? e.sender.getURL() : url)

  // Synchrone : le preload attend la réponse avant que le premier script de la page ne s'exécute.
  ipcMain.on('shields:scriptlets', (e, url: unknown) => {
    try {
      e.returnValue = estPage(e.sender) && estUrl(url) ? shields.scriptlets(url, urlHaut(e, url)) : []
    } catch (err) {
      console.warn('[boucliers] scriptlets :', err)
      e.returnValue = []
    }
  })
  ipcMain.on('shields:scriptlet-error', (e, nom: unknown) => {
    if (estPage(e.sender) && typeof nom === 'string') console.warn('[boucliers] scriptlet en échec :', nom.slice(0, 100), e.sender.getURL())
  })
  // Les styles sont renvoyés à la frame, qui les insère elle-même (webFrame.insertCSS, origine « user ») :
  // WebContents.insertCSS ne vise que la frame principale, et le preload tourne aussi dans les iframes.
  ipcMain.handle('shields:styles', (e, msg: unknown) => {
    if (!estPage(e.sender) || typeof msg !== 'object' || msg === null) return ''
    const m = msg as Record<string, unknown>
    if (!estUrl(m.url)) return ''
    const lifecycle = m.lifecycle === 'dom-update' ? 'dom-update' : 'start'
    return shields.styles({
      url: m.url,
      urlPremierNiveau: e.senderFrame?.parent ? e.sender.getURL() : m.url,
      classes: listeDeTextes(m.classes),
      ids: listeDeTextes(m.ids),
      hrefs: listeDeTextes(m.hrefs),
      lifecycle
    })
  })

  // --- IPC de l'interface (expéditeur vérifié par handle). ---
  handle('shields:get', (_d, e) => etat(deps.ongletsDe(e.sender)))
  const stats = (): StatsBoucliers => ({ semaine: shields.semaine(), date: actuel.date, source: actuel.source })
  handle('shields:stats', stats)
  handle('shields:open', (_d, e) => deps.ongletsDe(e.sender).ouvrirOverlay('shields'))
  handle('overlay:close', (_d, e) => deps.ongletsDe(e.sender).fermerOverlay())
  handle('shields:toggleSite', ({ origine, actif }, e) => {
    if (typeof origine !== 'string' || typeof actif !== 'boolean' || origine === '') return
    const tm = deps.ongletsDe(e.sender)
    // Fenêtre privée : aucune règle par site n'est écrite ; le panneau l'indique.
    if (deps.privee?.(tm)) return
    deps.reglages.setSettings({ sites: { [origine]: { boucliers: actif } } } as Partial<Settings>)
    const wc = tm.wcActif()
    // La page est rechargée pour appliquer le changement (réseau et scriptlets).
    if (wc && origineDe(wc.getURL()) === origine) wc.reload()
    tm.envoyerAuChrome('shields:changed', etat(tm))
  })

  // --- Mise à jour des listes : 30 s après le démarrage, puis toutes les majHeures (hors tests). ---
  /** Vrai si les listes ont été relues ; faux si le réseau a échoué (moteur conservé). */
  const maj = async (): Promise<boolean> => {
    const nouveau = await mettreAJour({ ...options, fetch }, actuel)
    const ok = nouveau !== actuel
    if (ok) {
      actuel = nouveau
      shields.remplacerMoteur(nouveau.moteur)
    }
    if (genes && optionsGenes) {
      const g = await mettreAJour({ ...optionsGenes, fetch }, genes)
      if (g !== genes) {
        genes = g
        shields.remplacerMoteurGenes(g.moteur)
      }
    }
    return ok
  }
  const majGardee = creerMajGardee(async (): Promise<StatsBoucliers | { echec: true; date: string }> => ((await maj()) ? stats() : { echec: true, date: actuel.date }), { delaiMs: 60_000 })
  handle('shields:update', () => majGardee())
  let minuterie: NodeJS.Timeout | undefined
  const planifier = (): void => {
    if (minuterie) clearInterval(minuterie)
    minuterie = setInterval(() => void maj(), majHeures * 3600_000)
    minuterie.unref()
  }
  if (!enTest()) {
    setTimeout(() => void maj(), DELAI_PREMIERE_MAJ).unref()
    planifier()
  }
  // Réglages appliqués à chaud : option des gênes (moteur construit à la demande) et fréquence de mise à jour.
  deps.reglages.onChanged((s) => {
    void assurerGenes()
    if (s.boucliers.majHeures !== majHeures) {
      majHeures = s.boucliers.majHeures
      options.majHeures = majHeures
      if (optionsGenes) optionsGenes.majHeures = majHeures
      if (!enTest()) planifier()
    }
  })
  return shields
}
