import { afterEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, () => unknown>()
vi.mock('../ipc', () => ({ handle: (canal: string, fn: () => unknown) => void handlers.set(canal, fn) }))

import { installerConfidentialite } from './installer'
import { reglagesParDefaut } from '../settings/defaults'

function monter(choix: { effacerHistorique?: boolean; effacerCookies?: boolean; effacerCache?: boolean }, cookies: () => Promise<void> = async () => undefined) {
  const s = reglagesParDefaut('/dl')
  s.confidentialite = { effacerHistorique: false, effacerCookies: false, effacerCache: false, ...choix }
  const historique = { effacer: vi.fn() }
  const session = {
    clearStorageData: vi.fn(cookies),
    cookies: { flushStore: vi.fn(async () => undefined) },
    clearCache: vi.fn(async () => undefined)
  }
  const c = installerConfidentialite({
    reglages: { getSettings: () => s } as never,
    historique: historique as never,
    sessions: () => [session as never]
  })
  return { c, historique, session }
}

afterEach(() => {
  vi.useRealTimers()
  handlers.clear()
})

describe('installerConfidentialite', () => {
  it("à la fermeture : seulement les cases cochées, et seulement les cookies (jamais le stockage des extensions)", async () => {
    const { c, historique, session } = monter({ effacerCookies: true })
    await c.aLaFermeture()
    expect(session.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'] })
    expect(historique.effacer).not.toHaveBeenCalled()
    expect(session.clearCache).not.toHaveBeenCalled()
  })

  it("une seule fois par ouverture : dernière fenêtre fermée puis sortie n'efface qu'une fois", async () => {
    const { c, session } = monter({ effacerCookies: true })
    await c.aLaFermeture()
    await c.aLaFermeture()
    expect(session.clearStorageData).toHaveBeenCalledTimes(1)
  })

  it("une fenêtre rouverte entre-temps remet l'effacement à faire", async () => {
    const { c, session } = monter({ effacerCookies: true })
    await c.aLaFermeture()
    c.fenetreOuverte()
    await c.aLaFermeture()
    expect(session.clearStorageData).toHaveBeenCalledTimes(2)
  })

  it("la sortie attend l'effacement déjà en cours au lieu de le relancer", async () => {
    let finir!: () => void
    const { c, session } = monter({ effacerCookies: true }, () => new Promise<void>((ok) => (finir = ok)))
    void c.aLaFermeture()
    let fini = false
    void c.aLaFermeture().then(() => (fini = true))
    await Promise.resolve()
    expect(fini).toBe(false)
    finir()
    await vi.waitFor(() => expect(fini).toBe(true))
    expect(session.clearStorageData).toHaveBeenCalledTimes(1)
  })

  it('ne bloque jamais la fermeture : au plus 5 s si une action ne se termine pas', async () => {
    vi.useFakeTimers()
    const { c } = monter({ effacerCookies: true }, () => new Promise<void>(() => undefined))
    let fini = false
    void c.aLaFermeture().then(() => (fini = true))
    await vi.advanceTimersByTimeAsync(4900)
    expect(fini).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(fini).toBe(true)
  })

  it('la purge immédiate efface tout, sans tenir compte des cases', async () => {
    const { historique, session } = monter({})
    await handlers.get('confidentialite:purger')!()
    expect(historique.effacer).toHaveBeenCalled()
    expect(session.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'] })
    expect(session.clearCache).toHaveBeenCalled()
  })
})
