import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appliquerWal, estErreurMemoire, chargerSqlJs, ouvrirBase, ouvrirBaseCopiee } from './sqlite'
import { ErreurImport } from './types'
import { lireProfilChromium } from './chromium'

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

describe('estErreurMemoire', () => {
  it('« OOM » seul est une erreur de mémoire, pas le mot « zoom »', () => {
    expect(estErreurMemoire(new Error('SQLite: OOM'))).toBe(true)
    expect(estErreurMemoire(new Error('out of memory'))).toBe(true)
    expect(estErreurMemoire(new Error('could not allocate 12 bytes'))).toBe(true)
    expect(estErreurMemoire(new Error('réglage de zoom invalide'))).toBe(false)
  })
})

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

// ---------------------------------------------------------------------------------------------------------------------
// WAL fabriqué : sommes de contrôle valides (calculées ici, indépendamment du lecteur) mais taille annoncée aberrante.

function sommeIndependante(octets: Uint8Array, debut: number, fin: number, s: [number, number], grandBoutiste: boolean): [number, number] {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  let [s0, s1] = s
  for (let i = debut; i < fin; i += 8) {
    s0 = (s0 + vue.getUint32(i, !grandBoutiste) + s1) >>> 0
    s1 = (s1 + vue.getUint32(i + 4, !grandBoutiste) + s0) >>> 0
  }
  return [s0, s1]
}

/** WAL d'une trame (la page 1 de `base`) qui annonce `taillePagesApresValidation` pages après validation. */
function walFabrique(base: Uint8Array, taillePagesApresValidation: number): Uint8Array {
  const taillePage = new DataView(base.buffer, base.byteOffset).getUint16(16) || 65536
  const wal = new Uint8Array(32 + 24 + taillePage)
  const vue = new DataView(wal.buffer)
  vue.setUint32(0, 0x377f0682) // petit-boutiste
  vue.setUint32(4, 3007000)
  vue.setUint32(8, taillePage)
  vue.setUint32(16, 0x11223344) // sels
  vue.setUint32(20, 0x55667788)
  let somme = sommeIndependante(wal, 0, 24, [0, 0], false)
  vue.setUint32(24, somme[0])
  vue.setUint32(28, somme[1])
  vue.setUint32(32, 1) // page 1
  vue.setUint32(36, taillePagesApresValidation)
  vue.setUint32(40, 0x11223344)
  vue.setUint32(44, 0x55667788)
  wal.set(base.subarray(0, taillePage), 56)
  somme = sommeIndependante(wal, 32, 40, somme, false)
  somme = sommeIndependante(wal, 56, 56 + taillePage, somme, false)
  vue.setUint32(48, somme[0])
  vue.setUint32(52, somme[1])
  return wal
}

describe('WAL de taille aberrante', () => {
  it('le WAL fabriqué avec une taille cohérente est bien accepté (le test ne triche pas)', async () => {
    const base = await baseAvecLignes(3)
    const pages = base.length / 4096
    const image = appliquerWal(base, walFabrique(base, pages))
    expect(image.length).toBe(base.length)
  })

  it.each([5_000_000, 2_000_000, 100_000])('%i pages annoncées pour une trame : ErreurImport « incohérent », jamais de RangeError', async (annoncees) => {
    const base = await baseAvecLignes(3)
    const wal = walFabrique(base, annoncees)
    expect(() => appliquerWal(base, wal)).toThrow(ErreurImport)
    expect(() => appliquerWal(base, wal)).toThrow(/incohérent/)
    expect(() => appliquerWal(base, wal)).not.toThrow(RangeError)
  })

  it('la limite d’octets de l’image est respectée même si la taille est « plausible »', async () => {
    const base = await baseAvecLignes(3)
    const pagesBase = base.length / 4096
    expect(() => appliquerWal(base, walFabrique(base, pagesBase + 1), 4096 * pagesBase)).toThrow(ErreurImport)
  })

  it('ouvrirBaseCopiee et lireProfilChromium : base Indisponible (code absent), pas d’exception', async () => {
    const base = await baseAvecLignes(3)
    const dossier = join(tmp, 'profil')
    require('node:fs').mkdirSync(dossier)
    writeFileSync(join(dossier, 'History'), base)
    writeFileSync(join(dossier, 'History-wal'), walFabrique(base, 4_000_000))
    await expect(ouvrirBaseCopiee({ fichier: join(dossier, 'History'), wal: join(dossier, 'History-wal') })).rejects.toBeInstanceOf(ErreurImport)
    const r = await lireProfilChromium({ navigateur: 'chrome', nom: 'Test', chemin: dossier, racine: tmp, parDefaut: true }, { elements: ['historique'] })
    expect(r.donnees.historique).toMatchObject({ indisponible: true, raison: expect.stringMatching(/journal de la base/) })
  })
})
