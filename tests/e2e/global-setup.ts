import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { effacerDossier, garder } from './nettoyage'

/**
 * Racine temporaire de la session e2e : tous les `tmpdir()` des workers et des apps lancées (TMPDIR, TMP, TEMP
 * hérités) y aboutissent ; elle est effacée en fin de suite, même si un test a oublié de nettoyer.
 */
export default function globalSetup(): () => void {
  const racine = mkdtempSync(join(tmpdir(), 'lyra-e2e-session-'))
  process.env.LYRA_E2E_RACINE = racine
  process.env.TMPDIR = racine
  process.env.TMP = racine
  process.env.TEMP = racine
  return () => {
    if (garder()) console.log(`[e2e] LYRA_E2E_GARDER=1 : dossiers conservés dans ${racine}`)
    else effacerDossier(racine)
  }
}
