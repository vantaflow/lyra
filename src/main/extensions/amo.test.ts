import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyserSourceAmo, creerClientAmo, infosDepuisReponse } from './amo'
import { analyserSourceFirefox } from './firefox'
import { ErreurIntrouvable, hoteAmo } from './reseau'

describe('analyserSourceAmo / analyserSourceFirefox', () => {
  it('adresses addons.mozilla.org avec ou sans langue', () => {
    expect(analyserSourceAmo('https://addons.mozilla.org/fr/firefox/addon/darkreader/')).toEqual({ type: 'slug', slug: 'darkreader' })
    expect(analyserSourceAmo('https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/?utm_source=x')).toEqual({ type: 'slug', slug: 'ublock-origin' })
    expect(analyserSourceAmo('https://addons.mozilla.org/firefox/addon/bitwarden-password-manager')).toEqual({ type: 'slug', slug: 'bitwarden-password-manager' })
    expect(analyserSourceAmo('https://addons.mozilla.org/fr/firefox/addon/%7B446900e4-71c2-419f-a6a7-df9c091e268b%7D/')).toEqual({ type: 'guid', guid: '{446900e4-71c2-419f-a6a7-df9c091e268b}' })
  })
  it('refuse un autre hôte, http, une page qui n\'est pas une fiche', () => {
    expect(analyserSourceAmo('https://addons.mozilla.org.evil.com/fr/firefox/addon/x/')).toBeUndefined()
    expect(analyserSourceAmo('http://addons.mozilla.org/fr/firefox/addon/x/')).toBeUndefined()
    expect(analyserSourceAmo('https://addons.mozilla.org/fr/firefox/')).toBeUndefined()
    expect(analyserSourceAmo('https://example.com/addon/x')).toBeUndefined()
  })
  it('slug, identifiant gecko, nom libre', () => {
    expect(analyserSourceAmo('darkreader')).toEqual({ type: 'slug', slug: 'darkreader' })
    expect(analyserSourceAmo('uBlock0@raymondhill.net')).toEqual({ type: 'guid', guid: 'uBlock0@raymondhill.net' })
    expect(analyserSourceAmo('{446900e4-71c2-419f-a6a7-df9c091e268b}')).toEqual({ type: 'guid', guid: '{446900e4-71c2-419f-a6a7-df9c091e268b}' })
    expect(analyserSourceAmo('Dark Reader')).toEqual({ type: 'recherche', texte: 'Dark Reader' })
  })
  it('chemins et fichiers ne sont pas des noms AMO', () => {
    expect(analyserSourceAmo('/tmp/x.xpi')).toBeUndefined()
    expect(analyserSourceAmo('C:\\x\\y')).toBeUndefined()
    expect(analyserSourceAmo('')).toBeUndefined()
    expect(analyserSourceAmo('a'.repeat(400))).toBeUndefined()
  })
  it('analyserSourceFirefox : .xpi absolu, AMO ; un .xpi relatif ou distant est refusé', () => {
    expect(analyserSourceFirefox('/Users/x/e.xpi')).toEqual({ type: 'xpi' })
    expect(analyserSourceFirefox('C:\\Users\\x\\e.xpi')).toEqual({ type: 'xpi' })
    expect(analyserSourceFirefox('e.xpi')).toBeUndefined()
    expect(analyserSourceFirefox('https://exemple.org/e.xpi')).toBeUndefined()
    expect(analyserSourceFirefox('darkreader')).toEqual({ type: 'amo', amo: { type: 'slug', slug: 'darkreader' } })
  })
})

const HASH = 'a'.repeat(64)
const reponse = (o: Record<string, unknown> = {}): unknown => ({
  slug: 'darkreader',
  guid: 'addon@darkreader.org',
  name: { 'en-US': 'Dark Reader' },
  current_version: { version: '4.9.80', file: { url: 'https://addons.mozilla.org/firefox/downloads/file/1/darkreader-4.9.80.xpi', hash: `sha256:${HASH}` } },
  ...o
})

