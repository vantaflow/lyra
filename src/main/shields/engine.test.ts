import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Request } from '@ghostery/adblocker'
import { parse } from 'tldts-experimental'
import { construireMoteur, mettreAJour, type ResultatMoteur } from './engine'
import { chargerListesEmbarquees, type ListesEmbarquees } from './listes'

const dossier = (p: string) => mkdtemp(join(tmpdir(), p))
const req = (url: string, type: 'script' | 'xhr' | 'image', sourceUrl = 'https://www.youtube.com/') =>
  Request.fromRawDetails({ url, sourceUrl, type })

let emb: ListesEmbarquees
let reel: ResultatMoteur
let cacheReel: string

beforeAll(async () => {
  emb = await chargerListesEmbarquees('resources/shields')
  cacheReel = await dossier('lyra-cache-')
  reel = await construireMoteur({ cacheDir: cacheReel, listesEmbarquees: emb, listesDistantes: [], majHeures: 6, maintenant: new Date(emb.date) })
}, 60_000)

describe('moteur sur les listes embarquées', () => {
  it('construit depuis les listes embarquées', () => {
    expect(reel.source).toBe('embarque')
    expect(reel.date).toBe(emb.date)
  })

  it('bloque les pubs', () => {
    expect(reel.moteur.match(req('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', 'script')).match).toBe(true)
    expect(reel.moteur.match(req('https://www.youtube.com/api/stats/ads?x=1', 'xhr')).match).toBe(true)
  })

  it('redirige ad_status.js', () => {
    const r = reel.moteur.match(req('https://static.doubleclick.net/instream/ad_status.js', 'script'))
    expect(r.redirect).toBeDefined()
  })

  it('laisse passer le lecteur et les miniatures', () => {
    expect(reel.moteur.match(req('https://www.youtube.com/s/player/abc/base.js', 'script')).match).toBe(false)
    expect(reel.moteur.match(req('https://i.ytimg.com/vi/x/hqdefault.jpg', 'image')).match).toBe(false)
  })

  it('fournit les scriptlets pour youtube.com', () => {
    const url = 'https://www.youtube.com/watch?v=x'
    const { hostname, domain } = parse(url)
    const c = reel.moteur.getCosmeticsFilters({
      url,
      hostname: hostname ?? '',
      domain: domain ?? '',
      getBaseRules: true,
      getInjectionRules: true,
      getExtendedRules: true,
      getRulesFromHostname: true,
      getRulesFromDOM: false
    })
    expect(c.scripts.join('\n')).toContain('adPlacements')
  })

  it('réutilise le cache valide', async () => {
    const r = await construireMoteur({ cacheDir: cacheReel, listesDistantes: [], majHeures: 6, maintenant: new Date(new Date(emb.date).getTime() + 3600_000) })
    expect(r.source).toBe('cache')
    expect(r.moteur.match(req('https://www.youtube.com/api/stats/ads?x=1', 'xhr')).match).toBe(true)
  })
})

