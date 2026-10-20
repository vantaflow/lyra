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
      return r.end(`<!doctype html><title>reseau</title><img src="${autre}/tiers.gif"><script src="/ext.js"></script><script>window.__inline = true; window.__uaInline = navigator.userAgent</script>`)
    }
    // Page à deux iframes : une du site (même domaine enregistrable), une de l'autre hôte (tiers). Son script pose et relit des cookies en JavaScript.
    if (chemin === '/page-cadre') {
      r.setHeader('content-type', 'text/html')
      return r.end(`<!doctype html><title>cadres</title><script>window.__pageEcrit = (document.cookie = 'pagejs=1; Max-Age=3600; SameSite=None; Secure'); window.__pageLu = document.cookie</script><iframe id="meme" src="/cadre"></iframe><iframe id="tiers" src="${autre}/cadre"></iframe>`)
    }
    if (chemin === '/cadre') {
      r.setHeader('content-type', 'text/html')
      // Le cookie porte le nom de l'hôte de la frame ; une iframe about:blank qu'elle crée tente la même chose (frame héritée).
      return r.end(`<!doctype html><title>cadre</title><body><script>
        var h = location.hostname, att = '=1; Max-Age=3600; SameSite=None; Secure'
        try { document.cookie = 'cadrejs-' + h + att } catch (e) {}
        window.__lecture = document.cookie
        window.__store = typeof cookieStore
        var f = document.createElement('iframe'); document.body.append(f)
        try { f.contentDocument.cookie = 'heritejs-' + h + att } catch (e) {}
        window.__herite = f.contentDocument.cookie
        window.__fini = true
      </script>`)
    }
    // Contournements du relais d'iframes : iframe imbriquée créée dans le document de l'enfant, getter natif emprunté au realm enfant.
    if (chemin === '/page-contourne') {
      r.setHeader('content-type', 'text/html')
      return r.end(`<!doctype html><title>contourne</title><body><script>
        var att = '=1; Max-Age=3600; SameSite=None; Secure'
        var a = document.createElement('iframe'); document.body.append(a)
        var cw = a.contentWindow, d = cw.document
        var g = d.createElement('iframe'); d.body.append(g)
        try { g.contentDocument.cookie = 'petitefille' + att } catch (e) {}
        var emprunte = Object.getOwnPropertyDescriptor(cw.HTMLIFrameElement.prototype, 'contentWindow').get
        var h = d.createElement('iframe'); d.body.append(h)
        var w = emprunte.call(h)
        try { w.document.cookie = 'emprunte' + att } catch (e) {}
        window.__r = { petite: g.contentDocument.cookie, emprunte: w.document.cookie, store: typeof w.cookieStore }
      </script>`)
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

/** `domaine:nom` de chaque cookie (le domaine sans point initial) et s'il est de session. */
const cookiesDetail = (app: ElectronApplication): Promise<Array<{ cle: string; session: boolean }>> =>
  app.evaluate(
    async ({ session }, p) =>
      (await session.fromPartition(p).cookies.get({}))
        .map((c) => ({ cle: `${c.domain!.replace(/^\./, '')}:${c.name}`, session: c.session === true }))
        .sort((a, b) => a.cle.localeCompare(b.cle)),
    PARTITION
  )
const cles = async (app: ElectronApplication): Promise<string[]> => (await cookiesDetail(app)).map((c) => c.cle)
const poserCookie = (app: ElectronApplication, url: string, nom: string): Promise<void> =>
  app.evaluate(({ session }, [p, u, n]) => session.fromPartition(p).cookies.set({ url: u, name: n, value: '1', expirationDate: Math.floor(Date.now() / 1000) + 3600 }), [PARTITION, url, nom])

const regle = (f: Page, cle: string, r: Record<string, unknown>): Promise<void> => f.evaluate(([c, x]) => window.lyra.invoke('sites:ecrire', { cle: c as string, regle: x as Record<string, unknown> }), [cle, r])
const supprimer = (f: Page, cle: string): Promise<void> => f.evaluate((c) => window.lyra.invoke('sites:supprimer', c), cle)

const pageDe = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

/** Ouvre l'adresse dans l'étoile active (nouvelle étoile si `premiere`) et rend la page web correspondante. */
async function naviguer(app: ElectronApplication, f: Page, url: string, premiere: boolean, debut: string): Promise<Page> {
  vues.length = 0
  if (premiere) await f.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), url)
  else {
    const id = (await f.evaluate(() => window.lyra.invoke('sky:get'))).sky.activeId!
    await f.evaluate(([i, u]) => window.lyra.invoke('tabs:navigate', { id: i as string, url: u as string }), [id, url])
  }
  await expect.poll(() => pageDe(app, debut)).toBeDefined()
  return pageDe(app, debut)!
}

