import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { estIpv4Publique, fusionner, lireListe, type Candidat } from './liste'

/** Une liste publique de proxys au format « IP:port » (un par ligne). */
export interface Source {
  url: string
  protocole: Candidat['type']
}

export interface ResultatCandidats {
  candidats: Candidat[]
  /** ISO : date de récupération des candidats (cache compris). */
  date: string
  source: 'cache' | 'reseau' | 'cache-perime' | 'vide'
}

export interface OptionsCandidats {
  fetch: typeof fetch
  cacheFichier: string
  maintenant: Date
  sources?: Source[]
  /** Délai par requête (défaut 15 s). */
  timeoutMs?: number
  /** Source d'aléa dans [0,1) (défaut Math.random) ; injectable pour des tests déterministes. */
  aleatoire?: () => number
}

export const DUREE_CACHE_MS = 30 * 60 * 1000
const DELAI_DEFAUT_MS = 15_000
/** Plafond par source : proxifly en publie ~70 000, inutile de tous les garder (cache, mémoire). */
const MAX_PAR_SOURCE = 2000

const RAW = 'https://raw.githubusercontent.com'
/**
 * URL vérifiées le 2026-10-19 (README + requête GET 200) :
 * - iplocate/free-proxy-list : protocols/{socks5,http,https}.txt, lignes `IP:port`
 * - monosans/proxy-list : proxies/{socks5,http}.txt, lignes `IP:port`
 * - proxifly/free-proxy-list : proxies/protocols/{socks5,http}/data.txt, lignes `socks5://IP:port` / `http://IP:port`
 * Les plus petites d'abord : la fusion garde l'ordre, proxifly (très volumineux) passe en dernier.
 */
export function sourcesParDefaut(): Source[] {
  return [
    { url: `${RAW}/iplocate/free-proxy-list/main/protocols/socks5.txt`, protocole: 'socks5' },
    { url: `${RAW}/monosans/proxy-list/main/proxies/socks5.txt`, protocole: 'socks5' },
    { url: `${RAW}/iplocate/free-proxy-list/main/protocols/http.txt`, protocole: 'http' },
    { url: `${RAW}/iplocate/free-proxy-list/main/protocols/https.txt`, protocole: 'http' },
    { url: `${RAW}/monosans/proxy-list/main/proxies/http.txt`, protocole: 'http' },
    { url: `${RAW}/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt`, protocole: 'socks5' },
    { url: `${RAW}/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt`, protocole: 'http' }
  ]
}

/** `LYRA_PASSERELLES_SOURCES` (lue seulement sous LYRA_TEST=1 ; URL séparées par des virgules) remplace les sources ; protocole déduit de l'URL (« socks5 » dedans, sinon http). */
function sourcesEffectives(fournies?: Source[]): Source[] {
  const env = process.env.LYRA_PASSERELLES_SOURCES
  if (process.env.LYRA_TEST === '1' && env && env.trim()) {
    return env
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean)
      .map((url) => ({ url, protocole: /socks5/i.test(url) ? ('socks5' as const) : ('http' as const) }))
  }
  return fournies ?? sourcesParDefaut()
}

/** Mélange de Fisher-Yates (copie). */
export function melanger<T>(liste: readonly T[], aleatoire: () => number = Math.random): T[] {
  const a = [...liste]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(aleatoire() * (i + 1)))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Entrelacement round-robin : un élément de chaque liste à tour de rôle. */
export function entrelacer<T>(listes: readonly (readonly T[])[]): T[] {
  const sortie: T[] = []
  const n = Math.max(0, ...listes.map((l) => l.length))
  for (let i = 0; i < n; i++) for (const l of listes) if (i < l.length) sortie.push(l[i])
  return sortie
}

async function lireSource(s: Source, f: typeof fetch, timeoutMs: number, aleatoire: () => number): Promise<Candidat[]> {
  try {
    let texte: string
    if (s.url.startsWith('file:')) texte = await readFile(fileURLToPath(s.url), 'utf8')
    else {
      const r = await f(s.url, { signal: AbortSignal.timeout(timeoutMs) })
      if (!r.ok) return []
      texte = await r.text()
    }
    return melanger(lireListe(texte, s.protocole), aleatoire).slice(0, MAX_PAR_SOURCE)
  } catch {
    return []
  }
}

interface Cache {
  date: string
  candidats: Candidat[]
}

const candidatValide = (c: unknown): c is Candidat => {
  if (typeof c !== 'object' || c === null) return false
  const { type, hote, port } = c as Record<string, unknown>
  return (
    (type === 'socks5' || type === 'http') &&
    typeof hote === 'string' &&
    estIpv4Publique(hote) &&
    typeof port === 'number' &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535
  )
}

/** Cache tolérant : tout contenu invalide (JSON cassé, date illisible, candidats mal formés) est ignoré. */
async function lireCache(fichier: string): Promise<Cache | undefined> {
  try {
    const v: unknown = JSON.parse(await readFile(fichier, 'utf8'))
    if (typeof v !== 'object' || v === null) return undefined
    const { date, candidats } = v as Record<string, unknown>
    if (typeof date !== 'string' || Number.isNaN(Date.parse(date)) || !Array.isArray(candidats)) return undefined
    const valides = candidats.filter(candidatValide).map((c) => ({ type: c.type, hote: c.hote, port: c.port }))
    return valides.length > 0 ? { date, candidats: valides } : undefined
  } catch {
    return undefined
  }
}

/** Écriture atomique (.tmp + rename) ; un échec d'écriture n'est pas bloquant. */
async function ecrireCache(fichier: string, cache: Cache): Promise<void> {
  const tmp = `${fichier}.tmp`
  try {
    await mkdir(dirname(fichier), { recursive: true })
    await writeFile(tmp, JSON.stringify(cache))
    await rename(tmp, fichier)
  } catch {
    await rm(tmp, { force: true }).catch(() => undefined)
  }
}

/**
 * Cache valide (< 30 min) → réseau (toutes les sources, une source en échec n'empêche pas les autres)
 * → cache périmé → `[]`. Ne lève jamais. N'est appelée que par l'orchestration (jamais à l'import).
 */
export async function chargerCandidats(opts: OptionsCandidats): Promise<ResultatCandidats> {
  const cache = await lireCache(opts.cacheFichier)
  if (cache) {
    const age = opts.maintenant.getTime() - Date.parse(cache.date)
    if (age >= 0 && age < DUREE_CACHE_MS) return { candidats: cache.candidats, date: cache.date, source: 'cache' }
  }
  const timeoutMs = opts.timeoutMs ?? DELAI_DEFAUT_MS
  const aleatoire = opts.aleatoire ?? Math.random
  const listes = await Promise.all(sourcesEffectives(opts.sources).map((s) => lireSource(s, opts.fetch, timeoutMs, aleatoire)))
  const candidats = fusionner(entrelacer(listes))
  const date = opts.maintenant.toISOString()
  if (candidats.length > 0) {
    await ecrireCache(opts.cacheFichier, { date, candidats })
    return { candidats, date, source: 'reseau' }
  }
  if (cache) return { candidats: cache.candidats, date: cache.date, source: 'cache-perime' }
  return { candidats: [], date, source: 'vide' }
}
