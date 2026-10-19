import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chromiumVersMs, convertirModeleMoteur, lireProfilChromium, msVersChromium, parcourirHistoriqueChromium } from './chromium'
import { detecterProfils } from './detection'
import { IDS_EXTENSIONS, MAINTENANT_FIXTURES, baseHistorique, chromeUs, fichierSnss, snss } from './fixtures/generer'
import { estIndisponible } from './types'
import type { ElementImport, ProfilDetecte, Visite } from './types'

const FIXTURES = fileURLToPath(new URL('./fixtures/chromium', import.meta.url))
const MAINTENANT = MAINTENANT_FIXTURES

async function profil(navigateur: 'chrome' | 'edge' | 'brave', nom: string): Promise<ProfilDetecte> {
  const profils = await detecterProfils({ racines: { [navigateur]: join(FIXTURES, navigateur) }, navigateurs: [navigateur] })
  const p = profils.find((x) => x.nom === nom)
  if (!p) throw new Error(`profil ${nom} introuvable`)
  return p
}

async function lire(p: ProfilDetecte, elements: ElementImport[], extra: Parameters<typeof lireProfilChromium>[1] = {}) {
  return lireProfilChromium(p, { elements, maintenant: MAINTENANT, ...extra })
}

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-chromium-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

/** Profil jetable (dossier vide) pour fabriquer des cas particuliers. */
function profilJetable(nom = 'Jetable'): ProfilDetecte {
  const chemin = join(tmp, 'profil')
  mkdirSync(chemin, { recursive: true })
  return { navigateur: 'chrome', nom, chemin, racine: tmp, parDefaut: true }
}

describe('dates Chromium', () => {
  it('microsecondes depuis 1601 → millisecondes depuis 1970, et retour', () => {
    expect(chromiumVersMs('13411699200000000')).toBe(Date.UTC(2026, 0, 1))
    expect(chromiumVersMs(chromeUs('2026-10-19T12:00:00Z'))).toBe(MAINTENANT)
    expect(msVersChromium(Date.UTC(1970, 0, 1))).toBe(11_644_473_600_000_000)
  })

  it('valeurs absentes ou absurdes : 0', () => {
    for (const v of [undefined, null, '', 'abc', 0, -5, '0']) expect(chromiumVersMs(v)).toBe(0)
  })
})

describe('favoris', () => {
  it('arbre de dossiers, barre et autres, dates converties, favoris mobiles rangés dans un dossier', async () => {
    const r = await lire(await profil('chrome', 'Khalil'), ['favoris'])
    const t = Date.UTC(2026, 0, 1)
    expect(r.donnees.favoris).toEqual({
      barre: [
        { type: 'lien', titre: 'Exemple', url: 'https://example.com/', date: t },
        { type: 'dossier', titre: 'Lecture', date: t, enfants: [{ type: 'lien', titre: 'Guide', url: 'https://docs.example.org/guide', date: t }] }
      ],
      autres: [
        { type: 'lien', titre: 'Wikipédia', url: 'https://fr.wikipedia.org/', date: t },
        { type: 'dossier', titre: 'Vide', date: t, enfants: [] },
        { type: 'dossier', titre: 'Favoris mobiles', date: t, enfants: [{ type: 'lien', titre: 'Mobile', url: 'https://m.example.net/', date: t }] }
      ]
    })
    expect(r.compteurs.favoris).toEqual({ favoris: 4, dossiers: 3 })
  })

  it('les marque-pages javascript: ne sont pas importés', async () => {
    const r = await lire(await profil('chrome', 'Khalil'), ['favoris'])
    expect(JSON.stringify(r.donnees.favoris)).not.toContain('javascript')
  })

  it('profil sans fichier Bookmarks, ou fichier corrompu : Indisponible avec une raison', async () => {
    const p = profilJetable()
    expect((await lire(p, ['favoris'])).donnees.favoris).toEqual({ indisponible: true, raison: 'Aucun fichier de favoris dans ce profil.' })
    writeFileSync(join(p.chemin, 'Bookmarks'), '{ coupé')
    const r = await lire(p, ['favoris'])
    expect(estIndisponible(r.donnees.favoris) && r.donnees.favoris.raison).toMatch(/corrompu/)
    expect(r.compteurs.favoris).toBeUndefined()
  })
})

