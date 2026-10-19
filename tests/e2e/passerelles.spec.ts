import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { connect, type AddressInfo, type Socket } from 'node:net'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SkyChange } from '../../src/shared/ipc'
import { lancerLyra } from './helpers'

/**
 * Passerelles : un proxy HTTP CONNECT local, lancé par le test et déclaré « personnelle », prouve que le
 * PAC `data:` est réellement appliqué par Electron. Aucun réseau public hors du test @reseau :
 * - les listes publiques sont remplacées par un fichier vide (LYRA_PASSERELLES_SOURCES) ;
 * - la cible de test des passerelles est un hôte fictif servi par le proxy lui-même (LYRA_PASSERELLES_CIBLE).
 */

const CIBLE = 'http://cible.test/generate_204'

interface Passerelle {
  port: number
  /** Cibles « hôte:port » des CONNECT reçus. */
  connects: string[]
  fermer(): Promise<void>
}

async function lancerPasserelle(): Promise<Passerelle> {
  const connects: string[] = []
  const sockets = new Set<Socket>()
  const serveur: Server = createServer((req, res) => {
    // Requête http absolue (test de la passerelle) : 204 quel que soit l'hôte demandé.
    res.writeHead(204).end()
    void req
  })
  serveur.on('connection', (s) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  serveur.on('connect', (req, client, tete) => {
    connects.push(req.url ?? '')
    const [hote, port] = (req.url ?? '').split(':')
    const amont = connect(Number(port) || 443, hote)
    sockets.add(amont)
    amont.on('close', () => sockets.delete(amont))
    amont.on('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (tete.length > 0) amont.write(tete)
      amont.pipe(client)
      client.pipe(amont)
    })
    const echec = (): void => {
      if (!client.destroyed && client.writable) client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      amont.destroy()
    }
    amont.on('error', echec)
    client.on('error', () => amont.destroy())
  })
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r))
  return {
    port: (serveur.address() as AddressInfo).port,
    connects,
    fermer: () =>
      new Promise<void>((r) => {
        for (const s of sockets) s.destroy()
        serveur.close(() => r())
      })
  }
}

/** Fichier de liste vide : aucune passerelle publique, aucun accès au réseau. */
function listeVide(): string {
  const f = join(mkdtempSync(join(tmpdir(), 'lyra-pass-')), 'vide.txt')
  writeFileSync(f, '')
  return pathToFileURL(f).href
}

const env = (): Record<string, string> => ({ LYRA_PASSERELLES_SOURCES: listeVide(), LYRA_PASSERELLES_CIBLE: CIBLE })
const ciel = (f: Page): Promise<SkyChange> => f.evaluate(() => window.lyra.invoke('sky:get'))
const trouver = (app: ElectronApplication, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))
const erreur = (app: ElectronApplication): Page | undefined => trouver(app, 'lyra://erreur')

async function declarer(f: Page, port: number): Promise<void> {
  const etat = await f.evaluate((p) => window.lyra.invoke('passerelles:personnelle', { config: { type: 'http', hote: '127.0.0.1', port: p } }), port)
  expect(etat.erreur).toBeUndefined()
  expect(etat.pret).toBeGreaterThan(0)
}

test('le PAC s’applique : un site contourné passe par la passerelle, un autre reste en direct', async () => {
  const pass = await lancerPasserelle()
  const { app, fenetre } = await lancerLyra(env())
  try {
    await declarer(fenetre, pass.port)
    await fenetre.evaluate(() => window.lyra.invoke('passerelles:ajouter', { hote: 'contourne.invalid' }))
    // Site hors liste : DIRECT, la passerelle ne voit rien.
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'https://direct.invalid/')).catch(() => undefined)
    await expect.poll(() => erreur(app)?.url()).toContain('type=introuvable')
    expect(pass.connects.some((c) => c.startsWith('direct.invalid'))).toBe(false)
    // Site contourné : le CONNECT arrive à la passerelle (qui répond 502 : l'hôte n'existe pas).
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'https://contourne.invalid/')).catch(() => undefined)
    await expect.poll(() => pass.connects.filter((c) => c === 'contourne.invalid:443').length).toBeGreaterThan(0)
    // La passerelle ne répond pas utilement : page « Aucune passerelle ne répond », sans « Continuer quand même ».
    await expect.poll(() => erreur(app)?.url()).toContain('type=passerelles')
    const page = erreur(app)!
    await expect(page.locator('h1')).toHaveText('Aucune passerelle ne répond')
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continuer quand même' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Passer par une passerelle' })).toHaveCount(0)
    expect(pass.connects.some((c) => c.startsWith('direct.invalid'))).toBe(false)
  } finally {
    await app.close()
    await pass.fermer()
  }
})

