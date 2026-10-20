import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancerLyra } from './helpers'

// Petit serveur http local : une page à titre reconnaissable pour chaque chemin.
let serveur: Server
let BASE = ''
test.beforeAll(async () => {
  serveur = createServer((q, r) => {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    r.end(`<!doctype html><title>Zorglub ${q.url}</title><p>${q.url}</p>`)
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  BASE = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`
})
test.afterAll(() => serveur.close())

const page = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))
const menu = (app: ElectronApplication, id: string): Promise<void> =>
  app.evaluate(({ Menu }, i) => Menu.getApplicationMenu()!.getMenuItemById(i)!.click(), id)
const etatDnd = (f: Page) => f.evaluate(() => window.lyra.invoke('dnd:get'))
const reglages = (f: Page) => f.evaluate(() => window.lyra.invoke('settings:get'))

async function ouvrirReglages(app: ElectronApplication, fenetre: Page, route: string): Promise<Page> {
  await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), `lyra://settings#/${route}`)
  await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
  const r = page(app, 'lyra://settings')!
  await r.evaluate((h) => { location.hash = h }, `#/${route}`)
  return r
}

const cookie = (nom: string) => ({ url: 'https://exemple.test', name: nom, value: '1', expirationDate: Math.floor(Date.now() / 1000) + 3600 })
const poserCookie = (app: ElectronApplication, nom: string): Promise<void> =>
  app.evaluate(async ({ session }, c) => {
    const s = session.fromPartition('persist:lyra')
    await s.cookies.set(c)
    await s.cookies.flushStore()
  }, cookie(nom))
const nombreCookies = (app: ElectronApplication): Promise<number> =>
  app.evaluate(async ({ session }) => (await session.fromPartition('persist:lyra').cookies.get({})).length)

test('aucune section du sommaire n’est un emplacement vide (hors Importer, Extensions, À propos)', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre, 'confidentialite')
    for (const [route, titre] of [
      ['confidentialite', 'Confidentialité'],
      ['nepasderanger', 'Ne pas déranger'],
      ['demarrage', 'Démarrage et sessions'],
      ['styles', 'Styles et scripts'],
      ['sauvegarde', 'Sauvegarde et profils'],
      ['boucliers', 'Boucliers']
    ]) {
      await r.evaluate((h) => { location.hash = h }, `#/${route}`)
      await expect(r.locator('h1')).toHaveText(titre)
      await expect(r.locator('.card').first()).toBeVisible()
      await expect(r.locator('.emplacement')).toHaveCount(0)
    }
  } finally {
    await app.close()
  }
})

test('lyra://shields ouvre la section Boucliers', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), 'lyra://shields')
    await expect.poll(() => page(app, 'lyra://shields')).toBeDefined()
    await expect(page(app, 'lyra://shields')!.locator('h1')).toHaveText('Boucliers')
  } finally {
    await app.close()
  }
})

test('Ne pas déranger : dnd.duree choisie dans la section est la durée proposée par ⌘ ⇧ D', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre, 'nepasderanger')
    await expect(r.getByRole('button', { name: '1 h' })).toHaveAttribute('aria-pressed', 'true')
    await r.getByRole('button', { name: '30 min' }).click()
    await expect.poll(async () => (await reglages(fenetre)).dnd.duree).toBe(30)
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etatDnd(fenetre)).duree).toBe(30)
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etatDnd(fenetre)).actif).toBe(false)

    await r.getByRole('button', { name: "Jusqu'à l'arrêt" }).click()
    await expect.poll(async () => (await reglages(fenetre)).dnd.duree).toBe('arret')
    await menu(app, 'ne-pas-deranger')
    await expect.poll(async () => (await etatDnd(fenetre)).duree).toBe('arret')
    expect((await etatDnd(fenetre)).fin).toBeNull()
  } finally {
    await app.close()
  }
})