describe('historique', () => {
  const urls = (v: Visite[]): string[] => v.map((x) => x.url)

  it('92 jours par défaut : visites comptées dans la fenêtre, schémas non http(s) et sous-cadres écartés', async () => {
    const r = await lire(await profil('chrome', 'Khalil'), ['historique'])
    expect(r.donnees.historique).toEqual([
      { url: 'https://example.com/', titre: 'Exemple', date: Date.parse('2026-10-18T10:00:00Z'), visites: 5 }, // la visite de sous-cadre n'est pas comptée
      { url: 'http://insecure.example.com/', titre: 'Sans TLS', date: Date.parse('2026-10-10T12:00:00Z'), visites: 1 },
      { url: 'https://docs.example.org/guide', titre: 'Guide', date: Date.parse('2026-09-01T08:00:00Z'), visites: 2 } // 3 à vie, 2 dans les 92 jours
    ])
    expect(r.compteurs.historique).toEqual({ pages: 3, visites: 8 })
  })

  it('fenêtre paramétrable, et tout l’historique avec null', async () => {
    const p = await profil('chrome', 'Khalil')
    const an = await lire(p, ['historique'], { depuisJours: 365 })
    expect(urls(an.donnees.historique as Visite[])).toEqual(['https://example.com/', 'http://insecure.example.com/', 'https://docs.example.org/guide', 'https://old.example.net/'])
    expect((an.donnees.historique as Visite[]).find((v) => v.url.includes('docs'))?.visites).toBe(3)
    const tout = await lire(p, ['historique'], { depuisJours: null })
    expect(tout.donnees.historique).toEqual(an.donnees.historique)
    const court = await lire(p, ['historique'], { depuisJours: 3 })
    expect(court.donnees.historique).toEqual([{ url: 'https://example.com/', titre: 'Exemple', date: Date.parse('2026-10-18T10:00:00Z'), visites: 2 }])
  })

  it('sans table visits : repli sur urls (visit_count, last_visit_time)', async () => {
    const SQL = await initSqlJs()
    const p = profilJetable()
    writeFileSync(join(p.chemin, 'History'), baseHistorique(SQL, false))
    const r = await lire(p, ['historique'])
    expect(r.donnees.historique).toEqual([
      { url: 'https://example.com/', titre: 'Exemple', date: Date.parse('2026-10-18T10:00:00Z'), visites: 5 },
      { url: 'http://insecure.example.com/', titre: 'Sans TLS', date: Date.parse('2026-10-10T12:00:00Z'), visites: 1 },
      { url: 'https://docs.example.org/guide', titre: 'Guide', date: Date.parse('2026-09-01T08:00:00Z'), visites: 3 }
    ])
  })

  it('base corrompue : Indisponible, les autres éléments restent lus', async () => {
    const p = profilJetable()
    writeFileSync(join(p.chemin, 'History'), Buffer.from('ceci n’est pas une base SQLite, loin de là '.repeat(50)))
    cpSync(join(FIXTURES, 'chrome', 'Default', 'Bookmarks'), join(p.chemin, 'Bookmarks'))
    const r = await lire(p, ['historique', 'favoris'])
    expect(estIndisponible(r.donnees.historique) && r.donnees.historique.raison).toMatch(/corrompue/)
    expect(estIndisponible(r.donnees.favoris)).toBe(false)
    expect(r.compteurs.historique).toBeUndefined()
  })

  it('fichier d’historique sans table urls : format inconnu', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run('CREATE TABLE autre(a)')
    const p = profilJetable()
    writeFileSync(join(p.chemin, 'History'), db.export())
    const r = await lire(p, ['historique'])
    expect(estIndisponible(r.donnees.historique) && r.donnees.historique.raison).toMatch(/format inconnu/)
  })

  it('parcourirHistoriqueChromium : profil absent → Indisponible ; erreur du consommateur propagée', async () => {
    const absent = await parcourirHistoriqueChromium({ ...profilJetable(), chemin: join(tmp, 'rien') }, {}, () => {})
    expect(estIndisponible(absent)).toBe(true)
    await expect(parcourirHistoriqueChromium(await profil('chrome', 'Khalil'), { maintenant: MAINTENANT }, () => Promise.reject(new Error('disque plein')))).rejects.toThrow('disque plein')
  })
})

