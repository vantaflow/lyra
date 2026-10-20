/**
 * File d'import (jalon E) : réinstalle, en série, les extensions repérées dans un autre navigateur.
 * Sans Electron : les installateurs sont injectés. `EntreeFileExtensions` est structurellement compatible avec
 * `ExtensionEnAttente` du jalon E (`settings.import.extensionsEnAttente`) : la fusion n'ajoute qu'un branchement.
 *
 * Règles : une extension « imposée » (par une règle d'entreprise du navigateur d'origine) n'est jamais installée sans choix
 * explicite de l'utilisateur ; l'import Firefox est strict (slug ou identifiant AMO, jamais de recherche) ; l'appelant réécrit
 * la file entière avec `restantes` (`setSettings` remplace les tableaux).
 */
import type { EntreeFileExtensions, EtatEntreeFile, ResultatEntreeFile, ResultatFile } from '../../shared/types'
import { installerFile, installerParId, type InstallateursParId, type Progression } from './file'

export type { EntreeFileExtensions, ResultatEntreeFile, ResultatFile }

/** Clé d'une entrée de la file (magasin et identifiant) : celle des confirmations, une même id pouvant exister dans deux magasins. */
export const cleEntree = (e: { id: string; magasin: string }): string => `${e.magasin}:${e.id}`

export interface DepsFile {
  installateurs: InstallateursParId
  /** Clés (`magasin:id`) des entrées imposées que l'utilisateur a explicitement choisi d'installer. */
  confirmees?: ReadonlySet<string>
  /** Début et fin de chaque extension (progression affichée dans lyra://extensions). */
  surProgression?: (p: Progression) => void
  /** Appelée après une installation réussie d'une entrée marquée `actif: false` : l'extension est désactivée. */
  desactiver?: (id: string) => Promise<unknown>
  journal?: (m: string) => void
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const RAISON_IMPOSEE = "Cette extension est imposée par une règle du navigateur d'origine : confirme que tu veux l'installer."

/**
 * Installe la file en série. Rend un résultat par entrée et la file restante : les entrées imposées non confirmées (état
 * « à confirmer ») et les erreurs (réessayables). Les entrées installées ou « à installer à la main » en sortent.
 */
export async function consommerFile(file: EntreeFileExtensions[], deps: DepsFile): Promise<ResultatFile> {
  const confirmees = deps.confirmees ?? new Set<string>()
  const aConfirmer = (e: EntreeFileExtensions): boolean => e.imposee === true && !confirmees.has(cleEntree(e))
  const aInstaller = file.filter((e) => !aConfirmer(e))
  const retours = await installerFile(
    aInstaller.map(({ id, nom, magasin }) => ({ id, nom, magasin })),
    (p) => deps.surProgression?.(p),
    async (e) => {
      const r = await installerParId(e, deps.installateurs)
      const source = aInstaller.find((x) => x.id === e.id && x.magasin === e.magasin)
      if (r.etat === 'installee' && source?.actif === false && deps.desactiver) {
        try {
          await deps.desactiver(r.id)
        } catch (err) {
          deps.journal?.(`${e.nom} : désactivation impossible — ${message(err)}`)
        }
      }
      return r
    },
    deps.journal
  )
  const resultats: ResultatEntreeFile[] = []
  const restantes: EntreeFileExtensions[] = []
  let k = 0
  for (const entree of file) {
    if (aConfirmer(entree)) {
      resultats.push({ entree, etat: 'a-confirmer', raison: RAISON_IMPOSEE })
      restantes.push(entree)
      continue
    }
    const { resultat } = retours[k++]
    const etat: EtatEntreeFile = resultat.etat === 'choix' ? 'manuel' : resultat.etat
    resultats.push({ entree, etat, ...(resultat.etat === 'installee' ? {} : { raison: resultat.raison }) })
    if (etat === 'erreur') restantes.push(entree)
  }
  return { resultats, restantes }
}

// ------------------------------------------------------------------------------------------------- file lue par le main

export const MAX_FILE = 200
const MAGASINS = ['chrome', 'edge', 'firefox', 'inconnu']

export interface DepsTraiterFile extends Omit<DepsFile, 'confirmees'> {
  /** `settings.import?.extensionsEnAttente` tel quel (absent tant que le jalon E n'est pas fusionné). */
  lire(): unknown
  /** Réécrit `settings.import.extensionsEnAttente` (les tableaux sont remplacés, pas fusionnés). */
  ecrire(restantes: unknown[]): void
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Entrée de la file si elle a la forme minimale utile à l'installation ; l'objet d'origine reste intact. */
function lue(brut: unknown): EntreeFileExtensions | undefined {
  if (!estObjet(brut)) return undefined
  const { id, nom, magasin, actif, imposee } = brut
  if (typeof id !== 'string' || id.length === 0 || id.length > 200 || typeof nom !== 'string' || typeof magasin !== 'string' || !MAGASINS.includes(magasin)) return undefined
  return {
    id,
    nom: nom.slice(0, 120),
    magasin: magasin as EntreeFileExtensions['magasin'],
    ...(typeof actif === 'boolean' ? { actif } : {}),
    ...(imposee === true ? { imposee: true } : {})
  }
}

/**
 * File d'import traitée par le processus principal seul : la file vient des réglages (jamais de la page), les entrées
 * restantes sont réécrites telles quelles (tous leurs champs), celles que l'import a ajoutées entre-temps sont conservées.
 * `confirmees` (clés `magasin:id`) vient de la page : seule décision de l'utilisateur qu'elle transmet.
 */
export async function traiterFile(deps: DepsTraiterFile, confirmees: unknown): Promise<ResultatFile> {
  const brut = deps.lire()
  if (!Array.isArray(brut) || brut.length === 0) return { resultats: [], restantes: [] }
  if (brut.length > MAX_FILE) throw new Error('File invalide.')
  const entrees: EntreeFileExtensions[] = []
  for (const b of brut) {
    const e = lue(b)
    if (e) entrees.push(e)
  }
  const cles = new Set(Array.isArray(confirmees) ? confirmees.filter((c): c is string => typeof c === 'string').slice(0, MAX_FILE) : [])
  const { installateurs, desactiver, surProgression, journal } = deps
  const r = await consommerFile(entrees, { installateurs, desactiver, surProgression, journal, confirmees: cles })
  const traitees = new Set(entrees.map(cleEntree))
  const restantes = new Set(r.restantes.map(cleEntree))
  const courante = deps.lire()
  const finale = (Array.isArray(courante) ? courante : []).filter((b) => {
    const e = lue(b)
    if (!e) return false
    const k = cleEntree(e)
    return !traitees.has(k) || restantes.has(k)
  })
  deps.ecrire(finale)
  return r
}
