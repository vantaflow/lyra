import { describe, expect, it } from 'vitest'
import { decoderBlocLz4, decoderMozlz4, encoderMozlz4, lireJsonMozlz4 } from './mozlz4'
import { ErreurImport } from './types'

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('mozlz4', () => {
  it('aller-retour littéraux seulement, court et long (> 15 et > 270 octets)', () => {
    for (const n of [0, 3, 15, 16, 270, 271, 5000]) {
      const contenu = utf8('é'.repeat(n).slice(0, n))
      expect(Array.from(decoderMozlz4(encoderMozlz4(contenu)))).toEqual(Array.from(contenu))
    }
  })

  it('bloc avec correspondance : « abc » puis 6 octets copiés à 3 de distance', () => {
    const bloc = new Uint8Array([0x32, 0x61, 0x62, 0x63, 0x03, 0x00, 0x00])
    expect(new TextDecoder().decode(decoderBlocLz4(bloc, 9))).toBe('abcabcabc')
  })

  it('offset nul, offset trop grand, taille fausse : ErreurImport, jamais RangeError', () => {
    expect(() => decoderBlocLz4(new Uint8Array([0x32, 0x61, 0x62, 0x63, 0x00, 0x00]), 9)).toThrow(ErreurImport)
    expect(() => decoderBlocLz4(new Uint8Array([0x32, 0x61, 0x62, 0x63, 0x09, 0x00]), 9)).toThrow(ErreurImport)
    expect(() => decoderBlocLz4(new Uint8Array([0x32, 0x61, 0x62, 0x63, 0x03, 0x00]), 20)).toThrow(ErreurImport)
    expect(() => decoderBlocLz4(new Uint8Array([0xf0, 0xff]), 300)).toThrow(ErreurImport)
  })

  // Vecteurs LZ4 fabriqués à la main (contenu synthétique) : le chemin des fichiers Firefox réels, qui sont compressés.
  const texte = (bloc: number[], taille: number): string => new TextDecoder().decode(decoderBlocLz4(new Uint8Array(bloc), taille))
  const ascii = (s: string): number[] => Array.from(utf8(s))

  it('correspondance étendue (nibble 15 + octets 255) à offset 1 : 285 « a »', () => {
    // jeton 0x1f : 1 littéral, longueur 15 ; extension 0xff + 0x0a → 15 + 255 + 10 + 4 = 284 octets copiés ; jeton final 0x00
    expect(texte([0x1f, 0x61, 0x01, 0x00, 0xff, 0x0a, 0x00], 285)).toBe('a'.repeat(285))
  })

  it('littéraux étendus suivis d’une correspondance dans la même séquence', () => {
    const vingt = 'abcdefghijklmnopqrst'
    // jeton 0xf2 : littéraux 15 + 5 = 20, correspondance 2 + 4 = 6, offset 20 ; jeton final 0x00
    expect(texte([0xf2, 0x05, ...ascii(vingt), 0x14, 0x00, 0x00], 26)).toBe(vingt + 'abcdef')
    // littéraux sur deux octets d'extension : 15 + 255 + 30 = 300, correspondance 1 + 4 = 5, offset 300
    const trois = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(12).slice(0, 300)
    expect(texte([0xf1, 0xff, 0x1e, ...ascii(trois), 0x2c, 0x01, 0x00], 305)).toBe(trois + 'ABCDE')
  })

  it('deux séquences : littéraux et correspondance, puis encore littéraux et correspondance', () => {
    // « abc » + 6 copiés à 3 → « abcabcabc » ; « XY » + 4 copiés à 5 → « abcX »
    const bloc = [0x32, ...ascii('abc'), 0x03, 0x00, 0x20, ...ascii('XY'), 0x05, 0x00, 0x00]
    expect(texte(bloc, 15)).toBe('abcabcabcXYabcX')
  })

  it('même chemin par decoderMozlz4 (en-tête compris)', () => {
    const bloc = [0x1f, 0x61, 0x01, 0x00, 0xff, 0x0a, 0x00]
    const fichier = new Uint8Array(12 + bloc.length)
    fichier.set(utf8('mozLz40\0'), 0)
    new DataView(fichier.buffer).setUint32(8, 285, true)
    fichier.set(bloc, 12)
    expect(new TextDecoder().decode(decoderMozlz4(fichier))).toBe('a'.repeat(285))
  })

  it('mauvais en-tête et taille annoncée au-delà de la limite', () => {
    expect(() => decoderMozlz4(utf8('pas un mozlz4 du tout'), 'la session')).toThrow(/mozlz4/)
    // 41 octets compressés : une taille de 10 000 est plausible, donc c'est la limite qui la refuse
    const trop = encoderMozlz4(utf8('x'.repeat(40)))
    new DataView(trop.buffer).setUint32(8, 10_000, true)
    expect(() => decoderMozlz4(trop, 'la session', 1_000)).toThrow(/volumineux/)
  })

  it('taille annoncée sans rapport avec le fichier (> 255 × compressé + 16) : corrompu, sans allocation', () => {
    for (const annoncee of [10_000_000, 0xffffffff]) {
      const f = encoderMozlz4(utf8('x'))
      new DataView(f.buffer).setUint32(8, annoncee, true)
      expect(() => decoderMozlz4(f, 'la session')).toThrow(/incohérente/)
    }
    // pile à la limite du ratio : la taille passe, c'est le bloc (faux) qui est refusé, avec son propre message
    const f = encoderMozlz4(utf8('x'))
    new DataView(f.buffer).setUint32(8, 255 * 2 + 16, true)
    expect(() => decoderMozlz4(f)).toThrow(ErreurImport)
    expect(() => decoderMozlz4(f)).not.toThrow(/incohérente/)
  })

  it('JSON : objet rendu, JSON cassé → ErreurImport', () => {
    expect(lireJsonMozlz4(encoderMozlz4(utf8('{"a":[1,2]}')))).toEqual({ a: [1, 2] })
    expect(() => lireJsonMozlz4(encoderMozlz4(utf8('{"a":')))).toThrow(ErreurImport)
  })
})
