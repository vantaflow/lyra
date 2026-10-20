/** Domaine enregistrable (section privée de la PSL comprise) : base de la notion de « 1re partie ». Pur. */
import { parse } from 'tldts-experimental'

/**
 * Domaine enregistrable de l'URL, section privée de la PSL comprise (`a.github.io` ≠ `b.github.io`, `a.co.uk` ≠ `b.co.uk`).
 * IP, `localhost` et suffixes seuls : l'hôte lui-même. URL illisible : ''.
 */
export function domaineEnregistrable(url: string): string {
  let hote: string
  try {
    hote = new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
  return parse(url, { allowPrivateDomains: true }).domain ?? hote
}

/** Les deux URL appartiennent-elles au même site (même domaine enregistrable) ? Ports et sous-domaines ignorés. */
export const memePartie = (url: string, urlHaut: string): boolean => domaineEnregistrable(url) === domaineEnregistrable(urlHaut)
