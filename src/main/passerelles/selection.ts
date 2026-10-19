import { memeCandidat, type Candidat } from './liste'

export interface ResultatTest {
  candidat: Candidat
  ok: boolean
  ms: number
}

/** Les n candidats ayant réussi, du plus rapide au plus lent. */
export function meilleures(resultats: readonly ResultatTest[], n = 5): Candidat[] {
  return resultats
    .filter((r) => r.ok)
    .sort((a, b) => a.ms - b.ms)
    .slice(0, n)
    .map((r) => r.candidat)
}

/** Pool sans le candidat (rotation) ; ne modifie pas l'original. */
export function ecarter(pool: readonly Candidat[], candidat: Candidat): Candidat[] {
  return pool.filter((c) => !memeCandidat(c, candidat))
}
