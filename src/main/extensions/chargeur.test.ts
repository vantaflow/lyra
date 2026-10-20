import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerChargeur, type SessionExtensions } from './chargeur'
import { creerRegistre, type StoreReglages } from './registre'
import { validerPatch } from '../settings/validate'
import { reglagesParDefaut } from '../settings/defaults'
import type { ExtensionInstallee, Settings } from '../../shared/types'

const FIXTURE = join(__dirname, 'fixtures', 'minimale-mv3')
const ID_FIXTURE = 'eagihioebnkdnlbdklhbioanjmaamgag'
const id = (c: string): string => c.repeat(32)

const ext = (c: string, o: Partial<ExtensionInstallee> = {}): ExtensionInstallee => ({
  id: id(c),
  nom: `Ext ${c}`,
  version: '1.0.0',
  source: 'dossier',
  magasin: 'inconnu',
  dossier: `${id(c)}/1.0.0`,
  active: true,
  installeeLe: '2026-10-19T10:00:00.000Z',
  miseAJourLe: '2026-10-19T10:00:00.000Z',
  ...o
})

/** `session.extensions` simulé : l'id rendu est celui du dossier parent de la version. */
function sessionSimulee(options: { echecs?: Set<string> } = {}) {
  const chargees = new Map<string, string>()
  const appels: string[] = []
  const api: SessionExtensions = {
    async loadExtension(chemin, opts) {
      appels.push(`load ${chemin} ${JSON.stringify(opts)}`)
      const idExt = chemin.split(/[\\/]/).slice(-2)[0]
      if (options.echecs?.has(idExt)) throw new Error('manifest illisible')
      chargees.set(idExt, chemin)
      return { id: idExt, name: idExt }
    },
    async removeExtension(idExt) {
      appels.push(`remove ${idExt}`)
      chargees.delete(idExt)
    },
    getAllExtensions: () => [...chargees.keys()].map((i) => ({ id: i, name: i }))
  }
  return { api, chargees, appels }
}

function reglagesSimules(init: ExtensionInstallee[]): StoreReglages {
  let s = { ...reglagesParDefaut('/dl'), extensions: { installees: init, majAuto: true } } as Settings
  return {
    getSettings: () => s,
    setSettings: (patch) => {
      const v = validerPatch(patch) as Partial<Settings>
      s = { ...s, extensions: { ...s.extensions, ...(v.extensions ?? {}) } } as Settings
      return s
    }
  }
}

let base: string
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'lyra-ext-'))
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

function installerDossier(e: ExtensionInstallee): string {
  const d = join(base, ...e.dossier.split('/'))
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'manifest.json'), '{}')
  return d
}

describe('chargerAuDemarrage', () => {
  it("charge les extensions actives dans l'ordre d'installation, sans accès aux fichiers locaux", async () => {
    const exts = [ext('c'), ext('a'), ext('b', { active: false })]
    const s = sessionSimulee()
    const c = creerChargeur({ extensions: s.api, registre: creerRegistre(reglagesSimules(exts)), base })
    const r = await c.chargerAuDemarrage()
    expect(r.map((x) => [x.id, x.ok])).toEqual([[id('c'), true], [id('a'), true]])
    expect(s.appels).toEqual([
      `load ${join(base, id('c'), '1.0.0')} {"allowFileAccess":false}`,
      `load ${join(base, id('a'), '1.0.0')} {"allowFileAccess":false}`
    ])
  })

  it('une extension en erreur est journalisée sans bloquer les suivantes', async () => {
    const s = sessionSimulee({ echecs: new Set([id('a')]) })
    const journal: string[] = []
    const c = creerChargeur({ extensions: s.api, registre: creerRegistre(reglagesSimules([ext('a'), ext('b')])), base, journal: (m) => journal.push(m) })
    const r = await c.chargerAuDemarrage()
    expect(r.map((x) => x.ok)).toEqual([false, true])
    expect(r[0].erreur).toContain('manifest illisible')
    expect(journal.some((m) => m.includes(id('a')) && m.includes('manifest illisible'))).toBe(true)
    expect([...s.chargees.keys()]).toEqual([id('b')])
  })

  it("le registre n'est pas modifié par une erreur de chargement", async () => {
    const reglages = reglagesSimules([ext('a')])
    const s = sessionSimulee({ echecs: new Set([id('a')]) })
    await creerChargeur({ extensions: s.api, registre: creerRegistre(reglages), base, journal: () => undefined }).chargerAuDemarrage()
    expect(reglages.getSettings().extensions.installees[0].active).toBe(true)
  })
})

