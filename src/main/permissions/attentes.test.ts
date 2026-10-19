import { describe, expect, it } from 'vitest'
import { Attentes, REFUS } from './attentes'

const OUI = { decision: 'autoriser', memoriser: true } as const

describe('Attentes', () => {
  it("n'accepte la réponse que de l'overlay qui a posé la demande", async () => {
    const a = new Attentes()
    const { id, promesse } = a.ouvrir(1, 42)
    expect(a.repondre(id, 99, OUI)).toBe(false)
    expect(a.repondre(id, 42, OUI)).toBe(true)
    expect(await promesse).toEqual(OUI)
    expect(a.repondre(id, 42, OUI)).toBe(false)
  })
  it("un changement de route de l'overlay refuse les demandes de sa fenêtre seulement", async () => {
    const a = new Attentes()
    const x = a.ouvrir(1, 42)
    const y = a.ouvrir(2, 43)
    a.abandonnerFenetre(1)
    expect(await x.promesse).toEqual(REFUS)
    expect(a.repondre(y.id, 43, OUI)).toBe(true)
  })
  it('abandonner une demande inconnue ne fait rien', () => {
    expect(new Attentes().abandonner(7)).toBe(false)
  })
})
