import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** `LYRA_E2E_GARDER=1` : les dossiers temporaires des tests sont conservés (débogage). */
export const garder = (): boolean => process.env.LYRA_E2E_GARDER === '1'

/** Efface un dossier de test, tolérant aux fichiers encore verrouillés sous Windows ; ne lève jamais. */
export function effacerDossier(dossier: string): void {
  if (garder()) return
  try {
    rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  } catch (e) {
    console.warn(`[e2e] dossier temporaire non effacé : ${dossier} (${String(e)})`)
  }
}

const aEffacer = new Set<string>()
process.on('exit', () => {
  for (const d of aEffacer) effacerDossier(d)
})

/** Dossier temporaire de test, effacé au plus tard à la fin du processus (et de la session : voir global-setup). */
export function dossierTemporaire(prefixe: string): string {
  const d = mkdtempSync(join(tmpdir(), prefixe))
  aEffacer.add(d)
  return d
}
