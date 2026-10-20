/**
 * Canaux `export:*` et `import:fichier` (jalon E, Task 4) : page `lyra://settings` seulement, jamais une fenêtre
 * privée. La logique vit dans `operations.ts` et `sauvegardeAuto.ts` (sans Electron) ; ici, le contrôle de
 * l'expéditeur et les boîtes de dialogue natives. Sous LYRA_TEST=1 le chemin vient de la demande (aucune fenêtre).
 */
import { app, dialog, type WebContents } from 'electron'
import { isAbsolute } from 'node:path'
import { handle } from '../ipc'
import type { CiblesImport } from '../import/appliquer'
import { estPageReglages } from '../import/importeur'
import { PHRASE_MIN } from '../../shared/exportTextes'
import { ErreurPaquet, verifierPhrase } from './chiffrement'
import { exporterCiel, exporterFavoris, exporterHistorique, exporterPaquet, exporterReglages, importerFichier, type DepsOperations } from './operations'
import type { SauvegardeAuto } from './sauvegardeAuto'
import type { CodeErreurExport, DemandeExportFichier, ReponseSauvegardeAuto, ResultatExport } from './types'

export interface DepsExportIpc {
  estPrivee(wc: WebContents): boolean
  /** Magasins et ciel de la fenêtre normale liée à la page de réglages. */
  operations(wc: WebContents): DepsOperations
  cibles(wc: WebContents): CiblesImport
  sauvegarde: SauvegardeAuto
}

/** Chemins pris dans la demande : jamais dans une application empaquetée. */
const enTest = (): boolean => process.env.LYRA_TEST === '1' && !app.isPackaged
const OPTIONS_IMPORT = { fenetre: 'courante' as const, ouvrirMaintenant: false, moteurParDefaut: false, extensionsChoisies: [] }

type Filtres = Array<{ name: string; extensions: string[] }>

/** Chemin choisi par l'utilisateur ; sous LYRA_TEST=1, celui de la demande (absolu). `null` : annulé. */
async function choisirChemin(mode: 'enregistrer' | 'ouvrir', d: { chemin?: unknown } | undefined, nomParDefaut: string, filtres: Filtres): Promise<string | null> {
  if (enTest()) {
    // Le test fournit le chemin dans la demande, ou (page pilotée par clics) par une file posée côté main.
    const file = (globalThis as { __lyraCheminsTest?: string[] }).__lyraCheminsTest
    const chemin = typeof d?.chemin === 'string' ? d.chemin : file?.shift()
    return typeof chemin === 'string' && isAbsolute(chemin) ? chemin : null
  }
  if (mode === 'enregistrer') {
    const r = await dialog.showSaveDialog({ defaultPath: nomParDefaut, filters: filtres })
    return r.canceled || !r.filePath ? null : r.filePath
  }
  const r = await dialog.showOpenDialog({ filters: filtres, properties: ['openFile'] })
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
}

const JSON_F: Filtres = [{ name: 'JSON', extensions: ['json'] }]
const HTML_F: Filtres = [{ name: 'Favoris (HTML)', extensions: ['html', 'htm'] }]
const CSV_F: Filtres = [{ name: 'CSV', extensions: ['csv'] }]
const LYRA_F: Filtres = [{ name: 'Paquet Lyra', extensions: ['lyra'] }]
const FILTRES_IMPORT = { favoris: HTML_F, historique: CSV_F, ciel: JSON_F, reglages: JSON_F, paquet: LYRA_F } as const
const phraseTropCourte = (phrase: unknown): boolean => {
  try {
    verifierPhrase(typeof phrase === 'string' ? phrase : '')
    return false
  } catch {
    return true
  }
}
const MESSAGE_PHRASE_COURTE = `La phrase de passe doit contenir au moins ${PHRASE_MIN} caractères.`
const jour = (): string => new Date().toISOString().slice(0, 10)

