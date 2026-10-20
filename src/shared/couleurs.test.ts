import { describe, it, expect } from 'vitest'
import { PALETTE_CONSTELLATIONS } from './couleurs'

describe('PALETTE_CONSTELLATIONS', () => {
  it('les 9 teintes du thème Indigo nuit', () => {
    expect(PALETTE_CONSTELLATIONS).toEqual([
      '#F4C56A', '#5B8DEF', '#E0604F', '#3FB187', '#D86BA8', '#9B7BEF', '#3FB6C6', '#F09A4E', '#8A8AB0'
    ])
  })
})