/** Page à deux iframes (`/page-cadre`) : attend que les deux cadres aient exécuté leur script. */
async function chargerCadres(app: ElectronApplication, f: Page, premiere = false): Promise<Page> {
  const p = await naviguer(app, f, `${SITE()}/page-cadre`, premiere, SITE())
  await expect.poll(() => vues.filter((v) => v.chemin === '/cadre').length).toBe(2)
  await expect.poll(async () => (await Promise.all(p.frames().filter((x) => x !== p.mainFrame()).map((x) => x.evaluate(() => (window as unknown as { __fini?: boolean }).__fini === true).catch(() => false)))).filter(Boolean).length).toBe(2)
  return p
}
const cadre = (p: Page, debut: string) => p.frames().find((x) => x.url().startsWith(debut))!
const etatCadre = (p: Page, debut: string) =>
  cadre(p, debut).evaluate(() => {
    const w = window as unknown as { __lecture: string; __store: string; __herite: string }
    const liste = (c: string): string[] => c.split('; ').filter(Boolean).sort()
    return { lecture: liste(w.__lecture), store: w.__store, herite: liste(w.__herite) }
  })

/** Ouvre l'adresse dans l'étoile active et attend que la page, son image tierce et (sauf `scriptServi` faux : script bloqué) son script aient été servis. */
async function charger(app: ElectronApplication, f: Page, url: string, premiere = false, scriptServi = true): Promise<Page> {
  const p = await naviguer(app, f, url, premiere, url.split('/page')[0])
  await expect.poll(() => vues.some((v) => v.chemin === '/tiers.gif') && (!scriptServi || vues.some((v) => v.chemin === '/ext.js'))).toBe(true)
  // Une navigation en cours détruit le contexte d'évaluation : on réessaie.
  await expect.poll(() => p.evaluate(() => document.readyState).catch(() => '')).toBe('complete')
  return p
}

test('cookies « 1re partie » : le cookie tiers est refusé, celui du site gardé ; supprimer la règle rétablit le défaut sans redémarrage', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    // Témoin : sans règle, les deux cookies sont acceptés (sinon la suite ne prouverait rien), et le cookie tiers est renvoyé au tiers.
    await charger(app, fenetre, `${SITE()}/page`, true)
    await expect.poll(() => cookies(app)).toEqual(['premier', 'tiers'])
    await charger(app, fenetre, `${SITE()}/page`)
    expect(vues.find((v) => v.chemin === '/tiers.gif')!.entetes.cookie).toBe('tiers=1')

    // La règle arrive APRÈS le cookie tiers : il est déjà dans le pot, mais il n'est plus envoyé (en-tête `cookie` absent sur /tiers.gif).
    await regle(fenetre, '127.0.0.1', { cookies: 'premiere-partie' })
    await charger(app, fenetre, `${SITE()}/page`)
    expect(vues.find((v) => v.chemin === '/tiers.gif')!.entetes.cookie).toBeUndefined()
    // Le cookie du site, lui, est toujours envoyé à la page.
    expect(vues.find((v) => v.chemin === '/page')!.entetes.cookie).toBe('premier=1')

    // Cookie tiers refusé à la réception : pot vidé, un seul cookie revient.
    await viderCookies(app)
    await charger(app, fenetre, `${SITE()}/page`)
    await expect.poll(() => cookies(app)).toEqual(['premier'])

    // Suppression de la règle : comportement par défaut, sans redémarrage.
    await supprimer(fenetre, '127.0.0.1')
    await viderCookies(app)
    await charger(app, fenetre, `${SITE()}/page`)
    await expect.poll(() => cookies(app)).toEqual(['premier', 'tiers'])
  } finally {
    await app.close()
  }
})

