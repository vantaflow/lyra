import { describe, expect, it } from 'vitest'
import { creerMajPeriodique } from './majPeriodique'

describe('majPeriodique', () => {
  it('replanifie quand la fréquence change, pas sinon', () => {
    const poses: number[] = []
    const retires: unknown[] = []
    const m = creerMajPeriodique({
      tache: () => undefined,
      setInterval: (_f, ms) => (poses.push(ms), poses.length),
      clearInterval: (id) => retires.push(id)
    })
    m.regler(6)
    m.regler(6)
    expect(poses).toEqual([6 * 3600_000])
    m.regler(24)
    expect(poses).toEqual([6 * 3600_000, 24 * 3600_000])
    expect(retires).toEqual([1])
    m.arreter()
    expect(retires).toEqual([1, 2])
  })
})
