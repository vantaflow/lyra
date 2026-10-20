import { describe, expect, it } from 'vitest'
import { filtrerSections, routeDepuisHash, SECTIONS } from './sections'

describe('SECTIONS', () => {
  it('compte les 19 entrées du design, dans leur ordre', () => {
    expect(SECTIONS.map((s) => s.libelle)).toEqual([
      'Général',
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
      'Labo',
      'À propos'
    ])
  })
  it('a des ids uniques et une route par entrée', () => {
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(19)
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
    expect(SECTIONS.some((s) => s.id === 'historique' || s.id === 'favoris')).toBe(false)
  })
  it('retombe sur Général pour une route inconnue', () => {
    expect(routeDepuisHash('#/nimportequoi', 'settings')).toBe('general')
    expect(routeDepuisHash('', 'settings')).toBe('general')
  })
})

describe('filtrerSections', () => {
  it('rend tout sans recherche', () => {
    expect(filtrerSections('  ')).toHaveLength(19)
  })
  it('cherche dans le libellé et les mots-clés, sans accents ni casse', () => {
    expect(filtrerSections('ciel').map((s) => s.id)).toContain('apparence')
    expect(filtrerSections('SILENCE').map((s) => s.id)).toContain('nepasderanger')
    expect(filtrerSections('zzzz')).toEqual([])
  })
})