test('Ne pas déranger : les exceptions sont la vue des règles par site, les retirer écrit la règle', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(async () => {
      await window.lyra.invoke('sites:ecrire', { cle: 'https://alpha.test', regle: { exceptionDnd: true, zoom: 1.25 } })
      await window.lyra.invoke('sites:ecrire', { cle: 'beta.test', regle: { exceptionDnd: true } })
      await window.lyra.invoke('sites:ecrire', { cle: 'https://gamma.test', regle: { zoom: 1.1 } })
    })
    const r = await ouvrirReglages(app, fenetre, 'nepasderanger')
    await expect(r.locator('[data-exception]')).toHaveCount(2)
    await expect(r.locator('[data-exception="https://alpha.test"]')).toBeVisible()
    await expect(r.locator('[data-exception="beta.test"]')).toBeVisible()
    await expect(r.locator('[data-exception="https://gamma.test"]')).toHaveCount(0)

    await r.getByRole('button', { name: "Retirer l'exception de https://alpha.test" }).click()
    await expect(r.locator('[data-exception="https://alpha.test"]')).toHaveCount(0)
    const regles = await fenetre.evaluate(() => window.lyra.invoke('sites:lister'))
    // La règle garde ses autres champs ; l'exception est retirée (aucun second stockage).
    expect(regles['https://alpha.test']).toEqual({ zoom: 1.25 })
    expect(regles['beta.test']).toEqual({ exceptionDnd: true })

    await r.getByRole('button', { name: "Retirer l'exception de beta.test" }).click()
    await expect(r.locator('#aucune-exception')).toBeVisible()
    expect((await fenetre.evaluate(() => window.lyra.invoke('sites:lister')))['beta.test']?.exceptionDnd).toBeUndefined()
  } finally {
    await app.close()
  }
})

test('Confidentialité : la purge immédiate demande confirmation puis efface les cookies posés', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await poserCookie(app, 'a')
    await poserCookie(app, 'b')
    expect(await nombreCookies(app)).toBe(2)
    const r = await ouvrirReglages(app, fenetre, 'confidentialite')
    await r.locator('#purger').click()
    // Annuler : rien n'est effacé.
    await expect(r.locator('#confirmer-purge')).toBeVisible()
    await r.getByRole('button', { name: 'Annuler' }).click()
    await expect(r.locator('#confirmer-purge')).toHaveCount(0)
    expect(await nombreCookies(app)).toBe(2)
    // Confirmer.
    await r.locator('#purger').click()
    await r.locator('#confirmer-purge').click()
    await expect.poll(() => nombreCookies(app)).toBe(0)
    await expect(r.getByText('Données effacées.')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('Confidentialité : les trois interrupteurs écrivent confidentialite.*', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre, 'confidentialite')
    await expect(r.getByText('Aucune donnée ne quitte cet ordinateur.')).toBeVisible()
    await r.getByRole('switch', { name: "Effacer l'historique à la fermeture" }).click()
    await r.getByRole('switch', { name: 'Effacer les cookies à la fermeture' }).click()
    await r.getByRole('switch', { name: 'Vider le cache à la fermeture' }).click()
    await expect.poll(async () => (await reglages(fenetre)).confidentialite).toEqual({ effacerHistorique: true, effacerCookies: true, effacerCache: true })
  } finally {
    await app.close()
  }
})

test('Confidentialité : à la fermeture, les cookies sont effacés seulement si la case est cochée', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'lyra-e2e-fermeture-'))
  // Témoin : case décochée, le cookie survit au redémarrage.
  let { app } = await lancerLyra({ LYRA_USER_DATA: userData })
  await poserCookie(app, 'temoin')
  await app.close()
  ;({ app } = await lancerLyra({ LYRA_USER_DATA: userData }))
  try {
    expect(await nombreCookies(app)).toBe(1)
    const fenetre = app.windows().find((w) => w.url().includes('ui.html'))!
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { confidentialite: { effacerCookies: true } } as never))
  } finally {
    await app.close()
  }
  ;({ app } = await lancerLyra({ LYRA_USER_DATA: userData }))
  try {
    expect(await nombreCookies(app)).toBe(0)
  } finally {
    await app.close()
  }
})

