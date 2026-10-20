import { describe, expect, it } from 'vitest'
import { COULEURS_INDIGO_NUIT, CLES_COULEUR, type CouleursTheme } from './types-reglages'
import { PAIRES, SEUIL, corriger, corrigerPalette, rapport, verifier } from './contraste'

describe('rapport (WCAG 2.x)', () => {
  it('noir sur blanc = 21, identique = 1', () => {
    expect(rapport('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(rapport('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
    expect(rapport('#777777', '#777777')).toBeCloseTo(1, 5)
  })
  it('valeur connue : #767676 sur blanc ≈ 4,54', () => {
    expect(rapport('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2)
  })
})

describe('corriger', () => {
  it('éclaircit le texte jusqu’au seuil sur un fond sombre', () => {
    const c = corriger('#3B3B70', '#15152E', 4.5)
    expect(rapport(c, '#15152E')).toBeGreaterThanOrEqual(4.5)
    expect(c).toMatch(/^#[0-9A-F]{6}$/)
  })
  it('assombrit le texte jusqu’au seuil sur un fond clair', () => {
    const c = corriger('#C9C9EA', '#E9DEC8', 4.5)
    expect(rapport(c, '#E9DEC8')).toBeGreaterThanOrEqual(4.5)
  })
  it('laisse intacte une paire déjà valide', () => {
    expect(corriger('#1C1C2E', '#FFFFFF', 4.5)).toBe('#1C1C2E')
  })
  it('garde la teinte (rouge reste rouge) et ne va pas plus loin que nécessaire', () => {
    const c = corriger('#FF8080', '#FFFFFF', 4.5)
    expect(rapport(c, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(rapport(c, '#FFFFFF')).toBeLessThan(4.8)
    expect(parseInt(c.slice(1, 3), 16)).toBeGreaterThan(parseInt(c.slice(3, 5), 16))
  })
  it('atteint le seuil même quand les deux sens sont possibles (fond moyen)', () => {
    const c = corriger('#808080', '#7A7A7A', 4.5)
    expect(rapport(c, '#7A7A7A')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('PAIRES et verifier', () => {
  it('les six paires de la décision C, toutes à 4,5:1', () => {
    expect(PAIRES.map((p) => `${p.texte}/${p.fond}`)).toEqual([
      'ciel-texte/ciel-fond', 'etoiles/ciel-fond', 'etoile-active/etoile-active-fond',
      'capsule-texte/capsule-fond', 'accent/pages-fond', 'boucliers/pages-fond'
    ])
    expect(SEUIL).toBe(4.5)
  })
  it('verifier renvoie rapport et ok pour chaque paire', () => {
    const r = verifier(COULEURS_INDIGO_NUIT, 'sombre')
    expect(r).toHaveLength(6)
    for (const v of r) expect(v.ok).toBe(v.rapport >= SEUIL)
  })
})

describe('corrigerPalette', () => {
  const mauvaise: CouleursTheme = JSON.parse(JSON.stringify(COULEURS_INDIGO_NUIT))
  mauvaise['ciel-texte'].clair = '#3B3B70'
  mauvaise.boucliers.clair = '#7FD3B3'

  it('ajuste chaque texte sous 4,5:1 et liste les ajustements', () => {
    const { couleurs, ajustements } = corrigerPalette(mauvaise, 'clair')
    for (const v of verifier(couleurs, 'clair')) expect(v.ok).toBe(true)
    const cles = ajustements.map((a) => a.cle)
    expect(cles).toContain('ciel-texte')
    expect(cles).toContain('boucliers')
    const a = ajustements.find((x) => x.cle === 'ciel-texte')!
    expect(a.avant).toBe('#3B3B70')
    expect(a.apres).toBe(couleurs['ciel-texte'].clair)
    expect(a.ratioAvant).toBeLessThan(4.5)
    expect(a.ratioApres).toBeGreaterThanOrEqual(4.5)
  })
  it('ne modifie ni l’entrée ni l’autre mode ni les éléments non textes', () => {
    const copie = JSON.parse(JSON.stringify(mauvaise))
    const { couleurs } = corrigerPalette(mauvaise, 'clair')
    expect(mauvaise).toEqual(copie)
    for (const cle of CLES_COULEUR) expect(couleurs[cle].sombre).toBe(mauvaise[cle].sombre)
    expect(couleurs['ciel-fond']).toEqual(mauvaise['ciel-fond'])
  })
  it('une palette valide ne produit aucun ajustement', () => {
    const ok = corrigerPalette(COULEURS_INDIGO_NUIT, 'sombre')
    expect(ok.ajustements).toEqual([])
    expect(ok.couleurs).toEqual(COULEURS_INDIGO_NUIT)
  })
})
