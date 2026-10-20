import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancerLyra } from './helpers'

// Export et paquet `.lyra` (jalon E, Task 4) : canaux `export:*` et `import:fichier` appelés depuis une page
// lyra://settings, avec des chemins passés dans la demande (LYRA_TEST=1 : aucune boîte de dialogue, aucune fenêtre visible).
let dossier = ''
test.beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), 'lyra-export-'))
})
test.afterAll(() => rmSync(dossier, { recursive: true, force: true }))

const PHRASE = 'phrase de passe e2e solide'
const page = (app: { windows(): Page[] }, debut: string): Page | undefined => app.windows().find((w) => w.url().startsWith(debut))

async function ouvrirReglages(app: ElectronApplication, depuis: Page): Promise<Page> {
  await depuis.evaluate(() => window.lyra.invoke('tabs:open', { url: 'lyra://settings' }))
  await expect.poll(() => page(app, 'lyra://settings')).toBeDefined()
  const r = page(app, 'lyra://settings')!
  await r.waitForLoadState('domcontentloaded')
  await expect.poll(() => r.evaluate(() => typeof window.lyra?.invoke)).toBe('function')
  return r
}

const interfaces = (app: ElectronApplication): Page[] => app.windows().filter((p) => p.url().includes('ui.html') && !p.url().includes('#overlay'))

const FAVORIS_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><A HREF="https://racine.fr/">Racine &amp; Cie</A>
  <DT><H3>Travail</H3>
  <DL><p>
    <DT><A HREF="https://b.fr/">B</A>
    <DT><H3>Projets</H3>
    <DL><p>
      <DT><A HREF="https://c.fr/?a=1&amp;b=2">C "quoted"</A>
    </DL><p>
  </DL><p>