test('Démarrage : la page d’accueil refuse javascript: et file:, complète une adresse sans schéma', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre, 'demarrage')
    const champ = r.getByRole('textbox', { name: "Page d'accueil" })
    await champ.fill('javascript:alert(1)')
    await champ.press('Enter')
    await expect(r.getByRole('alert')).toContainText('Adresse non valable')
    await champ.fill('file:///etc/passwd')
    await champ.press('Enter')
    await expect(r.getByRole('alert')).toContainText('Adresse non valable')
    expect((await reglages(fenetre)).demarrage.pageAccueil).toBe('')
    await champ.fill('exemple.fr')
    await champ.press('Enter')
    await expect.poll(async () => (await reglages(fenetre)).demarrage.pageAccueil).toBe('https://exemple.fr')
    await expect(champ).toHaveValue('https://exemple.fr')
    // Même refus côté principal : un patch direct est ignoré.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { demarrage: { pageAccueil: 'javascript:alert(1)' } } as never))
    expect((await reglages(fenetre)).demarrage.pageAccueil).toBe('https://exemple.fr')
    await r.getByRole('switch', { name: 'Rouvrir la dernière session' }).click()
    await expect.poll(async () => (await reglages(fenetre)).demarrage.restaurer).toBe(false)
  } finally {
    await app.close()
  }
})

test('Styles et scripts : le CSS global saisi est enregistré et appliqué à une page web ; plus de « Bientôt »', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre, 'styles')
    await expect(r.getByText(/Bientôt/)).toHaveCount(0)
    const zone = r.getByRole('textbox', { name: 'Feuille de style globale' })
    await expect(zone).toBeEnabled()
    await zone.fill('p { color: rgb(1, 2, 3) !important }')
    await expect.poll(async () => (await reglages(fenetre)).styles.css).toBe('p { color: rgb(1, 2, 3) !important }')
    await r.getByRole('button', { name: 'Ajouter un script…' }).click()
    await expect.poll(async () => (await reglages(fenetre)).styles.scripts.length).toBe(1)
    await r.getByRole('button', { name: /Supprimer le script/ }).click()
    await expect.poll(async () => (await reglages(fenetre)).styles.scripts.length).toBe(0)
    const url = `${BASE}/css-global`
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), url)
    await expect.poll(() => page(app, url)).toBeDefined()
    const p = page(app, url)!
    await expect.poll(() => p.evaluate(() => getComputedStyle(document.querySelector('p')!).color)).toBe('rgb(1, 2, 3)')
  } finally {
    await app.close()
  }
})

test('Réglages : plus de section Général ni Labo, #/general mène à la première section, Extensions renvoie vers lyra://extensions', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre, 'general')
    await expect(r.locator('h1')).toHaveText("Le ciel et l'apparence")
    await expect(r.getByText(/Langue de l'interface/)).toHaveCount(0)
    await expect(r.locator('.nav a', { hasText: /^(Général|Labo)$/ })).toHaveCount(0)
    await expect(r.locator('.nav a', { hasText: 'Extensions' })).toHaveAttribute('href', 'lyra://extensions')
    await r.fill('#chercher-reglage', 'extensions')
    await r.press('#chercher-reglage', 'Enter')
    await expect.poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).sky.stars.map((e) => e.url)).toContain('lyra://extensions')
  } finally {
    await app.close()
  }
})

test('Palette : « Suggestions en fenêtre privée » écrit palette.suggestionsEnPrivee (défaut : non)', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    expect((await reglages(fenetre)).palette.suggestionsEnPrivee).toBe(false)
    const r = await ouvrirReglages(app, fenetre, 'palette')
    await r.getByRole('switch', { name: 'Suggestions en fenêtre privée' }).click()
    await expect.poll(async () => (await reglages(fenetre)).palette.suggestionsEnPrivee).toBe(true)
  } finally {
    await app.close()
  }
})

test("Démarrage : une page d'accueil réglée s'ouvre au démarrage suivant (même userData), pas le nouvel onglet", async () => {
  const userData = mkdtempSync(join(tmpdir(), 'lyra-e2e-accueil-'))
  let { app, fenetre } = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('settings:set', { demarrage: { pageAccueil: u, restaurer: false } } as never), `${BASE}/accueil`)
    await expect.poll(async () => (await reglages(fenetre)).demarrage.pageAccueil).toBe(`${BASE}/accueil`)
  } finally {
    await app.close()
  }
  ;({ app, fenetre } = await lancerLyra({ LYRA_USER_DATA: userData }, { premierLancement: true }))
  try {
    await expect.poll(() => page(app, `${BASE}/accueil`)).toBeDefined()
    expect(page(app, 'lyra://newtab')).toBeUndefined()
  } finally {
    await app.close()
  }
})

