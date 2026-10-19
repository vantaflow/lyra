import { describe, it, expect } from 'vitest'
import { validerPatch, validerSettings } from './validate'
import { reglagesParDefaut } from './defaults'

const defauts = reglagesParDefaut('/dl')

describe('validerPatch', () => {
  it('garde les valeurs valides', () => {
    expect(validerPatch({ theme: 'sombre', ciel: { position: 'haut', largeur: 300 } })).toEqual({
      theme: 'sombre',
      ciel: { position: 'haut', largeur: 300 }
    })
  })

  it('rejette types et énumérations invalides', () => {
    expect(validerPatch({ theme: 42 })).toEqual({})
    expect(validerPatch({ theme: 'rose' })).toEqual({})
    expect(validerPatch({ ciel: { position: 'diagonale', masque: 'oui' } })).toEqual({})
    expect(validerPatch({ boucliers: { niveau: 'agressif', genes: 1 } })).toEqual({})
    expect(validerPatch({ moteurChoisi: 'true' })).toEqual({})
  })

  it('borne les nombres', () => {
    expect(validerPatch({ ciel: { largeur: 1e9 } })).toEqual({})
    expect(validerPatch({ ciel: { largeur: -5 } })).toEqual({})
    expect(validerPatch({ ciel: { largeur: NaN } })).toEqual({})
    expect(validerPatch({ boucliers: { majHeures: 0 } })).toEqual({})
  })

  it('ignore version et clés inconnues', () => {
    expect(validerPatch({ version: 2, inconnue: 1, ciel: { autre: 1 } })).toEqual({})
  })

  it('ignore __proto__, constructor, prototype', () => {
    const brut = JSON.parse('{"__proto__":{"polluee":true},"constructor":{"x":1},"prototype":{"y":1},"theme":"clair"}')
    expect(validerPatch(brut)).toEqual({ theme: 'clair' })
    expect(({} as Record<string, unknown>).polluee).toBeUndefined()
  })

  it('valide les règles de site', () => {
    expect(
      validerPatch({
        sites: {
          'https://www.youtube.com': { boucliers: false },
          'file://': { boucliers: false },
          'http://[::1]:8080': { boucliers: true },
          'javascript:alert(1)': { boucliers: false },
          'https://a.fr/chemin': { boucliers: false },
          'https://b.fr': { boucliers: 'non' },
          'https://c.fr': 'x'
        }
      })
    ).toEqual({
      sites: {
        'https://www.youtube.com': { boucliers: false },
        'file://': { boucliers: false },
        'http://[::1]:8080': { boucliers: true }
      }
    })
    expect(validerPatch({ sites: JSON.parse('{"__proto__":{"boucliers":false}}') })).toEqual({})
    expect(validerPatch({ sites: [] })).toEqual({})
  })

  it('valide permissions et zoom par site', () => {
    expect(
      validerPatch({
        sites: {
          'https://a.fr': { permissions: { camera: 'autoriser', micro: 'peut-etre', inconnue: 'autoriser' }, zoom: 1.25 },
          'https://b.fr': { zoom: 9 },
          'https://c.fr': { permissions: { notifications: 'refuser' } }
        }
      })
    ).toEqual({
      sites: {
        'https://a.fr': { permissions: { camera: 'autoriser' }, zoom: 1.25 },
        'https://c.fr': { permissions: { notifications: 'refuser' } }
      }
    })
  })

  it('entrée non objet : patch vide', () => {
    expect(validerPatch(null)).toEqual({})
    expect(validerPatch('x')).toEqual({})
    expect(validerPatch([1])).toEqual({})
  })
})

describe('validerSettings', () => {
  it('JSON de mauvaise forme : défauts', () => {
    expect(validerSettings('x', defauts)).toEqual(defauts)
    expect(validerSettings({ theme: 42, version: 9, zzz: 1 }, defauts)).toEqual(defauts)
  })

  it('fusionne les champs valides sur les défauts', () => {
    const s = validerSettings({ theme: 'clair', ciel: { largeur: 300 } }, defauts)
    expect(s.theme).toBe('clair')
    expect(s.ciel).toEqual({ ...defauts.ciel, largeur: 300 })
  })
})
