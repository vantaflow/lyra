import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonStore, fusion, conserverCopieCorrompue } from './store'

interface Conf { a: number; b: string; n: { x: number; y: number } }
const defauts: Conf = { a: 1, b: 'b', n: { x: 1, y: 2 } }
let dossier: string
let chemin: string

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'lyra-store-'))
  chemin = join(dossier, 'conf.json')
})

describe('JsonStore', () => {
  it('fichier absent : renvoie les défauts', () => {
    expect(new JsonStore(chemin, defauts).get()).toEqual(defauts)
  })

  it('set puis relecture : valeurs fusionnées et persistées', () => {
    const s = new JsonStore(chemin, defauts)
    expect(s.set({ a: 5 })).toEqual({ ...defauts, a: 5 })
    expect(new JsonStore(chemin, defauts).get()).toEqual({ ...defauts, a: 5 })
  })

  it('fusionne en profondeur les objets imbriqués', () => {
    const s = new JsonStore(chemin, defauts)
    s.set({ n: { x: 9 } } as Partial<Conf>)
    expect(s.get().n).toEqual({ x: 9, y: 2 })
  })

  it('fichier corrompu : défauts sans exception', () => {
    writeFileSync(chemin, '{')
    expect(new JsonStore(chemin, defauts).get()).toEqual(defauts)
  })

  it('copies .corrompu horodatées : un second incident n\'écrase pas la première copie', () => {
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      writeFileSync(chemin, 'premier')
      conserverCopieCorrompue(chemin, () => Date.UTC(2026, 9, 20, 10, 0, 0, 1))
      writeFileSync(chemin, 'second')
      conserverCopieCorrompue(chemin, () => Date.UTC(2026, 9, 20, 10, 0, 0, 2))
    } finally {
      avert.mockRestore()
    }
    const copies = readdirSync(dossier).filter((f) => f.includes('.corrompu-')).sort()
    expect(copies).toEqual(['conf.json.corrompu-20261020T100000001Z', 'conf.json.corrompu-20261020T100000002Z'])
    expect(copies.map((c) => readFileSync(join(dossier, c), 'utf8'))).toEqual(['premier', 'second'])
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('lecture refusée (EACCES) : message, défauts, et le fichier n\'est jamais écrasé', () => {
    writeFileSync(chemin, JSON.stringify({ a: 42 }))
    chmodSync(chemin, 0o000)
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const s = new JsonStore(chemin, defauts)
      expect(s.get()).toEqual(defauts)
      expect(avert.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/lecture impossible \(EACCES\)/)
      s.set({ a: 2 })
      expect(s.get().a).toBe(2)
    } finally {
      avert.mockRestore()
      chmodSync(chemin, 0o600)
    }
    expect(JSON.parse(readFileSync(chemin, 'utf8')).a).toBe(42)
  })

  it('écriture atomique : pas de .tmp résiduel', () => {
    const s = new JsonStore(chemin, defauts)
    s.set({ a: 2 })
    s.set({ a: 3 })
    expect(readdirSync(dossier)).toEqual(['conf.json'])
    expect(JSON.parse(readFileSync(chemin, 'utf8')).a).toBe(3)
  })

  it('onChange notifie et se désabonne', () => {
    const s = new JsonStore(chemin, defauts)
    const vus: number[] = []
    const stop = s.onChange((v) => vus.push(v.a))
    s.set({ a: 2 })
    stop()
    s.set({ a: 3 })
    expect(vus).toEqual([2])
  })

  it('utilise migrer pour le contenu brut', () => {
    writeFileSync(chemin, JSON.stringify({ ancien: 7 }))
    const s = new JsonStore<Conf>(chemin, defauts, (brut) => ({
      ...defauts,
      a: (brut as { ancien: number }).ancien
    }))
    expect(s.get().a).toBe(7)
  })
})

describe('JsonStore : écritures disque throttlées (sélecteur de couleur)', () => {
  const fichier = (): Conf => JSON.parse(readFileSync(chemin, 'utf8'))
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('une rafale d’écritures dans 60 ms : la première est immédiate, la dernière valeur suit après 60 ms, la mémoire est toujours à jour', () => {
    const s = new JsonStore(chemin, defauts, undefined, 60)
    const vues: number[] = []
    s.onChange((v) => vues.push(v.a))
    s.set({ a: 2 })
    expect(fichier().a).toBe(2)
    vi.advanceTimersByTime(10)
    s.set({ a: 3 })
    vi.advanceTimersByTime(10)
    s.set({ a: 4 })
    expect(s.get().a).toBe(4)
    expect(vues).toEqual([2, 3, 4])
    expect(fichier().a).toBe(2)
    vi.advanceTimersByTime(60)
    expect(fichier().a).toBe(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('une seule écriture différée pour toute la rafale', () => {
    const s = new JsonStore(chemin, defauts, undefined, 60)
    s.set({ a: 2 })
    for (let i = 3; i < 20; i++) s.set({ a: i })
    expect(vi.getTimerCount()).toBe(1)
  })

  it('vider écrit tout de suite la dernière valeur (fermeture de l’application)', () => {
    const s = new JsonStore(chemin, defauts, undefined, 60)
    s.set({ a: 2 })
    s.set({ a: 9 })
    expect(fichier().a).toBe(2)
    s.vider()
    expect(fichier().a).toBe(9)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sans délai (défaut) : chaque écriture est immédiate', () => {
    const s = new JsonStore(chemin, defauts)
    s.set({ a: 2 })
    s.set({ a: 3 })
    expect(fichier().a).toBe(3)
  })
})

describe('fusion', () => {
  it('ignore __proto__, constructor et prototype', () => {
    const resultat = fusion<Record<string, unknown>>(
      { a: 1 },
      JSON.parse('{"__proto__":{"p":1},"constructor":{"x":1},"prototype":{"y":1},"a":2}')
    )
    expect(({} as Record<string, unknown>).p).toBeUndefined()
    expect(resultat.constructor).toBe(Object)
    expect('prototype' in resultat).toBe(false)
    expect(resultat.a).toBe(2)
  })
})
