import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { lancerLyra } from './helpers'

// Dépend de YouTube : ne tourne qu'avec LYRA_E2E_RESEAU=1.
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const SUITE = ['JGwWNGJdvx8', 'kJQP7kiw5Fk', '9bZkp7q19f0']

/** « AD 1/6 » (pub : durée courte) ou « no-ad 2/213 » : état du lecteur et position/durée du média, 1 fois par seconde. */
async function echantillonner(page: Page, n: number): Promise<string[]> {
  const res: string[] = []
  for (let s = 0; s < n; s++) {
    await page.waitForTimeout(1000)
    res.push(
      await page
        .evaluate(() => {
          const p = document.querySelector('#movie_player')
          const v = document.querySelector('video')
          const pub = p?.classList.contains('ad-showing') || p?.classList.contains('ad-interrupting') ? 'AD' : 'no-ad'
          return `${pub} ${v ? `${v.currentTime.toFixed(0)}/${Math.round(v.duration || 0)}` : '-'}`
        })
        .catch(() => 'ERR')
    )
  }
  return res
}

const pageYoutube = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url().startsWith('https://www.youtube.com/'))

/** Scénario commun : avec `ubo`, uBlock Origin (release GitHub, MV2 + stubs) est installé avant la navigation ; les Boucliers priment. */
async function scenarioYoutube(ubo: boolean): Promise<void> {
  const { app, fenetre } = await lancerLyra()
  try {
    if (ubo) {
      const r = await fenetre.evaluate(() => window.lyra.invoke('extensions:installer', { source: 'ubo' }))
      if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
      console.log('[youtube] uBlock Origin chargé :', r.version)
    }
    const id = await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), VIDEO)
    await expect.poll(() => pageYoutube(app), { timeout: 30_000 }).toBeDefined()
    const page = pageYoutube(app)!
    // Première vidéo : 15 s d'échantillonnage (1/s) pendant l'attente.
    const premiere = await echantillonner(page, 15)
    console.log(`[youtube] dQw4w9WgXcQ :`, premiere.join(' | '))
    expect(premiere.filter((e) => e.startsWith('AD'))).toEqual([])

    const sonde = await page.evaluate(() => {
      const d = Object.getOwnPropertyDescriptor(window, 'ytInitialPlayerResponse')
      const w = window as unknown as { ytInitialPlayerResponse?: { adPlacements?: unknown }; __lyraShields?: { scriptletsAt: string; n: number } }
      return {
        accesseur: typeof d?.get === 'function',
        adPlacements: typeof w.ytInitialPlayerResponse?.adPlacements,
        boucliers: w.__lyraShields
      }
    })
    console.log('[youtube] première vidéo', JSON.stringify(sonde))
    expect(sonde.accesseur).toBe(true)
    expect(sonde.adPlacements).toBe('undefined')
    expect(sonde.boucliers?.scriptletsAt).toMatch(/^loading@/)
    expect(sonde.boucliers?.n).toBeGreaterThan(0)

    for (const v of SUITE) {
      await fenetre.evaluate(([i, u]) => window.lyra.invoke('tabs:navigate', { id: i, url: u }), [id, `https://www.youtube.com/watch?v=${v}`])
      await expect.poll(() => page.url(), { timeout: 30_000 }).toContain(v)
      const echantillons = await echantillonner(page, 9)
      const at = await page.evaluate(() => (window as unknown as { __lyraShields?: { scriptletsAt: string } }).__lyraShields?.scriptletsAt ?? '-')
      console.log(`[youtube] ${v} scriptlets@${at} :`, echantillons.join(' | '))
      expect(echantillons.filter((e) => e.startsWith('AD'))).toEqual([])
    }
    const b = await fenetre.evaluate(() => window.lyra.invoke('shields:get'))
    console.log('[youtube] compteur de l’étoile', b.bloques, 'dernières :', b.dernieres.slice(0, 5).join(' , '))
  } finally {
    await app.close()
  }
}

test('@reseau YouTube : scriptlets avant la page, aucune pub sur 3 vidéos enchaînées', async () => {
  test.setTimeout(180_000)
  await scenarioYoutube(false)
})

test('@reseau YouTube avec uBlock Origin chargé : les Boucliers bloquent toujours, aucune pub', async () => {
  test.setTimeout(240_000)
  await scenarioYoutube(true)
})
