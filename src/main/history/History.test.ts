import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { History } from './History'

const JOUR = 86_400_000
const NOW = Date.UTC(2026, 9, 19, 12)
let chemin: string

beforeEach(() => {
  chemin = join(mkdtempSync(join(tmpdir(), 'lyra-histo-')), 'historique.jsonl')
})

describe('History', () => {
  it('fichier absent : historique vide', () => {
    const h = new History(chemin)
    expect(h.rechercher('')).toEqual([])
    expect(h.frequents(5)).toEqual([])
  })

  it('ajoute puis recherche sans tenir compte de la casse ni des accents', async () => {
    const h = new History(chemin)
    h.ajouter({ url: 'https://lyre.fr/', title: 'La Lyre — Étoile', date: NOW })
    h.ajouter({ url: 'https://autre.fr/', title: 'Autre', date: NOW + 1 })
    await h.attendre()
    expect(h.rechercher('lyre').map((e) => e.url)).toEqual(['https://lyre.fr/'])
    expect(h.rechercher('ETOILE')).toHaveLength(1)
    expect(h.rechercher('AUTRE.fr')).toHaveLength(1)
  })

  it('cumule les visites et trie par dernière visite', async () => {
    const h = new History(chemin)
    h.ajouter({ url: 'https://a.fr/', title: 'A', date: NOW })
    h.ajouter({ url: 'https://b.fr/', title: 'B', date: NOW + 10 })
    h.ajouter({ url: 'https://a.fr/', title: 'A', date: NOW + 20 })
    const r = h.rechercher('')
    expect(r.map((e) => e.url)).toEqual(['https://a.fr/', 'https://b.fr/'])
    expect(r[0]).toMatchObject({ visites: 2, visitedAt: NOW + 20 })
    expect(h.rechercher('', 1)).toHaveLength(1)
  })

  it('persiste en JSON lignes et se recharge au démarrage', async () => {
    const h = new History(chemin)
    h.ajouter({ url: 'https://a.fr/', title: 'A', date: NOW })
    h.ajouter({ url: 'https://a.fr/', title: 'A', date: NOW + 5 })
    await h.attendre()
    expect(readFileSync(chemin, 'utf8').trim().split('\n')).toHaveLength(2)
    const h2 = new History(chemin)
    expect(h2.rechercher('')[0]).toMatchObject({ url: 'https://a.fr/', visites: 2, visitedAt: NOW + 5 })
  })

  it('ignore les lignes invalides sans planter', () => {
    writeFileSync(chemin, 'pas du json\n{"url":"https://a.fr/","title":"A","date":5}\n{"x":1}\n\n{"url":3}\n')
    const h = new History(chemin)
    expect(h.rechercher('').map((e) => e.url)).toEqual(['https://a.fr/'])
  })

  it('ne retient ni lyra:// ni file://, sauf enregistrerFichiers', () => {
    const h = new History(chemin)
    h.ajouter({ url: 'lyra://settings', title: 'x', date: NOW })
    h.ajouter({ url: 'file:///a.html', title: 'x', date: NOW })
    expect(h.rechercher('')).toEqual([])
    const t = new History(chemin, { enregistrerFichiers: true })
    t.ajouter({ url: 'file:///a.html', title: 'Fichier', date: NOW })
    t.ajouter({ url: 'lyra://settings', title: 'x', date: NOW })
    expect(t.rechercher('').map((e) => e.url)).toEqual(['file:///a.html'])
  })

  it('ne retient pas une navigation privée', () => {
    const h = new History(chemin)
    h.ajouter({ url: 'https://a.fr/', title: 'A', date: NOW, prive: true })
    expect(h.rechercher('')).toEqual([])
  })

  it('le titre qui arrive plus tard met à jour l’entrée, y compris après rechargement', async () => {
    const h = new History(chemin)
    h.ajouter({ url: 'https://a.fr/', title: '', date: NOW })
    h.majTitre('https://a.fr/', 'Titre tardif', NOW + 1)
    expect(h.rechercher('tardif')).toHaveLength(1)
    expect(h.rechercher('')[0].visites).toBe(1)
    await h.attendre()
    expect(new History(chemin).rechercher('tardif')[0]).toMatchObject({ visites: 1, title: 'Titre tardif' })
  })

  it('supprime une URL (le fichier est compacté)', async () => {
    const h = new History(chemin)
    h.ajouter({ url: 'https://a.fr/', title: 'A', date: NOW })
    h.ajouter({ url: 'https://b.fr/', title: 'B', date: NOW + 1 })
    h.supprimer('https://a.fr/')
    await h.attendre()
    expect(h.rechercher('').map((e) => e.url)).toEqual(['https://b.fr/'])
    expect(new History(chemin).rechercher('').map((e) => e.url)).toEqual(['https://b.fr/'])
  })

  it('efface tout', async () => {
    const h = new History(chemin)
    h.ajouter({ url: 'https://a.fr/', title: 'A', date: NOW })
    h.effacer()
    await h.attendre()
    expect(h.rechercher('')).toEqual([])
    expect(existsSync(chemin) ? readFileSync(chemin, 'utf8') : '').toBe('')
  })

  it('une écriture après suppression n’est pas perdue (file sérialisée)', async () => {
    const h = new History(chemin)
    h.ajouter({ url: 'https://a.fr/', title: 'A', date: NOW })
    h.supprimer('https://a.fr/')
    h.ajouter({ url: 'https://b.fr/', title: 'B', date: NOW + 1 })
    await h.attendre()
    expect(new History(chemin).rechercher('').map((e) => e.url)).toEqual(['https://b.fr/'])
  })

  it('frequents : top par visites sur 30 jours, sans lyra:// ni file://', () => {
    const h = new History(chemin, { enregistrerFichiers: true })
    const visite = (url: string, date: number): void => h.ajouter({ url, title: url, date })
    for (let i = 0; i < 3; i++) visite('https://a.fr/', NOW - i * 1000)
    for (let i = 0; i < 5; i++) visite('https://b.fr/', NOW - i * 1000)
    for (let i = 0; i < 9; i++) visite('https://vieux.fr/', NOW - 40 * JOUR - i)
    visite('https://c.fr/', NOW)
    for (let i = 0; i < 7; i++) visite('file:///x.html', NOW - i)
    expect(h.frequents(2, NOW).map((e) => e.url)).toEqual(['https://b.fr/', 'https://a.fr/'])
    expect(h.frequents(10, NOW).map((e) => e.url)).not.toContain('https://vieux.fr/')
    expect(h.frequents(10, NOW).map((e) => e.url)).not.toContain('file:///x.html')
  })
})

