/**
 * Générateur des fixtures Firefox (profils fabriqués, sans aucune donnée personnelle).
 *
 *   node src/main/import/fixtures/generer-firefox.ts       # (re)crée src/main/import/fixtures/firefox/
 *
 * Disposition : `firefox/` est le dossier de Firefox qui contient `profiles.ini` (racine valide pour
 * `LYRA_IMPORT_RACINE/firefox`) :
 *   profiles.ini                      deux profils, « default-release » par défaut via [Install…]
 *   Profiles/abcd1234.default-release complet (places.sqlite, session, moteurs, extensions, prefs.js, content-prefs)
 *   Profiles/efgh5678.travail         presque vide (prefs.js seulement)
 *
 * Les `.jsonlz4` sont écrits avec un encodeur « littéraux seulement » indépendant de `mozlz4.ts` (les tests ne
 * valident donc pas le décodeur avec lui-même). Ce fichier n'importe rien du reste du dépôt.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import initSqlJs from 'sql.js'

type SqlJs = Awaited<ReturnType<typeof initSqlJs>>

/** Dates Firefox : µs depuis 1970. */
export const firefoxUs = (iso: string): number => Date.parse(iso) * 1000

export const MAINTENANT_FIXTURES_FIREFOX = Date.parse('2026-10-19T12:00:00Z')

/** mozlz4 sans compression : en-tête, taille, un jeton de littéraux, les octets. */
export function mozlz4Litteral(contenu: Uint8Array): Uint8Array {
  const longueurs: number[] = []
  if (contenu.length >= 15) {
    let reste = contenu.length - 15
    while (reste >= 255) {
      longueurs.push(255)
      reste -= 255
    }
    longueurs.push(reste)
  }
  const out = new Uint8Array(13 + longueurs.length + contenu.length)
  out.set([0x6d, 0x6f, 0x7a, 0x4c, 0x7a, 0x34, 0x30, 0x00], 0) // mozLz40\0
  new DataView(out.buffer).setUint32(8, contenu.length, true)
  out[12] = Math.min(contenu.length, 15) << 4
  out.set(longueurs, 13)
  out.set(contenu, 13 + longueurs.length)
  return out
}

export const jsonMozlz4 = (v: unknown): Uint8Array => mozlz4Litteral(new TextEncoder().encode(JSON.stringify(v)))

