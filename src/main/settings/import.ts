import { existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Settings } from '../../shared/types'
import { validerPatch } from './validate'

const repertoireExistant = (chemin: string): boolean => {
  try {
    return existsSync(chemin) && statSync(chemin).isDirectory()
  } catch {
    return false
  }
}

/**
 * Patch issu d'un JSON importé : champs validés, et `telechargements.dossier` ignoré
 * sauf si c'est un chemin absolu vers un répertoire existant (un fichier partagé ne redirige pas les téléchargements).
 */
export function patchImporte(brut: unknown, estRepertoire: (chemin: string) => boolean = repertoireExistant): Partial<Settings> {
  const patch = validerPatch(brut)
  const dossier = patch.telechargements?.dossier
  if (dossier !== undefined && !(isAbsolute(dossier) && estRepertoire(dossier))) {
    delete patch.telechargements!.dossier
    if (Object.keys(patch.telechargements!).length === 0) delete patch.telechargements
  }
  return patch as Partial<Settings>
}
