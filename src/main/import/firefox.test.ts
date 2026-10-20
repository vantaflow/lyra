import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { convertirModeleFirefox, detecterProfilsFirefox, firefoxVersMs, lireIni, lireMoteurParDefautFirefox, lirePrefsJs, lireProfilFirefox, parcourirHistoriqueFirefox } from './firefox'
import { MAINTENANT_FIXTURES_FIREFOX, PROFIL_DEFAUT, jsonMozlz4 } from './fixtures/generer-firefox'
import { estIndisponible } from './types'
import type { ElementImport, ProfilDetecte, Visite } from './types'

const FIXTURES = fileURLToPath(new URL('./fixtures/firefox', import.meta.url))
const MAINTENANT = MAINTENANT_FIXTURES_FIREFOX

async function profil(nom = 'default-release'): Promise<ProfilDetecte> {
  const p = (await detecterProfilsFirefox(FIXTURES)).find((x) => x.nom === nom)
  if (!p) throw new Error(`profil ${nom} introuvable`)
  return p
}

const lire = (p: ProfilDetecte, elements: ElementImport[], extra: Parameters<typeof lireProfilFirefox>[1] = {}) => lireProfilFirefox(p, { elements, maintenant: MAINTENANT, ...extra })

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-firefox-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function profilJetable(nom = 'Jetable'): ProfilDetecte {
  const chemin = join(tmp, 'profil')
  mkdirSync(chemin, { recursive: true })
  return { navigateur: 'firefox', nom, chemin, racine: tmp, parDefaut: true }
}

describe('détection', () => {
  it('profiles.ini : deux profils, le défaut vient de la section Install, chemins relatifs résolus', async () => {
    const profils = await detecterProfilsFirefox(FIXTURES)
    expect(profils.map((p) => [p.nom, p.parDefaut, p.ouvert])).toEqual([
      ['default-release', true, false],
      ['travail', false, false]
    ])
    expect(profils[0].chemin).toBe(join(FIXTURES, ...PROFIL_DEFAUT.split('/')))
    expect(profils[0].racine).toBe(FIXTURES)
  })

  it('pas de profiles.ini, ou profils dont le dossier manque : liste vide ; verrou parent.lock → ouvert', async () => {
    expect(await detecterProfilsFirefox(join(tmp, 'absent'))).toEqual([])
    writeFileSync(join(tmp, 'profiles.ini'), '[Profile0]\nName=x\nIsRelative=1\nPath=Profiles/x\n')
    expect(await detecterProfilsFirefox(tmp)).toEqual([])
    mkdirSync(join(tmp, 'Profiles', 'x'), { recursive: true })
    writeFileSync(join(tmp, 'Profiles', 'x', 'parent.lock'), '')
    const [p] = await detecterProfilsFirefox(tmp)
    expect(p).toMatchObject({ nom: 'x', parDefaut: true, ouvert: true })
  })

  it('lireIni : sections, clés en minuscules, commentaires ignorés', () => {
    expect(lireIni('; c\n[A]\nName = x\nPath=p\n# c\n[B]\n')).toEqual([{ nom: 'A', cles: { name: 'x', path: 'p' } }, { nom: 'B', cles: {} }])
  })
})

describe('dates', () => {
  it('µs depuis 1970 → ms ; valeurs absurdes → 0', () => {
    expect(firefoxVersMs(1_000_000)).toBe(1000)
    for (const v of [undefined, null, '', 'abc', 0, -5]) expect(firefoxVersMs(v)).toBe(0)
  })
})

