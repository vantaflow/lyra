import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonStore } from './store'

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
