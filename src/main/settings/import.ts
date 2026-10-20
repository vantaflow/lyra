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
  // Comme le dossier de téléchargement : un fichier partagé ne désigne pas la passerelle d'autrui.
  if (patch.reseau?.personnelle !== undefined) {
    delete patch.reseau.personnelle
    if (Object.keys(patch.reseau).length === 0) delete patch.reseau
  }
  // Usage local : la file d'import et les extensions installées ne voyagent pas d'un profil à l'autre.
  delete (patch as Record<string, unknown>).import
  const extensions = (patch as { extensions?: Record<string, unknown> }).extensions
  if (extensions && 'installees' in extensions) {
    delete extensions.installees
    if (Object.keys(extensions).length === 0) delete (patch as Record<string, unknown>).extensions
  }
  return patch as Partial<Settings>
}

/** Réglages tels qu'écrits dans un export JSON : sans `import` ni `extensions.installees` (usage local). */
export function reglagesExportables(s: Settings): Record<string, unknown> {
  const { import: _import, ...reste } = s as Settings & Record<string, unknown>
  const extensions = reste.extensions
  if (typeof extensions === 'object' && extensions !== null && !Array.isArray(extensions)) {
    const { installees: _installees, ...sans } = extensions as Record<string, unknown>
    reste.extensions = sans
  }
  return reste
}
