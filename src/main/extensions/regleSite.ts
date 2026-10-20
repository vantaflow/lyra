/**
 * Règle par site des extensions (`settings.sites[clé].extensions[id] === false`) appliquée aux content scripts du manifest :
 * les sites bloqués sont ajoutés aux `exclude_matches` de chaque script, dans la copie chargée de l'extension (jamais dans
 * l'archive d'origine). Les `exclude_matches` d'origine sont gardés à part (`lyra-exclusions.json`) : réapplication idempotente
 * et réversible. Un changement de règle recharge l'extension concernée (voir `creerSynchroSites`).
 * Limites : un site autorisé explicitement sous un blocage plus large (`*.d` bloqué, `www.d` autorisé) reste bloqué pour ces scripts
 * (un motif ne peut pas exprimer d'exception). `*.d` passe par `exclude_globs` (`https://*.d/*`) pour ne pas exclure `d` ; un glob ne distingue
 * pas l'hôte du chemin : une page dont le chemin contient `.d/` est aussi exclue (cas marginal, au pire l'extension n'agit pas).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RegleSite } from '../../shared/types'
import { cleDe } from '../settings/sites'
import { lireJsonTolerant } from './jsonc'

export const SIDECAR_EXCLUSIONS = 'lyra-exclusions.json'

export interface Exclusions {
  /** `exclude_matches` : origines et hôtes exacts. */
  matches: string[]
  /** `exclude_globs` : motifs `*.hôte` (sous-domaines seulement ; un motif de correspondance `*://*.d/*` couvrirait aussi `d`). */
  globs: string[]
}

/** Exclusions des sites où l'extension est bloquée, triées et sans doublon. */
export function exclusionsSites(sites: Record<string, RegleSite>, id: string): Exclusions {
  const matches = new Set<string>()
  const globs = new Set<string>()
  for (const [cle, regle] of Object.entries(sites ?? {})) {
    if (regle?.extensions?.[id] !== false) continue
    const c = cleDe(cle)
    if (!c) continue
    if (c.type === 'origine') matches.add(c.valeur === 'file://' ? 'file:///*' : `${c.valeur}/*`)
    else if (c.type === 'hote') matches.add(`*://${c.valeur}/*`)
    else {
      globs.add(`http://*.${c.valeur}/*`)
      globs.add(`https://*.${c.valeur}/*`)
    }
  }
  return { matches: [...matches].sort(), globs: [...globs].sort() }
}

/** Motifs de correspondance (`exclude_matches`) des sites bloqués ; les motifs `*.hôte` passent par `exclude_globs` (voir `exclusionsSites`). */
export const motifsExclusion = (sites: Record<string, RegleSite>, id: string): string[] => exclusionsSites(sites, id).matches

type Json = Record<string, unknown>
const tableau = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const liste = (v: unknown): string[] | null => (Array.isArray(v) ? tableau(v) : null)

/** Exclusions d'origine d'un script (`null` : champ absent). */
interface Origine {
  m: string[] | null
  g: string[] | null
}

/**
 * Réécrit `exclude_matches` et `exclude_globs` des content scripts de `<dossier>/manifest.json` : exclusions d'origine + `motifs` / `globs`.
 * `concerne` : le manifest déclare des content scripts. `modifie` : le fichier a été réécrit. N'échoue jamais.
 */
