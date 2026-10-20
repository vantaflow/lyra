/**
 * Générateur des fixtures Safari et Orion (profils fabriqués, sans aucune donnée personnelle).
 *
 *   node src/main/import/fixtures/generer-apple.ts      # (re)crée fixtures/safari/ et fixtures/orion/
 *
 * Disposition :
 *   safari/  Bookmarks.plist (plist binaire), History.db (SQLite)  — `safari/` est la racine « ~/Library/Safari »
 *   orion/   Defaults/Default/{favourites.plist (binaire), history (SQLite)}  — profil complet
 *            Defaults/Travail/favourites.plist (plist XML lisible), sans historique  — `orion/` est la racine
 *
 * Le plist binaire est fabriqué octet par octet ici même, indépendamment du lecteur de `bplist.ts` (les tests ne
 * valident donc pas le lecteur avec lui-même). Ce fichier n'importe rien du reste du dépôt : il s'exécute tel quel
 * avec Node (suppression des types). `ecrireBplist` et `baseHistoriqueApple` servent aussi aux tests.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import initSqlJs from 'sql.js'

export const MAINTENANT_FIXTURES_APPLE = Date.parse('2026-10-19T12:00:00Z')

const EPOQUE_APPLE_MS = Date.UTC(2001, 0, 1)

/** Secondes depuis le 1er janvier 2001 UTC (dates des plist et `visit_time` de Safari). */
export const appleSecondes = (iso: string): number => (Date.parse(iso) - EPOQUE_APPLE_MS) / 1000

// ---------------------------------------------------------------------------------------------------------------------
// Écrivain bplist00 minimal

/** Nombre réel forcé (sinon un nombre entier est écrit comme un entier). */
export class Reel {
  readonly valeur: number
  constructor(valeur: number) {
    this.valeur = valeur
  }
}

export type ValeurEcrite = boolean | number | string | Date | Reel | ValeurEcrite[] | { [cle: string]: ValeurEcrite }

interface Noeud {
  valeur: ValeurEcrite
  /** Références (index de noeuds) : éléments d'un tableau, ou clés puis valeurs d'un dictionnaire. */
  enfants: number[]
}

const concat = (parts: number[][]): number[] => parts.flat()

function octetsEntier(v: number): number[] {
  const n = v < 256 ? 1 : v < 65536 ? 2 : v < 2 ** 32 ? 4 : 8
  const out: number[] = [0x10 | Math.log2(n)]
  for (let i = n - 1; i >= 0; i--) out.push(Math.floor(v / 2 ** (8 * i)) % 256)
  return out
}

function octetsNegatif(v: number): number[] {
  const b = new DataView(new ArrayBuffer(8))
  b.setBigInt64(0, BigInt(v))
  return [0x13, ...new Uint8Array(b.buffer)]
}

function entete(marqueur: number, n: number): number[] {
  return n < 15 ? [marqueur | n] : [marqueur | 0xf, ...octetsEntier(n)]
}

function octetsFlottant(marqueur: number, v: number): number[] {
  const b = new DataView(new ArrayBuffer(8))
  b.setFloat64(0, v)
  return [marqueur, ...new Uint8Array(b.buffer)]
}

/** Écrit un plist binaire. Dictionnaires = objets simples ; entiers → int, autres nombres → real (ou `new Reel`). */
export function ecrireBplist(racine: ValeurEcrite): Uint8Array {
  const noeuds: Noeud[] = []
  const enregistrer = (v: ValeurEcrite): number => {
    const index = noeuds.length
    const noeud: Noeud = { valeur: v, enfants: [] }
    noeuds.push(noeud)
    if (Array.isArray(v)) {
      for (const e of v) noeud.enfants.push(enregistrer(e))
    } else if (typeof v === 'object' && !(v instanceof Date) && !(v instanceof Reel)) {
      const entrees = Object.entries(v)
      for (const [k] of entrees) noeud.enfants.push(enregistrer(k))
      for (const [, valeur] of entrees) noeud.enfants.push(enregistrer(valeur))
    }
    return index
  }
  enregistrer(racine)

  const nb = noeuds.length
  const tailleRef = nb < 256 ? 1 : nb < 65536 ? 2 : 4
  const ref = (i: number): number[] => Array.from({ length: tailleRef }, (_, k) => Math.floor(i / 2 ** (8 * (tailleRef - 1 - k))) % 256)

  const corps: number[][] = noeuds.map(({ valeur: v, enfants }) => {
    if (typeof v === 'boolean') return [v ? 0x09 : 0x08]
    if (typeof v === 'number') return Number.isInteger(v) ? (v >= 0 ? octetsEntier(v) : octetsNegatif(v)) : octetsFlottant(0x23, v)
    if (v instanceof Reel) return octetsFlottant(0x23, v.valeur)
    if (v instanceof Date) return octetsFlottant(0x33, (v.getTime() - EPOQUE_APPLE_MS) / 1000)
    if (typeof v === 'string') {
      // eslint-disable-next-line no-control-regex
      if (/^[\u0000-\u007f]*$/.test(v)) return [...entete(0x50, v.length), ...Array.from(v, (c) => c.charCodeAt(0))]
      const unites = Array.from({ length: v.length }, (_, i) => v.charCodeAt(i))
      return [...entete(0x60, unites.length), ...unites.flatMap((u) => [u >> 8, u & 0xff])]
    }
    if (Array.isArray(v)) return [...entete(0xa0, enfants.length), ...concat(enfants.map(ref))]
    return [...entete(0xd0, enfants.length / 2), ...concat(enfants.map(ref))]
  })

  const sortie: number[] = [0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30] // « bplist00 »
  const offsets: number[] = []
  for (const c of corps) {
    offsets.push(sortie.length)
    for (const o of c) sortie.push(o)
  }
  const debutTable = sortie.length
  const tailleOffset = debutTable < 256 ? 1 : debutTable < 65536 ? 2 : 4
  for (const off of offsets) for (let k = tailleOffset - 1; k >= 0; k--) sortie.push(Math.floor(off / 2 ** (8 * k)) % 256)

  const queue = new DataView(new ArrayBuffer(32))
  queue.setUint8(6, tailleOffset)
  queue.setUint8(7, tailleRef)
  queue.setBigUint64(8, BigInt(nb))
  queue.setBigUint64(16, 0n) // racine = premier objet
  queue.setBigUint64(24, BigInt(debutTable))
  return Uint8Array.from([...sortie, ...new Uint8Array(queue.buffer)])
}