describe('moteurs de recherche et mots-clés', () => {
  it('{searchTerms} → %s ; moteurs du navigateur et raccourcis perso ; ni auto-générés, ni inactifs, ni internes', async () => {
    const r = await lire(await profil('chrome', 'Khalil'), ['moteurs'])
    expect(r.donnees.moteurs).toEqual([
      { nom: 'Google', motCle: 'google.com', url: 'https://www.google.com/search?q=%s&ie=UTF-8', perso: false },
      { nom: 'DuckDuckGo', motCle: 'duckduckgo.com', url: 'https://duckduckgo.com/?q=%s', parDefaut: true, perso: false },
      { nom: 'Wikipédia (fr)', motCle: 'w', url: 'https://fr.wikipedia.org/w/index.php?search=%s', perso: true },
      { nom: 'GitHub', motCle: 'gh', url: 'https://github.com/search?q=%s&type=repositories', perso: true }
    ])
    expect(r.compteurs.moteurs).toEqual({ moteurs: 2, motsCles: 2 })
    expect(JSON.stringify(r.donnees.moteurs)).not.toContain('assistant') // starter_pack_id > 0, même en https
  })

  it('profil sans Web Data : Indisponible', async () => {
    const r = await lire(await profil('edge', 'Perso'), ['moteurs'])
    expect(estIndisponible(r.donnees.moteurs) && r.donnees.moteurs.raison).toMatch(/moteurs de recherche/)
  })

  it('convertirModeleMoteur', () => {
    expect(convertirModeleMoteur('https://duckduckgo.com/?q={searchTerms}')).toBe('https://duckduckgo.com/?q=%s')
    expect(convertirModeleMoteur('https://x.example/search/{searchTerms}/')).toBe('https://x.example/search/%s/')
    expect(convertirModeleMoteur('{google:baseURL}search?q={searchTerms}&{google:RLZ}ie={inputEncoding}')).toBe('https://www.google.com/search?q=%s&ie=UTF-8')
    expect(convertirModeleMoteur('https://x.example/?q={searchTerms}&hl={language}&safe=on')).toBe('https://x.example/?q=%s&safe=on')
    expect(convertirModeleMoteur('https://x.example/')).toBeUndefined() // pas de terme de recherche
    expect(convertirModeleMoteur('chrome://bookmarks/?q={searchTerms}')).toBeUndefined() // pas http(s)
    expect(convertirModeleMoteur('')).toBeUndefined()
  })
})

