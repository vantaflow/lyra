import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
const reglages = (f: Page) => f.evaluate(() => window.lyra.invoke('settings:get'))
const suggerer = (f: Page, texte: string) => f.evaluate((t) => window.lyra.invoke('palette:suggest', { texte: t }), texte)

async function ouvrirReglages(app: ElectronApplication, fenetre: Page, route: string): Promise<Page> {
  await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), `lyra://settings#/${route}`)
  await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
  const r = page(app, 'lyra://settings')!
  await r.evaluate((h) => { location.hash = h }, `#/${route}`)
  return r
}

async function ajouterMoteur(r: Page, nom: string, motCle: string, url: string): Promise<void> {
  await r.fill('#moteur-nom', nom)
  await r.fill('#moteur-mot-cle', motCle)
  await r.fill('#moteur-url', url)
  await r.getByRole('button', { name: 'Ajouter', exact: true }).click()
}

/** `userData` prêt avant le lancement : un `settings.json` tel que l'écrirait l'importeur (la file `import` n'est écrivable que par le processus principal). */
function userDataAvec(settings: Record<string, unknown>): string {
  const dossier = mkdtempSync(join(tmpdir(), 'lyra-e2e-palette-'))
  mkdirSync(dossier, { recursive: true })
  writeFileSync(join(dossier, 'settings.json'), JSON.stringify({ version: 2, ...settings }))
  return dossier
}

test('un moteur perso ajouté depuis la section a son mot-clé dans la palette, puis se retire', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre, 'palette')
    // Les huit moteurs intégrés et leurs mots-clés.
    await expect(r.locator('#moteurs .row.moteur')).toHaveCount(8)
    for (const [id, cle] of [['duckduckgo', 'd'], ['kagi', 'k'], ['google', 'g'], ['brave', 'b'], ['startpage', 's'], ['qwant', 'q'], ['wikipedia', 'w'], ['youtube', 'yt']])
      await expect(r.locator(`.row.moteur[data-moteur="${id}"] .tag.mot-cle`)).toHaveText(cle)

    await ajouterMoteur(r, 'Mon wiki', 'MW', 'https://wiki.exemple.fr/?q=%s')
    await expect(r.locator('.row.moteur[data-moteur="perso-mon-wiki"]')).toBeVisible()
    await expect(r.locator('.row.moteur[data-moteur="perso-mon-wiki"] .tag.mot-cle')).toHaveText('mw')
    expect((await reglages(fenetre)).moteursPerso).toEqual([{ id: 'perso-mon-wiki', nom: 'Mon wiki', motCle: 'mw', url: 'https://wiki.exemple.fr/?q=%s' }])
    // Le formulaire est vidé.
    await expect(r.locator('#moteur-nom')).toHaveValue('')

    // Le mot-clé est utilisable dans la palette (la ligne annonce le moteur ajouté).
    expect((await suggerer(fenetre, 'mw véga'))[0]).toMatchObject({ type: 'recherche', moteur: 'perso-mon-wiki', url: 'https://wiki.exemple.fr/?q=v%C3%A9ga' })
    await menu(app, 'palette')
    await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
    const overlay = app.windows().find((w) => w.url().includes('#overlay'))!
    await expect(overlay.locator('#palette')).toBeFocused()
    await overlay.fill('#palette', 'mw véga')
    await expect(overlay.locator('.pal').first()).toContainText('sur Mon wiki')
    await overlay.keyboard.press('Escape')

    // Moteur par défaut : le moteur perso apparaît dans le sélecteur ; le retirer ramène DuckDuckGo.
    await r.getByRole('button', { name: 'Moteur par défaut' }).click()
    await r.getByRole('option', { name: 'Mon wiki' }).click()
    await expect.poll(async () => (await reglages(fenetre)).moteurParDefaut).toBe('perso-mon-wiki')
    await r.getByRole('button', { name: 'Retirer Mon wiki' }).click()
    await expect(r.locator('#moteurs .row.moteur')).toHaveCount(8)
    await expect.poll(async () => (await reglages(fenetre)).moteursPerso).toEqual([])
    expect((await reglages(fenetre)).moteurParDefaut).toBe('duckduckgo')
    expect((await suggerer(fenetre, 'mw véga')).some((s) => s.moteur === 'perso-mon-wiki')).toBe(false)
  } finally {
    await app.close()
  }
})

