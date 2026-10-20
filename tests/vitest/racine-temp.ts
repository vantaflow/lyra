import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const VARIABLES = ['TMPDIR', 'TMP', 'TEMP'] as const

/**
 * Crée une racine temporaire et y redirige `tmpdir()` (TMPDIR, TMP, TEMP) : tous les `mkdtemp` d'un fichier de test
 * y aboutissent. `nettoyer()` l'efface (tolérant aux fichiers verrouillés sous Windows) et rend l'environnement.
 */
export function creerRacineTemp(): { racine: string; nettoyer: () => void } {
  const racine = mkdtempSync(join(tmpdir(), 'lyra-vitest-'))
  const avant = VARIABLES.map((v) => [v, process.env[v]] as const)
  for (const v of VARIABLES) process.env[v] = racine
  return {
    racine,
    nettoyer: () => {
      for (const [v, val] of avant) {
        if (val === undefined) delete process.env[v]
        else process.env[v] = val
      }
      if (process.env.LYRA_E2E_GARDER === '1') return
      try {
        rmSync(racine, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      } catch (e) {
        console.warn(`[vitest] racine temporaire non effacée : ${racine} (${String(e)})`)
      }
    }
  }
}
