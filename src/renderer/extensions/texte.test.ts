import { describe, expect, it } from 'vitest'
import type { JournalExtension } from '../../shared/types'
import { depuis, etatTexte, lignesJournal, origineTexte, porteeTexte, resumeFile, sitesExclus } from './texte'

const journal = (p: Partial<JournalExtension> = {}): JournalExtension => ({ avertissementsChargement: [], apiStubees: {}, apiManquantes: [], conflitsRaccourcis: [], redondanceBoucliers: false, ...p })

describe('depuis', () => {
  const t0 = Date.parse('2026-10-20T10:00:00Z')
  it('formule la durée', () => {
    expect(depuis('2026-10-20T07:59:00Z', t0)).toBe('Vérifiées il y a 2 h')
    expect(depuis('2026-10-20T09:45:00Z', t0)).toBe('Vérifiées il y a 15 min')
    expect(depuis('2026-10-18T09:00:00Z', t0)).toBe('Vérifiées il y a 2 j')
    expect(depuis('2026-10-20T09:59:50Z', t0)).toBe("Vérifiées à l'instant")
    expect(depuis(undefined, t0)).toBe('Pas encore vérifiées')
  })
})

describe('porteeTexte', () => {
  it('suit le design', () => {
    expect(porteeTexte({ portee: { tous: true, hotes: [] } }, [])).toBe('Tous les sites')
    expect(porteeTexte({ portee: { tous: false, hotes: ['youtube.com'] } }, [])).toBe('youtube.com seulement')
    expect(porteeTexte({ portee: { tous: true, hotes: [] } }, ['https://youtube.com'])).toBe('Tous les sites sauf youtube.com (règle par site)')
  })
  it('sitesExclus ne garde que les règles false', () => {
    expect(sitesExclus({ 'https://a.fr': { extensions: { x: false } }, 'https://b.fr': { extensions: { x: true } }, 'https://c.fr': {} }, 'x')).toEqual(['https://a.fr'])
  })
})

describe('etatTexte', () => {
  it('redondance avec les Boucliers', () => {
    expect(etatTexte({ active: true, chargee: true }, journal({ redondanceBoucliers: true }))).toBe("s'ajoute aux Boucliers, ne les remplace pas")
  })
  it('fonctions Firefox ignorées', () => {
    const conversion = { cles_retirees: ['a'], permissions_retirees: ['theme'], transformations: [], avertissements: [] }
    expect(etatTexte({ active: true, chargee: true, convertie: true }, journal({ conversion }))).toBe('fonctionne ; 2 fonctions Firefox ignorées')
  })
  it('rien à dire pour une extension sans note', () => {
    expect(etatTexte({ active: true, chargee: true }, journal())).toBeUndefined()
    expect(etatTexte({ active: false, chargee: false }, undefined)).toBe('désactivée')
  })
})

describe('lignesJournal', () => {
  it('✓ – ℹ', () => {
    const l = lignesJournal(
      journal({
        redondanceBoucliers: true,
        noteBoucliers: 'blocage réseau assuré par les Boucliers',
        apiStubees: { 'pageAction.show': 2 },
        conversion: { cles_retirees: ['sidebar_action'], permissions_retirees: [], transformations: ['menus → contextMenus'], avertissements: [] }
      })
    )
    expect(l).toEqual([
      '✓ menus → contextMenus',
      '– sidebar_action  — retirée du manifest (sans effet dans Lyra)',
      '– pageAction.show ×2  — absente de Lyra : appel ignoré',
      'ℹ blocage réseau assuré par les Boucliers'
    ])
    expect(lignesJournal(journal())).toEqual(['✓ Aucun avertissement : rien à signaler.'])
  })
  it('origine', () => {
    expect(origineTexte({ magasin: 'firefox', convertie: true })).toBe('Firefox · convertie')
    expect(origineTexte({ magasin: 'chrome' })).toBe('Chrome')
  })
})

describe('resumeFile', () => {
  it('« 5 sur 6 réinstallées, 1 à installer à la main »', () => {
    const e = { id: 'x', nom: 'X', magasin: 'chrome' as const }
    const r = (etat: 'installee' | 'manuel' | 'erreur' | 'a-confirmer') => ({ entree: e, etat })
    expect(resumeFile({ resultats: [r('installee'), r('installee'), r('installee'), r('installee'), r('installee'), r('manuel')] })).toBe('5 sur 6 réinstallées, 1 à installer à la main')
    expect(resumeFile({ resultats: [r('installee'), r('erreur'), r('a-confirmer')] })).toBe('1 sur 3 réinstallées, 1 en erreur, 1 à confirmer')
  })
})
