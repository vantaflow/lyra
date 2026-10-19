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
const PREFIXES_VITE = ['/@', '/node_modules/', '/src/']

/** URL du serveur Vite pour une requête lyra:// en dev (pathname + search intacts), ou null. */
export function urlDev(url: string, baseDev: string): string | null {
  if (!url.startsWith('lyra://')) return null
  const reste = url.slice('lyra://'.length).split('#')[0]
  const iQuery = reste.search(/[?]/)
  const chemin = iQuery === -1 ? reste : reste.slice(0, iQuery)
  const search = iQuery === -1 ? '' : reste.slice(iQuery)
  const iSlash = chemin.indexOf('/')
  const hote = iSlash === -1 ? chemin : chemin.slice(0, iSlash)
  const pathname = iSlash === -1 ? '/' : chemin.slice(iSlash)
  if (!HOTES.includes(hote)) return null
  let decode: string
  try {
    decode = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decode.split('/').includes('..') || decode.includes('\\') || decode.includes('\0')) return null

  const base = baseDev.replace(/\/$/, '')
  const dernier = decode.split('/').filter(Boolean).pop() ?? ''
  const proxifie = PREFIXES_VITE.some((p) => pathname.startsWith(p)) || dernier.includes('.')
  if (proxifie) return `${base}${pathname}${search}`
  return `${base}/${hote === 'newtab' ? 'newtab' : 'settings'}.html`
}

const CSP_PROD = "default-src 'self'; style-src 'self' 'unsafe-inline'"
// En dev, le client HMR de Vite (module inline, websocket) exige des règles plus souples.
const CSP_DEV =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: http:"

function avecCsp(reponse: Response, csp: string): Response {
  const entetes = new Headers(reponse.headers)
  entetes.set('Content-Security-Policy', csp)
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes })
}

const racineProd = (): string => join(__dirname, '../renderer')

const installees = new WeakSet<Session>()

export function installerProtocoleLyra(ses: Session): void {
  if (installees.has(ses)) return
  installees.add(ses)
  ses.protocol.handle('lyra', async (requete) => {
    const introuvable = (): Response => new Response('introuvable', { status: 404 })
    try {
      const urlServeur = process.env.ELECTRON_RENDERER_URL
      if (urlServeur && !app.isPackaged) {
        const cible = urlDev(requete.url, urlServeur)
        return cible ? avecCsp(await net.fetch(cible), CSP_DEV) : introuvable()
      }
      const fichier = resolveLyraPath(requete.url, racineProd())
      if (!fichier) return introuvable()
      return avecCsp(await net.fetch(pathToFileURL(fichier).toString()), CSP_PROD)
    } catch {
      return introuvable()
    }
  })
}
