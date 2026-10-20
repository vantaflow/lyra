import { describe, it, expect } from 'vitest'
import { DELAI_RETRAIT_MS, sortieVersPage } from './retrait'

const fenetre = { largeur: 1280, hauteur: 800 }
// Boîtes de mise en page (sans la translation du glissement) du ciel révélé, rail compris.
const gauche = { x: 0, y: 0, largeur: 286, hauteur: 800 }
const droite = { x: 1280 - 286, y: 0, largeur: 286, hauteur: 800 }
const haut = { x: 0, y: 0, largeur: 1280, hauteur: 56 }
const bas = { x: 0, y: 800 - 56, largeur: 1280, hauteur: 56 }

describe('sortieVersPage : seul un départ vers la page retire le ciel révélé', () => {
  it('ciel à gauche : sortie par la droite (vers la page) seulement', () => {
    expect(sortieVersPage('gauche', gauche, { x: 286, y: 400 }, fenetre)).toBe(true)
    expect(sortieVersPage('gauche', gauche, { x: 600, y: 20 }, fenetre)).toBe(true)
    // Par le haut de la fenêtre, en visant « Épingler le ciel » (coin haut droit du ciel).
    expect(sortieVersPage('gauche', gauche, { x: 260, y: -1 }, fenetre)).toBe(false)
    expect(sortieVersPage('gauche', gauche, { x: 260, y: 0 }, fenetre)).toBe(false)
    // Par le bas et par la gauche de la fenêtre.
    expect(sortieVersPage('gauche', gauche, { x: 100, y: 800 }, fenetre)).toBe(false)
    expect(sortieVersPage('gauche', gauche, { x: -1, y: 400 }, fenetre)).toBe(false)
  })
  it('vers une zone non cliente posée sur le ciel (le point de sortie reste dans le ciel) : pas de retrait', () => {
    expect(sortieVersPage('gauche', gauche, { x: 270, y: 4 }, fenetre)).toBe(false)
    expect(sortieVersPage('droite', droite, { x: 1250, y: 10 }, fenetre)).toBe(false)
    expect(sortieVersPage('haut', haut, { x: 1200, y: 10 }, fenetre)).toBe(false)
  })
  it('ciel à droite : sortie par la gauche seulement', () => {
    expect(sortieVersPage('droite', droite, { x: 993, y: 400 }, fenetre)).toBe(true)
    expect(sortieVersPage('droite', droite, { x: 1100, y: -1 }, fenetre)).toBe(false)
    expect(sortieVersPage('droite', droite, { x: 1280, y: 400 }, fenetre)).toBe(false)
  })
  it('bande en haut : sortie par le bas seulement', () => {
    expect(sortieVersPage('haut', haut, { x: 640, y: 56 }, fenetre)).toBe(true)
    expect(sortieVersPage('haut', haut, { x: 1270, y: -1 }, fenetre)).toBe(false)
    expect(sortieVersPage('haut', haut, { x: -1, y: 30 }, fenetre)).toBe(false)
    expect(sortieVersPage('haut', haut, { x: 1280, y: 30 }, fenetre)).toBe(false)
  })
  it('bande en bas : sortie par le haut seulement', () => {
    expect(sortieVersPage('bas', bas, { x: 640, y: 743 }, fenetre)).toBe(true)
    expect(sortieVersPage('bas', bas, { x: 640, y: 800 }, fenetre)).toBe(false)
    expect(sortieVersPage('bas', bas, { x: 1280, y: 770 }, fenetre)).toBe(false)
  })
  it('hors de la fenêtre, même du côté de la page : pas de retrait', () => {
    expect(sortieVersPage('haut', haut, { x: 1300, y: 60 }, fenetre)).toBe(false)
    expect(sortieVersPage('gauche', gauche, { x: 400, y: -3 }, fenetre)).toBe(false)
  })
})

describe('délai de retrait', () => {
  it('500 ms : le temps de viser un bouton sans que le ciel file', () => {
    expect(DELAI_RETRAIT_MS).toBe(500)
  })
})
