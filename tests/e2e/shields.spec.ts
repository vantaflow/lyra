import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { lancerLyra } from './helpers'
import type { EtatBoucliers } from '../../src/shared/ipc'

// La page de test est servie en http local : les fichiers locaux (file://) n'ont pas de règle par site.
let serveurPub: Server
let FIXTURE = ''
let ORIGINE_PUB = ''
test.beforeAll(async () => {
  const html = readFileSync(resolve(__dirname, 'fixtures/pub.html'), 'utf8')
  serveurPub = createServer((_q, r) => {
    r.setHeader('content-type', 'text/html')
    r.end(html)
  })
  await new Promise<void>((ok) => serveurPub.listen(0, '127.0.0.1', ok))
  ORIGINE_PUB = `http://127.0.0.1:${(serveurPub.address() as AddressInfo).port}`
  FIXTURE = `${ORIGINE_PUB}/`
})
test.afterAll(() => new Promise((ok) => serveurPub.close(ok)))

const etat = (f: Page): Promise<EtatBoucliers> => f.evaluate(() => window.lyra.invoke('shields:get'))
const pagePub = (app: ElectronApplication): Page | undefined => app.windows().find((w) => w.url() === FIXTURE)
const resultat = (p: Page): Promise<string> => p.evaluate(() => document.getElementById('resultat')?.textContent ?? '')

// Le DNS de la machine de test renvoie 0.0.0.0 pour les domaines de pub : on vérifie donc le compteur du
// moteur (la requête a bien été annulée par Lyra), pas seulement l'échec réseau.
test('les Boucliers bloquent une pub et se désactivent par site', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), FIXTURE)
    await expect.poll(() => pagePub(app)).toBeDefined()
    const page = pagePub(app)!
    await expect.poll(() => resultat(page)).toContain('ERR')
    await expect.poll(async () => (await etat(fenetre)).bloques).toBeGreaterThanOrEqual(1)
    const avant = await etat(fenetre)
    expect(avant).toMatchObject({ actif: true, origine: ORIGINE_PUB })
    expect(avant.dernieres[0]).toContain('pagead2.googlesyndication.com')
    // Le pied du ciel affiche le compteur de l'étoile active.
    await expect(fenetre.locator('.boucliers-n')).toHaveText(String(avant.bloques))

    // Le panneau s'ouvre depuis le bouclier du pied.
    await fenetre.locator('.boucliers').click()
    await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
    const overlay = app.windows().find((w) => w.url().includes('#overlay'))!
    await expect(overlay.locator('.pn-bouclier')).toBeVisible()
    await expect(overlay.locator('.pn-nom')).toHaveText(ORIGINE_PUB.replace('http://', ''))
    await expect(overlay.locator('.pn-n').first()).toHaveText(String(avant.bloques))

    // Désactivation pour ce site depuis l'interrupteur : la page est rechargée sans blocage.
    await overlay.locator('.pn-tete .tg').click()
    await expect.poll(async () => (await etat(fenetre)).actif).toBe(false)
    await expect.poll(() => resultat(page).catch(() => '')).not.toBe('')
    await page.waitForTimeout(500)
    expect((await etat(fenetre)).bloques).toBe(0)
    const reglages = await fenetre.evaluate(() => window.lyra.invoke('settings:get'))
    expect(reglages.sites[ORIGINE_PUB]).toEqual({ boucliers: 'desactives' })
  } finally {
    await app.close()
  }
})

