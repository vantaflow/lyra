import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
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
    build: {
      rollupOptions: {
        input: {
          ui: resolve('src/renderer/ui.html'),
          newtab: resolve('src/renderer/newtab.html'),
          settings: resolve('src/renderer/settings.html')
        }
      }
    }
  }
})
