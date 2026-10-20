import { describe, expect, it } from 'vitest'
import { auBord, peutDefiler, type MesureDefilement } from './defilement'

const zone = (o: Partial<MesureDefilement> = {}): MesureDefilement => ({ overflowX: 'auto', scrollLeft: 0, scrollWidth: 1000, clientWidth: 400, ...o })
const doc = (o: Partial<MesureDefilement> = {}): MesureDefilement => zone({ overflowX: 'visible', scrollWidth: 400, racine: true, ...o })

describe('peutDefiler', () => {
  it('une zone défilable au début peut aller vers la droite, pas vers la gauche', () => {
    expect(peutDefiler(zone(), 50)).toBe(true)
    expect(peutDefiler(zone(), -50)).toBe(false)
  })
  it('au milieu : dans les deux sens ; à la fin : seulement vers la gauche', () => {
    expect(peutDefiler(zone({ scrollLeft: 300 }), 50)).toBe(true)
    expect(peutDefiler(zone({ scrollLeft: 300 }), -50)).toBe(true)
    expect(peutDefiler(zone({ scrollLeft: 600 }), 50)).toBe(false)
    expect(peutDefiler(zone({ scrollLeft: 600 }), -50)).toBe(true)
  })
  it('tolère les positions fractionnaires aux bords', () => {
    expect(peutDefiler(zone({ scrollLeft: 599.4 }), 50)).toBe(false)
    expect(peutDefiler(zone({ scrollLeft: 0.6 }), -50)).toBe(false)
  })
  it('overflow-x non défilable : jamais, même si le contenu déborde', () => {
    for (const overflowX of ['visible', 'hidden', 'clip']) expect(peutDefiler(zone({ overflowX }), 50)).toBe(false)
    for (const overflowX of ['auto', 'scroll', 'overlay']) expect(peutDefiler(zone({ overflowX }), 50)).toBe(true)
  })
  it('rien à défiler (contenu qui tient) : jamais', () => {
    expect(peutDefiler(zone({ scrollWidth: 400 }), 50)).toBe(false)
    expect(peutDefiler(zone({ scrollWidth: 400.5 }), 50)).toBe(false)
  })
  it('sans sens (dx nul) : rien', () => {
    expect(peutDefiler(zone(), 0)).toBe(false)
  })
  it('écriture de droite à gauche : scrollLeft va de -max à 0', () => {
    expect(peutDefiler(zone({ rtl: true, scrollLeft: 0 }), -50)).toBe(true)
    expect(peutDefiler(zone({ rtl: true, scrollLeft: 0 }), 50)).toBe(false)
    expect(peutDefiler(zone({ rtl: true, scrollLeft: -600 }), -50)).toBe(false)
    expect(peutDefiler(zone({ rtl: true, scrollLeft: -600 }), 50)).toBe(true)
  })
  it('le document défile même avec overflow-x: visible, sauf hidden ou clip', () => {
    expect(peutDefiler(doc({ scrollWidth: 1200 }), 50)).toBe(true)
    expect(peutDefiler(doc({ scrollWidth: 1200, overflowX: 'hidden' }), 50)).toBe(false)
    expect(peutDefiler(doc({ scrollWidth: 1200, overflowX: 'clip' }), 50)).toBe(false)
    expect(peutDefiler(doc(), 50)).toBe(false)
  })
})

describe('auBord (navigation par débordement)', () => {
  it('page sans zone défilable : au bord dans les deux sens', () => {
    expect(auBord([zone({ overflowX: 'visible' }), doc()], 50)).toBe(true)
    expect(auBord([], -50)).toBe(true)
  })
  it('un carrousel qui peut encore défiler empêche la navigation', () => {
    expect(auBord([zone({ scrollLeft: 100 }), doc()], 50)).toBe(false)
    expect(auBord([zone({ scrollLeft: 100 }), doc()], -50)).toBe(false)
  })
  it('carrousel au bout dans ce sens : le geste déborde, mais pas dans l’autre sens', () => {
    const fin = zone({ scrollLeft: 600 })
    expect(auBord([fin, doc()], 50)).toBe(true)
    expect(auBord([fin, doc()], -50)).toBe(false)
  })
  it('un ancêtre plus haut qui peut défiler (carte dans un tableau large) suffit à bloquer', () => {
    expect(auBord([zone({ scrollLeft: 600 }), zone({ scrollLeft: 0, scrollWidth: 3000 }), doc()], 50)).toBe(false)
  })
  it('le document lui-même défilable horizontalement bloque tant qu’il n’est pas au bord', () => {
    expect(auBord([doc({ scrollWidth: 1200, scrollLeft: 0 })], 50)).toBe(false)
    expect(auBord([doc({ scrollWidth: 1200, scrollLeft: 0 })], -50)).toBe(true)
    expect(auBord([doc({ scrollWidth: 1200, scrollLeft: 800 })], 50)).toBe(true)
  })
})
