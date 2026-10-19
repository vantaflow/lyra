import { describe, expect, it } from 'vitest'
import { choixPourEntree } from './paletteChoix'
import type { Suggestion } from '../../shared/types'

const liste: Suggestion[] = [
  { type: 'commande', id: 'nouvelle-etoile', titre: 'Nouvelle étoile' },
  { type: 'commande', id: 'reglages', titre: 'Réglages' }
]

describe('choixPourEntree', () => {
  it('liste à jour : la ligne sélectionnée', () => expect(choixPourEntree('', '', liste, 1)).toBe(liste[1]))
  it('liste périmée : undefined (main réinterprète le texte)', () => expect(choixPourEntree('file:///a.html', '', liste, 0)).toBeUndefined())
  it('aucune liste reçue : undefined', () => expect(choixPourEntree('x', null, liste, 0)).toBeUndefined())
  it('liste à jour mais vide : undefined', () => expect(choixPourEntree('x', 'x', [], 0)).toBeUndefined())
})
