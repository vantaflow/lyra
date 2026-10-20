import { describe, expect, it } from 'vitest'
import { HEURE_VALIDE, minutesDe, estDansPlage, prochaineEcheanceHeure } from './heure-sombre'

const PARIS = 'Europe/Paris' // été : UTC+2
const a = (hhmm: string): Date => new Date(`2026-06-21T${hhmm}:00+02:00`)

describe('HEURE_VALIDE', () => {
  it.each(['00:00', '07:05', '21:00', '23:59'])('accepte %s', (h) => expect(HEURE_VALIDE.test(h)).toBe(true))
  it.each(['24:00', '7:00', '07:60', '07h00', '', '21:00:00', ' 21:00'])('refuse %s', (h) => expect(HEURE_VALIDE.test(h)).toBe(false))
  it('minutesDe', () => expect(minutesDe('21:30')).toBe(21 * 60 + 30))
})

describe('estDansPlage (21:00 → 07:00, à cheval sur minuit)', () => {
  it.each([
    ['12:00', false], ['20:59', false], ['21:00', true], ['23:59', true], ['00:00', true], ['06:59', true], ['07:00', false], ['07:01', false]
  ])('à %s → sombre=%s', (h, attendu) => expect(estDansPlage(a(h), '21:00', '07:00', PARIS)).toBe(attendu))

  it('plage dans la même journée (13:00 → 15:00)', () => {
    expect(estDansPlage(a('12:59'), '13:00', '15:00', PARIS)).toBe(false)
    expect(estDansPlage(a('14:00'), '13:00', '15:00', PARIS)).toBe(true)
    expect(estDansPlage(a('15:00'), '13:00', '15:00', PARIS)).toBe(false)
  })
  it('début = fin : toujours sombre', () => {
    for (const h of ['00:00', '07:00', '12:00', '21:00']) expect(estDansPlage(a(h), '07:00', '07:00', PARIS)).toBe(true)
  })
  it("l'heure est celle du fuseau, pas celle du système", () => {
    const t = new Date('2026-06-21T20:00:00Z') // 22 h à Paris, 16 h à New York
    expect(estDansPlage(t, '21:00', '07:00', PARIS)).toBe(true)
    expect(estDansPlage(t, '21:00', '07:00', 'America/New_York')).toBe(false)
  })
})

describe('prochaineEcheanceHeure', () => {
  it('avant la plage : le début, aujourd’hui', () => {
    expect(prochaineEcheanceHeure(a('12:00'), '21:00', '07:00', PARIS).toISOString()).toBe(a('21:00').toISOString())
  })
  it('pendant la plage : la fin, le lendemain matin', () => {
    expect(prochaineEcheanceHeure(a('23:00'), '21:00', '07:00', PARIS).toISOString()).toBe(new Date('2026-06-22T07:00:00+02:00').toISOString())
    expect(prochaineEcheanceHeure(a('03:00'), '21:00', '07:00', PARIS).toISOString()).toBe(a('07:00').toISOString())
  })
  it('après la plage : le début, le soir même', () => {
    expect(prochaineEcheanceHeure(a('07:00'), '21:00', '07:00', PARIS).toISOString()).toBe(a('21:00').toISOString())
  })
  it('à l’échéance exacte, la suivante (jamais « maintenant »)', () => {
    expect(prochaineEcheanceHeure(a('21:00'), '21:00', '07:00', PARIS).getTime()).toBeGreaterThan(a('21:00').getTime())
  })
})
