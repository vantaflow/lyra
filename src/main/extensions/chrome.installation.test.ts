import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { creerInstallateurChrome, versionDepuisReponseMaj } from './chrome'
import { creerChargeur, type SessionExtensions } from './chargeur'
import { creerRegistre, type StoreReglages } from './registre'
import { idDepuisCle } from './archives'
import { crx3Signe } from './crxTest'
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
      const m = JSON.parse(readFileSync(join(chemin, 'manifest.json'), 'utf8')) as { key?: string; casse?: boolean }
      if (m.casse) throw new Error('manifest refusé')
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

const manifest = (o: Record<string, unknown> = {}): Uint8Array =>
  strToU8(JSON.stringify({ manifest_version: 3, name: 'Mon extension', version: '1.2.3', ...o }))

const reponse = (octets: Uint8Array | string, init: { status?: number } = {}): Response =>
  new Response(typeof octets === 'string' ? octets : Buffer.from(octets), { status: init.status ?? 200 })
const redirection = (vers: string): Response => new Response(null, { status: 302, headers: { location: vers } })

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

  it('crx : en-tête retiré, signature vérifiée, clé de l\'en-tête utilisée comme Chrome', async () => {
    const { inst } = monter()
    const { octets, id } = crx3Signe(zipSync({ 'manifest.json': manifest() }))
    const r = await inst.installerChrome(ecrire('e.crx', octets))
    expect(r).toMatchObject({ etat: 'installee', id })
  })

  it('crx : manifest.key égal à la clé signataire accepté, autre clé refusée, absente acceptée', async () => {
    const paire = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const der = paire.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    const autre = cleDer().toString('base64')
    const { inst, registre } = monter()
    const refus = crx3Signe(zipSync({ 'manifest.json': manifest({ key: autre }) }), { cle: paire })
    const r = await inst.installerChrome(ecrire('autre.crx', refus.octets))
    expect(r).toMatchObject({ etat: 'erreur' })
    expect(r.etat === 'erreur' && r.raison).toMatch(/clé du manifest/)
    expect(registre.lister()).toEqual([])
    const bon = crx3Signe(zipSync({ 'manifest.json': manifest({ key: der }) }), { cle: paire })
    expect(await inst.installerChrome(ecrire('bon.crx', bon.octets))).toMatchObject({ etat: 'installee', id: bon.id })
  })

  it('crx à la signature invalide : refusé', async () => {
    const { inst, registre } = monter()
    const { octets } = crx3Signe(zipSync({ 'manifest.json': manifest() }))
    octets[octets.length - 30] ^= 0xff
    expect(await inst.installerChrome(ecrire('e.crx', octets))).toMatchObject({ etat: 'erreur' })
    expect(registre.lister()).toEqual([])
  })

  it('réinstaller la même version garde l\'ancien dossier jusqu\'au chargement, et le restaure si le chargement échoue', async () => {
    const der = cleDer().toString('base64')
    const { inst, registre, s } = monter()
    const bon = zipSync({ 'manifest.json': manifest({ key: der }), 'js/a.js': strToU8('ancien') })
    const r = await inst.installerChrome(ecrire('a.zip', bon))
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    const casse = zipSync({ 'manifest.json': manifest({ key: der, casse: true }), 'js/a.js': strToU8('nouveau') })
    expect(await inst.installerChrome(ecrire('b.zip', casse))).toMatchObject({ etat: 'erreur' })
    expect(readFileSync(join(base, r.id, '1.2.3', 'js', 'a.js'), 'utf8')).toBe('ancien')
    expect(readdirSync(join(base, r.id))).toEqual(['1.2.3']) // aucun résidu « .ancien-… »
    expect(registre.trouver(r.id)).toMatchObject({ version: '1.2.3', active: true })
    expect(s.chargees.has(r.id)).toBe(true) // l'ancienne version est rechargée
    // Réinstallation réussie : le nouveau contenu remplace l'ancien, sans résidu.
    const neuf = zipSync({ 'manifest.json': manifest({ key: der }), 'js/a.js': strToU8('nouveau') })
    expect(await inst.installerChrome(ecrire('c.zip', neuf))).toMatchObject({ etat: 'installee' })
    expect(readFileSync(join(base, r.id, '1.2.3', 'js', 'a.js'), 'utf8')).toBe('nouveau')
    expect(readdirSync(join(base, r.id))).toEqual(['1.2.3'])
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
  const crx = (extra: Record<string, unknown> = {}): { octets: Uint8Array; id: string } => crx3Signe(zipSync({ 'manifest.json': manifest(extra) }))

  it('télécharge le CRX3 (redirection manuelle), vérifie signature et identifiant, installe (source cws, magasin chrome)', async () => {
    const { octets, id } = crx()
    const appels: string[] = []
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      appels.push(String(url))
      expect(init?.signal).toBeDefined() // délai d'attente
      expect(init?.redirect).toBe('manual')
      return appels.length === 1 ? redirection('https://clients2.googleusercontent.com/crx/blobs/x.crx') : reponse(octets)
    }) as typeof fetch
    const { inst, registre } = monter(f)
    const r = await inst.installerChrome(id)
    expect(r).toMatchObject({ etat: 'installee', id })
    expect(registre.trouver(id)).toMatchObject({ source: 'cws', magasin: 'chrome' })
    const u = new URL(appels[0])
    expect(u.hostname).toBe('clients2.google.com')
    expect(decodeURIComponent(u.searchParams.get('x') ?? '')).toContain(`id=${id}`)
    expect(appels[1]).toBe('https://clients2.googleusercontent.com/crx/blobs/x.crx')
    // déjà installée : pas de second téléchargement
    expect(await inst.installerChrome(id)).toMatchObject({ etat: 'installee', id })
    expect(appels).toHaveLength(2)
  })

  it("refuse un CRX dont la clé ne correspond pas à l'identifiant demandé", async () => {
    const f = (async () => reponse(crx().octets)) as typeof fetch
    const { inst, registre } = monter(f)
    expect(await inst.installerChrome('a'.repeat(32))).toMatchObject({ etat: 'erreur' })
    expect(registre.lister()).toEqual([])
  })

  it('refuse un CRX dont le payload a été altéré (signature invalide)', async () => {
    const { octets, id } = crx()
    octets[octets.length - 30] ^= 0xff
    const { inst, registre } = monter((async () => reponse(octets)) as typeof fetch)
    const r = await inst.installerChrome(id)
    expect(r).toMatchObject({ etat: 'erreur', raison: expect.stringContaining('signature') })
    expect(registre.lister()).toEqual([])
  })

  it('HTTP 204 (extension retirée du magasin) et erreur réseau : erreur claire', async () => {
    const { inst } = monter((async () => reponse('', { status: 204 })) as typeof fetch)
    expect(await inst.installerChrome('a'.repeat(32))).toMatchObject({ etat: 'erreur' })
    const { inst: inst2 } = monter((async () => { throw new Error('réseau coupé') }) as typeof fetch)
    expect(await inst2.installerChrome('a'.repeat(32))).toMatchObject({ etat: 'erreur', raison: expect.stringContaining('réseau coupé') })
  })

  it('refuse un thème du magasin', async () => {
    const { octets, id } = crx({ theme: {} })
    const { inst, registre } = monter((async () => reponse(octets)) as typeof fetch)
    expect(await inst.installerChrome(id)).toMatchObject({ etat: 'erreur' })
    expect(registre.lister()).toEqual([])
  })

  it.each([
    ['hôte hors liste', 'https://evil.example/x.crx'],
    ['downgrade en http', 'http://clients2.googleusercontent.com/x.crx'],
    ['sous-domaine googleusercontent non listé', 'https://lh3.googleusercontent.com/x.crx']
  ])('refuse une redirection : %s', async (_nom, vers) => {
    const { id } = crx()
    const { inst } = monter((async () => redirection(vers)) as typeof fetch)
    expect(await inst.installerChrome(id)).toMatchObject({ etat: 'erreur' })
  })

  it('refuse plus de 5 redirections', async () => {
    const { id } = crx()
    let n = 0
    const { inst } = monter((async () => redirection(`https://clients2.google.com/r${++n}`)) as typeof fetch)
    expect(await inst.installerChrome(id)).toMatchObject({ etat: 'erreur', raison: expect.stringContaining('redirections') })
    expect(n).toBe(6)
  })
})

