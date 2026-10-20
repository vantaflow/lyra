import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { creerInstallateurFirefox } from './firefox'
import { creerChargeur, type SessionExtensions } from './chargeur'
import { creerRegistre, type StoreReglages } from './registre'
import { creerMiseAJour } from './miseAJour'
import { idDepuisCle } from './archives'
import { validerPatch } from '../settings/validate'
import { reglagesParDefaut } from '../settings/defaults'
import type { Settings } from '../../shared/types'

const FIXTURES = resolve(__dirname, 'fixtures/manifests')
const fixture = (nom: string): Record<string, unknown> => JSON.parse(readFileSync(join(FIXTURES, `${nom}.json`), 'utf8')) as Record<string, unknown>

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

const sha = (o: Uint8Array): string => createHash('sha256').update(o).digest('hex')
const json = (o: unknown): Response => new Response(JSON.stringify(o), { status: 200 })

let tmp: string
let base: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-ff-'))
  base = join(tmp, 'extensions')
  mkdirSync(base)
  writeFileSync(join(tmp, 'polyfill.js'), '/* polyfill */')
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

/** xpi de Dark Reader (fixture) : manifest réaliste, quelques fichiers, signature META-INF. */
const xpiDarkReader = (version = '4.9.80'): Uint8Array =>
  zipSync({
    'manifest.json': strToU8(JSON.stringify({ ...fixture('dark-reader-ff'), version })),
    'background/index.js': strToU8('//bg'),
    'inject/fallback.js': strToU8('//fb'),
    'inject/index.js': strToU8('//in'),
    'ui/popup/index.html': strToU8('<html><head></head></html>'),
    'ui/stylesheet-editor/index.html': strToU8('<html><head></head></html>'),
    'META-INF/mozilla.rsa': strToU8('sig'),
    'META-INF/manifest.mf': strToU8('Manifest-Version: 1.0')
  })

interface Etat {
  version: string
  xpi: Uint8Array
  hash?: string
  urlFichier?: string
  appels: string[]
}

/** Faux AMO : l'API annonce `etat.version` / `etat.xpi` (hash recalculé sauf `etat.hash`). */
function faux(etat: Etat): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url)
    etat.appels.push(u)
    if (u.startsWith('https://addons.mozilla.org/api/v5/addons/addon/')) {
      return json({
        slug: 'darkreader',
        guid: 'addon@darkreader.org',
        name: { 'en-US': 'Dark Reader' },
        current_version: { version: etat.version, file: { url: etat.urlFichier ?? 'https://addons.mozilla.org/firefox/downloads/file/1/darkreader.xpi', hash: etat.hash ?? `sha256:${sha(etat.xpi)}` } }
      })
    }
    if (u.includes('/downloads/file/')) return new Response('', { status: 302, headers: { location: 'https://addons.cdn.mozilla.net/user-media/addons/1/darkreader.xpi' } })
    if (u.startsWith('https://addons.cdn.mozilla.net/')) return new Response(Buffer.from(etat.xpi), { status: 200 })
    return new Response('', { status: 500 })
  }) as typeof fetch
}

function monter(f: typeof fetch) {
  const registre = creerRegistre(reglagesSimules())
  const s = sessionSimulee()
  const chargeur = creerChargeur({ extensions: s.api, registre, base, journal: () => {} })
  const inst = creerInstallateurFirefox({ base, registre, chargeur, fetch: f, journal: () => {}, polyfill: join(tmp, 'polyfill.js') })
  return { registre, chargeur, inst, s }
}

