/**
 * Règle par site des extensions (`settings.sites[clé].extensions[id] === false`) appliquée aux content scripts du manifest :
 * les sites bloqués sont ajoutés aux `exclude_matches` de chaque script, dans la copie chargée de l'extension (jamais dans
 * l'archive d'origine). Les `exclude_matches` d'origine sont gardés à part (`lyra-exclusions.json`) : réapplication idempotente
 * et réversible. Un changement de règle recharge l'extension concernée (voir `creerSynchroSites`).
 * Limites : un site autorisé explicitement sous un blocage plus large (`*.d` bloqué, `www.d` autorisé) reste bloqué pour ces scripts
 * (un motif de correspondance ne peut pas exprimer d'exception) ; `*.d` couvre aussi `d` (comportement des motifs Chrome).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RegleSite } from '../../shared/types'
import { cleDe } from '../settings/sites'

export const SIDECAR_EXCLUSIONS = 'lyra-exclusions.json'

/** Motifs de correspondance (`exclude_matches`) des sites où l'extension est bloquée, triés et sans doublon. */
export function motifsExclusion(sites: Record<string, RegleSite>, id: string): string[] {
  const motifs = new Set<string>()
  for (const [cle, regle] of Object.entries(sites ?? {})) {
    if (regle?.extensions?.[id] !== false) continue
    const c = cleDe(cle)
    if (!c) continue
    if (c.type === 'origine') motifs.add(c.valeur === 'file://' ? 'file:///*' : `${c.valeur}/*`)
    else if (c.type === 'hote') motifs.add(`*://${c.valeur}/*`)
    else motifs.add(`*://*.${c.valeur}/*`)
  }
  return [...motifs].sort()
}

type Json = Record<string, unknown>
const tableau = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/**
 * Réécrit `exclude_matches` des content scripts de `<dossier>/manifest.json` : exclusions d'origine + `motifs`.
 * `concerne` : le manifest déclare des content scripts. `modifie` : le fichier a été réécrit. N'échoue jamais.
 */
export function appliquerExclusions(dossier: string, motifs: string[]): { concerne: boolean; modifie: boolean } {
  try {
    const chemin = join(dossier, 'manifest.json')
    const manifest = JSON.parse(readFileSync(chemin, 'utf8')) as Json
    const scripts = manifest.content_scripts
    if (!Array.isArray(scripts) || scripts.length === 0) return { concerne: false, modifie: false }
    const cheminOrigine = join(dossier, SIDECAR_EXCLUSIONS)
    let origine: Array<string[] | null> | undefined
    try {
      const lu = JSON.parse(readFileSync(cheminOrigine, 'utf8')) as unknown
      if (Array.isArray(lu) && lu.length === scripts.length) origine = lu.map((x) => (x === null ? null : tableau(x)))
    } catch {
      /* pas de sauvegarde : le manifest courant est celui d'origine */
    }
    if (!origine) {
      if (motifs.length === 0) return { concerne: true, modifie: false }
      origine = scripts.map((s) => (Array.isArray((s as Json)?.exclude_matches) ? tableau((s as Json).exclude_matches) : null))
      writeFileSync(cheminOrigine, JSON.stringify(origine))
    }
    let modifie = false
    scripts.forEach((s, i) => {
      const cs = s as Json
      const base = origine![i]
      const voulu = base === null && motifs.length === 0 ? undefined : [...new Set([...(base ?? []), ...motifs])]
      const actuel = Array.isArray(cs.exclude_matches) ? tableau(cs.exclude_matches) : undefined
      if (JSON.stringify(voulu) === JSON.stringify(actuel)) return
      if (voulu === undefined) delete cs.exclude_matches
      else cs.exclude_matches = voulu
      modifie = true
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
    if (JSON.stringify(motifsExclusion(d.sites(), id)) === signature) return
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
      const motifs = motifsExclusion(d.sites(), id)
      const r = appliquerExclusions(dossier, motifs)
      appliques.set(id, r.concerne ? JSON.stringify(motifs) : null)
    }
  }
}
