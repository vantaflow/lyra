/**
 * Lecture de bases SQLite d'autres navigateurs avec `sql.js` (SQLite compilé en WASM : aucun module natif).
 *
 * Où est le `.wasm` : `sql.js` est une dépendance d'exécution, donc *externalisée* par electron-vite (le bundle du
 * processus principal fait `require('sql.js')`) et embarquée par electron-builder dans `app.asar/node_modules`.
 * Son chargeur Node lit `sql-wasm.wasm` à côté de `sql-wasm.js` (`__dirname`), avec le `fs` d'Electron qui sait
 * lire dans l'asar. Même résolution en développement, sous vitest (Node natif) et dans l'application empaquetée :
 * aucun chemin à configurer ici.
 *
 * La base est lue entièrement en mémoire (`Uint8Array`) depuis une copie (voir `copie.ts`) ; les lignes sont
 * ensuite parcourues par lots, avec une pause de la boucle d'événements entre deux lots pour ne pas figer
 * l'interface pendant qu'une grosse base (100 000 visites) est traitée.
 */
import { readFile } from 'node:fs/promises'
import initSqlJs from 'sql.js'
import type { Database, SqlJsStatic, SqlValue } from 'sql.js'
import { TAILLE_MAX_BASE, codeErreurFichier, raisonErreurFichier } from './copie'
import type { FichiersCopies } from './copie'
import { ErreurImport } from './types'

let sqlJs: Promise<SqlJsStatic> | undefined

/** Initialise `sql.js` une seule fois par processus. */
export function chargerSqlJs(): Promise<SqlJsStatic> {
  sqlJs ??= initSqlJs().catch((e: unknown) => {
    sqlJs = undefined
    throw new ErreurImport("Le lecteur de bases de données n'a pas pu démarrer.", { cause: e })
  })
  return sqlJs
}

export type Ligne = Record<string, SqlValue>

/** Rend la main à la boucle d'événements (entrées/sorties, interface) entre deux lots. */
export const pause = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

export class BaseLue {
  constructor(private db: Database) {}

  /** Toutes les lignes (pour les petites tables). */
  lignes(sql: string, params: SqlValue[] = []): Ligne[] {
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params)
      const lignes: Ligne[] = []
      while (stmt.step()) lignes.push(stmt.getAsObject())
      return lignes
    } finally {
      stmt.free()
    }
  }

  /** Les lignes par lots de `taille` ; la boucle d'événements respire entre deux lots. */
  async *parLots(sql: string, params: SqlValue[] = [], taille = 2000): AsyncGenerator<Ligne[]> {
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params)
      let lot: Ligne[] = []
      while (stmt.step()) {
        lot.push(stmt.getAsObject())
        if (lot.length >= taille) {
          yield lot
          lot = []
          await pause()
        }
      }
      if (lot.length) yield lot
    } finally {
      stmt.free()
    }
  }

  tables(): string[] {
    return this.lignes("SELECT name FROM sqlite_master WHERE type = 'table'").map((l) => String(l.name))
  }

  colonnes(table: string): string[] {
    // Le nom vient de nos propres constantes ; on l'échappe quand même.
    return this.lignes(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).map((l) => String(l.name))
  }

  /** Noms des index d'une table (`PRAGMA index_list`). */
  indexes(table: string): string[] {
    return this.lignes(`PRAGMA index_list("${table.replace(/"/g, '""')}")`).map((l) => String(l.name))
  }

  /** La requête se compile-t-elle (tables, colonnes, `INDEXED BY` valides) ? Sans l'exécuter. */
  valide(sql: string): boolean {
    try {
      this.db.prepare(sql).free()
      return true
    } catch {
      return false
    }
  }

  fermer(): void {
    this.db.close()
  }
}

/** Échec d'allocation (WebAssembly ou tampon) : mémoire insuffisante plutôt que base « corrompue ». */
export const estErreurMemoire = (e: unknown): boolean => e instanceof RangeError || /out of memory|allocation failed|OOM|could not allocate/i.test(e instanceof Error ? e.message : String(e))

