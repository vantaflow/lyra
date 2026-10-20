/**
 * Tests e2e en arrière-plan : avec `LYRA_TEST=1`, les fenêtres sont créées cachées et ne volent pas le focus,
 * sauf si `LYRA_E2E_VISIBLE=1` (débogage). Aucun effet hors test.
 */
/** `app.isPackaged`, lu paresseusement : ce module reste chargeable sans Electron (vitest, utilityProcess). */
function appEmpaquetee(): boolean {
  try {
    const { app } = require('electron') as typeof import('electron')
    return app?.isPackaged === true
  } catch {
    return false
  }
}

/**
 * Mode test : `LYRA_TEST=1` ET application non empaquetée. Toute capacité ouverte par `LYRA_TEST` (file://, canaux `test:*`,
 * chemins pris dans la demande, variables de passerelles…) passe par cette fonction : une application empaquetée ignore la variable.
 * `empaquetee` n'est injectable que pour les tests unitaires.
 */
export const enTest = (env: NodeJS.ProcessEnv = process.env, empaquetee: () => boolean = appEmpaquetee): boolean => env.LYRA_TEST === '1' && !empaquetee()

export const testCache = (): boolean => process.env.LYRA_TEST === '1' && process.env.LYRA_E2E_VISIBLE !== '1'

/** Options de fenêtre ajoutées en mode test caché. */
export const optionsFenetreCachee = (): { show?: false; skipTaskbar?: true } => (testCache() ? { show: false, skipTaskbar: true } : {})

/** Options de page : les vues cachées se rendent quand même. */
export const prefsPageCachee = (): { backgroundThrottling?: false } => (testCache() ? { backgroundThrottling: false } : {})
