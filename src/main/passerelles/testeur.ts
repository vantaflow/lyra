import type { Candidat } from './liste'
import { enTest } from '../modeTest'
import { meilleures } from './selection'

export const CIBLE_PAR_DEFAUT = 'https://www.gstatic.com/generate_204'

export interface OptionsTest {
  timeoutMs?: number
  cible?: string
}

export interface ResultatTestPasserelle {
  ok: boolean
  ms: number
}

/** Ce dont le testeur a besoin d'une session Electron (injectable pour les tests). */
export interface SessionTest {
  setProxy(config: { proxyRules: string }): Promise<void>
  fetch(url: string, init?: RequestInit): Promise<Response>
  closeAllConnections(): Promise<void> | void
  clearCache(): Promise<void> | void
}

/** Taille du pool = parallélisme maximal de `trouverPasserelles`. */
export const TAILLE_POOL = 15

/** Règle de proxy Chromium pour un candidat. */
export const proxyRules = (c: Candidat): string => `${c.type === 'socks5' ? 'socks5' : 'http'}://${c.hote}:${c.port}`

/** Cible de test : la variable d'environnement n'est lue que sous LYRA_TEST=1. */
function cibleEffective(opts: OptionsTest): { cible: string; parDefaut: boolean } {
  const fournie = opts.cible ?? (enTest() ? process.env.LYRA_PASSERELLES_CIBLE : undefined)
  return fournie ? { cible: fournie, parDefaut: false } : { cible: CIBLE_PAR_DEFAUT, parDefaut: true }
}

/**
 * Pool fixe d'emplacements de session (`passerelle-test-slot-<i>`) réutilisés : pas de partition
 * créée par test. Un emprunteur attend si tous les emplacements sont pris.
 */
export class PoolSessions {
  private readonly sessions: (SessionTest | undefined)[]
  private readonly generations: number[]
  private readonly libres: number[]
  private readonly attente: ((i: number) => void)[] = []

  constructor(
    private readonly taille: number,
    private readonly fabrique: (nom: string) => Promise<SessionTest> | SessionTest
  ) {
    this.sessions = new Array<SessionTest | undefined>(taille).fill(undefined)
    this.generations = new Array<number>(taille).fill(0)
    this.libres = Array.from({ length: taille }, (_, i) => i)
  }

  async emprunter(): Promise<{ ses: SessionTest; rendre: () => void; remplacer: () => void }> {
    const i = this.libres.length > 0 ? (this.libres.shift() as number) : await new Promise<number>((r) => this.attente.push(r))
    let ses = this.sessions[i]
    try {
      if (!ses) ses = this.sessions[i] = await this.fabrique(this.nom(i))
    } catch (e) {
      this.restituer(i)
      throw e
    }
    let rendu = false
    return {
      ses,
      rendre: () => {
        if (rendu) return
        rendu = true
        this.restituer(i)
      },
      // Essai bloqué : on abandonne la session de l'emplacement (nouveau nom) pour ne jamais bloquer le pool.
      remplacer: () => {
        if (rendu) return
        rendu = true
        this.sessions[i] = undefined
        this.generations[i]++
        this.restituer(i)
      }
    }
  }

  private nom(i: number): string {
    const g = this.generations[i]
    return g === 0 ? `passerelle-test-slot-${i}` : `passerelle-test-slot-${i}-${g}`
  }

  private restituer(i: number): void {
    const suivant = this.attente.shift()
    if (suivant) suivant(i)
    else this.libres.push(i)
  }
}

/**
 * Fabrique un testeur sur un pool d'emplacements. Succès = 204 pour la cible par défaut
 * (200 accepté seulement pour une cible fournie), aucune redirection suivie ; le délai
 * `timeoutMs` couvre l'ensemble (emprunt exclu) : setProxy + fetch + lecture. Ne lève jamais.
 */
