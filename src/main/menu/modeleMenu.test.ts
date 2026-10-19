import { describe, expect, it, vi } from 'vitest'
import { modeleMenu, type ParamsMenu } from './modeleMenu'

const base: ParamsMenu = {
  misspelledWord: '',
  dictionarySuggestions: [],
  linkURL: '',
  mediaType: 'none',
  srcURL: '',
  selectionText: '',
  isEditable: false,
  editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: true } as ParamsMenu['editFlags'],
  x: 0,
  y: 0
}
const wc = { navigationHistory: { canGoBack: () => false, canGoForward: () => false }, downloadURL: vi.fn() } as never
const deps = { ouvrirDansEtoile: vi.fn(), rechercheUrl: (t: string) => `https://m/?q=${t}`, copier: vi.fn() }
const labels = (p: Partial<ParamsMenu>): string[] => modeleMenu(wc, { ...base, ...p }, deps).map((i) => i.label ?? '')

describe('modeleMenu', () => {
  it('un lien https peut être ouvert dans une étoile', () => {
    expect(labels({ linkURL: 'https://a.fr/' })).toContain('Ouvrir le lien dans une nouvelle étoile')
  })
  it('un lien javascript: ou file: ne peut pas être ouvert (mais peut être copié)', () => {
    for (const linkURL of ['javascript:alert(1)', 'file:///etc/passwd', 'lyra://settings']) {
      const l = labels({ linkURL })
      expect(l).not.toContain('Ouvrir le lien dans une nouvelle étoile')
      expect(l).toContain('Copier le lien')
    }
  })
  it("une image file: ne peut pas être enregistrée ; http(s), data et blob oui", () => {
    const image = (srcURL: string) => labels({ mediaType: 'image', srcURL })
    expect(image('file:///etc/passwd')).not.toContain("Enregistrer l'image sous…")
    for (const u of ['https://a.fr/i.png', 'data:image/png;base64,AA', 'blob:https://a.fr/x']) expect(image(u)).toContain("Enregistrer l'image sous…")
  })
})
