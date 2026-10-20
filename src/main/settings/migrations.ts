/** Migration du fichier de réglages vers le schéma courant (v2). Idempotente : migrer(migrer(x)) = migrer(x). */
import type { Settings } from '../../shared/types'
import { reglagesParDefaut } from './defaults'
import { fusion } from './store'
import { clesRejetees, inconnus, largeurRamenee, validerPatch } from './validate'
import { estObjet } from './validate-d'

export const VERSION_COURANTE = 2

export interface ResultatMigration {
  settings: Settings
  avertissements: string[]
}

/**
 * Brut (fichier relu) → réglages complets : défauts + champs valides, `version: 2`.
 * 1 → 2 : les blocs absents prennent leurs défauts, `theme` et `boucliers` booléen sont inchangés.
 * Les réglages inconnus (venus d'un jalon ou d'une version plus récente) sont conservés tels quels
 * mais ne font pas partie de `Settings` typé. Un fichier illisible donne les défauts et un avertissement.
 * `defauts` fournit les valeurs propres à la machine (dossier de téléchargements).
 */
export function migrer(brut: unknown, defauts: Settings = reglagesParDefaut('')): ResultatMigration {
  if (!estObjet(brut)) return { settings: defauts, avertissements: ['Fichier de réglages illisible : valeurs par défaut utilisées.'] }
  const avertissements: string[] = []
  if (typeof brut.version === 'number' && brut.version > VERSION_COURANTE) {
    avertissements.push(`Réglages écrits par une version plus récente (${brut.version}) : les champs inconnus sont conservés.`)
  }
  const valide = validerPatch(largeurRamenee(brut)) as Record<string, unknown>
  for (const cle of clesRejetees(brut, valide)) avertissements.push(`Réglage invalide ignoré : ${cle}`)
  const base = fusion(defauts, valide)
  const settings = fusion(fusion<Record<string, unknown>>(inconnus(brut), base), { version: VERSION_COURANTE }) as unknown as Settings
  return { settings, avertissements }
}
