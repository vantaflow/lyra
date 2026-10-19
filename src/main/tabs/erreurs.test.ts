import { describe, expect, it } from 'vitest'
import { estUrlErreur, typeErreur, urlErreur, urlOriginale } from './erreurs'

describe('erreurs', () => {
  it('classe les codes réseau', () => {
    expect(typeErreur(-105)).toBe('introuvable')
    expect(typeErreur(-6)).toBe('introuvable')
    expect(typeErreur(-102)).toBe('reseau')
    expect(typeErreur(-7)).toBe('reseau')
    expect(typeErreur(-202)).toBe('certificat')
    expect(typeErreur(-201)).toBe('certificat')
  })
  it("l'adresse d'origine survit à l'aller-retour", () => {
    const u = 'https://exemple.fr/a?b=1&c=é#x'
    const e = urlErreur('reseau', u)
    expect(estUrlErreur(e)).toBe(true)
    expect(urlOriginale(e)).toBe(u)
  })
  it("une adresse ordinaire n'est pas modifiée", () => {
    expect(urlOriginale('https://exemple.fr/')).toBe('https://exemple.fr/')
    expect(estUrlErreur('lyra://newtab')).toBe(false)
  })
})
