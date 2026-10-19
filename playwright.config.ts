import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 30_000,
  outputDir: 'test-results',
  reporter: [['list']],
  // Les tests réseau (@reseau) ne tournent qu'avec LYRA_E2E_RESEAU=1.
  grepInvert: process.env.LYRA_E2E_RESEAU === '1' ? undefined : /@reseau/
})
