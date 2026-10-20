// Import et export de « Mes couleurs » (JSON `{ nom, couleurs }`) : logique sans Electron, les dialogues sont dans `ipc.ts`.
import { exporterTheme, validerTheme } from '../../shared/themes'
import { COULEURS_INDIGO_NUIT, type CouleursTheme } from '../../shared/types-reglages'

export interface EcritureReglages {
  setSettings(patch: unknown): unknown
}

/** Valide le texte d'un fichier de thème ; s'il est valide, il devient « Mes couleurs », le thème actif et la référence de « modifié ». */
export function importerTheme(brut: string, reglages: EcritureReglages): { nom: string } | { erreur: string } {
  const r = validerTheme(brut)
  if ('erreur' in r) return r
  reglages.setSettings({ couleurs: { actif: 'mes-couleurs', personnalisees: r.couleurs, reference: r.couleurs } })
  return { nom: r.nom }
}

/** Contenu du fichier exporté : « Mes couleurs » (Indigo nuit tant qu'aucune couleur n'est personnalisée). */
export function contenuExport(personnalisees: CouleursTheme | null): string {
  return exporterTheme('Mes couleurs', personnalisees ?? COULEURS_INDIGO_NUIT)
}
