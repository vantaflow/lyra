import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Racine temporaire par fichier de test, effacée à la fin (aucun dossier lyra-* laissé dans le TMPDIR).
    setupFiles: ['./tests/vitest/setup.ts']
  }
})