// ---------------------------------------------------------------------------------------------------------------------
// Favoris au format Safari

type Dict = { [cle: string]: ValeurEcrite }

let compteurUuid = 0
const uuid = (): string => `00000000-0000-4000-8000-${String(++compteurUuid).padStart(12, '0')}`

export const lienSafari = (titre: string, url: string, extra: Dict = {}): Dict => ({
  WebBookmarkType: 'WebBookmarkTypeLeaf',
  WebBookmarkUUID: uuid(),
  URLString: url,
  URIDictionary: { title: titre },
  ...extra
})

export const dossierSafari = (titre: string, enfants: Dict[], extra: Dict = {}): Dict => ({
  WebBookmarkType: 'WebBookmarkTypeList',
  WebBookmarkUUID: uuid(),
  Title: titre,
  Children: enfants,
  ...extra
})

export function favorisSafari(): Dict {
  return {
    WebBookmarkType: 'WebBookmarkTypeList',
    WebBookmarkFileVersion: 1,
    WebBookmarkUUID: uuid(),
    Title: '',
    Children: [
      { WebBookmarkType: 'WebBookmarkTypeProxy', WebBookmarkIdentifier: 'History', WebBookmarkUUID: uuid(), Title: 'History' },
      dossierSafari('BookmarksBar', [
        lienSafari('Exemple', 'https://example.com/'),
        dossierSafari('Lecture', [
          lienSafari('Guide', 'https://docs.example.org/guide'),
          lienSafari('Éléphant — café', 'https://fr.wikipedia.org/wiki/%C3%89l%C3%A9phant'),
          lienSafari('Marque-page JS', 'javascript:alert(1)')
        ])
      ]),
      dossierSafari('BookmarksMenu', [lienSafari('Wikipédia', 'https://fr.wikipedia.org/'), dossierSafari('Vide', [])]),
      dossierSafari('com.apple.ReadingList', [
        lienSafari('Article à lire plus tard', 'https://reading.example.com/article', {
          ReadingList: { DateAdded: new Date('2026-10-01T08:00:00Z'), PreviewText: 'Résumé' },
          ReadingListNonSync: { neverFetchMetadata: false }
        })
      ])
    ]
  }
}

/** Favoris d'un profil Orion « Travail » : la barre seulement, en XML lisible. */
export const FAVORIS_ORION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>WebBookmarkType</key><string>WebBookmarkTypeList</string>
  <key>Children</key>
  <array>
    <dict>
      <key>WebBookmarkType</key><string>WebBookmarkTypeList</string>
      <key>Title</key><string>BookmarksBar</string>
      <key>Children</key>
      <array>
        <dict>
          <key>WebBookmarkType</key><string>WebBookmarkTypeLeaf</string>
          <key>URLString</key><string>https://work.example.com/?a=1&amp;b=2</string>
          <key>URIDictionary</key><dict><key>title</key><string>Intranet &amp; co</string></dict>
        </dict>
      </array>
    </dict>
  </array>
