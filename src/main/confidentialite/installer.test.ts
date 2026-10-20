import { afterEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, () => unknown>()
vi.mock('../ipc', () => ({ handle: (canal: string, fn: () => unknown) => void handlers.set(canal, fn) }))

import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installerConfidentialite } from './installer'
import { reglagesParDefaut } from '../settings/defaults'

function monter(choix: { effacerHistorique?: boolean; effacerCookies?: boolean; effacerCache?: boolean }, cookies: () => Promise<void> = async () => undefined, marqueur?: string) {
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
    sessions: () => [session as never],
    marqueur
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

  describe('arrêt brutal : marqueur « effacement à faire »', () => {
    const chemin = (): string => join(mkdtempSync(join(tmpdir(), 'lyra-conf-')), 'effacement-en-attente')
    it('écrit au démarrage, retiré par une fermeture propre, absent donc pas de rattrapage au démarrage suivant', async () => {
      const m = chemin()
      const a = monter({ effacerCookies: true }, undefined, m)
      await a.c.rattrapage
      expect(a.session.clearStorageData).not.toHaveBeenCalled()
      expect(existsSync(m)).toBe(true)
      await a.c.aLaFermeture()
      expect(existsSync(m)).toBe(false)
      const b = monter({ effacerCookies: true }, undefined, m)
      await b.c.rattrapage
      expect(b.session.clearStorageData).not.toHaveBeenCalled()
    })
    it('marqueur resté après un arrêt brutal : l’effacement est rejoué au démarrage, puis une nouvelle fermeture reste possible', async () => {
      const m = chemin()
      writeFileSync(m, '1')
      const { c, session, historique } = monter({ effacerCookies: true, effacerHistorique: true }, undefined, m)
      await c.rattrapage
      expect(session.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'] })
      expect(historique.effacer).toHaveBeenCalled()
      expect(existsSync(m)).toBe(true)
      await c.aLaFermeture()
      expect(existsSync(m)).toBe(false)
    })
    it('fermeture trop lente : le marqueur reste pour le prochain démarrage', async () => {
      vi.useFakeTimers()
      const m = chemin()
      const { c } = monter({ effacerCookies: true }, () => new Promise<void>(() => undefined), m)
      void c.aLaFermeture()
      await vi.advanceTimersByTimeAsync(5100)
      expect(existsSync(m)).toBe(true)
    })
    it('une fenêtre rouverte après la fermeture (macOS) remet le marqueur', async () => {
      const m = chemin()
      const { c } = monter({ effacerCookies: true }, undefined, m)
      await c.aLaFermeture()
      expect(existsSync(m)).toBe(false)
      c.fenetreOuverte()
      expect(existsSync(m)).toBe(true)
    })
  })
})
