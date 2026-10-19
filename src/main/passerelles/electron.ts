/** Branche l'orchestration des passerelles sur Electron : sessions, réglages, sources et testeur. */
import { session } from 'electron'
import type { Reglages } from '../settings/settings'
import type { EtatPasserelles } from '../../shared/ipc'
import { Passerelles, type SessionProxy } from './Passerelles'
import { chargerCandidats } from './sources'
import { CIBLE_PAR_DEFAUT, testerPasserelle, trouverPasserelles } from './testeur'

const DELAI_DIRECT_MS = 5000

/** Le réseau répond-il en direct ? Session mémoire isolée sans proxy, requête bornée, 204 attendu. */
async function testerDirect(): Promise<boolean> {
  const cible = (process.env.LYRA_TEST === '1' && process.env.LYRA_PASSERELLES_CIBLE) || CIBLE_PAR_DEFAUT
  const ses = session.fromPartition('passerelle-direct')
  try {
    await ses.setProxy({ mode: 'direct' })
    const r = await ses.fetch(cible, { signal: AbortSignal.timeout(DELAI_DIRECT_MS), redirect: 'error' })
    await r.body?.cancel().catch(() => undefined)
    return r.status === 204 || (cible !== CIBLE_PAR_DEFAUT && r.status === 200)
  } catch {
    return false
  } finally {
    await ses.closeAllConnections().catch(() => undefined)
  }
}

/** Partition jamais modifiée (mode système) : sert à lire le proxy du système ou de l'entreprise. */
const PARTITION_SYSTEME = 'passerelle-systeme'

/** « PROXY a:b; DIRECT »… ; DIRECT si la résolution échoue. */
async function proxySysteme(): Promise<{ https: string; http: string }> {
  const ses = session.fromPartition(PARTITION_SYSTEME)
  const lire = (u: string): Promise<string> => ses.resolveProxy(u).catch(() => 'DIRECT')
  const [https, http] = await Promise.all([lire('https://www.gstatic.com/'), lire('http://example.com/')])
  return { https, http }
}

/**
 * Téléchargement des listes publiques par la partition système : elles suivent le proxy du réseau
 * (entreprise, PAC) comme une page ordinaire, jamais un PAC de passerelles.
 */
const fetchSysteme = ((entree: string | URL | Request, init?: RequestInit) =>
  session.fromPartition(PARTITION_SYSTEME).fetch(entree as string, init)) as typeof fetch

export function creerPasserelles(o: {
  reglages: Reglages
  cacheFichier: string
  sessions: () => SessionProxy[]
  surChangement: (etat: EtatPasserelles) => void
}): Passerelles {
  const { reglages } = o
  const p = new Passerelles({
    reseau: () => reglages.getSettings().reseau,
    ecrireSites: (sites) => void reglages.setSettings({ reseau: { ...reglages.getSettings().reseau, sites } }),
    ecrirePersonnelle: (pp) => {
      if (pp) reglages.setSettings({ reseau: { ...reglages.getSettings().reseau, personnelle: pp } })
      else reglages.supprimerPersonnelle()
    },
    sessions: o.sessions,
    charger: () => chargerCandidats({ fetch: fetchSysteme, cacheFichier: o.cacheFichier, maintenant: new Date() }),
    trouver: (c) => trouverPasserelles(c),
    tester: (c) => testerPasserelle(c),
    testerDirect,
    proxySysteme,
    maintenant: () => Date.now(),
    planifier: (fn, ms) => {
      const t = setTimeout(fn, ms)
      t.unref?.()
      return () => clearTimeout(t)
    },
    surChangement: o.surChangement
  })
  reglages.onChanged(() => p.surReglages())
  return p
}