/** `ErreurImport` lisible pour une erreur survenue pendant la lecture d'une base (`sujet` : « l'historique »). */
export function erreurLectureBase(e: unknown, sujet: string, messageCorrompu: string): ErreurImport {
  if (e instanceof ErreurImport) return e
  if (estErreurMemoire(e)) return new ErreurImport(`Mémoire insuffisante pour lire ${sujet} : fermez d'autres applications ou réduisez-le dans le navigateur, puis réessayez.`, { cause: e, code: 'memoire' })
  return new ErreurImport(messageCorrompu, { cause: e })
}

/**
 * Ouvre une base depuis son contenu ; `ErreurImport` si ce n'est pas une base SQLite lisible.
 * Une base en mode WAL (octets 18-19 de l'en-tête = 2) est lue comme une base classique : ces deux octets sont
 * remis à 1 dans `octets` (qui est notre propre copie en mémoire, jamais le fichier du navigateur).
 */
export async function ouvrirBase(octets: Uint8Array): Promise<BaseLue> {
  const SQL = await chargerSqlJs()
  let db: Database | undefined
  try {
    if (octets.length > 20 && (octets[18] === 2 || octets[19] === 2)) {
      octets[18] = 1
      octets[19] = 1
    }
    db = new SQL.Database(octets)
    // `new Database` ne vérifie rien : une première requête révèle un fichier corrompu ou qui n'est pas SQLite.
    db.exec('SELECT count(*) FROM sqlite_master')
    return new BaseLue(db)
  } catch (e) {
    db?.close()
    if (estErreurMemoire(e)) throw new ErreurImport('Mémoire insuffisante pour lire cette base de données.', { cause: e, code: 'memoire' })
    throw new ErreurImport('La base de données est corrompue ou illisible.', { cause: e })
  }
}

/** Ouvre la copie d'une base, en y intégrant le journal `-wal` copié avec elle s'il existe. */
export async function ouvrirBaseCopiee(copies: FichiersCopies): Promise<BaseLue> {
  let base: Buffer
  try {
    base = await readFile(copies.fichier)
  } catch (e) {
    throw new ErreurImport(raisonErreurFichier(e, 'la base de données'), { cause: e, code: codeErreurFichier(e) })
  }
  if (!copies.wal) return ouvrirBase(base)
  const wal = await readFile(copies.wal).catch(() => undefined)
  return ouvrirBase(wal ? appliquerWal(base, wal) : base)
}

// ---------------------------------------------------------------------------------------------------------------------
// Journal WAL : `sql.js` n'a pas de système de fichiers où poser le `-wal`, et un navigateur ouvert (Firefox surtout)
// y garde ses écritures récentes. On rejoue donc les transactions validées du WAL dans l'image de la base, comme
// le ferait un checkpoint SQLite (https://sqlite.org/walformat.html), puis on repasse la base en mode « journal
// classique » dans son en-tête. Les trames d'un autre « sel » ou à somme de contrôle fausse (écriture en cours au
// moment de la copie) et celles qui suivent la dernière validation sont ignorées.

const MAGIE_WAL = [0x377f0682, 0x377f0683]

function sommeWal(donnees: Uint8Array, debut: number, fin: number, grandBoutiste: boolean, s: [number, number]): [number, number] {
  const vue = new DataView(donnees.buffer, donnees.byteOffset, donnees.byteLength)
  let [s0, s1] = s
  for (let i = debut; i + 8 <= fin; i += 8) {
    s0 = (s0 + vue.getUint32(i, !grandBoutiste) + s1) >>> 0
    s1 = (s1 + vue.getUint32(i + 4, !grandBoutiste) + s0) >>> 0
  }
  return [s0, s1]
}

