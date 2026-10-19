import { describe, it, expect } from 'vitest'
import { estCodeBlocage, estEchecPasserelle } from './blocage'

describe('codes', () => {
  it('blocage réseau typique', () => {
    for (const c of [-105, -101, -102, -118, -7, -22, -109]) expect(estCodeBlocage(c)).toBe(true)
    for (const c of [-3, -6, -200, -202, 0, 404, -130]) expect(estCodeBlocage(c)).toBe(false)
  })
  it('échec de passerelle', () => {
    for (const c of [-130, -111, -120, -118, -7]) expect(estEchecPasserelle(c)).toBe(true)
    for (const c of [-105, -102, -200, 0]) expect(estEchecPasserelle(c)).toBe(false)
  })
})
