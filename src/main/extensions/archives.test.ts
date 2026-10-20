import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { crx3Signe } from './crxTest'
import { copierDossier, extraireZip, lireCrx3, verifierCrx3, ErreurArchive } from './archives'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-arch-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const sain = (): Uint8Array =>
  zipSync({
    'manifest.json': strToU8('{"manifest_version":3,"name":"x","version":"1.0"}'),
    'js/contenu.js': strToU8('console.log(1)'),
    'vide/': new Uint8Array(0)
  })

/** Remplace un entier 32 bits little-endian dans l'archive (en-têtes mensongers). */
function patch32(zip: Uint8Array, signature: number, decalage: number, valeur: number): Uint8Array {
  const sortie = zip.slice()
  const v = new DataView(sortie.buffer)
  for (let i = 0; i + 4 <= sortie.length; i++) if (v.getUint32(i, true) === signature) v.setUint32(i + decalage, valeur, true)
  return sortie
}
const SIG_CENTRALE = 0x02014b50
const SIG_LOCALE = 0x04034b50

/** CRX3 minimal : « Cr24 », version 3, taille d'en-tête, en-tête, puis le zip. */
function crx3(zip: Uint8Array, entete: Uint8Array = new Uint8Array(0)): Uint8Array {
  const sortie = new Uint8Array(12 + entete.length + zip.length)
  const v = new DataView(sortie.buffer)
  sortie.set([0x43, 0x72, 0x32, 0x34]) // Cr24
  v.setUint32(4, 3, true)
  v.setUint32(8, entete.length, true)
  sortie.set(entete, 12)
  sortie.set(zip, 12 + entete.length)
  return sortie
}

describe('lireCrx3', () => {
  it('retire l\'en-tête et rend le zip', () => {
    const zip = sain()
    const r = lireCrx3(crx3(zip, new Uint8Array([1, 2, 3, 4, 5])))
    expect(r.zip).toEqual(zip)
    expect(r.cle).toBeUndefined()
  })

  it('retrouve la clé publique dont l\'identifiant est déclaré dans l\'en-tête', () => {
    const cle = Buffer.from('MIIBIjANcle-de-test', 'utf8')
    // proof (champ 2 de CrxFileHeader) : public_key = champ 1 ; signed_header_data (champ 10000) : crx_id = champ 1
    const lg = (n: number): number[] => [n]
    const proof = [0x0a, ...lg(cle.length), ...cle]
    const rsa = [0x12, ...lg(proof.length), ...proof]
    const crxId = Array.from(new Uint8Array(16).fill(7))
    const signe = [0x0a, 16, ...crxId]
    // tag 10000 << 3 | 2 = 80002 → varint
    const tag = [0x82, 0xf1, 0x04]
    const entete = new Uint8Array([...rsa, ...tag, signe.length, ...signe])
    const r = lireCrx3(crx3(sain(), entete))
    // l'identifiant déclaré ne correspond à aucune clé : on prend la première clé RSA
    expect(r.cle?.toString('utf8')).toBe('MIIBIjANcle-de-test')
  })

  it.each([
    ['trop court', new Uint8Array([0x43, 0x72, 0x32])],
    ['magic invalide', (() => { const c = crx3(sain()); c[0] = 0x50; return c })()],
    ['version 2', (() => { const c = crx3(sain()); new DataView(c.buffer).setUint32(4, 2, true); return c })()],
    ['taille d\'en-tête démesurée', (() => { const c = crx3(sain()); new DataView(c.buffer).setUint32(8, 1_000_000, true); return c })()],
    ['payload qui n\'est pas un zip', crx3(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))]
  ])('refuse proprement : %s', (_nom, octets) => {
    expect(() => lireCrx3(octets)).toThrow(ErreurArchive)
  })
})

