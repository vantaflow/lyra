/** Teinte d'un site à partir de son favicon, lu dans le cache HTTP de la session : aucune requête réseau n'est émise. */
import { nativeImage, type WebContents } from 'electron'
import { couleurDominante } from './couleurDominante'

const TAILLE_MAX = 256 * 1024

/** Couleur dominante du favicon si le cache de la session l'a déjà (`only-if-cached`), sinon `null`. Ne lève jamais. */
export async function couleurFaviconEnCache(wc: WebContents, url: string): Promise<string | null> {
  try {
    if (!/^(https?|data):/i.test(url) || wc.isDestroyed()) return null
    const reponse = await wc.session.fetch(url, { cache: 'only-if-cached', bypassCustomProtocolHandlers: true })
    if (!reponse.ok) return null
    const octets = Buffer.from(await reponse.arrayBuffer())
    if (octets.length === 0 || octets.length > TAILLE_MAX) return null
    const image = nativeImage.createFromBuffer(octets)
    if (image.isEmpty()) return null
    return couleurDominante(image.resize({ width: 16, height: 16 }).toBitmap())
  } catch {
    return null
  }
}
