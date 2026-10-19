import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const partitions: string[] = []
const fetchPartition = vi.fn(async (_u: string, _i?: RequestInit) => new Response(''))

vi.mock('electron', () => ({
  session: {
    fromPartition: (nom: string) => {
      partitions.push(nom)
      return {
        fetch: fetchPartition,
        resolveProxy: async () => 'DIRECT',
        setProxy: async () => undefined,
        closeAllConnections: async () => undefined
      }
    }
  }
}))

afterEach(() => vi.restoreAllMocks())

describe('passerelles — câblage Electron', () => {
  it('9. les listes publiques sont téléchargées par la partition système (proxy du réseau respecté)', async () => {
    const { creerPasserelles } = await import('./electron')
    const global = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch global interdit'))
    const reseau = { passerelles: true, auto: true, sites: [] }
    const reglages = {
      getSettings: () => ({ reseau }),
      setSettings: () => undefined,
      supprimerPersonnelle: () => undefined,
      onChanged: () => () => undefined
    }
    const p = creerPasserelles({
      reglages: reglages as never,
      cacheFichier: join(mkdtempSync(join(tmpdir(), 'lyra-pass-')), 'passerelles.json'),
      sessions: () => [],
      surChangement: () => undefined
    })
    await p.tester()
    expect(global).not.toHaveBeenCalled()
    expect(fetchPartition).toHaveBeenCalled()
    expect(String(fetchPartition.mock.calls[0][0])).toMatch(/^https:\/\/raw\.githubusercontent\.com\//)
    expect(partitions).toContain('passerelle-systeme')
    expect(partitions.every((n) => n === 'passerelle-systeme')).toBe(true)
  })
})
