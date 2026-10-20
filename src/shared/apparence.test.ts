import { describe, expect, it } from 'vitest'
import { COINS, DENSITES_PX, PASTILLES_CIEL, PASTILLES_ETOILE, POLICES, pastilleActive, tailleTexteCss, variablesApparence } from './apparence'

describe('apparence', () => {
  it('pastilles de l’étoile active : hex du design', () => {
    expect(PASTILLES_ETOILE.map((p) => [p.libelle, p.hex])).toEqual([
      ['Or', '#F4C56A'], ['Menthe', '#5FD3B3'], ['Bleu Véga', '#9FC8FF'], ['Rose', '#F08FB0'], ['Blanc', '#FFFFFF']
    ])
  })
  it('pastilles du ciel : hex du design', () => {
    expect(PASTILLES_CIEL.map((p) => [p.libelle, p.hex])).toEqual([
      ['Indigo nuit', '#15152E'], ['Noir', '#0B0B12'], ['Ardoise', '#22262E'], ['Forêt', '#12261F']
    ])
  })
  it('pastille active : comparaison sans casse, aucune pour une autre couleur', () => {
    expect(pastilleActive(PASTILLES_ETOILE, '#5fd3b3')?.libelle).toBe('Menthe')
    expect(pastilleActive(PASTILLES_ETOILE, '#123456')).toBeNull()
  })
  it('taille → --taille-texte : bornée à 11-17 px, entière', () => {
    expect(tailleTexteCss(13)).toBe('13px')
    expect(tailleTexteCss(5)).toBe('11px')
    expect(tailleTexteCss(40)).toBe('17px')
    expect(tailleTexteCss(14.6)).toBe('15px')
    expect(tailleTexteCss(Number.NaN)).toBe('13px')
  })
  it('variables par défaut = valeurs historiques de theme.css', () => {
    const v = variablesApparence({ police: 'Manrope', tailleTexte: 13, densite: 'confortable', coinsArrondis: true })
    expect(v['--taille-texte']).toBe('13px')
    expect(v['--densite']).toBe('32px')
    expect(v['--coins']).toBe('12px 0 0 12px')
    expect(v['--police']).toBe("'Manrope', system-ui, sans-serif")
  })
  it('compacte : lignes plus basses ; coins carrés', () => {
    const v = variablesApparence({ police: 'Manrope', tailleTexte: 13, densite: 'compacte', coinsArrondis: false })
    expect(v['--densite']).toBe(DENSITES_PX.compacte + 'px')
    expect(DENSITES_PX.compacte).toBeLessThan(DENSITES_PX.confortable)
    expect(v['--coins']).toBe('0')
    expect(COINS.arrondis).toBe('12px 0 0 12px')
  })
  it('police inconnue : retombe sur Manrope, rien de la valeur n’est injecté', () => {
    const v = variablesApparence({ police: 'x; background:red', tailleTexte: 13, densite: 'confortable', coinsArrondis: true })
    expect(v['--police']).toBe(POLICES[0].css)
    expect(variablesApparence({ police: 'Georgia', tailleTexte: 13, densite: 'confortable', coinsArrondis: true })['--police']).toContain('Georgia')
  })
})
