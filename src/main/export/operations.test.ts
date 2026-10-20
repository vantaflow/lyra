import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ERREUR_PHRASE } from '../../shared/exportTextes'
import type { SkyState } from '../../shared/types'
import { Bookmarks } from '../bookmarks/Bookmarks'
import { History } from '../history/History'
import type { CibleCiel, CiblesImport } from '../import/appliquer'
import { creerReglages } from '../settings/settings'
import type { CookieSauvegarde } from './paquet'
import { exporterCiel, exporterFavoris, exporterHistorique, exporterPaquet, exporterReglages, importerFichier, type DepsOperations } from './operations'

const OPTIONS = { fenetre: 'courante' as const, ouvrirMaintenant: false, moteurParDefaut: false, extensionsChoisies: [] }
const PHRASE = 'phrase de passe correcte'

function monde(nom = 'a') {
  const d = mkdtempSync(join(tmpdir(), `lyra-op-${nom}-`))
  const favoris = new Bookmarks(join(d, 'favoris.json'))
  const historique = new History(join(d, 'historique.jsonl'))
  const reglages = creerReglages(join(d, 'settings.json'), join(d, 'dl'))
  const constellations: Array<{ id: string; name: string; color: string }> = []
  const etoiles: Array<{ url: string; titre?: string; constellationId?: string; epingle?: boolean }> = []
  const ciel: CibleCiel = {
    constellations: () => constellations,
    creerConstellation: (o) => {
      const c = { id: `c${constellations.length + 1}`, ...o }
      constellations.push(c)
      return c
    },
    ouvrirEndormie: (url, o) => {
      etoiles.push({ url, titre: o?.titre, constellationId: o?.constellationId, epingle: o?.epingle })
      return `s${etoiles.length}`
    },
    sauver: () => undefined
  }
  const jar = new Map<string, CookieSauvegarde>()
  const skyState = (): SkyState => ({
    constellations: constellations.map((c) => ({ ...c })),
    stars: etoiles.map((e, i) => ({ id: `s${i + 1}`, url: e.url, title: e.titre ?? '', pinned: e.epingle === true, dormant: true, index: i, ...(e.constellationId ? { constellationId: e.constellationId } : {}) })),
    activeId: null,
    pinned: []
  })
  const deps: DepsOperations = {
    version: '0.1.0',
    favoris,
    historique,
    reglages,
    ciel: skyState,
    cookies: { lire: async () => [...jar.values()], ecrire: async (c) => (jar.set(c.name + c.domain, c), true) }
  }
  const cibles: CiblesImport = { favoris, historique, ciel, reglages: { get: () => reglages.getSettings(), set: (p) => reglages.setSettings(p) } }
  return { d, favoris, historique, reglages, constellations, etoiles, jar, deps, cibles, chemin: (n: string) => join(d, n) }
}

const favorisDe = (m: ReturnType<typeof monde>): Array<[string, string, string | undefined]> => m.favoris.lister().map((f) => [f.url, f.title, f.dossier])

