import { existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Settings } from '../../shared/types'
import { validerPatch } from './validate'

/** Taille maximale d'un fichier de réglages, à l'import comme à l'export (16 Mo). */
export const TAILLE_MAX_IMPORT = 16 * 1024 * 1024

export class ErreurReglagesVolumineux extends Error {}

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
  desactiverScriptsImportes(patch)
  return retirerRegistreExtensions(patch) as Partial<Settings>
}

/**
 * Un script personnalisé qui vient d'un fichier partagé ne s'exécute jamais sans que l'utilisateur l'ait relu et activé :
 * `actif: false` forcé sur `styles.scripts` et sur les `scriptsPerso` de chaque règle de site importée.
 */
function desactiverScriptsImportes(patch: Partial<Settings>): void {
  const coupe = (l: unknown): void => {
    if (Array.isArray(l)) for (const sc of l) if (sc && typeof sc === 'object') (sc as { actif: boolean }).actif = false
  }
  coupe(patch.styles?.scripts)
  for (const regle of Object.values(patch.sites ?? {})) coupe(regle?.scriptsPerso)
}

/** Réglages tels qu'écrits dans un export JSON : sans `import` ni `extensions.installees` (usage local). */
export function reglagesExportables(s: Settings): Record<string, unknown> {
  const { import: _import, ...reste } = s as unknown as Record<string, unknown>
  const extensions = reste.extensions
  if (typeof extensions === 'object' && extensions !== null && !Array.isArray(extensions)) {
    const { installees: _installees, ...sans } = extensions as Record<string, unknown>
    reste.extensions = sans
  }
  return reste
}

/** JSON d'export ; refuse au-delà de `TAILLE_MAX_IMPORT` (il ne serait plus réimportable). */
export function serialiserReglages(s: Settings): string {
  const json = JSON.stringify(reglagesExportables(s), null, 2)
  const octets = Buffer.byteLength(json, 'utf8')
  if (octets > TAILLE_MAX_IMPORT) {
    const mo = (octets / (1024 * 1024)).toFixed(1)
    throw new ErreurReglagesVolumineux(`Réglages trop volumineux pour être exportés (${mo} Mo, maximum ${TAILLE_MAX_IMPORT / (1024 * 1024)} Mo).`)
  }
  return json
}
