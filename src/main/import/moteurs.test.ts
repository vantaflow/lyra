import { describe, expect, it } from 'vitest'
import { arbitrerMoteurs, idLyraDuMoteur } from './moteurs'
import type { Moteur } from './types'

const perso = (nom: string, motCle: string, url = `https://${nom.toLowerCase().replace(/\W/g, '')}.example/?q=%s`): Moteur => ({ nom, motCle, url, perso: true })
const base = { source: 'firefox' as const, existants: [] as Array<{ id: string; nom: string; motCle: string; url: string }> }

describe('idLyraDuMoteur', () => {
  it.each([
    ['google', 'google'],
    ['google@search.mozilla.org', 'google'],
    ['ddg', 'duckduckgo'],
    ['ddg@search.mozilla.org', 'duckduckgo'],
    ['wikipedia-fr', 'wikipedia'],
    ['google-b-d', 'google'],
    ['qwant', 'qwant'],
    ['brave', 'brave'],
    ['startpage', 'startpage'],
    ['kagi', 'kagi'],
    ['youtube', 'youtube'],
    ['bing', null],
    ['ecosia', null],
    ['yahoo', null],
    ['truc-inconnu', null]
  ])('%s -> %s', (cle, attendu) => expect(idLyraDuMoteur(cle)).toBe(attendu))

  it('reconnaît par adresse', () => {
    expect(idLyraDuMoteur('https://www.google.fr/search?q=%s')).toBe('google')
    expect(idLyraDuMoteur('https://fr.wikipedia.org/wiki/Special:Search?search=%s')).toBe('wikipedia')
    expect(idLyraDuMoteur('https://search.brave.com/search?q=%s')).toBe('brave')
    expect(idLyraDuMoteur('https://www.bing.com/search?q=%s')).toBeNull()
  })
})

describe('arbitrerMoteurs : mots-clés', () => {
  it('un mot-clé importé en conflit avec Lyra reçoit le suffixe du navigateur et le dit', () => {
    const r = arbitrerMoteurs({ ...base, moteurs: [perso('Wikipédia (fr)', 'w')] })
    expect(r.aAjouter.map((m) => m.motCle)).toEqual(['w-ff'])
    expect(r.notes.join(' ')).toMatch(/`w`.*Wikipédia.*`w-ff`/)
  })

  it('suffixe = nom du navigateur hors Firefox', () => {
    const r = arbitrerMoteurs({ ...base, source: 'chrome', moteurs: [perso('Mon moteur', 'g')] })
    expect(r.aAjouter[0].motCle).toBe('g-chrome')
  })

  it('suffixe déjà pris : chiffre', () => {
    const r = arbitrerMoteurs({ ...base, moteurs: [perso('A', 'w'), perso('B', 'w')] })
    expect(r.aAjouter.map((m) => m.motCle)).toEqual(['w-ff', 'w-ff2'])
  })

  it('conflit entre deux importés : le second est renommé, le premier garde le sien', () => {
    const r = arbitrerMoteurs({ ...base, moteurs: [perso('Doc', 'x'), perso('Autre', 'X')] })
    expect(r.aAjouter.map((m) => m.motCle)).toEqual(['x', 'x-ff'])
  })

  it('réservés : d k g b s q w yt, insensible à la casse et aux accents', () => {
    for (const k of ['d', 'k', 'g', 'b', 's', 'q', 'w', 'yt', 'YT', 'W']) {
      const r = arbitrerMoteurs({ ...base, moteurs: [perso('Test', k)] })
      expect(r.aAjouter[0].motCle).not.toBe(k)
      expect(r.aAjouter[0].motCle.toLowerCase().endsWith('-ff')).toBe(true)
    }
  })

  it('ne touche jamais un mot-clé d’un moteur perso déjà dans Lyra', () => {
    const r = arbitrerMoteurs({ ...base, existants: [{ id: 'p1', nom: 'Le mien', motCle: 'zz', url: 'https://mien.example/?q=%s' }], moteurs: [perso('Autre', 'zz')] })
    expect(r.aAjouter[0].motCle).toBe('zz-ff')
  })

  it('vide ou plus de 24 caractères : dérivé du nom', () => {
    const r = arbitrerMoteurs({ ...base, moteurs: [perso('Wikipedia (fr)', ''), perso('Très Long Moteur', 'a'.repeat(30))] })
    expect(r.aAjouter.map((m) => m.motCle)).toEqual(['wikipediafr', 'treslongmoteur'])
    expect(r.notes.length).toBe(2)
  })

  it('mot-clé avec espace : dérivé du nom', () => {
    const r = arbitrerMoteurs({ ...base, moteurs: [perso('Mon Site', 'mon site')] })
    expect(r.aAjouter[0].motCle).toBe('monsite')
  })

  it('jamais plus de 24 caractères, même avec suffixe', () => {
    const r = arbitrerMoteurs({ ...base, moteurs: [perso('A', 'a'.repeat(24)), perso('B', 'a'.repeat(24))] })
    for (const m of r.aAjouter) expect(m.motCle.length).toBeLessThanOrEqual(24)
    expect(new Set(r.aAjouter.map((m) => m.motCle)).size).toBe(2)
  })
})