describe('installation depuis AMO', () => {
  it('Dark Reader : sha256 vérifié, converti, enregistré (amo / firefox / convertie), chargé, rapport rendu', async () => {
    const etat: Etat = { version: '4.9.80', xpi: xpiDarkReader(), appels: [] }
    const { inst, registre, s } = monter(faux(etat))
    const r = await inst.installerFirefox('https://addons.mozilla.org/fr/firefox/addon/darkreader/')
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    expect(r).toMatchObject({ nom: 'Dark Reader', version: '4.9.80', convertie: true })
    expect(r.rapport?.permissions_retirees).toEqual(['theme'])
    expect(r.suggestionChrome).toEqual({ id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh', nom: 'Dark Reader' })
    expect(registre.trouver(r.id)).toMatchObject({ source: 'amo', magasin: 'firefox', convertie: true, slugAmo: 'darkreader', dossier: `${r.id}/4.9.80`, active: true })
    expect(s.chargees.has(r.id)).toBe(true)
    const dossier = join(base, r.id, '4.9.80')
    expect(existsSync(join(dossier, 'META-INF'))).toBe(false)
    expect(existsSync(join(dossier, 'browser-polyfill.js'))).toBe(true)
    const m = JSON.parse(readFileSync(join(dossier, 'manifest.json'), 'utf8')) as { key: string; background: { scripts: string[] }; browser_specific_settings?: unknown }
    expect(idDepuisCle(m.key)).toBe(r.id)
    expect(m.background.scripts[0]).toBe('browser-polyfill.js')
    expect(m.browser_specific_settings).toBeUndefined()
    expect(JSON.parse(readFileSync(join(dossier, 'lyra-conversion.json'), 'utf8'))).toEqual(r.rapport)
    // le fichier est en cache (téléchargé une fois), aucun dossier d'attente résiduel
    expect(readdirSync(join(base, 'cache', 'darkreader'))).toHaveLength(1)
    expect(readdirSync(base).sort()).toEqual(['cache', r.id].sort())
    // redirection manuelle : API puis fichier AMO puis CDN
    expect(etat.appels.filter((u) => !u.includes('/api/v5/'))).toEqual(['https://addons.mozilla.org/firefox/downloads/file/1/darkreader.xpi', 'https://addons.cdn.mozilla.net/user-media/addons/1/darkreader.xpi'])
  })

  it('même version déjà installée : rien n\'est retéléchargé', async () => {
    const etat: Etat = { version: '4.9.80', xpi: xpiDarkReader(), appels: [] }
    const { inst } = monter(faux(etat))
    await inst.installerFirefox('darkreader')
    const avant = etat.appels.length
    const r = await inst.installerFirefox('darkreader')
    expect(r.etat).toBe('installee')
    expect(etat.appels.length).toBe(avant + 1) // l'API seulement
  })

  it('mise à jour : même identifiant, nouvelle version, ancien dossier supprimé', async () => {
    const etat: Etat = { version: '4.9.80', xpi: xpiDarkReader(), appels: [] }
    const { inst, registre } = monter(faux(etat))
    const r1 = await inst.installerFirefox('darkreader')
    if (r1.etat !== 'installee') throw new Error(JSON.stringify(r1))
    etat.version = '4.9.81'
    etat.xpi = xpiDarkReader('4.9.81')
    expect(await inst.versionDistanteAmo('darkreader')).toBe('4.9.81')
    const r2 = await inst.mettreAJourAmo('darkreader')
    expect(r2).toMatchObject({ etat: 'installee', id: r1.id, version: '4.9.81' })
    expect(registre.lister()).toHaveLength(1)
    expect(readdirSync(join(base, r1.id))).toEqual(['4.9.81'])
  })

  it('l\'identifiant ne dépend que de l\'identifiant gecko (réinstallation après désinstallation)', async () => {
    const etat: Etat = { version: '4.9.80', xpi: xpiDarkReader(), appels: [] }
    const { inst, chargeur } = monter(faux(etat))
    const r1 = await inst.installerFirefox('darkreader')
    if (r1.etat !== 'installee') throw new Error(JSON.stringify(r1))
    await chargeur.desinstaller(r1.id)
    const r2 = await inst.installerFirefox('darkreader')
    expect(r2).toMatchObject({ etat: 'installee', id: r1.id })
  })

  it('sha256 différent de celui d\'AMO : refusé avant extraction, rien d\'installé ni de mis en cache', async () => {
    const etat: Etat = { version: '4.9.80', xpi: xpiDarkReader(), hash: `sha256:${'0'.repeat(64)}`, appels: [] }
    const { inst, registre } = monter(faux(etat))
    const r = await inst.installerFirefox('darkreader')
    expect(r).toMatchObject({ etat: 'erreur' })
    expect(r.etat === 'erreur' && r.raison).toMatch(/sha256/)
    expect(registre.lister()).toEqual([])
    expect(readdirSync(base)).toEqual([])
  })

  it('adresse de fichier annoncée hors AMO : refusée', async () => {
    const etat: Etat = { version: '4.9.80', xpi: xpiDarkReader(), urlFichier: 'https://evil.example/x.xpi', appels: [] }
    const { inst } = monter(faux(etat))
    expect(await inst.installerFirefox('darkreader')).toMatchObject({ etat: 'erreur' })
    expect(etat.appels.some((u) => u.includes('evil'))).toBe(false)
  })

  it('redirection du fichier vers un hôte hors liste : refusée', async () => {
    const etat: Etat = { version: '4.9.80', xpi: xpiDarkReader(), appels: [] }
    const base0 = faux(etat)
    const f = (async (u: string | URL | Request) => (String(u).includes('/downloads/file/') ? new Response('', { status: 302, headers: { location: 'https://evil.example/x.xpi' } }) : base0(u))) as typeof fetch
    const { inst } = monter(f)
    const r = await inst.installerFirefox('darkreader')
    expect(r.etat === 'erreur' && r.raison).toMatch(/hôte refusé/)
  })

  it('Tree Style Tab (.xpi) : refusé avec le motif, rien d\'installé', async () => {
    const xpi = zipSync({ 'manifest.json': strToU8(JSON.stringify(fixture('tree-style-tab'))), 'background/background.js': strToU8('//') })
    const chemin = join(tmp, 'tst.xpi')
    writeFileSync(chemin, xpi)
    const { inst, registre } = monter(faux({ version: '1', xpi, appels: [] }))
    const r = await inst.installerFirefox(chemin)
    expect(r).toMatchObject({ etat: 'erreur' })
    expect(r.etat === 'erreur' && r.raison).toMatch(/sidebar_action/)
    expect(r.etat === 'erreur' && r.rapport?.refus).toBeDefined()
    expect(registre.lister()).toEqual([])
    expect(readdirSync(base)).toEqual([])
  })

  it('xpi hostile (« ../ ») : refusé proprement', async () => {
    const chemin = join(tmp, 'h.xpi')
    writeFileSync(chemin, zipSync({ 'manifest.json': strToU8('{}'), '../evil.js': strToU8('x') }))
    const { inst } = monter(faux({ version: '1', xpi: new Uint8Array(), appels: [] }))
    expect(await inst.installerFirefox(chemin)).toMatchObject({ etat: 'erreur' })
    expect(existsSync(join(tmp, 'evil.js'))).toBe(false)
  })

  it('xpi local : source xpi, magasin firefox, convertie ; sans identifiant gecko, id stable d\'après le nom', async () => {
    const xpi = zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 2, name: 'Sans guid', version: '1.0' })) })
    const chemin = join(tmp, 'e.xpi')
    writeFileSync(chemin, xpi)
    const { inst, registre } = monter(faux({ version: '1', xpi, appels: [] }))
    const r = await inst.installerFirefox(chemin)
    if (r.etat !== 'installee') throw new Error(JSON.stringify(r))
    expect(registre.trouver(r.id)).toMatchObject({ source: 'xpi', magasin: 'firefox', convertie: true })
    expect(registre.trouver(r.id)?.slugAmo).toBeUndefined()
    const r2 = await inst.installerFirefox(chemin)
    expect(r2).toMatchObject({ etat: 'installee', id: r.id })
  })

  it('source non reconnue ou fichier absent : erreur sans exception', async () => {
    const { inst } = monter(faux({ version: '1', xpi: new Uint8Array(), appels: [] }))
    expect(await inst.installerFirefox('/pas/de/ce/fichier.xpi')).toMatchObject({ etat: 'erreur' })
    expect(await inst.installerFirefox('http://addons.mozilla.org/x')).toMatchObject({ etat: 'erreur' })
  })

  it("chargement impossible : retour arrière (registre vide, dossier supprimé)", async () => {
    const etat: Etat = { version: '4.9.80', xpi: xpiDarkReader(), appels: [] }
    const registre = creerRegistre(reglagesSimules())
    const api: SessionExtensions = { loadExtension: async () => { throw new Error('refusée') }, removeExtension: async () => {}, getAllExtensions: () => [] }
    const chargeur = creerChargeur({ extensions: api, registre, base, journal: () => {} })
    const inst = creerInstallateurFirefox({ base, registre, chargeur, fetch: faux(etat), journal: () => {}, polyfill: join(tmp, 'polyfill.js') })
    const r = await inst.installerFirefox('darkreader')
    expect(r).toMatchObject({ etat: 'erreur' })
    expect(registre.lister()).toEqual([])
    expect(readdirSync(base).filter((n) => n !== 'cache')).toEqual([])
  })
})

