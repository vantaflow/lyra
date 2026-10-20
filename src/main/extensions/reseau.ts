/**
 * Réseau des installateurs d'extensions : GET borné (taille, délai global) avec redirections suivies à la main
 * (https seulement, hôte autorisé à chaque saut, 5 sauts au plus). Sans Electron.
 */
export const DELAI_RESEAU_MS = 30_000
export const MAX_SAUTS = 5

export type FiltreHote = (hote: string) => boolean

export const hoteAmo: FiltreHote = (h) => h === 'addons.mozilla.org' || h === 'addons.cdn.mozilla.net'

export async function lireCorps(r: Response, max: number): Promise<Uint8Array> {
  const annonce = Number(r.headers.get('content-length'))
  if (Number.isFinite(annonce) && annonce > max) throw new Error('téléchargement trop volumineux')
  if (!r.body) {
    const tampon = new Uint8Array(await r.arrayBuffer())
    if (tampon.length > max) throw new Error('téléchargement trop volumineux')
    return tampon
  }
  const lecteur = r.body.getReader()
  const morceaux: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    n += value.length
    if (n > max) {
      await lecteur.cancel().catch(() => {})
      throw new Error('téléchargement trop volumineux')
    }
    morceaux.push(value)
  }
  return Buffer.concat(morceaux)
}

export interface OptionsRequete {
  fetch: typeof fetch
  /** Délai global de la requête (redirections comprises), en ms. */
  delaiMs: number
}

/** GET borné ; `tolere404` lève `ErreurIntrouvable` (et non une erreur générique) sur un 404, pour permettre un repli. */
export async function requeteSure(
  o: OptionsRequete,
  url: string,
  accepte: FiltreHote,
  max: number,
  entetes?: Record<string, string>,
  tolere404 = false
): Promise<Uint8Array> {
  const signal = AbortSignal.timeout(o.delaiMs)
  let courante = url
  for (let saut = 0; saut <= MAX_SAUTS; saut++) {
    const u = new URL(courante)
    if (u.protocol !== 'https:') throw new Error(`adresse non sécurisée refusée (${u.protocol})`)
    if (!accepte(u.hostname)) throw new Error(`hôte refusé : ${u.hostname}`)
    const r = await o.fetch(courante, { signal, redirect: 'manual', headers: entetes })
    if (r.status >= 300 && r.status < 400) {
      const lieu = r.headers.get('location')
      if (!lieu) throw new Error(`redirection sans destination (HTTP ${r.status})`)
      courante = new URL(lieu, courante).toString()
      continue
    }
    if (r.status === 204) throw new Error('le magasin ne propose plus ce paquet (HTTP 204)')
    if (r.status === 404 && tolere404) throw new ErreurIntrouvable()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return lireCorps(r, max)
  }
  throw new Error(`trop de redirections (plus de ${MAX_SAUTS})`)
}

export class ErreurIntrouvable extends Error {
  constructor() {
    super('introuvable (HTTP 404)')
    this.name = 'ErreurIntrouvable'
  }
}
