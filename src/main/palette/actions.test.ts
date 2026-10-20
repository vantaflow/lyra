import { describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (d: unknown, e: unknown) => unknown>()
vi.mock('../ipc', () => ({ handle: (canal: string, fn: (d: unknown, e: unknown) => unknown) => void handlers.set(canal, fn) }))
vi.mock('../modeTest', () => ({ enTest: () => false }))

import { installerPalette, type DepsPalette } from './actions'
import { reglagesParDefaut } from '../settings/defaults'

const favoris = { rechercher: vi.fn(() => [{ url: 'https://favori.test/', title: 'Mon favori' }]) }
const historique = { rechercher: vi.fn(() => [{ url: 'https://histo.test/', title: 'Page vue', visitedAt: 1 }]) }

function suggerer(privee: boolean, suggestionsEnPrivee = false): { type: string; url?: string }[] {
  const reglages = reglagesParDefaut('/dl')
  reglages.palette.suggestionsEnPrivee = suggestionsEnPrivee
  const tabs = { snapshot: () => ({ sky: { stars: [], constellations: [], activeId: null } }), fenetreId: 7 }
  installerPalette({
    ongletsDe: () => tabs,
    reglages: () => reglages,
    historique,
    favoris,
    privee: () => privee,
    dndActif: () => false
  } as unknown as DepsPalette)
  return handlers.get('palette:suggest')!({ texte: 'te' }, { sender: {} }) as { type: string; url?: string }[]
}

describe('palette:suggest en fenêtre privée', () => {
  it("fenêtre normale : historique et favoris du profil proposés", () => {
    const types = suggerer(false).map((s) => s.type)
    expect(types).toContain('favori')
    expect(types).toContain('historique')
  })

  it("fenêtre privée (défaut) : ni historique ni favoris, et leurs sources ne sont même pas interrogées", () => {
    favoris.rechercher.mockClear()
    historique.rechercher.mockClear()
    const types = suggerer(true).map((s) => s.type)
    expect(types).not.toContain('favori')
    expect(types).not.toContain('historique')
    expect(favoris.rechercher).not.toHaveBeenCalled()
    expect(historique.rechercher).not.toHaveBeenCalled()
  })

  it('fenêtre privée avec « suggestions en fenêtre privée » : proposés', () => {
    const types = suggerer(true, true).map((s) => s.type)
    expect(types).toContain('favori')
    expect(types).toContain('historique')
  })
})