describe('mises à jour du Chrome Web Store', () => {
  const xml = (id: string, version: string, statut = 'ok'): string =>
    `<?xml version="1.0" encoding="UTF-8"?><gupdate protocol="2.0"><app appid="${id}" status="ok"><updatecheck codebase="https://clients2.googleusercontent.com/x.crx" status="${statut}" version="${version}"/></app></gupdate>`

  it('lit la version annoncée dans la réponse XML', () => {
    const id = 'a'.repeat(32)
    expect(versionDepuisReponseMaj(xml(id, '4.9.133'), id)).toBe('4.9.133')
    expect(versionDepuisReponseMaj(xml(id, '4.9.133', 'noupdate'), id)).toBeUndefined()
    expect(versionDepuisReponseMaj(xml('b'.repeat(32), '1.0'), id)).toBeUndefined()
    expect(versionDepuisReponseMaj('<gupdate/>', id)).toBeUndefined()
    expect(versionDepuisReponseMaj(xml(id, 'abc'), id)).toBeUndefined()
  })

  it("une balise <app …/> auto-fermante n'attrape pas l'updatecheck de l'application suivante", () => {
    const a = 'a'.repeat(32)
    const b = 'b'.repeat(32)
    const xmlDeux = `<gupdate><app appid="${a}" status="error-unknownApplication"/><app appid="${b}" status="ok"><updatecheck status="ok" version="9.9"/></app></gupdate>`
    expect(versionDepuisReponseMaj(xmlDeux, a)).toBeUndefined()
    expect(versionDepuisReponseMaj(xmlDeux, b)).toBe('9.9')
  })

  it('interroge l\'endpoint updatecheck par identifiant puis réinstalle la nouvelle version par le chemin normal', async () => {
    const paire = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const v1 = crx3Signe(zipSync({ 'manifest.json': manifest({ version: '1.0.0' }) }), { cle: paire })
    const v2 = crx3Signe(zipSync({ 'manifest.json': manifest({ version: '2.0.0' }) }), { cle: paire })
    const id = v1.id
    let servi = v1.octets
    const appels: string[] = []
    const f = (async (url: string | URL | Request) => {
      const u = new URL(String(url))
      appels.push(u.searchParams.get('response') ?? '')
      return u.searchParams.get('response') === 'updatecheck' ? reponse(xml(id, '2.0.0')) : reponse(servi)
    }) as typeof fetch
    const { inst, registre, s } = monter(f)
    expect(await inst.installerChrome(id)).toMatchObject({ etat: 'installee', version: '1.0.0' })
    expect(await inst.versionDistanteCws(id)).toBe('2.0.0')
    servi = v2.octets
    expect(await inst.mettreAJourCws(id)).toMatchObject({ etat: 'installee', id, version: '2.0.0' })
    expect(registre.trouver(id)).toMatchObject({ version: '2.0.0', dossier: `${id}/2.0.0`, source: 'cws' })
    expect(readdirSync(join(base, id))).toEqual(['2.0.0'])
    expect(s.chargees.get(id)).toContain('2.0.0')
    expect(appels).toEqual(['redirect', 'updatecheck', 'redirect'])
  })

  it('met à jour aussi une extension désactivée sans la charger', async () => {
    const paire = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const v1 = crx3Signe(zipSync({ 'manifest.json': manifest({ version: '1.0.0' }) }), { cle: paire })
    const v2 = crx3Signe(zipSync({ 'manifest.json': manifest({ version: '2.0.0' }) }), { cle: paire })
    let servi = v1.octets
    const { inst, registre, chargeur, s } = monter((async () => reponse(servi)) as typeof fetch)
    await inst.installerChrome(v1.id)
    await chargeur.activer(v1.id, false)
    servi = v2.octets
    expect(await inst.mettreAJourCws(v1.id)).toMatchObject({ etat: 'installee', version: '2.0.0' })
    expect(registre.trouver(v1.id)).toMatchObject({ version: '2.0.0', active: false })
    expect(s.chargees.has(v1.id)).toBe(false)
  })
})

