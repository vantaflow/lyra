import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { creerInstallateurChrome } from './chrome'
import { creerChargeur, type SessionExtensions } from './chargeur'
import { creerRegistre, type StoreReglages } from './registre'
import { idDepuisCle } from './archives'
import { validerPatch } from '../settings/validate'
import { reglagesParDefaut } from '../settings/defaults'
import type { Settings } from '../../shared/types'

const cleDer = (): Buffer => generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' })

function reglagesSimules(): StoreReglages {
  let s = { ...reglagesParDefaut('/dl'), extensions: { installees: [], majAuto: true } } as Settings
  return {
    getSettings: () => s,
    setSettings: (patch) => {
      const v = validerPatch(patch) as Partial<Settings>
      s = { ...s, extensions: { ...s.extensions, ...(v.extensions ?? {}) } } as Settings
      return s
    }
  }
}

/** `session.extensions` simulé : l'id attribué est lu dans le manifest (clé) du dossier chargé. */
function sessionSimulee() {
  const chargees = new Map<string, string>()
  const api: SessionExtensions = {
    async loadExtension(chemin) {
      const m = JSON.parse(readFileSync(join(chemin, 'manifest.json'), 'utf8')) as { key?: string }
      const id = idDepuisCle(m.key ?? '')
      chargees.set(id, chemin)
      return { id }
    },
    async removeExtension(id) {
      chargees.delete(id)
    },
    getAllExtensions: () => [...chargees.keys()].map((id) => ({ id }))
  }
  return { api, chargees }
}

const varint = (n: number): number[] => {
  const o: number[] = []
  while (n > 0x7f) { o.push((n & 0x7f) | 0x80); n >>>= 7 }
  o.push(n)
  return o
}
const champ = (num: number, octets: Uint8Array | number[]): number[] => [...varint((num << 3) | 2), ...varint(octets.length), ...octets]

/** CRX3 signé en apparence : en-tête avec la clé publique et le crx_id déclaré (pas de vraie signature). */
function crx3(zip: Uint8Array, der: Buffer): Uint8Array {
  const crxId = createHash('sha256').update(der).digest().subarray(0, 16)
  const entete = Uint8Array.from([...champ(2, champ(1, der)), ...champ(10000, champ(1, crxId))])
  const sortie = new Uint8Array(12 + entete.length + zip.length)
  sortie.set([0x43, 0x72, 0x32, 0x34])
  const v = new DataView(sortie.buffer)
  v.setUint32(4, 3, true)
  v.setUint32(8, entete.length, true)
  sortie.set(entete, 12)
  sortie.set(zip, 12 + entete.length)
  return sortie
}

const manifest = (o: Record<string, unknown> = {}): Uint8Array =>
  strToU8(JSON.stringify({ manifest_version: 3, name: 'Mon extension', version: '1.2.3', ...o }))

const reponse = (octets: Uint8Array | string, init: { status?: number; url?: string } = {}): Response => {
  const r = new Response(typeof octets === 'string' ? octets : Buffer.from(octets), { status: init.status ?? 200 })
  if (init.url) Object.defineProperty(r, 'url', { value: init.url })
  return r
}

let base: string
let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-inst-'))
  base = join(tmp, 'extensions')
  mkdirSync(base)
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function monter(fetchSimule?: typeof fetch) {
  const registre = creerRegistre(reglagesSimules())
  const s = sessionSimulee()
  const chargeur = creerChargeur({ extensions: s.api, registre, base, journal: () => {} })
  const inst = creerInstallateurChrome({ base, registre, chargeur, fetch: fetchSimule, journal: () => {} })
  return { registre, chargeur, inst, s }
}
const ecrire = (nom: string, zip: Uint8Array): string => {
  const p = join(tmp, nom)
  writeFileSync(p, zip)
  return p
}

