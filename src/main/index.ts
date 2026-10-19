import { app, BaseWindow, dialog, ipcMain, Notification as NotificationSysteme, webContents, type WebContents, type WebFrameMain, protocol, session } from 'electron'
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
import { Dnd, type NotificationRetenue } from './dnd/Dnd'
import { origineDe } from './shields/Shields'
import type { DureeDnd } from '../shared/ipc'
import { creerExtensions, type Extensions } from './extensions/Extensions'
import { creerChargeur } from './extensions/chargeur'
import { creerRegistre } from './extensions/registre'
import { installerExtensionsIpc } from './extensions/ipc'
import { creerInstallateurChrome } from './extensions/chrome'
import { creerMiseAJour } from './extensions/miseAJour'
import { updateExtensions } from 'electron-chrome-web-store'
import { installerFixtures } from './extensions/fixturesTest'

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
/** Extensions (chrome.tabs) : absent tant que le démarrage n'a pas fini de les brancher. */
let extensionsLyra: Extensions | undefined
const privees = new Set<number>()

/** Cadres (iframes comprises) d'où viennent les notifications retenues : un clic y est rejoué. */
const cadresNotifications = new Map<number, WebFrameMain>()
/** Notifications système affichées (références gardées : sinon le ramasse-miettes les retire). */
const notificationsAffichees = new Set<InstanceType<typeof NotificationSysteme>>()
/** Test uniquement (LYRA_TEST=1) : ce qui aurait été affiché à la sortie du mode (aucune notification système en test). */
const livraisonsTest: Array<{ titre: string; corps?: string; origine: string; etoileId?: string }> = []

/** Clic sur une notification livrée : la fenêtre et l'étoile d'origine (si elles existent encore) passent devant. */
function focaliserNotification(fenetre: number, n: NotificationRetenue): void {
  const f = manager.fenetre(fenetre)
  const m = onglets.get(fenetre)
  if (f && m) {
    if (f.win.isMinimized()) f.win.restore()
    f.win.show()
    f.win.focus()
    m.focaliserEtoile(n.etoileId)
  }
  try {
    cadresNotifications.get(n.id)?.send('dnd:clic', n.id)
  } catch {
    // page partie : rien à rejouer
  }
}

/**
 * Livraison à la sortie du mode : vraies notifications système (Electron), émises par le main. Une notification rejouée
 * dans la page serait perdue si la page a navigué, a été fermée ou endormie entre-temps (un mode « jusqu'à l'arrêt »
 * dure des heures) ; la livraison par le main y résiste, et le clic retrouve l'étoile d'origine.
 */
