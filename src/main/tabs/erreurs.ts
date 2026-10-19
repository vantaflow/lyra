/** Pages d'erreur Lyra : lyra://erreur?type=…&url=… (catégorie interne, servie par erreur.html). */

export type TypeErreur = 'reseau' | 'introuvable' | 'certificat'

const PREFIXE = 'lyra://erreur'

/** Codes réseau Chromium (net_error_list) : fichier ou nom introuvable. */
const INTROUVABLE = new Set([-6, -105, -137])

export function typeErreur(code: number): TypeErreur {
  if (code <= -200 && code >= -219) return 'certificat'
  return INTROUVABLE.has(code) ? 'introuvable' : 'reseau'
}

export const urlErreur = (type: TypeErreur, url: string): string =>
  `${PREFIXE}?type=${type}&url=${encodeURIComponent(url)}`

export const estUrlErreur = (url: string): boolean => /^lyra:\/\/erreur(\/|\?|#|$)/i.test(url)

/** Adresse que l'utilisateur voulait atteindre (url inchangée si ce n'est pas une page d'erreur). */
export function urlOriginale(url: string): string {
  if (!estUrlErreur(url)) return url
  try {
    return new URL(url).searchParams.get('url') ?? url
  } catch {
    return url
  }
}

/** Hôtes dont le certificat invalide a été accepté pour la session (jamais enregistré). */
export const exceptionsCertificat = new Set<string>()

export function hoteDe(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** Garde de « Continuer quand même » : adresse https à accepter, seulement depuis une page d'erreur de certificat. */
export function continuerAutorise(urlExpediteur: string): string | null {
  if (!estUrlErreur(urlExpediteur)) return null
  try {
    if (new URL(urlExpediteur).searchParams.get('type') !== 'certificat') return null
  } catch {
    return null
  }
  const url = urlOriginale(urlExpediteur)
  return /^https:/i.test(url) ? url : null
}