describe('cache et réseau', () => {
  const mini = readFile('src/main/shields/fixtures/mini-liste.txt', 'utf8')
  const miniEmb = async (): Promise<ListesEmbarquees> => ({ textes: [await mini], date: '2026-01-01T00:00:00.000Z' })

  it('cache corrompu : reconstruction sans exception', async () => {
    const cacheDir = await dossier('lyra-corrompu-')
    await writeFile(join(cacheDir, 'engine.bin'), 'zzz')
    await writeFile(join(cacheDir, 'engine.meta.json'), JSON.stringify({ date: '2026-01-01T00:00:00.000Z', engineVersion: (await import('@ghostery/adblocker')).ENGINE_VERSION }))
    const r = await construireMoteur({ cacheDir, listesEmbarquees: await miniEmb(), listesDistantes: [], majHeures: 6, maintenant: new Date('2026-01-01T01:00:00.000Z') })
    expect(r.source).toBe('embarque')
    expect(r.moteur.match(req('https://ads.exemple.test/x.js', 'script')).match).toBe(true)
  })

  it('cache périmé : réseau avec un fetch factice', async () => {
    const cacheDir = await dossier('lyra-perime-')
    const embarquees = await miniEmb()
    await construireMoteur({ cacheDir, listesEmbarquees: embarquees, listesDistantes: [], majHeures: 6, maintenant: new Date(embarquees.date) })
    const faux = (async () => new Response(await mini)) as unknown as typeof fetch
    const maintenant = new Date('2026-01-02T00:00:00.000Z')
    const r = await construireMoteur({ cacheDir, listesEmbarquees: embarquees, listesDistantes: ['https://liste.test/a.txt'], fetch: faux, majHeures: 6, maintenant })
    expect(r.source).toBe('reseau')
    expect(r.date).toBe(maintenant.toISOString())
    expect((await mettreAJour({ cacheDir, listesDistantes: ['https://liste.test/a.txt'], fetch: faux, majHeures: 6, maintenant }, r)).source).toBe('reseau')
  })

  it('échec réseau : repli sur les listes embarquées', async () => {
    const cacheDir = await dossier('lyra-offline-')
    const echec = (async () => { throw new Error('hors ligne') }) as unknown as typeof fetch
    const r = await construireMoteur({ cacheDir, listesEmbarquees: await miniEmb(), listesDistantes: ['https://liste.test/a.txt'], fetch: echec, majHeures: 6 })
    expect(r.source).toBe('embarque')
  })

  const urls = ['https://liste.test/a.txt', 'https://liste.test/b.txt']
  const partiel = (async (u: string | URL | Request) =>
    String(u).endsWith('b.txt') ? new Response('', { status: 500 }) : new Response(await mini)) as unknown as typeof fetch

  it('une liste sur deux en échec : pas de voie réseau', async () => {
    const cacheDir = await dossier('lyra-partiel-')
    const r = await construireMoteur({ cacheDir, listesEmbarquees: await miniEmb(), listesDistantes: urls, fetch: partiel, majHeures: 6 })
    expect(r.source).toBe('embarque')
  })

  it('cache périmé + réseau en échec : cache périmé', async () => {
    const cacheDir = await dossier('lyra-perime-echec-')
    const embarquees = await miniEmb()
    await construireMoteur({ cacheDir, listesEmbarquees: embarquees, listesDistantes: [], majHeures: 6, maintenant: new Date(embarquees.date) })
    const r = await construireMoteur({ cacheDir, listesEmbarquees: embarquees, listesDistantes: urls, fetch: partiel, majHeures: 6, maintenant: new Date('2026-02-01T00:00:00.000Z') })
    expect(r.source).toBe('cache')
    expect(r.date).toBe(embarquees.date)
  })

  it('sans fetch, cache périmé plus récent que les listes embarquées : cache', async () => {
    const cacheDir = await dossier('lyra-demarrage-')
    const embarquees = await miniEmb()
    const faux = (async () => new Response('||reseau.test^')) as unknown as typeof fetch
    await construireMoteur({ cacheDir, listesEmbarquees: embarquees, listesDistantes: ['https://liste.test/a.txt'], fetch: faux, majHeures: 6, maintenant: new Date('2026-01-05T00:00:00.000Z') })
    const r = await construireMoteur({ cacheDir, listesEmbarquees: embarquees, listesDistantes: [], majHeures: 6, maintenant: new Date('2026-02-01T00:00:00.000Z') })
    expect(r.source).toBe('cache')
    expect(r.moteur.match(req('https://reseau.test/x.js', 'script')).match).toBe(true)
    const plusNeuves = { ...embarquees, date: '2026-01-10T00:00:00.000Z' }
    expect((await construireMoteur({ cacheDir, listesEmbarquees: plusNeuves, listesDistantes: [], majHeures: 6, maintenant: new Date('2026-02-01T00:00:00.000Z') })).source).toBe('embarque')
  })

  it('mettreAJour en échec : moteur actuel conservé, cache intact', async () => {
    const cacheDir = await dossier('lyra-maj-')
    const embarquees = await miniEmb()
    const actuel = await construireMoteur({ cacheDir, listesEmbarquees: embarquees, listesDistantes: [], majHeures: 6, maintenant: new Date(embarquees.date) })
    const avant = await readFile(join(cacheDir, 'engine.meta.json'), 'utf8')
    const r = await mettreAJour({ cacheDir, listesDistantes: urls, fetch: partiel, majHeures: 6 }, actuel)
    expect(r).toBe(actuel)
    expect(await readFile(join(cacheDir, 'engine.meta.json'), 'utf8')).toBe(avant)
  })

  it('délai d\'attente par liste', async () => {
    const cacheDir = await dossier('lyra-timeout-')
    const muet = ((_u: unknown, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal?.reason)))) as unknown as typeof fetch
    const r = await construireMoteur({ cacheDir, listesEmbarquees: await miniEmb(), listesDistantes: urls, fetch: muet, majHeures: 6, timeoutMs: 50 })
    expect(r.source).toBe('embarque')
  })
})
