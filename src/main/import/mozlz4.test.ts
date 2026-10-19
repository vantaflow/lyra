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

  it('mauvais en-tête et taille annoncée au-delà de la limite', () => {
    expect(() => decoderMozlz4(utf8('pas un mozlz4 du tout'), 'la session')).toThrow(/mozlz4/)
    const trop = encoderMozlz4(utf8('x'))
    new DataView(trop.buffer).setUint32(8, 10_000_000, true)
    expect(() => decoderMozlz4(trop, 'la session', 1_000_000)).toThrow(/volumineux/)
  })

  it('JSON : objet rendu, JSON cassé → ErreurImport', () => {
    expect(lireJsonMozlz4(encoderMozlz4(utf8('{"a":[1,2]}')))).toEqual({ a: [1, 2] })
    expect(() => lireJsonMozlz4(encoderMozlz4(utf8('{"a":')))).toThrow(ErreurImport)
  })
})
