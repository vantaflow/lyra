import { _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const racine = resolve(__dirname, '../..')

/** Lance Lyra avec un userData temporaire et renvoie la première fenêtre. */
export async function lancerLyra(
  extraEnv: Record<string, string> = {}
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
  const fenetre = await app.firstWindow()
  await fenetre.waitForLoadState('domcontentloaded')
  return { app, fenetre }
}
