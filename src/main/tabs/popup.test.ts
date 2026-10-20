import { describe, expect, it } from 'vitest'
import { DELAI_CLIC_MOLETTE_MS, clicMoletteRefuse, estVraiePopup, ouvertureParClicMolette } from './popup'

const p = (disposition: string, features: string) => estVraiePopup({ disposition, features })

describe('estVraiePopup', () => {
  it('features de fenêtre : popup', () => {
    expect(p('new-window', 'width=500,height=600')).toBe(true)
    expect(p('foreground-tab', 'width=500')).toBe(true)
    expect(p('foreground-tab', 'popup')).toBe(true)
    expect(p('foreground-tab', ' Left=10 , top=20')).toBe(true)
  })
  it('disposition « nouvelle fenêtre » sans features (Maj+clic sur un lien) : lien ordinaire', () => {
    expect(p('new-window', '')).toBe(false)
    expect(p('new-window', 'noopener')).toBe(false)
    expect(p('new-window', 'popup')).toBe(true)
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

describe('clic molette sur un lien', () => {
  const o = (disposition: string, dernierClicMolette: number, maintenant: number, clicMolette: boolean) => ({ disposition, dernierClicMolette, maintenant, clicMolette })
  it('reconnaît background-tab juste après un clic du milieu', () => {
    expect(ouvertureParClicMolette(o('background-tab', 1000, 1100, true))).toBe(true)
    expect(ouvertureParClicMolette(o('background-tab', 1000, 1000 + DELAI_CLIC_MOLETTE_MS, true))).toBe(true)
  })
  it('pas de clic du milieu récent (⌘ / Ctrl + clic, ou jamais) : pas un clic molette', () => {
    expect(ouvertureParClicMolette(o('background-tab', -Infinity, 5000, true))).toBe(false)
    expect(ouvertureParClicMolette(o('background-tab', 1000, 1000 + DELAI_CLIC_MOLETTE_MS + 1, true))).toBe(false)
    expect(ouvertureParClicMolette(o('background-tab', 2000, 1000, true))).toBe(false)
  })
  it('une autre disposition n’est pas un clic molette', () => {
    expect(ouvertureParClicMolette(o('foreground-tab', 1000, 1100, true))).toBe(false)
    expect(ouvertureParClicMolette(o('new-window', 1000, 1100, true))).toBe(false)
  })
  it('refusé seulement si l’interrupteur est coupé', () => {
    expect(clicMoletteRefuse(o('background-tab', 1000, 1100, false))).toBe(true)
    expect(clicMoletteRefuse(o('background-tab', 1000, 1100, true))).toBe(false)
    expect(clicMoletteRefuse(o('background-tab', -Infinity, 1100, false))).toBe(false)
    expect(clicMoletteRefuse(o('foreground-tab', 1000, 1100, false))).toBe(false)
  })
})

describe('suivi du clic molette (comportements)', () => {
  it('un clic du milieu est mémorisé ; ⌘ / Ctrl + clic (bouton gauche) efface le souvenir', async () => {
    const { EventEmitter } = await import('node:events')
    const { suivreClicMolette } = await import('./comportements')
    const wc = new EventEmitter()
    let t = 5000
    const dernier = suivreClicMolette(wc as never, () => t)
    expect(dernier()).toBe(-Infinity)
    wc.emit('input-event', {}, { type: 'mouseUp', button: 'middle' })
    expect(dernier()).toBe(5000)
    t = 5200
    wc.emit('input-event', {}, { type: 'mouseDown', button: 'left' })
    expect(dernier()).toBe(-Infinity)
    wc.emit('input-event', {}, { type: 'mouseWheel' })
    wc.emit('input-event', {}, { type: 'mouseDown', button: 'middle' })
    expect(dernier()).toBe(5200)
  })
})