export function appliquerExclusions(dossier: string, motifs: string[], globs: string[] = []): { concerne: boolean; modifie: boolean } {
  try {
    const chemin = join(dossier, 'manifest.json')
    const manifest = lireJsonTolerant(readFileSync(chemin, 'utf8')) as Json
    const scripts = manifest.content_scripts
    if (!Array.isArray(scripts) || scripts.length === 0) return { concerne: false, modifie: false }
    const cheminOrigine = join(dossier, SIDECAR_EXCLUSIONS)
    let origine: Origine[] | undefined
    try {
      const lu = JSON.parse(readFileSync(cheminOrigine, 'utf8')) as unknown
      // Ancien format : tableau de listes (exclude_matches seulement) ou null.
      if (Array.isArray(lu) && lu.length === scripts.length) {
        origine = lu.map((x) => (x !== null && typeof x === 'object' && !Array.isArray(x) ? { m: liste((x as Json).m), g: liste((x as Json).g) } : { m: liste(x), g: null }))
      }
    } catch {
      /* pas de sauvegarde : le manifest courant est celui d'origine */
    }
    if (!origine) {
      if (motifs.length === 0 && globs.length === 0) return { concerne: true, modifie: false }
      origine = scripts.map((s) => ({ m: liste((s as Json)?.exclude_matches), g: liste((s as Json)?.exclude_globs) }))
      writeFileSync(cheminOrigine, JSON.stringify(origine))
    }
    let modifie = false
    const poser = (cs: Json, cle: string, base: string[] | null, ajout: string[]): void => {
      const voulu = base === null && ajout.length === 0 ? undefined : [...new Set([...(base ?? []), ...ajout])]
      const actuel = Array.isArray(cs[cle]) ? tableau(cs[cle]) : undefined
      if (JSON.stringify(voulu) === JSON.stringify(actuel)) return
      if (voulu === undefined) delete cs[cle]
      else cs[cle] = voulu
      modifie = true
    }
    scripts.forEach((s, i) => {
      const cs = s as Json
      poser(cs, 'exclude_matches', origine![i].m, motifs)
      poser(cs, 'exclude_globs', origine![i].g, globs)
    })
    if (modifie) writeFileSync(chemin, JSON.stringify(manifest, null, 2))
    return { concerne: true, modifie }
  } catch {
    return { concerne: false, modifie: false }
  }
}

export interface DepsSynchroSites {
  sites: () => Record<string, RegleSite>
  /** Abonnement aux changements de réglages ; rend le désabonnement. */
  surChangement: (cb: (s: { sites: Record<string, RegleSite> }) => void) => () => void
  /** Identifiants des extensions actuellement chargées. */
  chargees: () => string[]
  /** Retire puis recharge l'extension (sous son verrou) ; `preparer` est rappelé par le chargeur. */
  recharger: (id: string) => Promise<unknown>
}

/** Applique les règles au chargement (`preparer`) et recharge les extensions dont l'ensemble de motifs a changé. */
export function creerSynchroSites(d: DepsSynchroSites) {
  /** id → motifs appliqués au dernier chargement (`null` : aucun content script, rien à recharger jamais). */
  const appliques = new Map<string, string | null>()
  let precedent = d.sites()
  const enCours = new Set<string>()
  const refaire = new Set<string>()
  /** Recharge si l'ensemble de motifs courant diffère de celui appliqué ; un seul rechargement à la fois par extension. */
  const verifier = async (id: string): Promise<void> => {
    const signature = appliques.get(id)
    if (signature === undefined || signature === null) return
    if (JSON.stringify(exclusionsSites(d.sites(), id)) === signature) return
    if (enCours.has(id)) {
      refaire.add(id)
      return
    }
    enCours.add(id)
    try {
      await d.recharger(id)
    } catch (err) {
      console.warn('[extensions] rechargement après règle de site :', err)
    } finally {
      enCours.delete(id)
    }
    if (refaire.delete(id)) await verifier(id)
  }
  const desabonner = d.surChangement((s) => {
    if (s.sites === precedent) return
    precedent = s.sites
    for (const id of d.chargees()) void verifier(id)
  })
  return {
    desabonner,
    /** À appeler avant `loadExtension` : écrit les exclusions dans la copie chargée. */
    preparer(id: string, dossier: string): void {
      const ex = exclusionsSites(d.sites(), id)
      const r = appliquerExclusions(dossier, ex.matches, ex.globs)
      appliques.set(id, r.concerne ? JSON.stringify(ex) : null)
    },
    /** Retour sans exclusions (nouvel essai après un échec de chargement) ; le prochain `preparer` les réapplique. */
    sansExclusions(id: string, dossier: string): void {
      appliquerExclusions(dossier, [], [])
      appliques.delete(id)
    }
  }
}
