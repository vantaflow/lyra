import { describe, it, expect } from 'vitest'
import { validerPatch, validerSettings } from './validate'
import { reglagesParDefaut } from './defaults'

const defauts = reglagesParDefaut('/dl')

describe('validerPatch : règle par site des extensions', () => {
  const id = 'a'.repeat(32)
  it('garde les booléens des identifiants valides, ignore le reste', () => {
    expect(validerPatch({ sites: { 'https://yt.com': { extensions: { [id]: false, ['b'.repeat(32)]: true, nimporte: false, [`c`.repeat(32)]: 'non' } } } })).toEqual({
      sites: { 'https://yt.com': { extensions: { [id]: false, ['b'.repeat(32)]: true } } }
    })
  })
})

describe('validerPatch', () => {
  it('garde les valeurs valides', () => {
    expect(validerPatch({ theme: 'sombre', ciel: { position: 'haut', largeur: 300 } })).toEqual({
      theme: 'sombre',
      ciel: { position: 'haut', largeur: 300 }
    })
  })

  it('validerSettings : une ancienne largeur hors bornes ou décimale est arrondie et bornée', () => {
    const d = defauts
    expect(validerSettings({ ciel: { largeur: 500 } }, d).ciel.largeur).toBe(420)
    expect(validerSettings({ ciel: { largeur: 100 } }, d).ciel.largeur).toBe(200)
    expect(validerSettings({ ciel: { largeur: 250.5 } }, d).ciel.largeur).toBe(251)
    expect(validerSettings({ ciel: { largeur: 'x' } }, d).ciel.largeur).toBe(d.ciel.largeur)
  })

  it('largeur du ciel : 200 à 420 ; deplacerParGlisser booléen', () => {
    expect(validerPatch({ ciel: { largeur: 200 } })).toEqual({ ciel: { largeur: 200 } })
    expect(validerPatch({ ciel: { largeur: 420 } })).toEqual({ ciel: { largeur: 420 } })
    expect(validerPatch({ ciel: { largeur: 199 } })).toEqual({})
    expect(validerPatch({ ciel: { largeur: 421 } })).toEqual({})
    expect(validerPatch({ ciel: { largeur: 250.5 } })).toEqual({})
    expect(validerPatch({ ciel: { deplacerParGlisser: false } })).toEqual({ ciel: { deplacerParGlisser: false } })
    expect(validerPatch({ ciel: { deplacerParGlisser: 'oui' } })).toEqual({})
  })
  it('accepte ciel.masque et ciel.revelerAuSurvol booléens, rejette le reste', () => {
    expect(validerPatch({ ciel: { masque: true, revelerAuSurvol: false } })).toEqual({ ciel: { masque: true, revelerAuSurvol: false } })
    expect(validerPatch({ ciel: { revelerAuSurvol: 'non' } })).toEqual({})
    expect(validerPatch({ ciel: { revelerAuSurvol: 0 } })).toEqual({})
  })

  it('rejette types et énumérations invalides', () => {
    expect(validerPatch({ theme: 42 })).toEqual({})
    expect(validerPatch({ theme: 'rose' })).toEqual({})
    expect(validerPatch({ ciel: { position: 'diagonale', masque: 'oui' } })).toEqual({})
    expect(validerPatch({ boucliers: { niveau: 'agressif', genes: 1 } })).toEqual({})
    expect(validerPatch({ moteurChoisi: 'true' })).toEqual({})
  })

  it('borne les nombres', () => {
    expect(validerPatch({ ciel: { largeur: 1e9 } })).toEqual({})
    expect(validerPatch({ ciel: { largeur: -5 } })).toEqual({})
    expect(validerPatch({ ciel: { largeur: NaN } })).toEqual({})
    expect(validerPatch({ boucliers: { majHeures: 0 } })).toEqual({})
  })

  it('ignore version et clés inconnues', () => {
    expect(validerPatch({ version: 2, inconnue: 1, ciel: { autre: 1 } })).toEqual({})
  })

  it('ignore __proto__, constructor, prototype', () => {
    const brut = JSON.parse('{"__proto__":{"polluee":true},"constructor":{"x":1},"prototype":{"y":1},"theme":"clair"}')
    expect(validerPatch(brut)).toEqual({ theme: 'clair' })
    expect(({} as Record<string, unknown>).polluee).toBeUndefined()
  })

  it('valide les règles de site', () => {
    expect(
      validerPatch({
        sites: {
          'https://www.youtube.com': { boucliers: false },
          'file://': { boucliers: false },
          'http://[::1]:8080': { boucliers: true },
          'javascript:alert(1)': { boucliers: false },
          'https://a.fr/chemin': { boucliers: false },
          'https://b.fr': { boucliers: 'non' },
          'https://c.fr': 'x'
        }
      })
    ).toEqual({
      sites: {
        'https://www.youtube.com': { boucliers: false },
        'file://': { boucliers: false },
        'http://[::1]:8080': { boucliers: true }
      }
    })
    expect(validerPatch({ sites: JSON.parse('{"__proto__":{"boucliers":false}}') })).toEqual({})
    expect(validerPatch({ sites: [] })).toEqual({})
  })

  it('valide permissions et zoom par site', () => {
    expect(
      validerPatch({
        sites: {
          'https://a.fr': { permissions: { camera: 'autoriser', micro: 'peut-etre', inconnue: 'autoriser' }, zoom: 1.25 },
          'https://b.fr': { zoom: 9 },
          'https://c.fr': { permissions: { notifications: 'refuser' } }
        }
      })
    ).toEqual({
      sites: {
        'https://a.fr': { permissions: { camera: 'autoriser' }, zoom: 1.25 },
        'https://c.fr': { permissions: { notifications: 'refuser' } }
      }
    })
  })

  it('exception Ne pas déranger par site : booléen seulement, absent par défaut', () => {
    expect(
      validerPatch({
        sites: {
          'https://a.fr': { exceptionDnd: true },
          'https://b.fr': { exceptionDnd: 'oui', zoom: 2 },
          'https://c.fr': { exceptionDnd: false }
        }
      })
    ).toEqual({ sites: { 'https://a.fr': { exceptionDnd: true }, 'https://b.fr': { zoom: 2 }, 'https://c.fr': { exceptionDnd: false } } })
  })

  it('entrée non objet : patch vide', () => {
    expect(validerPatch(null)).toEqual({})
    expect(validerPatch('x')).toEqual({})
    expect(validerPatch([1])).toEqual({})
  })
})

