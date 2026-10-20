/**
 * Cookies du paquet `.lyra` (seulement si l'utilisateur le demande) : conversion entre les cookies d'Electron et le
 * format du paquet. Pur : la session `persist:lyra` est branchée par l'appelant, jamais une partition privée.
 */
import type { Cookie, CookiesSetDetails, Session } from 'electron'
import { cookieValide, type CookieSauvegarde } from './paquet'

/** La seule partition dont les cookies sont exportés ou restaurés. */
export const PARTITION_COOKIES = 'persist:lyra'

export interface AccesCookies {
  lire(): Promise<CookieSauvegarde[]>
  /** Vrai si le cookie a été restauré. */
  ecrire(c: CookieSauvegarde): Promise<boolean>
}

export function versSauvegarde(c: Cookie): CookieSauvegarde | null {
  return cookieValide({
    name: c.name,
    value: c.value,
    domain: c.domain ?? '',
    path: c.path ?? '/',
    secure: c.secure === true,
    httpOnly: c.httpOnly === true,
    hostOnly: c.hostOnly === true,
    sameSite: c.sameSite,
    ...(c.session === true || c.expirationDate === undefined ? {} : { expirationDate: c.expirationDate })
  })
}

export function versDetails(c: CookieSauvegarde): CookiesSetDetails {
  const hote = c.domain.replace(/^\./, '')
  return {
    url: `${c.secure ? 'https' : 'http'}://${hote.includes(':') ? `[${hote}]` : hote}${c.path}`,
    name: c.name,
    value: c.value,
    ...(c.hostOnly ? {} : { domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}` }),
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    ...(c.sameSite ? { sameSite: c.sameSite } : {}),
    ...(c.expirationDate !== undefined ? { expirationDate: c.expirationDate } : {})
  }
}

export function cookiesDeSession(ses: Session): AccesCookies {
  return {
    lire: async () => (await ses.cookies.get({})).map(versSauvegarde).filter((c): c is CookieSauvegarde => c !== null),
    ecrire: async (c) => {
      try {
        await ses.cookies.set(versDetails(c))
        return true
      } catch {
        return false
      }
    }
  }
}
