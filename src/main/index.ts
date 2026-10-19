import { app, BaseWindow, WebContentsView, webContents, protocol, session } from 'electron'
import { WindowManager } from './window/WindowManager'
import type { Settings } from '../shared/types'
import { join } from 'node:path'
import * as paths from './paths'
import { definirFournisseurLangue } from '../shared/i18n'
import { handle, envoyer } from './ipc'
import { creerReglages } from './settings/settings'
import { installerProtocoleLyra } from './protocol/lyra'
import { PRELOAD_INTERNAL } from './preloads'

definirFournisseurLangue(() => app.getLocale())
app.setPath('userData', paths.userData())

protocol.registerSchemesAsPrivileged([
  { scheme: 'lyra', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
])

let reglagesCourants: () => Settings = () => {
  throw new Error('réglages non initialisés')
}
const manager = new WindowManager(() => reglagesCourants().ciel)
let pageView: WebContentsView | undefined

function creerFenetre(): void {
  const fenetre = manager.creerFenetre({})
  // Vue de page provisoire (remplacée par le gestionnaire d'onglets).
  const page = new WebContentsView({
    webPreferences: { preload: PRELOAD_INTERNAL, sandbox: true, contextIsolation: true }
  })
  pageView = page
  fenetre.setPageView(page)
  void page.webContents.loadURL('lyra://newtab')
}

app.on('session-created', installerProtocoleLyra)

void app.whenReady().then(() => {
  installerProtocoleLyra(session.defaultSession)
  const reglages = creerReglages(join(paths.userData(), 'settings.json'), app.getPath('downloads'))
  reglagesCourants = () => reglages.getSettings()
  handle('layout:get', (_d, event) => {
    const f = manager.deWebContents(event.sender) ?? manager.premiere()
    if (!f) throw new Error('aucune fenêtre')
    return { ciel: reglages.getSettings().ciel, bounds: f.bounds() }
  })
  handle('settings:get', () => reglages.getSettings())
  handle('settings:set', (patch) => reglages.setSettings(patch))
  if (process.env.LYRA_TEST === '1') {
    handle('test:navigate', async (url) => {
      await pageView?.webContents.loadURL(url)
    })
  }
  reglages.onChanged((s) => {
    manager.relayoutAll()
    for (const wc of webContents.getAllWebContents()) envoyer(wc, 'settings:changed', s)
  })
  creerFenetre()
  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) creerFenetre()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
