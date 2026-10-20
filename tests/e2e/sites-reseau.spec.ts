import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancerLyra } from './helpers'

// Règles par site passant par le hub webRequest (jalon D, tâche 12) : cookies, scripts et user-agent, observés côté serveur de test.
// Un seul serveur HTTP local à deux hôtes : « 127.0.0.1 » (le site) et « localhost » (le tiers, autre domaine enregistrable), même port.

interface Vue {
  hote: string
  chemin: string
  entetes: IncomingHttpHeaders
}
const vues: Vue[] = []
let serveur: Server
let PORT = 0
const SITE = (): string => `http://127.0.0.1:${PORT}`
const TIERS = (): string => `http://localhost:${PORT}`

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

test.beforeAll(async () => {
  serveur = createServer((q, r) => {
    const hote = (q.headers.host ?? '').split(':')[0]
    const chemin = new URL(q.url ?? '/', 'http://x').pathname
    vues.push({ hote, chemin, entetes: q.headers })
    const autre = hote === 'localhost' ? SITE() : TIERS()
    if (chemin === '/page') {
      r.setHeader('content-type', 'text/html')
      r.setHeader('set-cookie', 'premier=1; Max-Age=3600')
      return r.end(`<!doctype html><title>reseau</title><img src="${autre}/tiers.gif"><script src="/ext.js"></script><script>window.__inline = true</script>`)
    }
    if (chemin === '/tiers.gif') {
      r.setHeader('content-type', 'image/gif')
      // SameSite=None : sans cela Chromium refuserait déjà tout cookie tiers, et le test ne prouverait rien.
      r.setHeader('set-cookie', 'tiers=1; Max-Age=3600; SameSite=None; Secure')
      return r.end(GIF)
    }
    if (chemin === '/ext.js') {
      r.setHeader('content-type', 'text/javascript')
      return r.end('window.__ext = true')
    }
    r.statusCode = 404
    r.end()
  })
  await new Promise<void>((ok) => serveur.listen(0, ok))
  PORT = (serveur.address() as AddressInfo).port
})
test.afterAll(() => new Promise((ok) => serveur.close(ok)))
test.beforeEach(() => void (vues.length = 0))

const PARTITION = 'persist:lyra'
const cookies = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(async ({ session }, p) => (await session.fromPartition(p).cookies.get({})).map((c) => c.name).sort(), PARTITION)
const viderCookies = (app: ElectronApplication): Promise<void> =>
  app.evaluate(({ session }, p) => session.fromPartition(p).clearStorageData({ storages: ['cookies'] }), PARTITION)

const regle = (f: Page, cle: string, r: Record<string, unknown>): Promise<void> => f.evaluate(([c, x]) => window.lyra.invoke('sites:ecrire', { cle: c as string, regle: x as Record<string, unknown> }), [cle, r])
const supprimer = (f: Page, cle: string): Promise<void> => f.evaluate((c) => window.lyra.invoke('sites:supprimer', c), cle)

const pageDe = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

/** Ouvre l'adresse dans l'étoile active et attend que la page, son image tierce et (sauf `scriptServi` faux : script bloqué) son script aient été servis. */
async function charger(app: ElectronApplication, f: Page, url: string, premiere = false, scriptServi = true): Promise<Page> {
  vues.length = 0
  if (premiere) await f.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), url)
  else {
    const id = (await f.evaluate(() => window.lyra.invoke('sky:get'))).sky.activeId!
    await f.evaluate(([i, u]) => window.lyra.invoke('tabs:navigate', { id: i as string, url: u as string }), [id, url])
  }
  await expect.poll(() => pageDe(app, url.split('/page')[0])).toBeDefined()
  const p = pageDe(app, url.split('/page')[0])!
  await expect.poll(() => vues.some((v) => v.chemin === '/tiers.gif') && (!scriptServi || vues.some((v) => v.chemin === '/ext.js'))).toBe(true)
  await expect.poll(() => p.evaluate(() => document.readyState)).toBe('complete')
  return p
}

