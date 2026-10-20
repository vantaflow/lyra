/**
 * File d'import (jalon E) : réinstalle, en série, les extensions repérées dans un autre navigateur.
 * Sans Electron : les installateurs sont injectés. `EntreeImport` est structurellement compatible avec
 * `ExtensionEnAttente` du jalon E (`settings.import.extensionsEnAttente`) : la fusion n'ajoute qu'un branchement.
 *
 * Règles : une extension « imposée » (par une règle d'entreprise du navigateur d'origine) n'est jamais installée sans choix
 * explicite de l'utilisateur ; l'import Firefox est strict (slug ou identifiant AMO, jamais de recherche) ; l'appelant réécrit
 * la file entière avec `restantes` (`setSettings` remplace les tableaux).
 */
import type { EntreeImport, EtatEntreeFile, ResultatEntreeFile, ResultatFile } from '../../shared/types'
import { installerFile, installerParId, type InstallateursParId, type Progression } from './file'

export type { EntreeImport, ResultatEntreeFile, ResultatFile }

export interface DepsFile {
  installateurs: InstallateursParId
  /** Identifiants des entrées imposées que l'utilisateur a explicitement choisi d'installer. */
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
export async function consommerFile(file: EntreeImport[], deps: DepsFile): Promise<ResultatFile> {
  const confirmees = deps.confirmees ?? new Set<string>()
  const aConfirmer = (e: EntreeImport): boolean => e.imposee === true && !confirmees.has(e.id)
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
  const restantes: EntreeImport[] = []
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
