/** Une passerelle candidate (proxy). Module pur : aucun import electron. */
export interface Candidat {
  type: 'socks5' | 'http'
  hote: string
  port: number
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** Octets d'une IPv4 écrite proprement (sans zéro initial), sinon undefined. */
export function octets(ip: string): [number, number, number, number] | undefined {
  const m = IPV4.exec(ip)
  if (!m) return undefined
  const o = m.slice(1, 5)
  if (o.some((x) => x.length > 1 && x.startsWith('0'))) return undefined
  const n = o.map(Number)
  if (n.some((x) => x > 255)) return undefined
  return n as [number, number, number, number]
}

/** IPv4 routable publiquement : exclut 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16 et 224/3. */
export function estIpv4Publique(ip: string): boolean {
  const o = octets(ip)
  if (!o) return false
  const [a, b] = o
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  return true
}

/** Nom de domaine (au moins un point, TLD alphabétique ou punycode) sans schéma, port ni chemin. */
const DOMAINE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i
export const hoteValide = (h: unknown): h is string => typeof h === 'string' && h.length <= 253 && DOMAINE.test(h)

const LIGNE = /^(?:(socks5|https?):\/\/)?(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/i

/** Lit un fichier « IP:port » (préfixe socks5:// ou http(s):// accepté) ; lignes invalides et IP non publiques ignorées. */
export function lireListe(texte: string, protocole: Candidat['type']): Candidat[] {
  if (typeof texte !== 'string') return []
  const vus = new Set<string>()
  const sortie: Candidat[] = []
  for (const brut of texte.split(/\r?\n/)) {
    const m = LIGNE.exec(brut.trim())
    if (!m) continue
    const port = Number(m[3])
    if (port < 1 || port > 65535 || !estIpv4Publique(m[2])) continue
    const prefixe = m[1]?.toLowerCase()
    const type: Candidat['type'] = prefixe === undefined ? protocole : prefixe === 'socks5' ? 'socks5' : 'http'
    const cle = `${type}|${m[2]}|${port}`
    if (vus.has(cle)) continue
    vus.add(cle)
    sortie.push({ type, hote: m[2], port })
  }
  return sortie
}

export const memeCandidat = (a: Candidat, b: Candidat): boolean => a.type === b.type && a.hote === b.hote && a.port === b.port

/** Fusionne plusieurs listes en conservant l'ordre, sans doublon. */
export function fusionner(...listes: Candidat[][]): Candidat[] {
  const sortie: Candidat[] = []
  for (const l of listes) for (const c of l) if (!sortie.some((x) => memeCandidat(x, c))) sortie.push(c)
  return sortie
}

const normaliser = (h: string): string => h.toLowerCase().replace(/\.+$/, '')

/** L'hôte est-il l'un des sites ou un de leurs sous-domaines ? (casse et point final ignorés) */
export function hoteCouvert(hote: string, sites: readonly string[]): boolean {
  const h = normaliser(hote)
  if (!h) return false
  return sites.some((s) => {
    const n = normaliser(s)
    return n !== '' && (h === n || h.endsWith(`.${n}`))
  })
}
