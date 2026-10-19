import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { lancerLyra } from './helpers'
import type { SkyChange } from '../../src/shared/ipc'

// Petit serveur http local : le preload des Boucliers ne tourne que sur http(s).
let serveur: Server
let URL_WEB = ''
test.beforeAll(async () => {
  serveur = createServer((_q, r) => {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    r.end('<!doctype html><title>Web</title><a id="interne" href="lyra://settings">réglages</a>')
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  URL_WEB = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/`
})
test.afterAll(() => serveur.close())

const ciel = (f: Page): Promise<SkyChange> => f.evaluate(() => window.lyra.invoke('sky:get'))
const pageA = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))
const sondes = (p: Page) =>
  p.evaluate(() => ({
    lyra: typeof (window as unknown as { lyra?: unknown }).lyra,
    shields: typeof (window as unknown as { __lyraShields?: unknown }).__lyraShields
  }))

test('newtab → palette → site : preload web (Boucliers), sans window.lyra', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const { sky } = await ciel(fenetre)
    const id = sky.activeId!
    await expect.poll(() => pageA(app, 'lyra://newtab')).toBeDefined()
    expect(await sondes(pageA(app, 'lyra://newtab')!)).toEqual({ lyra: 'object', shields: 'undefined' })

    await fenetre.evaluate((u) => window.lyra.invoke('palette:go', { texte: u, nouvelleEtoile: false }), URL_WEB)
    await expect.poll(() => pageA(app, URL_WEB)).toBeDefined()
    const web = pageA(app, URL_WEB)!
    await expect.poll(() => sondes(web)).toEqual({ lyra: 'undefined', shields: 'object' })
    // Même étoile, nouvelle vue ; l'ancienne vue est fermée.
    const apres = await ciel(fenetre)
    expect(apres.sky.stars).toHaveLength(1)
    expect(apres.sky.activeId).toBe(id)
    await expect.poll(() => pageA(app, 'lyra://newtab')).toBeUndefined()

    // Un site ne peut pas naviguer de lui-même vers lyra://.
    // La navigation est refusée : ne pas attendre une navigation qui n’aura pas lieu.
    await web.click("#interne", { noWaitAfter: true })
    await web.waitForTimeout(500)
    expect(web.url()).toBe(URL_WEB)
    expect(await sondes(web)).toEqual({ lyra: 'undefined', shields: 'object' })
  } finally {
    await app.close()
  }
})

test('site → lyra://settings : window.lyra présent, pas de sonde des Boucliers', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const id = await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), URL_WEB)
    await expect.poll(() => pageA(app, URL_WEB)).toBeDefined()
    expect(await sondes(pageA(app, URL_WEB)!)).toEqual({ lyra: 'undefined', shields: 'object' })
    await fenetre.evaluate((i) => window.lyra.invoke('tabs:navigate', { id: i, url: 'lyra://settings' }), id)
    await expect.poll(() => pageA(app, 'lyra://settings')).toBeDefined()
    await expect.poll(() => sondes(pageA(app, 'lyra://settings')!)).toEqual({ lyra: 'object', shields: 'undefined' })
    await expect.poll(() => pageA(app, URL_WEB)).toBeUndefined()
  } finally {
    await app.close()
  }
})

test('hors test, la sonde window.__lyraShields n’est pas exposée aux sites', async () => {
  const { app, fenetre } = await lancerLyra({ LYRA_TEST: '0' })
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), URL_WEB)
    await expect.poll(() => pageA(app, URL_WEB)).toBeDefined()
    const web = pageA(app, URL_WEB)!
    await web.waitForLoadState('load')
    expect(await sondes(web)).toEqual({ lyra: 'undefined', shields: 'undefined' })
  } finally {
    await app.close()
  }
})