function livrerNotifications(fenetre: number, notifications: NotificationRetenue[]): void {
  if (process.env.LYRA_TEST === '1') {
    for (const n of notifications) livraisonsTest.push({ titre: n.titre, corps: n.corps, origine: n.origine, etoileId: n.etoileId })
    return
  }
  if (!NotificationSysteme.isSupported()) return
  for (const n of notifications) {
    const notif = new NotificationSysteme({ title: n.titre, body: n.corps ?? '', silent: n.silencieuse === true, subtitle: n.origine.replace(/^https?:\/\//, '') })
    notificationsAffichees.add(notif)
    const fin = (): void => void notificationsAffichees.delete(notif)
    notif.on('click', () => {
      focaliserNotification(fenetre, n)
      fin()
    })
    notif.on('close', fin)
    notif.show()
  }
}

const dnd = new Dnd({
  exception: (origine) => reglagesCourants().sites[origine]?.exceptionDnd === true,
  livrerNotifications,
  // Popups retenues : ouvertes en étoiles d'arrière-plan, reliées à leur opener s'il existe encore.
  ouvrirPopups: (fenetre, popups) => {
    for (const p of popups) onglets.get(fenetre)?.ouvrirRetenue(p.url, p.etoileId)
  },
  surChangement: (fenetre, etat) => {
    const f = manager.fenetre(fenetre)
    if (!f) return
    f.setDnd(etat.actif ? { rappel: etat.rappel } : null)
    envoyer(f.chrome.webContents, 'dnd:changed', etat)
  }
})

/** Entre dans Ne pas déranger : la page prend le focus (le ciel et la capsule disparaissent). */
function entrerDnd(fenetre: number, duree: DureeDnd | undefined): void {
  const m = onglets.get(fenetre)
  m?.fermerOverlay()
  dnd.entrer(fenetre, duree)
  m?.wcActif()?.focus()
}

function basculerDnd(fenetre: number, duree?: DureeDnd): void {
  if (dnd.actif(fenetre)) dnd.sortir(fenetre)
  else entrerDnd(fenetre, duree)
}

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

function creerFenetre(opts: { privee?: boolean } = {}, restauration?: FenetreSession): BaseWindow {
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
      // Fenêtre privée : ni détection automatique ni proposition d'ajout (rien n'est écrit dans les réglages).
      passerelles: passerelles?.crochets({ privee: opts.privee === true }),
      surEchap: () => dnd.sortir(fenetre.id),
      basculerDnd: () => basculerDnd(fenetre.id),
      retenirPopup: (p) => dnd.retenirPopup(fenetre.id, p),
      // Jamais d'extensions en fenêtre privée.
      extensions:
        opts.privee || !extensionsLyra
          ? undefined
          : {
              ajouter: (wc, win) => extensionsLyra?.addTab(wc, win),
              retirer: (wc) => extensionsLyra?.removeTab(wc),
              selectionner: (wc) => extensionsLyra?.selectTab(wc)
            }
    }
  )
  // Une demande de permission ne survit pas à un changement de route ou à la fermeture de l'overlay.
  tabs.surOverlay((route) => route !== 'permission' && attentes.abandonnerFenetre(fenetre.id))
  onglets.set(fenetre.id, tabs)
  if (opts.privee) privees.add(fenetre.id)
  fenetre.win.on('closed', () => {
    onglets.delete(fenetre.id)
    privees.delete(fenetre.id)
    dnd.fermer(fenetre.id)
    sauverSession()
  })
  if (restauration) tabs.restaurer(restauration)
  else tabs.ouvrir('lyra://newtab')
  return fenetre.win
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
    demander: demanderPermission,
    // Ne pas déranger : demande de notifications retenue jusqu'à la sortie ; notifications suspendues (service workers compris).
    retenir: (wc, origine) => {
      const m = ongletsPossedant(wc)
      return m && dnd.retient(m.fenetreId, origine) ? dnd.attendreSortie(m.fenetreId) : undefined
    },
    suspendues: (wc, origine) => {
      const m = wc ? ongletsPossedant(wc) : undefined
      if (m) return dnd.retient(m.fenetreId, origine)
      return !wc && dnd.actifQuelquePart() && reglages.getSettings().sites[origine]?.exceptionDnd !== true
    }
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
    return { ciel: reglages.getSettings().ciel, bounds: f.bounds(), revele: f.estRevele(), glisse: f.estEnGlisse(), ordre: f.ordreVues() }
  })
  handle('ciel:reveler', ({ actif }, event) => {
    // Seule la vue chrome (le ciel lui-même) pilote la révélation.
    const f = manager.deWebContents(event.sender)
    if (!f || f.chrome.webContents !== event.sender) return false
    return f.reveler(actif === true)
  })
  handle('ciel:glisse', ({ actif }, event) => {
    const f = manager.deWebContents(event.sender)
    if (f && f.chrome.webContents === event.sender) f.glisserCiel(actif === true)
  })
  handle('ciel:apercu', ({ largeur }, event) => {
    // Seule la vue chrome règle la largeur en direct ; une valeur invalide est ignorée.
    const f = manager.deWebContents(event.sender)
    if (!f || f.chrome.webContents !== event.sender) return
    if (largeur === null) manager.apercuLargeur(null)
    else if (typeof largeur === 'number' && Number.isFinite(largeur)) manager.apercuLargeur(largeur)
  })
  // Ne pas déranger : seule la vue chrome de la fenêtre pilote le mode.
  const fenetreChrome = (e: { sender: WebContents }): number | undefined => {
    const f = manager.deWebContents(e.sender)
    return f && f.chrome.webContents === e.sender ? f.id : undefined
  }
  handle('dnd:get', (_d, e) => dnd.etat((manager.deWebContents(e.sender) ?? manager.premiere())?.id ?? -1))
  handle('dnd:basculer', (d, e) => {
    const id = fenetreChrome(e)
    const duree = d && typeof d === 'object' && (d.duree === 30 || d.duree === 60 || d.duree === 'arret') ? d.duree : undefined
    if (id !== undefined) basculerDnd(id, duree)
  })
  handle('dnd:sortir', (_d, e) => {
    const id = fenetreChrome(e)
    if (id !== undefined) dnd.sortir(id)
  })
  handle('dnd:rappel', (_d, e) => {
    const id = fenetreChrome(e)
    if (id !== undefined) dnd.montrerRappel(id)
  })
  // Surcharge de window.Notification (preload page) : appels synchrones, l'origine vient du cadre expéditeur.
  const decisionNotifications = (origine: string): string | undefined => reglages.getSettings().sites[origine]?.permissions?.notifications
  const contexteNotification = (e: { sender: WebContents; senderFrame?: WebFrameMain | null }): { m: TabManager; origine: string } | undefined => {
    const m = ongletsPossedant(e.sender)
    const origine = origineDe(e.senderFrame?.url ?? '')
    return m && origine && dnd.retient(m.fenetreId, origine) ? { m, origine } : undefined
  }
  const court = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
  ipcMain.on('dnd:notification', (e, d: { titre?: unknown; corps?: unknown; tag?: unknown; silencieuse?: unknown } | null) => {
    // null : la notification suit son cours normal (mode inactif, site en exception, notifications non autorisées).
    // returnValue répond tout de suite à l'appel synchrone : il n'est fixé qu'une fois, à la fin.
    let id: number | null = null
    try {
      const c = contexteNotification(e)
      if (c && d && typeof d.titre === 'string' && decisionNotifications(c.origine) === 'autoriser') {
        id = dnd.retenirNotification(c.m.fenetreId, {
          origine: c.origine,
          titre: court(d.titre, 300),
          corps: court(d.corps, 1000),
          tag: court(d.tag, 200) || undefined,
          silencieuse: d.silencieuse === true,
          etoileId: c.m.idDe(e.sender)
        })
        if (id !== null && e.senderFrame) {
          cadresNotifications.set(id, e.senderFrame)
          // Les cadres des notifications jetées ou livrées ne s'accumulent pas.
          if (cadresNotifications.size > 500) cadresNotifications.delete(cadresNotifications.keys().next().value!)
        }
      }
    } finally {
      e.returnValue = id
    }
  })
  ipcMain.on('dnd:permission', (e) => {
    // Réponse unique, même en cas d'exception : sendSync ne doit jamais rester bloqué dans la page.
    let r: string | null = null
    try {
      const c = contexteNotification(e)
      const d = c ? decisionNotifications(c.origine) : undefined
      r = !c ? null : d === 'autoriser' ? 'granted' : d === 'refuser' ? 'denied' : 'default'
    } finally {
      e.returnValue = r
    }
  })
  ipcMain.on('dnd:fermer', (e, id: unknown) => {
    // Une page ne ferme que ses propres notifications : l'origine vient du cadre expéditeur.
    const m = ongletsPossedant(e.sender)
    const origine = origineDe(e.senderFrame?.url ?? '')
    if (m && origine && typeof id === 'number' && dnd.retirerNotification(m.fenetreId, id, origine)) cadresNotifications.delete(id)
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
  // Extensions : branchées et chargées avant la création de la moindre vue (donc de la première fenêtre).
  const baseExtensions = join(paths.userData(), 'extensions')
  const sessionLyra = session.fromPartition('persist:lyra')
  extensionsLyra = creerExtensions({
    session: sessionLyra,
    tabs: {
      ouvrir: (url, o) => {
        // Les extensions n'ouvrent que des pages web ou leurs propres pages (options, popups) : ni lyra:// ni file://.
        if (!/^(https?|chrome-extension):/i.test(url)) return undefined
        const m = (o.fenetreId !== undefined ? onglets.get(o.fenetreId) : undefined) ?? ongletsCourants()
        const f = m && manager.fenetre(m.fenetreId)
        if (!m || !f || privees.has(m.fenetreId)) return undefined
        const wc = m.webContentsDe(m.ouvrir(url, { actif: o.actif }))
        return wc ? { wc, win: f.win } : undefined
      },
      activer: (wc) => {
        const m = ongletsPossedant(wc)
        const id = m?.idDe(wc)
        if (m && id) m.activer(id)
      },
      fermer: (wc) => {
        const m = ongletsPossedant(wc)
        const id = m?.idDe(wc)
        if (m && id) m.fermer(id)
      }
    },
    fenetres: {
      creer: (url) => {
        const win = creerFenetre()
        if (url && /^https?:/i.test(url)) onglets.get(win.id)?.ouvrir(url)
        return win
      },
      fermer: (win) => {
        if (!win.isDestroyed()) win.close()
      }
    }
  })
  const registreExtensions = creerRegistre(reglages)
  if (process.env.LYRA_TEST === '1' && process.env.LYRA_EXTENSIONS_FIXTURES) {
    installerFixtures(process.env.LYRA_EXTENSIONS_FIXTURES, baseExtensions, registreExtensions)
  }
  const chargeurExtensions = creerChargeur({ extensions: sessionLyra.extensions, registre: registreExtensions, base: baseExtensions })
  const installateurChrome = creerInstallateurChrome({ base: baseExtensions, registre: registreExtensions, chargeur: chargeurExtensions })
  const miseAJourExtensions = creerMiseAJour({
    registre: registreExtensions,
    reglages,
    updateExtensions: () => updateExtensions(sessionLyra),
    extensionsChargees: () => sessionLyra.extensions.getAllExtensions().map((x) => ({ id: x.id, version: x.version, path: x.path })),
    base: baseExtensions,
    derniereVersionUbo: installateurChrome.derniereVersionUbo,
    installerUbo: installateurChrome.installerUbo,
    delaiDemarrageMs: 15_000
  })
  installerExtensionsIpc({
    chargeur: chargeurExtensions,
    installateur: installateurChrome,
    miseAJour: miseAJourExtensions,
    modeTest: process.env.LYRA_TEST === '1',
    estPrivee: (wc) => {
      const f = manager.deWebContents(wc)
      return f !== undefined && privees.has(f.id)
    },
    choisir: async (wc, quoi) => {
      const f = manager.deWebContents(wc)
      const options: Electron.OpenDialogOptions =
        quoi === 'dossier'
          ? { title: "Choisir le dossier de l'extension", properties: ['openDirectory'] }
          : { title: "Choisir une extension (.crx ou .zip)", properties: ['openFile'], filters: [{ name: 'Extensions', extensions: ['crx', 'zip'] }] }
      const r = f ? await dialog.showOpenDialog(f.win, options) : await dialog.showOpenDialog(options)
      return r.canceled ? undefined : r.filePaths[0]
    }
  })
  await chargeurExtensions.chargerAuDemarrage()
  // Mises à jour : jamais sous test (pas de réseau inattendu), et seulement si le réglage est actif.
  if (process.env.LYRA_TEST !== '1') miseAJourExtensions.demarrer()
  if (process.env.LYRA_TEST === '1') {
    handle('test:navigate', async (url) => {
      const m = ongletsCourants()
      const id = m?.idActif()
      if (m && id) await m.naviguerEtAttendre(id, url)
    })
    handle('test:endormir', (id) => ongletsCourants()?.endormir(id) ?? false)
    handle('test:livraisons', () => livraisonsTest)
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
    // Action explicite : lève le délai de grâce ; « Aucune passerelle ne répond » : nouvelle recherche,
    // que l'échec suivant attendra avant de décider.
    pass.reessayer(p.url, typeErreurPage(e.sender.getURL()) === 'passerelles')
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
    if (!p) return {}
    // Fenêtre privée : jamais d'écriture dans les réglages.
    const r = pass.ajouterDepuisErreur(p.url, { privee: privees.has(p.m.fenetreId) })
    if (r.erreur) return { erreur: r.erreur }
    if (r.ok) p.m.naviguer(p.id, p.url)
    return {}
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
      // Fenêtre privée : pas de bascule (elle écrirait dans les réglages).
      basculable: pass.basculable(urlOriginale(url), privees.has(f.id)),
      contourne: pass.contourne(urlOriginale(url)),
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
  installerPalette({ ongletsDe, historique: hist, favoris, reglages: () => reglages.getSettings(), creerFenetre,
    dndActif: (m) => dnd.actif(m.fenetreId),
    dnd: (m, action) => (action === 'sortir' ? dnd.sortir(m.fenetreId) : entrerDnd(m.fenetreId, action)),
    deplacerCiel: (position) => void reglages.setSettings({ ciel: { position, masque: false } } as Partial<Settings>)
  })
  const basculerFavori = (m: TabManager): void => {
    const wc = m.wcActif()
    const url = wc ? urlOriginale(wc.getURL()) : ''
    if (/^(https?|file):/i.test(url) && wc) favoris.toggle({ url, title: wc.getTitle() || url })
  }
  installerMenu(ongletsCourants, {
    nouvelleFenetre: () => creerFenetre(),
    basculerFavori,
    basculerDnd: () => {
      const id = BaseWindow.getFocusedWindow()?.id ?? manager.premiere()?.id
      if (id !== undefined && onglets.has(id)) basculerDnd(id)
    },
    // Épinglé : masque ; masqué : révèle ; révélé : épingle.
    basculerCiel: () => {
      const id = BaseWindow.getFocusedWindow()?.id
      const f = (id !== undefined ? manager.fenetre(id) : undefined) ?? manager.premiere()
      const masque = reglages.getSettings().ciel.masque
      if (masque && f && !f.estRevele()) {
        f.reveler(true)
        return
      }
      const patch: Record<string, unknown> = { ciel: { masque: !masque } }
      reglages.setSettings(patch as Partial<Settings>)
    }
  })
  // Les Boucliers sont prêts avant la première fenêtre : aucune page ne se charge sans eux.
  await demarrerBoucliers({
    reglages,
    sessions: [session.defaultSession, session.fromPartition('persist:lyra')],
    cacheDir: join(paths.userData(), 'shields'),
    onglets: () => onglets.values(),
    ongletsDe,
    // http/ws vers un site contourné : annulé avant tout envoi, quel que soit l'état (asynchrone) du PAC.
    garde: (d) => /^(http|ws):/i.test(d.url) && pass.refusHttp(d.url) !== null
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
