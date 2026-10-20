import { describe, expect, it } from 'vitest'
import { borner, parLots } from './borner'

describe('borner', () => {
  it('rend la main au délai sans attendre une promesse bloquée', async () => {
    const t = Date.now()
    expect(await borner(new Promise(() => {}), 50)).toBe(false)
    expect(Date.now() - t).toBeLessThan(500)
  })
  it('true si terminée, même en erreur', async () => {
    expect(await borner(Promise.resolve(), 1000)).toBe(true)
    expect(await borner(Promise.reject(new Error('x')), 1000)).toBe(true)
  })
})
describe('parLots', () => {
  it('limite la concurrence et traite tout', async () => {
    let en = 0, max = 0, fait = 0
    await parLots(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      max = Math.max(max, ++en)
      await new Promise((r) => setTimeout(r, 2))
      en--
      fait++
    })
    expect(fait).toBe(20)
    expect(max).toBeLessThanOrEqual(4)
  })
})