describe('onglets ouverts et groupes', () => {
  it('lit la session la plus récente (Session_*), pas les onglets fermés (Tabs_*)', async () => {
    const r = await lire(await profil('chrome', 'Khalil'), ['onglets'])
    expect(r.donnees.onglets).toMatchObject({
      fenetres: [
        {
          onglets: [
            { titre: 'Exemple', groupe: '112233445566778899aabbccddeeff00' },
            { titre: 'Page B', groupe: '112233445566778899aabbccddeeff00' },
            { titre: 'Wikipédia', epingle: true },
            { titre: 'Tableau de bord', groupe: 'aaaaaaaaaaaaaaaa0000000000000001' }
          ],
          groupes: [
            { nom: 'Lecture', couleur: 'bleu' },
            { nom: 'Travail', couleur: 'rouge' }
          ]
        },
        { onglets: [{ titre: 'Deuxième fenêtre' }] }
      ]
    })
    expect(r.compteurs.onglets).toEqual({ fenetres: 2, onglets: 5, groupes: 2 })
  })

  it('profil sans session : Indisponible', async () => {
    const r = await lire(await profil('chrome', 'Travail'), ['onglets'])
    expect(estIndisponible(r.donnees.onglets) && r.donnees.onglets.raison).toMatch(/Aucune session/)
  })

  it('session chiffrée par le système (Sessions_Encrypted) : raison explicite', async () => {
    const p = profilJetable()
    mkdirSync(join(p.chemin, 'Sessions_Encrypted'))
    writeFileSync(join(p.chemin, 'Sessions_Encrypted', 'Session_13414896000000000'), 'x')
    const r = await lire(p, ['onglets'])
    expect(estIndisponible(r.donnees.onglets) && r.donnees.onglets.raison).toMatch(/chiffrée/)
  })

  it('session récente valide mais sans onglet : « aucun onglet », pas de retour à une session plus ancienne', async () => {
    const p = profilJetable()
    mkdirSync(join(p.chemin, 'Sessions'))
    writeFileSync(join(p.chemin, 'Sessions', 'Session_2000'), fichierSnss([snss.typeFenetre(1, 0), snss.marqueur()]))
    writeFileSync(join(p.chemin, 'Sessions', 'Session_1000'), fichierSnss([snss.typeFenetre(1, 0), snss.fenetreOnglet(1, 1), snss.navigation(1, 0, 'https://periment.example/', 'Périmé')]))
    const r = await lire(p, ['onglets'])
    expect(r.donnees.onglets).toMatchObject({ indisponible: true, code: 'vide', raison: expect.stringMatching(/Aucun onglet/) })
    expect(r.compteurs.onglets).toBeUndefined()
  })

  it('session récente chiffrée ou illisible : on remonte à la session précédente', async () => {
    const p = profilJetable()
    mkdirSync(join(p.chemin, 'Sessions'))
    writeFileSync(join(p.chemin, 'Sessions', 'Session_3000'), fichierSnss([snss.typeFenetre(1, 0)], 5))
    writeFileSync(join(p.chemin, 'Sessions', 'Session_2000'), 'illisible')
    writeFileSync(join(p.chemin, 'Sessions', 'Session_1000'), fichierSnss([snss.typeFenetre(1, 0), snss.fenetreOnglet(1, 1), snss.navigation(1, 0, 'https://avant.example/', 'Avant')]))
    expect((await lire(p, ['onglets'])).donnees.onglets).toMatchObject({ fenetres: [{ onglets: [{ titre: 'Avant' }] }] })
  })

  it('fichier de session illisible : Indisponible, sans exception', async () => {
    const p = profilJetable()
    mkdirSync(join(p.chemin, 'Sessions'))
    writeFileSync(join(p.chemin, 'Sessions', 'Session_13414896000000000'), Buffer.from('SNSS\u0003\u0000\u0000\u0000\u0005'))
    const r = await lire(p, ['onglets'])
    expect(estIndisponible(r.donnees.onglets)).toBe(true)
  })
})

