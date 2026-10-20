import { describe, it, expect } from 'vitest'
import { declarationsApparence, themeInitial } from './initial'
import { reglagesParDefaut } from '../settings/defaults'

const t = { mode: 'clair', variables: { '--ciel': '#111111' }, privee: { '--ciel': '#2a1540' } }
const defauts = reglagesParDefaut('/dl').apparence

describe('themeInitial', () => {
  it('porte l\'apparence avec le thème : la police de l\'overlay est connue avant le premier rendu', () => {
    const r = themeInitial(t, false, { ...defauts, police: 'Georgia', tailleTexte: 15 })
    expect(r.variables).toEqual(t.variables)
    expect(r.apparence['--police']).toBe('Georgia, serif')
    expect(r.apparence['--taille-texte']).toBe('15px')
  })
  it('fenêtre privée : variables privées, même apparence', () => {
    expect(themeInitial(t, true, defauts).variables).toEqual(t.privee)
  })
  it('déclarations CSS', () => {
    const d = declarationsApparence(themeInitial(t, false, { ...defauts, coinsArrondis: false }).apparence)
    expect(d).toContain("--police:'Manrope', system-ui, sans-serif")
    expect(d).toContain('--coins:0')
    expect(d.split(';')).toHaveLength(7)
  })
})