describe('infosDepuisReponse', () => {
  it('extrait nom, version, adresse et sha256', () => {
    expect(infosDepuisReponse(reponse())).toEqual({ slug: 'darkreader', guid: 'addon@darkreader.org', nom: 'Dark Reader', version: '4.9.80', url: 'https://addons.mozilla.org/firefox/downloads/file/1/darkreader-4.9.80.xpi', sha256: HASH })
  })
  it('nom en chaîne simple accepté', () => {
    expect(infosDepuisReponse(reponse({ name: 'Dark Reader' })).nom).toBe('Dark Reader')
  })
  it('hash absent ou pas sha256 : refusé (pas de vérification possible)', () => {
    const v = { version: '1', file: { url: 'https://addons.mozilla.org/x.xpi', hash: 'sha1:abc' } }
    expect(() => infosDepuisReponse(reponse({ current_version: v }))).toThrow(/sha256/)
    expect(() => infosDepuisReponse(reponse({ current_version: { version: '1', file: { url: 'https://addons.mozilla.org/x.xpi' } } }))).toThrow(/sha256/)
  })
  it("adresse de fichier hors AMO ou en http : refusée", () => {
    const f = (url: string): unknown => reponse({ current_version: { version: '1', file: { url, hash: `sha256:${HASH}` } } })
    expect(() => infosDepuisReponse(f('https://evil.example/x.xpi'))).toThrow(/refusée/)
    expect(() => infosDepuisReponse(f('http://addons.mozilla.org/x.xpi'))).toThrow(/refusée/)
    expect(infosDepuisReponse(f('https://addons.cdn.mozilla.net/user-media/addons/1/x.xpi')).url).toContain('cdn.mozilla.net')
  })
  it('réponse sans version courante', () => {
    expect(() => infosDepuisReponse({ slug: 'x' })).toThrow(/version courante/)
    expect(() => infosDepuisReponse(null)).toThrow()
  })
})

const sha = (o: Uint8Array): string => createHash('sha256').update(o).digest('hex')

