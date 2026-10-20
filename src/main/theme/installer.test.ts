import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, ipcMain: {}, nativeTheme: {}, powerMonitor: {}, webContents: {} }))
vi.mock('../ipc', () => ({ envoyer: vi.fn(), estVueLyra: vi.fn(), handle: vi.fn() }))
const { horlogeDeTest } = await import('./installer')

describe('horlogeDeTest', () => {
  it('démarre à la date donnée puis avance en temps réel', () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
    const h = horlogeDeTest({ LYRA_TEST_HORLOGE: '2026-06-21T20:59:50+02:00' }, true)!
    expect(h().toISOString()).toBe('2026-06-21T18:59:50.000Z')
    vi.advanceTimersByTime(15_000)
    expect(h().toISOString()).toBe('2026-06-21T19:00:05.000Z')
    vi.useRealTimers()
  })
  it('hors mode test, ou date absente ou invalide : horloge du système', () => {
    expect(horlogeDeTest({ LYRA_TEST_HORLOGE: '2026-06-21T20:59:50+02:00' }, false)).toBeUndefined()
    expect(horlogeDeTest({}, true)).toBeUndefined()
    expect(horlogeDeTest({ LYRA_TEST_HORLOGE: 'pas une date' }, true)).toBeUndefined()
  })
})
