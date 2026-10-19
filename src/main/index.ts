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
import { installerReglagesIpc } from './settings/ipc'
import { SessionStore, type FenetreSession } from './session/SessionStore'
import { Permissions, type ReponsePermission } from './permissions/Permissions'
import { Attentes, REFUS } from './permissions/attentes'
import { nettoyerUserAgent } from './ua'
import { continuerAutorise, estUrlErreur, exceptionsCertificat, hoteDe, urlOriginale } from './tabs/erreurs'
import { moteurParId, urlDeRecherche } from './palette/engines'
import type { ActionMenu, AncreMenu } from '../shared/ipc'
import type { Reglages } from './settings/settings'
import type { TypePermission } from '../shared/types'
import type { Passerelles } from './passerelles/Passerelles'
import { creerPasserelles } from './passerelles/electron'
import { installerPasserellesIpc } from './passerelles/ipc'
import { hoteValide } from './passerelles/liste'

definirFournisseurLangue(() => app.getLocale())
app.setPath('userData', paths.userData())

protocol.registerSchemesAsPrivileged([
  { scheme: 'lyra', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
])

let reglagesCourants: () => Settings = () => {
  throw new Error('réglages non initialisés')
}
let reglagesStore: Reglages | undefined
const manager = new WindowManager(() => reglagesCourants().ciel)
const onglets = new Map<number, TabManager>()
let historique: History | undefined
let sessionStore: SessionStore | undefined
let passerelles: Passerelles | undefined
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
      surChangement: sauverSession,
      zoomDe: (origine) => reglagesCourants().sites[origine]?.zoom,
      memoriserZoom: (origine, zoom) => void reglagesStore?.setSettings({ sites: { [origine]: { zoom } } }),
      rechercheUrl: (texte) => urlDeRecherche(moteurParId(reglagesCourants().moteurParDefaut), texte),
      // Fenêtre privée : pas de détection automatique (rien n'est écrit dans les réglages).
      passerelles: passerelles?.crochets({ detection: !opts.privee })
    }
  )
  // Une demande de permission ne survit pas à un changement de route ou à la fermeture de l'overlay.
  tabs.surOverlay((route) => route !== 'permission' && attentes.abandonnerFenetre(fenetre.id))
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

app.on('certificate-error', (e, _wc, url, _erreur, _certificat, callback) => {
  // Exception accordée pour la session depuis la page d'erreur (« Continuer quand même ») ;
  // jamais pour un site contourné (une passerelle pourrait intercepter le TLS).
  if (passerelles?.contourne(url) ?? false) return
  if (exceptionsCertificat.has(hoteDe(url))) {
    e.preventDefault()
    callback(true)
  }
})

const attentes = new Attentes()

/** Montre la demande dans l'overlay de la fenêtre qui possède la page ; refus si elle n'en a pas. */
async function demanderPermission(wc: WebContents, origine: string, types: TypePermission[]): Promise<ReponsePermission> {
  const m = ongletsPossedant(wc)
  if (!m) return REFUS
  const { id, promesse } = attentes.ouvrir(m.fenetreId, m.overlayId)
  // Page partie ou détruite : la demande tombe, et l'overlay se referme s'il l'affichait encore.
  const abandon = (): void => {
    if (!attentes.abandonner(id)) return
    try {
      m.fermerOverlay()
    } catch {
      // fenêtre en cours de fermeture
    }
  }
  wc.once('destroyed', abandon)
  wc.once('did-navigate', abandon)
  m.demanderPermission({ id, origine, types })
  try {
    return await promesse
  } finally {
    wc.removeListener('destroyed', abandon)
    wc.removeListener('did-navigate', abandon)
  }
}

/** Type d'une page lyra://erreur (paramètre `type`). */
function typeErreurPage(url: string): string | null {
  try {
    return new URL(url).searchParams.get('type')
  } catch {
    return null
  }
}

function ongletsPossedant(wc: WebContents): TabManager | undefined {
  return [...onglets.values()].find((m) => m.possede(wc))
}