describe('installation depuis un .zip, un .crx ou un dossier', () => {
  it('zip avec clé : id dérivé de la clé, dossier <id>/<version>, registre et chargement', async () => {
    const der = cleDer()
    const { inst, registre, s } = monter()
    const r = await inst.installerChrome(ecrire('e.zip', zipSync({ 'manifest.json': manifest({ key: der.toString('base64') }) })))
    const id = idDepuisCle(der.toString('base64'))
    expect(r).toEqual({ etat: 'installee', id, nom: 'Mon extension', version: '1.2.3' })
    expect(registre.trouver(id)).toMatchObject({ source: 'zip', magasin: 'inconnu', dossier: `${id}/1.2.3`, active: true })
    expect(existsSync(join(base, id, '1.2.3', 'manifest.json'))).toBe(true)
    expect(s.chargees.has(id)).toBe(true)
    expect(readdirSync(base)).toEqual([id]) // pas de dossier temporaire résiduel
  })

  it('zip sans clé : une clé stable est écrite dans le manifest et l\'id en découle', async () => {
    const { inst, registre } = monter()
    const r = await inst.installerChrome(ecrire('e.zip', zipSync({ 'manifest.json': manifest() })))
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    const m = JSON.parse(readFileSync(join(base, r.id, '1.2.3', 'manifest.json'), 'utf8')) as { key: string }
    expect(idDepuisCle(m.key)).toBe(r.id)
    // Réinstaller la même extension (même nom) garde le même id.
    const r2 = await inst.installerChrome(ecrire('e2.zip', zipSync({ 'manifest.json': manifest({ version: '1.3.0' }) })))
    expect(r2).toMatchObject({ etat: 'installee', id: r.id, version: '1.3.0' })
    expect(registre.lister()).toHaveLength(1)
    // l'ancienne version est supprimée une fois la nouvelle chargée
    expect(readdirSync(join(base, r.id))).toEqual(['1.3.0'])
  })

  it('nom __MSG_…__ résolu depuis _locales', async () => {
    const { inst } = monter()
    const r = await inst.installerChrome(
      ecrire('e.zip', zipSync({
        'manifest.json': manifest({ name: '__MSG_extName__', default_locale: 'en' }),
        '_locales/en/messages.json': strToU8(JSON.stringify({ extName: { message: 'Super extension' } }))
      }))
    )
    expect(r).toMatchObject({ etat: 'installee', nom: 'Super extension' })
  })

  it('crx : en-tête retiré, clé de l\'en-tête utilisée comme Chrome', async () => {
    const der = cleDer()
    const { inst } = monter()
    const r = await inst.installerChrome(ecrire('e.crx', crx3(zipSync({ 'manifest.json': manifest() }), der)))
    expect(r).toMatchObject({ etat: 'installee', id: idDepuisCle(der.toString('base64')) })
  })

  it('dossier : copié sous <id>/<version>', async () => {
    const der = cleDer()
    const src = join(tmp, 'source')
    mkdirSync(src)
    writeFileSync(join(src, 'manifest.json'), manifest({ key: der.toString('base64') }))
    const { inst, registre } = monter()
    const r = await inst.installerChrome(src)
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    expect(registre.trouver(r.id)).toMatchObject({ source: 'dossier' })
    expect(existsSync(join(base, r.id, '1.2.3', 'manifest.json'))).toBe(true)
    expect(existsSync(src)).toBe(true) // la source n'est pas déplacée
  })

  it.each([
    ['thème', { theme: { colors: {} } }, /thème/i],
    ['manifest_version 1', { manifest_version: 1 }, /manifest/i],
    ['version illisible', { version: '../1' }, /version/i]
  ])('refuse : %s', async (_nom, extra, motif) => {
    const { inst, registre } = monter()
    const r = await inst.installerChrome(ecrire('e.zip', zipSync({ 'manifest.json': manifest(extra) })))
    expect(r).toMatchObject({ etat: 'erreur' })
    expect((r as { raison: string }).raison).toMatch(motif)
    expect(registre.lister()).toEqual([])
    expect(readdirSync(base)).toEqual([])
  })

  it('archive hostile : refus propre, registre intact', async () => {
    const { inst, registre } = monter()
    const r = await inst.installerChrome(ecrire('e.zip', zipSync({ 'manifest.json': manifest(), '../evil.js': strToU8('x') })))
    expect(r).toMatchObject({ etat: 'erreur' })
    expect(registre.lister()).toEqual([])
    expect(existsSync(join(tmp, 'evil.js'))).toBe(false)
  })

  it('source illisible ou inconnue : erreur, jamais d\'exception', async () => {
    const { inst } = monter()
    expect(await inst.installerChrome(join(tmp, 'absent.zip'))).toMatchObject({ etat: 'erreur' })
    expect(await inst.installerChrome('n importe quoi')).toMatchObject({ etat: 'erreur' })
  })
})

