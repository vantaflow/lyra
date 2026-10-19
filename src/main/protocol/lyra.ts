import { app, net, type Session } from 'electron'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const HOTES_REGLAGES = ['settings', 'extensions', 'history', 'bookmarks', 'downloads', 'shields']
const HOTES = ['newtab', ...HOTES_REGLAGES]

/** Traduit une URL lyra:// en fichier sous `racine`, ou null (hôte inconnu, traversée). */
export function resolveLyraPath(url: string, racine: string): string | null {
  if (!url.startsWith('lyra://')) return null
  const reste = url.slice('lyra://'.length).split(/[?#]/)[0]
  const [hote, ...segments] = reste.split('/')
  if (!HOTES.includes(hote)) return null
  let decodes: string[]
  try {
    decodes = segments.map((s) => decodeURIComponent(s))
  } catch {
    return null
  }
  if (decodes.some((s) => s === '..' || s.includes('\\') || s.includes('\0'))) return null

  const utiles = decodes.filter((s) => s !== '' && s !== '.')
  // Un chemin dont le dernier segment a une extension est un fichier (assets, modules Vite en dev).
  if (utiles.length > 0 && utiles[utiles.length - 1].includes('.')) {
    const fichier = resolve(racine, ...utiles)
    return fichier.startsWith(resolve(racine) + sep) ? fichier : null
  }
  return join(racine, hote === 'newtab' ? 'newtab.html' : 'settings.html')
}

/** Racine fictive en dev : seul le chemin relatif compte, il est refait sur le serveur Vite. */
const RACINE_DEV = resolve('/__lyra_dev__')
const racineProd = (): string => join(__dirname, '../renderer')

/** Sert lyra:// : serveur de dev en développement, out/renderer en production. */
const installees = new WeakSet<Session>()

export function installerProtocoleLyra(ses: Session): void {
  if (installees.has(ses)) return
  installees.add(ses)
  ses.protocol.handle('lyra', (requete) => {
    const urlDev = process.env.ELECTRON_RENDERER_URL
    const dev = Boolean(urlDev) && !app.isPackaged
    const racine = dev ? RACINE_DEV : racineProd()
    const fichier = resolveLyraPath(requete.url, racine)
    if (!fichier) return new Response('introuvable', { status: 404 })
    if (dev) {
      const relatif = fichier.slice(racine.length).split(sep).join('/')
      return net.fetch(`${urlDev}${relatif}`)
    }
    return net.fetch(pathToFileURL(fichier).toString())
  })
}
