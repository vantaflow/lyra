import { test, expect, _electron } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
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

// Le lecteur d'import tourne dans un utilityProcess et lit les bases SQLite (sql.js) et les archives (fflate) : tout doit être dans l'asar.
test('@paquet l\'asar embarque le lecteur d\'import, sql.js (wasm) et fflate', async () => {
  // Import dynamique : @electron/asar n'est qu'une dépendance transitive d'electron-builder ; chargé en tête du fichier,
  // un changement de hoisting empêcherait toute la suite e2e de se charger.
  const { listPackage } = await import('@electron/asar')
  const fichiers = listPackage(join(ressources(), 'app.asar'), { isPack: false }).map((f) => f.replace(/\\/g, '/').replace(/^\//, ''))
  expect(fichiers).toContain('out/main/import-worker.js')
  expect(fichiers).toContain('node_modules/sql.js/dist/sql-wasm.wasm')
  expect(fichiers.some((f) => f.startsWith('node_modules/fflate/'))).toBe(true)
})

// L'icône de Lyra doit être dans le paquet : icône d'application (.icns macOS ; Lyra.exe porte déjà le .ico) et ressource de fenêtre.
test('@paquet le paquet embarque l\'icône de l\'application et celle des fenêtres', async () => {
  const png = readFileSync(join(ressources(), 'icon.png'))
  expect(png.readUInt32BE(16)).toBe(1024)
  if (process.platform === 'darwin') {
    const icns = readFileSync(join(ressources(), 'icon.icns'))
    expect(icns.subarray(0, 4).toString('latin1')).toBe('icns')
    // Types de vignettes 512 px et 1024 px (ic09, ic10) : electron-builder exige au moins 512 px.
    expect(icns.includes(Buffer.from('ic10'))).toBe(true)
    expect(readFileSync(join(ressources(), '..', 'Info.plist'), 'utf8')).toContain('<string>icon.icns</string>')
  }
})