export function creerTesteur(pool: PoolSessions, gardeMs = 30_000): (c: Candidat, opts?: OptionsTest) => Promise<ResultatTestPasserelle> {
  return async (c, opts = {}) => {
    const timeoutMs = opts.timeoutMs ?? 6000
    const { cible, parDefaut } = cibleEffective(opts)
    let emprunt: Awaited<ReturnType<PoolSessions['emprunter']>>
    try {
      emprunt = await pool.emprunter()
    } catch {
      return { ok: false, ms: 0 }
    }
    const { ses, rendre, remplacer } = emprunt
    const debut = Date.now()
    const ctrl = new AbortController()
    let minuteur: ReturnType<typeof setTimeout> | undefined
    const delai = new Promise<ResultatTestPasserelle>((resolve) => {
      minuteur = setTimeout(() => {
        ctrl.abort()
        resolve({ ok: false, ms: Date.now() - debut })
      }, timeoutMs)
    })
    let fini = false
    const essai = (async (): Promise<ResultatTestPasserelle> => {
      try {
        await ses.closeAllConnections()
        await ses.setProxy({ proxyRules: proxyRules(c) })
        if (ctrl.signal.aborted) return { ok: false, ms: Date.now() - debut }
        const r = await ses.fetch(cible, { signal: ctrl.signal, redirect: 'error' })
        const ok = r.status === 204 || (!parDefaut && r.status === 200)
        await r.body?.cancel().catch(() => undefined)
        return { ok, ms: Date.now() - debut }
      } catch {
        return { ok: false, ms: Date.now() - debut }
      } finally {
        fini = true
      }
    })()
    // L'emplacement n'est rendu qu'une fois l'essai réellement terminé (sinon un setProxy tardif
    // écraserait le proxy du test suivant). Garde : un essai bloqué > gardeMs fait remplacer l'emplacement.
    let garde: ReturnType<typeof setTimeout> | undefined
    const liberer = essai
      .then(async () => {
        try {
          await ses.closeAllConnections()
          await ses.clearCache()
        } catch {
          /* session indisponible */
        }
      })
      .finally(() => {
        clearTimeout(garde)
        rendre()
      })
    try {
      return await Promise.race([essai, delai])
    } finally {
      clearTimeout(minuteur)
      ctrl.abort()
      if (fini) await liberer
      else {
        garde = setTimeout(remplacer, gardeMs)
        garde.unref?.()
        void liberer
      }
    }
  }
}

let poolElectron: PoolSessions | undefined

/** Teste une passerelle sur le pool Electron (partitions mémoire, sans `persist:`). Electron chargé à l'appel. */
export function testerPasserelle(c: Candidat, opts: OptionsTest = {}): Promise<ResultatTestPasserelle> {
  poolElectron ??= new PoolSessions(TAILLE_POOL, async (nom) => {
    const { session } = await import('electron')
    return session.fromPartition(nom) as unknown as SessionTest
  })
  return creerTesteur(poolElectron)(c, opts)
}

export interface OptionsRecherche {
  parallele?: number
  max?: number
  garder?: number
  /** Injectable pour les tests ; par défaut `testerPasserelle`. */
  tester?: (c: Candidat) => Promise<ResultatTestPasserelle>
}

/**
 * Teste au plus `max` candidats, `parallele` à la fois, et renvoie les `garder` plus rapides.
 * Un testeur qui lève compte comme un échec.
 */
export async function trouverPasserelles(candidats: readonly Candidat[], opts: OptionsRecherche = {}): Promise<Candidat[]> {
  const { parallele = TAILLE_POOL, max = 60, garder = 5, tester = (c: Candidat) => testerPasserelle(c) } = opts
  const aTester = candidats.slice(0, Math.max(0, max))
  const resultats: { candidat: Candidat; ok: boolean; ms: number }[] = []
  let suivant = 0
  const ouvrier = async (): Promise<void> => {
    while (suivant < aTester.length) {
      const candidat = aTester[suivant++]
      try {
        const r = await tester(candidat)
        resultats.push({ candidat, ok: r.ok, ms: r.ms })
      } catch {
        resultats.push({ candidat, ok: false, ms: 0 })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallele, TAILLE_POOL, aTester.length)) }, ouvrier))
  return meilleures(resultats, garder)
}
