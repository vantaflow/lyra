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
 * Registre des extensions et date de vérification : écrits par le processus principal seul (installateurs, mises à jour).
 * Une page ou un fichier de réglages ne peut pas y inscrire d'extension (dossier, source, état actif).
 */
function retirerRegistreExtensions<T extends { extensions?: Record<string, unknown>; import?: unknown }>(patch: T): T {
  // La file d'import (extensions et réglages en attente) est écrite par le processus principal et l'importeur seuls :
  // jamais par une page (`settings:set`) ni par un fichier de réglages importé.
  delete patch.import
  if (patch.extensions === undefined) return patch
  delete patch.extensions.installees
  delete patch.extensions.derniereVerification
  if (Object.keys(patch.extensions).length === 0) delete patch.extensions
  return patch
}

/**
 * Patch reçu d'une page (`settings:set`) : validé, sans le registre des extensions ni la file d'import.
 * En fenêtre privée, les règles par site sont refusées (comme le zoom et les permissions, qui n'y sont pas mémorisés).
 */
export function patchPage(brut: unknown, opts: { privee?: boolean } = {}): Partial<Settings> {
  const patch = retirerRegistreExtensions(validerPatch(brut)) as Partial<Settings>
  if (opts.privee) delete patch.sites
  return patch
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
  return retirerRegistreExtensions(patch) as Partial<Settings>
}