describe('extraireZip', () => {
  it('extrait une archive saine sous le dossier cible', () => {
    const cible = join(tmp, 'ext')
    extraireZip(sain(), cible)
    expect(readFileSync(join(cible, 'js/contenu.js'), 'utf8')).toBe('console.log(1)')
    expect(JSON.parse(readFileSync(join(cible, 'manifest.json'), 'utf8')).name).toBe('x')
    expect(existsSync(join(cible, 'vide'))).toBe(true)
    // pas de dossier temporaire résiduel
    expect(readdirSync(tmp)).toEqual(['ext'])
  })

  const refuse = (zip: Uint8Array, limites?: Parameters<typeof extraireZip>[2]): void => {
    const cible = join(tmp, 'sous', 'ext')
    mkdirSync(join(tmp, 'sous'), { recursive: true })
    expect(() => extraireZip(zip, cible, limites)).toThrow(ErreurArchive)
    // rien d'écrit : ni la cible, ni de résidu, ni hors du dossier
    expect(readdirSync(join(tmp, 'sous'))).toEqual([])
    expect(readdirSync(tmp)).toEqual(['sous'])
  }

  it('refuse « ../ »', () => refuse(zipSync({ 'manifest.json': strToU8('{}'), '../evil.js': strToU8('x') })))
  it('refuse « a/../../ »', () => refuse(zipSync({ 'a/../../evil.js': strToU8('x') })))
  it('refuse un chemin absolu', () => refuse(zipSync({ '/etc/evil.js': strToU8('x') })))
  it('refuse un chemin Windows absolu ou avec antislash', () => {
    refuse(zipSync({ 'C:/evil.js': strToU8('x') }))
    refuse(zipSync({ '..\\evil.js': strToU8('x') }))
  })
  it('refuse plus de 10 000 entrées', () => {
    const entrees: Record<string, Uint8Array> = {}
    for (let i = 0; i < 10_001; i++) entrees[`f${i}`] = new Uint8Array(0)
    refuse(zipSync(entrees, { level: 0 }))
  })
  it('refuse une taille décompressée annoncée de 1 Gio', () => {
    refuse(patch32(zipSync({ 'a.js': strToU8('x'.repeat(100)) }), SIG_CENTRALE, 24, 1 << 30))
  })
  it('refuse une taille réelle au-delà de la limite même si l\'en-tête ment', () => {
    let zip: Uint8Array = zipSync({ 'a.bin': new Uint8Array(50_000) })
    zip = patch32(zip, SIG_CENTRALE, 24, 10)
    zip = patch32(zip, SIG_LOCALE, 22, 10)
    refuse(zip, { octets: 4_000 })
  })
  it('refuse une bombe de décompression (60 Mio de zéros annoncés comme 10 Ko) sans pic mémoire', () => {
    let zip: Uint8Array = zipSync({ 'a.bin': new Uint8Array(60 * 1024 * 1024) })
    expect(zip.length).toBeLessThan(200_000)
    zip = patch32(zip, SIG_CENTRALE, 24, 10_000)
    zip = patch32(zip, SIG_LOCALE, 22, 10_000)
    const avant = process.memoryUsage().arrayBuffers
    refuse(zip)
    expect(process.memoryUsage().arrayBuffers - avant).toBeLessThan(20 * 1024 * 1024)
  })
  it('refuse un lien symbolique', () => {
    const zip = zipSync({ 'lien': strToU8('/etc/passwd') })
    // attributs externes : lien symbolique Unix (0o120777 << 16), « made by » Unix (3 << 8)
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    for (let i = 0; i + 4 <= zip.length; i++) {
      if (v.getUint32(i, true) === SIG_CENTRALE) {
        v.setUint16(i + 4, 3 << 8, true)
        v.setUint32(i + 38, (0o120777 << 16) >>> 0, true)
      }
    }
    refuse(zip)
  })
  it('refuse un fichier qui n\'est pas un zip', () => refuse(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23])))
})

describe('copierDossier', () => {
  it('copie un dossier et refuse les liens symboliques', () => {
    const src = join(tmp, 'src')
    mkdirSync(join(src, 'a'), { recursive: true })
    writeFileSync(join(src, 'a', 'x.js'), 'ok')
    copierDossier(src, join(tmp, 'copie'))
    expect(readFileSync(join(tmp, 'copie', 'a', 'x.js'), 'utf8')).toBe('ok')
    symlinkSync('/etc/hosts', join(src, 'lien'))
    expect(() => copierDossier(src, join(tmp, 'copie2'))).toThrow(ErreurArchive)
    expect(existsSync(join(tmp, 'copie2'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------- signature CRX3
describe('verifierCrx3', () => {
  it('accepte un CRX3 correctement signé (id attendu ou déclaré)', () => {
    const zip = sain()
    const { octets, id } = crx3Signe(zip)
    expect(verifierCrx3(octets, id).zip).toEqual(zip)
    expect(verifierCrx3(octets).cle.length).toBeGreaterThan(100)
  })
  it('refuse un payload altéré', () => {
    const { octets, id } = crx3Signe(sain())
    const alt = octets.slice()
    alt[alt.length - 40] ^= 0xff
    expect(() => verifierCrx3(alt, id)).toThrow(ErreurArchive)
  })
  it("refuse la clé d'un autre identifiant", () => {
    const { octets } = crx3Signe(sain())
    expect(() => verifierCrx3(octets, 'a'.repeat(32))).toThrow(ErreurArchive)
  })
  it('refuse un crx_id déclaré qui ne vient pas de la clé', () => {
    const { octets, id } = crx3Signe(sain(), { declarer: Buffer.alloc(16, 9) })
    expect(() => verifierCrx3(octets, id)).toThrow(ErreurArchive)
    expect(() => verifierCrx3(octets)).toThrow(ErreurArchive)
  })
  it('refuse un CRX3 sans preuve ni identifiant signé', () => {
    expect(() => verifierCrx3(crx3(sain(), new Uint8Array([1, 2, 3, 4, 5])))).toThrow(ErreurArchive)
  })
})
