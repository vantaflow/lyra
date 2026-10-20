import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ERREUR_PHRASE } from '../../shared/exportTextes'
import type { SkyState } from '../../shared/types'
import { reglagesParDefaut } from '../settings/defaults'
import type { Visite } from '../import/types'
import { chiffrer, dechiffrer, lireEnTete } from './chiffrement'
import { construireZip, creerPaquet, lirePaquet, type CookieSauvegarde, type SourcesPaquet } from './paquet'

const PHRASE = 'une phrase de passe solide'

const ciel: SkyState = {
  constellations: [{ id: 'c1', name: 'Travail', color: '#5B8DEF' }],
  stars: [
    { id: 's1', url: 'https://a.fr/', title: 'A', pinned: true, dormant: false, index: 0, constellationId: 'c1' },
    { id: 's2', url: 'https://b.fr/', title: 'B', pinned: false, dormant: false, index: 1 }
  ],
  activeId: 's1',
  pinned: ['s1']
}
const cookie: CookieSauvegarde = { name: 'sid', value: 'abc', domain: '.exemple.fr', path: '/', secure: true, httpOnly: true, hostOnly: false, sameSite: 'lax', expirationDate: 2_000_000_000 }

function sources(extra: Partial<SourcesPaquet> = {}): SourcesPaquet {
  const reglages = reglagesParDefaut('/tmp/dl')
  reglages.theme = 'sombre'
  reglages.sites = { 'https://exemple.fr': { boucliers: false, zoom: 1.5 } }
  reglages.import.extensionsEnAttente = [{ id: 'a'.repeat(32), nom: 'Ext', magasin: 'chrome', actif: true, source: 'chrome', date: 1 }]
  return {
    version: '0.1.0',
    reglages,
    favoris: [{ url: 'https://f.fr/', title: 'F', dossier: 'Dossier / Sous', date: 1_700_000_000_000 }],
    ciel,
    visites: () => [{ url: 'https://h.fr/', titre: 'H', date: 1_700_000_000_000 }, { url: 'https://h.fr/', titre: 'H', date: 1_700_000_100_000 }],
    ...extra
  }
}

const lots = async (it: AsyncIterable<Visite[]>): Promise<Visite[]> => {
  const t: Visite[] = []
  for await (const l of it) t.push(...l)
  return t
}

