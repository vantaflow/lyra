import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrer } from './migrations'
import { reglagesParDefaut } from './defaults'
import { creerReglages } from './settings'
import { TAILLE_MAX_IMPORT, patchImporte, reglagesExportables, serialiserReglages } from './import'
import { COULEURS_INDIGO_NUIT } from '../../shared/types-reglages'
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
    const installee = { id: 'a'.repeat(32), nom: 'X', version: '1.0.0', source: 'zip', magasin: 'chrome', dossier: `${'a'.repeat(32)}/1.0.0`, active: true, installeeLe: '2026-10-19T10:00:00.000Z', miseAJourLe: '2026-10-19T10:00:00.000Z' }
    const extensions = { installees: [installee], majAuto: true, derniereVerification: '2026-10-19T10:00:00.000Z' }
    const imp = { extensionsEnAttente: [], reglagesEnAttente: { pageAccueil: 'https://a.fr' } }
    const { settings } = migrer({ ...v1, moteursPerso: moteurs, extensions, import: imp, sites: { 'https://a.fr': { zoom: 1.5, extensions: { ['b'.repeat(32)]: false } } } }, defauts) as { settings: Record<string, any> }
    expect(settings.moteursPerso).toEqual(moteurs)
    expect(settings.extensions).toEqual(extensions)
    expect(settings.import).toEqual(imp)
    // `sites[…].extensions` (jalon B) : validé par `reglesExtensions` dans le valideur de sites, il traverse la migration.
    expect((settings.sites as Record<string, any>)['https://a.fr']).toEqual({ zoom: 1.5, extensions: { ['b'.repeat(32)]: false } })
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
    // `extensions` est connu depuis le jalon B : le registre absent prend son défaut, `majAuto` est conservé.
    expect(disque.extensions).toEqual({ installees: [], majAuto: false })
  })

  it('un fichier JSON invalide donne les défauts, un avertissement et une copie .corrompu', () => {
    const chemin = join(mkdtempSync(join(tmpdir(), 'lyra-mig-')), 'settings.json')
    writeFileSync(chemin, '{pas du json')
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const r = creerReglages(chemin, '/dl')
      expect(r.getSettings()).toEqual(reglagesParDefaut('/dl'))
      expect(avert.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/\[reglages\] fichier illisible/)
      r.setSettings({ theme: 'clair' })
    } finally {
      avert.mockRestore()
    }
    expect(readFileSync(`${chemin}.corrompu`, 'utf8')).toBe('{pas du json')
    expect(JSON.parse(readFileSync(chemin, 'utf8')).theme).toBe('clair')
  })

  it('un JSON valide mais pas un objet : défauts, avertissement, copie', () => {
    const chemin = join(mkdtempSync(join(tmpdir(), 'lyra-mig-')), 'settings.json')
    writeFileSync(chemin, '[1,2]')
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(creerReglages(chemin, '/dl').getSettings()).toEqual(reglagesParDefaut('/dl'))
      expect(avert.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/illisible/)
    } finally {
      avert.mockRestore()
    }
    expect(readFileSync(`${chemin}.corrompu`, 'utf8')).toBe('[1,2]')
  })

  it('les clés rejetées sont journalisées', () => {
    const chemin = join(mkdtempSync(join(tmpdir(), 'lyra-mig-')), 'settings.json')
    writeFileSync(chemin, JSON.stringify({ theme: 'rose' }))
    const avert = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      creerReglages(chemin, '/dl')
      expect(avert.mock.calls.map((c) => String(c[0]))).toContain('[reglages] Réglage invalide ignoré : theme')
    } finally {
      avert.mockRestore()
    }
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

describe('moteurs perso, suggestions de la palette et page d\'accueil importée : aller-retour', () => {
  const perso = [{ id: 'perso-mon-wiki', nom: 'Mon wiki', motCle: 'mw', url: 'https://wiki.exemple.fr/?q=%s' }]
  it('l\'export garde moteursPerso et palette.* mais jamais la file d\'import (pageAccueil en attente comprise)', () => {
    const s = {
      ...defauts,
      moteursPerso: perso,
      palette: { suggestionsHistorique: false, suggestionsFavoris: true, suggestionsEnPrivee: true },
      import: { extensionsEnAttente: [], reglagesEnAttente: { pageAccueil: 'https://a.fr' } }
    }
    const texte = serialiserReglages(s)
    expect(texte).not.toContain('reglagesEnAttente')
    const retour = migrer(patchImporte(JSON.parse(texte), AUCUN_REP), defauts).settings
    expect(retour.moteursPerso).toEqual(perso)
    expect(retour.palette).toEqual(s.palette)
    expect(retour.import).toEqual(defauts.import)
  })
  it('un export sans moteursPerso (v1 ancien) s\'importe sans effacer ceux déjà présents', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'lyra-settings-'))
    const reglages = creerReglages(join(dossier, 'settings.json'), '/dl')
    reglages.setSettings({ moteursPerso: perso })
    const { moteursPerso: _m, import: _i, ...ancien } = v1 as Record<string, unknown>
    reglages.setSettings(patchImporte(ancien, AUCUN_REP))
    expect(reglages.getSettings().moteursPerso).toEqual(perso)
    expect(reglages.getSettings().theme).toBe('sombre')
  })
})

