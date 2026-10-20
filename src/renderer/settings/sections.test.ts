import { describe, it, expect } from 'vitest'
import { MESSAGE_SECTION_A_VENIR, SECTIONS, routeDepuisHash, sectionDe, sectionsVisibles } from './sections'

describe('sommaire des réglages', () => {
  it('ne montre que les sections qui ont un contenu dans cette version', () => {
    expect(sectionsVisibles().map((s) => s.id)).toEqual(['general', 'extensions', 'telechargements', 'reseau', 'importer', 'historique', 'favoris', 'apropos'])
  })

  it('garde les sections à venir dans la liste centrale (le jalon D les réactive)', () => {
    expect(SECTIONS.some((s) => s.id === 'couleurs' && !s.disponible)).toBe(true)
    expect(sectionDe('couleurs')?.titre).toBe('Couleurs et thèmes')
    expect(MESSAGE_SECTION_A_VENIR).toBe('Cette section arrive dans la prochaine version de Lyra.')
  })

  it('route : hash, puis hôte lyra://, puis général', () => {
    expect(routeDepuisHash('#/reseau', 'settings')).toBe('reseau')
    expect(routeDepuisHash('', 'history')).toBe('historique')
    expect(routeDepuisHash('', 'settings')).toBe('general')
  })
})
