import { describe, it, expect } from 'vitest'
import { creerRegistre, dossierAbsolu, idPourDossier, migrerSourceUbo, validerInstallees } from './registre'
import { validerPatch, validerSettings } from '../settings/validate'
import { reglagesParDefaut } from '../settings/defaults'
import type { ExtensionInstallee, Settings } from '../../shared/types'

const ID_A = 'a'.repeat(32)
const ID_B = 'abcdefghijklmnop'.repeat(2)

const ext = (o: Partial<ExtensionInstallee> = {}): ExtensionInstallee => ({
  id: ID_A,
  nom: 'Test',
  version: '1.0.0',
  source: 'dossier',
  magasin: 'inconnu',
  dossier: `${ID_A}/1.0.0`,
  active: true,
  installeeLe: '2026-10-19T10:00:00.000Z',
  miseAJourLe: '2026-10-19T10:00:00.000Z',
  ...o
})

describe('validerInstallees', () => {
  it('garde une entrée valide, dans l\'ordre', () => {
    const a = ext()
    const b = ext({ id: ID_B, dossier: `${ID_B}/2.0` , convertie: true, source: 'xpi', magasin: 'firefox' })
    expect(validerInstallees([a, b])).toEqual([a, b])
  })
  it('slugAmo : conservé s\'il est sûr, entrée refusée sinon', () => {
    const a = ext({ source: 'amo', magasin: 'firefox', convertie: true, slugAmo: 'dark-reader' })
    expect(validerInstallees([a])).toEqual([a])
    expect(validerInstallees([{ ...a, slugAmo: '../x' }])).toBeUndefined()
    expect(validerInstallees([{ ...a, slugAmo: 3 }])).toBeUndefined()
  })
  it('refuse un id qui n\'est pas 32 lettres a-p', () => {
    expect(validerInstallees([ext({ id: 'z'.repeat(32) }), ext({ id: 'a'.repeat(31) }), ext({ id: 'A'.repeat(32) })])).toBeUndefined()
    expect(validerInstallees([ext({ id: 'z'.repeat(32) }), ext({ id: ID_B, dossier: `${ID_B}/1` })])).toEqual([ext({ id: ID_B, dossier: `${ID_B}/1` })])
  })
  it('accepte la source « ubo » (uBlock Origin installé par Lyra)', () => {
    const u = ext({ nom: 'uBlock Origin', source: 'ubo', magasin: 'chrome' })
    expect(validerInstallees([u])).toEqual([u])
  })
  it('refuse source et magasin hors énumération', () => {
    expect(validerInstallees([{ ...ext(), source: 'torrent' }])).toBeUndefined()
    expect(validerInstallees([{ ...ext(), magasin: 'opera' }])).toBeUndefined()
  })
  it('refuse un dossier absolu, avec .., vide ou avec antislash', () => {
    for (const dossier of ['/etc', '../x', 'a/../../x', '', 'C:\\x', 'a\\b', './a', 'a//b', `${ID_A}/..`]) {
      expect(validerInstallees([ext({ dossier }), ext({ id: ID_B, dossier: `${ID_B}/1` })])).toEqual([ext({ id: ID_B, dossier: `${ID_B}/1` })])
    }
  })
  it('refuse les types invalides et ignore les clés inconnues', () => {
    expect(validerInstallees([{ ...ext(), active: 'oui' }])).toBeUndefined()
    expect(validerInstallees([{ ...ext(), nom: 3 }])).toBeUndefined()
    expect(validerInstallees([{ ...ext(), installeeLe: 'hier' }])).toBeUndefined()
    expect(validerInstallees([{ ...ext(), convertie: 'x' }])).toBeUndefined()
    expect(validerInstallees([{ ...ext(), pirate: 1 }])).toEqual([ext()])
  })
  it('écarte les doublons d\'id (le premier gagne)', () => {
    expect(validerInstallees([ext(), ext({ nom: 'Autre' })])).toEqual([ext()])
  })
  it('accepte [] explicite ; refuse un non-tableau ; une liste non vide toute invalide est ignorée', () => {
    expect(validerInstallees([])).toEqual([])
    expect(validerInstallees('x')).toBeUndefined()
    expect(validerInstallees({})).toBeUndefined()
    expect(validerInstallees([null, 3])).toBeUndefined()
  })
  it('borne le nombre d\'extensions', () => {
    const toutes = Array.from({ length: 300 }, (_, i) => {
      const id = 'a'.repeat(30) + String.fromCharCode(97 + (i >> 4)) + String.fromCharCode(97 + (i & 15))
      return ext({ id, dossier: `${id}/1` })
    })
    expect(validerInstallees(toutes)!.length).toBe(200)
  })
})

