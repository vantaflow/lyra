import { majeurChrome, type CleUa } from '../shared/ua-profils'

/** User-agent sans « Electron/x » ni « lyra/x » : les sites ne doivent pas voir un navigateur intégré. */
export function nettoyerUserAgent(ua: string): string {
  return ua.replace(/ Electron\/\S+/, '').replace(/ lyra\/\S+/i, '')
}

/** Numéro de version majeur du Chrome embarqué (`process.versions.chrome`, p. ex. « 152.0.7977.167 » → 152). */
export const majeurDeChromeReel = (versions: string | undefined = process.versions.chrome): number | undefined => (versions ? majeurChrome(versions) : undefined)

/** Profil de user-agent alternatif ; `chromium` : le profil envoie des indices client `Sec-CH-UA*` (sinon on les retire). */
export interface ProfilUa {
  cle: CleUa
  ua: string
  chromium: boolean
  /** Valeur de `Sec-CH-UA-Platform` (sans guillemets) des profils Chromium. */
  plateforme?: string
  mobile?: boolean
  /** `navigator.platform` et `navigator.vendor` du navigateur imité. */
  plateformeNav: string
  vendeur: string
  /** `navigator.appVersion`. */
  appVersion: string
}

const FIREFOX = 140
const SAFARI = '18.5'

/**
 * Profil nommé : `null` pour le profil par défaut, une clé inconnue ou absente (rien n'est réécrit ; l'identité est celle de la session).
 * `chrome` : version réelle du Chrome embarqué, dont le numéro majeur sert aux profils Chromium (UA « réduit » : `N.0.0.0`).
 */
const sansMozilla = (ua: string): string => ua.replace('Mozilla/', '')

export function profilUa(cle: string | undefined, chrome: string | undefined = process.versions.chrome): ProfilUa | null {
  const p = profilBrut(cle, chrome)
  return p && { ...p, appVersion: p.cle === 'firefox' ? '5.0 (Windows)' : sansMozilla(p.ua) }
}

function profilBrut(cle: string | undefined, chrome: string | undefined): Omit<ProfilUa, 'appVersion'> | null {
  const n = majeurDeChromeReel(chrome) ?? 0
  switch (cle) {
    case 'chrome-windows':
      return { cle, chromium: true, plateforme: 'Windows', mobile: false, plateformeNav: 'Win32', vendeur: 'Google Inc.', ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${n}.0.0.0 Safari/537.36` }
    case 'chrome-android':
      return { cle, chromium: true, plateforme: 'Android', mobile: true, plateformeNav: 'Linux armv81', vendeur: 'Google Inc.', ua: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${n}.0.0.0 Mobile Safari/537.36` }
    case 'firefox':
      return { cle, chromium: false, plateformeNav: 'Win32', vendeur: '', ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${FIREFOX}.0) Gecko/20100101 Firefox/${FIREFOX}.0` }
    case 'safari':
      return { cle, chromium: false, plateformeNav: 'MacIntel', vendeur: 'Apple Computer, Inc.', ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${SAFARI} Safari/605.1.15` }
    default:
      return null
  }
}