describe('favoris', () => {
  it('barre, menu et non classés, dossier mobile, séparateurs et requêtes place: ignorés, étiquettes non parcourues', async () => {
    const r = await lire(await profil(), ['favoris'])
    const t = Date.UTC(2026, 0, 1)
    expect(r.donnees.favoris).toEqual({
      barre: [
        { type: 'lien', titre: 'Exemple', url: 'https://example.com/', date: t },
        { type: 'dossier', titre: 'Lecture', date: t, enfants: [{ type: 'lien', titre: 'Guide', url: 'https://docs.example.org/guide', date: t }] }
      ],
      autres: [
        { type: 'lien', titre: 'Wikipédia', url: 'https://fr.wikipedia.org/', date: t },
        { type: 'dossier', titre: 'Vide', date: t, enfants: [] },
        { type: 'dossier', titre: 'Favoris mobiles', date: 0, enfants: [{ type: 'lien', titre: 'Mobile', url: 'https://m.example.net/', date: t }] }
      ]
    })
    expect(r.compteurs.favoris).toEqual({ favoris: 4, dossiers: 3 })
  })

  it('places.sqlite absent ou corrompu : Indisponible, sans exception', async () => {
    const p = profilJetable()
    expect(estIndisponible((await lire(p, ['favoris'])).donnees.favoris)).toBe(true)
    writeFileSync(join(p.chemin, 'places.sqlite'), 'pas une base')
    const r = await lire(p, ['favoris', 'historique'])
    expect(estIndisponible(r.donnees.favoris)).toBe(true)
    expect(estIndisponible(r.donnees.historique)).toBe(true)
  })
})

describe('historique', () => {
  it('92 jours par défaut, visites comptées dans la fenêtre, pages http(s) seulement, tri du plus récent', async () => {
    const r = await lire(await profil(), ['historique'])
    expect(r.donnees.historique).toEqual([
      { url: 'https://example.com/', titre: 'Exemple', date: Date.parse('2026-10-18T10:00:00Z'), visites: 5 },
      { url: 'http://insecure.example.com/', titre: 'Sans TLS', date: Date.parse('2026-10-10T12:00:00Z'), visites: 1 },
      { url: 'https://docs.example.org/guide', titre: 'Guide', date: Date.parse('2026-09-01T08:00:00Z'), visites: 2 }
    ])
    expect(r.compteurs.historique).toEqual({ pages: 3, visites: 8 })
  })

  it('tout l’historique (null) et fenêtre courte', async () => {
    const tout = await lire(await profil(), ['historique'], { depuisJours: null })
    expect((tout.donnees.historique as Visite[]).map((v) => v.url)).toContain('https://old.example.net/')
    const court = await lire(await profil(), ['historique'], { depuisJours: 2 })
    expect((court.donnees.historique as Visite[]).map((v) => v.url)).toEqual(['https://example.com/'])
  })

  it('en flux : lots de 2, progression, résumé', async () => {
    const lots: number[] = []
    const progression: number[] = []
    const r = await parcourirHistoriqueFirefox(await profil(), { maintenant: MAINTENANT, tailleLot: 2, surProgression: (p) => progression.push(p.fait) }, (lot) => void lots.push(lot.length))
    expect(r).toEqual({ pages: 3, visites: 8 })
    expect(lots).toEqual([1, 2])
    expect(progression.at(-1)).toBe(3)
  })

  it('annulation : Indisponible code annule', async () => {
    const ctl = new AbortController()
    ctl.abort()
    const r = await lire(await profil(), ['historique', 'favoris'], { signal: ctl.signal })
    expect(r.donnees.historique).toMatchObject({ indisponible: true, code: 'annule' })
  })
})

