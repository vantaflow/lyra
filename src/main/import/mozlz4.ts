/**
 * Fichiers `.jsonlz4` / `.mozlz4` de Firefox (session, moteurs de recherche) : en-tête `mozLz40\0` (8 octets),
 * taille décompressée en uint32 petit-boutiste, puis un **bloc** LZ4 (pas le format « frame »). Décodé en JS pur,
 * sans dépendance ; la taille de sortie est bornée (`TAILLE_MAX_MOZLZ4`) et chaque offset vérifié : un fichier
 * corrompu donne une `ErreurImport` lisible, jamais une `RangeError`.
 */
import { ErreurImport } from './types'

export const MAGIE_MOZLZ4 = 'mozLz40\0'
/** Plus gros contenu décompressé accepté (une session Firefox pèse quelques Mo, un `search.json` quelques dizaines de Ko). */
export const TAILLE_MAX_MOZLZ4 = 256 * 1024 * 1024
/** Rapport maximal sortie/entrée d'un bloc LZ4 : une longueur de correspondance étendue ajoute 255 octets par octet. */
const RATIO_MAX_LZ4 = 255

export const estMozlz4 = (octets: Uint8Array): boolean => octets.length >= 12 && new TextDecoder('latin1').decode(octets.subarray(0, 8)) === MAGIE_MOZLZ4

/** Décode un bloc LZ4 brut dont on connaît la taille décompressée. */
export function decoderBlocLz4(src: Uint8Array, tailleSortie: number, sujet = 'le fichier'): Uint8Array {
  const corrompu = (): ErreurImport => new ErreurImport(`Impossible de décompresser ${sujet} : contenu corrompu.`)
  let out: Uint8Array
  try {
    out = new Uint8Array(tailleSortie)
  } catch (e) {
    throw new ErreurImport(`Impossible de décompresser ${sujet} : mémoire insuffisante.`, { code: 'memoire', cause: e })
  }
  let i = 0
  let o = 0
  while (i < src.length) {
    const jeton = src[i++]
    let litteraux = jeton >> 4
    if (litteraux === 15) {
      let b: number
      do {
        if (i >= src.length) throw corrompu()
        b = src[i++]
        litteraux += b
      } while (b === 255)
    }
    if (i + litteraux > src.length || o + litteraux > out.length) throw corrompu()
    out.set(src.subarray(i, i + litteraux), o)
    i += litteraux
    o += litteraux
    if (i >= src.length) break // dernière séquence : littéraux seulement
    if (i + 2 > src.length) throw corrompu()
    const decalage = src[i] | (src[i + 1] << 8)
    i += 2
    if (decalage === 0 || decalage > o) throw corrompu()
    let longueur = jeton & 15
    if (longueur === 15) {
      let b: number
      do {
        if (i >= src.length) throw corrompu()
        b = src[i++]
        longueur += b
      } while (b === 255)
    }
    longueur += 4
    if (o + longueur > out.length) throw corrompu()
    for (let k = 0; k < longueur; k++, o++) out[o] = out[o - decalage]
  }
  if (o !== tailleSortie) throw corrompu()
  return out
}

/** Contenu décompressé d'un fichier mozlz4 ; `ErreurImport` si l'en-tête, la taille ou le bloc sont invalides. */
export function decoderMozlz4(octets: Uint8Array, sujet = 'le fichier', tailleMax = TAILLE_MAX_MOZLZ4): Uint8Array {
  if (!estMozlz4(octets)) throw new ErreurImport(`${sujet[0]?.toUpperCase()}${sujet.slice(1)} n'est pas un fichier mozlz4 de Firefox.`)
  const taille = new DataView(octets.buffer, octets.byteOffset, octets.byteLength).getUint32(8, true)
  // Un bloc LZ4 ne produit jamais plus de ~255 octets par octet compressé : une taille annoncée sans rapport avec la
  // taille du fichier est une corruption, et ne doit rien allouer.
  if (taille > RATIO_MAX_LZ4 * (octets.length - 12) + 16) throw new ErreurImport(`Impossible de décompresser ${sujet} : contenu corrompu (taille annoncée incohérente).`)
  if (taille > tailleMax) {
    throw new ErreurImport(`${sujet[0]?.toUpperCase()}${sujet.slice(1)} est trop volumineux une fois décompressé (${Math.round(taille / 1048576)} Mo, maximum ${Math.round(tailleMax / 1048576)} Mo).`, { code: 'volumineux' })
  }
  return decoderBlocLz4(octets.subarray(12), taille, sujet)
}

/** JSON d'un fichier mozlz4 (`unknown` : à valider par l'appelant). */
export function lireJsonMozlz4(octets: Uint8Array, sujet = 'le fichier', tailleMax = TAILLE_MAX_MOZLZ4): unknown {
  const texte = new TextDecoder('utf-8').decode(decoderMozlz4(octets, sujet, tailleMax))
  try {
    return JSON.parse(texte)
  } catch (e) {
    throw new ErreurImport(`${sujet[0]?.toUpperCase()}${sujet.slice(1)} est corrompu (JSON illisible).`, { cause: e })
  }
}

/**
 * Encodage « littéraux seulement » (une seule séquence sans correspondance : valide pour tout décodeur LZ4, sans
 * compression). Sert aux fixtures et aux tests ; Lyra n'écrit jamais de fichier Firefox.
 */
export function encoderMozlz4(contenu: Uint8Array): Uint8Array {
  const longueurs: number[] = []
  if (contenu.length >= 15) {
    let reste = contenu.length - 15
    while (reste >= 255) {
      longueurs.push(255)
      reste -= 255
    }
    longueurs.push(reste)
  }
  const jeton = Math.min(contenu.length, 15) << 4
  const out = new Uint8Array(12 + 1 + longueurs.length + contenu.length)
  out.set(new TextEncoder().encode(MAGIE_MOZLZ4), 0)
  new DataView(out.buffer).setUint32(8, contenu.length, true)
  out[12] = jeton
  out.set(longueurs, 13)
  out.set(contenu, 13 + longueurs.length)
  return out
}
