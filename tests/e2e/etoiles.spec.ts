import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { lancerLyra } from './helpers'
import type { SkyChange } from '../../src/shared/ipc'

// Jalon D, tâche 19 : placement d'une nouvelle étoile, regroupement par site, archivage des étoiles éteintes.
// Les « sites » sont des noms *.localhost (Chromium les résout sur la boucle locale) servis par un petit serveur local.
const FIXTURE = pathToFileURL(resolve(__dirname, 'fixtures/liens.html')).href
const JOUR = 86_400_000

let serveur: Server
let port = 0
test.beforeAll(async () => {
  serveur = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end('<title>Site</title><p>ok</p>')
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  port = (serveur.address() as AddressInfo).port
})
test.afterAll(() => new Promise<void>((ok) => serveur.close(() => ok())))

const site = (hote: string): string => `http://${hote}:${port}/`
const ciel = (f: Page): Promise<SkyChange> => f.evaluate(() => window.lyra.invoke('sky:get'))
const regler = (f: Page, apparence: Record<string, unknown>): Promise<unknown> => f.evaluate((a) => window.lyra.invoke('settings:set', { apparence: a } as never), apparence)
const ouvrir = (f: Page, url: string, o: { actif?: boolean; parentId?: string } = {}): Promise<string> => f.evaluate((d) => window.lyra.invoke('tabs:open', d), { url, ...o })
const ids = async (f: Page): Promise<string[]> => (await ciel(f)).sky.stars.map((s) => s.id)

test('« Sous l’étoile active » : la nouvelle étoile se range juste après l’active (et ses étoiles reliées), sans lien', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await regler(fenetre, { nouvelleEtoile: 'sous-active', regrouperParSite: false })
    const premiere = (await ciel(fenetre)).sky.activeId!
    const b = await ouvrir(fenetre, site('b.test.localhost'))
    // Un lien ouvert depuis b reste relié à lui (étoile fille).
    const fille = await ouvrir(fenetre, site('f.test.localhost'), { parentId: b })
    await fenetre.evaluate((id) => window.lyra.invoke('tabs:activate', { id }), premiere)
    const d = await ouvrir(fenetre, site('d.test.localhost'))
    const { sky } = await ciel(fenetre)
    expect(sky.stars.find((s) => s.id === d)?.parentId).toBeUndefined()
    expect(sky.stars.find((s) => s.id === fille)?.parentId).toBe(b)
    expect(sky.stars.map((s) => s.id)).toEqual([premiere, d, b, fille])
    // Active = b (qui a une fille) : la nouvelle passe après b et sa fille.
    await fenetre.evaluate((id) => window.lyra.invoke('tabs:activate', { id }), b)
    const e = await ouvrir(fenetre, site('e.test.localhost'))
    expect(await ids(fenetre)).toEqual([premiere, d, b, fille, e])
  } finally {
    await app.close()
  }
})

test('« En fin de constellation » et « Hors constellation » avec une constellation nommée', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    // Étoiles rangées dans la constellation du site par le regroupement automatique.
    await regler(fenetre, { nouvelleEtoile: 'hors-constellation', regrouperParSite: true })
    const s1 = await ouvrir(fenetre, site('un.exemple.localhost'))
    const libre = await ouvrir(fenetre, site('libre.localhost'), { actif: false })
    let { sky } = await ciel(fenetre)
    const c = sky.stars.find((s) => s.id === s1)!.constellationId!
    expect(c).toBeTruthy()
    // Fin de constellation (regroupement coupé pour ne mesurer que le placement).
    await regler(fenetre, { nouvelleEtoile: 'fin-constellation', regrouperParSite: false })
    await fenetre.evaluate((id) => window.lyra.invoke('tabs:activate', { id }), s1)
    const s2 = await ouvrir(fenetre, site('deux.autre.localhost'))
    ;({ sky } = await ciel(fenetre))
    const etoile2 = sky.stars.find((s) => s.id === s2)!
    expect(etoile2.constellationId).toBe(c)
    expect(etoile2.parentId).toBeUndefined()
    const ordre = sky.stars.map((s) => s.id)
    expect(ordre.indexOf(s2)).toBe(ordre.indexOf(s1) + 1)
    expect(ordre.indexOf(s2)).toBeLessThan(ordre.indexOf(libre))
    // Hors constellation : fin du ciel, aucune constellation.
    await regler(fenetre, { nouvelleEtoile: 'hors-constellation' })
    await fenetre.evaluate((id) => window.lyra.invoke('tabs:activate', { id }), s1)
    const s3 = await ouvrir(fenetre, site('trois.autre.localhost'))
    ;({ sky } = await ciel(fenetre))
    const etoile3 = sky.stars.find((s) => s.id === s3)!
    expect(etoile3.constellationId).toBeUndefined()
    expect(etoile3.parentId).toBeUndefined()
    expect(sky.stars.at(-1)?.id).toBe(s3)
  } finally {
    await app.close()
  }
})

