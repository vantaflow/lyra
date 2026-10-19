/**
 * Générateur des fixtures Chromium (profils fabriqués, sans aucune donnée personnelle).
 *
 *   node src/main/import/fixtures/generer.ts            # (re)crée src/main/import/fixtures/chromium/
 *
 * Disposition : `chromium/<navigateur>/` est le dossier « User Data » du navigateur, donc `chromium/` lui-même
 * est une racine valide pour `LYRA_IMPORT_RACINE` (avec `LYRA_TEST=1`) :
 *   chrome/  Local State, Default (« Khalil », complet), Profile 1 (« Travail », presque vide)
 *   edge/    Local State, Default (« Perso »)
 *   brave/   pas de Local State : détecté par repli sur le dossier Default
 *   (vivaldi absent : « Non installé »)
 *
 * Les bases SQLite sont écrites avec sql.js ; le fichier de session SNSS est fabriqué octet par octet ici même,
 * indépendamment du lecteur de `snss.ts` (les tests ne valident donc pas le lecteur avec lui-même).
 * Ce fichier n'importe rien du reste du dépôt : il s'exécute tel quel avec Node (suppression des types).
 * Les fonctions de fabrication (`fichierSnss`, `commande`…) sont aussi utilisées par les tests.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import initSqlJs from 'sql.js'

// ---------------------------------------------------------------------------------------------------------------------
// Dates : µs depuis 1601-01-01

export const chromeUs = (iso: string): number => (Date.parse(iso) + 11_644_473_600_000) * 1000

// ---------------------------------------------------------------------------------------------------------------------
// SNSS : fabrication octet par octet (voir snss.ts pour la source des identifiants)

export const CMD = {
  setTabWindow: 0,
  setTabIndexInWindow: 2,
  prunedFromBack: 5,
  updateTabNavigation: 6,
  setSelectedNavigationIndex: 7,
  setWindowType: 9,
  prunedFromFront: 11,
  setPinnedState: 12,
  tabClosed: 16,
  windowClosed: 17,
  pruned: 24,
  setTabGroup: 25,
  setTabGroupMetadata2: 27,
  marqueur: 255
}

/** Commande : [taille uint16][id][charge], la taille compte l'identifiant. */
export function commande(id: number, charge: Uint8Array = new Uint8Array()): Uint8Array {
  const out = new Uint8Array(3 + charge.length)
  new DataView(out.buffer).setUint16(0, charge.length + 1, true)
  out[2] = id
  out.set(charge, 3)
  return out
}