describe('cycle de vie : mises à jour et désinstallation', () => {
  it("une extension désinstallée pendant sa mise à jour ne ressuscite pas", async () => {
    const paire = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const v1 = crx3Signe(zipSync({ 'manifest.json': manifest({ version: '1.0.0' }) }), { cle: paire })
    const v2 = crx3Signe(zipSync({ 'manifest.json': manifest({ version: '2.0.0' }) }), { cle: paire })
    let servi = v1.octets
    let ouvrir: () => void = () => undefined
    let bloquer = false
    const porte = new Promise<void>((ok) => (ouvrir = ok))
    const f = (async () => {
      if (bloquer) await porte
      return reponse(servi)
    }) as typeof fetch
    const { inst, registre, chargeur, s } = monter(f)
    await inst.installerChrome(v1.id)
    servi = v2.octets
    bloquer = true
    const maj = inst.mettreAJourCws(v1.id)
    await chargeur.desinstaller(v1.id)
    ouvrir()
    expect(await maj).toMatchObject({ etat: 'erreur' })
    expect(registre.trouver(v1.id)).toBeUndefined()
    expect(s.chargees.has(v1.id)).toBe(false)
    expect(existsSync(join(base, v1.id))).toBe(false)
  })

  it("remplacer une extension active ne la marque jamais « désactivée » dans le registre, même brièvement", async () => {
    const paire = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const v1 = crx3Signe(zipSync({ 'manifest.json': manifest({ version: '1.0.0' }) }), { cle: paire })
    const v2 = crx3Signe(zipSync({ 'manifest.json': manifest({ version: '2.0.0' }) }), { cle: paire })
    let servi = v1.octets
    const { inst, registre } = monter((async () => reponse(servi)) as typeof fetch)
    await inst.installerChrome(v1.id)
    const vus: boolean[] = []
    const ajouterOrigine = registre.activer
    registre.activer = (i, a) => {
      vus.push(a)
      return ajouterOrigine(i, a)
    }
    servi = v2.octets
    await inst.mettreAJourCws(v1.id)
    expect(vus).not.toContain(false)
    expect(registre.trouver(v1.id)).toMatchObject({ version: '2.0.0', active: true })
  })
})