describe('arbitrerMoteurs : moteurs', () => {
  it('moteur perso déjà présent (même adresse) : présent, pas recréé', () => {
    const r = arbitrerMoteurs({ ...base, existants: [{ id: 'p1', nom: 'X', motCle: 'x', url: 'https://www.exemple.fr/s?q=%s' }], moteurs: [perso('X', 'x', 'https://exemple.fr/s?q=%s')] })
    expect(r.aAjouter).toEqual([])
    expect(r.presents).toBe(1)
  })

  it('intégré connu : présent ; Bing et autres : ignorés et dits', () => {
    const r = arbitrerMoteurs({
      ...base,
      moteurs: [
        { nom: 'Google', motCle: 'google.com', url: 'https://www.google.com/search?q=%s', perso: false },
        { nom: 'Bing', motCle: 'bing.com', url: 'https://www.bing.com/search?q=%s', perso: false },
        { nom: 'Yahoo', motCle: 'yahoo.com', url: 'https://search.yahoo.com/search?p=%s', perso: false }
      ]
    })
    expect(r.presents).toBe(1)
    expect(r.ignores).toBe(2)
    expect(r.notes.join(' ')).toMatch(/Bing.*Yahoo/)
    expect(r.aAjouter).toEqual([])
  })

  it('adresse non https ou sans %s (ou avec %s dans l’hôte) : ignorée', () => {
    const r = arbitrerMoteurs({ ...base, moteurs: [perso('A', 'a1', 'http://a.example/?q=%s'), perso('B', 'b1', 'ftp://b.example/%s'), perso('C', 'c1', 'https://c.example/')] })
    // Mêmes règles que le validateur des réglages : un moteur qu'il refuserait est « ignoré », jamais « ajouté ».
    expect(r.aAjouter).toEqual([])
    expect(r.ignores).toBe(3)
  })

  it('moteur par défaut : Chromium (parDefaut) et Firefox (intégré)', () => {
    const c = arbitrerMoteurs({ ...base, source: 'chrome', moteurs: [{ nom: 'Google', motCle: 'google.com', url: 'https://www.google.com/search?q=%s', parDefaut: true, perso: false }] })
    expect(c.parDefaut).toEqual({ id: 'google', nom: 'Google' })
    const f = arbitrerMoteurs({ ...base, moteurs: [], defautFirefox: { id: 'ddg@search.mozilla.org', integre: true } })
    expect(f.parDefaut).toEqual({ id: 'duckduckgo', nom: 'ddg@search.mozilla.org' })
    const b = arbitrerMoteurs({ ...base, moteurs: [], defautFirefox: { id: 'bing', integre: true } })
    expect(b.parDefaut).toBeUndefined()
    expect(b.defautAbsent).toBe('bing')
  })

  it('moteur par défaut perso importé : son id après arbitrage', () => {
    const r = arbitrerMoteurs({ ...base, moteurs: [{ ...perso('Wikipédia (fr)', 'w'), parDefaut: true }] })
    expect(r.parDefaut?.id).toBe(r.aAjouter[0].id)
  })
})
