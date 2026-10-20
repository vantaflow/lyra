/** Page de premier niveau d'une requête `webRequest` et origine qui sert de clé aux règles par site. Pur (aucune dépendance à Electron). */

/** Origine servant de clé aux règles de site : « https://hôte[:port] », « file:// », ou '' . */
export function origineDe(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol === 'file:') return 'file://'
    return u.origin === 'null' ? '' : u.origin
  } catch {
    return ''
  }
}

/** Ce qu'il faut d'une requête pour retrouver sa page de premier niveau. */
export interface RequetePage {
  url: string
  resourceType?: string
  referrer?: string
  webContents?: { getURL(): string } | null
}

/** Page de premier niveau qui a émis la requête, ou '' si elle est inconnue (service worker, webContents détruit sans référent). */
export function hautConnu(d: RequetePage): string {
  if (d.resourceType === 'mainFrame') return d.url
  let url = ''
  try {
    url = d.webContents?.getURL() ?? ''
  } catch {
    // webContents détruit
  }
  return url || d.referrer || ''
}