</DL><p>`

const CIEL_JSON = JSON.stringify({
  format: 'lyra-ciel',
  version: 1,
  constellations: [{ id: 'k1', nom: 'Lecture', couleur: '#3FB187' }],
  etoiles: [
    { url: 'https://lire.fr/', titre: 'Lire', constellation: 'k1', epingle: true },
    { url: 'https://libre.fr/', titre: 'Libre', epingle: false }
  ]
})

const CSV = 'date,titre,adresse,visites\r\n2026-01-02T03:04:05.000Z,"Page, avec virgule",https://histo.fr/a,3\r\n'

const bookmarks = (p: Page): Promise<Array<[string, string, string | undefined]>> =>
  p.evaluate(async () => (await window.lyra.invoke('bookmarks:list')).map((f) => [f.url, f.title, f.dossier] as [string, string, string | undefined]).sort())

test('favoris HTML : export puis réimport dans un profil neuf → mêmes favoris', async () => {
  const source = join(dossier, 'source.html')
  const sortie = join(dossier, 'favoris.html')
  writeFileSync(source, FAVORIS_HTML)
  const a = await lancerLyra()
  let attendus: Array<[string, string, string | undefined]>
  try {
    const r = await ouvrirReglages(a.app, a.fenetre)
    const imp = await r.evaluate((chemin) => window.lyra.invoke('import:fichier', { type: 'favoris', chemin }), source)
    expect(imp).toMatchObject({ ok: true })
    attendus = await bookmarks(a.fenetre)
    expect(attendus).toEqual([
      ['https://b.fr/', 'B', 'Travail'],
      ['https://c.fr/?a=1&b=2', 'C "quoted"', 'Travail / Projets'],
      ['https://racine.fr/', 'Racine & Cie', undefined]
    ])
    expect(await r.evaluate((chemin) => window.lyra.invoke('export:favoris', { chemin }), sortie)).toEqual({ ok: true, chemin: sortie, compte: 3 })
    expect(readFileSync(sortie, 'utf8')).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
  } finally {
    await a.app.close()
  }
  const b = await lancerLyra()
  try {
    expect(await bookmarks(b.fenetre)).toEqual([])
    const r = await ouvrirReglages(b.app, b.fenetre)
    expect(await r.evaluate((chemin) => window.lyra.invoke('import:fichier', { type: 'favoris', chemin }), sortie)).toMatchObject({ ok: true })
    expect(await bookmarks(b.fenetre)).toEqual(attendus)
  } finally {
    await b.app.close()
  }
})

test('paquet .lyra : export, mauvaise phrase sans effet, bonne phrase restaure favoris, ciel, réglages et historique', async () => {
  const src = { html: join(dossier, 'p-source.html'), ciel: join(dossier, 'p-ciel.json'), csv: join(dossier, 'p-histo.csv'), paquet: join(dossier, 'sauvegarde.lyra') }
  writeFileSync(src.html, FAVORIS_HTML)
  writeFileSync(src.ciel, CIEL_JSON)
  writeFileSync(src.csv, CSV)
  const a = await lancerLyra()
  try {
    const r = await ouvrirReglages(a.app, a.fenetre)
    for (const [type, chemin] of [['favoris', src.html], ['ciel', src.ciel], ['historique', src.csv]] as const) {
      expect(await r.evaluate((d) => window.lyra.invoke('import:fichier', d), { type, chemin })).toMatchObject({ ok: true })
    }
    await a.fenetre.evaluate(() => window.lyra.invoke('settings:set', { theme: 'sombre', sites: { 'https://regle.fr': { boucliers: false, zoom: 1.25 } } }))
    // Phrase trop courte : refusée avant tout fichier.
    expect(await r.evaluate((chemin) => window.lyra.invoke('export:paquet', { chemin, phrase: 'court' }), src.paquet)).toMatchObject({ ok: false, erreur: 'phrase-courte' })
    expect(existsSync(src.paquet)).toBe(false)
    const res = await r.evaluate((chemin) => window.lyra.invoke('export:paquet', { chemin, phrase: 'phrase de passe e2e solide' }), src.paquet)
    expect(res).toMatchObject({ ok: true, chemin: src.paquet })
    const brut = readFileSync(src.paquet)
    expect(brut.subarray(0, 5).toString('latin1')).toBe('LYRA1')
    expect(brut.includes('racine.fr')).toBe(false)
  } finally {
    await a.app.close()
  }

  const b = await lancerLyra()
  try {
    const r = await ouvrirReglages(b.app, b.fenetre)
    const avant = await b.fenetre.evaluate(async () => ({ favoris: await window.lyra.invoke('bookmarks:list'), sky: (await window.lyra.invoke('sky:get')).sky, settings: await window.lyra.invoke('settings:get') }))
    const mauvaise = await r.evaluate((chemin) => window.lyra.invoke('import:fichier', { type: 'paquet', chemin, phrase: 'une mauvaise phrase de passe' }), src.paquet)
    expect(mauvaise).toEqual({ ok: false, erreur: 'phrase', message: 'Phrase de passe incorrecte ou fichier endommagé' })
    const apres = await b.fenetre.evaluate(async () => ({ favoris: await window.lyra.invoke('bookmarks:list'), sky: (await window.lyra.invoke('sky:get')).sky, settings: await window.lyra.invoke('settings:get') }))
    expect(apres).toEqual(avant)

    const bonne = await r.evaluate((chemin) => window.lyra.invoke('import:fichier', { type: 'paquet', chemin, phrase: 'phrase de passe e2e solide' }), src.paquet)
    expect(bonne).toMatchObject({ ok: true, reglages: true, cookies: 0 })
    expect(await bookmarks(b.fenetre)).toEqual([
      ['https://b.fr/', 'B', 'Travail'],
      ['https://c.fr/?a=1&b=2', 'C "quoted"', 'Travail / Projets'],
      ['https://racine.fr/', 'Racine & Cie', undefined]
    ])
    const { sky } = await b.fenetre.evaluate(() => window.lyra.invoke('sky:get'))
    expect(sky.constellations.map((c) => [c.name, c.color])).toEqual([['Lecture', '#3FB187']])
    expect(sky.stars.map((s) => s.url)).toEqual(expect.arrayContaining(['https://lire.fr/', 'https://libre.fr/']))
    expect(sky.stars.find((s) => s.url === 'https://lire.fr/')).toMatchObject({ pinned: true })
    const reglages = await b.fenetre.evaluate(() => window.lyra.invoke('settings:get'))
    expect(reglages.theme).toBe('sombre')
    expect(reglages.sites['https://regle.fr']).toEqual({ boucliers: false, zoom: 1.25 })
    const histo = await b.fenetre.evaluate(() => window.lyra.invoke('history:search', { texte: 'histo.fr' }))
    expect(histo.map((h) => h.url)).toEqual(['https://histo.fr/a'])
  } finally {
    await b.app.close()
  }
})

test('exports ciel, historique et réglages ; sauvegarde automatique activée puis coupée sans jamais écrire la phrase', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'lyra-export-ud-'))
  const dossierAuto = join(dossier, 'auto')
  const a = await lancerLyra({ LYRA_USER_DATA: userData })
  try {
    const r = await ouvrirReglages(a.app, a.fenetre)
    writeFileSync(join(dossier, 'e-ciel.json'), CIEL_JSON)
    writeFileSync(join(dossier, 'e-histo.csv'), CSV)
    await r.evaluate((chemin) => window.lyra.invoke('import:fichier', { type: 'ciel', chemin }), join(dossier, 'e-ciel.json'))
    await r.evaluate((chemin) => window.lyra.invoke('import:fichier', { type: 'historique', chemin }), join(dossier, 'e-histo.csv'))
    const ciel = join(dossier, 'sortie-ciel.json')
    const histo = join(dossier, 'sortie-histo.csv')
    const regl = join(dossier, 'sortie-reglages.json')
    expect(await r.evaluate((chemin) => window.lyra.invoke('export:ciel', { chemin }), ciel)).toMatchObject({ ok: true, compte: 2 })
    expect(await r.evaluate((chemin) => window.lyra.invoke('export:historique', { chemin }), histo)).toMatchObject({ ok: true, compte: 1 })
    expect(await r.evaluate((chemin) => window.lyra.invoke('export:reglages', { chemin }), regl)).toMatchObject({ ok: true })
    expect(JSON.parse(readFileSync(ciel, 'utf8'))).toMatchObject({ format: 'lyra-ciel', etoiles: [{ url: 'https://lire.fr/' }, { url: 'https://libre.fr/' }] })
    expect(readFileSync(histo, 'utf8')).toBe('date,titre,adresse,visites\r\n2026-01-02T03:04:05.000Z,"Page, avec virgule",https://histo.fr/a,1\r\n')
    expect(JSON.parse(readFileSync(regl, 'utf8')).version).toBe(1)

    // Phrase trop courte : refus ; sinon activation, première sauvegarde peu après, jamais la phrase sur le disque.
    expect(await r.evaluate((d) => window.lyra.invoke('export:sauvegardeAuto', d), { activer: true, dossier: dossierAuto, phrase: 'court' })).toMatchObject({ ok: false, erreur: 'phrase-courte' })
    const on = await r.evaluate((d) => window.lyra.invoke('export:sauvegardeAuto', d), { activer: true, dossier: dossierAuto, phrase: PHRASE })
    expect(on).toMatchObject({ ok: true, etat: { actif: true, dossier: dossierAuto } })
    await expect.poll(() => (existsSync(dossierAuto) ? readdirSync(dossierAuto).filter((n) => n.endsWith('.lyra')).length : 0), { timeout: 20_000 }).toBe(1)
    const etat = await r.evaluate(() => window.lyra.invoke('export:sauvegardeEtat'))
    expect(etat.derniere ?? 0).toBeGreaterThan(0)
    expect(readFileSync(join(userData, 'sauvegarde-auto.json'), 'utf8')).not.toContain(PHRASE)
    const off = await r.evaluate((d) => window.lyra.invoke('export:sauvegardeAuto', d), { activer: false })
    expect(off).toEqual({ ok: true, etat: { actif: false } })
    expect(readdirSync(dossierAuto).filter((n) => n.endsWith('.lyra'))).toHaveLength(1)
  } finally {
    await a.app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

test('refusé depuis une fenêtre privée : rien n’est écrit ni lu', async () => {
  const { app, fenetre } = await lancerLyra()
  try {
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('fenetre-privee')!.click())
    await expect.poll(() => interfaces(app).find((p) => p.url().includes('#privee'))).toBeDefined()
    const privee = interfaces(app).find((p) => p.url().includes('#privee'))!
    const r = await ouvrirReglages(app, privee)
    const sortie = join(dossier, 'prive.html')
    await expect(r.evaluate((chemin) => window.lyra.invoke('export:favoris', { chemin }), sortie)).rejects.toThrow()
    await expect(r.evaluate((chemin) => window.lyra.invoke('export:paquet', { chemin, phrase: 'phrase de passe e2e solide' }), join(dossier, 'prive.lyra'))).rejects.toThrow()
    await expect(r.evaluate((d) => window.lyra.invoke('export:sauvegardeAuto', d), { activer: true, dossier: join(dossier, 'prive-auto'), phrase: 'phrase de passe e2e solide' })).rejects.toThrow()
    const ciel = join(dossier, 'prive-ciel.json')
    writeFileSync(ciel, CIEL_JSON)
    expect(await r.evaluate((chemin) => window.lyra.invoke('import:fichier', { type: 'ciel', chemin }), ciel)).toMatchObject({ ok: false, erreur: 'prive' })
    expect(existsSync(sortie)).toBe(false)
    expect(existsSync(join(dossier, 'prive.lyra'))).toBe(false)
    expect(existsSync(join(dossier, 'prive-auto'))).toBe(false)
    const { sky } = await fenetre.evaluate(() => window.lyra.invoke('sky:get'))
    expect(sky.constellations).toEqual([])
  } finally {
    await app.close()
  }
})
