import { describe, expect, it } from 'vitest'
import { creerCapsuleAuto, DELAI_MASQUAGE_MS, SEUIL_HAUT_PX, type Horloge } from './capsuleAuto'

/** Horloge manuelle : les minuteries ne partent que quand le test avance le temps. */
function horlogeFausse(): Horloge & { avancer(ms: number): void } {
  let maintenant = 0
  let n = 0
  const attentes = new Map<number, { a: number; f: () => void }>()
  return {
    setTimeout(f, ms) {
      attentes.set(++n, { a: maintenant + ms, f })
      return n
    },
    clearTimeout(id) {
      attentes.delete(id as number)
    },
    avancer(ms) {
      maintenant += ms
      for (const [id, t] of [...attentes]) {
        if (t.a <= maintenant) {
          attentes.delete(id)
          t.f()
        }
      }
    }
  }
}

function cas(actif = true) {
  const h = horlogeFausse()
  const vues: boolean[] = []
  const c = creerCapsuleAuto({ horloge: h, surChange: (v) => vues.push(v) })
  c.activer(actif)
  return { h, c, vues }
}

describe('capsuleAuto', () => {
  it('constantes du design : 2 s, 40 px', () => {
    expect(DELAI_MASQUAGE_MS).toBe(2000)
    expect(SEUIL_HAUT_PX).toBe(40)
  })

  it('immobile 2 s : masquée', () => {
    const { h, c } = cas()
    expect(c.visible()).toBe(true)
    h.avancer(1999)
    expect(c.visible()).toBe(true)
    h.avancer(1)
    expect(c.visible()).toBe(false)
  })

  it('un mouvement la rend visible et repart pour 2 s', () => {
    const { h, c } = cas()
    h.avancer(2000)
    expect(c.visible()).toBe(false)
    c.mouvement(300)
    expect(c.visible()).toBe(true)
    h.avancer(1500)
    c.mouvement(300)
    h.avancer(1500)
    expect(c.visible()).toBe(true)
    h.avancer(500)
    expect(c.visible()).toBe(false)
  })

  it('à moins de 40 px du haut : visible et jamais masquée', () => {
    const { h, c } = cas()
    c.mouvement(39)
    h.avancer(10_000)
    expect(c.visible()).toBe(true)
    c.mouvement(40)
    h.avancer(2000)
    expect(c.visible()).toBe(false)
  })

  it('la zone réelle de la capsule (46 px) compte : ses 6 derniers px ne relancent pas le délai', () => {
    const { h, c } = cas()
    c.mouvement(44, 46)
    h.avancer(10_000)
    expect(c.visible()).toBe(true)
    c.mouvement(46, 46)
    h.avancer(2000)
    expect(c.visible()).toBe(false)
  })

  it('quitter le haut relance le délai', () => {
    const { h, c } = cas()
    c.mouvement(10)
    h.avancer(5000)
    c.mouvement(200)
    h.avancer(1999)
    expect(c.visible()).toBe(true)
    h.avancer(1)
    expect(c.visible()).toBe(false)
  })

  it('désactivé : jamais masquée, même après un long moment', () => {
    const { h, c } = cas(false)
    h.avancer(60_000)
    expect(c.visible()).toBe(true)
    c.mouvement(500)
    h.avancer(60_000)
    expect(c.visible()).toBe(true)
  })

  it('désactiver réaffiche une capsule masquée et annule la minuterie', () => {
    const { h, c, vues } = cas()
    h.avancer(2000)
    expect(c.visible()).toBe(false)
    c.activer(false)
    expect(c.visible()).toBe(true)
    h.avancer(10_000)
    expect(c.visible()).toBe(true)
    expect(vues).toEqual([false, true])
  })

  it('surChange n’est appelé qu’aux changements', () => {
    const { h, c, vues } = cas()
    c.mouvement(300)
    c.mouvement(300)
    h.avancer(2000)
    h.avancer(2000)
    c.mouvement(300)
    c.mouvement(300)
    expect(vues).toEqual([false, true])
  })
})
