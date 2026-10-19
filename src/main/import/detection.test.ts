import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detecterProfils, racineImportDeTest, racinesParDefaut } from './detection'

const FIXTURES = fileURLToPath(new URL('./fixtures/chromium', import.meta.url))

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-detect-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const fichier = (chemin: string, contenu = '{}'): void => {
  mkdirSync(join(chemin, '..'), { recursive: true })
  writeFileSync(chemin, contenu)
}

describe('racinesParDefaut', () => {
  it('Windows : %LOCALAPPDATA%', () => {
    const r = racinesParDefaut('win32', { LOCALAPPDATA: 'C:\\Users\\T\\AppData\\Local' }, 'C:\\Users\\T')
    expect(r.chrome).toBe(join('C:\\Users\\T\\AppData\\Local', 'Google', 'Chrome', 'User Data'))
    expect(r.edge).toBe(join('C:\\Users\\T\\AppData\\Local', 'Microsoft', 'Edge', 'User Data'))
    expect(r.brave).toBe(join('C:\\Users\\T\\AppData\\Local', 'BraveSoftware', 'Brave-Browser', 'User Data'))
    expect(r.vivaldi).toBe(join('C:\\Users\\T\\AppData\\Local', 'Vivaldi', 'User Data'))
  })

  it('Windows sans LOCALAPPDATA : AppData\\Local du dossier personnel', () => {
    expect(racinesParDefaut('win32', {}, 'C:\\Users\\T').chrome).toBe(join('C:\\Users\\T', 'AppData', 'Local', 'Google', 'Chrome', 'User Data'))
  })

  it('macOS : ~/Library/Application Support', () => {
    const r = racinesParDefaut('darwin', {}, '/Users/t')
    const support = join('/Users/t', 'Library', 'Application Support')
    expect(r).toEqual({
      chrome: join(support, 'Google', 'Chrome'),
      edge: join(support, 'Microsoft Edge'),
      brave: join(support, 'BraveSoftware', 'Brave-Browser'),
      vivaldi: join(support, 'Vivaldi')
    })
  })

  it('Linux : ~/.config', () => {
    const r = racinesParDefaut('linux', {}, '/home/t')
    expect(r.chrome).toBe(join('/home/t', '.config', 'google-chrome'))
    expect(r.edge).toBe(join('/home/t', '.config', 'microsoft-edge'))
  })
})

describe('LYRA_IMPORT_RACINE', () => {
  it('n’est acceptée que si LYRA_TEST=1', () => {
    expect(racineImportDeTest({ LYRA_IMPORT_RACINE: '/x' })).toBeUndefined()
    expect(racineImportDeTest({ LYRA_IMPORT_RACINE: '/x', LYRA_TEST: '0' })).toBeUndefined()
    expect(racineImportDeTest({ LYRA_IMPORT_RACINE: '/x', LYRA_TEST: '1' })).toBe('/x')
    expect(racineImportDeTest({ LYRA_TEST: '1' })).toBeUndefined()
  })

  it('en test, les profils viennent du dossier indiqué, un sous-dossier par navigateur', async () => {
    const profils = await detecterProfils({ env: { LYRA_TEST: '1', LYRA_IMPORT_RACINE: FIXTURES } })
    expect(profils.map((p) => `${p.navigateur}:${p.nom}`)).toEqual(['chrome:Khalil', 'chrome:Travail', 'edge:Perso', 'brave:Default'])
  })

  it('hors test, la variable est ignorée : on regarde les dossiers de la machine, jamais les fixtures', async () => {
    const profils = await detecterProfils({ env: { LYRA_IMPORT_RACINE: FIXTURES }, plateforme: 'linux', maison: tmp })
    expect(profils).toEqual([])
  })

  it('en test, les dossiers de la machine ne sont pas consultés', async () => {
    // Un faux Chrome dans le « dossier personnel » : ignoré tant que la racine de test est active.
    fichier(join(tmp, '.config', 'google-chrome', 'Default', 'Preferences'))
    const profils = await detecterProfils({ env: { LYRA_TEST: '1', LYRA_IMPORT_RACINE: join(tmp, 'vide') }, plateforme: 'linux', maison: tmp })
    expect(profils).toEqual([])
  })
})

