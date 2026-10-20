import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SkyState, Star } from '../../shared/types'
import { History } from '../history/History'
import { archiverFenetre, demarrerArchivage, etoilesEteintes, type Archivable } from './archivage'

const JOUR = 86_400_000
const T0 = 1_800_000_000_000
const etoile = (id: string, o: Partial<Star> = {}): Star => ({ id, url: `https://${id}.test/page`, title: `Titre ${id}`, pinned: false, dormant: true, index: 0, inactifDepuis: T0, ...o })
const ciel = (stars: Star[], activeId: string | null = null): SkyState => ({ stars, constellations: [], activeId, pinned: stars.filter((s) => s.pinned).map((s) => s.id) })

describe('etoilesEteintes', () => {
  it('dormante dont l’inactivité dépasse le seuil', () => {
    const c = ciel([etoile('vieille', { inactifDepuis: T0 - 8 * JOUR }), etoile('recente', { inactifDepuis: T0 - 2 * JOUR })])
    expect(etoilesEteintes(c, T0, 7).map((s) => s.id)).toEqual(['vieille'])
  })

  it('le seuil est strict', () => {
    expect(etoilesEteintes(ciel([etoile('a', { inactifDepuis: T0 - 7 * JOUR })]), T0, 7)).toHaveLength(0)
    expect(etoilesEteintes(ciel([etoile('a', { inactifDepuis: T0 - 7 * JOUR - 1 })]), T0, 7)).toHaveLength(1)
  })

  it('null = jamais, 0 ou négatif aussi', () => {
    const c = ciel([etoile('a', { inactifDepuis: T0 - 1000 * JOUR })])
    expect(etoilesEteintes(c, T0, null)).toHaveLength(0)
    expect(etoilesEteintes(c, T0, 0)).toHaveLength(0)
  })

  it('jamais une étoile éveillée, active, épinglée ou sans date', () => {
    const vieux = T0 - 100 * JOUR
    const c = ciel(
      [
        etoile('eveillee', { dormant: false, inactifDepuis: vieux }),
        etoile('active', { inactifDepuis: vieux }),
        etoile('epinglee', { pinned: true, inactifDepuis: vieux }),
        etoile('sansdate', { inactifDepuis: undefined })
      ],
      'active'
    )
    expect(etoilesEteintes(c, T0, 1)).toHaveLength(0)
  })
})

function faux(c: SkyState): Archivable & { retirees: string[] } {
  const retirees: string[] = []
  return {
    retirees,
    ciel: () => c,
    retirer: (id) => {
      retirees.push(id)
      return true
    }
  }
}

function historiqueTmp(): History {
  return new History(join(mkdtempSync(join(tmpdir(), 'lyra-arch-')), 'h.jsonl'))
}

describe('archiverFenetre', () => {
  const vieille = (id: string): Star => etoile(id, { inactifDepuis: T0 - 40 * JOUR })

  it('retire l’étoile du ciel et l’écrit dans l’historique', () => {
    const h = historiqueTmp()
    const f = faux(ciel([vieille('a'), etoile('b')]))
    expect(archiverFenetre(f, { prive: false, jours: 30, maintenant: T0, historique: h })).toBe(1)
    expect(f.retirees).toEqual(['a'])
    const res = h.rechercher('a.test')
    expect(res).toHaveLength(1)
    expect(res[0].title).toBe('Titre a')
    expect(res[0].visitedAt).toBe(T0 - 40 * JOUR)
  })

  it('une page déjà dans l’historique n’y gagne pas de visite', () => {
    const h = historiqueTmp()
    h.ajouter({ url: 'https://a.test/page', title: 'Déjà là', date: T0 - 50 * JOUR })
    archiverFenetre(faux(ciel([vieille('a'), etoile('z')])), { prive: false, jours: 30, maintenant: T0, historique: h })
    const [e] = h.rechercher('a.test')
    expect(e.visites).toBe(1)
    expect(e.title).toBe('Déjà là')
  })

  it('jamais en fenêtre privée : rien retiré, rien écrit', () => {
    const h = historiqueTmp()
    const f = faux(ciel([vieille('a'), etoile('b')]))
    expect(archiverFenetre(f, { prive: true, jours: 30, maintenant: T0, historique: h })).toBe(0)
    expect(f.retirees).toEqual([])
    expect(h.rechercher('a.test')).toHaveLength(0)
  })

  it('jamais (null) : rien ne bouge', () => {
    const f = faux(ciel([vieille('a')]))
    expect(archiverFenetre(f, { prive: false, jours: null, maintenant: T0, historique: historiqueTmp() })).toBe(0)
    expect(f.retirees).toEqual([])
  })

  it('une étoile que la fenêtre refuse de retirer n’est pas écrite', () => {
    const h = historiqueTmp()
    const f = { ciel: () => ciel([vieille('a')]), retirer: () => false }
    expect(archiverFenetre(f, { prive: false, jours: 30, maintenant: T0, historique: h })).toBe(0)
    expect(h.rechercher('a.test')).toHaveLength(0)
  })

  it('sans historique, on n’archive pas : rien n’est retiré sans être écrit', () => {
    const f = faux(ciel([vieille('a')]))
    expect(archiverFenetre(f, { prive: false, jours: 30, maintenant: T0, historique: undefined })).toBe(0)
    expect(f.retirees).toEqual([])
  })
})

describe('demarrerArchivage', () => {
  afterEach(() => vi.useRealTimers())

  it('vérifie au démarrage puis chaque heure avec l’horloge injectée', () => {
    vi.useFakeTimers()
    let maintenant = T0
    const f = faux(ciel([etoile('a', { inactifDepuis: T0 - 5 * JOUR })]))
    const h = historiqueTmp()
    const a = demarrerArchivage({
      fenetres: () => [{ tabs: f, privee: false }],
      jours: () => 30,
      historique: () => h,
      maintenant: () => maintenant
    })
    expect(f.retirees).toEqual([])
    maintenant = T0 + 40 * JOUR
    vi.advanceTimersByTime(3_600_000)
    expect(f.retirees).toEqual(['a'])
    a.arreter()
  })

  it('la vérification de démarrage agit tout de suite et saute les fenêtres privées', () => {
    const publique = faux(ciel([etoile('a', { inactifDepuis: T0 - 50 * JOUR })]))
    const privee = faux(ciel([etoile('p', { inactifDepuis: T0 - 50 * JOUR })]))
    const a = demarrerArchivage({
      fenetres: () => [
        { tabs: publique, privee: false },
        { tabs: privee, privee: true }
      ],
      jours: () => 30,
      historique: () => historiqueTmp(),
      maintenant: () => T0
    })
    expect(publique.retirees).toEqual(['a'])
    expect(privee.retirees).toEqual([])
    a.arreter()
  })

  it('verifier() renvoie le nombre d’étoiles archivées', () => {
    const f = faux(ciel([etoile('a', { inactifDepuis: T0 - 50 * JOUR })]))
    const a = demarrerArchivage({ fenetres: () => [{ tabs: f, privee: false }], jours: () => null, historique: () => historiqueTmp(), maintenant: () => T0 })
    expect(a.verifier()).toBe(0)
    a.arreter()
  })
})