describe('extensions', () => {
  it('extensions : nom via _locales ; hors magasin = « inconnu » ; composants, thèmes et préinstallées ignorés', async () => {
    const r = await lire(await profil('chrome', 'Khalil'), ['extensions'])
    expect(r.donnees.extensions).toEqual([
      { id: IDS_EXTENSIONS.desactivee, nom: 'Désactivée', magasin: 'chrome', actif: false },
      { id: IDS_EXTENSIONS.bloqueur, nom: 'Exemple Blocker', magasin: 'chrome', actif: true }, // __MSG_extName__ → _locales/en
      { id: IDS_EXTENSIONS.main, nom: 'Extension de développement', magasin: 'inconnu', actif: true }, // dépaquetée
      { id: IDS_EXTENSIONS.horsMagasin, nom: 'Installée à la main', magasin: 'inconnu', actif: true },
      { id: IDS_EXTENSIONS.sombre, nom: 'Lecteur sombre', magasin: 'chrome', actif: true },
      { id: IDS_EXTENSIONS.sansManifest, nom: 'Lecteur Zen', magasin: 'chrome', actif: true } // nom lu dans Extensions/<id>/<version>/manifest.json
    ])
    const ids = (r.donnees.extensions as Array<{ id: string }>).map((e) => e.id)
    for (const ignoree of [IDS_EXTENSIONS.composant, IDS_EXTENSIONS.theme, IDS_EXTENSIONS.preinstallee]) expect(ids).not.toContain(ignoree)
    expect(r.compteurs.extensions).toEqual({ total: 6, chrome: 4, edge: 0, inconnues: 2 })
  })

  it('extensions installées par défaut ou par le fabricant (OEM) : ignorées', async () => {
    const p = profilJetable()
    const id = (c: string): string => c.repeat(32)
    const store = { from_webstore: true, location: 1, state: 1, manifest: { name: 'X', version: '1', update_url: 'https://clients2.google.com/service/update2/crx' } }
    writeFileSync(
      join(p.chemin, 'Preferences'),
      JSON.stringify({ extensions: { settings: { [id('a')]: store, [id('b')]: { ...store, was_installed_by_default: true }, [id('c')]: { ...store, was_installed_by_oem: true }, [id('d')]: { ...store, was_installed_by_default: false } } } })
    )
    const ids = ((await lire(p, ['extensions'])).donnees.extensions as Array<{ id: string }>).map((e) => e.id)
    expect(ids).toEqual([id('a'), id('d')])
  })

  it('Secure Preferences corrompue : on dégrade sur Preferences au lieu de tout perdre', async () => {
    const p = profilJetable()
    const id = 'e'.repeat(32)
    writeFileSync(join(p.chemin, 'Preferences'), JSON.stringify({ extensions: { settings: { [id]: { from_webstore: true, location: 1, state: 1, manifest: { name: 'Seule survivante', version: '1' } } } } }))
    writeFileSync(join(p.chemin, 'Secure Preferences'), '{ corrompu')
    expect((await lire(p, ['extensions'])).donnees.extensions).toEqual([{ id, nom: 'Seule survivante', magasin: 'chrome', actif: true }])
    // et l'inverse : Preferences corrompue, Secure Preferences lisible
    writeFileSync(join(p.chemin, 'Preferences'), 'pas du json')
    writeFileSync(join(p.chemin, 'Secure Preferences'), JSON.stringify({ extensions: { settings: { [id]: { from_webstore: true, location: 1, manifest: { name: 'Côté sécurisé' } } } } }))
    expect((await lire(p, ['extensions'])).donnees.extensions).toMatchObject([{ id, nom: 'Côté sécurisé' }])
    // les deux corrompues : Indisponible
    writeFileSync(join(p.chemin, 'Secure Preferences'), '{ corrompu')
    expect(estIndisponible((await lire(p, ['extensions'])).donnees.extensions)).toBe(true)
  })

  it('extension d’Edge Add-ons : magasin edge', async () => {
    const r = await lire(await profil('edge', 'Perso'), ['extensions'])
    expect(r.donnees.extensions).toEqual([{ id: IDS_EXTENSIONS.edge, nom: 'Extension Edge', magasin: 'edge', actif: true }])
    expect(r.compteurs.extensions).toEqual({ total: 1, chrome: 0, edge: 1, inconnues: 0 })
  })

  it('préférences sans réglages d’extension et sans dossier Extensions : liste vide, pas d’erreur', async () => {
    const r = await lire(await profil('chrome', 'Travail'), ['extensions'])
    expect(r.donnees.extensions).toEqual([])
  })

  it('sans préférences du tout : Indisponible', async () => {
    const r = await lire(profilJetable(), ['extensions'])
    expect(estIndisponible(r.donnees.extensions)).toBe(true)
  })

  it('nom __MSG_…__ introuvable : l’identifiant tient lieu de nom ; repli sur les dossiers si aucun réglage', async () => {
    const p = profilJetable()
    const id = IDS_EXTENSIONS.bloqueur
    writeFileSync(join(p.chemin, 'Preferences'), '{}')
    mkdirSync(join(p.chemin, 'Extensions', id, '1.0_0'), { recursive: true })
    writeFileSync(join(p.chemin, 'Extensions', id, '1.0_0', 'manifest.json'), JSON.stringify({ name: '__MSG_nom__', default_locale: 'fr' }))
    mkdirSync(join(p.chemin, 'Extensions', id, '2.0_0', '_locales', 'fr'), { recursive: true })
    writeFileSync(join(p.chemin, 'Extensions', id, '2.0_0', 'manifest.json'), JSON.stringify({ name: '__MSG_NOM__', default_locale: 'fr' }))
    writeFileSync(join(p.chemin, 'Extensions', id, '2.0_0', '_locales', 'fr', 'messages.json'), '\uFEFF' + JSON.stringify({ nom: { message: 'Version récente' } }))
    // version la plus récente choisie, clé de message insensible à la casse, BOM toléré
    expect((await lire(p, ['extensions'])).donnees.extensions).toEqual([{ id, nom: 'Version récente', magasin: 'chrome', actif: true }])
    rmSync(join(p.chemin, 'Extensions', id, '2.0_0'), { recursive: true })
    expect((await lire(p, ['extensions'])).donnees.extensions).toEqual([{ id, nom: id, magasin: 'chrome', actif: true }])
  })
})

