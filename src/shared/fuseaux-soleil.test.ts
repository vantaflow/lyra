import { describe, expect, it } from 'vitest'
import { DEFAUT_SOLEIL, FUSEAUX_SOLEIL, estNuit, heuresSoleil, prochainChangement } from './fuseaux-soleil'

describe('table fuseau → lever / coucher', () => {
  it('chaque fuseau a 12 mois de [lever, coucher] plausibles (lever avant midi, coucher après 14 h)', () => {
    expect(Object.keys(FUSEAUX_SOLEIL).length).toBeGreaterThanOrEqual(40)
    for (const [tz, mois] of Object.entries(FUSEAUX_SOLEIL)) {
      expect(mois, tz).toHaveLength(12)
      for (const [lever, coucher] of mois) {
        expect(lever, tz).toBeGreaterThan(3)
        expect(lever, tz).toBeLessThan(10)
        expect(coucher, tz).toBeGreaterThan(14)
        expect(coucher, tz).toBeLessThan(23)
      }
    }
  })
  it('Paris : jours courts en décembre, longs en juin', () => {
    const dec = heuresSoleil('Europe/Paris', 11)
    const juin = heuresSoleil('Europe/Paris', 5)
    expect(dec.coucher).toBeGreaterThanOrEqual(16.5)
    expect(dec.coucher).toBeLessThanOrEqual(17.75)
    expect(dec.lever).toBeGreaterThanOrEqual(8)
    expect(juin.coucher).toBeGreaterThanOrEqual(21.5)
    expect(juin.lever).toBeLessThanOrEqual(6.25)
  })
  it('Tokyo : coucher vers 16 h 30 en décembre, 19 h en juin (pas d’heure d’été)', () => {
    expect(heuresSoleil('Asia/Tokyo', 11).coucher).toBeGreaterThanOrEqual(16.25)
    expect(heuresSoleil('Asia/Tokyo', 11).coucher).toBeLessThanOrEqual(17)
    expect(heuresSoleil('Asia/Tokyo', 5).coucher).toBeGreaterThanOrEqual(18.75)
    expect(heuresSoleil('Asia/Tokyo', 5).coucher).toBeLessThanOrEqual(19.5)
  })
  it('fuseau inconnu ou invalide : défaut 19 h – 7 h, sans erreur', () => {
    expect(DEFAUT_SOLEIL).toEqual({ lever: 7, coucher: 19 })
    expect(heuresSoleil('Mars/Olympus', 3)).toEqual(DEFAUT_SOLEIL)
    expect(heuresSoleil('', 0)).toEqual(DEFAUT_SOLEIL)
    expect(() => estNuit(new Date('2026-06-01T12:00:00Z'), 'Mars/Olympus')).not.toThrow()
    expect(() => prochainChangement(new Date('2026-06-01T12:00:00Z'), 'Mars/Olympus')).not.toThrow()
  })
})

describe('estNuit', () => {
  it('Paris au solstice d’été : 15 h du jour non, 23 h oui, 4 h oui', () => {
    expect(estNuit(new Date('2026-06-21T13:00:00Z'), 'Europe/Paris')).toBe(false)
    expect(estNuit(new Date('2026-06-21T21:00:00Z'), 'Europe/Paris')).toBe(true)
    expect(estNuit(new Date('2026-06-21T02:00:00Z'), 'Europe/Paris')).toBe(true)
  })
  it('Paris en décembre : 18 h 30 locale est déjà la nuit', () => {
    expect(estNuit(new Date('2026-12-15T17:30:00Z'), 'Europe/Paris')).toBe(true)
    expect(estNuit(new Date('2026-12-15T12:00:00Z'), 'Europe/Paris')).toBe(false)
  })
  it('fuseau inconnu : sombre après 19 h, clair à 12 h (heure du fuseau du système)', () => {
    const local = (h: number): Date => new Date(2026, 5, 1, h, 0, 0)
    expect(estNuit(local(12), 'Mars/Olympus')).toBe(false)
    expect(estNuit(local(20), 'Mars/Olympus')).toBe(true)
    expect(estNuit(local(6), 'Mars/Olympus')).toBe(true)
  })
})

describe('prochainChangement', () => {
  it('de jour : le coucher du soir ; de nuit : le lever suivant', () => {
    const { coucher, lever } = heuresSoleil('Europe/Paris', 5)
    const midi = new Date('2026-06-21T10:00:00Z') // 12 h à Paris
    const c = prochainChangement(midi, 'Europe/Paris')
    expect((c.getTime() - midi.getTime()) / 3_600_000).toBeCloseTo(coucher - 12, 1)
    const nuit = new Date('2026-06-21T21:30:00Z') // 23 h 30 à Paris
    const l = prochainChangement(nuit, 'Europe/Paris')
    expect((l.getTime() - nuit.getTime()) / 3_600_000).toBeCloseTo(24 - 23.5 + lever, 1)
  })
  it('toujours dans le futur', () => {
    const maintenant = new Date('2026-03-10T08:00:00Z')
    expect(prochainChangement(maintenant, 'Asia/Tokyo').getTime()).toBeGreaterThan(maintenant.getTime())
  })
})
