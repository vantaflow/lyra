import { describe, expect, it, vi } from 'vitest'
import { decoderBmp, decoderDib, formatFavicon, imageDeIco } from './faviconDecode'

/** DIB d'une image 2×2 de pixels `couleurs` (haut → bas, gauche → droite, BGR). `bpp` 32 ou 24 ; en ICO la hauteur compte le masque. */
function dib(couleurs: Array<[number, number, number]>, bpp: 24 | 32, ico: boolean, masque?: number[]): Buffer {
  const largeur = 2
  const hauteur = 2
  const pas = (((largeur * bpp + 31) >> 5) << 2)
  const entete = Buffer.alloc(40)
  entete.writeUInt32LE(40, 0)
  entete.writeInt32LE(largeur, 4)
  entete.writeInt32LE(ico ? hauteur * 2 : hauteur, 8)
  entete.writeUInt16LE(1, 12)
  entete.writeUInt16LE(bpp, 14)
  const pixels = Buffer.alloc(pas * hauteur)
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const [b, g, r] = couleurs[y * largeur + x]
      const p = (hauteur - 1 - y) * pas + x * (bpp / 8)
      pixels[p] = b; pixels[p + 1] = g; pixels[p + 2] = r
      if (bpp === 32) pixels[p + 3] = 255
    }
  }
  const m = Buffer.alloc(ico ? 8 : 0)
  if (ico && masque) masque.forEach((v, y) => (m[(hauteur - 1 - y) * 4] = v))
  return Buffer.concat([entete, pixels, m])
}
function ico(donnees: Buffer, largeur = 2): Buffer {
  const t = Buffer.alloc(22)
  t.writeUInt16LE(1, 2)
  t.writeUInt16LE(1, 4)
  t[6] = largeur
  t[7] = largeur
  t.writeUInt32LE(donnees.length, 14)
  t.writeUInt32LE(22, 18)
  return Buffer.concat([t, donnees])
}
const ROUGE: [number, number, number] = [0, 0, 255]

describe('formatFavicon', () => {
  it('reconnaît les formats par leur signature', () => {
    expect(formatFavicon(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe('png')
    expect(formatFavicon(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
    expect(formatFavicon(Buffer.from('GIF89a'))).toBe('gif')
    expect(formatFavicon(Buffer.from([0, 0, 1, 0, 1, 0]))).toBe('ico')
    expect(formatFavicon(Buffer.from('BM....'))).toBe('bmp')
    expect(formatFavicon(Buffer.from('<?xml version="1.0"?><svg xmlns=""/>'))).toBe('svg')
    expect(formatFavicon(Buffer.from('  <svg></svg>'))).toBe('svg')
    expect(formatFavicon(Buffer.from('hello world'))).toBe('inconnu')
    expect(formatFavicon(Buffer.from([1]))).toBe('inconnu')
  })
})

describe('ICO et BMP', () => {
  it('ICO avec BMP 32 bits : pixels BGRA de haut en bas', () => {
    const r = imageDeIco(ico(dib([ROUGE, [0, 255, 0], [255, 0, 0], [1, 2, 3]], 32, true)))
    expect(r && 'bgra' in r).toBe(true)
    const b = r as { bgra: Uint8Array; largeur: number; hauteur: number }
    expect([b.largeur, b.hauteur]).toEqual([2, 2])
    expect([...b.bgra.slice(0, 4)]).toEqual([0, 0, 255, 255])
    expect([...b.bgra.slice(4, 8)]).toEqual([0, 255, 0, 255])
    expect([...b.bgra.slice(8, 12)]).toEqual([255, 0, 0, 255])
  })
  it('ICO 24 bits : le masque ET rend transparent', () => {
    const b = imageDeIco(ico(dib([ROUGE, ROUGE, ROUGE, ROUGE], 24, true, [0b01000000, 0]))) as { bgra: Uint8Array }
    expect(b.bgra[3]).toBe(255)
    expect(b.bgra[7]).toBe(0)
    expect(b.bgra[11]).toBe(255)
  })
  it('ICO avec un PNG embarqué : renvoyé tel quel', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const r = imageDeIco(ico(png)) as { png: Buffer }
    expect(r.png.equals(png)).toBe(true)
  })
  it('préfère la plus grande image de 64 px au plus', () => {
    const petite = dib([ROUGE, ROUGE, ROUGE, ROUGE], 32, true)
    const t = Buffer.alloc(38)
    t.writeUInt16LE(1, 2)
    t.writeUInt16LE(2, 4)
    t[6] = 16; t.writeUInt32LE(5, 14); t.writeUInt32LE(38, 18) // « 16 px » : données invalides, ignorée
    t[22] = 2; t.writeUInt32LE(petite.length, 30); t.writeUInt32LE(38, 34)
    expect(imageDeIco(Buffer.concat([t, petite]))).not.toBeNull()
  })
  it('BMP', () => {
    const entete = Buffer.alloc(14)
    entete.write('BM')
    const b = decoderBmp(Buffer.concat([entete, dib([ROUGE, ROUGE, ROUGE, ROUGE], 24, false)]))!
    expect([b.largeur, b.hauteur]).toEqual([2, 2])
    expect([...b.bgra.slice(0, 4)]).toEqual([0, 0, 255, 255])
  })
  it('données illisibles : null, jamais d’exception', () => {
    expect(imageDeIco(Buffer.alloc(30))).toBeNull()
    expect(imageDeIco(Buffer.from('nimporte quoi, assez long pour passer'))).toBeNull()
    expect(decoderDib(Buffer.alloc(10), true)).toBeNull()
    expect(decoderBmp(Buffer.alloc(60))).toBeNull()
  })
})

vi.mock('electron', () => ({ nativeImage: {}, net: {} }))
describe('teinteDesOctets', () => {
  it('PNG via le décodeur raster, ICO BMP en pur, SVG et inconnu ignorés', async () => {
    const { teinteDesOctets } = await import('./couleurFavicon')
    const rougeBgra = new Uint8Array(16).fill(0).map((_, i) => (i % 4 === 2 || i % 4 === 3 ? 255 : 0))
    const raster = vi.fn(() => rougeBgra)
    expect(teinteDesOctets(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), raster)).toBe('#FF0000')
    expect(raster).toHaveBeenCalledTimes(1)
    expect(teinteDesOctets(ico(dib([ROUGE, ROUGE, ROUGE, ROUGE], 32, true)), raster)).toBe('#FF0000')
    expect(raster).toHaveBeenCalledTimes(1)
    expect(teinteDesOctets(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), raster)).toBeNull()
    expect(teinteDesOctets(Buffer.from('bonjour'), raster)).toBeNull()
    expect(teinteDesOctets(Buffer.alloc(0), raster)).toBeNull()
    expect(teinteDesOctets(Buffer.alloc(300 * 1024, 1), raster)).toBeNull()
    expect(teinteDesOctets(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), () => null)).toBeNull()
  })
})
