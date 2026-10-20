import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import preact from '@preact/preset-vite'
import { readFileSync } from 'node:fs'

const version: string = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts'), 'import-worker': resolve('src/main/import/worker.ts') } }
    }
  },
  preload: {
    build: {
      // Un bundle par preload, sans code partagé : le sandbox exige du CJS autonome.
      isolatedEntries: true,
      externalizeDeps: false,
      rollupOptions: {
        input: {
          ui: resolve('src/preload/ui.ts'),
          internal: resolve('src/preload/internal.ts'),
          page: resolve('src/preload/page.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [preact()],
    // Version affichée dans « À propos » (réglages).
    define: { __LYRA_VERSION__: JSON.stringify(version) },
    // Les pages lyra:// ont pour origine lyra://<hôte> : le HMR doit viser explicitement le serveur Vite.
    server: { hmr: { protocol: 'ws', host: 'localhost', port: 5173 } },
    build: {
      rollupOptions: {
        input: {
          ui: resolve('src/renderer/ui.html'),
          newtab: resolve('src/renderer/newtab.html'),
          settings: resolve('src/renderer/settings.html'),
          extensions: resolve('src/renderer/extensions.html'),
          erreur: resolve('src/renderer/erreur.html')
        }
      }
    }
  }
})