test('la validation refuse un mot-clé pris, une adresse http ou sans %s, et n’écrit rien', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre, 'palette')
    await ajouterMoteur(r, 'Autre wiki', 'w', 'https://wiki.exemple.fr/?q=%s')
    await expect(r.locator('#ajout-moteur-refus')).toContainText('déjà utilisé par Wikipédia')
    await ajouterMoteur(r, 'Autre wiki', 'aw', 'http://wiki.exemple.fr/?q=%s')
    await expect(r.locator('#ajout-moteur-refus')).toContainText('adresse https')
    await ajouterMoteur(r, 'Autre wiki', 'aw', 'https://wiki.exemple.fr/')
    await expect(r.locator('#ajout-moteur-refus')).toContainText('%s')
    await ajouterMoteur(r, 'Autre wiki', 'a w', 'https://wiki.exemple.fr/?q=%s')
    await expect(r.locator('#ajout-moteur-refus')).toContainText('espace')
    expect((await reglages(fenetre)).moteursPerso).toEqual([])

    // Deux moteurs : le second ne peut pas reprendre le mot-clé du premier.
    await ajouterMoteur(r, 'Wiki un', 'wu', 'https://un.exemple.fr/?q=%s')
    await expect(r.locator('.row.moteur[data-moteur="perso-wiki-un"]')).toBeVisible()
    await ajouterMoteur(r, 'Wiki deux', 'WU', 'https://deux.exemple.fr/?q=%s')
    await expect(r.locator('#ajout-moteur-refus')).toContainText('déjà utilisé par Wiki un')
    expect((await reglages(fenetre)).moteursPerso).toHaveLength(1)
  } finally {
    await app.close()
  }
})

test('les interrupteurs d’historique et de favoris règlent les suggestions de la palette', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    // Une page visitée (historique), puis le nouvel onglet : la page n'est plus une étoile ouverte.
    await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), `${BASE}/histo`)
    await expect.poll(() => fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: 'histo' })).then((h) => h.length)).toBe(1)
    await fenetre.evaluate((u) => window.lyra.invoke('test:navigate', u), 'lyra://newtab')
    await fenetre.evaluate((u) => window.lyra.invoke('bookmarks:toggle', u), { url: `${BASE}/fav`, title: 'Zorglub favori' })
    const types = async () => (await suggerer(fenetre, 'zorglub')).map((s) => s.type)
    await expect.poll(types).toEqual(expect.arrayContaining(['favori', 'historique']))

    const r = await ouvrirReglages(app, fenetre, 'palette')
    const histo = r.getByRole('switch', { name: "Suggestions de l'historique" })
    const favoris = r.getByRole('switch', { name: 'Suggestions des favoris' })
    await expect(histo).toHaveAttribute('aria-checked', 'true')
    await expect(favoris).toHaveAttribute('aria-checked', 'true')

    await histo.click()
    await expect.poll(async () => (await reglages(fenetre)).palette.suggestionsHistorique).toBe(false)
    expect(await types()).toContain('favori')
    expect(await types()).not.toContain('historique')

    await favoris.click()
    await expect.poll(async () => (await reglages(fenetre)).palette.suggestionsFavoris).toBe(false)
    expect(await types()).not.toContain('favori')

    await histo.click()
    await expect.poll(async () => (await reglages(fenetre)).palette.suggestionsHistorique).toBe(true)
    expect(await types()).toContain('historique')
    expect(await types()).not.toContain('favori')
    // « Suggestions en fenêtre privée » est toujours là.
    await expect(r.getByRole('switch', { name: 'Suggestions en fenêtre privée' })).toHaveAttribute('aria-checked', 'false')
  } finally {
    await app.close()
  }
})