export function installerExportIpc(deps: DepsExportIpc): void {
  const controle = (e: { senderFrame?: { url: string; parent?: unknown } | null; sender: WebContents }, canal: string): void => {
    const url = e.senderFrame?.url ?? ''
    if (!estPageReglages(url) || e.senderFrame?.parent) throw new Error(`IPC refusé pour ${canal} depuis ${url}`)
    if (deps.estPrivee(e.sender)) throw new Error(`IPC refusé pour ${canal} depuis une fenêtre privée`)
  }
  let occupe = false
  const exclusif = async <T>(refus: T, tache: () => Promise<T>): Promise<T> => {
    if (occupe) return refus
    occupe = true
    try {
      return await tache()
    } finally {
      occupe = false
    }
  }
  const echecExport = (e: unknown): ResultatExport => ({
    ok: false,
    erreur: e instanceof ErreurPaquet && e.code === 'phrase-courte' ? 'phrase-courte' : ('ecriture' as CodeErreurExport),
    message: e instanceof ErreurPaquet ? e.message : 'Impossible d’écrire le fichier.'
  })
  const exporter = async (canal: string, e: Parameters<typeof controle>[0], d: DemandeExportFichier | undefined, nom: string, filtres: Filtres, ecrire: (chemin: string, ops: DepsOperations) => Promise<{ compte: number }>): Promise<ResultatExport> => {
    controle(e, canal)
    return exclusif<ResultatExport>({ ok: false, erreur: 'en-cours' }, async () => {
      const chemin = await choisirChemin('enregistrer', d, nom, filtres)
      if (!chemin) return { ok: false, erreur: 'annule' }
      try {
        return { ok: true, chemin, compte: (await ecrire(chemin, deps.operations(e.sender))).compte }
      } catch (err) {
        return echecExport(err)
      }
    })
  }

  handle('export:favoris', (d, e) => exporter('export:favoris', e, d, `favoris-lyra-${jour()}.html`, HTML_F, exporterFavoris))
  handle('export:historique', (d, e) => exporter('export:historique', e, d, `historique-lyra-${jour()}.csv`, CSV_F, (c, o) => exporterHistorique(c, o)))
  handle('export:ciel', (d, e) => exporter('export:ciel', e, d, `ciel-lyra-${jour()}.json`, JSON_F, exporterCiel))
  handle('export:reglages', (d, e) => exporter('export:reglages', e, d, 'reglages-lyra.json', JSON_F, exporterReglages))
  handle('export:paquet', (d, e) => {
    controle(e, 'export:paquet')
    // La phrase est vérifiée avant toute boîte de dialogue.
    if (phraseTropCourte(d?.phrase)) return { ok: false, erreur: 'phrase-courte', message: MESSAGE_PHRASE_COURTE } as ResultatExport
    return exporter('export:paquet', e, d, `sauvegarde-lyra-${jour()}.lyra`, LYRA_F, (c, o) => exporterPaquet(c, o, { phrase: d.phrase, cookies: d.cookies === true }))
  })

  handle('export:sauvegardeEtat', (_d, e) => {
    controle(e, 'export:sauvegardeEtat')
    return deps.sauvegarde.etat()
  })
  handle('export:sauvegardeAuto', async (d, e): Promise<ReponseSauvegardeAuto> => {
    controle(e, 'export:sauvegardeAuto')
    if (d?.activer !== true) {
      deps.sauvegarde.desactiver()
      return { ok: true, etat: deps.sauvegarde.etat() }
    }
    if (phraseTropCourte(d.phrase)) return { ok: false, erreur: 'phrase-courte', message: MESSAGE_PHRASE_COURTE }
    let dossier: string | undefined
    if (enTest()) dossier = typeof d.dossier === 'string' && isAbsolute(d.dossier) ? d.dossier : undefined
    else {
      const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
      dossier = r.canceled || r.filePaths.length === 0 ? undefined : r.filePaths[0]
    }
    if (!dossier) return { ok: false, erreur: 'annule', message: 'Aucun dossier choisi.' }
    try {
      return { ok: true, etat: await deps.sauvegarde.activer(dossier, d.phrase as string) }
    } catch (err) {
      const indisponible = err instanceof ErreurPaquet
      return { ok: false, erreur: indisponible ? 'indisponible' : 'dossier', message: indisponible ? err.message : 'Ce dossier n’est pas utilisable.' }
    }
  })

  handle('import:fichier', async (d, e) => {
    // Comme `import:lancer` : une fenêtre privée reçoit un refus typé, rien n'est lu ni écrit.
    if (!estPageReglages(e.senderFrame?.url ?? '') || e.senderFrame?.parent) throw new Error(`IPC refusé pour import:fichier depuis ${e.senderFrame?.url ?? ''}`)
    if (deps.estPrivee(e.sender)) return { ok: false, erreur: 'prive', message: 'Importer un fichier est impossible depuis une fenêtre privée.' }
    const type = d?.type
    if (type !== 'favoris' && type !== 'historique' && type !== 'ciel' && type !== 'reglages' && type !== 'paquet') return { ok: false, erreur: 'invalide', message: 'Type de fichier inconnu.' }
    return exclusif<Awaited<ReturnType<typeof importerFichier>>>({ ok: false, erreur: 'en-cours', message: 'Un import ou un export est déjà en cours.' }, async () => {
      const chemin = await choisirChemin('ouvrir', d, '', [...FILTRES_IMPORT[type]])
      if (!chemin) return { ok: false, erreur: 'annule', message: 'Aucun fichier choisi.' }
      return importerFichier({ type, chemin, phrase: typeof d.phrase === 'string' ? d.phrase : undefined, cookies: d.cookies === true }, deps.cibles(e.sender), deps.operations(e.sender), OPTIONS_IMPORT)
    })
  })
}