test('cookies « 1re partie » : document.cookie et cookieStore d’une iframe tierce (et de la frame about:blank qu’elle crée) sont neutralisés, ceux du site restent', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    // Témoin : sans règle, tout le monde écrit et lit, cookieStore existe, la page principale comprise.
    const t = await chargerCadres(app, fenetre, true)
    await expect.poll(() => cles(app)).toEqual(['127.0.0.1:cadrejs-127.0.0.1', '127.0.0.1:heritejs-127.0.0.1', '127.0.0.1:pagejs', 'localhost:cadrejs-localhost', 'localhost:heritejs-localhost'])
    await viderCookies(app)
    await poserCookie(app, TIERS(), 'tiersdejapose')
    await regle(fenetre, '127.0.0.1', { cookies: 'premiere-partie' })
    const p = await chargerCadres(app, fenetre)
    expect(p).toBe(t)

    // Iframe tierce : lecture vide (malgré le cookie du tiers dans le pot), écriture ignorée, cookieStore absent, frame héritée comprise.
    expect(await etatCadre(p, TIERS())).toEqual({ lecture: [], store: 'undefined', herite: [] })
    // Iframe du site et page principale : inchangées.
    expect(await etatCadre(p, `${SITE()}/cadre`)).toEqual({ lecture: ['cadrejs-127.0.0.1=1', 'pagejs=1'], store: 'object', herite: ['cadrejs-127.0.0.1=1', 'heritejs-127.0.0.1=1', 'pagejs=1'] })
    expect(await p.evaluate(() => (window as unknown as { __pageLu: string }).__pageLu)).toBe('pagejs=1')
    await expect.poll(() => cles(app)).toEqual(['127.0.0.1:cadrejs-127.0.0.1', '127.0.0.1:heritejs-127.0.0.1', '127.0.0.1:pagejs', 'localhost:tiersdejapose'])

    // Suppression de la règle : l'iframe tierce retrouve ses cookies sans redémarrage.
    await supprimer(fenetre, '127.0.0.1')
    const d = await chargerCadres(app, fenetre)
    expect((await etatCadre(d, TIERS())).store).toBe('object')
    await expect.poll(async () => (await cles(app)).includes('localhost:cadrejs-localhost')).toBe(true)
  } finally {
    await app.close()
  }
})

test('cookies « Bloqués » : ni envoyés ni reçus, ni lus ou écrits en JavaScript (toutes les frames), cookies existants et insérés supprimés', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  try {
    // Cookies existants avant la règle : celui du site et celui d'un autre site (l'autre hôte, sans règle).
    await poserCookie(app, SITE(), 'ancien')
    await poserCookie(app, TIERS(), 'ailleurs')
    expect(await cles(app)).toEqual(['127.0.0.1:ancien', 'localhost:ailleurs'])
    // Écriture de la règle : le cookie du site est purgé sans redémarrage, celui de l'autre site reste.
    await regle(fenetre, '127.0.0.1', { cookies: 'bloques' })
    await expect.poll(() => cles(app)).toEqual(['localhost:ailleurs'])

    // Cookie inséré par un autre chemin que la page (API de session) : supprimé aussitôt ; celui de l'autre site reste.
    await poserCookie(app, SITE(), 'direct')
    await expect.poll(() => cles(app)).toEqual(['localhost:ailleurs'])

    // Page et iframes (site et tiers) : aucune écriture ni lecture JavaScript, cookieStore absent partout, rien dans le pot pour le site.
    const p = await chargerCadres(app, fenetre, true)
    await page_attendre()
    expect(await cles(app)).toEqual(['localhost:ailleurs'])
    expect(await p.evaluate(() => (window as unknown as { __pageLu: string }).__pageLu)).toBe('')
    expect(await etatCadre(p, `${SITE()}/cadre`)).toEqual({ lecture: [], store: 'undefined', herite: [] })
    expect(await etatCadre(p, TIERS())).toEqual({ lecture: [], store: 'undefined', herite: [] })

    // Frames srcdoc et blob: : leur propre script lit et écrit (postMessage vers le parent, sans contentWindow) : rien, et rien dans le pot.
    expect(
      await p.evaluate(async () => {
        const html = '<script>document.cookie = "heritemsg=1; Max-Age=3600; SameSite=None; Secure"; parent.postMessage({ c: document.cookie, s: typeof cookieStore }, "*")<\/script>'
        const monter = (regler: (f: HTMLIFrameElement) => void): Promise<{ c: string; s: string }> =>
          new Promise((ok) => {
            const f = document.createElement('iframe')
            const ecoute = (e: MessageEvent): void => {
              window.removeEventListener('message', ecoute)
              ok(e.data as { c: string; s: string })
            }
            window.addEventListener('message', ecoute)
            regler(f)
            document.body.append(f)
          })
        return {
          srcdoc: await monter((f) => void (f.srcdoc = html)),
          blob: await monter((f) => void (f.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }))))
        }
      })
    ).toEqual({ srcdoc: { c: '', s: 'undefined' }, blob: { c: '', s: 'undefined' } })
    await page_attendre()
    expect(await cles(app)).toEqual(['localhost:ailleurs'])

    // Contournements du relais d'iframes (sous « Bloqués », toutes les frames) : petite-fille créée dans le document de l'enfant,
    // getter natif emprunté au prototype du realm enfant : cookie illisible et non écrit.
    const c = await naviguer(app, fenetre, `${SITE()}/page-contourne`, false, `${SITE()}/page-contourne`)
    await expect.poll(() => c.evaluate(() => (window as unknown as { __r?: unknown }).__r !== undefined)).toBe(true)
    expect(await c.evaluate(() => (window as unknown as { __r: unknown }).__r)).toEqual({ petite: '', emprunte: '', store: 'undefined' })
    await page_attendre()
    expect(await cles(app)).toEqual(['localhost:ailleurs'])

    // Page avec en-têtes : le Set-Cookie du serveur est retiré, le cookie du site n'est pas envoyé.
    await charger(app, fenetre, `${SITE()}/page`, false)
    await page_attendre()
    expect(await cles(app)).toEqual(['localhost:ailleurs'])
    expect(vues.find((v) => v.chemin === '/page')!.entetes.cookie).toBeUndefined()
  } finally {
    await app.close()
  }
})
const page_attendre = (): Promise<void> => new Promise((ok) => setTimeout(ok, 500))

