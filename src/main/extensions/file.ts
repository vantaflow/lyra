/**
 * Installation par identifiant (jalon E : import depuis un autre navigateur) et file d'installation en série.
 * Sans Electron : les installateurs réels sont injectés (Chrome Web Store : `installerChrome`, AMO : `installerFirefox`).
 */
import type { MagasinExtension, ResultatInstallation } from '../../shared/types'
import { ID_EXTENSION } from './registre'

export interface EntreeFile {
  id: string
  nom: string
  magasin: MagasinExtension
}

export interface InstallateursParId {
  chrome(id: string): Promise<ResultatInstallation>
  /** Catalogue Firefox (AMO) : `installerFirefox` (slug ou identifiant gecko). Absent, l'extension est signalée « à installer à la main ». */
  firefox?(id: string): Promise<ResultatInstallation>
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Installe une extension d'après son magasin d'origine ; ne lève jamais. */
export async function installerParId(e: EntreeFile, i: InstallateursParId): Promise<ResultatInstallation> {
  try {
    switch (e.magasin) {
      case 'chrome':
        if (!ID_EXTENSION.test(e.id)) return { etat: 'erreur', raison: `identifiant Chrome invalide : ${e.id.slice(0, 60)}` }
        return await i.chrome(e.id)
      case 'firefox':
        return i.firefox ? await i.firefox(e.id) : { etat: 'manuel', raison: "L'installation depuis le catalogue Firefox n'est pas disponible pour l'instant : installe cette extension à la main." }
      case 'edge':
        return { etat: 'manuel', raison: "Cette extension vient du catalogue Edge, que Lyra ne peut pas interroger : installe-la à la main depuis son fichier, ou cherche son équivalent sur le Chrome Web Store." }
      default:
        return { etat: 'manuel', raison: "Lyra ne sait pas d'où vient cette extension : installe-la à la main depuis son fichier ou le Chrome Web Store." }
    }
  } catch (err) {
    return { etat: 'erreur', raison: message(err) }
  }
}

export interface Progression {
  /** Position (à partir de 0) de l'extension en cours dans la file. */
  index: number
  total: number
  entree: EntreeFile
  /** Absent quand l'installation commence, présent quand elle se termine. */
  resultat?: ResultatInstallation
}

/**
 * Installe la liste en série, dans l'ordre ; une erreur (même une exception) n'arrête pas les suivantes.
 * `surProgression` est appelé au début et à la fin de chaque extension ; `journal` reçoit une ligne par résultat.
 */
export async function installerFile(
  liste: EntreeFile[],
  surProgression: (p: Progression) => void,
  installer: (e: EntreeFile) => Promise<ResultatInstallation>,
  journal: (m: string) => void = (m) => console.warn(`[extensions] ${m}`)
): Promise<Array<{ entree: EntreeFile; resultat: ResultatInstallation }>> {
  const sortie: Array<{ entree: EntreeFile; resultat: ResultatInstallation }> = []
  for (const [index, entree] of liste.entries()) {
    surProgression({ index, total: liste.length, entree })
    let resultat: ResultatInstallation
    try {
      resultat = await installer(entree)
    } catch (err) {
      resultat = { etat: 'erreur', raison: message(err) }
    }
    journal(`file ${index + 1}/${liste.length} : ${entree.nom} (${entree.magasin}) → ${resultat.etat}${resultat.etat === 'installee' ? '' : ` — ${resultat.raison}`}`)
    sortie.push({ entree, resultat })
    try {
      surProgression({ index, total: liste.length, entree, resultat })
    } catch {
      /* un rappel d'affichage défaillant n'arrête pas la file */
    }
  }
  return sortie
}
