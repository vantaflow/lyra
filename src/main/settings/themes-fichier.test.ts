import { describe, expect, it, vi } from 'vitest'
import { COULEURS_INDIGO_NUIT } from '../../shared/types-reglages'
import { THEMES, exporterTheme } from '../../shared/themes'
import { contenuExport, importerTheme } from './themes-fichier'

describe('import d\'un thème', () => {
  it('applique un thème valide comme « Mes couleurs »', () => {
    const reglages = { setSettings: vi.fn() }
    const r = importerTheme(exporterTheme('Crépuscule', THEMES.foret.couleurs), reglages)
    expect(r).toEqual({ nom: 'Crépuscule' })
    expect(reglages.setSettings).toHaveBeenCalledWith({ couleurs: { actif: 'mes-couleurs', personnalisees: THEMES.foret.couleurs, reference: THEMES.foret.couleurs } })
  })
  it('refuse un thème invalide avec un message, sans rien écrire', () => {
    const reglages = { setSettings: vi.fn() }
    const r = importerTheme('{ "nom": "x", "couleurs": { "accent": { "clair": "rouge", "sombre": "#000000" } } }', reglages)
    expect(r).toHaveProperty('erreur')
    expect((r as { erreur: string }).erreur.length).toBeGreaterThan(5)
    expect(importerTheme('pas du json', reglages)).toHaveProperty('erreur')
    expect(reglages.setSettings).not.toHaveBeenCalled()
  })
})

describe('export de « Mes couleurs »', () => {
  it('écrit { nom, couleurs }, Indigo nuit à défaut, et se réimporte', () => {
    const json = JSON.parse(contenuExport(null))
    expect(Object.keys(json)).toEqual(['nom', 'couleurs'])
    expect(json.nom).toBe('Mes couleurs')
    expect(json.couleurs).toEqual(COULEURS_INDIGO_NUIT)
    const perso = { ...structuredClone(COULEURS_INDIGO_NUIT), accent: { clair: '#010203', sombre: '#040506' } }
    expect(JSON.parse(contenuExport(perso)).couleurs.accent).toEqual({ clair: '#010203', sombre: '#040506' })
    const reglages = { setSettings: vi.fn() }
    expect(importerTheme(contenuExport(perso), reglages)).toEqual({ nom: 'Mes couleurs' })
  })
})