test('cookies « Bloqués » sur un sous-domaine : le cookie du domaine parent posé ailleurs survit, celui de l’hôte est supprimé', async () => {
  test.setTimeout(120_000)
  const { app, fenetre } = await lancerLyra()
  const A = (): string => `http://a.exemple.localhost:${PORT}`
  const B = (): string => `http://b.exemple.localhost:${PORT}`
  const poserParent = (): Promise<void> =>
    app.evaluate(({ session }, [p, u]) => session.fromPartition(p).cookies.set({ url: u, domain: '.exemple.localhost', name: 'parent', value: '1', expirationDate: Math.floor(Date.now() / 1000) + 3600 }), [PARTITION, B()])
  try {
    await poserParent()
    await poserCookie(app, A(), 'hote')
    await poserCookie(app, B(), 'frere')
    expect(await cles(app)).toEqual(['a.exemple.localhost:hote', 'b.exemple.localhost:frere', 'exemple.localhost:parent'])
    // Règle sur a.exemple.localhost seul : son cookie hôte part ; le cookie de domaine parent (posé par b.exemple.localhost, sans règle) et celui du frère restent.
    await regle(fenetre, 'a.exemple.localhost', { cookies: 'bloques' })
    await expect.poll(() => cles(app)).toEqual(['b.exemple.localhost:frere', 'exemple.localhost:parent'])
    // Réinséré par un autre chemin que la page : il reste aussi.
    await poserParent()
    await page_attendre()
    expect(await cles(app)).toEqual(['b.exemple.localhost:frere', 'exemple.localhost:parent'])
    // La page elle-même ne reçoit pas le cookie parent (en-tête Cookie retiré).
    await charger(app, fenetre, `${A()}/page`, true)
    expect(vues.find((v) => v.chemin === '/page')!.hote).toBe('a.exemple.localhost')
    expect(vues.find((v) => v.chemin === '/page')!.entetes.cookie).toBeUndefined()
    await page_attendre()
    expect(await cles(app)).toEqual(['b.exemple.localhost:frere', 'exemple.localhost:parent'])
  } finally {
    await app.close()
  }
})

/**
 * Cookies (`domaine:nom`) du lancement suivant (même dossier de données) quand la règle du site « 127.0.0.1 » est `mode`.
 * Avant la règle, la visite de l'AUTRE hôte (localhost) pose un cookie à lui et un cookie tiers sur 127.0.0.1 ; sous la règle,
 * la page du site pose les siens et son image (localhost) un cookie tiers.
 */
