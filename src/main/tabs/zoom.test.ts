import { describe, expect, it } from 'vitest'
import { estZoomNormal, palierSuivant } from './zoom'

describe('zoom', () => {
  it('monte et descend par paliers', () => {
    expect(palierSuivant(1, 1)).toBe(1.1)
    expect(palierSuivant(1, -1)).toBe(0.9)
    expect(palierSuivant(1.1, 1)).toBe(1.25)
  })
  it('reste entre 25 % et 500 %', () => {
    expect(palierSuivant(5, 1)).toBe(5)
    expect(palierSuivant(0.25, -1)).toBe(0.25)
  })
  it('un facteur hors palier va au palier voisin', () => {
    expect(palierSuivant(1.05, 1)).toBe(1.1)
    expect(palierSuivant(1.05, -1)).toBe(1)
  })
  it('100 % est le zoom normal', () => {
    expect(estZoomNormal(1)).toBe(true)
    expect(estZoomNormal(1.1)).toBe(false)
  })
})
