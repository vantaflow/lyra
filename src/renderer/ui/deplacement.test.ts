import { describe, it, expect } from 'vitest'
import { bordVise, dansLeCiel, positionDepuisPoint } from './deplacement'

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

describe('bordVise : un geste resté sur le ciel courant ne le déplace pas', () => {
  const taille = { width: 1280, height: 800 }
  const ciel = (position: 'gauche' | 'droite' | 'haut' | 'bas', masque = false, largeur = 272) => ({ position, largeur, masque })
  it('micro-glisser sur l’en-tête', () => {
    expect(bordVise(100, 25, taille, ciel('gauche'))).toBe('gauche')
    expect(bordVise(1150, 25, taille, ciel('droite'))).toBe('droite')
    expect(bordVise(20, 28, taille, ciel('haut'))).toBe('haut')
    expect(bordVise(20, 772, taille, ciel('bas'))).toBe('bas')
  })
  it('ailleurs : le bord le plus proche', () => {
    expect(bordVise(1200, 400, taille, ciel('gauche'))).toBe('droite')
    expect(bordVise(640, 30, taille, ciel('droite'))).toBe('haut')
    expect(bordVise(640, 770, taille, ciel('haut'))).toBe('bas')
    expect(bordVise(40, 400, taille, ciel('bas'))).toBe('gauche')
  })
  it('limites : la largeur du ciel, la bande de 56 px, le rail de 14 px, la largeur bornée', () => {
    expect(dansLeCiel(271, 400, taille, ciel('gauche'))).toBe(true)
    expect(dansLeCiel(273, 400, taille, ciel('gauche'))).toBe(false)
    expect(dansLeCiel(55, 400, taille, ciel('haut'))).toBe(false)
    expect(dansLeCiel(640, 55, taille, ciel('haut'))).toBe(true)
    expect(dansLeCiel(10, 400, taille, ciel('gauche', true))).toBe(true)
    expect(dansLeCiel(20, 400, taille, ciel('gauche', true))).toBe(false)
    expect(dansLeCiel(900, 400, taille, ciel('droite', false, 900))).toBe(true)
    expect(dansLeCiel(850, 400, taille, ciel('droite', false, 900))).toBe(false)
  })
})
