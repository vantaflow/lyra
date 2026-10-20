import { describe, expect, it } from 'vitest'
import { couleurDominante } from './couleurDominante'

/** Image BGRA (ordre de `nativeImage.toBitmap()`) à partir de pixels [r, g, b, a]. */
const image = (pixels: Array<[number, number, number, number]>): Uint8Array => Uint8Array.from(pixels.flatMap(([r, g, b, a]) => [b, g, r, a]))
const rep = (n: number, p: [number, number, number, number]): Array<[number, number, number, number]> => Array.from({ length: n }, () => p)

describe('couleurDominante (favicon déjà en cache)', () => {
  it('une image unie rend sa couleur', () => {
    expect(couleurDominante(image(rep(256, [30, 127, 108, 255])))).toBe('#1E7F6C')
  })
  it('la couleur la plus fréquente l’emporte', () => {
    const px = [...rep(60, [200, 30, 30, 255]), ...rep(40, [30, 30, 200, 255])]
    expect(couleurDominante(image(px))).toBe('#C81E1E')
  })
  it('ignore les pixels transparents, le blanc, le noir et les gris', () => {
    const px = [...rep(500, [0, 0, 0, 0]), ...rep(300, [255, 255, 255, 255]), ...rep(300, [10, 10, 10, 255]), ...rep(300, [128, 128, 128, 255]), ...rep(5, [40, 90, 220, 255])]
    expect(couleurDominante(image(px))).toBe('#285ADC')
  })
  it('aucune couleur exploitable (image grise, vide ou transparente) : null', () => {
    expect(couleurDominante(image(rep(100, [128, 128, 128, 255])))).toBeNull()
    expect(couleurDominante(new Uint8Array())).toBeNull()
    expect(couleurDominante(image(rep(100, [200, 10, 10, 0])))).toBeNull()
  })
})
