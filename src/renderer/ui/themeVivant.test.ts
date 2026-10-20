import { describe, expect, it } from 'vitest'
import type { ThemeDiffuse } from '../../shared/ipc'
import { appliquerTheme, type RacineTheme } from './themeVivant'

function racine(): RacineTheme & { vars: Map<string, string>; attributs: Record<string, string> } {
  const vars = new Map<string, string>()
  const attributs: Record<string, string> = {}
  return {
    vars,
    attributs,
    style: { setProperty: (n: string, v: string) => void vars.set(n, v), removeProperty: (n: string) => void vars.delete(n) },
    setAttribute: (n: string, v: string) => void (attributs[n] = v)
  }
}
const theme = (mode: 'clair' | 'sombre', ciel: string, extra: Record<string, string> = {}): ThemeDiffuse => ({
  mode,
  nom: 'indigo-nuit',
  variables: { '--ciel': ciel, '--page': '#fff', ...extra },
  privee: { '--ciel': '#2a1540', '--page': '#eee' }
})

describe('appliquerTheme (vue Lyra)', () => {
  it('pose les variables et data-mode sur <html>', () => {
    const r = racine()
    appliquerTheme(r, theme('sombre', '#0e0e1e'), false, new Set())
    expect(r.vars.get('--ciel')).toBe('#0e0e1e')
    expect(r.attributs['data-mode']).toBe('sombre')
  })
  it('une vue privée prend les variables du thème privé, pas celles du profil', () => {
    const r = racine()
    appliquerTheme(r, theme('clair', '#15152e'), true, new Set())
    expect(r.vars.get('--ciel')).toBe('#2a1540')
    expect(r.vars.get('--page')).toBe('#eee')
  })
  it('retire les variables posées auparavant et absentes du nouveau thème', () => {
    const r = racine()
    const posees = new Set<string>()
    appliquerTheme(r, theme('clair', '#111', { '--ancienne': '#abcdef' }), false, posees)
    expect(r.vars.has('--ancienne')).toBe(true)
    appliquerTheme(r, theme('clair', '#222'), false, posees)
    expect(r.vars.has('--ancienne')).toBe(false)
    expect(r.vars.get('--ciel')).toBe('#222')
  })
  it('écrit les couleurs en minuscules, comme theme.css', () => {
    const r = racine()
    appliquerTheme(r, theme('clair', '#2A1540'), false, new Set())
    expect(r.vars.get('--ciel')).toBe('#2a1540')
  })
  it('refuse un nom de variable ou une valeur suspects venant du canal', () => {
    const r = racine()
    appliquerTheme(r, theme('clair', '#111', { 'color': 'red', '--x': 'url(https://exemple.test/a)' }), false, new Set())
    expect(r.vars.has('color')).toBe(false)
    expect(r.vars.has('--x')).toBe(false)
    expect(r.vars.get('--ciel')).toBe('#111')
  })
})