describe('client AMO', () => {
  let cache: string
  beforeEach(() => {
    cache = mkdtempSync(join(tmpdir(), 'lyra-amo-'))
  })
  afterEach(() => rmSync(cache, { recursive: true, force: true }))

  function client(routes: Record<string, () => Uint8Array | string | 404>, appels: string[] = []) {
    return creerClientAmo({
      cache,
      requete: async (url, accepte, _max, tolere404) => {
        appels.push(url)
        if (!accepte(new URL(url).hostname)) throw new Error('hôte refusé')
        const cle = Object.keys(routes).find((k) => url.startsWith(k))
        if (!cle) throw new Error(`HTTP 500 ${url}`)
        const r = routes[cle]()
        if (r === 404) {
          if (tolere404) throw new ErreurIntrouvable()
          throw new Error('HTTP 404')
        }
        return typeof r === 'string' ? Buffer.from(r) : r
      }
    })
  }

  it('slug → API v5 addon/<slug>/', async () => {
    const appels: string[] = []
    const c = client({ 'https://addons.mozilla.org/api/v5/addons/addon/darkreader/': () => JSON.stringify(reponse()) }, appels)
    expect((await c.resoudre({ type: 'slug', slug: 'darkreader' })).version).toBe('4.9.80')
    expect(appels).toEqual(['https://addons.mozilla.org/api/v5/addons/addon/darkreader/?lang=en-US'])
  })
  it('identifiant gecko encodé dans le chemin', async () => {
    const appels: string[] = []
    const c = client({ 'https://addons.mozilla.org/api/v5/addons/addon/': () => JSON.stringify(reponse()) }, appels)
    await c.resoudre({ type: 'guid', guid: '{446900e4-71c2-419f-a6a7-df9c091e268b}' })
    expect(appels[0]).toContain('/addon/%7B446900e4-71c2-419f-a6a7-df9c091e268b%7D/')
  })
  it('slug inconnu : repli sur la recherche (résultat de même nom) ; nom libre : recherche', async () => {
    const appels: string[] = []
    const c = client(
      {
        'https://addons.mozilla.org/api/v5/addons/addon/dark%20reader/': () => 404,
        'https://addons.mozilla.org/api/v5/addons/addon/dark-reader/': () => 404,
        'https://addons.mozilla.org/api/v5/addons/search/': () => JSON.stringify({ results: [{ slug: 'dark-mode-x', name: { 'en-US': 'Dark Mode X' } }, { slug: 'darkreader', name: { 'en-US': 'Dark Reader' } }] }),
        'https://addons.mozilla.org/api/v5/addons/addon/darkreader/': () => JSON.stringify(reponse())
      },
      appels
    )
    expect((await c.resoudre({ type: 'slug', slug: 'dark-reader' })).slug).toBe('darkreader')
    expect((await c.resoudre({ type: 'recherche', texte: 'dark reader' })).slug).toBe('darkreader')
    expect(appels.some((u) => u.includes('/search/?q=dark+reader') && u.includes('app=firefox') && u.includes('type=extension'))).toBe(true)
  })
  it('la recherche ne prend jamais le premier résultat au hasard : le nom doit correspondre', async () => {
    const c = client({ 'https://addons.mozilla.org/api/v5/addons/search/': () => JSON.stringify({ results: [{ slug: 'autre-chose', name: { 'en-US': 'Tout autre chose' } }] }) })
    await expect(c.resoudre({ type: 'recherche', texte: 'pas une source' })).rejects.toThrow(/aucune extension/)
  })
  it('extension inconnue : message lisible', async () => {
    const c = client({ 'https://addons.mozilla.org/api/v5/addons/addon/': () => 404, 'https://addons.mozilla.org/api/v5/addons/search/': () => JSON.stringify({ results: [] }) })
    await expect(c.resoudre({ type: 'guid', guid: 'x@y' })).rejects.toThrow(/ne connaît pas/)
    await expect(c.resoudre({ type: 'recherche', texte: 'rien du tout' })).rejects.toThrow(/aucune extension/)
  })

  const xpi = new Uint8Array([1, 2, 3, 4])
  const infos = (o: Record<string, unknown> = {}) => ({ slug: 'darkreader', nom: 'Dark Reader', version: '4.9.80', url: 'https://addons.mozilla.org/f/1.xpi', sha256: sha(xpi), ...o })

  it('sha256 identique : octets rendus, mis en cache par version ; relu du cache sans nouveau téléchargement', async () => {
    const appels: string[] = []
    const c = client({ 'https://addons.mozilla.org/f/': () => xpi }, appels)
    expect(Buffer.from(await c.telecharger(infos())).equals(Buffer.from(xpi))).toBe(true)
    expect(readdirSync(join(cache, 'darkreader'))).toHaveLength(1)
    await c.telecharger(infos())
    expect(appels).toHaveLength(1)
  })
  it('sha256 différent : refusé, rien en cache', async () => {
    const c = client({ 'https://addons.mozilla.org/f/': () => new Uint8Array([9, 9, 9]) })
    await expect(c.telecharger(infos())).rejects.toThrow(/sha256/)
    expect(existsSync(join(cache, 'darkreader'))).toBe(false)
  })
  it('cache corrompu : supprimé et retéléchargé (sha256 revérifié à chaque lecture)', async () => {
    const appels: string[] = []
    const c = client({ 'https://addons.mozilla.org/f/': () => xpi }, appels)
    await c.telecharger(infos())
    const dossier = join(cache, 'darkreader')
    writeFileSync(join(dossier, readdirSync(dossier)[0]), 'trafiqué')
    expect(Buffer.from(await c.telecharger(infos())).equals(Buffer.from(xpi))).toBe(true)
    expect(appels).toHaveLength(2)
  })
  it('nouvelle version : l\'ancienne est retirée du cache', async () => {
    const v2 = new Uint8Array([5, 6])
    const c = client({ 'https://addons.mozilla.org/f/': () => v2 })
    mkdirSync(join(cache, 'darkreader'))
    writeFileSync(join(cache, 'darkreader', '4.9.79_abc.xpi'), 'vieux')
    await c.telecharger(infos({ version: '4.9.81', sha256: sha(v2) }))
    expect(readdirSync(join(cache, 'darkreader'))).toHaveLength(1)
  })
  it('hôtes AMO seulement', () => {
    expect(hoteAmo('addons.mozilla.org') && hoteAmo('addons.cdn.mozilla.net')).toBe(true)
    expect(hoteAmo('evil.mozilla.org')).toBe(false)
    expect(hoteAmo('mozilla.org')).toBe(false)
  })
})
