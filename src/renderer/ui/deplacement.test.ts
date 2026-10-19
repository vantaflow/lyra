import { describe, it, expect } from 'vitest'
import { positionDepuisPoint } from './deplacement'

describe('positionDepuisPoint', () => {
  it('moitié de la fenêtre la plus proche du point', () => {
    expect(positionDepuisPoint(100, 400, 1280, 800)).toBe('gauche')
    expect(positionDepuisPoint(1200, 400, 1280, 800)).toBe('droite')
    expect(positionDepuisPoint(640, 40, 1280, 800)).toBe('haut')
    expect(positionDepuisPoint(640, 760, 1280, 800)).toBe('bas')
  })
  it('points hors fenêtre (relâché au-delà du bord)', () => {
    expect(positionDepuisPoint(-300, 400, 1280, 800)).toBe('gauche')
    expect(positionDepuisPoint(1800, 400, 1280, 800)).toBe('droite')
    expect(positionDepuisPoint(640, -200, 1280, 800)).toBe('haut')
    expect(positionDepuisPoint(640, 1400, 1280, 800)).toBe('bas')
  })
  it('fenêtre dégénérée : pas de division par zéro', () => {
    expect(positionDepuisPoint(0, 0, 0, 0)).toBe('gauche')
  })
})
