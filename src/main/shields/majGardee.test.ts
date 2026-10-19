import { describe, it, expect } from 'vitest'
import { creerMajGardee } from './majGardee'

describe('creerMajGardee', () => {
  it('deux appels concurrents partagent la même exécution', async () => {
    let n = 0
    const g = creerMajGardee(async () => ++n, { delaiMs: 60_000, maintenant: () => 0 })
    const [a, b] = await Promise.all([g(), g()])
    expect(a).toBe(1)
    expect(b).toBe(1)
    expect(n).toBe(1)
  })
  it('refuse sous 60 s puis réexécute après', async () => {
    let t = 1_000
    let n = 0
    const g = creerMajGardee(async () => ++n, { delaiMs: 60_000, maintenant: () => t })
    await g()
    t += 30_000
    expect(await g()).toEqual({ ignore: true, date: new Date(1_000).toISOString() })
    expect(n).toBe(1)
    t += 31_000
    expect(await g()).toBe(2)
  })
})