test('http:// d’un site contourné, sans passerelle personnelle : page « Ce site n’est pas chiffré »', async () => {
  const { app, fenetre } = await lancerLyra(env())
  try {
    await fenetre.evaluate(() => window.lyra.invoke('passerelles:ajouter', { hote: 'clair.invalid' }))
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'http://clair.invalid/page')).catch(() => undefined)
    await expect.poll(() => erreur(app)?.url()).toContain('type=http')
    const page = erreur(app)!
    await expect(page.locator('h1')).toHaveText("Ce site n'est pas chiffré")
    await expect(page.locator('.erreur-texte')).toHaveText("Ce site n'est pas chiffré : les passerelles publiques ne transportent que les sites https.")
    await expect(page.getByRole('button', { name: 'Passer par une passerelle' })).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('https injoignable : « Passer par une passerelle » ajoute le site ; le menu ⋯ bascule', async () => {
  const { app, fenetre } = await lancerLyra(env())
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'https://bloque.invalid/')).catch(() => undefined)
    await expect.poll(() => erreur(app)?.url()).toContain('passerelle=1')
    const page = erreur(app)!
    await expect(page.getByText('bloque.invalid ne répond pas sur ce réseau. Il est peut-être bloqué.')).toBeVisible()
    const bouton = page.getByRole('button', { name: 'Passer par une passerelle' })
    await expect(bouton).toBeVisible()
    await expect(bouton).toHaveClass(/pri/)
    await expect(bouton.locator('svg')).toBeVisible()
    await bouton.click()
    await expect
      .poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).reseau.sites.map((s) => `${s.hote}:${s.origine}`))
      .toEqual(['bloque.invalid:manuel'])

    // La page est rechargée : sans passerelle disponible, elle revient en erreur, désormais « contournée ».
    await expect.poll(() => erreur(app)?.url()).toContain('contourne=1')

    // Menu ⋯ sur la page d'erreur de ce site : « Ne plus passer par une passerelle ».
    await fenetre.getByRole('button', { name: 'Menu de la page' }).click()
    await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
    const overlay = app.windows().find((w) => w.url().includes('#overlay'))!
    const retirer = overlay.getByRole('menuitem', { name: 'Ne plus passer par une passerelle' })
    await expect(retirer).toBeVisible()
    await retirer.click()
    await expect
      .poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).reseau.sites.length)
      .toBe(0)
    // Et inversement : « Passer par une passerelle pour <hôte> ».
    await fenetre.getByRole('button', { name: 'Menu de la page' }).click()
    await expect.poll(() => app.windows().some((w) => w.url().includes('#overlay'))).toBe(true)
    const ajout = app.windows().find((w) => w.url().includes('#overlay'))!.getByRole('menuitem', { name: 'Passer par une passerelle pour bloque.invalid' })
    await expect(ajout).toBeVisible()
    await ajout.click()
    await expect
      .poll(async () => (await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).reseau.sites.map((s) => s.hote))
      .toEqual(['bloque.invalid'])
  } finally {
    await app.close()
  }
})