describe('onglets', () => {
  it('fenêtres, groupes nommés et anonymes, épinglé, about: ignoré, fenêtres fermées ignorées', async () => {
    const r = await lire(await profil(), ['onglets'])
    expect(r.donnees.onglets).toEqual({
      fenetres: [
        {
          onglets: [
            { url: 'https://example.com/', titre: 'Exemple', epingle: true },
            { url: 'https://docs.example.org/guide', titre: 'Guide', groupe: 'g1' },
            { url: 'https://fr.wikipedia.org/', titre: 'Wikipédia', groupe: 'g1' },
            { url: 'https://news.example.org/', titre: 'Actualités', groupe: 'g2' }
          ],
          groupes: [
            { id: 'g1', nom: 'Docs', couleur: 'bleu' },
            { id: 'g2', nom: '', couleur: 'rouge' }
          ]
        },
        { onglets: [{ url: 'https://second.example/', titre: 'Seconde fenêtre' }], groupes: [] }
      ]
    })
    expect(r.compteurs.onglets).toEqual({ fenetres: 2, onglets: 5, groupes: 2 })
  })

  it('sessionstore.jsonlz4 (fermeture propre) prime sur recovery ; session vide → code vide ; fichier corrompu → Indisponible', async () => {
    const p = profilJetable()
    expect(estIndisponible((await lire(p, ['onglets'])).donnees.onglets)).toBe(true)
    mkdirSync(join(p.chemin, 'sessionstore-backups'))
    writeFileSync(join(p.chemin, 'sessionstore-backups', 'recovery.jsonlz4'), jsonMozlz4({ windows: [{ tabs: [{ entries: [{ url: 'https://recovery.example/' }], index: 1 }] }] }))
    writeFileSync(join(p.chemin, 'sessionstore.jsonlz4'), jsonMozlz4({ windows: [{ tabs: [{ entries: [{ url: 'https://propre.example/' }], index: 1 }] }] }))
    expect((await lire(p, ['onglets'])).donnees.onglets).toEqual({ fenetres: [{ onglets: [{ url: 'https://propre.example/', titre: 'https://propre.example/' }], groupes: [] }] })
    writeFileSync(join(p.chemin, 'sessionstore.jsonlz4'), jsonMozlz4({ windows: [{ tabs: [{ entries: [{ url: 'about:blank' }], index: 1 }] }] }))
    expect((await lire(p, ['onglets'])).donnees.onglets).toMatchObject({ indisponible: true, code: 'vide' })
    // vraie corruption : en-tête et taille plausibles, bloc LZ4 tronqué (les littéraux annoncés dépassent le fichier)
    const bon = jsonMozlz4({ windows: [{ tabs: [{ entries: [{ url: 'https://propre.example/' }], index: 1 }] }] })
    writeFileSync(join(p.chemin, 'sessionstore.jsonlz4'), bon.subarray(0, bon.length - 10))
    expect((await lire(p, ['onglets'])).donnees.onglets).toMatchObject({ indisponible: true, raison: expect.stringMatching(/décompresser.*corrompu/) })
    // taille annoncée sans rapport avec le fichier : refusée comme corrompue, pas comme « trop volumineux »
    writeFileSync(join(p.chemin, 'sessionstore.jsonlz4'), 'mozLz40\0corrompu')
    expect((await lire(p, ['onglets'])).donnees.onglets).toMatchObject({ indisponible: true, raison: expect.stringMatching(/corrompu/) })
  })
})

