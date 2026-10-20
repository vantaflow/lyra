/** Branche l'effacement (voir `effacement.ts`) sur Electron : sessions persistantes, historique, canal IPC de la purge immédiate. */
import type { Session } from 'electron'
import { handle } from '../ipc'
import type { History } from '../history/History'
import type { Reglages } from '../settings/settings'
import { effacerALaFermeture, effacerMaintenant, type ActionsEffacement } from './effacement'

export interface DepsConfidentialite {
  reglages: Reglages
  historique: History
  /** Sessions des pages web persistantes (`persist:lyra`) : jamais une session privée (déjà jetée à la fermeture de sa fenêtre). */
  sessions(): Session[]
}

/** Délai maximal de l'effacement à la fermeture : Lyra ne reste jamais bloqué à la sortie. */
const DELAI_FERMETURE_MS = 5000

export interface Confidentialite {
  /** Une fenêtre vient de s'ouvrir : des données à effacer peuvent être apparues. */
  fenetreOuverte(): void
  /** Dernière fenêtre fermée ou sortie : efface selon les cases cochées, une seule fois par ouverture. */
  aLaFermeture(): Promise<void>
}

export function installerConfidentialite(deps: DepsConfidentialite): Confidentialite {
  const actions: ActionsEffacement = {
    historique: () => deps.historique.effacer(),
    cookies: async () => {
      for (const s of deps.sessions()) {
        await s.clearStorageData({ storages: ['cookies'] })
        await s.cookies.flushStore()
      }
    },
    cache: async () => {
      for (const s of deps.sessions()) await s.clearCache()
    }
  }
  handle('confidentialite:purger', async () => {
    // Une donnée non effacée est une erreur : l'interface n'affiche « Données effacées. » qu'en cas de succès.
    const faites = await effacerMaintenant(actions)
    if (faites.length < 3) throw new Error(`Effacement incomplet (${faites.join(', ') || 'rien'})`)
  })
  // Dernière fenêtre fermée (macOS garde l'application ouverte) puis sortie : une seule exécution, la sortie attend celle en cours.
  let aEffacer = true
  let enCours: Promise<void> = Promise.resolve()
  return {
    fenetreOuverte() {
      aEffacer = true
    },
    aLaFermeture() {
      if (aEffacer) {
        aEffacer = false
        const delai = new Promise<void>((ok) => setTimeout(ok, DELAI_FERMETURE_MS).unref())
        const choix = deps.reglages.getSettings().confidentialite
        enCours = Promise.race([effacerALaFermeture(choix, actions).then(() => undefined), delai])
      }
      return enCours
    }
  }
}