/**
 * Image de la base avec les transactions validées du WAL appliquées ; la base d'origine si le WAL est inutilisable
 * (en-tête, sel ou somme de contrôle qui ne correspondent pas). L'allocation est bornée : la taille annoncée par le
 * WAL ne peut pas dépasser les pages de la base plus le nombre de trames validées (chaque page nouvelle vient d'une
 * trame), et jamais `limite` octets ; sinon `ErreurImport` (WAL incohérent), jamais de `RangeError`.
 */
export function appliquerWal(base: Uint8Array, wal: Uint8Array, limite = TAILLE_MAX_BASE): Uint8Array {
  try {
    return appliquerWalBrut(base, wal, limite)
  } catch (e) {
    if (e instanceof ErreurImport) throw e
    throw new ErreurImport('Le journal de la base de données est incohérent.', { cause: e })
  }
}

function appliquerWalBrut(base: Uint8Array, wal: Uint8Array, limite: number): Uint8Array {
  if (wal.length < 32 || base.length < 100) return base
  const w = new DataView(wal.buffer, wal.byteOffset, wal.byteLength)
  const magie = w.getUint32(0)
  if (!MAGIE_WAL.includes(magie)) return base
  const grandBoutiste = (magie & 1) === 1
  const taillePage = w.getUint32(8)
  if (taillePage < 512 || taillePage > 65536 || (taillePage & (taillePage - 1)) !== 0) return base
  const sel1 = w.getUint32(16)
  const sel2 = w.getUint32(20)
  let somme = sommeWal(wal, 0, 24, grandBoutiste, [0, 0])
  if (somme[0] !== w.getUint32(24) || somme[1] !== w.getUint32(28)) return base

  const tailleTrame = 24 + taillePage
  const pages = new Map<number, number>() // numéro de page → position des données dans le WAL (transactions validées)
  let enAttente: Array<[number, number]> = []
  let taillePages = 0
  let tramesValidees = 0
  for (let pos = 32; pos + tailleTrame <= wal.length; pos += tailleTrame) {
    const numero = w.getUint32(pos)
    const apresValidation = w.getUint32(pos + 4)
    if (w.getUint32(pos + 8) !== sel1 || w.getUint32(pos + 12) !== sel2 || numero === 0) break
    somme = sommeWal(wal, pos, pos + 8, grandBoutiste, somme)
    somme = sommeWal(wal, pos + 24, pos + tailleTrame, grandBoutiste, somme)
    if (somme[0] !== w.getUint32(pos + 16) || somme[1] !== w.getUint32(pos + 20)) break
    enAttente.push([numero, pos + 24])
    if (apresValidation > 0) {
      for (const [n, p] of enAttente) pages.set(n, p)
      tramesValidees += enAttente.length
      enAttente = []
      taillePages = apresValidation
    }
  }
  if (pages.size === 0) return base

  const b = new DataView(base.buffer, base.byteOffset, base.byteLength)
  const taillePageBase = b.getUint16(16) === 1 ? 65536 : b.getUint16(16)
  if (taillePageBase !== taillePage) return base
  const pagesBase = Math.floor(base.length / taillePage)
  if (taillePages > pagesBase + tramesValidees || taillePages * taillePage > limite) {
    throw new ErreurImport('Le journal de la base de données est incohérent (taille annoncée impossible).')
  }
  const nbPages = Math.max(taillePages, pagesBase)
  const image = new Uint8Array(nbPages * taillePage)
  image.set(base.subarray(0, Math.min(base.length, image.length)))
  for (const [numero, pos] of pages) {
    if (numero <= nbPages) image.set(wal.subarray(pos, pos + taillePage), (numero - 1) * taillePage)
  }
  // En-tête : base redevenue « journal classique », taille en pages cohérente avec le compteur de modifications.
  const h = new DataView(image.buffer)
  image[18] = 1
  image[19] = 1
  h.setUint32(28, nbPages)
  h.setUint32(92, h.getUint32(24))
  return image
}