test('cookies « 1re partie » : le cookie tiers est refusé, celui du site gardé ; supprimer la règle rétablit le défaut sans redémarrage', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    // Témoin : sans règle, les deux cookies sont acceptés (sinon la suite ne prouverait rien).
    await charger(app, fenetre, `${SITE()}/page`, true)
    await expect.poll(() => cookies(app)).toEqual(['premier', 'tiers'])

    await viderCookies(app)
    await regle(fenetre, '127.0.0.1', { cookies: 'premiere-partie' })
    await charger(app, fenetre, `${SITE()}/page`)
    await expect.poll(() => cookies(app)).toEqual(['premier'])
    // Le serveur n'a reçu aucun cookie tiers en retour : la 2e visite n'envoie `tiers` à personne.
    await charger(app, fenetre, `${SITE()}/page`)
    expect(vues.find((v) => v.chemin === '/tiers.gif')!.entetes.cookie).toBeUndefined()

    // Suppression de la règle : comportement par défaut, sans redémarrage.
    await supprimer(fenetre, '127.0.0.1')
    await viderCookies(app)
    await charger(app, fenetre, `${SITE()}/page`)
    await expect.poll(() => cookies(app)).toEqual(['premier', 'tiers'])
  } finally {
    await app.close()
  }
})

test('cookies « Bloqués » : aucun cookie, ni envoyé ni reçu', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await regle(fenetre, '127.0.0.1', { cookies: 'bloques' })
    await charger(app, fenetre, `${SITE()}/page`, true)
    await page_attendre()
    expect(await cookies(app)).toEqual([])
  } finally {
    await app.close()
  }
})
const page_attendre = (): Promise<void> => new Promise((ok) => setTimeout(ok, 500))

/** Cookies présents au lancement suivant (même dossier de données) d'une règle cookies donnée. */
async function cookiesApresRedemarrage(mode: 'tous' | 'session'): Promise<string[]> {
  const dossier = mkdtempSync(join(tmpdir(), 'lyra-cookies-'))
  try {
    const un = await lancerLyra({ LYRA_USER_DATA: dossier })
    try {
      await regle(un.fenetre, '127.0.0.1', { cookies: mode })
      await charger(un.app, un.fenetre, `${SITE()}/page`, true)
      await expect.poll(() => cookies(un.app)).toEqual(['premier', 'tiers'])
    } finally {
      await un.app.close()
    }
    const deux = await lancerLyra({ LYRA_USER_DATA: dossier })
    try {
      return await cookies(deux.app)
    } finally {
      await deux.app.close()
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
}

test('cookies « Session seulement » : gardés pendant l’exécution, purgés à la fermeture (cookie tiers compris) ; « Tous » les conserve', async () => {
  test.setTimeout(180_000)
  expect(await cookiesApresRedemarrage('tous')).toEqual(['premier', 'tiers'])
  expect(await cookiesApresRedemarrage('session')).toEqual([])
})

const motifSafari = /Version\/\d+\.\d+ Safari\/605\.1\.15$/
const indices = (v: Vue): string[] => Object.keys(v.entetes).filter((k) => k.startsWith('sec-ch-ua'))

test('user-agent par site : seul le site de la page principale reçoit l’alternatif, navigator.userAgent et Sec-CH-UA concordent', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    // Témoin : identité par défaut de Lyra (Chrome N réel, indices client envoyés).
    const p = await charger(app, fenetre, `${SITE()}/page`, true)
    const defaut = await p.evaluate(() => navigator.userAgent)
    expect(defaut).toMatch(/Chrome\/\d+\.\d+\.\d+\.\d+ Safari\/537\.36$/)
    expect(defaut).not.toMatch(/Electron|lyra/i)
    expect(vues.find((v) => v.chemin === '/page')!.entetes['user-agent']).toBe(defaut)

    // Règle Safari sur le site : la page, ses sous-ressources (même tierces) et navigator.userAgent.
    await regle(fenetre, '127.0.0.1', { ua: 'safari' })
    const s = await charger(app, fenetre, `${SITE()}/page`)
    const ua = await s.evaluate(() => navigator.userAgent)
    expect(ua).toMatch(motifSafari)
    expect(ua).not.toContain('Chrome')
    for (const v of vues) {
      expect(v.entetes['user-agent'], `${v.hote}${v.chemin}`).toBe(ua)
      expect(indices(v), `${v.hote}${v.chemin}`).toEqual([])
    }
    // navigator suit le profil : Safari n'a pas de userAgentData.
    expect(await s.evaluate(() => ({ platform: navigator.platform, vendor: navigator.vendor, uad: (navigator as unknown as { userAgentData?: unknown }).userAgentData === undefined }))).toEqual({ platform: 'MacIntel', vendor: 'Apple Computer, Inc.', uad: true })

    // La page d'un AUTRE site (localhost) qui appelle 127.0.0.1 : identité par défaut (c'est la page principale qui compte).
    const l = await charger(app, fenetre, `${TIERS()}/page`)
    expect(await l.evaluate(() => navigator.userAgent)).toBe(defaut)
    const versSite = vues.find((v) => v.hote === '127.0.0.1' && v.chemin === '/tiers.gif')!
    expect(versSite.entetes['user-agent']).toBe(defaut)

    // Suppression de la règle : retour au défaut sans redémarrage.
    await supprimer(fenetre, '127.0.0.1')
    const d = await charger(app, fenetre, `${SITE()}/page`)
    expect(await d.evaluate(() => navigator.userAgent)).toBe(defaut)
    expect(vues.find((v) => v.chemin === '/page')!.entetes['user-agent']).toBe(defaut)
  } finally {
    await app.close()
  }
})

