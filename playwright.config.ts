import { defineConfig } from '@playwright/test'

// L'audit des boutons (@audit, tests/e2e/audit-*.spec.ts) est exclu de `npm run e2e` tant que les défauts connus ne sont
// pas corrigés ; il tourne avec LYRA_E2E_AUDIT=1 ou quand on le désigne : `npx playwright test tests/e2e/audit`.
// Seuls les filtres de la ligne de commande comptent (pas le chemin du dépôt, qui peut lui-même contenir « audit »).
const auditDemande =
  process.env.LYRA_E2E_AUDIT === '1' || process.argv.slice(2).some((a) => !a.startsWith('/') && /(^|\/)audit([-/.]|$)/i.test(a))

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 30_000,
  outputDir: 'test-results',
  reporter: [['list']],
  // Les tests réseau (@reseau) ne tournent qu'avec LYRA_E2E_RESEAU=1.
  // Les tests du paquet (@paquet) ne tournent qu'avec LYRA_E2E_PAQUET=1, après `npm run dist:*`.
  grepInvert: new RegExp(
    [process.env.LYRA_E2E_RESEAU === '1' ? '' : '@reseau', process.env.LYRA_E2E_PAQUET === '1' ? '' : '@paquet', auditDemande ? '' : '@audit']
      .filter(Boolean)
      .join('|') || '(?!)'
  )
})
