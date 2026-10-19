import { _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const racine = resolve(__dirname, '../..')

/** Lance Lyra avec un userData temporaire et renvoie la première fenêtre. */
export async function lancerLyra(
  extraEnv: Record<string, string> = {},
  options: { premierLancement?: boolean } = {}
): Promise<{ app: ElectronApplication; fenetre: Page }> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    // Hérité d'un parent Electron, il ferait échouer le lancement.
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }
  env.LYRA_TEST = '1'
  env.LYRA_USER_DATA = mkdtempSync(join(tmpdir(), 'lyra-e2e-'))
  Object.assign(env, extraEnv)

  const app = await _electron.launch({ args: ['.'], cwd: racine, env })
  await app.firstWindow()
  // Plusieurs vues web : la fenêtre d'interface est celle qui charge ui.html.
  const estUI = (p: Page): boolean => p.url().includes('ui.html') && !p.url().includes('#overlay')
  for (let i = 0; i < 100 && !app.windows().some(estUI); i++) await new Promise((r) => setTimeout(r, 100))
  const fenetre = app.windows().find(estUI)!
  await fenetre.waitForLoadState('domcontentloaded')
  // Le nouvel onglet de départ doit avoir fini de charger (sinon il remplace une navigation lancée aussitôt).
  if (!options.premierLancement) for (let i = 0; i < 100 && !app.windows().some((p) => p.url().startsWith('lyra://newtab')); i++) await new Promise((r) => setTimeout(r, 100))
  // Hors test dédié, le choix du moteur (premier lancement) est déjà fait : il n'interfère pas.
  if (!options.premierLancement) await fenetre.evaluate(() => window.lyra.invoke('settings:set', { moteurChoisi: true }))
  return { app, fenetre }
}