describe('activer', () => {
  it('désactive à chaud (removeExtension) puis réactive (loadExtension)', async () => {
    const reglages = reglagesSimules([ext('a')])
    const s = sessionSimulee()
    const c = creerChargeur({ extensions: s.api, registre: creerRegistre(reglages), base })
    await c.chargerAuDemarrage()
    expect(await c.activer(id('a'), false)).toBe(true)
    expect(s.chargees.size).toBe(0)
    expect(reglages.getSettings().extensions.installees[0].active).toBe(false)
    expect(await c.activer(id('a'), true)).toBe(true)
    expect(s.chargees.has(id('a'))).toBe(true)
    expect(reglages.getSettings().extensions.installees[0].active).toBe(true)
  })

  it('id inconnu : faux, rien ne bouge', async () => {
    const s = sessionSimulee()
    const c = creerChargeur({ extensions: s.api, registre: creerRegistre(reglagesSimules([ext('a')])), base })
    expect(await c.activer(id('p'), true)).toBe(false)
    expect(s.appels).toEqual([])
  })

  it("réactivation qui échoue : faux, et l'extension reste désactivée dans le registre", async () => {
    const reglages = reglagesSimules([ext('a', { active: false })])
    const s = sessionSimulee({ echecs: new Set([id('a')]) })
    const c = creerChargeur({ extensions: s.api, registre: creerRegistre(reglages), base, journal: () => undefined })
    expect(await c.activer(id('a'), true)).toBe(false)
    expect(reglages.getSettings().extensions.installees[0].active).toBe(false)
  })

  it('activer une extension déjà chargée ne la charge pas deux fois', async () => {
    const s = sessionSimulee()
    const c = creerChargeur({ extensions: s.api, registre: creerRegistre(reglagesSimules([ext('a')])), base })
    await c.chargerAuDemarrage()
    await c.activer(id('a'), true)
    expect(s.appels.filter((a) => a.startsWith('load')).length).toBe(1)
  })
})

describe('desinstaller', () => {
  it("retire l'extension, supprime tout son dossier et son entrée", async () => {
    const e = ext('a')
    const d = installerDossier(e)
    const autre = installerDossier(ext('b'))
    const reglages = reglagesSimules([e, ext('b')])
    const s = sessionSimulee()
    const c = creerChargeur({ extensions: s.api, registre: creerRegistre(reglages), base })
    await c.chargerAuDemarrage()
    expect(await c.desinstaller(id('a'))).toBe(true)
    expect(s.appels).toContain(`remove ${id('a')}`)
    expect(existsSync(d)).toBe(false)
    expect(existsSync(join(base, id('a')))).toBe(false)
    expect(existsSync(autre)).toBe(true)
    expect(reglages.getSettings().extensions.installees.map((x) => x.id)).toEqual([id('b')])
  })

  it('une extension désactivée se désinstalle aussi ; id inconnu : faux', async () => {
    const e = ext('a', { active: false })
    const d = installerDossier(e)
    const c = creerChargeur({ extensions: sessionSimulee().api, registre: creerRegistre(reglagesSimules([e])), base })
    expect(await c.desinstaller(id('p'))).toBe(false)
    expect(await c.desinstaller(id('a'))).toBe(true)
    expect(existsSync(d)).toBe(false)
  })

  it('la suppression vise <base>/<id> et rien d\'autre', async () => {
    const voisin = join(base, '..', `voisin-${Date.now()}`)
    mkdirSync(voisin)
    writeFileSync(join(voisin, 'garde.txt'), 'x')
    const e = ext('a')
    installerDossier(e)
    const c = creerChargeur({ extensions: sessionSimulee().api, registre: creerRegistre(reglagesSimules([e])), base })
    await c.desinstaller(id('a'))
    expect(readFileSync(join(voisin, 'garde.txt'), 'utf8')).toBe('x')
    rmSync(voisin, { recursive: true, force: true })
  })
})

describe('lister', () => {
  it("ajoute l'état de chargement à chaque entrée", async () => {
    const s = sessionSimulee()
    const c = creerChargeur({ extensions: s.api, registre: creerRegistre(reglagesSimules([ext('a'), ext('b', { active: false })])), base })
    await c.chargerAuDemarrage()
    expect(c.lister().map((x) => [x.id, x.chargee])).toEqual([[id('a'), true], [id('b'), false]])
  })
})

describe('extension de fixture', () => {
  it("le manifest est un MV3 à clé dont l'id est celui attendu", () => {
    const m = JSON.parse(readFileSync(join(FIXTURE, 'manifest.json'), 'utf8'))
    expect(m.manifest_version).toBe(3)
    const hex = createHash('sha256').update(Buffer.from(m.key, 'base64')).digest('hex').slice(0, 32)
    expect([...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')).toBe(ID_FIXTURE)
    expect(readFileSync(join(FIXTURE, 'contenu.js'), 'utf8')).toContain("dataset.lyraExtension = 'ok'")
  })
})

describe('crochets de chargement', () => {
  it('avantChargement puis apresChargement ; une exception est journalisée et ne bloque pas le chargement', async () => {
    const e = ext('a')
    installerDossier(e)
    const appels: string[] = []
    const journal: string[] = []
    const chargeur = creerChargeur({
      extensions: sessionSimulee().api,
      registre: creerRegistre(reglagesSimules([e])),
      base,
      journal: (m) => journal.push(m),
      avantChargement: (x) => {
        appels.push(`avant:${x.nom}`)
        throw new Error('boum')
      },
      apresChargement: (x) => appels.push(`apres:${x.nom}`)
    })
    const r = await chargeur.chargerAuDemarrage()
    expect(r[0].ok).toBe(true)
    expect(appels).toEqual(['avant:Ext a', 'apres:Ext a'])
    expect(journal.some((m) => m.includes('préparation impossible'))).toBe(true)
  })
})
