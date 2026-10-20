import { afterEach, describe, expect, it, vi } from 'vitest'
import { COULEURS_INDIGO_NUIT, type ReglagesCouleurs } from '../../shared/types-reglages'
import { THEMES } from '../../shared/themes'
import { apercuTheme, creerLimiteur, couleursAffichees, estModifie, hexValide, modifierCouleur, patchPassage, segmentPassage } from './couleursModele'

const base: ReglagesCouleurs = {
  actif: 'indigo-nuit',
  privee: 'aurore',
  passage: 'systeme',
  heureSombre: '21:00',
  heureClair: '07:00',
  personnalisees: null,
  cielTeinteParSite: false,
  couleurParConstellation: true,
  prefersColorScheme: true
}

describe('« Mes couleurs » modifié', () => {
  it('est faux sans personnalisation et quand toutes les valeurs sont celles de départ', () => {
    expect(estModifie(null)).toBe(false)
    expect(estModifie(structuredClone(COULEURS_INDIGO_NUIT))).toBe(false)
  })
  it('devient vrai dès qu\'une couleur change, et faux quand elle revient à sa valeur de départ', () => {
    const p1 = modifierCouleur(base, 'accent', 'sombre', '#112233')
    expect(p1.actif).toBe('mes-couleurs')
    expect(estModifie(p1.personnalisees)).toBe(true)
    const p2 = modifierCouleur({ ...base, ...p1 }, 'accent', 'sombre', COULEURS_INDIGO_NUIT.accent.sombre)
    expect(estModifie(p2.personnalisees)).toBe(false)
  })
  it('copie le thème affiché (autre que Indigo) avant de changer une couleur, sans toucher au thème prêt', () => {
    const avant = structuredClone(THEMES.encre.couleurs)
    const p = modifierCouleur({ ...base, actif: 'encre' }, 'ciel-fond', 'clair', '#abcdef')
    expect(p.personnalisees['ciel-fond'].clair).toBe('#ABCDEF')
    expect(p.personnalisees['capsule-fond']).toEqual(THEMES.encre.couleurs['capsule-fond'])
    expect(THEMES.encre.couleurs).toEqual(avant)
  })
})

describe('thème prêt', () => {
  it('restaure toutes ses valeurs, même après une personnalisation', () => {
    const perso = modifierCouleur(base, 'accent', 'clair', '#010203')
    const c = { ...base, ...perso, actif: 'foret' as const }
    expect(couleursAffichees(c)).toEqual(THEMES.foret.couleurs)
  })
  it('« Mes couleurs » affiche la personnalisation, ou Indigo nuit à défaut', () => {
    expect(couleursAffichees({ ...base, actif: 'mes-couleurs' })).toEqual(COULEURS_INDIGO_NUIT)
    const perso = modifierCouleur(base, 'accent', 'clair', '#010203')
    expect(couleursAffichees({ ...base, ...perso }).accent.clair).toBe('#010203'.toUpperCase())
  })
  it('l\'aperçu d\'une vignette lit ciel, page et texte en clair', () => {
    expect(apercuTheme(THEMES.sable.couleurs)).toEqual({ ciel: '#E9DEC8', page: '#FBF7F0', texte: '#3A2E1E' })
    expect(apercuTheme(THEMES['nuit-complete'].couleurs)).toEqual({ ciel: '#0E0E1E', page: '#121214', texte: '#E6E6EA' })
  })
})

describe('saisie d\'une couleur', () => {
  it('accepte #RRGGBB ou RRGGBB, en majuscules, et refuse le reste', () => {
    expect(hexValide('#a1b2c3')).toBe('#A1B2C3')
    expect(hexValide(' a1b2c3 ')).toBe('#A1B2C3')
    expect(hexValide('#abc')).toBeNull()
    expect(hexValide('#12345g')).toBeNull()
    expect(hexValide('')).toBeNull()
  })
})

describe('« Passer en sombre » ↔ theme / couleurs.passage', () => {
  it('segment → réglages', () => {
    expect(patchPassage('systeme')).toEqual({ theme: 'systeme', couleurs: { passage: 'systeme' } })
    expect(patchPassage('coucher')).toEqual({ theme: 'programme', couleurs: { passage: 'coucher' } })
    expect(patchPassage('heure')).toEqual({ theme: 'programme', couleurs: { passage: 'heure' } })
    expect(patchPassage('jamais')).toEqual({ theme: 'clair', couleurs: { passage: 'jamais' } })
  })
  it('réglages → segment, dans les deux sens', () => {
    for (const id of ['systeme', 'coucher', 'heure', 'jamais'] as const) {
      const p = patchPassage(id)
      expect(segmentPassage(p.theme, p.couleurs.passage)).toBe(id)
    }
  })
  it('suit « Thème » d\'Apparence : Système, Clair, Sombre', () => {
    expect(segmentPassage('systeme', 'heure')).toBe('systeme')
    expect(segmentPassage('clair', 'coucher')).toBe('jamais')
    expect(segmentPassage('sombre', 'systeme')).toBeNull()
    expect(segmentPassage('programme', 'coucher')).toBe('coucher')
  })
})

describe('écritures throttlées', () => {
  afterEach(() => vi.useRealTimers())
  it('écrit tout de suite, puis au plus toutes les 60 ms avec la dernière valeur', () => {
    vi.useFakeTimers()
    const ecrire = vi.fn()
    const l = creerLimiteur<string>(60, ecrire)
    l.pousser('a')
    expect(ecrire).toHaveBeenCalledTimes(1)
    l.pousser('b')
    l.pousser('c')
    expect(ecrire).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60)
    expect(ecrire).toHaveBeenCalledTimes(2)
    expect(ecrire).toHaveBeenLastCalledWith('c')
  })
  it('vider écrit la dernière valeur en attente', () => {
    vi.useFakeTimers()
    const ecrire = vi.fn()
    const l = creerLimiteur<string>(60, ecrire)
    l.pousser('a')
    l.pousser('b')
    l.vider()
    expect(ecrire).toHaveBeenLastCalledWith('b')
    vi.advanceTimersByTime(200)
    expect(ecrire).toHaveBeenCalledTimes(2)
  })
})