test('regroupement par site : deux étoiles du même domaine → une constellation ; une constellation nommée est respectée', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await regler(fenetre, { nouvelleEtoile: 'hors-constellation', regrouperParSite: true })
    // La constellation de l'utilisateur porte déjà le nom du domaine : on y entre, sans la renommer ni la doubler.
    const perso = await fenetre.evaluate(() => window.lyra.invoke('test:constellation', { nom: 'perso.localhost' }))
    const a = await ouvrir(fenetre, site('www.exemple.localhost'))
    const b = await ouvrir(fenetre, site('blog.exemple.localhost'))
    const p = await ouvrir(fenetre, site('mail.perso.localhost'))
    const autre = await ouvrir(fenetre, site('autre.localhost'))
    const { sky } = await ciel(fenetre)
    const de = (id: string): string | undefined => sky.stars.find((s) => s.id === id)?.constellationId
    expect(de(a)).toBeTruthy()
    expect(de(a)).toBe(de(b))
    const exemple = sky.constellations.find((c) => c.id === de(a))!
    expect(exemple).toMatchObject({ name: 'exemple.localhost', auto: true })
    expect(de(p)).toBe(perso)
    expect(sky.constellations.find((c) => c.id === perso)).toMatchObject({ name: 'perso.localhost' })
    expect(sky.constellations.find((c) => c.id === perso)?.auto).toBeUndefined()
    expect(de(autre)).not.toBe(de(a))
    expect(sky.constellations.filter((c) => c.name === 'exemple.localhost')).toHaveLength(1)
    // Fermer toutes les étoiles d'une constellation automatique la retire ; celle de l'utilisateur reste.
    await fenetre.evaluate(([x, y]) => Promise.all([window.lyra.invoke('tabs:close', { id: x }), window.lyra.invoke('tabs:close', { id: y })]), [a, b])
    await fenetre.evaluate((id) => window.lyra.invoke('tabs:close', { id }), p)
    const apres = (await ciel(fenetre)).sky
    expect(apres.constellations.some((c) => c.name === 'exemple.localhost')).toBe(false)
    expect(apres.constellations.some((c) => c.id === perso)).toBe(true)
  } finally {
    await app.close()
  }
})

test('regroupement par site : un nouvel onglet qui part vers un site entre dans la constellation du site', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await regler(fenetre, { nouvelleEtoile: 'hors-constellation', regrouperParSite: true })
    const id = (await ciel(fenetre)).sky.activeId!
    expect((await ciel(fenetre)).sky.stars[0].constellationId).toBeUndefined()
    await fenetre.evaluate((d) => window.lyra.invoke('tabs:navigate', d), { id, url: site('www.voyage.localhost') })
    await expect.poll(async () => (await ciel(fenetre)).sky.stars[0].constellationId).toBeTruthy()
    const { sky } = await ciel(fenetre)
    expect(sky.constellations.find((c) => c.id === sky.stars[0].constellationId)?.name).toBe('voyage.localhost')
  } finally {
    await app.close()
  }
})

async function etoileEndormie(app: ElectronApplication, fenetre: Page): Promise<string> {
  const id = await ouvrir(fenetre, FIXTURE)
  await expect.poll(() => fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: 'liens' })).then((r) => r.length)).toBe(1)
  // L'étoile cesse d'être active, puis dort.
  await ouvrir(fenetre, 'lyra://newtab')
  await expect.poll(() => fenetre.evaluate((i) => window.lyra.invoke('test:endormir', i), id)).toBe(true)
  void app
  return id
}

test('archivage : une étoile éteinte quitte le ciel et reste dans l’historique (horloge accélérée)', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await regler(fenetre, { archiverApresJours: 7 })
    const id = await etoileEndormie(app, fenetre)
    // Une trace d'historique effacée : seul l'archivage peut la recréer.
    await fenetre.evaluate(() => window.lyra.invoke('history:clear'))
    expect(await fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: 'liens' }))).toHaveLength(0)
    // Pas encore éteinte (1 jour sur 7).
    expect(await fenetre.evaluate((ms) => window.lyra.invoke('test:archiver', { avanceMs: ms }), JOUR)).toBe(0)
    expect(await ids(fenetre)).toContain(id)
    // Éteinte.
    expect(await fenetre.evaluate((ms) => window.lyra.invoke('test:archiver', { avanceMs: ms }), 7 * JOUR)).toBe(1)
    await expect.poll(async () => (await ids(fenetre)).includes(id)).toBe(false)
    const h = await fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: 'liens' }))
    expect(h).toHaveLength(1)
    expect(h[0].url).toBe(FIXTURE)
    // Jamais rouverte par « rouvrir la dernière étoile ».
    await fenetre.evaluate(() => window.lyra.invoke('tabs:reopen'))
    expect(await ids(fenetre)).not.toContain(id)
  } finally {
    await app.close()
  }
})

test('archivage : « Jamais » (défaut) ne retire rien ; une étoile éveillée ou active n’est jamais archivée', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    const id = await etoileEndormie(app, fenetre)
    expect(await fenetre.evaluate((ms) => window.lyra.invoke('test:archiver', { avanceMs: ms }), 400 * JOUR)).toBe(0)
    expect(await ids(fenetre)).toContain(id)
    await regler(fenetre, { archiverApresJours: 1 })
    // L'étoile redevient active (réveillée) : plus éteinte.
    await fenetre.evaluate((i) => window.lyra.invoke('tabs:activate', { id: i }), id)
    expect(await fenetre.evaluate((ms) => window.lyra.invoke('test:archiver', { avanceMs: ms }), 400 * JOUR)).toBe(0)
    expect(await ids(fenetre)).toContain(id)
  } finally {
    await app.close()
  }
})
