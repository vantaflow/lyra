import { test, expect, _electron } from '@playwright/test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const racine = resolve(__dirname, '../..')
const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/pub.html')).href

function executable(): string {
  if (process.platform === 'darwin') return join(racine, 'release/mac-arm64/Lyra.app/Contents/MacOS/Lyra')
  return join(racine, 'release/win-unpacked/Lyra.exe')
}
function ressources(): string {
  if (process.platform === 'darwin') return join(racine, 'release/mac-arm64/Lyra.app/Contents/Resources')
  return join(racine, 'release/win-unpacked/resources')
}

// Exécuté seulement avec LYRA_E2E_PAQUET=1, après `npm run dist:mac` (ou dist:win).
test('@paquet l\'app empaquetée embarque les listes et construit le moteur au premier lancement', async () => {
  expect(existsSync(join(ressources(), 'resources/shields/LISTES.json'))).toBe(true)
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  env.LYRA_TEST = '1'
  env.LYRA_USER_DATA = mkdtempSync(join(tmpdir(), 'lyra-paquet-'))
  const app = await _electron.launch({ executablePath: executable(), args: [], env })
  try {
    await app.firstWindow()
    const estUI = (u: string): boolean => u.includes('ui.html') && !u.includes('#overlay')
    for (let i = 0; i < 100 && !app.windows().some((w) => estUI(w.url())); i++) await new Promise((r) => setTimeout(r, 100))
    const fenetre = app.windows().find((w) => estUI(w.url()))!
    await fenetre.waitForLoadState('domcontentloaded')
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { moteurChoisi: true }))
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)
    await expect
      .poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('shields:get'))).bloques, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(1)
  } finally {
    await app.close()
  }
})
