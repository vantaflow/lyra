/**
 * Règles par site : « la règle la plus précise gagne », champ par champ.
 * Précision décroissante : origine exacte (`https://hôte[:port]`, `file://`) > hôte nu (`youtube.com`, hôte exact)
 * > motif `*.hôte` (sous-domaines seulement, le plus long d'abord). Module pur : aucune dépendance à Electron.
 */
import type { RegleSite, TypePermission } from '../../shared/types'

export type TypeCle = 'origine' | 'hote' | 'motif'

/** Règle résolue : `boucliers` y est toujours tri-état. */
export type RegleEffective = Omit<RegleSite, 'boucliers'> & { boucliers: 'desactives' | 'standard' | 'strict' }

const HOTE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/
const ORIGINE = /^(https?):\/\/(([a-z0-9.-]+)|\[[0-9a-f:]+\])(:\d{1,5})?$/
const LONGUEUR_MAX = 300

/** Classe une clé de règle ; `null` si elle n'est ni une origine, ni un hôte, ni un motif `*.hôte`. */
export function cleDe(entree: string): { type: TypeCle; valeur: string } | null {
  if (typeof entree !== 'string' || entree.length === 0 || entree.length > LONGUEUR_MAX) return null
  const e = entree.toLowerCase()
  if (e === 'file://') return { type: 'origine', valeur: e }
  if (e.startsWith('*.')) {
    const h = e.slice(2)
    return HOTE.test(h) ? { type: 'motif', valeur: h } : null
  }
  if (e.includes('://')) return ORIGINE.test(e) && !/\.\./.test(e) ? { type: 'origine', valeur: e } : null
  return HOTE.test(e) ? { type: 'hote', valeur: e } : null
}

function origineEtHote(url: string): { origine: string; hote: string } | null {
  try {
    const u = new URL(url)
    if (u.protocol === 'file:') return { origine: 'file://', hote: '' }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return { origine: u.origin.toLowerCase(), hote: u.hostname.toLowerCase() }
  } catch {
    return null
  }
}

const tri = (b: RegleSite['boucliers']): RegleEffective['boucliers'] | undefined =>
  b === undefined ? undefined : b === false ? 'desactives' : b === true ? 'standard' : b

/** Index des règles : par origine, par hôte, et motifs triés du plus long au plus court. */
export class ResolveurSites {
  private exact = new Map<string, RegleSite>()
  private hotes = new Map<string, RegleSite>()
  private motifs: Array<[string, RegleSite]> = []
  private cache = new Map<string, RegleEffective>()

  constructor(sites: Record<string, RegleSite> = {}) {
    this.maj(sites)
  }

  maj(sites: Record<string, RegleSite>): void {
    this.exact.clear()
    this.hotes.clear()
    this.motifs = []
    this.cache.clear()
    for (const [cle, regle] of Object.entries(sites ?? {})) {
      const c = cleDe(cle)
      if (!c) continue
      if (c.type === 'origine') this.exact.set(c.valeur, regle)
      else if (c.type === 'hote') this.hotes.set(c.valeur, regle)
      else this.motifs.push([c.valeur, regle])
    }
    this.motifs.sort((a, b) => b[0].length - a[0].length)
  }

  resoudre(url: string): RegleEffective {
    const en = this.cache.get(url)
    if (en) return en
    const r = this.calculer(url)
    if (this.cache.size >= 1000) this.cache.clear()
    this.cache.set(url, r)
    return r
  }

  private calculer(url: string): RegleEffective {
    const o = origineEtHote(url)
    // Du plus précis au moins précis.
    const regles: RegleSite[] = []
    if (o) {
      const e = this.exact.get(o.origine)
      if (e) regles.push(e)
      const h = o.hote && this.hotes.get(o.hote)
      if (h) regles.push(h)
      if (o.hote) for (const [m, r] of this.motifs) if (o.hote.endsWith(`.${m}`)) regles.push(r)
    }
    const sortie: Record<string, unknown> = {}
    let permissions: Partial<Record<TypePermission, 'autoriser' | 'refuser'>> | undefined
    let boucliers: RegleEffective['boucliers'] | undefined
    for (const regle of regles) {
      for (const [k, v] of Object.entries(regle)) {
        if (v === undefined) continue
        if (k === 'boucliers') boucliers ??= tri(v as RegleSite['boucliers'])
        else if (k === 'permissions') permissions = { ...(v as object), ...permissions }
        else if (!(k in sortie)) sortie[k] = v
      }
    }
    if (permissions) sortie.permissions = permissions
    return { ...sortie, boucliers: boucliers ?? 'standard' } as RegleEffective
  }
}

const resolveurs = new WeakMap<object, ResolveurSites>()

/**
 * Résout la règle effective d'une URL. L'index est mémorisé par objet `sites` : il est rebâti dès que
 * les réglages remplacent l'objet (toute écriture), jamais autrement.
 */
export function resoudre(sites: Record<string, RegleSite>, url: string): RegleEffective {
  const cible = sites ?? {}
  let r = resolveurs.get(cible)
  if (!r) {
    r = new ResolveurSites(cible)
    resolveurs.set(cible, r)
  }
  return r.resoudre(url)
}
