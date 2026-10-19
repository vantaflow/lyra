import { describe, it, expect } from 'vitest'
import { marges, placement, epaisseurCiel } from './placements'

const ciel = (position: 'gauche' | 'droite' | 'haut' | 'bas', masque = false, largeur = 272) => ({ position, largeur, masque })

describe('marges (carte de permission)', () => {
  it('quatre positions', () => {
    expect(marges(ciel('gauche'))).toEqual({ left: '272px', right: '0', top: '52px' })
    expect(marges(ciel('droite'))).toEqual({ left: '0', right: '272px', top: '52px' })
    expect(marges(ciel('haut'))).toEqual({ left: '0', right: '0', top: '108px' })
    expect(marges(ciel('bas'))).toEqual({ left: '0', right: '0', top: '52px' })
  })
  it('masqué : le rail de 14 px', () => {
    expect(marges(ciel('gauche', true))).toEqual({ left: '14px', right: '0', top: '52px' })
    expect(marges(ciel('droite', true))).toEqual({ left: '0', right: '14px', top: '52px' })
    expect(marges(ciel('haut', true))).toEqual({ left: '0', right: '0', top: '66px' })
    expect(marges(ciel('bas', true))).toEqual({ left: '0', right: '0', top: '52px' })
  })
  it('largeur bornée ; réglages pas encore chargés', () => {
    expect(marges(ciel('gauche', false, 900)).left).toBe('420px')
    expect(marges(undefined)).toEqual({ left: '0', right: '0', top: '52px' })
    expect(epaisseurCiel(ciel('bas', false, 300))).toBe(56)
  })
})

describe('placement (panneaux Boucliers et Téléchargements)', () => {
  it('colonne : au pied du ciel', () => {
    expect(placement(ciel('gauche'))).toEqual({ left: '12px', bottom: '56px' })
    expect(placement(ciel('droite'))).toEqual({ right: '12px', bottom: '56px' })
  })
  it('bande : à droite, sous la bande en haut, au-dessus en bas', () => {
    expect(placement(ciel('haut'))).toEqual({ right: '12px', top: '64px' })
    expect(placement(ciel('bas'))).toEqual({ right: '12px', bottom: '64px' })
  })
})