</dict>
</plist>
`

// ---------------------------------------------------------------------------------------------------------------------
// Historique au format Safari (History.db)

type SqlJs = Awaited<ReturnType<typeof initSqlJs>>

interface PageFixture {
  url: string
  /** Visites : [date ISO, titre de la page à cette visite]. */
  visites: Array<[string, string]>
}

/** Fenêtre de 92 jours depuis MAINTENANT_FIXTURES_APPLE : le 2026-07-19T12:00:00Z. */
export const PAGES_FIXTURES_APPLE: PageFixture[] = [
  {
    url: 'https://example.com/',
    visites: [
      ['2026-10-18T10:00:00Z', 'Exemple'],
      ['2026-10-17T09:00:00Z', 'Ancien titre'],
      ['2026-10-10T09:00:00Z', 'Ancien titre']
    ]
  },
  {
    url: 'https://docs.example.org/guide',
    visites: [
      ['2026-09-02T08:00:00Z', 'Guide'],
      ['2026-09-01T08:00:00Z', 'Guide']
    ]
  },
  {
    url: 'https://mixte.example.com/',
    visites: [
      ['2026-10-01T08:00:00Z', 'Page mixte'],
      ['2026-05-01T08:00:00Z', 'Page mixte']
    ]
  },
  { url: 'https://ancien.example.net/', visites: [['2026-06-01T08:00:00Z', 'Ancien']] },
  { url: 'http://clair.example.com/', visites: [['2026-10-15T08:00:00Z', 'Sans HTTPS']] },
  { url: 'file:///Users/test/page.html', visites: [['2026-10-18T12:00:00Z', 'Fichier local']] },
  { url: 'about:blank', visites: [['2026-10-18T11:30:00Z', '']] },
  { url: 'topsites://', visites: [['2026-10-18T11:00:00Z', 'Sites favoris']] }
]

export function baseHistoriqueApple(SQL: SqlJs, pages: PageFixture[] = PAGES_FIXTURES_APPLE): Uint8Array {
  const db = new SQL.Database()
  db.run(`CREATE TABLE history_items(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, domain_expansion TEXT, visit_count INTEGER NOT NULL, daily_visit_counts BLOB, weekly_visit_counts BLOB, autocomplete_triggers BLOB, should_recompute_derived_visit_counts INTEGER NOT NULL, visit_count_score INTEGER NOT NULL)`)
  db.run(`CREATE TABLE history_visits(id INTEGER PRIMARY KEY AUTOINCREMENT, history_item INTEGER NOT NULL REFERENCES history_items(id) ON DELETE CASCADE, visit_time REAL NOT NULL, title TEXT, load_successful BOOLEAN NOT NULL DEFAULT 1, http_non_get BOOLEAN NOT NULL DEFAULT 0, synthesized BOOLEAN NOT NULL DEFAULT 0, redirect_source INTEGER, redirect_destination INTEGER, origin INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0, attributes INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0)`)
  pages.forEach((p, i) => {
    const id = i + 1
    db.run('INSERT INTO history_items VALUES (?,?,?,?,?,?,?,?,?)', [id, p.url, null, p.visites.length, new Uint8Array(4), new Uint8Array(4), new Uint8Array(0), 0, 0])
    for (const [iso, titre] of p.visites) {
      db.run('INSERT INTO history_visits(history_item, visit_time, title, load_successful, http_non_get, synthesized, redirect_source, redirect_destination, origin, generation, attributes, score) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
        id,
        appleSecondes(iso),
        titre,
        1,
        0,
        0,
        null,
        null,
        0,
        0,
        0,
        0
      ])
    }
  })
  const octets = db.export()
  db.close()
  return octets
}

// ---------------------------------------------------------------------------------------------------------------------
// Génération

function ecrire(racine: string, chemin: string, contenu: string | Uint8Array): void {
  const complet = join(racine, chemin)
  mkdirSync(dirname(complet), { recursive: true })
  writeFileSync(complet, contenu)
}

/** (Re)crée `<sortie>/safari/` et `<sortie>/orion/`. */
export async function genererFixturesApple(sortie: string): Promise<void> {
  const SQL = await initSqlJs()
  const safari = join(sortie, 'safari')
  const orion = join(sortie, 'orion')
  rmSync(safari, { recursive: true, force: true })
  rmSync(orion, { recursive: true, force: true })

  compteurUuid = 0
  ecrire(safari, 'Bookmarks.plist', ecrireBplist(favorisSafari()))
  ecrire(safari, 'History.db', baseHistoriqueApple(SQL))

  compteurUuid = 100
  ecrire(orion, 'Defaults/Default/favourites.plist', ecrireBplist(favorisSafari()))
  ecrire(orion, 'Defaults/Default/history', baseHistoriqueApple(SQL))
  ecrire(orion, 'Defaults/Travail/favourites.plist', FAVORIS_ORION_XML)
}

const ici = dirname(fileURLToPath(import.meta.url))

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await genererFixturesApple(ici)
  console.log('Fixtures Safari et Orion générées dans', ici)
}
