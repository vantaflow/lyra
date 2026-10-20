import { describe, expect, it } from 'vitest'
import { suggestionsDuProfilAutorisees } from './prive'

describe('suggestionsDuProfilAutorisees', () => {
  it('fenêtre normale : toujours', () => {
    expect(suggestionsDuProfilAutorisees(false, { suggestionsEnPrivee: false })).toBe(true)
    expect(suggestionsDuProfilAutorisees(false, { suggestionsEnPrivee: true })).toBe(true)
  })
  it("fenêtre privée : seulement si « suggestions en fenêtre privée » est activé (défaut : non)", () => {
    expect(suggestionsDuProfilAutorisees(true, { suggestionsEnPrivee: false })).toBe(false)
    expect(suggestionsDuProfilAutorisees(true, { suggestionsEnPrivee: true })).toBe(true)
  })
})