describe('validerSettings', () => {
  it('JSON de mauvaise forme : défauts', () => {
    expect(validerSettings('x', defauts)).toEqual(defauts)
    expect(validerSettings({ theme: 42, version: 9, zzz: 1 }, defauts)).toEqual(defauts)
  })

  it('fusionne les champs valides sur les défauts', () => {
    const s = validerSettings({ theme: 'clair', ciel: { largeur: 300 } }, defauts)
    expect(s.theme).toBe('clair')
    expect(s.ciel).toEqual({ ...defauts.ciel, largeur: 300 })
  })
})

describe('reseau', () => {
  it('défauts', () => {
    expect(defauts.reseau).toEqual({ passerelles: true, auto: true, sites: [] })
  })
  it('garde les valeurs valides', () => {
    const reseau = {
      passerelles: false,
      auto: false,
      sites: [{ hote: 'reddit.com', origine: 'manuel', date: 1 }, { hote: 'x.fr', origine: 'auto', date: 2 }],
      personnelle: { type: 'socks5', hote: '127.0.0.1', port: 40000 }
    }
    expect(validerPatch({ reseau })).toEqual({ reseau })
    expect(validerPatch({ reseau: { personnelle: { type: 'http', hote: 'proxy.exemple.fr', port: 8080 } } })).toEqual({ reseau: { personnelle: { type: 'http', hote: 'proxy.exemple.fr', port: 8080 } } })
    expect(validerPatch({ reseau: { personnelle: { type: 'http', hote: '192.168.1.2', port: 3128 } } }).reseau?.personnelle?.hote).toBe('192.168.1.2')
    expect(validerPatch({ reseau: { sites: [] } })).toEqual({ reseau: { sites: [] } })
  })
  it('rejette les types invalides', () => {
    expect(validerPatch({ reseau: { passerelles: 'oui', auto: 1 } })).toEqual({})
    expect(validerPatch({ reseau: 'x' })).toEqual({})
    expect(validerPatch({ reseau: { sites: 'reddit.com' } })).toEqual({})
  })
  it('sites tous invalides (entrée non vide) : ignorés, la liste existante n’est pas effacée', () => {
    expect(validerPatch({ reseau: { sites: [{ hote: 'pas un hôte', origine: 'manuel', date: 1 }, null] } })).toEqual({})
    expect(validerPatch({ reseau: { auto: false, sites: ['x'] } })).toEqual({ reseau: { auto: false } })
  })
  it('filtre les sites : hôte sans schéma, origine, date, doublons, max 500', () => {
    const sites = [
      { hote: 'ok.fr', origine: 'manuel', date: 1 },
      { hote: 'https://schema.fr', origine: 'manuel', date: 1 },
      { hote: 'a.fr/chemin', origine: 'manuel', date: 1 },
      { hote: '1.2.3.4', origine: 'manuel', date: 1 },
      { hote: 'mauvaise-origine.fr', origine: 'robot', date: 1 },
      { hote: 'sans-date.fr', origine: 'auto' },
      { hote: 'date-nan.fr', origine: 'auto', date: NaN },
      { hote: 'OK.fr', origine: 'auto', date: 3 },
      { hote: 'extra.fr', origine: 'auto', date: 4, evil: 1 },
      'texte',
      null
    ]
    expect(validerPatch({ reseau: { sites } })).toEqual({
      reseau: { sites: [{ hote: 'ok.fr', origine: 'manuel', date: 1 }, { hote: 'extra.fr', origine: 'auto', date: 4 }] }
    })
    const beaucoup = Array.from({ length: 800 }, (_, i) => ({ hote: `s${i}.fr`, origine: 'auto', date: i }))
    expect(validerPatch({ reseau: { sites: beaucoup } }).reseau?.sites).toHaveLength(500)
  })
  it('passerelle personnelle invalide ignorée', () => {
    for (const personnelle of [
      { type: 'socks4', hote: 'a.fr', port: 1 },
      { type: 'socks5', hote: 'a.fr', port: 0 },
      { type: 'socks5', hote: 'a.fr', port: 65536 },
      { type: 'socks5', hote: 'a.fr', port: 1.5 },
      { type: 'socks5', hote: 'http://a.fr', port: 1 },
      { type: 'socks5', hote: 'a.fr:80', port: 1 },
      { type: 'socks5', hote: '', port: 1 },
      { type: 'socks5', hote: '999.1.1.1', port: 1 },
      { type: 'socks5', port: 1 },
      'x'
    ])
      expect(validerPatch({ reseau: { personnelle } })).toEqual({})
  })
  it('ignore __proto__ dans reseau', () => {
    const brut = JSON.parse('{"reseau":{"__proto__":{"polluee":true},"personnelle":{"__proto__":{"x":1},"type":"http","hote":"a.fr","port":80,"extra":1},"auto":false}}')
    expect(validerPatch(brut)).toEqual({ reseau: { auto: false, personnelle: { type: 'http', hote: 'a.fr', port: 80 } } })
    expect(({} as Record<string, unknown>).polluee).toBeUndefined()
  })
  it('validerSettings complète avec les défauts', () => {
    expect(validerSettings({ reseau: { auto: false } }, defauts).reseau).toEqual({ passerelles: true, auto: false, sites: [] })
  })
})

