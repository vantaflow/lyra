import { describe, expect, it } from 'vitest'
import { sourcesDeSuggestions, suggestionsDuProfilAutorisees } from './prive'

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

describe('sourcesDeSuggestions', () => {
  const tout = { suggestionsHistorique: true, suggestionsFavoris: true, suggestionsEnPrivee: false }
  it('fenêtre normale : l’historique et les favoris selon leurs interrupteurs', () => {
    expect(sourcesDeSuggestions(false, tout)).toEqual({ historique: true, favoris: true })
    expect(sourcesDeSuggestions(false, { ...tout, suggestionsHistorique: false })).toEqual({ historique: false, favoris: true })
    expect(sourcesDeSuggestions(false, { ...tout, suggestionsFavoris: false })).toEqual({ historique: true, favoris: false })
    expect(sourcesDeSuggestions(false, { ...tout, suggestionsHistorique: false, suggestionsFavoris: false })).toEqual({ historique: false, favoris: false })
  })
  it('fenêtre privée : rien sans « suggestions en fenêtre privée », sinon les mêmes interrupteurs', () => {
    expect(sourcesDeSuggestions(true, tout)).toEqual({ historique: false, favoris: false })
    expect(sourcesDeSuggestions(true, { ...tout, suggestionsEnPrivee: true })).toEqual({ historique: true, favoris: true })
    expect(sourcesDeSuggestions(true, { ...tout, suggestionsEnPrivee: true, suggestionsFavoris: false })).toEqual({ historique: true, favoris: false })
  })
})