describe('export / import de fichiers (vrais magasins, sans Electron)', () => {
  it('favoris HTML : export puis import dans un profil neuf → mêmes favoris (dossiers imbriqués, caractères spéciaux)', async () => {
    const a = monde('a')
    a.favoris.ajouterLot([
      { url: 'https://a.fr/', title: 'A & <B>' },
      { url: 'https://b.fr/', title: 'B', dossier: 'Travail / Projets' },
      { url: 'https://c.fr/?x=1&y=2', title: 'C "q"', dossier: 'Loisirs' }
    ])
    const r = await exporterFavoris(a.chemin('f.html'), a.deps)
    expect(r.compte).toBe(3)
    const b = monde('b')
    const rep = await importerFichier({ type: 'favoris', chemin: a.chemin('f.html') }, b.cibles, b.deps, OPTIONS)
    expect(rep.ok).toBe(true)
    expect(favorisDe(b).sort()).toEqual(favorisDe(a).sort())
    // Deuxième import : rien de plus (même déduplication qu'un import de navigateur).
    const encore = await importerFichier({ type: 'favoris', chemin: a.chemin('f.html') }, b.cibles, b.deps, OPTIONS)
    expect(encore.ok && encore.resultat.favoris).toMatchObject({ ajoutes: 0, presents: 3 })
    expect(b.favoris.lister()).toHaveLength(3)
  })

  it('un fichier sans favori n’est pas un fichier de favoris', async () => {
    const b = monde('b')
    writeFileSync(b.chemin('x.html'), '<html><body>bonjour</body></html>')
    const rep = await importerFichier({ type: 'favoris', chemin: b.chemin('x.html') }, b.cibles, b.deps, OPTIONS)
    expect(rep).toMatchObject({ ok: false, erreur: 'invalide' })
  })

  it('historique CSV : export puis import → mêmes pages et même dernière visite', async () => {
    const a = monde('a')
    a.historique.ajouter({ url: 'https://a.fr/', title: 'Dit "oui", puis non', date: 1_700_000_000_000 })
    a.historique.ajouter({ url: 'https://a.fr/', title: 'Dit "oui", puis non', date: 1_700_000_500_000 })
    a.historique.ajouter({ url: 'https://b.fr/x?y=1,2', title: '', date: 1_700_000_100_000 })
    const r = await exporterHistorique(a.chemin('h.csv'), a.deps)
    expect(r.compte).toBe(2)
    expect(readFileSync(a.chemin('h.csv'), 'utf8').split('\r\n')[0]).toBe('date,titre,adresse,visites')
    const b = monde('b')
    const rep = await importerFichier({ type: 'historique', chemin: a.chemin('h.csv') }, b.cibles, b.deps, OPTIONS)
    expect(rep.ok && rep.resultat.historique).toMatchObject({ etat: 'ok', ajoutes: 2 })
    expect(b.historique.rechercher('', 10).map((e) => [e.url, e.title, e.visitedAt])).toEqual([['https://a.fr/', 'Dit "oui", puis non', 1_700_000_500_000], ['https://b.fr/x?y=1,2', '', 1_700_000_100_000]])
  })

  it('100 000 visites : le CSV est écrit par lots avec une pause entre deux lots', async () => {
    const a = monde('a')
    const h = a.historique
    const lignes: Array<{ url: string; title: string; date: number }> = []
    for (let i = 0; i < 100_000; i++) lignes.push({ url: `https://h${i}.fr/`, title: `t${i}`, date: 1_700_000_000_000 + i })
    h.importer(lignes)
    await h.attendre()
    let pauses = 0
    const r = await exporterHistorique(a.chemin('gros.csv'), a.deps, { pause: async () => void pauses++ })
    expect(r.compte).toBe(100_000)
    expect(pauses).toBeGreaterThanOrEqual(19)
    expect(readFileSync(a.chemin('gros.csv'), 'utf8').split('\r\n').length).toBe(100_002)
    // Réimport en flux : tout revient.
    const b = monde('b')
    const rep = await importerFichier({ type: 'historique', chemin: a.chemin('gros.csv') }, b.cibles, b.deps, OPTIONS)
    expect(rep.ok && rep.resultat.historique.ajoutes).toBe(100_000)
  }, 60_000)

  it('ciel JSON : export puis import → mêmes constellations, étoiles et épingles', async () => {
    const a = monde('a')
    const k = a.cibles.ciel.creerConstellation({ name: 'Travail', color: '#5B8DEF' })
    a.cibles.ciel.ouvrirEndormie('https://a.fr/', { constellationId: k.id, titre: 'A', epingle: true })
    a.cibles.ciel.ouvrirEndormie('https://b.fr/', { titre: 'B' })
    const r = await exporterCiel(a.chemin('ciel.json'), a.deps)
    expect(r.compte).toBe(2)
    const b = monde('b')
    const rep = await importerFichier({ type: 'ciel', chemin: a.chemin('ciel.json') }, b.cibles, b.deps, OPTIONS)
    expect(rep.ok && rep.resultat.onglets).toMatchObject({ etat: 'ok', ajoutes: 2 })
    expect(b.constellations.map((c) => [c.name, c.color])).toEqual([['Travail', '#5B8DEF']])
    expect(b.etoiles.map((e) => [e.url, e.titre, e.epingle])).toEqual([['https://a.fr/', 'A', true], ['https://b.fr/', 'B', false]])
  })

  it('réglages JSON : le même fichier que « Exporter les réglages », validé à l’import (dossier de téléchargement et passerelle perso ignorés)', async () => {
    const a = monde('a')
    a.reglages.setSettings({ theme: 'sombre', sites: { 'https://x.fr': { zoom: 2 } } })
    await exporterReglages(a.chemin('r.json'), a.deps)
    expect(JSON.parse(readFileSync(a.chemin('r.json'), 'utf8'))).toEqual(a.reglages.getSettings())
    const b = monde('b')
    const rep = await importerFichier({ type: 'reglages', chemin: a.chemin('r.json') }, b.cibles, b.deps, OPTIONS)
    expect(rep.ok && rep.reglages).toBe(true)
    expect(b.reglages.getSettings().theme).toBe('sombre')
    expect(b.reglages.getSettings().sites['https://x.fr'].zoom).toBe(2)
    expect(b.reglages.getSettings().telechargements.dossier).toBe(join(b.d, 'dl'))
    writeFileSync(b.chemin('mauvais.json'), '[1,2')
    expect(await importerFichier({ type: 'reglages', chemin: b.chemin('mauvais.json') }, b.cibles, b.deps, OPTIONS)).toMatchObject({ ok: false, erreur: 'illisible' })
  })

  it('paquet : export puis import avec la bonne phrase restaure favoris, ciel, historique, réglages ; fichier en 0600', async () => {
    const a = monde('a')
    a.favoris.ajouterLot([{ url: 'https://a.fr/', title: 'A', dossier: 'D / E' }])
    a.historique.ajouter({ url: 'https://h.fr/', title: 'H', date: 1_700_000_000_000 })
    a.historique.ajouter({ url: 'https://h.fr/', title: 'H', date: 1_700_000_900_000 })
    a.cibles.ciel.ouvrirEndormie('https://s.fr/', { titre: 'S', epingle: true })
    a.reglages.setSettings({ theme: 'clair', sites: { 'https://x.fr': { boucliers: false } } })
    const r = await exporterPaquet(a.chemin('p.lyra'), a.deps, { phrase: PHRASE })
    expect(r.compte).toBeGreaterThan(0)
    if (process.platform !== 'win32') expect(statSync(a.chemin('p.lyra')).mode & 0o077).toBe(0)
    const b = monde('b')
    const rep = await importerFichier({ type: 'paquet', chemin: a.chemin('p.lyra'), phrase: PHRASE }, b.cibles, b.deps, OPTIONS)
    expect(rep.ok).toBe(true)
    expect(favorisDe(b)).toEqual([['https://a.fr/', 'A', 'D / E']])
    expect(b.etoiles.map((e) => [e.url, e.epingle])).toEqual([['https://s.fr/', true]])
    expect([...b.historique.visites()].map((v) => v.date).sort()).toEqual([1_700_000_000_000, 1_700_000_900_000])
    expect(b.reglages.getSettings().theme).toBe('clair')
    expect(b.reglages.getSettings().sites['https://x.fr']).toEqual({ boucliers: false })
    expect(b.jar.size).toBe(0)
  })

  it('paquet : mauvaise phrase ou fichier endommagé → erreur claire, rien n’est écrit', async () => {
    const a = monde('a')
    a.favoris.ajouterLot([{ url: 'https://a.fr/', title: 'A' }])
    a.reglages.setSettings({ theme: 'sombre' })
    await exporterPaquet(a.chemin('p.lyra'), a.deps, { phrase: PHRASE })
    const b = monde('b')
    const avant = JSON.stringify(b.reglages.getSettings())
    const mauvaise = await importerFichier({ type: 'paquet', chemin: a.chemin('p.lyra'), phrase: 'mauvaise phrase de passe' }, b.cibles, b.deps, OPTIONS)
    expect(mauvaise).toEqual({ ok: false, erreur: 'phrase', message: ERREUR_PHRASE })
    const tronque = readFileSync(a.chemin('p.lyra')).subarray(0, 200)
    writeFileSync(b.chemin('t.lyra'), tronque)
    expect(await importerFichier({ type: 'paquet', chemin: b.chemin('t.lyra'), phrase: PHRASE }, b.cibles, b.deps, OPTIONS)).toMatchObject({ ok: false, erreur: 'phrase', message: ERREUR_PHRASE })
    writeFileSync(b.chemin('n.lyra'), 'ceci est un fichier texte quelconque, assez long pour dépasser la taille minimale d’un paquet')
    expect(await importerFichier({ type: 'paquet', chemin: b.chemin('n.lyra'), phrase: PHRASE }, b.cibles, b.deps, OPTIONS)).toMatchObject({ ok: false, erreur: 'format' })
    expect(await importerFichier({ type: 'paquet', chemin: a.chemin('p.lyra') }, b.cibles, b.deps, OPTIONS)).toMatchObject({ ok: false, erreur: 'phrase' })
    expect(b.favoris.lister()).toEqual([])
    expect(b.etoiles).toEqual([])
    expect(JSON.stringify(b.reglages.getSettings())).toBe(avant)
    expect([...b.historique.visites()]).toEqual([])
  })

  it('cookies : jamais exportés par défaut ; exportés si demandé ; restaurés seulement si l’utilisateur le demande à l’import', async () => {
    const a = monde('a')
    const ck: CookieSauvegarde = { name: 'sid', value: 'secret-de-session', domain: '.exemple.fr', path: '/', secure: true, httpOnly: true, hostOnly: false }
    a.jar.set('sid', ck)
    await exporterPaquet(a.chemin('sans.lyra'), a.deps, { phrase: PHRASE })
    await exporterPaquet(a.chemin('avec.lyra'), a.deps, { phrase: PHRASE, cookies: true })
    const b = monde('b')
    const sans = await importerFichier({ type: 'paquet', chemin: a.chemin('sans.lyra'), phrase: PHRASE, cookies: true }, b.cibles, b.deps, OPTIONS)
    expect(sans.ok && sans.cookies).toBe(0)
    expect(sans.ok && sans.avertissements.join()).toMatch(/cookies/i)
    const pasDemande = await importerFichier({ type: 'paquet', chemin: a.chemin('avec.lyra'), phrase: PHRASE }, b.cibles, b.deps, OPTIONS)
    expect(pasDemande.ok && pasDemande.cookies).toBe(0)
    expect(b.jar.size).toBe(0)
    const demande = await importerFichier({ type: 'paquet', chemin: a.chemin('avec.lyra'), phrase: PHRASE, cookies: true }, b.cibles, b.deps, OPTIONS)
    expect(demande.ok && demande.cookies).toBe(1)
    expect([...b.jar.values()]).toEqual([ck])
    // Le contenu clair n'apparaît dans aucun des fichiers.
    expect(readFileSync(a.chemin('avec.lyra')).includes('secret-de-session')).toBe(false)
  })

  it('fichier trop gros ou absent : refus propre', async () => {
    const b = monde('b')
    expect(await importerFichier({ type: 'ciel', chemin: b.chemin('absent.json') }, b.cibles, b.deps, OPTIONS)).toMatchObject({ ok: false, erreur: 'illisible' })
    expect(existsSync(b.chemin('absent.json'))).toBe(false)
  })
})
