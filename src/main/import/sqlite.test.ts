import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appliquerWal, chargerSqlJs, ouvrirBase, ouvrirBaseCopiee } from './sqlite'
import { ErreurImport } from './types'

const require = createRequire(import.meta.url)

let tmp: string
const aFermer: Array<() => void> = []
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-sqlite-'))
})
afterEach(() => {
  while (aFermer.length) aFermer.pop()!()
  rmSync(tmp, { recursive: true, force: true })
})

async function baseAvecLignes(n: number): Promise<Uint8Array> {
  const SQL = await chargerSqlJs()
  const db = new SQL.Database()
  db.run('CREATE TABLE t(id INTEGER PRIMARY KEY, nom TEXT)')
  for (let i = 1; i <= n; i++) db.run('INSERT INTO t(id, nom) VALUES (?, ?)', [i, `ligne ${i}`])
  const octets = db.export()
  db.close()
  return octets
}

describe('sql.js', () => {
  it('le .wasm est trouvé à côté de sql-wasm.js (même résolution en développement, sous vitest et dans l’asar)', async () => {
    expect(existsSync(require.resolve('sql.js/dist/sql-wasm.wasm'))).toBe(true)
    const SQL = await chargerSqlJs()
    expect(new SQL.Database().exec('SELECT sqlite_version()')[0].values[0][0]).toMatch(/^3\./)
  })

  it('ouvre une base depuis ses octets et lit les lignes', async () => {
    const base = await ouvrirBase(await baseAvecLignes(3))
    expect(base.tables()).toEqual(['t'])
    expect(base.colonnes('t')).toEqual(['id', 'nom'])
    expect(base.lignes('SELECT nom FROM t WHERE id > ? ORDER BY id', [1])).toEqual([{ nom: 'ligne 2' }, { nom: 'ligne 3' }])
    base.fermer()
  })

  it('lecture par lots : taille respectée, dernier lot partiel, rien si la requête est vide', async () => {
    const base = await ouvrirBase(await baseAvecLignes(25))
    const tailles: number[] = []
    for await (const lot of base.parLots('SELECT id FROM t ORDER BY id', [], 10)) tailles.push(lot.length)
    expect(tailles).toEqual([10, 10, 5])
    const vide: number[] = []
    for await (const lot of base.parLots('SELECT id FROM t WHERE id > 100', [], 10)) vide.push(lot.length)
    expect(vide).toEqual([])
    base.fermer()
  })

  it('rend la main à la boucle d’événements entre deux lots', async () => {
    const base = await ouvrirBase(await baseAvecLignes(50))
    const ordre: string[] = []
    setImmediate(() => ordre.push('autre tâche'))
    for await (const lot of base.parLots('SELECT id FROM t', [], 10)) ordre.push(`lot de ${lot.length}`)
    base.fermer()
    // la tâche planifiée avant la lecture passe entre le premier et le deuxième lot
    expect(ordre.slice(0, 3)).toEqual(['lot de 10', 'autre tâche', 'lot de 10'])
  })

  it('contenu qui n’est pas une base SQLite : ErreurImport, jamais de plantage', async () => {
    await expect(ouvrirBase(new TextEncoder().encode('ceci n’est pas une base de données SQLite, du tout, vraiment pas '.repeat(10)))).rejects.toBeInstanceOf(ErreurImport)
    const tronquee = (await baseAvecLignes(200)).slice(0, 5000)
    // Une base tronquée s'ouvre parfois (en-tête valide) mais ne doit au pire échouer qu'à la lecture, par une exception ordinaire.
    await ouvrirBase(tronquee).then(
      (b) => expect(() => b.lignes('SELECT count(*) FROM t')).not.toThrow(RangeError),
      (e) => expect(e).toBeInstanceOf(ErreurImport)
    )
  })

  it('base en mode WAL (en-tête) lue comme une base classique, sans fichier -wal', async () => {
    const octets = await baseAvecLignes(4)
    octets[18] = 2
    octets[19] = 2
    const base = await ouvrirBase(octets)
    expect(base.lignes('SELECT count(*) AS n FROM t')).toEqual([{ n: 4 }])
    base.fermer()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Journal WAL : vraie base écrite par SQLite natif (node:sqlite), WAL copié pendant que la base est ouverte,
// comme la copie d'un profil de navigateur en cours d'exécution.

type BaseNative = { exec(sql: string): void; close(): void }
function sqliteNatif(): { DatabaseSync: new (chemin: string) => BaseNative } | undefined {
  try {
    return require('node:sqlite')
  } catch {
    return undefined
  }
}
const natif = sqliteNatif()

describe.skipIf(!natif)('journal WAL', () => {
  /** Base de 3 lignes dans le fichier, 4 autres uniquement dans le WAL (une transaction chacune). */
  function fabriquer(): { fichier: string; wal: string } {
    const source = join(tmp, 'places.sqlite')
    const db = new natif!.DatabaseSync(source)
    db.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; CREATE TABLE t(id INTEGER PRIMARY KEY, nom TEXT)')
    for (let i = 1; i <= 3; i++) db.exec(`INSERT INTO t VALUES (${i}, 'dans la base ${i}')`)
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    for (let i = 4; i <= 7; i++) db.exec(`INSERT INTO t VALUES (${i}, 'dans le wal ${i}')`)
    const fichier = join(tmp, 'copie.sqlite')
    copyFileSync(source, fichier)
    copyFileSync(source + '-wal', fichier + '-wal')
    aFermer.push(() => db.close())
    return { fichier, wal: fichier + '-wal' }
  }
  const compter = async (c: { fichier: string; wal?: string }): Promise<number> => {
    const base = await ouvrirBaseCopiee(c)
    const n = Number(base.lignes('SELECT count(*) AS n FROM t')[0].n)
    base.fermer()
    return n
  }

  it('sans le -wal, on ne voit que les lignes déjà dans le fichier (cohérent, mais en retard)', async () => {
    const c = fabriquer()
    expect(await compter({ fichier: c.fichier })).toBe(3)
  })

  it('avec le -wal copié : les transactions validées du WAL sont rejouées', async () => {
    const c = fabriquer()
    expect(await compter(c)).toBe(7)
    const base = await ouvrirBaseCopiee(c)
    expect(base.lignes('SELECT nom FROM t WHERE id = 7')).toEqual([{ nom: 'dans le wal 7' }])
    base.fermer()
  })

  it('trame finale altérée (écriture en cours pendant la copie) : seule la dernière transaction est perdue', async () => {
    const c = fabriquer()
    const wal = readFileSync(c.wal)
    wal[wal.length - 10] ^= 0xff
    writeFileSync(c.wal, wal)
    expect(await compter(c)).toBe(6)
  })

  it('WAL tronqué au milieu d’une trame : les transactions complètes précédentes sont conservées', async () => {
    const c = fabriquer()
    const wal = readFileSync(c.wal)
    writeFileSync(c.wal, wal.subarray(0, wal.length - 100))
    expect(await compter(c)).toBe(6)
  })

  it('WAL d’une autre base (sel différent) ou illisible : ignoré, la base seule est lue', async () => {
    const c = fabriquer()
    const wal = readFileSync(c.wal)
    const autre = Buffer.from(wal)
    autre.writeUInt32BE((autre.readUInt32BE(16) ^ 0xdeadbeef) >>> 0, 16) // sel modifié : l'en-tête ne correspond plus
    writeFileSync(c.wal, autre)
    expect(await compter(c)).toBe(3)
    writeFileSync(c.wal, 'pas un wal')
    expect(await compter(c)).toBe(3)
    writeFileSync(c.wal, Buffer.alloc(0))
    expect(await compter(c)).toBe(3)
  })

  it('appliquerWal rend la base d’origine si le WAL est vide', () => {
    const base = new Uint8Array(200)
    expect(appliquerWal(base, new Uint8Array(10))).toBe(base)
  })
})
