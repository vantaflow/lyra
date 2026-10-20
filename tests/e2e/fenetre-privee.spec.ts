import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lancerLyra } from './helpers'

// Petit serveur http local : /pose pose un cookie, toute autre adresse enregistre le cookie reçu.
let serveur: Server
let BASE = ''
const requetes: Array<{ chemin: string; cookie: string }> = []
test.beforeAll(async () => {
  serveur = createServer((q, r) => {
    const chemin = q.url ?? '/'
    requetes.push({ chemin, cookie: q.headers.cookie ?? '' })
    if (chemin.startsWith('/dl-')) {
      r.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${chemin.slice(1)}.txt"` })
      r.end('contenu')
      return
    }
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...(chemin === '/pose' ? { 'set-cookie': 'secret=1; Path=/' } : {}) })
    r.end(`<!doctype html><title>Web ${chemin}</title><p>${chemin}</p>`)
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  BASE = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`
})
test.afterAll(() => serveur.close())

const cookieVu = (chemin: string): string | undefined => requetes.find((r) => r.chemin === chemin)?.cookie
const interfaces = (app: ElectronApplication): Page[] => app.windows().filter((p) => p.url().includes('ui.html') && !p.url().includes('#overlay'))
const interfacePrivee = (app: ElectronApplication): Page | undefined => interfaces(app).find((p) => p.url().includes('#privee'))

/** Ouvre une fenêtre privée par l'entrée de menu ⌘ ⇧ N et renvoie sa vue d'interface. */
async function ouvrirPrivee(app: ElectronApplication, deja: Page[] = []): Promise<Page> {
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
  await expect.poll(() => interfaces(app).find((p) => p.url().includes('#privee') && !deja.includes(p))).toBeDefined()
  return interfaces(app).find((p) => p.url().includes('#privee') && !deja.includes(p))!
}

test('⌘ ⇧ N : entrée de menu active ; thème Aurore sur la fenêtre privée seulement', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const item = await app.evaluate(({ Menu }) => {
      const m = Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!
      return { label: m.label, accelerator: m.accelerator, enabled: m.enabled }
    })
    expect(item).toEqual({ label: 'Nouvelle fenêtre privée', accelerator: 'CmdOrCtrl+Shift+N', enabled: true })
    const privee = await ouvrirPrivee(app)
    const ciel = (p: Page): Promise<string> => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ciel').trim())
    // Les variables du thème privé (Aurore) arrivent par `theme:variables` juste après le chargement de la vue.
    await expect.poll(() => ciel(privee)).toBe('#2a1540')
    expect(await ciel(fenetre)).toBe('#15152e')
    await expect(privee.locator('html')).toHaveClass(/privee/)
    // Le bouton favori n'existe pas en privé : désactivé avec une explication.
    await privee.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/fav`)
    const etoile = privee.locator('.capsule .cb[aria-label="Ajouter aux favoris"]')
    await expect(etoile).toBeDisabled()
    await expect(etoile).toHaveAttribute('title', 'Favoris indisponibles en fenêtre privée')
    // La recherche dans la page reste utilisable en privé.
    await expect(privee.locator('.capsule .cb[aria-label="Rechercher dans la page"]')).toBeEnabled()
    expect(await privee.evaluate((u) => window.lyra.invoke('bookmarks:toggle', { url: u, title: 'Fav' }), `${BASE}/fav`)).toBe(false)
    expect(await fenetre.evaluate((u) => window.lyra.invoke('bookmarks:exists', { url: u }), `${BASE}/fav`)).toBe(false)
  } finally {
    await app.close()
  }
})

test('menu ⋯ : « Fenêtre privée » ouvre une fenêtre privée', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.getByRole('button', { name: 'Menu de la page' }).click()
    await expect.poll(() => app.windows().find((p) => p.url().includes('#overlay'))).toBeDefined()
    const overlay = app.windows().find((p) => p.url().includes('#overlay'))!
    await overlay.getByRole('menuitem', { name: /Fenêtre privée/ }).click()
    await expect.poll(() => interfacePrivee(app)).toBeDefined()
  } finally {
    await app.close()
  }
})