test('réglages : interrupteurs, ajout et retrait d’un site, refus lisible, passerelle personnelle', async () => {
  const pass = await lancerPasserelle()
  const { app, fenetre } = await lancerLyra(env())
  try {
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'lyra://settings#/reseau'))
    await expect.poll(() => trouver(app, 'lyra://settings')).toBeDefined()
    const r = trouver(app, 'lyra://settings')!
    await expect(r.locator('h1')).toHaveText('Réseau et identité')
    await expect(r.locator('.nav a.on')).toHaveText('Réseau et identité')
    await expect(r.getByText('Sites contournés — 0')).toBeVisible()
    await expect(r.getByText("Les passerelles publiques sont gérées par des inconnus. Lyra n'y fait passer que des sites chiffrés (https), mais le nom des sites visités leur est visible.")).toBeVisible()

    // Interrupteurs → settings:set.
    const reseau = async () => (await fenetre.evaluate(() => window.lyra.invoke('settings:get'))).reseau
    await r.getByRole('switch', { name: 'Détection automatique' }).click()
    await expect.poll(async () => (await reseau()).auto).toBe(false)
    await r.getByRole('switch', { name: 'Passerelles', exact: true }).click()
    await expect.poll(async () => (await reseau()).passerelles).toBe(false)
    await r.getByRole('switch', { name: 'Passerelles', exact: true }).click()
    await r.getByRole('switch', { name: 'Détection automatique' }).click()
    await expect.poll(async () => (await reseau()).passerelles && (await reseau()).auto).toBe(true)

    // Ajout / retrait.
    await r.getByLabel('Ajouter un site').fill('https://www.Exemple.fr/page')
    await r.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(r.getByText('Sites contournés — 1')).toBeVisible()
    const ligne = r.locator('.site[data-hote="exemple.fr"]')
    await expect(ligne).toContainText('et ses sous-domaines')
    await expect(ligne.locator('.tag')).toHaveText('Ajouté')
    await expect(ligne.locator('svg')).toBeVisible()
    await ligne.getByRole('button', { name: 'Retirer exemple.fr' }).click()
    await expect(r.getByText('Sites contournés — 0')).toBeVisible()
    expect((await reseau()).sites).toEqual([])

    // Refus lisible : http:// sans passerelle personnelle.
    await r.getByLabel('Ajouter un site').fill('http://exemple.fr')
    await r.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(r.getByRole('alert')).toContainText('Seuls les sites https passent par une passerelle publique')
    await expect(r.getByRole('alert')).not.toContainText('Error invoking')

    // Passerelle personnelle : HTTP, hôte, port, Tester ; puis Effacer.
    await r.getByRole('button', { name: 'HTTP', exact: true }).click()
    await r.getByLabel('Hôte').fill('127.0.0.1')
    await r.getByLabel('Port').fill(String(pass.port))
    await r.getByRole('button', { name: 'Tester', exact: true }).click()
    await expect(r.getByText('Passerelle prête.')).toBeVisible()
    expect((await reseau()).personnelle).toEqual({ type: 'http', hote: '127.0.0.1', port: pass.port })
    await expect(r.locator('.tag').first()).toHaveText('Prête')
    await r.getByRole('button', { name: 'Effacer' }).click()
    await expect.poll(async () => (await reseau()).personnelle).toBeUndefined()
    await expect(r.getByRole('button', { name: 'Effacer' })).toHaveCount(0)
    await expect(r.getByRole('button', { name: 'Utiliser Cloudflare WARP (127.0.0.1:40000)' })).toBeVisible()
  } finally {
    await app.close()
    await pass.fermer()
  }
})

test('@reseau https://example.com contourné : CONNECT compté, icône relais dans la pilule', async () => {
  const pass = await lancerPasserelle()
  const { app, fenetre } = await lancerLyra(env())
  try {
    await declarer(fenetre, pass.port)
    await fenetre.evaluate(() => window.lyra.invoke('passerelles:ajouter', { hote: 'example.com' }))
    await fenetre.evaluate(() => window.lyra.invoke('test:navigate', 'https://example.com/'))
    await expect.poll(() => pass.connects.filter((c) => c === 'example.com:443').length).toBeGreaterThan(0)
    const id = (await ciel(fenetre)).sky.activeId!
    await expect.poll(async () => (await ciel(fenetre)).etats[id].viaPasserelle).toBe(true)
    const icone = fenetre.locator('.pilule svg.relais')
    await expect(icone).toBeVisible()
    await expect(icone).toHaveAttribute('stroke', '#5452C8')
    await expect(fenetre.locator('.pilule')).toHaveAttribute('title', 'Via une passerelle')
    // Retirer le site : plus d'icône.
    await fenetre.evaluate(() => window.lyra.invoke('passerelles:retirer', { hote: 'example.com' }))
    await expect(icone).toHaveCount(0)
  } finally {
    await app.close()
    await pass.fermer()
  }
})
