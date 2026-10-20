/**
 * Teinte d'un site à partir de son favicon, lu dans le cache HTTP de la session : aucune requête réseau n'est émise.
 * Electron ne télécharge pas les favicons : seule une icône que la page a déjà chargée elle-même est dans le cache (sinon : pas de teinte).
 */
import { nativeImage, net, type Session, type WebContents } from 'electron'
import { couleurDominante } from './couleurDominante'
import { decoderBmp, formatFavicon, imageDeIco } from './faviconDecode'

const TAILLE_MAX = 256 * 1024
const DELAI_MS = 3000

/** Pixels BGRA 16×16 d'une image raster (PNG, JPEG, GIF, WebP) décodée par Electron ; `null` si illisible. */
function rasterElectron(octets: Buffer): Uint8Array | null {
  const image = nativeImage.createFromBuffer(octets)
  if (image.isEmpty()) return null
  return image.resize({ width: 16, height: 16 }).toBitmap()
}

/**
 * Couleur dominante des octets d'un favicon (PNG, JPEG, GIF, WebP, ICO — PNG ou BMP embarqué —, BMP) ; `null` pour un SVG ou un format inconnu.
 * `raster` décode un format raster en pixels BGRA (Electron en production, simulé en test).
 */
export function teinteDesOctets(octets: Buffer, raster: (o: Buffer) => Uint8Array | null = rasterElectron): string | null {
  if (octets.length === 0 || octets.length > TAILLE_MAX) return null
  switch (formatFavicon(octets)) {
    case 'png':
    case 'jpeg':
    case 'gif':
    case 'webp': {
      const px = raster(octets)
      return px ? couleurDominante(px) : null
    }
    case 'ico': {
      const image = imageDeIco(octets)
      if (!image) return null
      if ('png' in image) {
        const px = raster(image.png)
        return px ? couleurDominante(px) : null
      }
      return couleurDominante(image.bgra)
    }
    case 'bmp': {
      const b = decoderBmp(octets)
      return b ? couleurDominante(b.bgra) : null
    }
    default:
      return null
  }
}

/** Octets d'une adresse `data:` ; `null` si elle est mal formée ou trop grande. */
function octetsDataUrl(url: string): Buffer | null {
  const m = /^data:([^,]*),(.*)$/is.exec(url)
  if (!m) return null
  try {
    const b = /;base64$/i.test(m[1]) ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2]), 'utf8')
    return b.length <= TAILLE_MAX ? b : null
  } catch {
    return null
  }
}

/**
 * Octets d'une réponse déjà dans le cache HTTP de la session (`cache: 'only-if-cached'` : ERR_CACHE_MISS sans réseau), `null` sinon.
 * (`session.fetch` ne convient pas : il lève toujours avec `only-if-cached`.)
 */
function lireEnCache(session: Session, url: string): Promise<Buffer | null> {
  return new Promise((resoudre) => {
    let fini = false
    const terminer = (v: Buffer | null, requete?: { abort(): void }): void => {
      if (fini) return
      fini = true
      clearTimeout(minuteur)
      if (v === null) {
        try {
          requete?.abort()
        } catch {
          /* déjà terminée */
        }
      }
      resoudre(v)
    }
    const minuteur = setTimeout(() => terminer(null, requete), DELAI_MS)
    minuteur.unref?.()
    let requete: ReturnType<typeof net.request> | undefined
    try {
      // `cache` est accepté par Electron mais absent de ses déclarations.
      requete = net.request({ url, session, cache: 'only-if-cached', credentials: 'omit', redirect: 'follow' } as Parameters<typeof net.request>[0])
      const r = requete
      r.on('response', (reponse) => {
        if (reponse.statusCode !== 200) return terminer(null, r)
        const morceaux: Buffer[] = []
        let total = 0
        reponse.on('data', (c) => {
          total += c.length
          if (total > TAILLE_MAX) return terminer(null, r)
          morceaux.push(c)
        })
        reponse.on('end', () => terminer(Buffer.concat(morceaux)))
        reponse.on('error', () => terminer(null, r))
      })
      r.on('error', () => terminer(null, r))
      r.end()
    } catch {
      terminer(null, requete)
    }
  })
}

/** Couleur dominante du favicon si le cache de la session l'a déjà, sinon `null` (SVG ignoré). Ne lève jamais. */
export async function couleurFaviconEnCache(wc: WebContents, url: string): Promise<string | null> {
  try {
    if (!/^(https?|data):/i.test(url) || wc.isDestroyed()) return null
    const octets = url.toLowerCase().startsWith('data:') ? octetsDataUrl(url) : await lireEnCache(wc.session, url)
    return octets ? teinteDesOctets(octets) : null
  } catch {
    return null
  }
}
