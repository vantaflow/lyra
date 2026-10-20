/** Branche l'effacement (voir `effacement.ts`) sur Electron : sessions persistantes, historique, canal IPC de la purge immédiate. */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
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
  /**
   * Fichier marqueur « effacement à faire » : écrit dès qu'une fenêtre est ouverte, retiré quand l'effacement de la fermeture a abouti.
   * Présent au démarrage, il dit que l'arrêt précédent a été brutal (plantage, coupure) : l'effacement est alors rejoué tout de suite.
   */
  marqueur?: string
}

/** Délai maximal de l'effacement à la fermeture : Lyra ne reste jamais bloqué à la sortie. */
const DELAI_FERMETURE_MS = 5000

export interface Confidentialite {
  /** Une fenêtre vient de s'ouvrir : des données à effacer peuvent être apparues. */
  fenetreOuverte(): void
  /** Rattrapage au démarrage d'un effacement manqué (arrêt brutal) ; résolue quand il est terminé (au plus 5 s). */
  rattrapage: Promise<void>
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
    await effacerMaintenant(actions)
  })
  // Dernière fenêtre fermée (macOS garde l'application ouverte) puis sortie : une seule exécution, la sortie attend celle en cours.
  let aEffacer = true
  let enCours: Promise<void> = Promise.resolve()
  const poserMarqueur = (): void => {
    if (!deps.marqueur) return
    try {
      mkdirSync(dirname(deps.marqueur), { recursive: true })
      writeFileSync(deps.marqueur, String(Date.now()))
    } catch (err) {
      console.warn('[confidentialite] marqueur non écrit :', err)
    }
  }
  const retirerMarqueur = (): void => {
    if (!deps.marqueur) return
    try {
      rmSync(deps.marqueur, { force: true })
    } catch (err) {
      console.warn('[confidentialite] marqueur non retiré :', err)
    }
  }
  const manque = deps.marqueur !== undefined && existsSync(deps.marqueur)
  const delaiBorne = (): Promise<void> => new Promise<void>((ok) => setTimeout(ok, DELAI_FERMETURE_MS).unref())
  // Arrêt brutal : l'effacement de la fermeture n'a pas eu lieu, on le rejoue avant la première fenêtre.
  const rattrapage = manque
    ? Promise.race([effacerALaFermeture(deps.reglages.getSettings().confidentialite, actions).then(() => undefined), delaiBorne()]).catch(() => undefined)
    : Promise.resolve()
  poserMarqueur()
  return {
    rattrapage,
    fenetreOuverte() {
      aEffacer = true
      poserMarqueur()
    },
    aLaFermeture() {
      if (aEffacer) {
        aEffacer = false
        const choix = deps.reglages.getSettings().confidentialite
        // Le marqueur ne disparaît que si l'effacement a abouti dans le délai : sinon il est rejoué au prochain démarrage.
        enCours = Promise.race([effacerALaFermeture(choix, actions).then(retirerMarqueur), delaiBorne()])
      }
      return enCours
    }
  }
}