describe('provenance : catalogue et fichiers locaux ne se remplacent pas', () => {
  const paire = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const paquet = crx3Signe(zipSync({ 'manifest.json': manifest({ name: 'Signée' }) }), { cle: paire })

  it("un fichier .crx de même identité qu'une extension du Web Store est refusé", async () => {
    const { inst, registre } = monter((async () => reponse(paquet.octets)) as typeof fetch)
    expect(await inst.installerChrome(paquet.id)).toMatchObject({ etat: 'installee' })
    const r = await inst.installerChrome(ecrire('local.crx', paquet.octets))
    expect(r).toMatchObject({ etat: 'erreur' })
    if (r.etat !== 'erreur') throw new Error('attendu : erreur')
    expect(r.raison).toContain("remplacerait l'extension Signée installée depuis le Chrome Web Store")
    expect(r.raison).toContain("désinstalle-la d'abord")
    expect(registre.trouver(paquet.id)).toMatchObject({ source: 'cws' })
  })

  it("l'extension du Web Store qui remplacerait un fichier local est refusée aussi, et rien n'est modifié", async () => {
    const { inst, registre, s } = monter((async () => reponse(paquet.octets)) as typeof fetch)
    expect(await inst.installerChrome(ecrire('local.crx', paquet.octets))).toMatchObject({ etat: 'installee' })
    const avant = registre.trouver(paquet.id)
    const r = await inst.installerChrome(paquet.id)
    expect(r).toMatchObject({ etat: 'erreur' })
    if (r.etat !== 'erreur') throw new Error('attendu : erreur')
    expect(r.raison).toContain("remplacerait l'extension Signée installée depuis un fichier ou un dossier local")
    expect(registre.trouver(paquet.id)).toEqual(avant)
    expect(s.chargees.has(paquet.id)).toBe(true)
  })

  it('sans clé : un dossier de même nom qu’un zip reçoit sa propre clé (aucun remplacement), un zip de même nom garde la sienne', async () => {
    const { inst, registre } = monter()
    const zip = zipSync({ 'manifest.json': manifest({ name: 'Homonyme' }) })
    const a = await inst.installerChrome(ecrire('h.zip', zip))
    const dossier = join(tmp, 'h-dossier')
    mkdirSync(dossier)
    writeFileSync(join(dossier, 'manifest.json'), Buffer.from(manifest({ name: 'Homonyme' })))
    const b = await inst.installerChrome(dossier)
    if (a.etat !== 'installee' || b.etat !== 'installee') throw new Error(JSON.stringify([a, b]))
    expect(b.id).not.toBe(a.id)
    expect(registre.lister()).toHaveLength(2)
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
      return reponse(zipUbo('1.64.0'))
    }) as typeof fetch
    const { inst, registre } = monter(f)
    const r = await inst.installerChrome('ubo')
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    expect(r).toMatchObject({ nom: 'uBlock Origin', version: '1.64.0' })
    expect(registre.trouver(r.id)).toMatchObject({ source: 'ubo', magasin: 'chrome' })
    expect(existsSync(join(base, r.id, '1.64.0', 'manifest.json'))).toBe(true)
    expect(appels[0]).toBe('https://api.github.com/repos/gorhill/uBlock/releases/latest')
    expect(await inst.derniereVersionUbo()).toBe('1.64.0')
  })

  const fUbo = (v: string): typeof fetch =>
    (async (url: string | URL | Request) => (String(url).startsWith('https://api.github.com/') ? reponse(release(v)) : reponse(zipUbo(v)))) as typeof fetch

  it('provenance : un paquet local ne remplace pas uBO (même identité) ; la mise à jour uBO de Lyra le remplace', async () => {
    const { inst, registre, chargeur } = monter(fUbo('1.64.0'))
    const r = await inst.installerChrome('ubo')
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    const cle = (JSON.parse(readFileSync(join(base, r.id, '1.64.0', 'manifest.json'), 'utf8')) as { key: string }).key
    // Même clé = même identité : zip, crx et dossier locaux sont refusés tant que uBO n'est pas désinstallé.
    const refus = await inst.installerChrome(ecrire('ubo-local.zip', zipSync({ 'manifest.json': manifest({ name: 'uBlock Origin', version: '9.9.9', key: cle }) })))
    expect(refus).toMatchObject({ etat: 'erreur', raison: expect.stringContaining('désinstalle-la d\'abord') })
    expect(registre.trouver(r.id)).toMatchObject({ source: 'ubo', version: '1.64.0' })
    // Mise à jour par Lyra : acceptée, la source reste « ubo ».
    const maj = creerInstallateurChrome({ base, registre, chargeur, fetch: fUbo('1.65.0'), journal: () => {} })
    expect(await maj.installerUbo(true)).toMatchObject({ etat: 'installee', id: r.id, version: '1.65.0' })
    expect(registre.trouver(r.id)).toMatchObject({ source: 'ubo', version: '1.65.0' })
  })

  it('un zip local nommé « uBlock Origin » sans clé reçoit sa propre identité (n\'hérite pas de la clé de uBO)', async () => {
    const { inst, registre } = monter(fUbo('1.64.0'))
    const u = await inst.installerChrome('ubo')
    const l = await inst.installerChrome(ecrire('ubo-local.zip', zipSync({ 'manifest.json': manifest({ name: 'uBlock Origin', version: '2.0.0' }) })))
    if (u.etat !== 'installee' || l.etat !== 'installee') throw new Error(JSON.stringify([u, l]))
    expect(l.id).not.toBe(u.id)
    expect(registre.trouver(u.id)).toMatchObject({ source: 'ubo', version: '1.64.0' })
    expect(registre.trouver(l.id)).toMatchObject({ source: 'zip' })
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

describe('stubs MV2 à l\'installation', () => {
  const RES = join(__dirname, '../../../resources/extensions')
  const shims = { head: join(RES, 'shim-head.js'), post: join(RES, 'shim-post.js') }
  const monterAvecShims = () => {
    const registre = creerRegistre(reglagesSimules())
    const s = sessionSimulee()
    const chargeur = creerChargeur({ extensions: s.api, registre, base, journal: () => {} })
    return { registre, inst: creerInstallateurChrome({ base, registre, chargeur, shims, journal: () => {} }) }
  }

  it('un zip MV2 reçoit les shims et le marqueur ; un zip MV3 non', async () => {
    const { registre, inst } = monterAvecShims()
    const mv2 = zipSync({ 'manifest.json': manifest({ manifest_version: 2, name: 'Vieille', background: { scripts: ['bg.js'] } }), 'bg.js': strToU8('//') })
    const r = await inst.installerChrome(ecrire('mv2.zip', mv2))
    expect(r.etat).toBe('installee')
    const e = registre.lister()[0]
    const m = JSON.parse(readFileSync(join(base, e.dossier, 'manifest.json'), 'utf8'))
    expect(m.background.scripts).toEqual(['lyra-shim-head.js', 'lyra-shim-post.js', 'bg.js'])
    expect(existsSync(join(base, e.dossier, 'lyra-stubs.json'))).toBe(true)

    const mv3 = zipSync({ 'manifest.json': manifest({ name: 'Moderne', background: { service_worker: 'sw.js' } }), 'sw.js': strToU8('//') })
    expect((await inst.installerChrome(ecrire('mv3.zip', mv3))).etat).toBe('installee')
    const e3 = registre.lister().find((x) => x.nom === 'Moderne')!
    expect(existsSync(join(base, e3.dossier, 'lyra-shim-head.js'))).toBe(false)
  })
})