test('cookie posé en privé : absent de la fenêtre normale et de la privée suivante', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const a = await ouvrirPrivee(app)
    await a.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/pose`)
    await expect.poll(() => cookieVu('/pose')).toBe('')
    await a.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/lire-a`)
    await expect.poll(() => cookieVu('/lire-a')).toBe('secret=1')

    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/lire-normal`)
    await expect.poll(() => cookieVu('/lire-normal')).toBe('')

    const b = await ouvrirPrivee(app, [a])
    await b.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/lire-b`)
    await expect.poll(() => cookieVu('/lire-b')).toBe('')

    // Fenêtre A fermée (sa session est jetée) : une nouvelle privée repart encore de zéro.
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().sort((x, y) => x.id - y.id)[1].close())
    await expect.poll(() => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length)).toBe(2)
    const c = await ouvrirPrivee(app, [a, b])
    await c.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/lire-c`)
    await expect.poll(() => cookieVu('/lire-c')).toBe('')
  } finally {
    await app.close()
  }
})

test('historique : une visite en privé n’est pas écrite ; une visite normale l’est', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const privee = await ouvrirPrivee(app)
    await privee.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/histo-privee`)
    await expect.poll(() => cookieVu('/histo-privee')).toBeDefined()
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/histo-normale`)
    await expect
      .poll(() => fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: 'histo-normale' })).then((r) => r.length))
      .toBe(1)
    expect(await fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: 'histo-privee' }))).toEqual([])
  } finally {
    await app.close()
  }
})

test('session : une fenêtre privée n’est jamais sauvegardée ni restaurée', async () => {
  const premier = await lancerLyra()
  const userData = await premier.app.evaluate(({ app }) => app.getPath('userData'))
  try {
    const privee = await ouvrirPrivee(premier.app)
    await privee.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/session-privee`)
    await premier.fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/session-normale`)
    await expect(premier.fenetre.locator('.star')).toHaveCount(2)
    await expect.poll(() => cookieVu('/session-privee')).toBeDefined()
  } finally {
    await premier.app.close()
  }
  const fichier = join(userData, 'session.json')
  expect(existsSync(fichier)).toBe(true)
  const texte = readFileSync(fichier, 'utf8')
  expect(texte).toContain('session-normale')
  expect(texte).not.toContain('session-privee')
  const { app, fenetre } = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    await expect(fenetre.locator('.star')).toHaveCount(2)
    expect(interfacePrivee(app)).toBeUndefined()
    expect(interfaces(app)).toHaveLength(1)
  } finally {
    await app.close()
  }
})

test('nouvel onglet privé : bandeau, ni constellations, ni sites fréquents, ni compteur', async () => {
  const { app } = await lancerLyra()
  try {
    // Normale : le contenu complet.
    const normale = (): Page | undefined => app.windows().find((p) => p.url().startsWith('lyra://newtab'))
    await expect.poll(normale).toBeDefined()
    await expect(normale()!.getByText('Vos constellations')).toBeVisible()
    await expect(normale()!.getByText('Fenêtre privée')).toHaveCount(0)

    await ouvrirPrivee(app)
    await expect.poll(() => app.windows().filter((p) => p.url().startsWith('lyra://newtab')).length).toBe(2)
    const nouvelle = async (): Promise<Page | undefined> => {
      for (const p of app.windows().filter((w) => w.url().startsWith('lyra://newtab')))
        if ((await p.locator('.bandeau-prive').count()) > 0) return p
      return undefined
    }
    await expect.poll(async () => (await nouvelle()) !== undefined).toBe(true)
    const np = (await nouvelle())!
    await expect(np.locator('.bandeau-prive')).toContainText('Fenêtre privée')
    await expect(np.getByText('Vos constellations')).toHaveCount(0)
    await expect(np.getByText('Sites fréquents')).toHaveCount(0)
    await expect(np.getByText(/éléments bloqués/)).toHaveCount(0)
    await expect(np.getByText(/^(Bonsoir|Bonjour)\./)).toBeVisible()
    expect(await np.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(42, 21, 64)')
  } finally {
    await app.close()
  }
})

test('zoom par site : mémorisé en fenêtre normale, jamais en fenêtre privée', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const privee = await ouvrirPrivee(app)
    await privee.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/zoom-privee`)
    await expect.poll(() => cookieVu('/zoom-privee')).toBeDefined()
    // La requête arrive au serveur avant que la page soit validée : le zoom se mémorise d'après l'adresse de la page.
    await expect.poll(() => app.windows().some((w) => w.url() === `${BASE}/zoom-privee`)).toBe(true)
    expect(await privee.evaluate(() => window.lyra.invoke('tabs:zoom', { delta: 1 }))).toBeGreaterThan(1)
    expect((await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).sites).toEqual({})

    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/zoom-normale`)
    await expect.poll(() => cookieVu('/zoom-normale')).toBeDefined()
    await expect.poll(() => app.windows().some((w) => w.url() === `${BASE}/zoom-normale`)).toBe(true)
    expect(await fenetre.evaluate(() => window.lyra.invoke('tabs:zoom', { delta: 1 }))).toBeGreaterThan(1)
    await expect.poll(async () => Object.keys((await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).sites)).toHaveLength(1)
  } finally {
    await app.close()
  }
})

test('Boucliers : la bascule par site en fenêtre privée n’écrit rien dans les réglages', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const privee = await ouvrirPrivee(app)
    await privee.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/boucliers`)
    await expect.poll(() => cookieVu('/boucliers')).toBeDefined()
    await expect.poll(() => privee.evaluate(() => window.lyra.invoke('shields:get')).then((e) => e.origine)).toBe(BASE)
    expect((await privee.evaluate(() => window.lyra.invoke('shields:get'))).privee).toBe(true)
    await privee.evaluate((o) => window.lyra.invoke('shields:toggleSite', { origine: o, actif: false }), BASE)
    expect((await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).sites).toEqual({})
    // Fenêtre normale : la bascule s'écrit.
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/boucliers-n`)
    await expect.poll(() => fenetre.evaluate(() => window.lyra.invoke('shields:get')).then((e) => e.origine)).toBe(BASE)
    await fenetre.evaluate((o) => window.lyra.invoke('shields:toggleSite', { origine: o, actif: false }), BASE)
    expect((await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).sites[BASE]).toMatchObject({ boucliers: 'desactives' })
  } finally {
    await app.close()
  }
})

test('téléchargements : aucune trace (URL) en privé dans la liste ni dans telechargements.json', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const userData = await app.evaluate(({ app: a }) => a.getPath('userData'))
    const dossier = join(userData, 'dl')
    await fenetre.evaluate((d) => window.lyra.invoke('settings:set', { telechargements: { dossier: d, demander: false } }), dossier)
    const privee = await ouvrirPrivee(app)
    await privee.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/dl-prive`)
    await expect.poll(() => existsSync(join(dossier, 'dl-prive.txt'))).toBe(true)
    // Témoin : un téléchargement normal, lui, est listé et écrit.
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/dl-normal`)
    await expect.poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('downloads:list'))).filter((x) => x.etat === 'termine').length).toBe(1)
    const urls = (await fenetre.evaluate(() => window.lyra.invoke('downloads:list'))).map((x) => x.url)
    expect(urls).toEqual([`${BASE}/dl-normal`])
    const fichier = join(userData, 'telechargements.json')
    await expect.poll(() => existsSync(fichier) && readFileSync(fichier, 'utf8').includes('dl-normal')).toBe(true)
    expect(readFileSync(fichier, 'utf8')).not.toContain('dl-prive')
  } finally {
    await app.close()
  }
})

test('passerelles : ajouter, basculerSite et retirer sont refusés depuis une fenêtre privée, acceptés depuis une normale', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const privee = await ouvrirPrivee(app)
    const sites = (): Promise<string[]> => fenetre.evaluate(() => window.lyra.invoke('passerelles:etat')).then((e) => e.sites.map((s) => s.hote))
    await privee.evaluate(() => window.lyra.invoke('passerelles:ajouter', { hote: 'prive-ajout.fr' }))
    await privee.evaluate(() => window.lyra.invoke('passerelles:basculerSite', { hote: 'prive-bascule.fr' }))
    expect(await sites()).toEqual([])
    // Retrait d'un site (écriture de règle) : refusé aussi depuis la privée.
    await fenetre.evaluate(() => window.lyra.invoke('passerelles:ajouter', { hote: 'a-garder.fr' }))
    await privee.evaluate(() => window.lyra.invoke('passerelles:retirer', { hote: 'a-garder.fr' }))
    expect(await sites()).toEqual(['a-garder.fr'])
    await fenetre.evaluate(() => window.lyra.invoke('passerelles:retirer', { hote: 'a-garder.fr' }))
    expect(await sites()).toEqual([])
    // Fenêtre normale : mêmes appels, écrits.
    await fenetre.evaluate(() => window.lyra.invoke('passerelles:ajouter', { hote: 'normal-ajout.fr' }))
    await fenetre.evaluate(() => window.lyra.invoke('passerelles:basculerSite', { hote: 'normal-bascule.fr' }))
    expect(await sites()).toEqual(['normal-ajout.fr', 'normal-bascule.fr'])
  } finally {
    await app.close()
  }
})

const fixture = (nom: string): string => pathToFileURL(resolve(__dirname, 'fixtures', nom)).href
const pageOuverte = (app: ElectronApplication, adresse: string): Page | undefined => app.windows().find((w) => w.url() === adresse)

test("Ne pas déranger en fenêtre privée : rien n'est retenu ni livré, Notification.permission n'est pas « granted »", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    // Site autorisé dans le profil normal : la fenêtre privée ne doit pas le lire.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { sites: { 'file://': { permissions: { notifications: 'autoriser' } } } }))
    const privee = await ouvrirPrivee(app)
    const adresse = fixture('dnd.html')
    await privee.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), adresse)
    await expect.poll(() => pageOuverte(app, adresse)).toBeDefined()
    const p = pageOuverte(app, adresse)!
    await privee.evaluate(() => window.lyra.invoke('dnd:basculer', undefined))
    await expect.poll(async () => (await privee.evaluate(() => window.lyra.invoke('dnd:get'))).actif).toBe(true)
    const permission = await p.evaluate(() => {
      new Notification('Secrète', { body: 'corps' })
      return Notification.permission
    })
    expect(permission).not.toBe('granted')
    expect((await privee.evaluate(() => window.lyra.invoke('dnd:get'))).notifications).toBe(0)
    await privee.evaluate(() => window.lyra.invoke('dnd:basculer', undefined))
    await expect.poll(async () => (await privee.evaluate(() => window.lyra.invoke('dnd:get'))).actif).toBe(false)
    expect(await privee.evaluate(() => window.lyra.invoke('test:livraisons'))).toEqual([])
  } finally {
    await app.close()
  }
})

test("invite de permission : pas de case « Se souvenir » en fenêtre privée (proposée en fenêtre normale)", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const adresse = fixture('permissions.html')
    // Overlay (de n'importe quelle fenêtre) qui affiche la demande en cours.
    const avecDemande = async (): Promise<Page> => {
      let trouve: Page | undefined
      await expect
        .poll(async () => {
          trouve = undefined
          for (const w of app.windows().filter((x) => x.url().includes('#overlay'))) if ((await w.locator('.perm-texte').count()) > 0) trouve = w
          return trouve
        })
        .toBeDefined()
      return trouve!
    }
    const demander = async (ui: Page): Promise<Page> => {
      const avant = app.windows().filter((w) => w.url() === adresse)
      await ui.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), adresse)
      await expect.poll(() => app.windows().filter((w) => w.url() === adresse && !avant.includes(w)).length).toBe(1)
      void app.windows().find((w) => w.url() === adresse && !avant.includes(w))!.evaluate(() => void Notification.requestPermission())
      return avecDemande()
    }
    const privee = await ouvrirPrivee(app)
    const o = await demander(privee)
    await expect(o.locator('.perm-carte')).toBeVisible()
    await expect(o.locator('.perm-souvenir')).toHaveCount(0)
    await o.getByRole('button', { name: 'Refuser' }).click()
    // Témoin : en fenêtre normale la case existe.
    const o2 = await demander(fenetre)
    await expect(o2.locator('.perm-souvenir')).toHaveCount(1)
    await o2.getByRole('button', { name: 'Refuser' }).click()
  } finally {
    await app.close()
  }
})
