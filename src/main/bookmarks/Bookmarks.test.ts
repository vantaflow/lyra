import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Bookmarks } from './Bookmarks'

let chemin: string
beforeEach(() => {
  chemin = join(mkdtempSync(join(tmpdir(), 'lyra-fav-')), 'favoris.json')
})

describe('Bookmarks', () => {
  it('fichier absent ou corrompu : liste vide', () => {
    expect(new Bookmarks(chemin).lister()).toEqual([])
    writeFileSync(chemin, '{pas du json')
    expect(new Bookmarks(chemin).lister()).toEqual([])
    writeFileSync(chemin, JSON.stringify({ items: 'oups' }))
    expect(new Bookmarks(chemin).lister()).toEqual([])
  })

  it('ajoute, vérifie, retire et persiste', () => {
    const b = new Bookmarks(chemin)
    b.ajouter({ url: 'https://a.fr/', title: 'A', dossier: 'Lecture' })
    expect(b.existe('https://a.fr/')).toBe(true)
    expect(new Bookmarks(chemin).lister()).toMatchObject([{ url: 'https://a.fr/', title: 'A', dossier: 'Lecture' }])
    b.retirer('https://a.fr/')
    expect(b.existe('https://a.fr/')).toBe(false)
    expect(new Bookmarks(chemin).lister()).toEqual([])
  })

  it('ajouter deux fois la même URL ne duplique pas', () => {
    const b = new Bookmarks(chemin)
    b.ajouter({ url: 'https://a.fr/', title: 'A' })
    b.ajouter({ url: 'https://a.fr/', title: 'A2' })
    expect(b.lister()).toHaveLength(1)
  })

  it('toggle est idempotent par paire d’appels et renvoie le nouvel état', () => {
    const b = new Bookmarks(chemin)
    expect(b.toggle({ url: 'https://a.fr/', title: 'A' })).toBe(true)
    expect(b.existe('https://a.fr/')).toBe(true)
    expect(b.toggle({ url: 'https://a.fr/', title: 'A' })).toBe(false)
    expect(b.existe('https://a.fr/')).toBe(false)
  })

  it('recherche sur titre et URL, sans accents', () => {
    const b = new Bookmarks(chemin)
    b.ajouter({ url: 'https://a.fr/', title: 'Étoile polaire' })
    b.ajouter({ url: 'https://b.fr/lyre', title: 'B' })
    expect(b.rechercher('etoile')).toHaveLength(1)
    expect(b.rechercher('LYRE')).toHaveLength(1)
    expect(b.rechercher('')).toHaveLength(2)
  })

  it('prévient les écouteurs à chaque changement', () => {
    const b = new Bookmarks(chemin)
    let n = 0
    b.onChange(() => n++)
    b.toggle({ url: 'https://a.fr/', title: 'A' })
    b.retirer('https://a.fr/')
    b.retirer('https://a.fr/') // rien à retirer : pas d’évènement
    expect(n).toBe(2)
  })
})

describe('Bookmarks.ajouterLot', () => {
  it('une seule écriture, dates d\'origine conservées, chemins de dossiers', () => {
    const b = new Bookmarks(chemin)
    let ecritures = 0
    b.onChange(() => ecritures++)
    const r = b.ajouterLot([
      { url: 'https://a.fr/', title: 'A', dossier: 'Importés de Chrome / Lecture', date: 1_600_000_000_000 },
      { url: 'https://b.fr/', title: 'B', dossier: 'Importés de Chrome' },
      { url: 'https://a.fr/', title: 'A bis' },
      { url: 'https://c.fr/', title: 'C', date: 0 }
    ])
    expect(r).toEqual({ ajoutes: 3, presents: 1 })
    expect(ecritures).toBe(1)
    const l = new Bookmarks(chemin).lister()
    expect(l[0]).toEqual({ url: 'https://a.fr/', title: 'A', dossier: 'Importés de Chrome / Lecture', date: 1_600_000_000_000 })
    expect(l[1].dossier).toBe('Importés de Chrome')
    expect(l[2].dossier).toBeUndefined()
    expect(l[2].date).toBeGreaterThan(1_600_000_000_000) // 0 → maintenant
  })

  it('déjà présent (même hors dossier) : compté, aucune écriture si rien à ajouter', () => {
    const b = new Bookmarks(chemin)
    b.ajouter({ url: 'https://a.fr/', title: 'A' })
    let ecritures = 0
    b.onChange(() => ecritures++)
    expect(b.ajouterLot([{ url: 'https://a.fr/', title: 'A', dossier: 'X' }])).toEqual({ ajoutes: 0, presents: 1 })
    expect(ecritures).toBe(0)
    expect(b.lister()[0].dossier).toBeUndefined()
  })
})