export function fichierSnss(commandes: Uint8Array[], version = 3): Uint8Array {
  const taille = 8 + commandes.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(taille)
  const vue = new DataView(out.buffer)
  vue.setUint32(0, 0x53534e53, true)
  vue.setInt32(4, version, true)
  let pos = 8
  for (const c of commandes) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

/** `base::Pickle` : en-tête (taille de la charge), puis champs alignés sur 4 octets. */
export class Pickle {
  private octets: number[] = []

  private ecrire(valeur: ArrayLike<number>): this {
    for (const o of Array.from(valeur)) this.octets.push(o)
    while (this.octets.length % 4 !== 0) this.octets.push(0)
    return this
  }

  int(n: number): this {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setInt32(0, n, true)
    return this.ecrire(b)
  }

  uint32(n: number): this {
    return this.int(n | 0)
  }

  bool(v: boolean): this {
    return this.int(v ? 1 : 0)
  }

  uint64(n: bigint): this {
    const b = new Uint8Array(8)
    new DataView(b.buffer).setBigUint64(0, n, true)
    return this.ecrire(b)
  }

  chaine(s: string): this {
    const b = new TextEncoder().encode(s)
    return this.int(b.length).ecrire(b)
  }

  chaine16(s: string): this {
    const b = new Uint8Array(s.length * 2)
    const vue = new DataView(b.buffer)
    for (let i = 0; i < s.length; i++) vue.setUint16(i * 2, s.charCodeAt(i), true)
    return this.int(s.length).ecrire(b)
  }

  finir(): Uint8Array {
    const out = new Uint8Array(4 + this.octets.length)
    new DataView(out.buffer).setUint32(0, this.octets.length, true)
    out.set(this.octets, 4)
    return out
  }
}

/** Structure brute de `n` entiers 32 bits (IDAndIndexPayload, ActiveWindowPayload…). */
export function entiers(...valeurs: number[]): Uint8Array {
  const b = new Uint8Array(valeurs.length * 4)
  valeurs.forEach((v, i) => new DataView(b.buffer).setInt32(i * 4, v, true))
  return b
}

export const snss = {
  fenetreOnglet: (fenetre: number, onglet: number): Uint8Array => commande(CMD.setTabWindow, entiers(fenetre, onglet)),
  position: (onglet: number, position: number): Uint8Array => commande(CMD.setTabIndexInWindow, entiers(onglet, position)),
  navigation: (onglet: number, index: number, url: string, titre: string): Uint8Array =>
    commande(
      CMD.updateTabNavigation,
      new Pickle()
        .int(onglet)
        .int(index)
        .chaine(url)
        .chaine16(titre)
        .chaine('') // état de la page
        .int(0) // transition
        .int(0) // type_mask
        .chaine('') // référent
        .int(0) // règle de référent obsolète
        .chaine('') // URL d'origine
        .bool(false)
        .finir()
    ),
  selectionnee: (onglet: number, index: number): Uint8Array => commande(CMD.setSelectedNavigationIndex, entiers(onglet, index)),
  typeFenetre: (fenetre: number, type: number): Uint8Array => commande(CMD.setWindowType, entiers(fenetre, type)),
  epingle: (onglet: number, epingle: boolean): Uint8Array => {
    const b = new Uint8Array(8) // {int32, bool} + bourrage
    new DataView(b.buffer).setInt32(0, onglet, true)
    b[4] = epingle ? 1 : 0
    return commande(CMD.setPinnedState, b)
  },
  ferme: (id: number, fenetre = false): Uint8Array => {
    const b = new Uint8Array(16) // {int32, (bourrage 4), int64}
    new DataView(b.buffer).setInt32(0, id, true)
    return commande(fenetre ? CMD.windowClosed : CMD.tabClosed, b)
  },
  groupe: (onglet: number, haut: bigint, bas: bigint, aUnGroupe = true): Uint8Array => {
    const b = new Uint8Array(32) // {int32, (bourrage 4), uint64, uint64, bool, (bourrage)}
    const vue = new DataView(b.buffer)
    vue.setInt32(0, onglet, true)
    vue.setBigUint64(8, haut, true)
    vue.setBigUint64(16, bas, true)
    b[24] = aUnGroupe ? 1 : 0
    return commande(CMD.setTabGroup, b)
  },
  metadonneesGroupe: (haut: bigint, bas: bigint, titre: string, couleur: number, replie = false): Uint8Array =>
    commande(CMD.setTabGroupMetadata2, new Pickle().uint64(haut).uint64(bas).chaine16(titre).uint32(couleur).bool(replie).bool(false).finir()),
  elagueDevant: (onglet: number, nombre: number): Uint8Array => commande(CMD.prunedFromFront, entiers(onglet, nombre)),
  elagueDerriere: (onglet: number, index: number): Uint8Array => commande(CMD.prunedFromBack, entiers(onglet, index)),
  marqueur: (): Uint8Array => commande(CMD.marqueur)
}

export const GROUPE_A = { haut: 0x1122334455667788n, bas: 0x99aabbccddeeff00n, id: '112233445566778899aabbccddeeff00' }
export const GROUPE_B = { haut: 0xaaaaaaaaaaaaaaaan, bas: 0x1n, id: 'aaaaaaaaaaaaaaaa0000000000000001' }

/** Session de référence : 2 fenêtres normales, 2 groupes, un onglet épinglé, une popup, un onglet et une fenêtre fermés. */
export function sessionDeReference(): Uint8Array {
  const A = GROUPE_A
  const B = GROUPE_B
  return fichierSnss([
    snss.typeFenetre(100, 0),
    // onglet 10 : groupe A
    snss.fenetreOnglet(100, 10),
    snss.position(10, 0),
    snss.navigation(10, 0, 'https://example.com/', 'Exemple'),
    snss.selectionnee(10, 0),
    snss.groupe(10, A.haut, A.bas),
    // onglet 13 (4e position) écrit avant le 12 : l'ordre d'affichage vient de la position, pas de l'ordre des commandes
    snss.fenetreOnglet(100, 13),
    snss.position(13, 3),
    snss.navigation(13, 0, 'https://travail.example.net/', 'Tableau de bord'),
    snss.selectionnee(13, 0),
    snss.groupe(13, B.haut, B.bas),
    // onglet 12 : épinglé
    snss.fenetreOnglet(100, 12),
    snss.position(12, 2),
    snss.navigation(12, 0, 'https://fr.wikipedia.org/', 'Wikipédia'),
    snss.selectionnee(12, 0),
    snss.epingle(12, true),
    // onglet 11 : deux pages d'historique, la 2e est affichée ; groupe A
    snss.fenetreOnglet(100, 11),
    snss.position(11, 1),
    snss.navigation(11, 0, 'https://example.com/a', 'Page A'),
    snss.navigation(11, 1, 'https://example.com/b', 'Page B'),
    snss.selectionnee(11, 1),
    snss.groupe(11, A.haut, A.bas),
    // onglet 14 : page interne, ignorée ; onglet 15 : fermé
    snss.fenetreOnglet(100, 14),
    snss.position(14, 4),
    snss.navigation(14, 0, 'chrome://newtab/', 'Nouvel onglet'),
    snss.fenetreOnglet(100, 15),
    snss.position(15, 5),
    snss.navigation(15, 0, 'https://ferme.example.com/', 'Onglet fermé'),
    snss.ferme(15),
    snss.marqueur(), // fin de l'état initial ; la suite est ajoutée au fil de l'eau
    snss.metadonneesGroupe(A.haut, A.bas, 'Lecture', 1),
    snss.metadonneesGroupe(B.haut, B.bas, 'Travail', 2),
    // fenêtre surgissante : ignorée
    snss.typeFenetre(200, 1),
    snss.fenetreOnglet(200, 20),
    snss.position(20, 0),
    snss.navigation(20, 0, 'https://popup.example.org/', 'Popup'),
    // 2e fenêtre normale
    snss.typeFenetre(300, 0),
    snss.fenetreOnglet(300, 30),
    snss.position(30, 0),
    snss.navigation(30, 0, 'https://deuxieme.example.com/', 'Deuxième fenêtre'),
    snss.selectionnee(30, 0),
    // fenêtre fermée
    snss.typeFenetre(400, 0),
    snss.fenetreOnglet(400, 40),
    snss.navigation(40, 0, 'https://fermee.example.com/', 'Fenêtre fermée'),
    snss.ferme(400, true)
  ])
}

// ---------------------------------------------------------------------------------------------------------------------
// Bases SQLite

type SqlJs = Awaited<ReturnType<typeof initSqlJs>>

export const MAINTENANT_FIXTURES = Date.parse('2026-10-19T12:00:00Z')

export function baseHistorique(SQL: SqlJs, avecVisites = true): Uint8Array {
  const db = new SQL.Database()
  db.run(`CREATE TABLE urls(id INTEGER PRIMARY KEY AUTOINCREMENT, url LONGVARCHAR, title LONGVARCHAR, visit_count INTEGER DEFAULT 0 NOT NULL, typed_count INTEGER DEFAULT 0 NOT NULL, last_visit_time INTEGER NOT NULL, hidden INTEGER DEFAULT 0 NOT NULL)`)
  if (avecVisites) {
    db.run(`CREATE TABLE visits(id INTEGER PRIMARY KEY, url INTEGER NOT NULL, visit_time INTEGER NOT NULL, from_visit INTEGER, transition INTEGER DEFAULT 0 NOT NULL, segment_id INTEGER, visit_duration INTEGER DEFAULT 0 NOT NULL)`)
  }
  const urls: Array<[number, string, string, number, string, number]> = [
    [1, 'https://example.com/', 'Exemple', 5, '2026-10-18T10:00:00Z', 0],
    [2, 'https://docs.example.org/guide', 'Guide', 3, '2026-09-01T08:00:00Z', 0],
    [3, 'https://old.example.net/', 'Ancien', 2, '2026-06-01T08:00:00Z', 0],
    [4, 'chrome://settings/', 'Paramètres', 1, '2026-10-18T11:00:00Z', 0],
    [5, 'about:blank', '', 1, '2026-10-18T11:30:00Z', 0],
    [6, 'file:///C:/test.html', 'Fichier local', 1, '2026-10-18T12:00:00Z', 0],
    [7, 'https://ads.example.com/frame', 'Cadre', 1, '2026-10-18T12:30:00Z', 1],
    [8, 'http://insecure.example.com/', 'Sans TLS', 1, '2026-10-10T12:00:00Z', 0]
  ]
  for (const [id, url, titre, n, dernier, cache] of urls) {
    db.run('INSERT INTO urls(id, url, title, visit_count, last_visit_time, hidden) VALUES (?,?,?,?,?,?)', [id, url, titre, n, chromeUs(dernier), cache])
  }
  if (avecVisites) {
    // [url, date, transition] ; transition 3 / 4 = sous-cadres, jamais comptés
    const visites: Array<[number, string, number]> = [
      [1, '2026-10-18T10:00:00Z', 0],
      [1, '2026-10-18T09:00:00Z', 1],
      [1, '2026-10-15T09:00:00Z', 0],
      [1, '2026-10-01T09:00:00Z', 0],
      [1, '2026-08-01T09:00:00Z', 0],
      [1, '2026-10-17T09:00:00Z', 3],
      [2, '2026-09-01T08:00:00Z', 0],
      [2, '2026-08-30T08:00:00Z', 0],
      [2, '2026-06-01T08:00:00Z', 0],
      [3, '2026-06-01T08:00:00Z', 0],
      [3, '2026-05-30T08:00:00Z', 0],
      [4, '2026-10-18T11:00:00Z', 0],
      [5, '2026-10-18T11:30:00Z', 0],
      [6, '2026-10-18T12:00:00Z', 0],
      [7, '2026-10-18T12:30:00Z', 4],
      [8, '2026-10-10T12:00:00Z', 0]
    ]
    visites.forEach(([url, date, transition], i) => db.run('INSERT INTO visits(id, url, visit_time, from_visit, transition) VALUES (?,?,?,?,?)', [i + 1, url, chromeUs(date), 0, transition]))
  }
  const octets = db.export()
  db.close()
  return octets
}

export function baseWebData(SQL: SqlJs): Uint8Array {
  const db = new SQL.Database()
  db.run(`CREATE TABLE keywords(id INTEGER PRIMARY KEY, short_name VARCHAR NOT NULL, keyword VARCHAR NOT NULL, favicon_url VARCHAR NOT NULL, url VARCHAR NOT NULL, safe_for_autoreplace INTEGER, originating_url VARCHAR, date_created INTEGER DEFAULT 0, usage_count INTEGER DEFAULT 0, input_encodings VARCHAR, suggest_url VARCHAR, prepopulate_id INTEGER DEFAULT 0, created_by_policy INTEGER DEFAULT 0, last_modified INTEGER DEFAULT 0, sync_guid VARCHAR, is_active INTEGER DEFAULT 0, starter_pack_id INTEGER DEFAULT 0)`)
  // [short_name, keyword, url, safe_for_autoreplace, prepopulate_id, is_active, starter_pack_id]
  const lignes: Array<[string, string, string, number, number, number, number]> = [
    ['Google', 'google.com', '{google:baseURL}search?q={searchTerms}&{google:RLZ}{google:originalQueryForSuggestion}{google:assistedQueryStats}{google:searchFieldtrialParameter}ie={inputEncoding}', 1, 1, 1, 0],
    ['DuckDuckGo', 'duckduckgo.com', 'https://duckduckgo.com/?q={searchTerms}', 1, 92, 1, 0],
    ['Bing', 'bing.com', 'https://www.bing.com/search?q={searchTerms}', 1, 3, 2, 0],
    ['Wikipédia (fr)', 'w', 'https://fr.wikipedia.org/w/index.php?search={searchTerms}&language={language}', 0, 0, 0, 0],
    ['Blog', 'blog.example.com', 'https://blog.example.com/?s={searchTerms}', 1, 0, 0, 0],
    ['Favoris', '@bookmarks', 'chrome://bookmarks/?q={searchTerms}', 0, 0, 1, 1],
    ['Sans terme', 'st', 'https://x.example/', 0, 0, 0, 0],
    ['GitHub', 'gh', 'https://github.com/search?q={searchTerms}&type=repositories', 0, 0, 1, 0]
  ]
  lignes.forEach(([nom, motCle, url, safe, prepeuple, actif, starter], i) =>
    db.run('INSERT INTO keywords(id, short_name, keyword, favicon_url, url, safe_for_autoreplace, prepopulate_id, is_active, starter_pack_id) VALUES (?,?,?,?,?,?,?,?,?)', [i + 1, nom, motCle, '', url, safe, prepeuple, actif, starter])
  )
  const octets = db.export()
  db.close()
  return octets
}

// ---------------------------------------------------------------------------------------------------------------------
// Profils

const DATE_FAVORI = '13411699200000000' // 2026-01-01T00:00:00Z

const noeudUrl = (name: string, url: string): object => ({ type: 'url', name, url, date_added: DATE_FAVORI, id: '1', guid: 'g' })
const noeudDossier = (name: string, children: object[]): object => ({ type: 'folder', name, date_added: DATE_FAVORI, children, id: '1', guid: 'g' })

export const IDS_EXTENSIONS = {
  bloqueur: 'abcdefghijklmnopabcdefghijklmnop', // magasin, nom via _locales
  sombre: 'ponmlkjihgfedcbaponmlkjihgfedcba', // magasin, nom en clair
  composant: 'aaaabbbbccccddddeeeeffffgggghhhh', // composant interne : ignoré
  theme: 'iiiijjjjkkkkllllmmmmnnnnoooopppp', // thème : ignoré
  main: 'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm', // dépaquetée : ignorée
  desactivee: 'llllllllllllllllllllllllllllllll', // magasin, désactivée
  sansManifest: 'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh', // magasin, nom lu dans Extensions/<id>/<version>/manifest.json
  horsMagasin: 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', // installée hors magasin : ignorée
  edge: 'g'.repeat(32) // magasin Edge Add-ons
}

function ecrire(racine: string, chemin: string, contenu: string | Uint8Array): void {
  const complet = join(racine, chemin)
  mkdirSync(dirname(complet), { recursive: true })
  writeFileSync(complet, contenu)
}

const json = (v: unknown): string => JSON.stringify(v, null, 2) + '\n'

export async function genererFixtures(sortie: string): Promise<void> {
  const SQL = await initSqlJs()
  rmSync(sortie, { recursive: true, force: true })

  // ----- Chrome
  const chrome = join(sortie, 'chrome')
  ecrire(chrome, 'Local State', json({ profile: { info_cache: { Default: { name: 'Khalil', gaia_name: 'Khalil T.' }, 'Profile 1': { name: 'Travail' } }, last_used: 'Default' } }))
  const d = 'Default'
  ecrire(chrome, `${d}/Bookmarks`, json({
    checksum: '00000000000000000000000000000000',
    roots: {
      bookmark_bar: noeudDossier('Barre de favoris', [
        noeudUrl('Exemple', 'https://example.com/'),
        noeudDossier('Lecture', [noeudUrl('Guide', 'https://docs.example.org/guide'), noeudUrl('Marque-page JS', 'javascript:alert(1)')])
      ]),
      other: noeudDossier('Autres favoris', [noeudUrl('Wikipédia', 'https://fr.wikipedia.org/'), noeudDossier('Vide', [])]),
      synced: noeudDossier('Favoris mobiles', [noeudUrl('Mobile', 'https://m.example.net/')])
    },
    version: 1
  }))
  ecrire(chrome, `${d}/Preferences`, json({
    homepage: 'https://start.example.org/',
    homepage_is_newtabpage: false,
    session: { restore_on_startup: 4, startup_urls: ['https://news.example.org/'] },
    download: { default_directory: 'C:\\Users\\Test\\Téléchargements' },
    intl: { accept_languages: 'fr-FR,fr,en-US,en' },
    partition: {
      per_host_zoom_levels: {
        x: {
          'example.com': { zoom_level: 1, last_modified: '13411699200000000' },
          'docs.example.org': { zoom_level: 3, last_modified: '13411699200000000' },
          'petit.example': { zoom_level: -1, last_modified: '13411699200000000' },
          'neutre.example': { zoom_level: 0, last_modified: '13411699200000000' }
        }
      }
    },
    default_search_provider_data: { template_url_data: { short_name: 'DuckDuckGo', keyword: 'duckduckgo.com', url: 'https://duckduckgo.com/?q={searchTerms}' } }
  }))
  const store = { from_webstore: true, location: 1, state: 1 }
  const miseAJour = 'https://clients2.google.com/service/update2/crx'
  ecrire(chrome, `${d}/Secure Preferences`, json({
    extensions: {
      settings: {
        [IDS_EXTENSIONS.bloqueur]: { ...store, path: `${IDS_EXTENSIONS.bloqueur}/1.2.3_0`, manifest: { name: '__MSG_extName__', default_locale: 'en', version: '1.2.3', update_url: miseAJour } },
        [IDS_EXTENSIONS.sombre]: { ...store, manifest: { name: 'Lecteur sombre', version: '4.0', update_url: miseAJour } },
        [IDS_EXTENSIONS.composant]: { from_webstore: false, location: 5, state: 1, manifest: { name: 'Composant interne', version: '1.0' } },
        [IDS_EXTENSIONS.theme]: { ...store, manifest: { name: 'Thème sombre', theme: { colors: {} }, version: '1.0' } },
        [IDS_EXTENSIONS.main]: { from_webstore: false, location: 4, state: 1, path: 'C:\\dev\\ext', manifest: { name: 'Extension de développement', version: '0.1' } },
        [IDS_EXTENSIONS.desactivee]: { ...store, state: 0, disable_reasons: 1, manifest: { name: 'Désactivée', version: '2.0', update_url: miseAJour } },
        [IDS_EXTENSIONS.sansManifest]: { ...store, path: `${IDS_EXTENSIONS.sansManifest}/0.9_0` },
        [IDS_EXTENSIONS.horsMagasin]: { from_webstore: false, location: 1, state: 1, manifest: { name: 'Installée à la main', version: '1.0' } }
      }
    }
  }))
  ecrire(chrome, `${d}/Extensions/${IDS_EXTENSIONS.bloqueur}/1.2.3_0/manifest.json`, json({ name: '__MSG_extName__', default_locale: 'en', version: '1.2.3', manifest_version: 3 }))
  ecrire(chrome, `${d}/Extensions/${IDS_EXTENSIONS.bloqueur}/1.2.3_0/_locales/en/messages.json`, json({ extName: { message: 'Exemple Blocker', description: 'Nom' } }))
  ecrire(chrome, `${d}/Extensions/${IDS_EXTENSIONS.bloqueur}/1.2.3_0/_locales/fr/messages.json`, json({ extName: { message: 'Bloqueur Exemple' } }))
  ecrire(chrome, `${d}/Extensions/${IDS_EXTENSIONS.sansManifest}/0.9_0/manifest.json`, json({ name: 'Lecteur Zen', version: '0.9', manifest_version: 3 }))
  ecrire(chrome, `${d}/History`, baseHistorique(SQL))
  ecrire(chrome, `${d}/Web Data`, baseWebData(SQL))
  // Sessions : la plus récente est lue ; Tabs_* (onglets récemment fermés, autres commandes) ne l'est jamais.
  ecrire(chrome, `${d}/Sessions/Session_13414896000000000`, sessionDeReference())
  ecrire(chrome, `${d}/Sessions/Session_13400000000000000`, fichierSnss([
    snss.typeFenetre(1, 0), snss.fenetreOnglet(1, 1), snss.position(1, 0), snss.navigation(1, 0, 'https://ancienne.example/', 'Ancienne session'), snss.selectionnee(1, 0)
  ]))
  ecrire(chrome, `${d}/Sessions/Tabs_13414896000000000`, fichierSnss([commande(1, entiers(1, 2, 3, 4))]))

  ecrire(chrome, 'Profile 1/Preferences', json({ homepage_is_newtabpage: true, session: { restore_on_startup: 5 }, intl: { accept_languages: 'en-US,en' } }))
  ecrire(chrome, 'Profile 1/Bookmarks', json({ roots: { bookmark_bar: noeudDossier('Barre de favoris', [noeudUrl('Intranet', 'https://intranet.example.net/')]), other: noeudDossier('Autres favoris', []), synced: noeudDossier('Favoris mobiles', []) }, version: 1 }))

  // ----- Edge
  const edge = join(sortie, 'edge')
  ecrire(edge, 'Local State', json({ profile: { info_cache: { Default: { name: 'Perso' } }, last_used: 'Default' } }))
  ecrire(edge, 'Default/Bookmarks', json({ roots: { bookmark_bar: noeudDossier('Barre de favoris', [noeudUrl('Actualités', 'https://news.example.org/')]), other: noeudDossier('Autres favoris', []), synced: noeudDossier('Favoris mobiles', []) }, version: 1 }))
  ecrire(edge, 'Default/Preferences', json({
    default_search_provider_data: { template_url_data: { short_name: 'Bing', keyword: 'bing.com', url: 'https://www.bing.com/search?q={searchTerms}&{google:RLZ}' } },
    extensions: { settings: { [IDS_EXTENSIONS.edge]: { from_webstore: true, location: 1, state: 1, manifest: { name: 'Extension Edge', version: '1.0', update_url: 'https://edge.microsoft.com/extensionwebstorebase/v1/crx' } } } }
  }))

  // ----- Brave : pas de Local State, détecté par ses dossiers
  const brave = join(sortie, 'brave')
  ecrire(brave, 'Default/Bookmarks', json({ roots: { bookmark_bar: noeudDossier('Bookmarks bar', [noeudUrl('Brave', 'https://brave.com/')]), other: noeudDossier('Other bookmarks', []), synced: noeudDossier('Mobile bookmarks', []) }, version: 1 }))
}

const ici = dirname(fileURLToPath(import.meta.url))

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await genererFixtures(join(ici, 'chromium'))
  console.log('Fixtures générées dans', join(ici, 'chromium'))
}
