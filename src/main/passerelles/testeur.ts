import type { Candidat } from './liste'
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

let compteur = 0

/** Règle de proxy Chromium pour un candidat. */
export const proxyRules = (c: Candidat): string => `${c.type === 'socks5' ? 'socks5' : 'http'}://${c.hote}:${c.port}`

/**
 * Teste une passerelle : session mémoire isolée (jamais `persist:`), proxy fixé, GET de la cible ;
 * succès = 204 ou 200. La session est nettoyée ensuite. Ne lève jamais. Electron chargé à l'appel
 * (le module reste importable sous vitest).
 */
export async function testerPasserelle(c: Candidat, opts: OptionsTest = {}): Promise<ResultatTestPasserelle> {
  const timeoutMs = opts.timeoutMs ?? 6000
  const cible = opts.cible ?? process.env.LYRA_PASSERELLES_CIBLE ?? CIBLE_PAR_DEFAUT
  const debut = Date.now()
  let ses: Electron.Session | undefined
  try {
    const { session } = await import('electron')
    ses = session.fromPartition(`passerelle-test-${++compteur}`)
    await ses.setProxy({ proxyRules: proxyRules(c) })
    const r = await ses.fetch(cible, { signal: AbortSignal.timeout(timeoutMs) })
    await r.body?.cancel().catch(() => undefined)
    return { ok: r.status === 204 || r.status === 200, ms: Date.now() - debut }
  } catch {
    return { ok: false, ms: Date.now() - debut }
  } finally {
    try {
      ses?.closeAllConnections()
      await ses?.clearCache()
    } catch {
      /* session déjà détruite */
    }
  }
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
  const { parallele = 15, max = 60, garder = 5, tester = (c: Candidat) => testerPasserelle(c) } = opts
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
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallele, aTester.length)) }, ouvrier))
  return meilleures(resultats, garder)
}
