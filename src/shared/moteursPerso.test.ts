import { describe, expect, it } from 'vitest'
import { adresseMoteurValide, creerMoteurPerso, motCleMoteurValide, type MoteurExistant } from './moteursPerso'

const integres: MoteurExistant[] = [
  { id: 'duckduckgo', nom: 'DuckDuckGo', motCle: 'd' },
  { id: 'wikipedia', nom: 'Wikipédia', motCle: 'w' },
  { id: 'youtube', nom: 'YouTube', motCle: 'yt' }
]
const saisie = { nom: 'Mon wiki', motCle: 'mw', url: 'https://wiki.exemple.fr/?q=%s' }

describe('creerMoteurPerso', () => {
  it('accepte un moteur valable et lui donne un identifiant stable', () => {
    const r = creerMoteurPerso(saisie, integres)
    expect(r).toEqual({ ok: true, moteur: { id: 'perso-mon-wiki', nom: 'Mon wiki', motCle: 'mw', url: 'https://wiki.exemple.fr/?q=%s' } })
  })
  it('rogne les espaces et met le mot-clé en minuscules', () => {
    const r = creerMoteurPerso({ nom: '  Mon wiki ', motCle: ' MW ', url: ' https://wiki.exemple.fr/?q=%s ' }, integres)
    expect(r).toMatchObject({ ok: true, moteur: { nom: 'Mon wiki', motCle: 'mw', url: 'https://wiki.exemple.fr/?q=%s' } })
  })
  it('refuse un nom vide', () => {
    expect(creerMoteurPerso({ ...saisie, nom: '  ' }, integres)).toMatchObject({ ok: false, champ: 'nom' })
  })
  it('refuse un nom déjà pris (casse et accents ignorés)', () => {
    expect(creerMoteurPerso({ ...saisie, nom: 'wikipedia' }, integres)).toMatchObject({ ok: false, champ: 'nom' })
  })
  it('refuse un mot-clé vide, avec espace, trop long ou commençant par > ? #', () => {
    for (const motCle of ['', 'a b', 'x'.repeat(25), '>x', '?x', '#x'])
      expect(creerMoteurPerso({ ...saisie, motCle }, integres), motCle).toMatchObject({ ok: false, champ: 'motCle' })
  })
  it('refuse un mot-clé déjà pris par un intégré ou un autre moteur (casse ignorée)', () => {
    expect(creerMoteurPerso({ ...saisie, motCle: 'W' }, integres)).toMatchObject({ ok: false, champ: 'motCle' })
    expect(creerMoteurPerso({ ...saisie, motCle: 'yt' }, integres)).toMatchObject({ ok: false, champ: 'motCle' })
    const deja = [...integres, { id: 'perso-mon-wiki', nom: 'Mon wiki', motCle: 'mw' }]
    expect(creerMoteurPerso({ ...saisie, nom: 'Autre' }, deja)).toMatchObject({ ok: false, champ: 'motCle' })
  })
  it('exige une adresse https avec exactement un %s', () => {
    for (const url of ['', 'http://x.fr/?q=%s', 'https://x.fr/?q=', 'https://x.fr/?q=%s&r=%s', 'ftp://x.fr/%s', 'javascript:%s', 'https://x.fr/ ?q=%s', 'https://%s'])
      expect(creerMoteurPerso({ ...saisie, url }, integres), url).toMatchObject({ ok: false, champ: 'url' })
  })
  it('donne un identifiant unique quand le nom produit le même', () => {
    const r = creerMoteurPerso({ ...saisie, nom: 'Mon  wiki!' , motCle: 'm2' }, [...integres, { id: 'perso-mon-wiki', nom: 'Autre', motCle: 'mw' }])
    expect(r).toMatchObject({ ok: true, moteur: { id: 'perso-mon-wiki-2' } })
  })
})

describe('adresseMoteurValide', () => {
  it('accepte https avec un seul %s après l\'hôte (chemin, requête ou fragment)', () => {
    for (const u of ['https://exemple.fr/?q=%s', 'https://exemple.fr:8443/s/%s', 'https://exemple.fr/#%s', 'HTTPS://exemple.fr/?q=%s'])
      expect(adresseMoteurValide(u), u).toBe(true)
  })
  it('refuse http, plusieurs %s, %s dans l\'hôte ou les identifiants, adresse sans %s', () => {
    for (const u of ['http://exemple.fr/?q=%s', 'https://exemple.fr/?q=%s&r=%s', 'https://%s.exemple.fr/', 'https://exemple.fr%s', 'https://u:p@exemple.fr/?q=%s', 'https://exemple.fr/', 'javascript:%s', 'ftp://exemple.fr/%s'])
      expect(adresseMoteurValide(u), u).toBe(false)
  })
})

describe('motCleMoteurValide', () => {
  it('sans espace, 24 au plus, sans préfixe de palette', () => {
    expect(motCleMoteurValide('mw')).toBe(true)
    for (const m of ['', 'a b', 'x'.repeat(25), '>x', '?x', '#x']) expect(motCleMoteurValide(m), m).toBe(false)
  })
})
