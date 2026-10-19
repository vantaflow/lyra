import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionStore, type EtatSession } from './SessionStore'

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
