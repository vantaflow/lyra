import { app, BaseWindow, webContents, type WebContents, protocol, session } from 'electron'
import { WindowManager } from './window/WindowManager'
import type { Settings } from '../shared/types'
import { join } from 'node:path'
import * as paths from './paths'
import { definirFournisseurLangue } from '../shared/i18n'
import { handle, envoyer } from './ipc'
import { creerReglages } from './settings/settings'
import { installerProtocoleLyra } from './protocol/lyra'
import { TabManager } from './tabs/TabManager'
import { installerMenu } from './tabs/appMenu'
import { installerPalette } from './palette/actions'
import { demarrerBoucliers } from './shields/installer'
import { History } from './history/History'
import { Bookmarks } from './bookmarks/Bookmarks'
import { Downloads } from './downloads/Downloads'
import { SessionStore, type FenetreSession } from './session/SessionStore'

definirFournisseurLangue(() => app.getLocale())
app.setPath('userData', paths.userData())

protocol.registerSchemesAsPrivileged([
  { scheme: 'lyra', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
])

let reglagesCourants: () => Settings = () => {
  throw new Error('réglages non initialisés')
}
const manager = new WindowManager(() => reglagesCourants().ciel)
const onglets = new Map<number, TabManager>()
let historique: History | undefined
let sessionStore: SessionStore | undefined
const privees = new Set<number>()

/** Fenêtres normales : une fenêtre privée ne laisse aucune trace dans la session. */
function etatSession(): { version: 1; fenetres: FenetreSession[] } | null {
  const fenetres = [...onglets].filter(([id]) => !privees.has(id)).map(([, m]) => m.exporter())
  return fenetres.length > 0 ? { version: 1, fenetres } : null
}

let enFermeture = false

function sauverSession(): void {
  if (enFermeture) return
  const etat = etatSession()
  if (etat) sessionStore?.sauvegarder(etat)
}

function ongletsCourants(): TabManager | undefined {
  const focus = BaseWindow.getFocusedWindow()?.id
  const premiere = manager.premiere()?.id
  return (focus !== undefined ? onglets.get(focus) : undefined) ?? (premiere !== undefined ? onglets.get(premiere) : undefined)
}

function ongletsDe(wc: WebContents): TabManager {
  const f = manager.deWebContents(wc) ?? manager.premiere()
  const m = f && onglets.get(f.id)
  if (!m) throw new Error('aucune fenêtre')
  return m
}

function creerFenetre(opts: { privee?: boolean } = {}, restauration?: FenetreSession): void {
  const fenetre = manager.creerFenetre(opts)
  // Une fenêtre privée n'alimente jamais l'historique.
  const h = historique
  const tabs = new TabManager(
    fenetre,
    opts.privee || !h
      ? undefined
      : {
          visite: (url, title, date) => h.ajouter({ url, title, date }),
          titre: (url, title) => h.majTitre(url, title)
        },
    {
      endormirApresMin: () => reglagesCourants().ciel.endormirApresMin,
      surChangement: sauverSession
    }
  )
  onglets.set(fenetre.id, tabs)
  if (opts.privee) privees.add(fenetre.id)
  fenetre.win.on('closed', () => {
    onglets.delete(fenetre.id)
    privees.delete(fenetre.id)
    sauverSession()
  })
  if (restauration) tabs.restaurer(restauration)
  else tabs.ouvrir('lyra://newtab')
}

app.on('session-created', installerProtocoleLyra)

void app.whenReady().then(async () => {
  installerProtocoleLyra(session.defaultSession)
  const reglages = creerReglages(join(paths.userData(), 'settings.json'), app.getPath('downloads'))
  reglagesCourants = () => reglages.getSettings()
  // file:// n'est enregistré que sous LYRA_TEST=1 : les e2e naviguent sur une fixture locale.
  historique = new History(join(paths.userData(), 'historique.jsonl'), { enregistrerFichiers: process.env.LYRA_TEST === '1' })
  const hist = historique
  const favoris = new Bookmarks(join(paths.userData(), 'favoris.json'))
  favoris.onChange(() => {
    for (const m of onglets.values()) m.envoyerAuChrome('bookmarks:changed', undefined)
  })
  handle('history:search', ({ texte, limite }) => hist.rechercher(texte, limite))
  handle('history:delete', ({ url }) => hist.supprimer(url))
  handle('history:clear', () => hist.effacer())
  handle('history:frequent', ({ n }) => hist.frequents(n))
  handle('bookmarks:toggle', (f) => favoris.toggle(f))
  handle('bookmarks:exists', ({ url }) => favoris.existe(url))
  handle('bookmarks:list', () => favoris.lister())
  handle('bookmarks:remove', ({ url }) => favoris.retirer(url))
  const telechargements = new Downloads({
    fichier: join(paths.userData(), 'telechargements.json'),
    reglages: () => reglages.getSettings().telechargements,
    surChangement: () => {
      // Chrome, overlay et pages internes (lyra://) ; jamais les pages web.
      for (const wc of webContents.getAllWebContents()) {
        const url = wc.getURL()
        if (url.startsWith('lyra://') || url.includes('ui.html')) envoyer(wc, 'downloads:changed', undefined)
      }
    }
  })
  telechargements.attacher(session.defaultSession)
  telechargements.attacher(session.fromPartition('persist:lyra'))
  handle('downloads:list', () => telechargements.liste())
  handle('downloads:pause', ({ id }) => telechargements.pause(id))
  handle('downloads:resume', ({ id }) => telechargements.reprendre(id))
  handle('downloads:cancel', ({ id }) => telechargements.annuler(id))
  handle('downloads:open', ({ id }) => telechargements.ouvrir(id))
  handle('downloads:reveal', ({ id }) => telechargements.afficherDansDossier(id))
  handle('downloads:clear', () => telechargements.effacerListe())
  handle('downloads:panel', (_d, e) => ongletsDe(e.sender).ouvrirOverlay('downloads'))
  handle('layout:get', (_d, event) => {
    const f = manager.deWebContents(event.sender) ?? manager.premiere()
    if (!f) throw new Error('aucune fenêtre')
    return { ciel: reglages.getSettings().ciel, bounds: f.bounds() }
  })
  handle('settings:get', () => reglages.getSettings())
  handle('settings:set', (patch) => reglages.setSettings(patch))
  if (process.env.LYRA_TEST === '1') {
    handle('test:navigate', async (url) => {
      const m = ongletsCourants()
      const id = m?.idActif()
      if (m && id) await m.naviguerEtAttendre(id, url)
    })
    handle('test:endormir', (id) => ongletsCourants()?.endormir(id) ?? false)
  }
  handle('tabs:open', (d, e) => ongletsDe(e.sender).ouvrir(d.url, { parentId: d.parentId, actif: d.actif }))
  handle('tabs:close', (d, e) => ongletsDe(e.sender).fermer(d.id))
  handle('tabs:activate', (d, e) => ongletsDe(e.sender).activer(d.id))
  handle('tabs:navigate', (d, e) => ongletsDe(e.sender).naviguer(d.id, d.url))
  handle('tabs:back', (d, e) => ongletsDe(e.sender).precedent(d.id))
  handle('tabs:forward', (d, e) => ongletsDe(e.sender).suivant(d.id))
  handle('tabs:reload', (d, e) => ongletsDe(e.sender).recharger(d.id))
  handle('tabs:stop', (d, e) => ongletsDe(e.sender).arreter(d.id))
  handle('tabs:move', (d, e) => ongletsDe(e.sender).deplacer(d.id, { parentId: d.parentId, index: d.index }))
  handle('tabs:pin', (d, e) => ongletsDe(e.sender).epingler(d.id, d.pinned))
  handle('tabs:reopen', (_d, e) => ongletsDe(e.sender).rouvrirDerniere())
  handle('sky:get', (_d, e) => ongletsDe(e.sender).snapshot())
  installerPalette({ ongletsDe, historique: hist, favoris, reglages: () => reglages.getSettings(), creerFenetre })
  installerMenu(ongletsCourants)
  // Les Boucliers sont prêts avant la première fenêtre : aucune page ne se charge sans eux.
  await demarrerBoucliers({
    reglages,
    sessions: [session.defaultSession, session.fromPartition('persist:lyra')],
    cacheDir: join(paths.userData(), 'shields'),
    onglets: () => onglets.values(),
    ongletsDe
  })
  // Laisse les écritures de l'historique se terminer avant de quitter (une seule fois).
  let ecrituresAttendues = false
  app.on('before-quit', (e) => {
    if (ecrituresAttendues) return
    ecrituresAttendues = true
    e.preventDefault()
    // Avant que les fenêtres ne se ferment : l'état courant est écrit tout de suite.
    sauverSession()
    sessionStore?.vider()
    enFermeture = true
    void hist.attendre().finally(() => app.quit())
  })
  reglages.onChanged((s) => {
    manager.relayoutAll()
    for (const wc of webContents.getAllWebContents()) envoyer(wc, 'settings:changed', s)
  })
  sessionStore = new SessionStore(join(paths.userData(), 'session.json'))
  const restauree = sessionStore.charger()
  if (restauree) for (const f of restauree.fenetres) creerFenetre({}, f)
  else creerFenetre()
  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) creerFenetre()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