describe('moteurs', () => {
  it('moteurs perso avec alias et params, défaut repéré, cachés et sans termes ignorés, fournis par Firefox sans adresse ignorés', async () => {
    const r = await lire(await profil(), ['moteurs'])
    expect(r.donnees.moteurs).toEqual([
      { nom: 'Wikipédia (fr)', motCle: 'w', url: 'https://fr.wikipedia.org/w/index.php?search=%s&sourceid=firefox', perso: true },
      { nom: 'Mon moteur', motCle: 'mm', url: 'https://search.example.org/?q=%s&lang=fr', perso: true }
    ])
    expect(r.compteurs.moteurs).toEqual({ moteurs: 0, motsCles: 2 })
  })

  it('moteur par défaut exposé même intégré (ddg), absent → undefined, fichier absent → Indisponible', async () => {
    expect(await lireMoteurParDefautFirefox(await profil(), { maintenant: MAINTENANT })).toEqual({ id: 'ddg', nom: 'DuckDuckGo', integre: true })
    const p = profilJetable()
    expect(estIndisponible(await lireMoteurParDefautFirefox(p))).toBe(true)
    writeFileSync(join(p.chemin, 'search.json.mozlz4'), jsonMozlz4({ engines: [{ id: 'x', _name: 'X', _loadPath: '[user]' }], metaData: { current: 'X' } }))
    expect(await lireMoteurParDefautFirefox(p)).toEqual({ id: 'X', nom: 'X', integre: false })
    writeFileSync(join(p.chemin, 'search.json.mozlz4'), jsonMozlz4({ engines: [], metaData: {} }))
    expect(await lireMoteurParDefautFirefox(p)).toBeUndefined()
  })

  it('convertirModeleFirefox', () => {
    expect(convertirModeleFirefox('https://a.example/s?q={searchTerms}&ie={inputEncoding}', undefined)).toBe('https://a.example/s?q=%s&ie=UTF-8')
    expect(convertirModeleFirefox('https://a.example/s', [{ name: 'q', value: '{searchTerms}' }])).toBe('https://a.example/s?q=%s')
    expect(convertirModeleFirefox('https://a.example/s', [])).toBeUndefined()
    expect(convertirModeleFirefox('ftp://a.example/{searchTerms}', [])).toBeUndefined()
  })
})

describe('extensions', () => {
  it('extensions du profil seulement, signées → firefox, temporaire → inconnu, désactivée → actif false, triées', async () => {
    const r = await lire(await profil(), ['extensions'])
    expect(r.donnees.extensions).toEqual([
      { id: '{446900e4-71c2-419f-a6a7-df9c091e268b}', nom: 'Bitwarden', magasin: 'firefox', actif: false },
      { id: 'dev@example.test', nom: 'Extension de développement', magasin: 'inconnu', actif: true },
      { id: 'sans-nom@example.test', nom: 'sans-nom@example.test', magasin: 'firefox', actif: true },
      { id: 'uBlock0@raymondhill.net', nom: 'uBlock Origin', magasin: 'firefox', actif: true }
    ])
  })

  it('extensions.json corrompu : Indisponible', async () => {
    const p = profilJetable()
    writeFileSync(join(p.chemin, 'extensions.json'), '{')
    expect(estIndisponible((await lire(p, ['extensions'])).donnees.extensions)).toBe(true)
  })
})

describe('réglages', () => {
  it('page d’accueil (première adresse http), dossier de téléchargement si folderList = 2, langue, zoom par site', async () => {
    const r = await lire(await profil(), ['reglages'])
    expect(r.donnees.reglages).toEqual({
      pageAccueil: 'https://start.example.org/',
      dossierTelechargement: 'C:\\Users\\Test\\Téléchargements',
      langue: 'fr-FR',
      zoomParSite: { 'example.com': 1.2, 'docs.example.org': 1.5 }
    })
    expect(r.compteurs.reglages).toEqual({ total: 5 })
  })

  it('profil presque vide : seulement la langue ; lirePrefsJs tolère les lignes inattendues', async () => {
    const r = await lire(await profil('travail'), ['reglages'])
    expect(r.donnees.reglages).toEqual({ langue: 'en-US' })
    const prefs = lirePrefsJs('// c\nuser_pref("a.b", "x\\"y");\nuser_pref("n", 2);\nuser_pref("t", true);\nn\'importe quoi\nuser_pref("cassee", {);\n')
    expect([...prefs]).toEqual([['a.b', 'x"y'], ['n', 2], ['t', true]])
  })
})

describe('profil absent', () => {
  it('tous les éléments demandés sont indisponibles', async () => {
    const r = await lireProfilFirefox({ navigateur: 'firefox', nom: 'Fantôme', chemin: join(tmp, 'nulle-part'), racine: tmp, parDefaut: true })
    expect(Object.values(r.donnees).every(estIndisponible)).toBe(true)
    expect(Object.keys(r.donnees)).toHaveLength(6)
  })
})