describe('detecterProfils', () => {
  it('profils nommés d’après Local State, le dernier utilisé étant le profil par défaut', async () => {
    const profils = await detecterProfils({ racines: { chrome: join(FIXTURES, 'chrome') }, navigateurs: ['chrome'] })
    expect(profils).toHaveLength(2)
    expect(profils[0]).toMatchObject({ navigateur: 'chrome', nom: 'Khalil', parDefaut: true, racine: join(FIXTURES, 'chrome'), chemin: join(FIXTURES, 'chrome', 'Default') })
    expect(profils[1]).toMatchObject({ nom: 'Travail', parDefaut: false, chemin: join(FIXTURES, 'chrome', 'Profile 1') })
  })

  it('sans Local State : repli sur les dossiers Default et Profile N', async () => {
    const profils = await detecterProfils({ racines: { brave: join(FIXTURES, 'brave') }, navigateurs: ['brave'] })
    expect(profils).toMatchObject([{ navigateur: 'brave', nom: 'Default', parDefaut: true }])
  })

  it('Local State illisible : même repli', async () => {
    fichier(join(tmp, 'Local State'), '{ pas du json')
    mkdirSync(join(tmp, 'Default'))
    mkdirSync(join(tmp, 'Profile 2'))
    mkdirSync(join(tmp, 'Profile 10'))
    mkdirSync(join(tmp, 'Guest Profile'))
    mkdirSync(join(tmp, 'Crashpad'))
    const profils = await detecterProfils({ racines: { chrome: tmp }, navigateurs: ['chrome'] })
    expect(profils.map((p) => p.nom)).toEqual(['Default', 'Profile 2', 'Profile 10'])
  })

  it('un profil du cache dont le dossier a disparu est ignoré', async () => {
    fichier(join(tmp, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Moi' }, 'Profile 3': { name: 'Fantôme' } } } }))
    mkdirSync(join(tmp, 'Default'))
    const profils = await detecterProfils({ racines: { chrome: tmp }, navigateurs: ['chrome'] })
    expect(profils.map((p) => p.nom)).toEqual(['Moi'])
  })

  it('nom affiché : name, sinon gaia_name, sinon user_name, sinon le dossier', async () => {
    fichier(
      join(tmp, 'Local State'),
      JSON.stringify({ profile: { info_cache: { Default: { name: ' ', gaia_name: 'Gaïa' }, 'Profile 1': { user_name: 'moi@example.com' }, 'Profile 2': {} } } })
    )
    for (const d of ['Default', 'Profile 1', 'Profile 2']) mkdirSync(join(tmp, d))
    const profils = await detecterProfils({ racines: { chrome: tmp }, navigateurs: ['chrome'] })
    expect(profils.map((p) => p.nom)).toEqual(['Gaïa', 'moi@example.com', 'Profile 2'])
  })

  it('last_used inconnu : le premier profil est présélectionné', async () => {
    fichier(join(tmp, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'A' }, 'Profile 1': { name: 'B' } }, last_used: 'Profile 9' } }))
    mkdirSync(join(tmp, 'Default'))
    mkdirSync(join(tmp, 'Profile 1'))
    const profils = await detecterProfils({ racines: { chrome: tmp }, navigateurs: ['chrome'] })
    expect(profils.map((p) => p.parDefaut)).toEqual([true, false])
  })

  it('navigateur absent ou dossier inexistant : liste vide, sans exception', async () => {
    expect(await detecterProfils({ racines: { vivaldi: join(tmp, 'nulle-part') }, navigateurs: ['vivaldi'] })).toEqual([])
    expect(await detecterProfils({ env: {}, plateforme: 'win32', maison: tmp })).toEqual([])
  })

  it('navigateur ouvert : verrou de profil présent', async () => {
    mkdirSync(join(tmp, 'Default'))
    expect((await detecterProfils({ racines: { chrome: tmp }, navigateurs: ['chrome'] }))[0].ouvert).toBe(false)
    fichier(join(tmp, 'lockfile'), '')
    expect((await detecterProfils({ racines: { chrome: tmp }, navigateurs: ['chrome'] }))[0].ouvert).toBe(true)
  })

  it('Firefox, Safari, Orion : pas encore pris en charge (Task 2), jamais d’erreur', async () => {
    expect(await detecterProfils({ racines: { firefox: tmp, safari: tmp, orion: tmp }, navigateurs: ['firefox', 'safari', 'orion'] })).toEqual([])
  })
})