/** Hôte lisible de l'adresse d'une page (pour « Règles pour … ») ; '' hors http(s). */
function hoteLisible(url: string): string {
  try {
    const u = new URL(urlOriginale(url))
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

void app.whenReady().then(async () => {
  const ua = nettoyerUserAgent(app.userAgentFallback)
  app.userAgentFallback = ua
  session.defaultSession.setUserAgent(ua)
  session.fromPartition('persist:lyra').setUserAgent(ua)
  installerProtocoleLyra(session.defaultSession)
  const reglages = creerReglages(join(paths.userData(), 'settings.json'), app.getPath('downloads'))
  reglagesCourants = () => reglages.getSettings()
  reglagesStore = reglages
  const permissions = new Permissions({
    lire: (origine, type) => reglages.getSettings().sites[origine]?.permissions?.[type],
    memoriser: (origine, type, decision) => void reglages.setSettings({ sites: { [origine]: { permissions: { [type]: decision } } } }),
    demander: demanderPermission
  })
  permissions.attacher(session.defaultSession)
  permissions.attacher(session.fromPartition('persist:lyra'))
  handle('permission:answer', (d, e) => {
    // Seul l'overlay de la fenêtre qui a posé la demande peut y répondre.
    const reponse = { decision: d.decision === 'autoriser' ? ('autoriser' as const) : ('refuser' as const), memoriser: d.memoriser === true }
    if (attentes.repondre(d.id, e.sender.id, reponse)) ongletsDe(e.sender).fermerOverlay()
  })
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
  installerReglagesIpc(reglages)
  // Passerelles : rien n'est chargé ni appliqué tant qu'aucun site n'est contourné.
  const sessionsProxy = [session.defaultSession, session.fromPartition('persist:lyra')]
  const pass = creerPasserelles({
    reglages,
    cacheFichier: join(paths.userData(), 'passerelles.json'),
    sessions: () => sessionsProxy,
    surChangement: (etat) => {
      for (const wc of webContents.getAllWebContents()) {
        const url = wc.getURL()
        if (url.startsWith('lyra://') || url.includes('ui.html')) envoyer(wc, 'passerelles:changed', etat)
      }
      for (const m of onglets.values()) m.actualiser()
    }
  })
  passerelles = pass
  installerPasserellesIpc(pass)
  // Le PAC initial est en place avant toute fenêtre (une étoile restaurée ne part pas en direct).
  await pass.demarrer()
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
  handle('tabs:zoom', (d, e) => ongletsDe(e.sender).zoomer(d.id, { delta: d.delta === 1 || d.delta === -1 ? d.delta : undefined, reset: d.reset === true }))
  handle('find:start', (d, e) => ongletsDe(e.sender).rechercher(d.id, String(d.texte ?? '').slice(0, 500), { suivant: d.suivant === true, precedent: d.precedent === true }))
  handle('find:stop', (d, e) => ongletsDe(e.sender).arreterRecherche(d.id))
  // Page d'erreur Lyra : l'adresse vient de la page elle-même (son URL), jamais des données reçues.
  const pageErreur = (wc: WebContents): { m: TabManager; id: string; url: string } | undefined => {
    const m = ongletsPossedant(wc)
    const id = m?.idDe(wc)
    const url = urlOriginale(wc.getURL())
    return m && id && estUrlErreur(wc.getURL()) && /^(https?|file):/i.test(url) ? { m, id, url } : undefined
  }
  handle('erreur:reessayer', (_d, e) => {
    const p = pageErreur(e.sender)
    if (!p) return
    // « Aucune passerelle ne répond » : nouvelle recherche ; l'échec suivant l'attendra avant de décider.
    if (typeErreurPage(e.sender.getURL()) === 'passerelles') void pass.rechercher(true)
    p.m.naviguer(p.id, p.url)
  })
  handle('erreur:continuer', (_d, e) => {
    const p = pageErreur(e.sender)
    const url = continuerAutorise(e.sender.getURL())
    if (!p || !url || pass.contourne(url)) return
    exceptionsCertificat.add(hoteDe(url))
    p.m.naviguer(p.id, url)
  })
  handle('erreur:passerelle', (_d, e) => {
    // Même garde que « continuer » : l'adresse vient de la page d'erreur expéditrice, jamais des données.
    const p = pageErreur(e.sender)
    if (!p || !/^https:/i.test(p.url) || !reglages.getSettings().reseau.passerelles) return
    const hote = new URL(p.url).hostname
    if (!hoteValide(hote)) return
    pass.ajouter(hote)
    p.m.naviguer(p.id, p.url)
  })
  handle('menu:open', (d, e) => {
    const f = manager.deWebContents(e.sender) ?? manager.premiere()
    if (!f || !Number.isFinite(d.droite) || !Number.isFinite(d.bas)) return
    const m = ongletsDe(e.sender)
    const wc = m.wcActif()
    const url = wc?.getURL() ?? ''
    const c = f.bounds().chrome
    m.ouvrirOverlay('menu')
    const ancre: AncreMenu = {
      droite: c.x + d.droite,
      bas: c.y + d.bas,
      hote: hoteLisible(url),
      favori: favoris.existe(urlOriginale(url)),
      zoom: wc?.getZoomFactor() ?? 1
    }
    m.ancrerMenu(ancre)
  })
  const ACTIONS: ActionMenu[] = ['nouvelle-etoile', 'nouvelle-fenetre', 'favori', 'recherche', 'imprimer', 'devtools', 'historique', 'reglages']
  handle('menu:action', ({ action }, e) => {
    if (!ACTIONS.includes(action)) return
    const m = ongletsDe(e.sender)
    m.fermerOverlay()
    if (action === 'nouvelle-etoile') m.ouvrir('lyra://newtab')
    else if (action === 'nouvelle-fenetre') creerFenetre()
    else if (action === 'favori') basculerFavori(m)
    else if (action === 'recherche') m.ouvrirRecherche()
    else if (action === 'imprimer') m.imprimer()
    else if (action === 'devtools') m.outilsDeveloppement()
    else if (action === 'historique') m.ouvrir('lyra://history')
    else m.ouvrir('lyra://settings')
  })
  installerPalette({ ongletsDe, historique: hist, favoris, reglages: () => reglages.getSettings(), creerFenetre })
  const basculerFavori = (m: TabManager): void => {
    const wc = m.wcActif()
    const url = wc ? urlOriginale(wc.getURL()) : ''
    if (/^(https?|file):/i.test(url) && wc) favoris.toggle({ url, title: wc.getTitle() || url })
  }
  installerMenu(ongletsCourants, { nouvelleFenetre: () => creerFenetre(), basculerFavori })
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