test('une page d’accueil en attente (écrite par l’import) est copiée dans Démarrage au chargement, une seule fois', async () => {
  const dossier = userDataAvec({ import: { extensionsEnAttente: [], reglagesEnAttente: { pageAccueil: 'https://accueil.exemple.fr/' } } })
  const { app, fenetre } = await lancerLyra({ LYRA_USER_DATA: dossier })
  try {
    const s = await reglages(fenetre)
    expect(s.demarrage.pageAccueil).toBe('https://accueil.exemple.fr/')
    expect(s.import.reglagesEnAttente).toEqual({})
    // Appliquée avant la première fenêtre : l'étoile de départ ouvre déjà la page d'accueil importée.
    expect((await fenetre.evaluate(() => window.lyra.invoke('sky:get'))).sky.stars[0].url).toBe('https://accueil.exemple.fr/')
    const r = await ouvrirReglages(app, fenetre, 'demarrage')
    await expect(r.getByLabel("Page d'accueil")).toHaveValue('https://accueil.exemple.fr/')
    // Effacée par l'utilisateur, elle ne revient pas.
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { demarrage: { pageAccueil: '' } } as never))
    await expect(r.getByLabel("Page d'accueil")).toHaveValue('')
    expect((await reglages(fenetre)).demarrage.pageAccueil).toBe('')
  } finally {
    await app.close()
  }
  // Sur le disque : la valeur n'est plus en attente (l'écriture différée est vidée à la fermeture).
  const disque = JSON.parse(readFileSync(join(dossier, 'settings.json'), 'utf8'))
  expect(disque.import.reglagesEnAttente).toEqual({})
})

test('une page d’accueil déjà choisie n’est jamais écrasée par celle en attente', async () => {
  const dossier = userDataAvec({
    demarrage: { restaurer: true, pageAccueil: 'https://choisie.exemple.fr/', nouvelleFenetre: 'vide' },
    import: { extensionsEnAttente: [], reglagesEnAttente: { pageAccueil: 'https://accueil.exemple.fr/' } }
  })
  const { app, fenetre } = await lancerLyra({ LYRA_USER_DATA: dossier })
  try {
    const s = await reglages(fenetre)
    expect(s.demarrage.pageAccueil).toBe('https://choisie.exemple.fr/')
    expect(s.import.reglagesEnAttente).toEqual({})
  } finally {
    await app.close()
  }
})

test('une page ne peut pas déposer de page d’accueil en attente : la file `import` reste fermée à settings:set', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() =>
      window.lyra.invoke('settings:set', { import: { extensionsEnAttente: [], reglagesEnAttente: { pageAccueil: 'https://pirate.exemple.fr/' } } } as never)
    )
    const s = await reglages(fenetre)
    expect(s.import.reglagesEnAttente).toEqual({})
    expect(s.demarrage.pageAccueil).toBe('')
  } finally {
    await app.close()
  }
})

test('moteurs perso : le processus principal refuse http, un %s dans l’hôte et un mot-clé déjà pris, même hors de la page', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const ok = { id: 'perso-ok', nom: 'Mon wiki', motCle: 'mw', url: 'https://wiki.exemple.fr/?q=%s' }
    await fenetre.evaluate(
      (o) =>
        window.lyra.invoke('settings:set', {
          moteursPerso: [
            o,
            { ...o, id: 'a', motCle: 'a', url: 'http://wiki.exemple.fr/?q=%s' },
            { ...o, id: 'b', motCle: 'b', url: 'https://%s.pirate.exemple.fr/' },
            { ...o, id: 'c', motCle: 'w' },
            { ...o, id: 'd', motCle: 'MW' }
          ]
        } as never),
      ok
    )
    expect((await reglages(fenetre)).moteursPerso).toEqual([ok])
  } finally {
    await app.close()
  }
})

test('« Importer et exporter » rend le composant d’import, et « Sauvegarde et profils » y renvoie', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const r = await ouvrirReglages(app, fenetre, 'sauvegarde')
    await expect(r.locator('h1')).toHaveText('Sauvegarde et profils')
    await r.getByRole('link', { name: /Ouvrir « Importer et exporter »/ }).click()
    await expect(r.locator('h1')).toHaveText('Importer et exporter')
    await expect(r.locator('#importer-maintenant')).toBeAttached()
    expect(await r.evaluate(() => location.hash)).toBe('#/importer')
  } finally {
    await app.close()
  }
})
