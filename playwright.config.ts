import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 30_000,
  outputDir: 'test-results',
  // Racine temporaire de session, effacée en fin de suite (profils de test : jamais d'accumulation sur le disque).
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [['list']],
  // Les tests réseau (@reseau) ne tournent qu'avec LYRA_E2E_RESEAU=1.
  // Les tests du paquet (@paquet) ne tournent qu'avec LYRA_E2E_PAQUET=1, après `npm run dist:*`.
  grepInvert: new RegExp(
    [process.env.LYRA_E2E_RESEAU === '1' ? '' : '@reseau', process.env.LYRA_E2E_PAQUET === '1' ? '' : '@paquet']
      .filter(Boolean)
      .join('|') || '(?!)'
  )
})