export function basePlaces(SQL: SqlJs, avecVisites = true): Uint8Array {
  const db = new SQL.Database()
  db.run(`CREATE TABLE moz_places(id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR, rev_host LONGVARCHAR, visit_count INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0 NOT NULL, typed INTEGER DEFAULT 0 NOT NULL, frecency INTEGER DEFAULT -1 NOT NULL, last_visit_date INTEGER, guid TEXT, foreign_count INTEGER DEFAULT 0 NOT NULL, url_hash INTEGER DEFAULT 0 NOT NULL)`)
  db.run(`CREATE TABLE moz_bookmarks(id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER DEFAULT NULL, parent INTEGER, position INTEGER, title LONGVARCHAR, keyword_id INTEGER, folder_type TEXT, dateAdded INTEGER, lastModified INTEGER, guid TEXT, syncStatus INTEGER NOT NULL DEFAULT 0, syncChangeCounter INTEGER NOT NULL DEFAULT 1)`)
  if (avecVisites) {
    db.run(`CREATE TABLE moz_historyvisits(id INTEGER PRIMARY KEY, from_visit INTEGER, place_id INTEGER, visit_date INTEGER, visit_type INTEGER, session INTEGER, source INTEGER DEFAULT 0 NOT NULL, triggeringPlaceId INTEGER)`)
  }
  // [id, url, titre, visit_count, dernière visite, hidden]
  const places: Array<[number, string, string, number, string, number]> = [
    [1, 'https://example.com/', 'Exemple', 5, '2026-10-18T10:00:00Z', 0],
    [2, 'https://docs.example.org/guide', 'Guide', 3, '2026-09-01T08:00:00Z', 0],
    [3, 'https://old.example.net/', 'Ancien', 2, '2026-06-01T08:00:00Z', 0],
    [4, 'about:preferences', 'Paramètres', 1, '2026-10-18T11:00:00Z', 0],
    [5, 'place:sort=8&maxResults=10', 'Les plus visités', 0, '2026-10-18T11:30:00Z', 1],
    [6, 'https://ads.example.com/frame', 'Cadre', 1, '2026-10-18T12:30:00Z', 1],
    [7, 'http://insecure.example.com/', 'Sans TLS', 1, '2026-10-10T12:00:00Z', 0],
    [8, 'https://fr.wikipedia.org/', 'Wikipédia', 0, '', 0],
    [9, 'https://m.example.net/', 'Mobile', 0, '', 0]
  ]
  for (const [id, url, titre, n, dernier, cache] of places) {
    db.run('INSERT INTO moz_places(id, url, title, visit_count, last_visit_date, hidden, guid) VALUES (?,?,?,?,?,?,?)', [id, url, titre, n, dernier ? firefoxUs(dernier) : null, cache, `place${id}______`.slice(0, 12)])
  }
  if (avecVisites) {
    // [place, date, visit_type] ; 4 = embed, 7 = download, 8 = framed link : jamais comptés
    const visites: Array<[number, string, number]> = [
      [1, '2026-10-18T10:00:00Z', 1],
      [1, '2026-10-18T09:00:00Z', 2],
      [1, '2026-10-15T09:00:00Z', 1],
      [1, '2026-10-01T09:00:00Z', 1],
      [1, '2026-08-01T09:00:00Z', 1],
      [1, '2026-10-17T09:00:00Z', 4],
      [2, '2026-09-01T08:00:00Z', 1],
      [2, '2026-08-30T08:00:00Z', 3],
      [2, '2026-06-01T08:00:00Z', 1],
      [3, '2026-06-01T08:00:00Z', 1],
      [3, '2026-05-30T08:00:00Z', 1],
      [4, '2026-10-18T11:00:00Z', 1],
      [6, '2026-10-18T12:30:00Z', 8],
      [7, '2026-10-10T12:00:00Z', 1]
    ]
    visites.forEach(([place, date, type], i) => db.run('INSERT INTO moz_historyvisits(id, from_visit, place_id, visit_date, visit_type, session) VALUES (?,?,?,?,?,?)', [i + 1, 0, place, firefoxUs(date), type, 0]))
  }
  // Favoris : racines de Firefox puis contenu. [id, type, fk, parent, position, title, guid] ; type 1 lien, 2 dossier, 3 séparateur
  const t = firefoxUs('2026-01-01T00:00:00Z')
  const favoris: Array<[number, number, number | null, number, number, string | null, string]> = [
    [1, 2, null, 0, 0, '', 'root________'],
    [2, 2, null, 1, 0, 'menu', 'menu________'],
    [3, 2, null, 1, 1, 'toolbar', 'toolbar_____'],
    [4, 2, null, 1, 2, 'tags', 'tags________'],
    [5, 2, null, 1, 3, 'unfiled', 'unfiled_____'],
    [6, 2, null, 1, 4, 'mobile', 'mobile______'],
    [10, 1, 1, 3, 0, 'Exemple', 'fav10_______'],
    [11, 2, null, 3, 1, 'Lecture', 'fav11_______'],
    [12, 1, 2, 11, 0, 'Guide', 'fav12_______'],
    [13, 1, 5, 11, 1, 'Requête', 'fav13_______'],
    [14, 3, null, 3, 2, null, 'fav14_______'],
    [20, 1, 8, 2, 0, 'Wikipédia', 'fav20_______'],
    [21, 2, null, 5, 0, 'Vide', 'fav21_______'],
    [22, 1, 9, 6, 0, 'Mobile', 'fav22_______'],
    [23, 2, null, 4, 0, 'etiquette', 'fav23_______'],
    [24, 1, 1, 23, 0, null, 'fav24_______']
  ]
  for (const [id, type, fk, parent, position, title, guid] of favoris) {
    db.run('INSERT INTO moz_bookmarks(id, type, fk, parent, position, title, dateAdded, lastModified, guid) VALUES (?,?,?,?,?,?,?,?,?)', [id, type, fk, parent, position, title, t, t, guid])
  }
  const octets = db.export()
  db.close()
  return octets
}