describe('moteursPerso', () => {
  const ok = { id: 'perso-1', nom: 'Mon wiki', motCle: 'mw', url: 'https://wiki.exemple.fr/?q=%s' }

  it('défaut [] ; ancien fichier sans les clés valide avec les défauts', () => {
    expect(defauts.moteursPerso).toEqual([])
    const s = validerSettings({ version: 1, theme: 'sombre', inconnue: 42 }, defauts)
    expect(s.theme).toBe('sombre')
    expect(s.moteursPerso).toEqual([])
    expect(s.import).toEqual({ extensionsEnAttente: [], reglagesEnAttente: {} })
  })

  it('garde les entrées valides, ignore les autres et les doublons d\'id', () => {
    const p = validerPatch({
      moteursPerso: [
        ok,
        { ...ok, nom: 'doublon' },
        { ...ok, id: 'x2', url: 'https://sans-requete.fr/' },
        { ...ok, id: 'x3', url: 'javascript:%s' },
        { ...ok, id: 'x4', motCle: 'x'.repeat(25) },
        { ...ok, id: 'x5', motCle: 'a b' },
        { ...ok, id: 'x6', nom: '' },
        'oups'
      ]
    })
    expect(p.moteursPerso).toEqual([ok])
  })

  it('[] explicite accepté ; liste entièrement invalide ignorée', () => {
    expect(validerPatch({ moteursPerso: [] })).toEqual({ moteursPerso: [] })
    expect(validerPatch({ moteursPerso: ['x'] })).toEqual({})
    expect(validerPatch({ moteursPerso: 'x' })).toEqual({})
  })
})

