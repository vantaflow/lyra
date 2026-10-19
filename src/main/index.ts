import { app, BaseWindow, WebContentsView } from 'electron'
import { join } from 'node:path'
import * as paths from './paths'
import { definirFournisseurLangue } from '../shared/i18n'

definirFournisseurLangue(() => app.getLocale())
app.setPath('userData', paths.userData())

function creerFenetre(): void {
  const fenetre = new BaseWindow({
    width: 1280,
    height: 800,
    title: 'Lyra',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const } : {})
  })

  const vue = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/ui.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  fenetre.contentView.addChildView(vue)
  const ajuster = (): void => {
    const { width, height } = fenetre.getContentBounds()
    vue.setBounds({ x: 0, y: 0, width, height })
  }
  ajuster()
  fenetre.on('resize', ajuster)

  const urlDev = process.env.ELECTRON_RENDERER_URL
  if (urlDev) void vue.webContents.loadURL(`${urlDev}/ui.html`)
  else void vue.webContents.loadFile(join(__dirname, '../renderer/ui.html'))
}

void app.whenReady().then(() => {
  creerFenetre()
  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) creerFenetre()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
