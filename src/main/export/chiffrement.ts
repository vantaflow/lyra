/**
 * Chiffrement du paquet `.lyra` (Web Crypto, rien d'autre) :
 *   « LYRA1 » (5 octets) | itérations PBKDF2 (uint32 gros-boutiste) | sel (16) | IV (12) | chiffré AES-256-GCM + balise (16)
 * Clé : PBKDF2-SHA-256 de la phrase de passe (NFC, UTF-8), `ITERATIONS_PBKDF2` tours, 256 bits. L'en-tête jusqu'au sel
 * (magie, itérations, sel) est authentifié (données additionnelles de GCM) : le modifier fait échouer le déchiffrement.
 */
import { webcrypto } from 'node:crypto'
import { ERREUR_PHRASE, PHRASE_MIN } from '../../shared/exportTextes'

const { subtle } = webcrypto

export const MAGIE = 'LYRA1'
export const ITERATIONS_PBKDF2 = 600_000
/** Au-delà, un en-tête est jugé corrompu (évite un calcul démesuré sur un fichier forgé). */
const ITERATIONS_MAX = 10_000_000
const TAILLE_SEL = 16
const TAILLE_IV = 12
const TAILLE_BALISE = 16
const OFFSET_ITERATIONS = MAGIE.length
const OFFSET_SEL = OFFSET_ITERATIONS + 4
const OFFSET_IV = OFFSET_SEL + TAILLE_SEL
export const TAILLE_ENTETE = OFFSET_IV + TAILLE_IV

export class ErreurPaquet extends Error {
  constructor(
    message: string,
    readonly code: 'phrase' | 'phrase-courte' | 'format' | 'version' | 'volumineux'
  ) {
    super(message)
    this.name = 'ErreurPaquet'
  }
}

export interface CleDerivee {
  cle: webcrypto.CryptoKey
  sel: Uint8Array
  iterations: number
}

const aleatoire = (n: number): Uint8Array => webcrypto.getRandomValues(new Uint8Array(n))

export async function deriverCle(phrase: string, sel: Uint8Array = aleatoire(TAILLE_SEL), iterations = ITERATIONS_PBKDF2, extractible = false): Promise<CleDerivee> {
  const matiere = await subtle.importKey('raw', new TextEncoder().encode(phrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  const cle = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sel as BufferSource, iterations }, matiere, { name: 'AES-GCM', length: 256 }, extractible, ['encrypt', 'decrypt'])
  return { cle, sel, iterations }
}

/** Clé brute (32 octets), pour la mettre sous la protection du système (sauvegarde automatique). Exige une clé extractible. */
export async function exporterCle(c: CleDerivee): Promise<Uint8Array> {
  return new Uint8Array(await subtle.exportKey('raw', c.cle))
}

export async function importerCle(brut: Uint8Array, sel: Uint8Array, iterations: number): Promise<CleDerivee> {
  return { cle: await subtle.importKey('raw', brut as BufferSource, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']), sel, iterations }
}

function enTete(c: CleDerivee, iv: Uint8Array): Uint8Array {
  const e = new Uint8Array(TAILLE_ENTETE)
  e.set(new TextEncoder().encode(MAGIE), 0)
  new DataView(e.buffer).setUint32(OFFSET_ITERATIONS, c.iterations, false)
  e.set(c.sel, OFFSET_SEL)
  e.set(iv, OFFSET_IV)
  return e
}

export async function chiffrerAvecCle(clair: Uint8Array, c: CleDerivee): Promise<Uint8Array> {
  const iv = aleatoire(TAILLE_IV)
  const e = enTete(c, iv)
  const chiffre = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: e.subarray(0, OFFSET_IV) as BufferSource, tagLength: 128 }, c.cle, clair as BufferSource))
  const sortie = new Uint8Array(e.length + chiffre.length)
  sortie.set(e, 0)
  sortie.set(chiffre, e.length)
  return sortie
}

/** Refuse (avant tout calcul) une phrase de passe trop courte pour protéger un paquet. */
export function verifierPhrase(phrase: string): void {
  if ([...phrase.normalize('NFC')].length < PHRASE_MIN) throw new ErreurPaquet(`La phrase de passe doit contenir au moins ${PHRASE_MIN} caractères.`, 'phrase-courte')
}

export async function chiffrer(clair: Uint8Array, phrase: string): Promise<Uint8Array> {
  verifierPhrase(phrase)
  return chiffrerAvecCle(clair, await deriverCle(phrase))
}

export function lireEnTete(donnees: Uint8Array): { iterations: number; sel: Uint8Array; iv: Uint8Array } {
  if (donnees.length < TAILLE_ENTETE + TAILLE_BALISE) throw new ErreurPaquet(ERREUR_PHRASE, 'phrase')
  if (new TextDecoder('latin1').decode(donnees.subarray(0, MAGIE.length)) !== MAGIE) throw new ErreurPaquet('Ce fichier n’est pas un paquet Lyra.', 'format')
  const iterations = new DataView(donnees.buffer, donnees.byteOffset, donnees.byteLength).getUint32(OFFSET_ITERATIONS, false)
  return { iterations, sel: donnees.slice(OFFSET_SEL, OFFSET_IV), iv: donnees.slice(OFFSET_IV, TAILLE_ENTETE) }
}

/** Phrase fausse, fichier tronqué ou modifié : toujours `ERREUR_PHRASE`, jamais d'indice sur la cause. */
export async function dechiffrer(donnees: Uint8Array, phrase: string): Promise<Uint8Array> {
  const { iterations, sel, iv } = lireEnTete(donnees)
  if (iterations < ITERATIONS_PBKDF2 || iterations > ITERATIONS_MAX) throw new ErreurPaquet(ERREUR_PHRASE, 'phrase')
  try {
    const { cle } = await deriverCle(phrase, sel, iterations)
    return new Uint8Array(
      await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: donnees.subarray(0, OFFSET_IV) as BufferSource, tagLength: 128 }, cle, donnees.subarray(TAILLE_ENTETE) as BufferSource)
    )
  } catch {
    throw new ErreurPaquet(ERREUR_PHRASE, 'phrase')
  }
}
