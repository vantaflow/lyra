import { describe, it, expect, afterEach } from 'vitest'
import { trouverPasserelles, PoolSessions, creerTesteur, TAILLE_POOL, type SessionTest } from './testeur'
import type { Candidat } from './liste'

const cands = (n: number): Candidat[] => Array.from({ length: n }, (_, i) => ({ type: 'http' as const, hote: `8.8.8.${i + 1}`, port: 80 }))
const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('trouverPasserelles', () => {
  it('borne le parallélisme', async () => {
    let actifs = 0
    let pic = 0
    const tester = async (): Promise<{ ok: boolean; ms: number }> => {
      actifs++
      pic = Math.max(pic, actifs)
      await attendre(5)
      actifs--
      return { ok: false, ms: 0 }
    }
    await trouverPasserelles(cands(40), { parallele: 4, max: 40, garder: 5, tester })
    expect(pic).toBeLessThanOrEqual(4)
    expect(pic).toBeGreaterThan(1)
  })

  it('s’arrête au max de candidats testés', async () => {
    let n = 0
    const tester = async (): Promise<{ ok: boolean; ms: number }> => (n++, { ok: false, ms: 0 })
    await trouverPasserelles(cands(100), { parallele: 5, max: 12, tester })
    expect(n).toBe(12)
  })

  it('trie par latence et garde les meilleures', async () => {
    const lat: Record<string, number> = { '8.8.8.1': 300, '8.8.8.2': 50, '8.8.8.3': 0, '8.8.8.4': 120, '8.8.8.5': 10 }
    const tester = async (c: Candidat): Promise<{ ok: boolean; ms: number }> => ({ ok: c.hote !== '8.8.8.3', ms: lat[c.hote] })
    const r = await trouverPasserelles(cands(5), { garder: 3, tester })
    expect(r.map((c) => c.hote)).toEqual(['8.8.8.5', '8.8.8.2', '8.8.8.4'])
  })

  it('liste vide ou tout en échec : []', async () => {
    expect(await trouverPasserelles([], { tester: async () => ({ ok: true, ms: 1 }) })).toEqual([])
    expect(await trouverPasserelles(cands(3), { tester: async () => ({ ok: false, ms: 0 }) })).toEqual([])
  })

  it('un testeur qui lève est un échec, sans crash', async () => {
    const tester = async (c: Candidat): Promise<{ ok: boolean; ms: number }> => {
      if (c.hote === '8.8.8.1') throw new Error('boum')
      return { ok: true, ms: 5 }
    }
    const r = await trouverPasserelles(cands(2), { tester })
    expect(r.map((c) => c.hote)).toEqual(['8.8.8.2'])
  })
})

function fausseSession(statut: number | 'pend' | 'erreur', journal: string[], nom = ''): SessionTest {
  return {
    setProxy: async (c) => void journal.push(`proxy:${nom}:${c.proxyRules}`),
    fetch: async (_u, init) => {
      journal.push(`redirect:${init?.redirect}`)
      if (statut === 'erreur') throw new Error('x')
      if (statut === 'pend') return new Promise<Response>((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('abort'))))
      return new Response(null, { status: statut })
    },
    closeAllConnections: () => void journal.push(`close:${nom}`),
    clearCache: async () => void journal.push(`clear:${nom}`)
  }
}