describe('section extensions des réglages', () => {
  const defauts = reglagesParDefaut('/dl')
  it('valeurs par défaut : aucune extension, mises à jour automatiques', () => {
    expect(defauts.extensions).toEqual({ installees: [], majAuto: true })
  })
  it('migration : un settings.json sans section reçoit les défauts', () => {
    const { extensions: _e, ...ancien } = defauts as Settings
    const s = validerSettings(ancien, defauts)
    expect(s.extensions).toEqual({ installees: [], majAuto: true })
  })
  it('un JSON avec section valide la conserve ; l\'invalide retombe sur les défauts', () => {
    const a = ext()
    expect(validerSettings({ extensions: { installees: [a], majAuto: false, derniereVerification: '2026-10-19T10:00:00.000Z' } }, defauts).extensions).toEqual({
      installees: [a],
      majAuto: false,
      derniereVerification: '2026-10-19T10:00:00.000Z'
    })
    expect(validerSettings({ extensions: { installees: 'x', majAuto: 'oui', derniereVerification: 'hier' } }, defauts).extensions).toEqual({ installees: [], majAuto: true })
  })
  it('validerPatch passe par la validation stricte', () => {
    expect(validerPatch({ extensions: { installees: [{ ...ext(), dossier: '../x' }] } })).toEqual({})
  })
})

describe('idPourDossier', () => {
  it('donne un id valide et stable', () => {
    const id = idPourDossier('/tmp/x')
    expect(id).toMatch(/^[a-p]{32}$/)
    expect(idPourDossier('/tmp/x')).toBe(id)
    expect(idPourDossier('/tmp/y')).not.toBe(id)
  })
})

describe('dossierAbsolu', () => {
  it('résout sous la base et refuse toute sortie', () => {
    expect(dossierAbsolu('/ud/extensions', `${ID_A}/1.0`)).toMatch(/extensions[\\/]a{32}[\\/]1\.0$/)
    expect(() => dossierAbsolu('/ud/extensions', '../x')).toThrow()
    expect(() => dossierAbsolu('/ud/extensions', '/etc')).toThrow()
  })
})

describe('creerRegistre', () => {
  const faux = (init: ExtensionInstallee[] = []) => {
    let s = { ...reglagesParDefaut('/dl'), extensions: { installees: init, majAuto: true } } as Settings
    return {
      getSettings: () => s,
      setSettings: (patch: Partial<Settings>) => {
        s = { ...s, ...validerPatch(patch), extensions: { ...s.extensions, ...(validerPatch(patch).extensions ?? {}) } } as Settings
        return s
      }
    }
  }
  it('ajoute, remplace par id, active, retire', () => {
    const r = creerRegistre(faux())
    r.ajouter(ext())
    r.ajouter(ext({ id: ID_B, dossier: `${ID_B}/1` }))
    expect(r.lister().map((e) => e.id)).toEqual([ID_A, ID_B])
    r.ajouter(ext({ version: '2.0.0' }))
    expect(r.lister().map((e) => e.version)).toEqual(['2.0.0', '1.0.0'])
    expect(r.lister()[0].id).toBe(ID_A)
    expect(r.activer(ID_A, false)).toBe(true)
    expect(r.trouver(ID_A)?.active).toBe(false)
    expect(r.activer('p'.repeat(32), true)).toBe(false)
    expect(r.retirer(ID_A)).toBe(true)
    expect(r.lister().map((e) => e.id)).toEqual([ID_B])
    expect(r.retirer(ID_A)).toBe(false)
  })
})

describe('migrerSourceUbo', () => {
  const faux = (init: ExtensionInstallee[]) => {
    let s = { ...reglagesParDefaut('/dl'), extensions: { installees: init, majAuto: true } } as Settings
    return {
      getSettings: () => s,
      setSettings: (patch: Partial<Settings>) => {
        s = { ...s, ...validerPatch(patch), extensions: { ...s.extensions, ...(validerPatch(patch).extensions ?? {}) } } as Settings
        return s
      }
    }
  }
  const ancienUbo = ext({ nom: 'uBlock Origin', source: 'zip', magasin: 'chrome' })
  it('une entrée « zip » reconnue comme uBO (nom, casse et espaces ignorés) passe en « ubo », sans toucher au reste', () => {
    const autre = ext({ id: ID_B, dossier: `${ID_B}/1`, nom: 'Autre', source: 'zip', magasin: 'inconnu' })
    const r = creerRegistre(faux([{ ...ancienUbo, nom: '  uBlock ORIGIN ' }, autre]))
    expect(migrerSourceUbo(r)).toBe(1)
    expect(r.lister()[0]).toMatchObject({ id: ID_A, nom: '  uBlock ORIGIN ', source: 'ubo', version: '1.0.0', active: true })
    expect(r.lister()[1]).toEqual(autre)
  })
  it('idempotent ; une entrée déjà « ubo », « cws » ou « dossier » nommée uBlock Origin n\'est pas touchée', () => {
    const cws = ext({ id: ID_B, dossier: `${ID_B}/1`, nom: 'uBlock Origin', source: 'cws', magasin: 'chrome' })
    const r = creerRegistre(faux([ancienUbo, cws]))
    expect(migrerSourceUbo(r)).toBe(1)
    expect(migrerSourceUbo(r)).toBe(0)
    expect(r.lister().map((e) => e.source)).toEqual(['ubo', 'cws'])
  })
  it('rien à migrer : le registre n\'est pas réécrit', () => {
    const f = faux([ext()])
    let ecritures = 0
    const r = creerRegistre({ getSettings: f.getSettings, setSettings: (p) => (ecritures++, f.setSettings(p)) })
    expect(migrerSourceUbo(r)).toBe(0)
    expect(ecritures).toBe(0)
  })
})
