import { describe, expect, it } from 'vitest'
import { adresseAccueilValide, NOUVEL_ONGLET, normaliserAccueil, pageDeDemarrage, restaurerSession, urlNouvelleFenetre } from './accueil'

describe('pageDeDemarrage', () => {
  it("page d'accueil vide : le nouvel onglet", () => {
    expect(pageDeDemarrage('')).toBe(NOUVEL_ONGLET)
    expect(pageDeDemarrage('   ')).toBe(NOUVEL_ONGLET)
  })
  it('adresse web ou lyra:// : utilisée telle quelle', () => {
    expect(pageDeDemarrage('https://exemple.fr/')).toBe('https://exemple.fr/')
    expect(pageDeDemarrage('http://exemple.fr')).toBe('http://exemple.fr')
    expect(pageDeDemarrage('lyra://history')).toBe('lyra://history')
  })
  it('javascript:, file:, data: et le reste : le nouvel onglet', () => {
    for (const u of ['javascript:alert(1)', 'JavaScript:alert(1)', 'file:///etc/passwd', 'data:text/html,<b>x</b>', 'vbscript:x', 'exemple.fr', 'ftp://exemple.fr']) {
      expect(pageDeDemarrage(u), u).toBe(NOUVEL_ONGLET)
    }
  })
})

describe('restaurerSession', () => {
  it('la session sauvegardée est reprise seulement si « restaurer » est coché', () => {
    const session = { version: 1 as const, fenetres: [] }
    expect(restaurerSession(true, session)).toBe(session)
    expect(restaurerSession(false, session)).toBeNull()
    expect(restaurerSession(true, null)).toBeNull()
  })
})

describe('adresseAccueilValide', () => {
  it('vide, http(s) ou lyra:// sans espace ni caractère de contrôle', () => {
    expect(adresseAccueilValide('')).toBe(true)
    expect(adresseAccueilValide('https://exemple.fr/a?b=1')).toBe(true)
    expect(adresseAccueilValide('lyra://newtab')).toBe(true)
    expect(adresseAccueilValide('https://exemple.fr/a b')).toBe(false)
    expect(adresseAccueilValide('https://exemple.fr/\n')).toBe(false)
    expect(adresseAccueilValide('javascript:alert(1)')).toBe(false)
    expect(adresseAccueilValide('file:///tmp/x.html')).toBe(false)
  })
})

describe('normaliserAccueil', () => {
  it('ajoute https:// à une adresse sans schéma', () => {
    expect(normaliserAccueil('exemple.fr')).toBe('https://exemple.fr')
    expect(normaliserAccueil('  exemple.fr/accueil ')).toBe('https://exemple.fr/accueil')
  })
  it('garde une adresse web ou lyra:// et accepte le vide', () => {
    expect(normaliserAccueil('http://exemple.fr')).toBe('http://exemple.fr')
    expect(normaliserAccueil('lyra://history')).toBe('lyra://history')
    expect(normaliserAccueil('')).toBe('')
  })
  it('refuse javascript:, file: et les adresses mal formées', () => {
    for (const u of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'a b', 'exemple fr']) {
      expect(normaliserAccueil(u), u).toBeNull()
    }
  })
})

describe('urlNouvelleFenetre', () => {
  it("« vide » : toujours le nouvel onglet, même avec une page d'accueil", () => {
    expect(urlNouvelleFenetre('vide', 'https://exemple.fr/')).toBe(NOUVEL_ONGLET)
    expect(urlNouvelleFenetre('vide', '')).toBe(NOUVEL_ONGLET)
  })
  it("« accueil » : la page d'accueil si elle est valable", () => {
    expect(urlNouvelleFenetre('accueil', 'https://exemple.fr/')).toBe('https://exemple.fr/')
    expect(urlNouvelleFenetre('accueil', 'lyra://history')).toBe('lyra://history')
  })
  it("« accueil » : repli sur le nouvel onglet si la page est vide ou invalide", () => {
    for (const u of ['', '   ', 'javascript:alert(1)', 'file:///etc/passwd', 'exemple.fr']) expect(urlNouvelleFenetre('accueil', u), u).toBe(NOUVEL_ONGLET)
  })
})