export function baseContentPrefs(SQL: SqlJs): Uint8Array {
  const db = new SQL.Database()
  db.run('CREATE TABLE groups(id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
  db.run('CREATE TABLE settings(id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
  db.run('CREATE TABLE prefs(id INTEGER PRIMARY KEY, groupID INTEGER REFERENCES groups(id), settingID INTEGER NOT NULL REFERENCES settings(id), value BLOB, timestamp INTEGER NOT NULL DEFAULT 0)')
  db.run("INSERT INTO groups(id, name) VALUES (1, 'example.com'), (2, 'docs.example.org'), (3, 'neutre.example')")
  db.run("INSERT INTO settings(id, name) VALUES (1, 'browser.content.full-zoom'), (2, 'browser.upload.lastDir')")
  db.run("INSERT INTO prefs(groupID, settingID, value) VALUES (1, 1, 1.2), (2, 1, 1.5), (3, 1, 1.0), (1, 2, 'C:\\tmp')")
  const octets = db.export()
  db.close()
  return octets
}

/** Session : deux fenêtres, un groupe nommé et un non nommé, un onglet épinglé, un onglet about: ignoré. */
export function sessionDeReference(): unknown {
  const onglet = (url: string, title: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    entries: [{ url: 'https://precedente.example/', title: 'Précédente' }, { url, title }],
    index: 2,
    ...extra
  })
  return {
    version: ['sessionrestore', 1],
    windows: [
      {
        tabs: [
          onglet('https://example.com/', 'Exemple', { pinned: true }),
          onglet('https://docs.example.org/guide', 'Guide', { groupId: 'g1' }),
          onglet('https://fr.wikipedia.org/', 'Wikipédia', { groupId: 'g1' }),
          onglet('about:newtab', 'Nouvel onglet'),
          onglet('https://news.example.org/', 'Actualités', { groupId: 'g2' }),
          { entries: [], index: 0 }
        ],
        groups: [
          { id: 'g1', name: 'Docs', color: 'blue', collapsed: false },
          { id: 'g2', name: '', color: 'red', collapsed: true }
        ],
        selected: 1
      },
      { tabs: [onglet('https://second.example/', 'Seconde fenêtre')] }
    ],
    _closedWindows: [{ tabs: [onglet('https://fermee.example/', 'Fermée')] }]
  }
}

export function moteursDeReference(): unknown {
  return {
    version: 12,
    engines: [
      { id: 'google', _name: 'Google', _isAppProvided: true, _metaData: { order: 1 } },
      { id: 'ddg', _name: 'DuckDuckGo', _isAppProvided: true, _metaData: { alias: 'd', order: 2 } },
      {
        id: 'wiki-fr',
        _name: 'Wikipédia (fr)',
        _loadPath: '[user]',
        _metaData: { alias: 'w' },
        _urls: [{ template: 'https://fr.wikipedia.org/w/index.php', params: [{ name: 'search', value: '{searchTerms}' }, { name: 'sourceid', value: 'firefox' }] }]
      },
      {
        id: 'perso',
        _name: 'Mon moteur',
        _loadPath: '[user]',
        _definedAliases: ['mm'],
        _urls: [{ template: 'https://search.example.org/?q={searchTerms}&lang=fr' }, { type: 'application/x-suggestions+json', template: 'https://search.example.org/suggest?q={searchTerms}' }]
      },
      { id: 'cache', _name: 'Caché', _loadPath: '[user]', _metaData: { alias: 'c', hidden: true }, _urls: [{ template: 'https://cache.example/?q={searchTerms}' }] },
      { id: 'sans', _name: 'Sans termes', _loadPath: '[user]', _metaData: { alias: 's' }, _urls: [{ template: 'https://sans.example/' }] }
    ],
    metaData: { defaultEngineId: 'ddg', privateDefaultEngineId: '' }
  }
}

export function extensionsDeReference(): unknown {
  const ext = (id: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    version: '1.0',
    type: 'extension',
    location: 'app-profile',
    active: true,
    userDisabled: false,
    appDisabled: false,
    signedState: 2,
    defaultLocale: { name },
    ...extra
  })
  return {
    schemaVersion: 36,
    addons: [
      ext('uBlock0@raymondhill.net', 'uBlock Origin'),
      ext('{446900e4-71c2-419f-a6a7-df9c091e268b}', 'Bitwarden', { active: false, userDisabled: true }),
      ext('dev@example.test', 'Extension de développement', { signedState: 0, temporarilyInstalled: true }),
      ext('theme@example.test', 'Thème sombre', { type: 'theme' }),
      ext('fr@dictionaries.addons.mozilla.org', 'Français', { type: 'dictionary' }),
      ext('formautofill@mozilla.org', 'Form Autofill', { location: 'app-builtin' }),
      ext('sans-nom@example.test', '', { defaultLocale: {} })
    ]
  }
}

