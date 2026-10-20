import { describe, expect, it } from 'vitest'
import { routeDepuisHash, SECTIONS } from './sections'

describe('SECTIONS', () => {
  it("compte les 17 entrées (Général et Labo retirés : plus rien d'actif), dans leur ordre", () => {
    expect(SECTIONS.map((s) => s.libelle)).toEqual([
      "Le ciel et l'apparence",
      'Couleurs et thèmes',
      'Palette et recherche',
      'Boucliers',
      'Règles par site',
      'Extensions',
      'Confidentialité',
      'Téléchargements',
      'Raccourcis clavier',
      'Gestes et souris',
      'Ne pas déranger',
      'Démarrage et sessions',
      'Styles et scripts',
      'Réseau et identité',
      'Importer et exporter',
      'Sauvegarde et profils',
      'À propos'
    ])
  })
  it('a des ids uniques et une route par entrée', () => {
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(17)
    for (const s of SECTIONS) expect(s.route).toBe(`#/${s.id}`)
  })
})

describe('routeDepuisHash', () => {
  it('lit le hash', () => {
    expect(routeDepuisHash('#/apparence', 'settings')).toBe('apparence')
    expect(routeDepuisHash('#/reseau/autre', 'settings')).toBe('reseau')
  })
  it('garde Historique, Favoris et Téléchargements, hors sommaire', () => {
    expect(routeDepuisHash('#/historique', 'settings')).toBe('historique')
    expect(routeDepuisHash('', 'history')).toBe('historique')
    expect(routeDepuisHash('', 'bookmarks')).toBe('favoris')
    expect(routeDepuisHash('', 'downloads')).toBe('telechargements')
    expect(routeDepuisHash('', 'shields')).toBe('boucliers')
    expect(SECTIONS.some((s) => s.id === 'historique' || s.id === 'favoris')).toBe(false)
  })
  it('retombe sur la première section pour une route inconnue ou supprimée', () => {
    const premiere = SECTIONS[0].id
    expect(routeDepuisHash('#/nimportequoi', 'settings')).toBe(premiere)
    expect(routeDepuisHash('#/general', 'settings')).toBe(premiere)
    expect(routeDepuisHash('#/labo', 'settings')).toBe(premiere)
    expect(routeDepuisHash('', 'settings')).toBe(premiere)
  })
  it("n'a plus de section Général ni Labo", () => {
    expect(SECTIONS.some((s) => s.id === 'general' || s.id === 'labo')).toBe(false)
  })
})
