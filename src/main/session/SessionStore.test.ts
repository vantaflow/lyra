import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SkyState } from '../../shared/types'
import { SessionStore, assainirCiel, type EtatSession } from './SessionStore'

const etat: EtatSession = {
  version: 1,
  fenetres: [
    {
      ciel: {
        stars: [{ id: 'a', url: 'https://a.test/', title: 'A', pinned: false, dormant: false, index: 0 }],
        constellations: [],
        activeId: 'a',
        pinned: []
      },
      entrees: { a: { entries: [{ url: 'https://a.test/', title: 'A' }], index: 0 } }
    }
  ]
}

let dir: string
let fichier: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lyra-session-'))
  fichier = join(dir, 'session.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('SessionStore', () => {
  it('fichier absent : null', () => {
    expect(new SessionStore(fichier).charger()).toBeNull()
  })

  it('fichier corrompu, vide ou de version inconnue : null, sans exception', () => {
    const s = new SessionStore(fichier)
    for (const contenu of ['', '{pas du json', 'null', '[]', '{"version":2,"fenetres":[{}]}', '{"version":1,"fenetres":[]}', '{"version":1,"fenetres":[{"ciel":42}]}']) {
      writeFileSync(fichier, contenu)
      expect(s.charger()).toBeNull()
    }
  })

  it('aller-retour avec écriture immédiate', () => {
    const s = new SessionStore(fichier)
    s.sauvegarder(etat)
    s.vider()
    expect(new SessionStore(fichier).charger()).toEqual(etat)
    expect(existsSync(`${fichier}.tmp`)).toBe(false)
  })

  it('le debounce regroupe les écritures et garde la dernière', async () => {
    const s = new SessionStore(fichier, 20)
    s.sauvegarder(etat)
    expect(existsSync(fichier)).toBe(false)
    s.sauvegarder({ ...etat, fenetres: [...etat.fenetres, ...etat.fenetres] })
    await new Promise((r) => setTimeout(r, 80))
    expect(JSON.parse(readFileSync(fichier, 'utf8')).fenetres).toHaveLength(2)
  })

  it('ignore les entrées de navigation invalides', () => {
    writeFileSync(fichier, JSON.stringify({ ...etat, fenetres: [{ ...etat.fenetres[0], entrees: { a: { entries: 'x', index: 0 }, b: { entries: [{ url: 'u', title: 't' }], index: 0 } } }] }))
    const charge = new SessionStore(fichier).charger()
    expect(Object.keys(charge!.fenetres[0].entrees)).toEqual(['b'])
  })
})

describe('assainirCiel', () => {
  const st = (id: string, extra: object = {}): SkyState['stars'][number] => ({ id, url: 'https://x.test/', title: id, pinned: false, dormant: false, index: 9, ...extra })
  const ciel = (stars: SkyState['stars'], activeId: string | null = null): SkyState => ({ stars, constellations: [], activeId, pinned: [] })

  it('dédoublonne les ids en gardant la première occurrence et réindexe', () => {
    const r = assainirCiel(ciel([st('a', { title: 'premier' }), st('a', { title: 'second' }), st('b')], 'a'))
    expect(r.stars.map((s) => [s.id, s.title, s.index])).toEqual([['a', 'premier', 0], ['b', 'b', 1]])
  })
  it('supprime un parentId inconnu et une constellation inconnue', () => {
    const r = assainirCiel(ciel([st('a', { parentId: 'zzz', constellationId: 'cx' })], 'a'))
    expect(r.stars[0].parentId).toBeUndefined()
    expect(r.stars[0].constellationId).toBeUndefined()
  })
  it('casse un cycle a -> b -> a', () => {
    const r = assainirCiel(ciel([st('a', { parentId: 'b' }), st('b', { parentId: 'a' })], 'a'))
    const racines = r.stars.filter((s) => s.parentId === undefined)
    expect(racines.length).toBeGreaterThanOrEqual(1)
    for (const s of r.stars) {
      const vus = new Set<string>()
      for (let p = s.parentId; p; p = r.stars.find((x) => x.id === p)?.parentId) {
        expect(vus.has(p)).toBe(false)
        vus.add(p)
      }
    }
  })
  it('activeId inconnu : première étoile ; champs normalisés', () => {
    const r = assainirCiel(ciel([st('a', { title: 3 as unknown as string, pinned: 'oui' as unknown as boolean }), st('b')], 'nope'))
    expect(r.activeId).toBe('a')
    expect(r.stars[0].title).toBe('')
    expect(r.stars[0].pinned).toBe(false)
  })
})
