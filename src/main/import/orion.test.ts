import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAINTENANT_FIXTURES_APPLE } from './fixtures/generer-apple'
import { detecterProfilsOrion, lireProfilOrion } from './orion'
import { estIndisponible } from './types'
import type { ElementImport, FavorisImportes, ProfilDetecte, Visite } from './types'

const FIXTURES = fileURLToPath(new URL('./fixtures/orion', import.meta.url))
const MAINTENANT = MAINTENANT_FIXTURES_APPLE

async function profil(nom: string): Promise<ProfilDetecte> {
  const p = (await detecterProfilsOrion(FIXTURES)).find((x) => x.nom === nom)
  if (!p) throw new Error(`profil ${nom} introuvable`)
  return p
}

const lire = (p: ProfilDetecte, elements: ElementImport[], extra: Parameters<typeof lireProfilOrion>[1] = {}) => lireProfilOrion(p, { elements, maintenant: MAINTENANT, ...extra })

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-orion-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function profilJetable(): ProfilDetecte {
  const chemin = join(tmp, 'Defaults', 'Default')
  mkdirSync(chemin, { recursive: true })
  return { navigateur: 'orion', nom: 'Default', chemin, racine: tmp, parDefaut: true }
}

describe('détection', () => {
  it('profils = sous-dossiers de Defaults, « Default » en tête et par défaut', async () => {
    const profils = await detecterProfilsOrion(FIXTURES)
    expect(profils.map((p) => [p.nom, p.parDefaut])).toEqual([
      ['Default', true],
      ['Travail', false]
    ])
    expect(profils[0]).toMatchObject({ navigateur: 'orion', chemin: join(FIXTURES, 'Defaults', 'Default'), racine: FIXTURES })
  })

  it('pas de dossier Defaults, ou racine absente : aucun profil', async () => {
    expect(await detecterProfilsOrion(tmp)).toEqual([])
    expect(await detecterProfilsOrion(join(tmp, 'absent'))).toEqual([])
  })

  it('sans « Default » : le premier par ordre alphabétique est le profil par défaut ; les fichiers sont ignorés', async () => {
    mkdirSync(join(tmp, 'Defaults', 'Zoe'), { recursive: true })
    mkdirSync(join(tmp, 'Defaults', 'Alice'), { recursive: true })
    writeFileSync(join(tmp, 'Defaults', 'notes.txt'), 'x')
    const profils = await detecterProfilsOrion(tmp)
    expect(profils.map((p) => [p.nom, p.parDefaut])).toEqual([
      ['Alice', true],
      ['Zoe', false]
    ])
  })
})

describe('lecture', () => {
  it('favoris : même lecteur que Safari (plist binaire)', async () => {
    const { donnees, compteurs } = await lire(await profil('Default'), ['favoris'])
    const f = donnees.favoris as FavorisImportes
    expect(f.barre.map((n) => n.titre)).toEqual(['Exemple', 'Lecture'])
    expect(f.autres.map((n) => n.titre)).toEqual(['Wikipédia', 'Vide'])
    expect(JSON.stringify(f)).not.toContain('reading.example.com')
    expect(compteurs.favoris).toEqual({ favoris: 4, dossiers: 2 })
  })

  it('favoris : plist XML', async () => {
    const f = (await lire(await profil('Travail'), ['favoris'])).donnees.favoris as FavorisImportes
    expect(f.barre).toEqual([{ type: 'lien', titre: 'Intranet & co', url: 'https://work.example.com/?a=1&b=2', date: 0 }])
    expect(f.autres).toEqual([])
  })

  it('historique : fichier « history », fenêtre de 92 jours, tri décroissant', async () => {
    const { donnees, compteurs } = await lire(await profil('Default'), ['historique'])
    const h = donnees.historique as Visite[]
    expect(h.map((v) => v.url)).toEqual(['https://example.com/', 'http://clair.example.com/', 'https://mixte.example.com/', 'https://docs.example.org/guide'])
    expect(h.map((v) => v.visites)).toEqual([3, 1, 1, 2])
    expect(compteurs.historique).toEqual({ pages: 4, visites: 7 })
    const tout = (await lire(await profil('Default'), ['historique'], { depuisJours: null })).donnees.historique as Visite[]
    expect(tout).toHaveLength(5)
  })

  it('historique : repli sur History.db', async () => {
    const p = profilJetable()
    copyFileSync(join(FIXTURES, 'Defaults', 'Default', 'history'), join(p.chemin, 'History.db'))
    const h = (await lire(p, ['historique'])).donnees.historique as Visite[]
    expect(h).toHaveLength(4)
  })

  it('profil Travail sans historique : Indisponible (absent)', async () => {
    const { donnees } = await lire(await profil('Travail'), ['historique'])
    expect(donnees.historique).toMatchObject({ indisponible: true, code: 'absent' })
  })

  it('onglets, moteurs, extensions, réglages : Indisponible avec une raison', async () => {
    const { donnees } = await lire(await profil('Default'), ['onglets', 'moteurs', 'extensions', 'reglages'])
    for (const e of ['onglets', 'moteurs', 'extensions', 'reglages'] as const) {
      const v = donnees[e]
      expect(estIndisponible(v) && v.raison.startsWith('Orion :')).toBe(true)
    }
  })
})

describe('fichiers absents ou corrompus', () => {
  it('rien dans le profil : Indisponible', async () => {
    const { donnees } = await lire(profilJetable(), ['favoris', 'historique'])
    expect(donnees.favoris).toMatchObject({ indisponible: true, code: 'absent' })
    expect(donnees.historique).toMatchObject({ indisponible: true, code: 'absent' })
  })

  it('favourites.plist corrompu et history corrompu : Indisponible, sans crash', async () => {
    const p = profilJetable()
    writeFileSync(join(p.chemin, 'favourites.plist'), Buffer.concat([Buffer.from('bplist00'), Buffer.alloc(100, 7)]))
    writeFileSync(join(p.chemin, 'history'), Buffer.alloc(500, 1))
    const { donnees } = await lire(p, ['favoris', 'historique'])
    expect(donnees.favoris).toMatchObject({ indisponible: true })
    expect(donnees.historique).toMatchObject({ indisponible: true })
  })
})
