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
  it('droite : miroir, la capsule au-dessus de la page', () => {
    const l = computeLayout(taille, ciel('droite'), false)
    expect(l.chrome).toEqual(fenetre)
    expect(l.page).toEqual({ x: 0, y: 46, width: 1008, height: 754 })
    expect(l.overlay).toEqual(fenetre)
  })
  it('haut : bande de 56 px, la capsule sous la bande', () => {
    const l = computeLayout(taille, ciel('haut'), false)
    expect(l.chrome).toEqual(fenetre)
    expect(l.page).toEqual({ x: 0, y: 102, width: 1280, height: 698 })
  })
  it('bas : capsule en haut, bande de 56 px en bas', () => {
    const l = computeLayout(taille, ciel('bas'), false)
    expect(l.chrome).toEqual(fenetre)
    expect(l.page).toEqual({ x: 0, y: 46, width: 1280, height: 698 })
  })
  it('masqué : rail de 14 px sur le bord, capsule conservée, pour chaque position', () => {
    expect(computeLayout(taille, ciel('gauche', true), false).page).toEqual({ x: 14, y: 46, width: 1266, height: 754 })
    expect(computeLayout(taille, ciel('droite', true), false).page).toEqual({ x: 0, y: 46, width: 1266, height: 754 })
    expect(computeLayout(taille, ciel('haut', true), false).page).toEqual({ x: 0, y: 60, width: 1280, height: 740 })
    expect(computeLayout(taille, ciel('bas', true), false).page).toEqual({ x: 0, y: 46, width: 1280, height: 740 })
    for (const p of ['gauche', 'droite', 'haut', 'bas'] as const) {
      expect(computeLayout(taille, ciel(p, true), false).chrome).toEqual(fenetre)
    }
  })
  it('masqué et révélé : aucun bounds ne change (seul l’ordre des vues change), pour chaque position', () => {
    for (const p of ['gauche', 'droite', 'haut', 'bas'] as const) {
      expect(computeLayout(taille, ciel(p, true), false, true)).toEqual(computeLayout(taille, ciel(p, true), false))
    }
    expect(computeLayout(taille, ciel('droite', true), false, true).page).toEqual({ x: 0, y: 46, width: 1266, height: 754 })
  })
  it('révélé sans être masqué, ou en plein écran : sans effet', () => {
    for (const p of ['gauche', 'droite', 'haut', 'bas'] as const) {
      expect(computeLayout(taille, ciel(p), false, true)).toEqual(computeLayout(taille, ciel(p), false))
    }
    expect(computeLayout(taille, ciel('gauche', true), true, true)).toEqual(computeLayout(taille, ciel('gauche', true), true))
  })
  it('largeur personnalisée, bornée à 200-420 (gauche et droite) ; sans effet en haut et en bas', () => {
    expect(computeLayout(taille, ciel('gauche', false, 300), false).page.x).toBe(300)
    expect(computeLayout(taille, ciel('droite', false, 300), false).page.width).toBe(980)
    expect(computeLayout(taille, ciel('gauche', false, 100), false).page.x).toBe(200)
    expect(computeLayout(taille, ciel('droite', false, 900), false).page.width).toBe(860)
    expect(computeLayout(taille, ciel('haut', false, 300), false).page.y).toBe(102)
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