describe('couleurs.depart, reference et corrigerContraste : migration et aller-retour', () => {
  it('d\'anciens réglages sans ces champs reçoivent les défauts', () => {
    const { settings, avertissements } = migrer({ ...v1, couleurs: { actif: 'foret' } }, defauts)
    expect(avertissements).toEqual([])
    expect(settings.couleurs).toMatchObject({ actif: 'foret', depart: 'indigo-nuit', reference: null, corrigerContraste: true })
  })
  it('des valeurs invalides retombent sur les défauts avec un avertissement', () => {
    const r = migrer({ ...v1, couleurs: { depart: 'rose', corrigerContraste: 'peut-être' } }, defauts)
    expect(r.settings.couleurs).toMatchObject({ depart: 'indigo-nuit', corrigerContraste: true })
    expect(r.avertissements.length).toBeGreaterThan(0)
  })
  it('survivent à l\'export puis à l\'import', () => {
    const ref = structuredClone(defauts.couleurs.personnalisees ?? COULEURS_INDIGO_NUIT)
    ref.accent.clair = '#112233'
    const { settings } = migrer({ ...v1, couleurs: { depart: 'foret', reference: ref, personnalisees: ref, corrigerContraste: false } }, defauts)
    expect(settings.couleurs).toMatchObject({ depart: 'foret', reference: ref, corrigerContraste: false })
    const patch = patchImporte(JSON.parse(serialiserReglages(settings)), AUCUN_REP)
    expect(migrer(patch, defauts).settings.couleurs).toMatchObject({ depart: 'foret', reference: ref, corrigerContraste: false })
  })
})

describe('taille des réglages', () => {
  const avecSites = (n: number) =>
    migrer({ sites: Object.fromEntries(Array.from({ length: n }, (_, i) => [`https://s${i}.fr`, { style: 'a'.repeat(102_400) }])) }, defauts).settings

  it('la limite est de 16 Mo', () => {
    expect(TAILLE_MAX_IMPORT).toBe(16 * 1024 * 1024)
  })
  it('un export juste sous la limite est réimportable à l\'identique', () => {
    const s = avecSites(160)
    const json = serialiserReglages(s)
    expect(json.length).toBeLessThanOrEqual(TAILLE_MAX_IMPORT)
    expect(json.length).toBeGreaterThan(TAILLE_MAX_IMPORT * 0.9)
    const retour = migrer(patchImporte(JSON.parse(json), AUCUN_REP), defauts).settings
    expect(retour.sites).toEqual(s.sites)
  })
  it('l\'export au-delà est refusé avec un message clair', () => {
    expect(() => serialiserReglages(avecSites(165))).toThrow(/^Réglages trop volumineux pour être exportés \(\d+\.\d Mo, maximum 16 Mo\)\.$/)
  })
})