describe('installation depuis le Chrome Web Store', () => {
  it('télécharge le CRX3, vérifie l\'identifiant et installe (source cws, magasin chrome)', async () => {
    const der = cleDer()
    const id = idDepuisCle(der.toString('base64'))
    const appels: string[] = []
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      appels.push(String(url))
      expect(init?.signal).toBeDefined() // délai d'attente
      return reponse(crx3(zipSync({ 'manifest.json': manifest() }), der), { url: 'https://clients2.googleusercontent.com/crx/blobs/x.crx' })
    }) as typeof fetch
    const { inst, registre } = monter(f)
    const r = await inst.installerChrome(id)
    expect(r).toMatchObject({ etat: 'installee', id })
    expect(registre.trouver(id)).toMatchObject({ source: 'cws', magasin: 'chrome' })
    const u = new URL(appels[0])
    expect(u.hostname).toBe('clients2.google.com')
    expect(decodeURIComponent(u.searchParams.get('x') ?? '')).toContain(`id=${id}`)
    // déjà installée : pas de second téléchargement
    expect(await inst.installerChrome(id)).toMatchObject({ etat: 'installee', id })
    expect(appels).toHaveLength(1)
  })

  it('refuse un CRX dont la clé ne correspond pas à l\'identifiant demandé', async () => {
    const f = (async () => reponse(crx3(zipSync({ 'manifest.json': manifest() }), cleDer()), { url: 'https://clients2.google.com/x' })) as typeof fetch
    const { inst, registre } = monter(f)
    expect(await inst.installerChrome('a'.repeat(32))).toMatchObject({ etat: 'erreur' })
    expect(registre.lister()).toEqual([])
  })

  it('HTTP 204 (extension retirée du magasin) et erreur réseau : erreur claire', async () => {
    const { inst } = monter((async () => reponse('', { status: 204 })) as typeof fetch)
    const r = await inst.installerChrome('a'.repeat(32))
    expect(r).toMatchObject({ etat: 'erreur' })
    const { inst: inst2 } = monter((async () => { throw new Error('réseau coupé') }) as typeof fetch)
    expect(await inst2.installerChrome('a'.repeat(32))).toMatchObject({ etat: 'erreur', raison: expect.stringContaining('réseau coupé') })
  })

  it('refuse un thème du magasin', async () => {
    const der = cleDer()
    const f = (async () => reponse(crx3(zipSync({ 'manifest.json': manifest({ theme: {} }) }), der), { url: 'https://clients2.google.com/x' })) as typeof fetch
    const { inst, registre } = monter(f)
    expect(await inst.installerChrome(idDepuisCle(der.toString('base64')))).toMatchObject({ etat: 'erreur' })
    expect(registre.lister()).toEqual([])
  })

  it('refuse une redirection hors des hôtes Google', async () => {
    const der = cleDer()
    const f = (async () => reponse(crx3(zipSync({ 'manifest.json': manifest() }), der), { url: 'https://evil.example/x.crx' })) as typeof fetch
    const { inst } = monter(f)
    expect(await inst.installerChrome(idDepuisCle(der.toString('base64')))).toMatchObject({ etat: 'erreur' })
  })
})

describe('uBlock Origin (release GitHub)', () => {
  const release = (v: string): string =>
    JSON.stringify({
      tag_name: v,
      assets: [
        { name: `uBlock0_${v}.firefox.xpi`, browser_download_url: `https://github.com/gorhill/uBlock/releases/download/${v}/uBlock0_${v}.firefox.xpi` },
        { name: `uBlock0_${v}.chromium.zip`, browser_download_url: `https://github.com/gorhill/uBlock/releases/download/${v}/uBlock0_${v}.chromium.zip` }
      ]
    })
  const zipUbo = (v: string): Uint8Array =>
    zipSync({ 'uBlock0.chromium/manifest.json': manifest({ manifest_version: 2, name: 'uBlock Origin', version: v }), 'uBlock0.chromium/js/a.js': strToU8('1') })

  it('trouve l\'asset chromium, extrait le sous-dossier et installe', async () => {
    const appels: string[] = []
    const f = (async (url: string | URL | Request) => {
      const u = String(url)
      appels.push(u)
      if (u.startsWith('https://api.github.com/')) return reponse(release('1.64.0'))
      return reponse(zipUbo('1.64.0'), { url: u })
    }) as typeof fetch
    const { inst, registre } = monter(f)
    const r = await inst.installerChrome('ubo')
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    expect(r).toMatchObject({ nom: 'uBlock Origin', version: '1.64.0' })
    expect(registre.trouver(r.id)).toMatchObject({ source: 'zip', magasin: 'chrome' })
    expect(existsSync(join(base, r.id, '1.64.0', 'manifest.json'))).toBe(true)
    expect(appels[0]).toBe('https://api.github.com/repos/gorhill/uBlock/releases/latest')
    expect(await inst.derniereVersionUbo()).toBe('1.64.0')
  })

  it('refuse un lien de téléchargement hors github.com', async () => {
    const f = (async () =>
      reponse(JSON.stringify({ tag_name: '1.64.0', assets: [{ name: 'uBlock0_1.64.0.chromium.zip', browser_download_url: 'https://evil.example/uBlock0_1.64.0.chromium.zip' }] }))) as typeof fetch
    const { inst } = monter(f)
    expect(await inst.installerChrome('ubo')).toMatchObject({ etat: 'erreur' })
  })

  it('release sans asset chromium : erreur', async () => {
    const { inst } = monter((async () => reponse(JSON.stringify({ tag_name: '1', assets: [] }))) as typeof fetch)
    expect(await inst.installerChrome('ubo')).toMatchObject({ etat: 'erreur' })
  })
})