describe('réglages transposables', () => {
  it('page d’accueil, dossier de téléchargement, langue, zoom par site (1,2^niveau)', async () => {
    const r = await lire(await profil('chrome', 'Khalil'), ['reglages'])
    expect(r.donnees.reglages).toEqual({
      pageAccueil: 'https://start.example.org/',
      dossierTelechargement: 'C:\\Users\\Test\\Téléchargements',
      langue: 'fr-FR',
      zoomParSite: { 'example.com': 1.2, 'docs.example.org': 1.73, 'petit.example': 0.83 } // niveau 0 ignoré
    })
    expect(r.donnees.reglages && !estIndisponible(r.donnees.reglages) && r.donnees.reglages.zoomParSite?.['docs.example.org']).toBeCloseTo(1.2 ** 3, 1)
    expect(r.compteurs.reglages).toEqual({ total: 6 })
  })

  it('page d’accueil = nouvel onglet : rien ; réglages absents : champs absents', async () => {
    const r = await lire(await profil('chrome', 'Travail'), ['reglages'])
    expect(r.donnees.reglages).toEqual({ langue: 'en-US' })
  })

  it('« ouvrir des pages précises au démarrage » : la première tient lieu de page d’accueil', async () => {
    const p = profilJetable()
    writeFileSync(join(p.chemin, 'Preferences'), JSON.stringify({ homepage_is_newtabpage: true, session: { restore_on_startup: 4, startup_urls: ['https://a.example/', 'https://b.example/'] } }))
    expect((await lire(p, ['reglages'])).donnees.reglages).toEqual({ pageAccueil: 'https://a.example/' })
  })

  it('préférences corrompues ou absentes : Indisponible', async () => {
    const p = profilJetable()
    expect(estIndisponible((await lire(p, ['reglages'])).donnees.reglages)).toBe(true)
    writeFileSync(join(p.chemin, 'Preferences'), 'pas du json')
    const r = await lire(p, ['reglages'])
    expect(estIndisponible(r.donnees.reglages) && r.donnees.reglages.raison).toMatch(/corrompu/)
  })
})

describe('lireProfilChromium', () => {
  it('tous les éléments par défaut, avec compteurs pour l’aperçu', async () => {
    const r = await lireProfilChromium(await profil('chrome', 'Khalil'), { maintenant: MAINTENANT })
    expect(Object.keys(r.donnees).sort()).toEqual(['extensions', 'favoris', 'historique', 'moteurs', 'onglets', 'reglages'])
    expect(r.compteurs).toEqual({
      favoris: { favoris: 4, dossiers: 3 },
      historique: { pages: 3, visites: 8 },
      onglets: { fenetres: 2, onglets: 5, groupes: 2 },
      moteurs: { moteurs: 2, motsCles: 2 },
      extensions: { total: 6, chrome: 4, edge: 0, inconnues: 2 },
      reglages: { total: 6 }
    })
  })

  it('seuls les éléments demandés sont lus', async () => {
    const r = await lire(await profil('chrome', 'Khalil'), ['favoris'])
    expect(Object.keys(r.donnees)).toEqual(['favoris'])
  })

  it('profil absent : tout est Indisponible avec la raison, sans exception', async () => {
    const r = await lire({ ...profilJetable('Fantôme'), chemin: join(tmp, 'disparu') }, ['favoris', 'historique', 'onglets'])
    for (const e of ['favoris', 'historique', 'onglets'] as const) {
      const v = r.donnees[e]
      expect(estIndisponible(v) && v.raison).toMatch(/Fantôme.*introuvable/)
    }
    expect(r.compteurs).toEqual({})
  })

  it('le dossier temporaire est supprimé après la lecture', async () => {
    const dossierTemp = join(tmp, 'temp')
    mkdirSync(dossierTemp)
    await lire(await profil('chrome', 'Khalil'), ['favoris', 'historique', 'moteurs', 'onglets', 'extensions', 'reglages'], { dossierTemp })
    expect(readdirSync(dossierTemp)).toEqual([])
  })

  it('dossier temporaire impossible à créer : tout est Indisponible, sans exception', async () => {
    const r = await lire(await profil('chrome', 'Khalil'), ['favoris', 'reglages'], { dossierTemp: join(tmp, 'n-existe-pas', 'du-tout') })
    expect(estIndisponible(r.donnees.favoris) && estIndisponible(r.donnees.reglages)).toBe(true)
  })
})