test("Démarrage : une page d'accueil javascript: écrite à la main dans settings.json est ignorée (nouvel onglet)", async () => {
  const userData = mkdtempSync(join(tmpdir(), 'lyra-e2e-accueil-mal-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ version: 2, demarrage: { restaurer: false, pageAccueil: 'javascript:alert(1)' } }))
  const { app, fenetre } = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    expect((await reglages(fenetre)).demarrage.pageAccueil).toBe('')
    expect(page(app, 'lyra://newtab')).toBeDefined()
  } finally {
    await app.close()
  }
})

test("Palette : une fenêtre privée ne propose ni l'historique ni les favoris du profil normal (côté principal), sauf réglage", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/profil`)
    await expect
      .poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: 'zorglub' }))).length)
      .toBeGreaterThan(0)
    // La page n'est plus ouverte : seule une étoile ouverte masquerait l'entrée d'historique.
    await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), `${BASE}/ailleurs`)
    await fenetre.evaluate((u) => window.lyra.invoke('bookmarks:toggle', { url: u, title: 'Favori du profil' }), `${BASE}/favori`)
    const types = (f: Page) => f.evaluate(async () => (await window.lyra.invoke('palette:suggest', { texte: 'profil' })).map((s) => s.type))
    // Fenêtre normale : proposés.
    const normales = await types(fenetre)
    expect(normales).toContain('historique')
    expect(normales).toContain('favori')

    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
    await expect.poll(() => app.windows().find((p) => p.url().includes('ui.html') && p.url().includes('#privee'))).toBeDefined()
    const privee = app.windows().find((p) => p.url().includes('ui.html') && p.url().includes('#privee'))!
    const enPrivee = await types(privee)
    expect(enPrivee).not.toContain('historique')
    expect(enPrivee).not.toContain('favori')

    // Réglage activé : proposés aussi en privé.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { palette: { suggestionsEnPrivee: true } } as never))
    await expect.poll(async () => await types(privee)).toContain('favori')
    expect(await types(privee)).toContain('historique')
  } finally {
    await app.close()
  }
})

test("Confidentialité (macOS) : fermer la dernière fenêtre efface déjà les cookies, sans quitter l'application", async () => {
  test.skip(process.platform !== 'darwin', "ailleurs, la dernière fenêtre fermée quitte l'application (couvert par le test de fermeture)")
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { confidentialite: { effacerCookies: true } } as never))
    await poserCookie(app, 'derniere-fenetre')
    expect(await nombreCookies(app)).toBe(1)
    await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().forEach((w) => w.close()))
    await expect.poll(() => nombreCookies(app)).toBe(0)
  } finally {
    await app.close()
  }
})

const interfaces = (app: ElectronApplication): Page[] => app.windows().filter((p) => p.url().includes('ui.html') && !p.url().includes('#overlay'))
const nombrePages = (app: ElectronApplication, debut: string): number => app.windows().filter((w) => w.url().startsWith(debut)).length

test('Démarrage : « Nouvelle fenêtre » (Nouvel onglet par défaut) se règle par le contrôle segmenté', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    expect((await reglages(fenetre)).demarrage.nouvelleFenetre).toBe('vide')
    const r = await ouvrirReglages(app, fenetre, 'demarrage')
    const nouvelOnglet = r.getByRole('button', { name: 'Nouvel onglet', exact: true })
    const accueil = r.locator('[data-reglage="demarrage.nouvelleFenetre"]').getByRole('button', { name: "Page d'accueil" })
    await expect(nouvelOnglet).toBeEnabled()
    await expect(nouvelOnglet).toHaveAttribute('aria-pressed', 'true')
    await expect(r.getByRole('button', { name: 'Dernière session' })).toHaveCount(0)
    await accueil.click()
    await expect.poll(async () => (await reglages(fenetre)).demarrage.nouvelleFenetre).toBe('accueil')
    await expect(accueil).toHaveAttribute('aria-pressed', 'true')
    await nouvelOnglet.click()
    await expect.poll(async () => (await reglages(fenetre)).demarrage.nouvelleFenetre).toBe('vide')
  } finally {
    await app.close()
  }
})

test("Démarrage : « Page d'accueil » → ⌘ N et le menu ouvrent cette page ; fenêtre privée inchangée ; « Nouvel onglet » → nouvel onglet", async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate((u) => window.lyra.invoke('settings:set', { demarrage: { pageAccueil: u, nouvelleFenetre: 'accueil' } } as never), `${BASE}/nouvelle-fenetre`)
    await expect.poll(async () => (await reglages(fenetre)).demarrage.nouvelleFenetre).toBe('accueil')
    const avant = nombrePages(app, 'lyra://newtab')
    // ⌘ N (entrée de menu).
    await menu(app, 'nouvelle-fenetre')
    await expect.poll(() => nombrePages(app, `${BASE}/nouvelle-fenetre`)).toBe(1)
    expect(nombrePages(app, 'lyra://newtab')).toBe(avant)
    // Panneau de menu de la fenêtre (même effet).
    await fenetre.evaluate(() => window.lyra.invoke('menu:action', { action: 'nouvelle-fenetre' }))
    await expect.poll(() => nombrePages(app, `${BASE}/nouvelle-fenetre`)).toBe(2)
    expect(nombrePages(app, 'lyra://newtab')).toBe(avant)
    // Fenêtre privée : toujours son nouvel onglet, jamais la page d'accueil.
    const dejaUI = interfaces(app)
    await menu(app, 'fenetre-privee')
    await expect.poll(() => interfaces(app).find((p) => p.url().includes('#privee') && !dejaUI.includes(p))).toBeDefined()
    const privee = interfaces(app).find((p) => p.url().includes('#privee'))!
    await expect
      .poll(async () => (await privee.evaluate(() => window.lyra.invoke('sky:get'))).sky.stars.map((e) => e.url.replace(/\/$/, '')))
      .toEqual(['lyra://newtab'])
    expect(nombrePages(app, `${BASE}/nouvelle-fenetre`)).toBe(2)
    // Page d'accueil vide : repli sur le nouvel onglet.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { demarrage: { pageAccueil: '' } } as never))
    const avantVide = nombrePages(app, 'lyra://newtab')
    await menu(app, 'nouvelle-fenetre')
    await expect.poll(() => nombrePages(app, 'lyra://newtab')).toBe(avantVide + 1)
    // « Nouvel onglet » : la page d'accueil réglée n'est pas ouverte.
    await fenetre.evaluate((u) => window.lyra.invoke('settings:set', { demarrage: { pageAccueil: u, nouvelleFenetre: 'vide' } } as never), `${BASE}/nouvelle-fenetre`)
    await expect.poll(async () => (await reglages(fenetre)).demarrage.nouvelleFenetre).toBe('vide')
    const avantNO = nombrePages(app, 'lyra://newtab')
    await menu(app, 'nouvelle-fenetre')
    await expect.poll(() => nombrePages(app, 'lyra://newtab')).toBe(avantNO + 1)
    expect(nombrePages(app, `${BASE}/nouvelle-fenetre`)).toBe(2)
  } finally {
    await app.close()
  }
})

test("Démarrage : un ancien settings.json (nouvelleFenetre « session ») donne « Nouvel onglet » ; « accueil » est conservé", async () => {
  for (const [ancien, attendu] of [['session', 'vide'], ['accueil', 'accueil']] as const) {
    const userData = mkdtempSync(join(tmpdir(), 'lyra-e2e-nf-'))
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ version: 2, demarrage: { nouvelleFenetre: ancien } }))
    const { app, fenetre } = await lancerLyra({ LYRA_USER_DATA: userData })
    try {
      expect((await reglages(fenetre)).demarrage.nouvelleFenetre).toBe(attendu)
    } finally {
      await app.close()
    }
  }
})