const PREFS = `// Mozilla User Preferences
user_pref("browser.download.dir", "C:\\\\Users\\\\Test\\\\Téléchargements");
user_pref("browser.download.folderList", 2);
user_pref("browser.startup.homepage", "https://start.example.org/|https://second.example.org/");
user_pref("browser.startup.page", 1);
user_pref("intl.accept_languages", "fr-FR, fr, en-US, en");
user_pref("places.history.enabled", true);
`

function ecrire(racine: string, chemin: string, contenu: string | Uint8Array): void {
  const complet = join(racine, chemin)
  mkdirSync(dirname(complet), { recursive: true })
  writeFileSync(complet, contenu)
}

export const PROFIL_DEFAUT = 'Profiles/abcd1234.default-release'
export const PROFIL_TRAVAIL = 'Profiles/efgh5678.travail'

export async function genererFixturesFirefox(sortie: string): Promise<void> {
  const SQL = await initSqlJs()
  rmSync(sortie, { recursive: true, force: true })
  ecrire(sortie, 'profiles.ini', [
    '[Install308046B0AF4A39CB]', `Default=${PROFIL_DEFAUT}`, 'Locked=1', '',
    '[Profile1]', 'Name=travail', 'IsRelative=1', `Path=${PROFIL_TRAVAIL}`, '',
    '[Profile0]', 'Name=default-release', 'IsRelative=1', `Path=${PROFIL_DEFAUT}`, 'Default=1', '',
    '[General]', 'StartWithLastProfile=1', 'Version=2', ''
  ].join('\n'))
  const p = PROFIL_DEFAUT
  ecrire(sortie, `${p}/places.sqlite`, basePlaces(SQL))
  ecrire(sortie, `${p}/content-prefs.sqlite`, baseContentPrefs(SQL))
  ecrire(sortie, `${p}/sessionstore-backups/recovery.jsonlz4`, jsonMozlz4(sessionDeReference()))
  ecrire(sortie, `${p}/search.json.mozlz4`, jsonMozlz4(moteursDeReference()))
  ecrire(sortie, `${p}/extensions.json`, JSON.stringify(extensionsDeReference(), null, 2) + '\n')
  ecrire(sortie, `${p}/prefs.js`, PREFS)
  ecrire(sortie, `${PROFIL_TRAVAIL}/prefs.js`, 'user_pref("intl.accept_languages", "en-US, en");\n')
}

const ici = dirname(fileURLToPath(import.meta.url))

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await genererFixturesFirefox(join(ici, 'firefox'))
  console.log('Fixtures générées dans', join(ici, 'firefox'))
}