describe('paquet .lyra', () => {
  it('aller-retour : réglages, règles par site, thème, extensions, ciel, favoris, historique', async () => {
    const p = await creerPaquet(sources(), PHRASE)
    const c = await lirePaquet(p, PHRASE)
    expect(c.manifest).toMatchObject({ format: 'lyra-paquet', version: 1, lyra: '0.1.0', cookies: false })
    expect(c.reglages.theme).toBe('sombre')
    expect(c.reglages.sites).toEqual({ 'https://exemple.fr': { boucliers: false, zoom: 1.5 } })
    expect(c.reglages.langue).toBeDefined()
    expect(c.reglages).not.toHaveProperty('import')
    expect(c.extensions).toEqual([{ id: 'a'.repeat(32), nom: 'Ext', magasin: 'chrome', actif: true }])
    expect(c.favoris).toEqual(sources().favoris)
    expect(c.ciel?.etoiles.map((e) => e.url)).toEqual(['https://a.fr/', 'https://b.fr/'])
    expect(c.ciel?.constellations[0]).toMatchObject({ nom: 'Travail', couleur: '#5B8DEF' })
    expect((await lots(c.visites)).map((v) => [v.url, v.date, v.visites])).toEqual([['https://h.fr/', 1_700_000_000_000, 1], ['https://h.fr/', 1_700_000_100_000, 1]])
    expect(c.cookies).toBeUndefined()
  })

  it('contenu du zip : manifeste + un fichier par élément, jamais de cookies par défaut', async () => {
    const z = unzipSync(await construireZip(sources()))
    expect(Object.keys(z).sort()).toEqual(['ciel.json', 'extensions.json', 'favoris.json', 'historique.jsonl', 'manifest.json', 'reglages.json', 'regles-sites.json', 'themes.json'])
    const m = JSON.parse(new TextDecoder().decode(z['manifest.json']))
    expect(m.contenu).toEqual(expect.arrayContaining(['reglages.json', 'ciel.json']))
    expect(m.cookies).toBe(false)
    expect(Object.keys(z)).not.toContain('cookies.json')
  })

  it('cookies seulement si fournis, restitués à la lecture', async () => {
    const z = unzipSync(await construireZip(sources({ cookies: [cookie] })))
    expect(Object.keys(z)).toContain('cookies.json')
    expect(JSON.parse(new TextDecoder().decode(z['manifest.json'])).cookies).toBe(true)
    const c = await lirePaquet(await creerPaquet(sources({ cookies: [cookie] }), PHRASE), PHRASE)
    expect(c.cookies).toEqual([cookie])
  })

  it('jamais de mot de passe : ni fichier, ni clé de réglage, même si un champ intrus arrive', async () => {
    const s = sources()
    ;(s.reglages as unknown as Record<string, unknown>).motDePasse = 'x'
    ;(s.reglages as unknown as { reseau: Record<string, unknown> }).reseau.password = 'y'
    const z = unzipSync(await construireZip(s))
    const tout = Object.values(z).map((u) => new TextDecoder().decode(u)).join('\n')
    expect(Object.keys(z).join()).not.toMatch(/pass|mdp|password/i)
    expect(tout).not.toMatch(/"[^"]*(pass(word)?|mdp|motdepasse|secret)[^"]*"\s*:/i)
    expect(tout).not.toContain('"y"')
  })

  it('chiffré : en-tête LYRA1, itérations ≥ 600 000, ni zip ni JSON lisibles', async () => {
    const p = await creerPaquet(sources(), PHRASE)
    expect(lireEnTete(p).iterations).toBeGreaterThanOrEqual(600_000)
    expect(Buffer.from(p.subarray(0, 5)).toString('latin1')).toBe('LYRA1')
    expect(Buffer.from(p).includes(Buffer.from('PK\u0003\u0004'))).toBe(false)
    expect(Buffer.from(p).includes(Buffer.from('https://'))).toBe(false)
  })

  it('mauvaise phrase, fichier tronqué ou modifié : erreur claire', async () => {
    const p = await creerPaquet(sources(), PHRASE)
    await expect(lirePaquet(p, 'autre phrase de passe')).rejects.toThrow(ERREUR_PHRASE)
    await expect(lirePaquet(p.subarray(0, p.length - 40), PHRASE)).rejects.toThrow(ERREUR_PHRASE)
    const m = Uint8Array.from(p)
    m[m.length - 20] ^= 0xff
    await expect(lirePaquet(m, PHRASE)).rejects.toThrow(ERREUR_PHRASE)
  })

  it('contenu déchiffré mais pas un zip, ou version future : refus explicite', async () => {
    await expect(lirePaquet(await chiffrer(new TextEncoder().encode('pas un zip'), PHRASE), PHRASE)).rejects.toThrow(/endommagé|illisible/i)
    const bon = await construireZip(sources())
    const z = unzipSync(bon)
    const m = JSON.parse(new TextDecoder().decode(z['manifest.json']))
    m.version = 2
    const { zipSync, strToU8 } = await import('fflate')
    const futur = zipSync({ ...z, 'manifest.json': strToU8(JSON.stringify(m)) })
    await expect(lirePaquet(await chiffrer(futur, PHRASE), PHRASE)).rejects.toThrow(/plus récente/)
  })

  it('élément invalide ignoré, le reste est lu', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const z = unzipSync(await construireZip(sources()))
    const abime = zipSync({ ...z, 'favoris.json': strToU8('{pas du json'), 'ciel.json': strToU8('[]'), 'historique.jsonl': strToU8('ligne 1\n{"url":"https://ok.fr/","titre":"ok","date":5}\n[1]\n') })
    const c = await lirePaquet(await chiffrer(abime, PHRASE), PHRASE)
    expect(c.favoris).toEqual([])
    expect(c.ciel).toBeUndefined()
    expect((await lots(c.visites)).map((v) => v.url)).toEqual(['https://ok.fr/'])
    expect(c.reglages.theme).toBe('sombre')
    expect(c.avertissements.length).toBeGreaterThanOrEqual(2)
  })

  it('100 000 visites : écrites par lots, avec une pause entre deux lots, et toutes relues', async () => {
    const visites = function* (): Generator<{ url: string; titre: string; date: number }> {
      for (let i = 0; i < 100_000; i++) yield { url: `https://h${i % 5000}.fr/p${i}`, titre: `t${i}`, date: 1_700_000_000_000 + i }
    }
    let pauses = 0
    const clair = await construireZip(sources({ visites }), { pause: async () => void pauses++ })
    expect(pauses).toBeGreaterThanOrEqual(19)
    const c = await lirePaquet(await chiffrer(clair, PHRASE), PHRASE)
    const tous = await lots(c.visites)
    expect(tous).toHaveLength(100_000)
    expect(tous[99_999]).toEqual({ url: 'https://h4999.fr/p99999', titre: 't99999', date: 1_700_000_099_999, visites: 1 })
  }, 60_000)

  it('déchiffrement direct : le contenu est bien un zip', async () => {
    const z = unzipSync(await dechiffrer(await creerPaquet(sources(), PHRASE), PHRASE))
    expect(z['manifest.json']).toBeDefined()
  })
})
