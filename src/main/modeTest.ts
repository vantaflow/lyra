/**
 * Tests e2e en arrière-plan : avec `LYRA_TEST=1`, les fenêtres sont créées cachées et ne volent pas le focus,
 * sauf si `LYRA_E2E_VISIBLE=1` (débogage). Aucun effet hors test.
 */
export const testCache = (): boolean => process.env.LYRA_TEST === '1' && process.env.LYRA_E2E_VISIBLE !== '1'

/** Options de fenêtre ajoutées en mode test caché. */
export const optionsFenetreCachee = (): { show?: false; skipTaskbar?: true } => (testCache() ? { show: false, skipTaskbar: true } : {})

/** Options de page : les vues cachées se rendent quand même. */
export const prefsPageCachee = (): { backgroundThrottling?: false } => (testCache() ? { backgroundThrottling: false } : {})
