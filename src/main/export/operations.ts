/**
 * Export et import de fichiers (jalon E, Task 4), sans Electron : les magasins sont injectés. Le contrôle de
 * l'expéditeur et les boîtes de dialogue vivent dans `ipc.ts`. Un import de fichier passe par `appliquer()` :
 * même déduplication, mêmes garde-fous que l'import depuis un navigateur.
 */
import { createReadStream, statSync } from 'node:fs'
import { open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import type { Settings, SkyState } from '../../shared/types'
import type { Favori } from '../bookmarks/Bookmarks'
import { appliquer, type CiblesImport } from '../import/appliquer'
import type { OptionsApplication, Visite } from '../import/types'
import { patchImporte, reglagesExportables } from '../settings/import'
import { ErreurPaquet } from './chiffrement'
import { cielDepuisJson, cielVersFichier, cielVersOnglets } from './ciel'
import type { AccesCookies } from './cookies'
import { ENTETE_CSV, TAILLE_LOT_CSV, ligneCsv, lotsDepuisCsv } from './csv'
import { arbreDepuisFavoris, exporterFavorisHtml, lireFavorisHtml } from './netscape'
import { creerPaquet, lirePaquet } from './paquet'
import type { CodeErreurImportFichier, DemandeImportFichier, ReponseImportFichier } from './types'

export interface DepsOperations {
  version: string
  favoris: { lister(): Favori[] }
  historique: { pages(): Iterable<{ url: string; titre: string; date: number; visites: number }>; visites(): Iterable<{ url: string; titre: string; date: number }> }
  reglages: { getSettings(): Settings }
  /** Ciel de la fenêtre normale qui demande l'export ; `undefined` si aucune. */
  ciel(): SkyState | undefined
  /** Ciels de TOUTES les fenêtres normales (jamais les privées), pour le paquet. */
  ciels(): SkyState[]
  cookies: AccesCookies
}

export interface OptionsExport {
  /** Pause entre deux lots (par défaut : un tour de boucle d'évènements). Injectable pour les tests. */
  pause?: () => Promise<void>
}

const pauseParDefaut = (): Promise<void> => new Promise((r) => setImmediate(r))

/** Fichier CSV d'historique : au-delà, refusé (la lecture est en flux, mais un fichier démesuré n'est pas un export de Lyra). */
export const TAILLE_MAX_CSV = 256 * 1024 * 1024

const TAILLE_MAX = { favoris: 64 * 1024 * 1024, ciel: 32 * 1024 * 1024, reglages: 1_000_000, paquet: 1024 * 1024 * 1024 } as const

/** Écriture atomique : le fichier d'arrivée n'existe jamais à moitié écrit. */
async function ecrireAtomique(chemin: string, donnees: string | Uint8Array, mode?: number): Promise<void> {
  const tmp = `${chemin}.tmp`
  try {
    await writeFile(tmp, donnees, mode === undefined ? undefined : { mode })
    await rename(tmp, chemin)
  } catch (e) {
    await rm(tmp, { force: true })
    throw e
  }
}

// --- Exports ---------------------------------------------------------------------------------------------------------

export async function exporterFavoris(chemin: string, deps: DepsOperations): Promise<{ compte: number }> {
  const favoris = deps.favoris.lister()
  await ecrireAtomique(chemin, exporterFavorisHtml(favoris))
  return { compte: favoris.length }
}

export async function exporterHistorique(chemin: string, deps: DepsOperations, opts: OptionsExport = {}): Promise<{ compte: number }> {
  const pause = opts.pause ?? pauseParDefaut
  const tmp = `${chemin}.tmp`
  let compte = 0
  const fichier = await open(tmp, 'w')
  try {
    await fichier.write(`${ENTETE_CSV}\r\n`)
    let lot: string[] = []
    for (const p of deps.historique.pages()) {
      lot.push(ligneCsv(p))
      compte++
      if (lot.length >= TAILLE_LOT_CSV) {
        await fichier.write(`${lot.join('\r\n')}\r\n`)
        lot = []
        await pause()
      }
    }
    if (lot.length) await fichier.write(`${lot.join('\r\n')}\r\n`)
    await fichier.close()
    await rename(tmp, chemin)
  } catch (e) {
    await fichier.close().catch(() => undefined)
    await rm(tmp, { force: true })
    throw e
  }
  return { compte }
}

export async function exporterCiel(chemin: string, deps: DepsOperations): Promise<{ compte: number }> {
  const ciel = deps.ciel() ?? { stars: [], constellations: [], activeId: null, pinned: [] }
  const fichier = cielVersFichier(ciel)
  await ecrireAtomique(chemin, JSON.stringify(fichier, null, 2))
  return { compte: fichier.etoiles.length }
}

/** Le même JSON que « Exporter les réglages » (`settings:export`). */
export async function exporterReglages(chemin: string, deps: DepsOperations): Promise<{ compte: number }> {
  await ecrireAtomique(chemin, JSON.stringify(reglagesExportables(deps.reglages.getSettings()), null, 2))
  return { compte: 1 }
}

export async function exporterPaquet(chemin: string, deps: DepsOperations, o: { phrase: string; cookies?: boolean }, opts: OptionsExport = {}): Promise<{ compte: number }> {
  const favoris = deps.favoris.lister()
  const ciels = deps.ciels()
  let visites = 0
  const paquet = await creerPaquet(
    {
      version: deps.version,
      reglages: deps.reglages.getSettings(),
      favoris,
      ciels,
      visites: function* () {
        for (const v of deps.historique.visites()) {
          visites++
          yield v
        }
      },
      // Seulement si l'utilisateur l'a demandé, et seulement la partition persistante de Lyra (voir `cookies.ts`).
      ...(o.cookies === true ? { cookies: await deps.cookies.lire() } : {})
    },
    o.phrase,
    opts
  )
  await ecrireAtomique(chemin, paquet, 0o600)
  return { compte: favoris.length + ciels.reduce((n, c) => n + cielVersFichier(c).etoiles.length, 0) + visites }
}

// --- Import ----------------------------------------------------------------------------------------------------------

const echec = (erreur: CodeErreurImportFichier, message: string): ReponseImportFichier => ({ ok: false, erreur, message })

function verifierTaille(chemin: string, max: number): ReponseImportFichier | undefined {
  try {
    const s = statSync(chemin)
    if (!s.isFile()) return echec('illisible', 'Ce n’est pas un fichier.')
    if (s.size > max) return echec('volumineux', 'Ce fichier est trop volumineux pour être importé.')
  } catch {
    return echec('illisible', 'Impossible de lire ce fichier.')
  }
  return undefined
}

async function* morceauxTexte(chemin: string): AsyncGenerator<string> {
  const flux = createReadStream(chemin, { encoding: 'utf8', highWaterMark: 1024 * 1024 })
  for await (const m of flux) yield m as string
}

const erreurPaquet = (e: unknown): ReponseImportFichier => {
  if (e instanceof ErreurPaquet) return echec(e.code === 'phrase' ? 'phrase' : e.code === 'phrase-courte' ? 'phrase-courte' : e.code === 'version' ? 'version' : e.code === 'volumineux' ? 'volumineux' : 'format', e.message)
  return echec('illisible', 'Impossible de lire ce fichier.')
}

export async function importerFichier(d: DemandeImportFichier, cibles: CiblesImport, deps: DepsOperations, options: OptionsApplication): Promise<ReponseImportFichier> {
  const base = { source: 'lyra' as const, profil: 'fichier' }
  const sortie = (resultat: Awaited<ReturnType<typeof appliquer>>, extra: { reglages?: boolean; cookies?: number; avertissements?: string[] } = {}): ReponseImportFichier => ({
    ok: true,
    resultat,
    reglages: extra.reglages === true,
    cookies: extra.cookies ?? 0,
    avertissements: extra.avertissements ?? []
  })
  try {
    switch (d.type) {
      case 'favoris': {
        const refus = verifierTaille(d.chemin!, TAILLE_MAX.favoris)
        if (refus) return refus
        const arbre = lireFavorisHtml(await readFile(d.chemin!, 'utf8'))
        if (arbre.autres.length === 0) return echec('invalide', 'Aucun favori trouvé dans ce fichier.')
        return sortie(await appliquer({ ...base, donnees: { favoris: arbre } }, cibles, options))
      }
      case 'historique': {
        const refus = verifierTaille(d.chemin!, TAILLE_MAX_CSV)
        if (refus) return refus
        let ignorees = 0
        const resultat = await appliquer({ ...base, donnees: { historique: lotsDepuisCsv(morceauxTexte(d.chemin!), () => ignorees++) } }, cibles, options)
        return sortie(resultat, { avertissements: ignorees ? [`${ignorees} ligne(s) trop longue(s) ignorée(s).`] : [] })
      }
      case 'ciel': {
        const refus = verifierTaille(d.chemin!, TAILLE_MAX.ciel)
        if (refus) return refus
        let ciel
        try {
          ciel = cielDepuisJson(await readFile(d.chemin!, 'utf8'))
        } catch (e) {
          return echec('invalide', e instanceof SyntaxError ? 'Ce fichier n’est pas un ciel exporté par Lyra.' : (e as Error).message)
        }
        return sortie(await appliquer({ ...base, donnees: { onglets: cielVersOnglets(ciel) } }, cibles, options))
      }
      case 'reglages': {
        const refus = verifierTaille(d.chemin!, TAILLE_MAX.reglages)
        if (refus) return refus
        let patch: Partial<Settings>
        try {
          patch = patchImporte(JSON.parse(await readFile(d.chemin!, 'utf8')))
        } catch {
          return echec('illisible', 'Ce fichier n’est pas un fichier de réglages valide.')
        }
        delete patch.import
        cibles.reglages.set(patch)
        return sortie(await appliquer({ ...base, donnees: {} }, cibles, options), { reglages: true })
      }
      case 'paquet': {
        const refus = verifierTaille(d.chemin!, TAILLE_MAX.paquet)
        if (refus) return refus
        // Tout est déchiffré, décompressé et validé avant la moindre écriture : un échec ne laisse aucune trace.
        const contenu = await lirePaquet(new Uint8Array(await readFile(d.chemin!)), d.phrase ?? '')
        const avertissements = [...contenu.avertissements]
        const donnees = {
          favoris: arbreDepuisFavoris(contenu.favoris),
          historique: contenu.visites as AsyncIterable<Visite[]>,
          extensions: contenu.extensions,
          ...(contenu.ciel ? { onglets: cielVersOnglets(contenu.ciel) } : {})
        }
        // Une fenêtre Lyra par fenêtre sauvegardée (étoiles endormies) ; une seule : la fenêtre courante.
        const parFenetre = (contenu.ciel?.fenetres?.length ?? 0) > 1
        const resultat = await appliquer({ ...base, profil: 'paquet', donnees }, cibles, parFenetre ? { ...options, fenetre: 'nouvelle-par-fenetre' } : options)
        let reglages = false
        const patch = patchImporte(contenu.reglages)
        delete patch.import
        if (Object.keys(patch).length > 0) {
          cibles.reglages.set(patch)
          reglages = true
        }
        let cookies = 0
        if (d.cookies === true) {
          if (!contenu.cookies) avertissements.push('Ce paquet ne contient pas de cookies : aucun n’a été restauré.')
          else for (const c of contenu.cookies) if (await deps.cookies.ecrire(c)) cookies++
        }
        return sortie(resultat, { reglages, cookies, avertissements })
      }
    }
  } catch (e) {
    return erreurPaquet(e)
  }
}
