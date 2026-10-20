/**
 * Décodage des favicons sans Electron (testable) : détection du format, ICO (image PNG ou BMP embarquée) et BMP.
 * Les formats raster courants (PNG, JPEG, GIF, WebP) sont confiés à `nativeImage` par l'appelant ; le SVG est ignoré.
 */

export type FormatFavicon = 'png' | 'jpeg' | 'gif' | 'webp' | 'ico' | 'bmp' | 'svg' | 'inconnu'

const PNG = [0x89, 0x50, 0x4e, 0x47]
const debute = (o: Uint8Array, sig: number[], decalage = 0): boolean => sig.every((v, i) => o[decalage + i] === v)

export function formatFavicon(o: Uint8Array): FormatFavicon {
  if (o.length < 4) return 'inconnu'
  if (debute(o, PNG)) return 'png'
  if (debute(o, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (debute(o, [0x47, 0x49, 0x46, 0x38])) return 'gif'
  if (debute(o, [0x52, 0x49, 0x46, 0x46]) && debute(o, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  if (debute(o, [0, 0, 1, 0])) return 'ico'
  if (debute(o, [0x42, 0x4d])) return 'bmp'
  const debut = Buffer.from(o.subarray(0, 512)).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase()
  if (debut.startsWith('<svg') || (debut.startsWith('<?xml') && debut.includes('<svg')) || debut.startsWith('<!doctype svg')) return 'svg'
  return 'inconnu'
}

export interface Bitmap {
  /** Pixels BGRA, de haut en bas. */
  bgra: Uint8Array
  largeur: number
  hauteur: number
}

/**
 * Décode une image DIB (en-tête BITMAPINFOHEADER, sans compression : 1, 4, 8, 24 ou 32 bits par pixel).
 * `ico` : la hauteur déclarée compte l'image et son masque ET (le double de la hauteur réelle).
 */
export function decoderDib(o: Buffer, ico: boolean): Bitmap | null {
  if (o.length < 40) return null
  const tailleEntete = o.readUInt32LE(0)
  const largeur = o.readInt32LE(4)
  const hauteurBrute = o.readInt32LE(8)
  const bpp = o.readUInt16LE(14)
  const compression = o.readUInt32LE(16)
  if (tailleEntete < 40 || compression !== 0 || ![1, 4, 8, 24, 32].includes(bpp)) return null
  const hautDeBas = hauteurBrute < 0
  const hauteur = (ico ? Math.abs(hauteurBrute) / 2 : Math.abs(hauteurBrute)) | 0
  if (largeur <= 0 || hauteur <= 0 || largeur > 512 || hauteur > 512) return null
  const couleursUtilisees = o.readUInt32LE(32)
  const nPalette = bpp <= 8 ? couleursUtilisees || 1 << bpp : 0
  const debutPalette = tailleEntete
  const debutPixels = debutPalette + nPalette * 4
  const pas = (((largeur * bpp + 31) >> 5) << 2)
  const pasMasque = ((largeur + 31) >> 5) << 2
  const finPixels = debutPixels + pas * hauteur
  if (finPixels > o.length) return null
  const sortie = new Uint8Array(largeur * hauteur * 4)
  let alphaVu = false
  for (let y = 0; y < hauteur; y++) {
    const ligne = debutPixels + (hautDeBas ? y : hauteur - 1 - y) * pas
    for (let x = 0; x < largeur; x++) {
      const d = (y * largeur + x) * 4
      if (bpp === 32) {
        const p = ligne + x * 4
        sortie[d] = o[p]; sortie[d + 1] = o[p + 1]; sortie[d + 2] = o[p + 2]; sortie[d + 3] = o[p + 3]
        if (o[p + 3] !== 0) alphaVu = true
      } else if (bpp === 24) {
        const p = ligne + x * 3
        sortie[d] = o[p]; sortie[d + 1] = o[p + 1]; sortie[d + 2] = o[p + 2]; sortie[d + 3] = 255
      } else {
        const bits = x * bpp
        const octet = o[ligne + (bits >> 3)]
        const indice = (octet >> (8 - bpp - (bits & 7))) & ((1 << bpp) - 1)
        const p = debutPalette + indice * 4
        if (indice >= nPalette) return null
        sortie[d] = o[p]; sortie[d + 1] = o[p + 1]; sortie[d + 2] = o[p + 2]; sortie[d + 3] = 255
      }
    }
  }
  // 32 bits sans aucun alpha : opaque (le masque ET décide).
  if (bpp === 32 && !alphaVu) for (let i = 3; i < sortie.length; i += 4) sortie[i] = 255
  // Masque ET (ICO) : bit à 1 = transparent ; ignoré pour un 32 bits avec alpha.
  if (ico && !(bpp === 32 && alphaVu) && finPixels + pasMasque * hauteur <= o.length) {
    for (let y = 0; y < hauteur; y++) {
      const ligne = finPixels + (hautDeBas ? y : hauteur - 1 - y) * pasMasque
      for (let x = 0; x < largeur; x++) if ((o[ligne + (x >> 3)] >> (7 - (x & 7))) & 1) sortie[(y * largeur + x) * 4 + 3] = 0
    }
  }
  return { bgra: sortie, largeur, hauteur }
}

/** Image d'un fichier BMP (`BM` + en-tête de fichier de 14 octets). */
export function decoderBmp(o: Buffer): Bitmap | null {
  return o.length > 54 ? decoderDib(o.subarray(14), false) : null
}

/**
 * Meilleure image d'un fichier ICO : la plus grande de 64 px au plus (sinon la plus petite).
 * Renvoie le PNG embarqué (à décoder par l'appelant) ou le bitmap décodé ; `null` si illisible.
 */
export function imageDeIco(o: Buffer): { png: Buffer } | Bitmap | null {
  if (o.length < 22) return null
  const n = o.readUInt16LE(4)
  if (n === 0 || 6 + n * 16 > o.length) return null
  const entrees: Array<{ largeur: number; taille: number; decalage: number }> = []
  for (let i = 0; i < n; i++) {
    const p = 6 + i * 16
    entrees.push({ largeur: o[p] || 256, taille: o.readUInt32LE(p + 8), decalage: o.readUInt32LE(p + 12) })
  }
  const petites = entrees.filter((e) => e.largeur <= 64)
  const triees = petites.length > 0 ? petites.sort((a, b) => b.largeur - a.largeur) : entrees.sort((a, b) => a.largeur - b.largeur)
  for (const e of triees) {
    if (e.decalage + e.taille > o.length || e.taille < 8) continue
    const donnees = o.subarray(e.decalage, e.decalage + e.taille)
    if (debute(donnees, PNG)) return { png: Buffer.from(donnees) }
    const b = decoderDib(donnees, true)
    if (b) return b
  }
  return null
}
