import { afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import { creerRacineTemp } from './racine-temp'

// Chaque fichier de test a sa racine temporaire, effacée à la fin du fichier (LYRA_E2E_GARDER=1 : conservée).
const { racine, nettoyer } = creerRacineTemp()
process.env.LYRA_VITEST_RACINE = racine
afterAll(async () => {
  // Écritures différées non attendues par certains tests (ex. History.ajouter) : on les laisse aboutir avant d'effacer.
  await new Promise((ok) => setTimeout(ok, 100))
  delete process.env.LYRA_VITEST_RACINE
  nettoyer()
})
// Dernier passage à la sortie du processus, si une écriture tardive a recréé un dossier.
process.once('exit', () => {
  if (process.env.LYRA_E2E_GARDER !== '1') rmSync(racine, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})
