import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chercher, INDEX, REPLI_LIGNE } from './recherche'
import { SECTIONS } from './sections'

const ids = (q: string, index = INDEX): string[] => chercher(q, index).map((r) => r.id)

describe('chercher', () => {
  it('ignore la casse et les accents', () => {
    expect(ids('LE CIEL')).toContain('apparence')
    expect(ids('theme')).toContain('apparence.theme')
    expect(ids('Thème')).toContain('apparence.theme')
    expect(ids('etoiles')).toContain('apparence')
  })
  it('reconnaît les synonymes', () => {
    expect(ids('zoom')).toContain('sites')
    expect(ids('sombre')).toContain('couleurs')
    expect(ids('ciel')).toContain('apparence')
    expect(ids('raccourci')).toContain('raccourcis')
    expect(ids('cookies')).toEqual(expect.arrayContaining(['sites', 'confidentialite']))
  })
  it('exige tous les mots', () => {
    expect(ids('moteur defaut')).toContain('palette.moteur')
    expect(ids('moteur zzzz')).toEqual([])
    expect(ids('largeur ciel')).toContain('apparence.largeur')
  })
  it('ne renvoie rien pour une requête sans résultat ou vide', () => {
    expect(chercher('zzzzqq')).toEqual([])
    expect(chercher('   ')).toEqual([])
  })
  it('trie libellé exact, puis préfixe, puis mot-clé', () => {
    const index = [
      { id: 'c', section: 'x', libelle: 'Autre', motsCles: ['thème'] },
      { id: 'b', section: 'x', libelle: 'Le thème sombre', motsCles: [] },
      { id: 'a2', section: 'x', libelle: 'Thème du ciel', motsCles: [] },
      { id: 'a', section: 'x', libelle: 'Thème', motsCles: [] }
    ]
    expect(ids('theme', index)).toEqual(['a', 'a2', 'b', 'c'])
  })
  it('qualifie un résultat de section ou de ligne', () => {
    const r = chercher('moteur par defaut')[0]
    expect(r).toMatchObject({ id: 'palette.moteur', section: 'palette', type: 'ligne' })
    expect(chercher('Boucliers')[0]).toMatchObject({ id: 'boucliers', section: 'boucliers', type: 'section' })
  })
})

describe('INDEX', () => {
  it('contient un enregistrement par section du sommaire', () => {
    for (const s of SECTIONS) expect(INDEX.find((r) => r.id === s.id)?.libelle).toBe(s.libelle)
  })
  it("garde à double sens : l'index et les `reglage=\"…\"` du code concordent", () => {
    const sources = readdirSync(__dirname)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => readFileSync(join(__dirname, f), 'utf8'))
      .join('\n')
    const lignes = INDEX.filter((r) => r.id.includes('.'))
    expect(lignes.length).toBeGreaterThan(10)
    for (const r of lignes) {
      expect(SECTIONS.some((s) => s.id === r.section), r.id).toBe(true)
      expect(r.id.startsWith(`${r.section}.`), r.id).toBe(true)
      expect(sources, r.id).toContain(`reglage="${r.id}"`)
    }
    const dansLeCode = [...sources.matchAll(/reglage="([A-Za-z]+\.[A-Za-z]+)"/g)].map((m) => m[1])
    for (const id of dansLeCode) expect(INDEX.map((r) => r.id), `non indexé : ${id}`).toContain(id)
  })
  it('a des ids uniques', () => {
    expect(new Set(INDEX.map((r) => r.id)).size).toBe(INDEX.length)
  })
})

describe('REPLI_LIGNE', () => {
  it('chaque ligne de repli et sa cible sont indexées (la plage horaire se replie sur « Passer en sombre »)', () => {
    const ids = INDEX.map((r) => r.id)
    for (const [ligne, cible] of Object.entries(REPLI_LIGNE)) {
      expect(ids, ligne).toContain(ligne)
      expect(ids, cible).toContain(cible)
    }
    expect(REPLI_LIGNE['couleurs.heure']).toBe('couleurs.passage')
  })
})
