import { describe, it, expect } from 'vitest'
import { computeLayout } from './layout'

const taille = { width: 1280, height: 800 }
const fenetre = { x: 0, y: 0, width: 1280, height: 800 }
const ciel = (position: 'gauche' | 'droite' | 'haut' | 'bas', masque = false, largeur = 272) => ({
  position,
  largeur,
  masque
})

describe('computeLayout', () => {
  it('gauche', () => {
    const l = computeLayout(taille, ciel('gauche'), false)
    expect(l.chrome).toEqual(fenetre)
    expect(l.page).toEqual({ x: 272, y: 46, width: 1008, height: 754 })
    expect(l.overlay).toEqual(fenetre)
  })
  it('droite', () => {
    const l = computeLayout(taille, ciel('droite'), false)
    expect(l.chrome).toEqual({ x: 1008, y: 0, width: 272, height: 800 })
    expect(l.page).toEqual({ x: 0, y: 0, width: 1008, height: 800 })
  })
  it('haut', () => {
    const l = computeLayout(taille, ciel('haut'), false)
    expect(l.chrome).toEqual({ x: 0, y: 0, width: 1280, height: 56 })
    expect(l.page).toEqual({ x: 0, y: 56, width: 1280, height: 744 })
  })
  it('bas', () => {
    const l = computeLayout(taille, ciel('bas'), false)
    expect(l.chrome).toEqual({ x: 0, y: 744, width: 1280, height: 56 })
    expect(l.page).toEqual({ x: 0, y: 0, width: 1280, height: 744 })
  })
  it('masqué : rail de 14 px', () => {
    expect(computeLayout(taille, ciel('gauche', true), false).page).toEqual({ x: 14, y: 0, width: 1266, height: 800 })
    expect(computeLayout(taille, ciel('droite', true), false).chrome).toEqual({ x: 1266, y: 0, width: 14, height: 800 })
    expect(computeLayout(taille, ciel('haut', true), false).page).toEqual({ x: 0, y: 14, width: 1280, height: 786 })
    expect(computeLayout(taille, ciel('bas', true), false).chrome).toEqual({ x: 0, y: 786, width: 1280, height: 14 })
  })
  it('largeur personnalisée', () => {
    expect(computeLayout(taille, ciel('gauche', false, 300), false).page.x).toBe(300)
  })
  it('plein écran', () => {
    const l = computeLayout(taille, ciel('gauche'), true)
    expect(l.chrome).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(l.page).toEqual(fenetre)
    expect(l.overlay).toEqual(fenetre)
  })
  it('petite fenêtre : jamais de taille négative', () => {
    const l = computeLayout({ width: 100, height: 50 }, ciel('gauche'), false)
    expect(l.page.width).toBe(0)
    expect(l.chrome.width).toBe(100)
    expect(l.page.height).toBe(4)
  })
})
