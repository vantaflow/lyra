/**
 * Effacement des données de navigation (historique, cookies, cache) : à la fermeture de Lyra selon les cases cochées
 * dans « Confidentialité », ou tout de suite sur demande. Pur (aucune dépendance à Electron) : les actions sont injectées.
 */
import type { Settings } from '../../shared/types'

export type Donnee = 'historique' | 'cookies' | 'cache'

export interface ActionsEffacement {
  historique(): void | Promise<void>
  cookies(): void | Promise<void>
  cache(): void | Promise<void>
}

const TOUTES: Donnee[] = ['historique', 'cookies', 'cache']

/** Exécute chacune des actions demandées ; une action qui échoue n'empêche pas les autres. Renvoie ce qui a été effacé. */
async function effacer(donnees: Donnee[], actions: ActionsEffacement): Promise<Donnee[]> {
  const faites: Donnee[] = []
  await Promise.all(
    donnees.map(async (d) => {
      try {
        await actions[d]()
        faites.push(d)
      } catch (e) {
        console.error(`[confidentialite] effacement impossible : ${d}`, e)
      }
    })
  )
  return TOUTES.filter((d) => faites.includes(d))
}

/** À la fermeture : seulement les cases cochées (`Settings.confidentialite`). */
export function effacerALaFermeture(choix: Settings['confidentialite'], actions: ActionsEffacement): Promise<Donnee[]> {
  const voulues: Donnee[] = []
  if (choix.effacerHistorique) voulues.push('historique')
  if (choix.effacerCookies) voulues.push('cookies')
  if (choix.effacerCache) voulues.push('cache')
  return effacer(voulues, actions)
}

/** Purge immédiate : tout, quelles que soient les cases de la fermeture. */
export function effacerMaintenant(actions: ActionsEffacement): Promise<Donnee[]> {
  return effacer(TOUTES, actions)
}