// Niveaux par site : une page en 127.0.0.1 charge un script de sa 1re partie et un script tiers (hôte « localhost »,
// autre port) hors liste des CDN. Strict bloque le tiers (le propre reste), Standard et Désactivés laissent tout passer.
test.describe('niveaux par site', () => {
  let page1: Server
  let page2: Server
  let URL_PAGE = ''
  test.beforeAll(async () => {
    page2 = createServer((_q, r) => {
      r.setHeader('content-type', 'text/javascript')
      r.end('window.__tiers = true')
    })
    await new Promise<void>((ok) => page2.listen(0, ok))
    const p2 = (page2.address() as AddressInfo).port
    page1 = createServer((q, r) => {
      if (q.url === '/propre.js') {
        r.setHeader('content-type', 'text/javascript')
        return r.end('window.__propre = true')
      }
      r.setHeader('content-type', 'text/html')
      r.end(`<!doctype html><title>niveaux</title><script src="/propre.js"></script><script src="http://localhost:${p2}/tiers.js"></script>`)
    })
    await new Promise<void>((ok) => page1.listen(0, '127.0.0.1', ok))
    URL_PAGE = `http://127.0.0.1:${(page1.address() as AddressInfo).port}/`
  })
  test.afterAll(async () => {
    await new Promise((ok) => page1.close(ok))
    await new Promise((ok) => page2.close(ok))
  })

  const charger = async (niveau: 'strict' | 'desactives' | 'standard'): Promise<{ propre: unknown; tiers: unknown }> => {
    const { app, fenetre } = await lancerLyra()
    try {
      await fenetre.evaluate((b) => window.lyra.invoke('sites:ecrire', { cle: '127.0.0.1', regle: { boucliers: b } }), niveau)
      await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), URL_PAGE)
      await expect.poll(() => app.windows().find((w) => w.url() === URL_PAGE), { timeout: 15_000 }).toBeDefined()
      const page = app.windows().find((w) => w.url() === URL_PAGE)!
      await page.waitForLoadState('load')
      await page.waitForTimeout(500)
      return await page.evaluate(() => ({ propre: (window as never as Record<string, unknown>).__propre, tiers: (window as never as Record<string, unknown>).__tiers }))
    } finally {
      await app.close()
    }
  }

  test('Strict : le script tiers inconnu est bloqué, celui de la 1re partie s’exécute', async () => {
    expect(await charger('strict')).toEqual({ propre: true, tiers: undefined })
  })
  test('Standard : rien n’est bloqué', async () => {
    expect(await charger('standard')).toEqual({ propre: true, tiers: true })
  })
  test('Désactivés : rien n’est bloqué', async () => {
    expect(await charger('desactives')).toEqual({ propre: true, tiers: true })
  })

  // Niveau de protection par défaut (Réglages > Boucliers) : lu quand le site n'a pas de règle de Boucliers.
  const chargerAvecDefaut = async (defaut: 'strict' | 'desactives' | 'standard', regle?: 'standard'): Promise<{ propre: unknown; tiers: unknown }> => {
    const { app, fenetre } = await lancerLyra()
    try {
      await fenetre.evaluate((d) => window.lyra.invoke('settings:set', { boucliers: { niveau: d } }), defaut)
      if (regle) await fenetre.evaluate((b) => window.lyra.invoke('sites:ecrire', { cle: '127.0.0.1', regle: { boucliers: b } }), regle)
      await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), URL_PAGE)
      await expect.poll(() => app.windows().find((w) => w.url() === URL_PAGE), { timeout: 15_000 }).toBeDefined()
      const page = app.windows().find((w) => w.url() === URL_PAGE)!
      await page.waitForLoadState('load')
      await page.waitForTimeout(500)
      return await page.evaluate(() => ({ propre: (window as never as Record<string, unknown>).__propre, tiers: (window as never as Record<string, unknown>).__tiers }))
    } finally {
      await app.close()
    }
  }
  test('niveau par défaut Strict : un site sans règle bloque le script tiers inconnu', async () => {
    expect(await chargerAvecDefaut('strict')).toEqual({ propre: true, tiers: undefined })
  })
  test('niveau par défaut Strict : la règle du site (Standard) l’emporte', async () => {
    expect(await chargerAvecDefaut('strict', 'standard')).toEqual({ propre: true, tiers: true })
  })
})
