import { describe, expect, it } from 'vitest'
import { exceptionsDnd } from './exceptionsDnd'

describe('exceptionsDnd (vue des règles par site)', () => {
  it('ne garde que les règles dont exceptionDnd vaut true, triées', () => {
    const sites = {
      'https://zeta.fr': { exceptionDnd: true },
      'https://alpha.fr': { exceptionDnd: true, zoom: 1.25 },
      'https://beta.fr': { exceptionDnd: false },
      'https://gamma.fr': { zoom: 1.1 },
      'youtube.com': { exceptionDnd: true },
      '*.exemple.org': { exceptionDnd: true }
    }
    expect(exceptionsDnd(sites)).toEqual(['*.exemple.org', 'https://alpha.fr', 'https://zeta.fr', 'youtube.com'])
  })
  it('aucune règle : liste vide, sans second stockage', () => {
    expect(exceptionsDnd({})).toEqual([])
  })
  it("l'argument n'est pas modifié", () => {
    const sites = { 'a.fr': { exceptionDnd: true } }
    exceptionsDnd(sites)
    expect(sites).toEqual({ 'a.fr': { exceptionDnd: true } })
  })
})
