import { app, BaseWindow, WebContentsView, webContents, protocol, session } from 'electron'
import { join } from 'node:path'
import * as paths from './paths'
import { definirFournisseurLangue } from '../shared/i18n'
import { handle, envoyer } from './ipc'
import { creerReglages } from './settings/settings'
import { installerProtocoleLyra } from './protocol/lyra'
import { PRELOAD_INTERNAL, PRELOAD_UI } from './preloads'

definirFournisseurLangue(() => app.getLocale())
app.setPath('userData', paths.userData())

protocol.registerSchemesAsPrivileged([
  { scheme: 'lyra', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
])

/** Largeur provisoire de la bande d'interface (la mise en page vient en tâche 4). */
const BANDE_UI = 272

let pageView: WebContentsView | undefined

function creerFenetre(): void {
  const fenetre = new BaseWindow({
    width: 1280,
    height: 800,
    title: 'Lyra',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const } : {})
  })

  const vue = new WebContentsView({
    webPreferences: {
      preload: PRELOAD_UI,
      sandbox: true,
      contextIsolation: true
    }
  })
  fenetre.contentView.addChildView(vue)
  const page = new WebContentsView({
    webPreferences: { preload: PRELOAD_INTERNAL, sandbox: true, contextIsolation: true }
  })
  fenetre.contentView.addChildView(page)
  pageView = page
  const ajuster = (): void => {
    const { width, height } = fenetre.getContentBounds()
    vue.setBounds({ x: 0, y: 0, width: BANDE_UI, height })
    page.setBounds({ x: BANDE_UI, y: 0, width: Math.max(0, width - BANDE_UI), height })
  }
  ajuster()
  fenetre.on('resize', ajuster)

  const urlDev = process.env.ELECTRON_RENDERER_URL
  if (urlDev) void vue.webContents.loadURL(`${urlDev}/ui.html`)
  else void vue.webContents.loadFile(join(__dirname, '../renderer/ui.html'))
  void page.webContents.loadURL('lyra://newtab')
}

app.on('session-created', installerProtocoleLyra)

void app.whenReady().then(() => {
  installerProtocoleLyra(session.defaultSession)
  const reglages = creerReglages(join(paths.userData(), 'settings.json'), app.getPath('downloads'))
  handle('settings:get', () => reglages.getSettings())
  handle('settings:set', (patch) => reglages.setSettings(patch))
  if (process.env.LYRA_TEST === '1') {
    handle('test:navigate', async (url) => {
      await pageView?.webContents.loadURL(url)
    })
  }
  reglages.onChanged((s) => {
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
