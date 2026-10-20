import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrer } from './migrations'
import { reglagesParDefaut } from './defaults'
import { creerReglages } from './settings'
import { patchImporte, reglagesExportables } from './import'
import v1 from './fixtures/settings-v1.json'

const defauts = reglagesParDefaut('/dl')
const AUCUN_REP = (): boolean => false

describe('migrer', () => {
  it('migre la fixture v1 sans perte : tout champ v1 est conservé, version 2, blocs D à leurs défauts', () => {
    const { settings, avertissements } = migrer(v1, defauts)
    expect(avertissements).toEqual([])
    expect(settings.version).toBe(2)
    const { version: _v, ...reste } = v1 as Record<string, unknown>
    expect(settings).toMatchObject(reste)
    expect(settings.theme).toBe('sombre')
    expect(settings.apparence).toEqual(defauts.apparence)
    expect(settings.couleurs).toEqual(defauts.couleurs)
    expect(settings.demarrage).toEqual(defauts.demarrage)
    expect(settings.dnd).toEqual({ duree: 60 })
  })

  it('un fichier corrompu ou de mauvaise forme redonne les défauts avec un avertissement', () => {
    for (const brut of ['x', 42, null, [1, 2], undefined]) {
      const r = migrer(brut, defauts)
      expect(r.settings).toEqual(defauts)
      expect(r.avertissements.length).toBe(1)
    }
  })

  it('un réglage invalide est ignoré avec un avertissement, le reste est gardé', () => {
    const r = migrer({ theme: 'rose', ciel: { largeur: 300 }, couleurs: 5 }, defauts)
    expect(r.settings.theme).toBe('systeme')
    expect(r.settings.ciel.largeur).toBe(300)
    expect(r.avertissements.join(' ')).toMatch(/theme/)
    expect(r.avertissements.join(' ')).toMatch(/couleurs/)
  })

  it('un réglage inconnu est conservé tel quel (haut niveau et dans un bloc connu)', () => {
    const { settings } = migrer({ futur: { a: [1, 2] }, ciel: { nouveau: 'x', largeur: 300 } }, defauts) as { settings: Record<string, any> }
    expect(settings.futur).toEqual({ a: [1, 2] })
    expect(settings.ciel.nouveau).toBe('x')
    expect(settings.ciel.largeur).toBe(300)
  })

  it('moteursPerso, import et extensions (B/E) traversent la migration', () => {
    const moteurs = [{ id: 'm1', nom: 'Wiki', motCle: 'w', url: 'https://w.fr/?q=%s' }]
    const extensions = { installees: [{ id: 'a'.repeat(32), nom: 'X' }], majAuto: true, derniereVerification: 12 }
    const imp = { extensionsEnAttente: [], reglagesEnAttente: { pageAccueil: 'https://a.fr' } }
    const { settings } = migrer({ ...v1, moteursPerso: moteurs, extensions, import: imp, sites: { 'https://a.fr': { zoom: 1.5, extensions: { ['b'.repeat(32)]: false } } } }, defauts) as { settings: Record<string, any> }
    expect(settings.moteursPerso).toEqual(moteurs)
    expect(settings.extensions).toEqual(extensions)
    expect(settings.import).toEqual(imp)
  })

  it('est idempotente', () => {
    const entrees: unknown[] = [v1, { futur: 1, ciel: { largeur: 999 } }, 'x', {}]
    for (const e of entrees) {
      const une = migrer(e, defauts)
      const deux = migrer(une.settings, defauts)
      expect(deux.settings).toEqual(une.settings)
    }
  })

  it('boucliers par site : booléen et tri-état acceptés tels quels', () => {
    const { settings } = migrer({ sites: { 'https://a.fr': { boucliers: false }, 'https://b.fr': { boucliers: 'strict' }, 'https://c.fr': { boucliers: 'zzz' } } }, defauts)
    expect(settings.sites['https://a.fr']).toEqual({ boucliers: false })
    expect(settings.sites['https://b.fr']).toEqual({ boucliers: 'strict' })
    expect(settings.sites['https://c.fr']).toBeUndefined()
  })
})

describe('persistance', () => {
  it('un réglage inconnu survit à une réécriture du fichier', () => {
    const chemin = join(mkdtempSync(join(tmpdir(), 'lyra-mig-')), 'settings.json')
    writeFileSync(chemin, JSON.stringify({ ...v1, futur: { a: 1 }, extensions: { majAuto: false } }))
    const r = creerReglages(chemin, '/dl')
    expect(r.getSettings().version).toBe(2)
    r.setSettings({ theme: 'clair' })
    const disque = JSON.parse(readFileSync(chemin, 'utf8'))
    expect(disque.version).toBe(2)
    expect(disque.theme).toBe('clair')
    expect(disque.futur).toEqual({ a: 1 })
    expect(disque.extensions).toEqual({ majAuto: false })
  })

  it('un fichier JSON invalide donne les défauts', () => {
    const chemin = join(mkdtempSync(join(tmpdir(), 'lyra-mig-')), 'settings.json')
    writeFileSync(chemin, '{pas du json')
    expect(creerReglages(chemin, '/dl').getSettings().version).toBe(2)
  })
})

describe('export / import', () => {
  it('export v2 → import v2 identique (hors champs locaux)', () => {
    const { settings } = migrer({ ...v1, couleurs: { actif: 'foret', passage: 'coucher' }, raccourcis: { 'onglet.nouveau': 'CmdOrCtrl+T' }, labo: { x: true } }, defauts)
    const export_ = JSON.parse(JSON.stringify(reglagesExportables(settings)))
    const patch = patchImporte(export_, AUCUN_REP)
    const retour = migrer(patch, defauts).settings
    const attendu = { ...settings, import: defauts.import, telechargements: defauts.telechargements, reseau: { ...settings.reseau, personnelle: undefined } }
    delete (attendu.reseau as Record<string, unknown>).personnelle
    expect(retour).toEqual(attendu)
  })

  it('un export v1 (fixture) s\'importe', () => {
    const patch = patchImporte(v1, AUCUN_REP)
    expect(patch.theme).toBe('sombre')
    expect(patch.sites).toEqual(v1.sites)
  })

  it('l\'export ne contient ni extensions.installees ni import', () => {
    const s = { ...migrer(v1, defauts).settings, extensions: { installees: [{ id: 'x' }], majAuto: true, derniereVerification: 3 } }
    const e = reglagesExportables(s as never) as Record<string, any>
    expect(e.import).toBeUndefined()
    expect(e.extensions).toEqual({ majAuto: true, derniereVerification: 3 })
    expect(e.sites).toEqual(s.sites)
  })

  it('l\'import ignore extensions.installees et import', () => {
    const patch = patchImporte({ theme: 'clair', import: { extensionsEnAttente: [], reglagesEnAttente: { pageAccueil: 'https://a.fr' } }, extensions: { installees: [{ id: 'x' }] } }, AUCUN_REP) as Record<string, unknown>
    expect(patch).toEqual({ theme: 'clair' })
  })
})