describe('mises à jour AMO (miseAJour.ts)', () => {
  it('une extension AMO plus ancienne que la version distante est mise à jour ; une erreur est rapportée', async () => {
    const etat: Etat = { version: '4.9.80', xpi: xpiDarkReader(), appels: [] }
    const { inst, registre } = monter(faux(etat))
    const reglages = reglagesSimules()
    await inst.installerFirefox('darkreader')
    etat.version = '4.9.90'
    etat.xpi = xpiDarkReader('4.9.90')
    const maj = creerMiseAJour({
      registre,
      reglages,
      versionDistanteCws: async () => undefined,
      mettreAJourCws: async () => ({ etat: 'erreur', raison: 'non' }),
      versionDistanteAmo: inst.versionDistanteAmo,
      mettreAJourAmo: inst.mettreAJourAmo,
      journal: () => {}
    })
    const v = await maj.verifier()
    expect(v.erreurs).toEqual([])
    expect(v.misesAJour).toEqual([expect.objectContaining({ nom: 'Dark Reader', de: '4.9.80', vers: '4.9.90' })])
    expect(registre.lister()[0].version).toBe('4.9.90')
    // même version : rien à faire
    expect((await maj.verifier()).misesAJour).toEqual([])
    // la nouvelle version est refusée (sha256) : erreur rapportée, ancienne version intacte
    etat.version = '4.9.99'
    etat.hash = `sha256:${'1'.repeat(64)}`
    const v2 = await maj.verifier()
    expect(v2.misesAJour).toEqual([])
    expect(v2.erreurs[0]).toMatch(/Dark Reader.*sha256/)
    expect(registre.lister()[0].version).toBe('4.9.90')
  })
})
