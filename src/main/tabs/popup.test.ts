import { describe, expect, it } from 'vitest'
import { estVraiePopup } from './popup'

const p = (disposition: string, features: string) => estVraiePopup({ disposition, features })

describe('estVraiePopup', () => {
  it('features de fenêtre : popup', () => {
    expect(p('new-window', 'width=500,height=600')).toBe(true)
    expect(p('foreground-tab', 'width=500')).toBe(true)
    expect(p('foreground-tab', 'popup')).toBe(true)
    expect(p('foreground-tab', ' Left=10 , top=20')).toBe(true)
  })
  it('disposition « nouvelle fenêtre » : popup même sans features', () => {
    expect(p('new-window', '')).toBe(true)
  })
  it('noopener, noreferrer, attributionsrc seuls : lien ordinaire', () => {
    expect(p('foreground-tab', 'noopener')).toBe(false)
    expect(p('foreground-tab', 'noopener,noreferrer')).toBe(false)
    expect(p('background-tab', 'noreferrer, noopener , attributionsrc')).toBe(false)
    expect(p('foreground-tab', 'attributionsrc=x')).toBe(false)
  })
  it('noopener avec des features de fenêtre : popup', () => {
    expect(p('foreground-tab', 'noopener,width=400,height=300')).toBe(true)
  })
  it('target=_blank sans features : lien ordinaire', () => {
    expect(p('foreground-tab', '')).toBe(false)
    expect(p('background-tab', '')).toBe(false)
  })
})