describe('import', () => {
  const ext = { id: 'a'.repeat(32), nom: 'Bloqueur', magasin: 'chrome', actif: true, source: 'chrome', date: 1000 }

  it('extensionsEnAttente : forme exacte, imposee gardée, invalides ignorées', () => {
    const p = validerPatch({
      import: {
        extensionsEnAttente: [
          ext,
          { ...ext, id: 'b', magasin: 'firefox', source: 'firefox', imposee: true },
          { ...ext, id: 'c', magasin: 'opera' },
          { ...ext, id: 'd', source: 'netscape' },
          { ...ext, id: 'e', actif: 'oui' },
          { ...ext, id: 'f', date: 'hier' },
          { ...ext, id: '', nom: 'x' }
        ]
      }
    })
    expect(p.import?.extensionsEnAttente).toEqual([ext, { ...ext, id: 'b', magasin: 'firefox', source: 'firefox', imposee: true }])
  })

  it('dédoublonnée sur id + magasin (même id, autre magasin : gardé)', () => {
    const p = validerPatch({
      import: { extensionsEnAttente: [ext, { ...ext, nom: 'copie' }, { ...ext, magasin: 'edge' }] }
    })
    expect(p.import?.extensionsEnAttente).toEqual([ext, { ...ext, magasin: 'edge' }])
  })

  it('200 entrées au plus, les plus récentes (fin de liste) gardées', () => {
    const liste = Array.from({ length: 250 }, (_, i) => ({ ...ext, id: `e${i}` }))
    const r = validerPatch({ import: { extensionsEnAttente: liste } }).import?.extensionsEnAttente
    expect(r).toHaveLength(200)
    expect(r?.[0]?.id).toBe('e50')
    expect(r?.at(-1)?.id).toBe('e249')
  })

  it('reglagesEnAttente.pageAccueil : texte borné, rien d\'autre', () => {
    expect(validerPatch({ import: { reglagesEnAttente: { pageAccueil: 'https://a.fr/', autre: 1 } } })).toEqual({
      import: { reglagesEnAttente: { pageAccueil: 'https://a.fr/' } }
    })
    expect(validerPatch({ import: { reglagesEnAttente: { pageAccueil: 'x'.repeat(3000) } } })).toEqual({})
  })

  it('clés inconnues sous import ignorées', () => {
    expect(validerPatch({ import: { zzz: 1 } })).toEqual({})
  })
})
