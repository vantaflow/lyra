import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chargerCandidats, sourcesParDefaut, type Source } from './sources'

const A: Source = { url: 'http://a.test/socks5.txt', protocole: 'socks5' }
const B: Source = { url: 'http://b.test/http.txt', protocole: 'http' }
const T0 = new Date('2026-10-19T10:00:00Z')
const rep = (corps: string, ok = true): Promise<Response> => Promise.resolve(new Response(corps, { status: ok ? 200 : 500 }))
const fausse = (f: (u: string, init?: RequestInit) => Promise<Response>): typeof globalThis.fetch => f as unknown as typeof globalThis.fetch

let dir: string
let cache: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lyra-src-'))
  cache = join(dir, 'passerelles.json')
  delete process.env.LYRA_PASSERELLES_SOURCES
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.LYRA_PASSERELLES_SOURCES
})

describe('chargerCandidats', () => {
  it('récupère, fusionne et met en cache', async () => {
    const fetch = fausse((u) => (u === A.url ? rep('8.8.8.8:1080\n') : rep('socks5://1.1.1.1:9\n9.9.9.9:3128')))
    const r = await chargerCandidats({ fetch, cacheFichier: cache, maintenant: T0, sources: [A, B] })
    expect(r.source).toBe('reseau')
    expect(r.date).toBe(T0.toISOString())
    expect(r.candidats).toEqual([
      { type: 'socks5', hote: '8.8.8.8', port: 1080 },
      { type: 'socks5', hote: '1.1.1.1', port: 9 },
      { type: 'http', hote: '9.9.9.9', port: 3128 }
    ])
    expect(JSON.parse(readFileSync(cache, 'utf8')).candidats).toHaveLength(3)
    expect(existsSync(cache + '.tmp')).toBe(false)
  })

  it('succès partiel : une source en échec n’empêche pas les autres', async () => {
    const fetch = fausse((u) => (u === A.url ? Promise.reject(new Error('hors ligne')) : rep('9.9.9.9:3128')))
    const r = await chargerCandidats({ fetch, cacheFichier: cache, maintenant: T0, sources: [A, B] })
    expect(r.source).toBe('reseau')
    expect(r.candidats).toEqual([{ type: 'http', hote: '9.9.9.9', port: 3128 }])
  })

  it('statut HTTP en erreur = source en échec', async () => {
    const r = await chargerCandidats({ fetch: fausse(() => rep('8.8.8.8:1', false)), cacheFichier: cache, maintenant: T0, sources: [A] })
    expect(r).toMatchObject({ candidats: [], source: 'vide' })
  })

  it('cache valide (< 30 min) : aucune requête', async () => {
    writeFileSync(cache, JSON.stringify({ date: '2026-10-19T09:45:00.000Z', candidats: [{ type: 'http', hote: '9.9.9.9', port: 80 }] }))
    let appels = 0
    const fetch = fausse(() => (appels++, rep('')))
    const r = await chargerCandidats({ fetch, cacheFichier: cache, maintenant: T0, sources: [A] })
    expect(appels).toBe(0)
    expect(r.source).toBe('cache')
    expect(r.candidats).toHaveLength(1)
    expect(r.date).toBe('2026-10-19T09:45:00.000Z')
  })

  it('cache périmé + réseau OK : réseau', async () => {
    writeFileSync(cache, JSON.stringify({ date: '2026-10-19T09:00:00.000Z', candidats: [{ type: 'http', hote: '9.9.9.9', port: 80 }] }))
    const r = await chargerCandidats({ fetch: fausse(() => rep('8.8.8.8:1080')), cacheFichier: cache, maintenant: T0, sources: [A] })
    expect(r.source).toBe('reseau')
    expect(r.candidats).toEqual([{ type: 'socks5', hote: '8.8.8.8', port: 1080 }])
  })

  it('tout en échec avec cache périmé : cache-perime', async () => {
    writeFileSync(cache, JSON.stringify({ date: '2026-10-19T09:00:00.000Z', candidats: [{ type: 'http', hote: '9.9.9.9', port: 80 }] }))
    const r = await chargerCandidats({ fetch: fausse(() => Promise.reject(new Error('x'))), cacheFichier: cache, maintenant: T0, sources: [A, B] })
    expect(r.source).toBe('cache-perime')
    expect(r.candidats).toHaveLength(1)
    expect(r.date).toBe('2026-10-19T09:00:00.000Z')
  })

  it('tout en échec sans cache : vide', async () => {
    const r = await chargerCandidats({ fetch: fausse(() => Promise.reject(new Error('x'))), cacheFichier: cache, maintenant: T0, sources: [A] })
    expect(r).toEqual({ candidats: [], date: T0.toISOString(), source: 'vide' })
  })

  it.each([
    'pas du json{',
    '{"date":"nimporte","candidats":[]}',
    '{"date":"2026-10-19T09:59:00.000Z","candidats":"x"}',
    '[1,2]',
    '{"date":"2026-10-19T09:59:00.000Z","candidats":[{"type":"ftp","hote":"1.1.1.1","port":1},{"type":"http","hote":"10.0.0.1","port":80}]}'
  ])('cache corrompu (%s) : ignoré sans crash', async (contenu) => {
    writeFileSync(cache, contenu)
    const r = await chargerCandidats({ fetch: fausse(() => rep('8.8.8.8:1080')), cacheFichier: cache, maintenant: T0, sources: [A] })
    expect(r.source).toBe('reseau')
    expect(r.candidats).toHaveLength(1)
  })

  it('contenu de liste corrompu : pas de crash, vide', async () => {
    const r = await chargerCandidats({ fetch: fausse(() => rep('<html>erreur</html>\n\u0000\u0001garbage')), cacheFichier: cache, maintenant: T0, sources: [A] })
    expect(r).toMatchObject({ candidats: [], source: 'vide' })
  })

  it('LYRA_PASSERELLES_SOURCES remplace les sources', async () => {
    process.env.LYRA_PASSERELLES_SOURCES = 'http://127.0.0.1:1/socks5.txt, http://127.0.0.1:1/liste.txt'
    const vus: string[] = []
    const fetch = fausse((u) => (vus.push(u), rep('8.8.8.8:1080')))
    const r = await chargerCandidats({ fetch, cacheFichier: cache, maintenant: T0 })
    expect(vus).toEqual(['http://127.0.0.1:1/socks5.txt', 'http://127.0.0.1:1/liste.txt'])
    expect(r.candidats[0]).toEqual({ type: 'socks5', hote: '8.8.8.8', port: 1080 })
  })

  it('file:// lu depuis le disque (tests e2e)', async () => {
    const f = join(dir, 'liste.txt')
    writeFileSync(f, '8.8.4.4:3128\n')
    process.env.LYRA_PASSERELLES_SOURCES = pathToFileURL(f).href
    const r = await chargerCandidats({ fetch: fausse(() => Promise.reject(new Error('inutile'))), cacheFichier: cache, maintenant: T0 })
    expect(r.candidats).toEqual([{ type: 'http', hote: '8.8.4.4', port: 3128 }])
  })

  it('la requête porte un signal de délai', async () => {
    let signal: AbortSignal | null | undefined
    const fetch = fausse((_u, init) => ((signal = init?.signal), rep('8.8.8.8:1')))
    await chargerCandidats({ fetch, cacheFichier: cache, maintenant: T0, sources: [A] })
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('sources par défaut : raw.githubusercontent.com en https', () => {
    const s = sourcesParDefaut()
    expect(s.length).toBe(7)
    expect(s.every((x) => x.url.startsWith('https://raw.githubusercontent.com/'))).toBe(true)
  })
})
