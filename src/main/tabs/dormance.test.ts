import { describe, it, expect } from 'vitest'
import { peutEndormir, type EtatDormance } from './dormance'

const base: EtatDormance = { active: false, epinglee: false, audible: false, chargement: false, dormante: false }

describe('peutEndormir', () => {
  it('une étoile inactive, silencieuse et chargée peut dormir', () => {
    expect(peutEndormir(base)).toBe(true)
  })
  it.each([
    ['active', { active: true }],
    ['épinglée', { epinglee: true }],
    ['audible', { audible: true }],
    ['en chargement', { chargement: true }],
    ['déjà dormante', { dormante: true }]
  ])('jamais si %s', (_n, patch) => {
    expect(peutEndormir({ ...base, ...patch })).toBe(false)
  })
})