describe('PoolSessions / creerTesteur', () => {
  afterEach(() => {
    delete process.env.LYRA_TEST
    delete process.env.LYRA_PASSERELLES_CIBLE
  })

  it('jamais plus de N emplacements distincts, même après 100 tests', async () => {
    const noms = new Set<string>()
    const pool = new PoolSessions(TAILLE_POOL, (nom) => (noms.add(nom), fausseSession(204, [], nom)))
    const tester = creerTesteur(pool)
    const r = await trouverPasserelles(cands(100), { parallele: 15, max: 100, garder: 100, tester: (x) => tester(x) })
    expect(r).toHaveLength(100)
    expect(noms.size).toBeLessThanOrEqual(15)
    expect([...noms].every((n) => /^passerelle-test-slot-\d+$/.test(n))).toBe(true)
    await tester(cands(1)[0])
    expect(noms.size).toBeLessThanOrEqual(15)
  })

  it('un emprunteur attend un emplacement libre', async () => {
    const pool = new PoolSessions(1, () => fausseSession(204, []))
    const a = await pool.emprunter()
    let obtenu = false
    const p = pool.emprunter().then((e) => ((obtenu = true), e))
    await attendre(5)
    expect(obtenu).toBe(false)
    a.rendre()
    ;(await p).rendre()
    expect(obtenu).toBe(true)
  })

  it('204 exigé pour la cible par défaut (200 refusé), aucune redirection suivie', async () => {
    const j: string[] = []
    const t200 = creerTesteur(new PoolSessions(1, () => fausseSession(200, j)))
    expect((await t200(cands(1)[0])).ok).toBe(false)
    const t204 = creerTesteur(new PoolSessions(1, () => fausseSession(204, j)))
    expect((await t204(cands(1)[0])).ok).toBe(true)
    expect(j).toContain('redirect:error')
  })

  it('200 accepté quand une cible de test est fournie', async () => {
    const t = creerTesteur(new PoolSessions(1, () => fausseSession(200, [])))
    expect((await t(cands(1)[0], { cible: 'http://127.0.0.1:9/ok' })).ok).toBe(true)
  })

  it('LYRA_PASSERELLES_CIBLE ignorée sans LYRA_TEST=1, lue avec', async () => {
    process.env.LYRA_PASSERELLES_CIBLE = 'http://127.0.0.1:9/ok'
    const t = creerTesteur(new PoolSessions(1, () => fausseSession(200, [])))
    expect((await t(cands(1)[0])).ok).toBe(false)
    process.env.LYRA_TEST = '1'
    expect((await t(cands(1)[0])).ok).toBe(true)
  })

  it('délai global : une requête qui pend échoue vite, emplacement rendu et nettoyé', async () => {
    const j: string[] = []
    const pool = new PoolSessions(1, () => fausseSession('pend', j, 's'))
    const r = await creerTesteur(pool)(cands(1)[0], { timeoutMs: 30 })
    expect(r.ok).toBe(false)
    expect(j).toContain('clear:s')
    ;(await pool.emprunter()).rendre()
  })

  it('erreur réseau : ok=false sans lever', async () => {
    const t = creerTesteur(new PoolSessions(1, () => fausseSession('erreur', [])))
    expect((await t(cands(1)[0])).ok).toBe(false)
  })
})

describe('emplacement rendu après la fin réelle de l’essai', () => {
  const attendreMs = attendre

  it('setProxy tardif : le test suivant n’obtient pas l’emplacement avant la fin de l’ancien essai', async () => {
    const j: string[] = []
    let appels = 0
    const session: SessionTest = {
      setProxy: async (c) => {
        const n = ++appels
        if (n === 1) await attendreMs(80)
        j.push(`setProxy-fin-${n}:${c.proxyRules}`)
      },
      fetch: async () => (j.push('fetch'), new Response(null, { status: 204 })),
      closeAllConnections: () => undefined,
      clearCache: async () => undefined
    }
    const pool = new PoolSessions(1, () => session)
    const t = creerTesteur(pool)
    const r1 = await t(cands(1)[0], { timeoutMs: 20 })
    expect(r1.ok).toBe(false)
    expect(j).toEqual([])
    const r2 = await t(cands(2)[1])
    expect(r2.ok).toBe(true)
    expect(j[0]).toBe('setProxy-fin-1:http://8.8.8.1:80')
    expect(j[1]).toBe('setProxy-fin-2:http://8.8.8.2:80')
    // pas de fetch pour le test 1 : signal annulé après setProxy
    expect(j.filter((x) => x === 'fetch')).toHaveLength(1)
  })

  it('essai bloqué au-delà de la garde : emplacement remplacé (nouveau nom), pool non bloqué', async () => {
    const noms: string[] = []
    const pool = new PoolSessions(1, (nom) => {
      noms.push(nom)
      return noms.length === 1
        ? { ...fausseSession(204, []), setProxy: () => new Promise<void>(() => undefined) }
        : fausseSession(204, [], nom)
    })
    const t = creerTesteur(pool, 40)
    expect((await t(cands(1)[0], { timeoutMs: 10 })).ok).toBe(false)
    const r2 = await t(cands(1)[0])
    expect(r2.ok).toBe(true)
    expect(noms).toEqual(['passerelle-test-slot-0', 'passerelle-test-slot-0-1'])
  })
})
