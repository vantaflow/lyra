import { describe, expect, it } from 'vitest'
import type { RegleSite } from '../../shared/types'
import { estZoomNormal, palierSuivant, zoomChange, zoomVoulu } from './zoom'

describe('zoom', () => {
  it('monte et descend par paliers', () => {
    expect(palierSuivant(1, 1)).toBe(1.1)
    expect(palierSuivant(1, -1)).toBe(0.9)
    expect(palierSuivant(1.1, 1)).toBe(1.25)
  })
  it('reste entre 25 % et 500 %', () => {
    expect(palierSuivant(5, 1)).toBe(5)
    expect(palierSuivant(0.25, -1)).toBe(0.25)
  })
  it('un facteur hors palier va au palier voisin', () => {
    expect(palierSuivant(1.05, 1)).toBe(1.1)
    expect(palierSuivant(1.05, -1)).toBe(1)
  })
  it('100 % est le zoom normal', () => {
    expect(estZoomNormal(1)).toBe(true)
    expect(estZoomNormal(1.1)).toBe(false)
  })
})

describe('zoom voulu par la règle résolue', () => {
  const sites: Record<string, RegleSite> = { 'exemple.test': { zoom: 1.1 }, '*.exemple.test': { zoom: 1.5 }, 'vide.test': { boucliers: 'standard' } }
  it('lit la règle résolue : exacte, hôte, motif', () => {
    expect(zoomVoulu(sites, 'https://exemple.test')).toBe(1.1)
    expect(zoomVoulu(sites, 'https://www.exemple.test')).toBe(1.5)
  })
  it('une règle sans zoom (« Par défaut ») ou sans règle donne le zoom par défaut : 100 %', () => {
    expect(zoomVoulu(sites, 'https://vide.test')).toBe(1)
    expect(zoomVoulu(sites, 'https://inconnu.test')).toBe(1)
    expect(zoomVoulu({}, 'https://exemple.test')).toBe(1)
  })
  it('une valeur hors bornes (fichier modifié à la main) est ignorée', () => {
    expect(zoomVoulu({ 'a.test': { zoom: 9 } }, 'https://a.test')).toBe(1)
    expect(zoomVoulu({ 'a.test': { zoom: 0.1 } }, 'https://a.test')).toBe(1)
    expect(zoomVoulu({ 'a.test': { zoom: Number.NaN } }, 'https://a.test')).toBe(1)
  })
  it('changement de règle : le zoom d’une étoile n’est touché que si le zoom voulu de son site change', () => {
    const avant: Record<string, RegleSite> = { 'exemple.test': { zoom: 1.1 } }
    // règle retirée : retour au défaut
    expect(zoomChange(avant, {}, 'https://exemple.test')).toBe(1)
    // zoom modifié
    expect(zoomChange(avant, { 'exemple.test': { zoom: 1.25 } }, 'https://exemple.test')).toBe(1.25)
    // règle d’un autre site : aucun changement (un zoom manuel en fenêtre privée n’est pas écrasé)
    expect(zoomChange(avant, { ...avant, 'ailleurs.test': { zoom: 2 } }, 'https://exemple.test')).toBeUndefined()
    // autre champ de la règle : aucun changement
    expect(zoomChange(avant, { 'exemple.test': { zoom: 1.1, cookies: 'bloques' } }, 'https://exemple.test')).toBeUndefined()
  })
})