async function cookiesApresRedemarrage(mode: 'tous' | 'session'): Promise<{ pendant: Array<{ cle: string; session: boolean }>; apres: string[] }> {
  const dossier = mkdtempSync(join(tmpdir(), 'lyra-cookies-'))
  try {
    const un = await lancerLyra({ LYRA_USER_DATA: dossier })
    let pendant: Array<{ cle: string; session: boolean }>
    try {
      await charger(un.app, un.fenetre, `${TIERS()}/page`, true)
      await expect.poll(() => cles(un.app)).toEqual(['127.0.0.1:tiers', 'localhost:premier'])
      await regle(un.fenetre, '127.0.0.1', { cookies: mode })
      await charger(un.app, un.fenetre, `${SITE()}/page`)
      await expect.poll(() => cles(un.app)).toEqual(['127.0.0.1:premier', '127.0.0.1:tiers', 'localhost:premier', 'localhost:tiers'])
      pendant = await cookiesDetail(un.app)
    } finally {
      await un.app.close()
    }
    const deux = await lancerLyra({ LYRA_USER_DATA: dossier })
    try {
      return { pendant, apres: await cles(deux.app) }
    } finally {
      await deux.app.close()
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
}

test('cookies « Session seulement » : cookies de session pendant l’exécution, absents au lancement suivant ; ceux d’un autre domaine posés ailleurs restent ; « Tous » conserve tout', async () => {
  test.setTimeout(180_000)
  const tous = await cookiesApresRedemarrage('tous')
  expect(tous.pendant.every((c) => !c.session)).toBe(true)
  expect(tous.apres).toEqual(['127.0.0.1:premier', '127.0.0.1:tiers', 'localhost:premier', 'localhost:tiers'])

  const session = await cookiesApresRedemarrage('session')
  // Pendant l'exécution : seul le cookie posé par le site lui-même est un cookie de session (ni Expires ni Max-Age) ; le cookie tiers de localhost
  // garde sa durée (c'est un autre site, qui peut avoir ses propres règles) ; le cookie que localhost avait posé lors de sa propre visite aussi,
  // et le cookie tiers antérieur du site reste persistant (jusqu'à la purge).
  expect(session.pendant).toEqual([
    { cle: '127.0.0.1:premier', session: true },
    { cle: '127.0.0.1:tiers', session: false },
    { cle: 'localhost:premier', session: false },
    { cle: 'localhost:tiers', session: false }
  ])
  // Au lancement suivant : plus rien du site de la règle (cookie de session non restauré, cookie persistant antérieur purgé) ;
  // les cookies de l'autre domaine (posés ailleurs, ou en tiers sous la page) n'ont PAS été purgés.
  expect(session.apres).toEqual(['localhost:premier', 'localhost:tiers'])
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
    // Le script inline de la page lit navigator.userAgent AVANT le DOMContentLoaded : l'identité est déjà celle de Lyra.
    expect(await p.evaluate(() => (window as unknown as { __uaInline: string }).__uaInline)).toBe(defaut)
    expect(defaut).toMatch(/Chrome\/\d+\.\d+\.\d+\.\d+ Safari\/537\.36$/)
    expect(defaut).not.toMatch(/Electron|lyra/i)
    expect(vues.find((v) => v.chemin === '/page')!.entetes['user-agent']).toBe(defaut)

    // Règle Safari sur le site : la page, ses sous-ressources (même tierces) et navigator.userAgent.
    await regle(fenetre, '127.0.0.1', { ua: 'safari' })
    const s = await charger(app, fenetre, `${SITE()}/page`)
    const ua = await s.evaluate(() => navigator.userAgent)
    expect(ua).toMatch(motifSafari)
    expect(ua).not.toContain('Chrome')
    // Timing : le script inline de la page (exécuté pendant l'analyse du document) a déjà vu l'identité alternative.
    expect(await s.evaluate(() => (window as unknown as { __uaInline: string }).__uaInline)).toBe(ua)
    // Frames héritées (about:blank, srcdoc, blob:) : même identité que la page principale. srcdoc et blob: lisent navigator.userAgent
    // depuis LEUR propre script (postMessage vers le parent), sans passer par `contentWindow` : c'est le preload hérité qui répond.
    expect(
      await s.evaluate(async () => {
        const html = '<script>parent.postMessage({ ua: navigator.userAgent, c: document.cookie }, "*")<\/script>'
        const monter = (regler: (f: HTMLIFrameElement) => void): Promise<string> =>
          new Promise((ok) => {
            const f = document.createElement('iframe')
            const ecoute = (e: MessageEvent): void => {
              window.removeEventListener('message', ecoute)
              ok((e.data as { ua: string }).ua)
            }
            window.addEventListener('message', ecoute)
            regler(f)
            document.body.append(f)
          })
        const vide = document.createElement('iframe')
        document.body.append(vide)
        return {
          blank: vide.contentWindow!.navigator.userAgent,
          srcdoc: await monter((f) => void (f.srcdoc = html)),
          blob: await monter((f) => void (f.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }))))
        }
      })
    ).toEqual({ blank: ua, srcdoc: ua, blob: ua })
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
