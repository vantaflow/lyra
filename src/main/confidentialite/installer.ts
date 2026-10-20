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

export function installerConfidentialite(deps: DepsConfidentialite): { aLaFermeture(): Promise<void> } {
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
    await effacerMaintenant(actions)
  })
  return {
    async aLaFermeture() {
      const delai = new Promise<void>((ok) => setTimeout(ok, DELAI_FERMETURE_MS).unref())
      await Promise.race([effacerALaFermeture(deps.reglages.getSettings().confidentialite, actions), delai])
    }
  }
}