test('user-agent « Chrome (Windows) » et « Firefox » : en-têtes et navigator alignés sur la même identité', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await regle(fenetre, '127.0.0.1', { ua: 'chrome-windows' })
    const p = await charger(app, fenetre, `${SITE()}/page`, true)
    const ua = await p.evaluate(() => navigator.userAgent)
    expect(ua).toContain('Windows NT 10.0')
    for (const v of vues) {
      expect(v.entetes['user-agent']).toBe(ua)
      // Lyra n'envoie aucun indice client avec une identité réécrite ; s'il y en avait, ils annonceraient Windows.
      if (v.entetes['sec-ch-ua-platform']) expect(v.entetes['sec-ch-ua-platform']).toBe('"Windows"')
    }
    expect(await p.evaluate(() => { const u = (navigator as unknown as { userAgentData: { platform: string; mobile: boolean } }).userAgentData; return [navigator.platform, u.platform, u.mobile] })).toEqual(['Win32', 'Windows', false])

    await regle(fenetre, '127.0.0.1', { ua: 'firefox' })
    const f = await charger(app, fenetre, `${SITE()}/page`)
    expect(await f.evaluate(() => navigator.userAgent)).toMatch(/Gecko\/20100101 Firefox\/\d+\.0$/)
    expect(await f.evaluate(() => [navigator.platform, navigator.vendor, (navigator as unknown as { userAgentData?: unknown }).userAgentData])).toEqual(['Win32', '', undefined])
    // Les iframes de la page suivent la page principale (même preload, règle du site de la page principale).
  } finally {
    await app.close()
  }
})

test('scripts « Bloqués » : ni le script externe ni l’inline ne s’exécutent ; supprimer la règle les rétablit sans redémarrage', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const exec = (p: Page) => p.evaluate(() => ({ ext: (window as unknown as { __ext?: boolean }).__ext === true, inline: (window as unknown as { __inline?: boolean }).__inline === true }))
    // Témoin.
    const p = await charger(app, fenetre, `${SITE()}/page`, true)
    expect(await exec(p)).toEqual({ ext: true, inline: true })

    await regle(fenetre, '127.0.0.1', { scripts: 'bloques' })
    const b = await charger(app, fenetre, `${SITE()}/page`, false, false)
    expect(await exec(b)).toEqual({ ext: false, inline: false })
    // La page elle-même est servie (la règle ne bloque pas le document) : seul l'en-tête CSP est ajouté.
    expect(vues.some((v) => v.chemin === '/page')).toBe(true)
    // Le navigateur n'a même pas demandé le script externe : la CSP l'a retenu avant le réseau.
    expect(vues.some((v) => v.chemin === '/ext.js')).toBe(false)
    // Un `javascript:` lancé par la page est refusé par la même CSP (script-src 'none' couvre aussi cette forme)...
    await b.evaluate(() => { location.href = 'javascript:void(window.__js = true)' })
    await new Promise((ok) => setTimeout(ok, 300))
    expect(await b.evaluate(() => (window as unknown as { __js?: boolean }).__js === true)).toBe(false)
    // ... mais pas celui que l'utilisateur lance lui-même (barre d'adresse, signet) : limite documentée de la règle.
    const id = (await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).sky.activeId!
    await fenetre.evaluate((i) => window.lyra.invoke('tabs:navigate', { id: i, url: 'javascript:void(window.__signet = true)' }), id)
    await expect.poll(() => b.evaluate(() => (window as unknown as { __signet?: boolean }).__signet === true)).toBe(true)

    await supprimer(fenetre, '127.0.0.1')
    const d = await charger(app, fenetre, `${SITE()}/page`)
    expect(await exec(d)).toEqual({ ext: true, inline: true })
  } finally {
    await app.close()
  }
})
