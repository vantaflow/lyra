/**
 * Conversion d'une icône SVG en PNG (Electron) : le SVG est dessiné dans une fenêtre cachée, sans réseau ni script
 * de page, puis capturé. `nativeImage` ne décode pas le SVG sur toutes les plateformes : la fenêtre est le chemin sûr.
 * Sous `LYRA_TEST`, la fenêtre reste cachée comme toutes les autres (`optionsFenetreCachee`).
 */
import { BrowserWindow } from 'electron'
import { optionsFenetreCachee } from '../modeTest'

const DELAI_MS = 10_000

export async function svgVersPng(svg: Buffer, taille: number): Promise<Buffer | undefined> {
  const t = Math.max(16, Math.min(512, Math.round(taille)))
  const win = new BrowserWindow({
    width: t,
    height: t,
    show: false,
    frame: false,
    transparent: true,
    ...optionsFenetreCachee(),
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  const garde = setTimeout(() => {
    if (!win.isDestroyed()) win.destroy()
  }, DELAI_MS)
  try {
    const page =
      `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">` +
      `<body style="margin:0;background:transparent"><img width="${t}" height="${t}" src="data:image/svg+xml;base64,${svg.toString('base64')}">`
    await win.loadURL(`data:text/html;base64,${Buffer.from(page).toString('base64')}`)
    const largeur = (await win.webContents.executeJavaScript(
      `new Promise((ok) => { const i = document.images[0]; const fin = () => ok(i.naturalWidth); i.complete ? fin() : (i.onload = fin, i.onerror = () => ok(0)) })`
    )) as number
    if (!largeur) return undefined
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: t, height: t })
    return image.isEmpty() ? undefined : image.toPNG()
  } catch {
    return undefined
  } finally {
    clearTimeout(garde)
    if (!win.isDestroyed()) win.destroy()
  }
}
