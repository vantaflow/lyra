import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Sous Windows, un antivirus ou l'indexeur qui tient le fichier un instant fait échouer le renommage (EPERM / EBUSY).
vi.mock('node:fs', async (original) => {
  const m = await original<typeof import('node:fs')>()
  return { ...m, renameSync: vi.fn(m.renameSync) }
})
const { JsonStore } = await import('./store')

interface Conf { theme: string; n: number }
const defauts: Conf = { theme: 'systeme', n: 1 }
let chemin: string
beforeEach(() => {
  chemin = join(fs.mkdtempSync(join(tmpdir(), 'lyra-store-win-')), 'settings.json')
  vi.mocked(fs.renameSync).mockClear()
})
const verrou = (code: string) => () => {
  throw Object.assign(new Error(`${code}: operation not permitted, rename`), { code })
}

describe('JsonStore sous Windows', () => {
  it('renommage refusé un instant (EPERM puis EBUSY) : réessayé, réglage appliqué et écrit', () => {
    const s = new JsonStore<Conf>(chemin, defauts)
    const vus: Conf[] = []
    s.onChange((v) => vus.push(v))
    vi.mocked(fs.renameSync).mockImplementationOnce(verrou('EPERM')).mockImplementationOnce(verrou('EBUSY'))
    expect(s.set({ theme: 'sombre' })).toEqual({ theme: 'sombre', n: 1 })
    expect(vus).toEqual([{ theme: 'sombre', n: 1 }])
    expect(JSON.parse(fs.readFileSync(chemin, 'utf8'))).toEqual({ theme: 'sombre', n: 1 })
    expect(fs.existsSync(`${chemin}.tmp`)).toBe(false)
  })

  it('renommage toujours refusé : écriture directe, les écouteurs sont prévenus quand même', () => {
    const s = new JsonStore<Conf>(chemin, defauts)
    const vus: Conf[] = []
    s.onChange((v) => vus.push(v))
    vi.mocked(fs.renameSync).mockImplementation(verrou('EPERM'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(s.set({ n: 2 })).toEqual({ theme: 'systeme', n: 2 })
      expect(vus).toHaveLength(1)
      expect(JSON.parse(fs.readFileSync(chemin, 'utf8'))).toEqual({ theme: 'systeme', n: 2 })
    } finally {
      vi.mocked(fs.renameSync).mockReset()
      warn.mockRestore()
    }
  })

  it('fichier enregistré avec un BOM UTF-8 (Bloc-notes) : relu, pas remis aux défauts', () => {
    fs.writeFileSync(chemin, '﻿{"theme":"clair","n":3}')
    expect(new JsonStore<Conf>(chemin, defauts).get()).toEqual({ theme: 'clair', n: 3 })
  })

  it('écriture directe : copie .bak de l’ancien fichier prise avant ; fichier tronqué ensuite → la copie est relue', () => {
    const s = new JsonStore<Conf>(chemin, defauts)
    s.set({ theme: 'clair' })
    vi.mocked(fs.renameSync).mockImplementation(verrou('EPERM'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      s.set({ n: 5 })
      expect(JSON.parse(fs.readFileSync(`${chemin}.bak`, 'utf8'))).toEqual({ theme: 'clair', n: 1 })
      // Coupure pendant l'écriture directe : fichier à moitié écrit.
      fs.writeFileSync(chemin, '{"theme":"cl')
      expect(new JsonStore<Conf>(chemin, defauts).get()).toEqual({ theme: 'clair', n: 1 })
    } finally {
      vi.mocked(fs.renameSync).mockReset()
      warn.mockRestore()
    }
  })

  it('fichier absent : valeurs par défaut, même si une vieille copie .bak traîne', () => {
    fs.writeFileSync(`${chemin}.bak`, '{"theme":"sombre","n":9}')
    expect(new JsonStore<Conf>(chemin, defauts).get()).toEqual(defauts)
  })
})
