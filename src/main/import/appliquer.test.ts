import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PALETTE_CONSTELLATIONS } from '../../shared/couleurs'
import type { ExtensionEnAttente, MoteurPerso, Settings } from '../../shared/types'
import { appliquer, couleurConstellation, type CiblesImport, type CibleCiel, type EntreeImport } from './appliquer'
import { COULEURS_GROUPE, ELEMENTS_IMPORT, indisponible, type DonneesImportees, type FavorisImportes, type OptionsApplication, type Visite } from './types'

// ---------------------------------------------------------------------------------------------------------------------
// Faux magasins

type Reglages = Pick<Settings, 'langue' | 'moteurParDefaut' | 'moteurChoisi' | 'sites' | 'moteursPerso' | 'import' | 'telechargements'>

const fusion = (a: any, b: any): any => {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b
  const s = { ...a }
  for (const [k, v] of Object.entries(b)) s[k] = fusion(a?.[k], v)
  return s
}

interface Faux {
  cibles: CiblesImport
  favoris: Array<{ url: string; title: string; dossier?: string; date?: number }>
  ecrituresFavoris: number
  historique: Map<string, { title: string; dates: number[] }>
  lotsHistorique: number
  compactee: number
  attendu: number
  constellations: Array<{ id: string; name: string; color: string }>
  etoiles: Array<{ url: string; constellationId?: string; titre?: string; epingle?: boolean; fenetre: number }>
  reveillees: string[]
  sauvegardes: number
  reglages: Reglages
  setCalls: Array<Record<string, unknown>>
  fenetresCreees: number
}

function faux(init: Partial<Reglages> = {}): Faux {
  const f: Faux = {
    favoris: [],
    ecrituresFavoris: 0,
    historique: new Map(),
    lotsHistorique: 0,
    compactee: 0,
    attendu: 0,
    constellations: [],
    etoiles: [],
    reveillees: [],
    sauvegardes: 0,
    setCalls: [],
    fenetresCreees: 0,
    reglages: {
      langue: 'fr',
      moteurParDefaut: 'duckduckgo',
      moteurChoisi: false,
      sites: {},
      moteursPerso: [],
      import: { extensionsEnAttente: [], reglagesEnAttente: {} },
      telechargements: { dossier: '/dl', demander: false },
      ...init
    },
    cibles: undefined as never
  }
  let n = 0
  const ciel = (fenetre: number): CibleCiel => ({
    constellations: () => f.constellations,
    creerConstellation: (o) => {
      const c = { id: `c${++n}`, ...o }
      f.constellations.push(c)
      return c
    },
    ouvrirEndormie: (url, o) => {
      f.etoiles.push({ url, ...o, fenetre })
      return `e${f.etoiles.length}`
    },
    reveiller: (id) => void f.reveillees.push(id),
    sauver: () => void f.sauvegardes++
  })
  f.cibles = {
    favoris: {
      ajouterLot: (items) => {
        const vus = new Set(f.favoris.map((x) => x.url))
        let ajoutes = 0
        let presents = 0
        const nouveaux = []
        for (const i of items) {
          if (vus.has(i.url)) presents++
          else {
            vus.add(i.url)
            nouveaux.push(i)
            ajoutes++
          }
        }
        if (nouveaux.length) {
          f.favoris.push(...nouveaux)
          f.ecrituresFavoris++
        }
        return { ajoutes, presents }
      }
    },
    historique: {
      importer: (lot) => {
        f.lotsHistorique++
        let ajoutees = 0
        let presentes = 0
        for (const v of lot) {
          const e = f.historique.get(v.url) ?? { title: v.title, dates: [] }
          if (e.dates.includes(v.date)) presentes++
          else {
            e.dates.push(v.date)
            ajoutees++
          }
          f.historique.set(v.url, e)
        }
        return { ajoutees, presentes }
      },
      attendre: async () => void f.attendu++,
      compacterSiNecessaire: () => {
        f.compactee++
        return false
      }
    },
    ciel: ciel(0),
    nouvelleFenetre: () => ciel(++f.fenetresCreees),
    reglages: {
      get: () => f.reglages,
      set: (patch) => {
        f.setCalls.push(patch as Record<string, unknown>)
        f.reglages = fusion(f.reglages, patch)
      }
    }
  }
  return f
}

const OPTIONS: OptionsApplication = { fenetre: 'courante', ouvrirMaintenant: false, moteurParDefaut: false, extensionsChoisies: [] }
const lien = (titre: string, url: string, date = 0) => ({ type: 'lien' as const, titre, url, date })
const entree = (donnees: DonneesImportees | EntreeImport['donnees'], source: EntreeImport['source'] = 'chrome', extra: Partial<EntreeImport> = {}): EntreeImport => ({ source, profil: 'Khalil', donnees, ...extra })
const visite = (url: string, date: number, titre = 't'): Visite => ({ url, titre, date, visites: 1 })

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

// ---------------------------------------------------------------------------------------------------------------------

describe('favoris', () => {
  const favoris: FavorisImportes = {
    barre: [lien('Lyra', 'https://lyra.example/l', 1000), { type: 'dossier', titre: 'Lecture', date: 0, enfants: [lien('Astro', 'https://astro.example/a'), { type: 'dossier', titre: 'Étoiles', date: 0, enfants: [lien('Véga', 'https://vega.example/v')] }] }],
    autres: [lien('Dev', 'https://dev.example/x'), { type: 'dossier', titre: 'Favoris mobiles', date: 0, enfants: [lien('', 'https://m.example/m')] }]
  }

  it('dossier « Importés de Chrome », sous-dossiers en chemin, date conservée, une seule écriture', async () => {
    const f = faux()
    const r = await appliquer(entree({ favoris }), f.cibles, OPTIONS)
    expect(r.favoris).toMatchObject({ etat: 'ok', ajoutes: 5, presents: 0, ignores: 0 })
    expect(f.ecrituresFavoris).toBe(1)
    const parUrl = Object.fromEntries(f.favoris.map((x) => [x.url, x]))
    expect(parUrl['https://lyra.example/l']).toMatchObject({ dossier: 'Importés de Chrome', date: 1000 })
    expect(parUrl['https://astro.example/a'].dossier).toBe('Importés de Chrome / Lecture')
    expect(parUrl['https://vega.example/v'].dossier).toBe('Importés de Chrome / Lecture / Étoiles')
    expect(parUrl['https://dev.example/x'].dossier).toBe('Importés de Chrome')
    expect(parUrl['https://m.example/m']).toMatchObject({ dossier: 'Importés de Chrome / Favoris mobiles', title: 'https://m.example/m' })
  })

  it('double import : aucun doublon, compteurs exacts, un seul dossier racine', async () => {
    const f = faux()
    await appliquer(entree({ favoris }), f.cibles, OPTIONS)
    const r = await appliquer(entree({ favoris }), f.cibles, OPTIONS)
    expect(r.favoris).toMatchObject({ etat: 'ok', ajoutes: 0, presents: 5 })
    expect(f.favoris).toHaveLength(5)
    expect(new Set(f.favoris.map((x) => x.dossier?.split(' / ')[0]))).toEqual(new Set(['Importés de Chrome']))
  })

  it('un favori déjà présent ailleurs n’est pas recréé', async () => {
    const f = faux()
    f.favoris.push({ url: 'https://dev.example/x', title: 'à moi', dossier: 'Perso' })
    const r = await appliquer(entree({ favoris }), f.cibles, OPTIONS)
    expect(r.favoris).toMatchObject({ ajoutes: 4, presents: 1 })
  })

  it('Firefox puis Chrome : dossiers distincts mais l’URL déjà connue reste présente', async () => {
    const f = faux()
    await appliquer(entree({ favoris }, 'firefox'), f.cibles, OPTIONS)
    expect(f.favoris[0].dossier).toBe('Importés de Firefox')
    const r = await appliquer(entree({ favoris }, 'chrome'), f.cibles, OPTIONS)
    expect(r.favoris.presents).toBe(5)
  })

  it('schémas interdits refusés (javascript, data, lyra, file, about) ; ftp et https gardés', async () => {
    const f = faux()
    const r = await appliquer(
      entree({
        favoris: {
          barre: [lien('a', 'javascript:alert(1)'), lien('b', 'data:text/html,x'), lien('c', 'lyra://settings'), lien('d', 'file:///etc/passwd'), lien('e', 'about:blank'), lien('f', 'ftp://files.example/x'), lien('g', 'HTTPS://ok.example/ok')],
          autres: []
        }
      }),
      f.cibles,
      OPTIONS
    )
    expect(f.favoris.map((x) => x.url)).toEqual(['ftp://files.example/x', 'HTTPS://ok.example/ok'])
    expect(r.favoris).toMatchObject({ etat: 'partiel', ajoutes: 2, ignores: 5 })
  })

  it('normalisation minimale : fragment vide et / final d’un chemin vide ; jamais plus', async () => {
    const f = faux()
    await appliquer(entree({ favoris: { barre: [lien('a', 'https://a.fr/#'), lien('a2', 'https://a.fr'), lien('x', 'https://a.fr/x'), lien('x2', 'https://a.fr/x/')], autres: [] } }), f.cibles, OPTIONS)
    expect(f.favoris.map((x) => x.url)).toEqual(['https://a.fr', 'https://a.fr/x', 'https://a.fr/x/'])
  })

  it('un « / » dans un titre de dossier ne crée pas de niveau', async () => {
    const f = faux()
    await appliquer(entree({ favoris: { barre: [{ type: 'dossier', titre: 'A/B', date: 0, enfants: [lien('x', 'https://x.example/')] }], autres: [] } }), f.cibles, OPTIONS)
    expect(f.favoris[0].dossier?.split(' / ')).toHaveLength(2)
  })
})

describe('historique', () => {
  const lots = (n: number, pas: number): Visite[][] => {
    const tout = Array.from({ length: n }, (_, i) => visite(`https://p${i % 7}.example/${i}`, 1_000_000 + i * 1000))
    const res: Visite[][] = []
    for (let i = 0; i < tout.length; i += pas) res.push(tout.slice(i, i + pas))
    return res
  }
  async function* flux(l: Visite[][]): AsyncGenerator<Visite[]> {
    for (const x of l) yield x
  }

  it('un importer par lot, attendre puis compacter ; titre transmis sous `title`', async () => {
    const f = faux()
    const r = await appliquer(entree({ historique: flux(lots(10, 4)) }), f.cibles, OPTIONS)
    expect(r.historique).toMatchObject({ etat: 'ok', ajoutes: 10, presents: 0 })
    expect(f.lotsHistorique).toBe(3)
    expect(f.attendu).toBe(1)
    expect(f.compactee).toBe(1)
    expect([...f.historique.values()][0].title).toBe('t')
  })

  it('lots dans un ordre quelconque : même index final', async () => {
    const l = lots(12, 3)
    const a = faux()
    await appliquer(entree({ historique: flux(l) }), a.cibles, OPTIONS)
    const b = faux()
    await appliquer(entree({ historique: flux([...l].reverse().map((x) => [...x].reverse())) }), b.cibles, OPTIONS)
    const norm = (h: Faux['historique']) => [...h.entries()].map(([u, e]) => [u, [...e.dates].sort()]).sort()
    expect(norm(b.historique)).toEqual(norm(a.historique))
  })

  it('double import : visites présentes, pas dupliquées', async () => {
    const f = faux()
    await appliquer(entree({ historique: lots(10, 5).flat() }), f.cibles, OPTIONS)
    const r = await appliquer(entree({ historique: lots(10, 5).flat() }), f.cibles, OPTIONS)
    expect(r.historique).toMatchObject({ ajoutes: 0, presents: 10 })
    expect([...f.historique.values()].reduce((s, e) => s + e.dates.length, 0)).toBe(10)
  })

  it('tableau : découpé par lots de 2000', async () => {
    const f = faux()
    await appliquer(entree({ historique: Array.from({ length: 4500 }, (_, i) => visite(`https://x.example/${i}`, 1000 + i)) }), f.cibles, OPTIONS)
    expect(f.lotsHistorique).toBe(3)
  })

  it('visites écartées par Lyra (schéma non retenu) comptées en ignorées', async () => {
    const f = faux()
    f.cibles.historique.importer = () => ({ ajoutees: 1, presentes: 0 })
    const r = await appliquer(entree({ historique: [visite('https://a.example/', 1), visite('chrome://x', 2), visite('https://b.example/', 3)] }), f.cibles, OPTIONS)
    expect(r.historique).toMatchObject({ ajoutes: 1, presents: 0, ignores: 2, etat: 'partiel' })
  })

  it('abandon au 2e lot : favoris et onglets ok, historique annulé avec le 1er lot conservé', async () => {
    const f = faux()
    const ctrl = new AbortController()
    const l = lots(9, 3)
    async function* g(): AsyncGenerator<Visite[]> {
      yield l[0]
      ctrl.abort()
      yield l[1]
      yield l[2]
    }
    const r = await appliquer(
      entree({ favoris: { barre: [lien('a', 'https://a.example/')], autres: [] }, onglets: { fenetres: [{ onglets: [{ url: 'https://t.example/', titre: 'T' }], groupes: [] }] }, historique: g() }),
      f.cibles,
      OPTIONS,
      undefined,
      ctrl.signal
    )
    expect(r.favoris.etat).toBe('ok')
    expect(r.onglets.etat).toBe('ok')
    expect(r.historique.etat).toBe('annule')
    expect(r.historique.ajoutes).toBe(3)
    expect(f.lotsHistorique).toBe(1)
    expect(f.attendu).toBe(1)
    expect(r.moteurs.etat).toBe('ignore')
  })

  it('abandon avant le début : tout annulé, rien d’écrit', async () => {
    const f = faux()
    const ctrl = new AbortController()
    ctrl.abort()
    const r = await appliquer(entree({ favoris: { barre: [lien('a', 'https://a.example/')], autres: [] }, historique: [visite('https://a.example/', 1)] }), f.cibles, OPTIONS, undefined, ctrl.signal)
    expect(r.favoris.etat).toBe('annule')
    expect(r.historique.etat).toBe('annule')
    expect(r.onglets.etat).toBe('ignore')
    expect(f.favoris).toHaveLength(0)
  })

  it('le flux échoue en route : partiel avec ce qui est écrit, raison et code', async () => {
    const f = faux()
    async function* g(): AsyncGenerator<Visite[]> {
      yield [visite('https://a.example/', 1)]
      throw Object.assign(new Error('x'), { raison: 'Base verrouillée', code: 'verrouille' })
    }
    const r = await appliquer(entree({ historique: g() }), f.cibles, OPTIONS)
    expect(r.historique).toMatchObject({ etat: 'partiel', ajoutes: 1, code: 'verrouille', raison: 'Base verrouillée' })
    expect(f.attendu).toBe(1)
  })

  it('progression émise par lot', async () => {
    const f = faux()
    const p: Array<{ element: string; fait: number; phase: string }> = []
    await appliquer(entree({ historique: flux(lots(10, 4)) }), f.cibles, OPTIONS, (x) => p.push(x))
    const h = p.filter((x) => x.element === 'historique')
    expect(h.at(-1)?.fait).toBe(10)
    expect(h.every((x) => x.phase === 'ecriture')).toBe(true)
  })
})

describe('onglets et groupes', () => {
  const donnees: DonneesImportees = {
    onglets: {
      fenetres: [
        {
          groupes: [{ id: 'g1', nom: 'Docs', couleur: 'bleu' }, { id: 'g2', nom: '', couleur: 'rouge' }],
          onglets: [
            { url: 'https://doc.example/1', titre: 'Doc 1', groupe: 'g1' },
            { url: 'https://doc.example/2', titre: 'Doc 2', groupe: 'g1', epingle: true },
            { url: 'https://libre.example/', titre: 'Libre' },
            { url: 'https://libre.example/', titre: 'Libre (doublon)' },
            { url: 'https://r.example/', titre: 'R', groupe: 'g2' },
            { url: 'javascript:1', titre: 'x' }
          ]
        },
        { groupes: [{ id: 'a', nom: 'Docs', couleur: 'bleu' }], onglets: [{ url: 'https://doc.example/3', titre: 'Doc 3', groupe: 'a' }] }
      ]
    }
  }

  it('constellation par groupe, couleur de la palette, étoiles endormies, épinglée, hors groupe libre', async () => {
    const f = faux()
    const r = await appliquer(entree(donnees), f.cibles, OPTIONS)
    expect(f.constellations.map((c) => c.name)).toEqual(['Docs', 'Groupe rouge'])
    expect(f.constellations[0].color).toBe('#5B8DEF')
    expect(PALETTE_CONSTELLATIONS).toContain(f.constellations[1].color)
    const docs = f.constellations[0].id
    expect(f.etoiles.find((e) => e.url === 'https://doc.example/1')).toMatchObject({ constellationId: docs, titre: 'Doc 1', epingle: false })
    expect(f.etoiles.find((e) => e.url === 'https://doc.example/2')?.epingle).toBe(true)
    expect(f.etoiles.find((e) => e.url === 'https://libre.example/')?.constellationId).toBeUndefined()
    expect(f.etoiles.filter((e) => e.url === 'https://libre.example/')).toHaveLength(1)
    expect(r.onglets).toMatchObject({ etat: 'partiel', ajoutes: 5, ignores: 2 })
    expect(f.reveillees).toEqual([])
    expect(f.sauvegardes).toBe(1)
  })

  it('même nom déjà existant : constellation réutilisée (y compris entre fenêtres importées)', async () => {
    const f = faux()
    f.constellations.push({ id: 'existante', name: 'docs', color: '#fff' })
    await appliquer(entree(donnees), f.cibles, OPTIONS)
    expect(f.constellations.map((c) => c.name)).toEqual(['docs', 'Groupe rouge'])
    expect(f.etoiles.find((e) => e.url === 'https://doc.example/3')?.constellationId).toBe('existante')
  })

  it('nouvelle-par-fenetre : une fenêtre par fenêtre importée, sauvegarde de chaque', async () => {
    const f = faux()
    await appliquer(entree(donnees), f.cibles, { ...OPTIONS, fenetre: 'nouvelle-par-fenetre' })
    expect(new Set(f.etoiles.map((e) => e.fenetre))).toEqual(new Set([1, 2]))
    expect(f.fenetresCreees).toBe(2)
    expect(f.sauvegardes).toBe(2)
  })

  it('ouvrirMaintenant : seules les 10 premières sont réveillées', async () => {
    const f = faux()
    const onglets = Array.from({ length: 25 }, (_, i) => ({ url: `https://s.example/${i}`, titre: `S${i}` }))
    await appliquer(entree({ onglets: { fenetres: [{ onglets, groupes: [] }] } }), f.cibles, { ...OPTIONS, ouvrirMaintenant: true })
    expect(f.reveillees).toHaveLength(10)
    expect(f.reveillees[0]).toBe('e1')
  })

  it('tranches de 50 : abandon entre deux tranches, étoiles déjà créées conservées', async () => {
    const f = faux()
    const ctrl = new AbortController()
    const ouvrir = f.cibles.ciel.ouvrirEndormie
    f.cibles.ciel.ouvrirEndormie = (u, o) => {
      const id = ouvrir(u, o)
      if (f.etoiles.length === 50) ctrl.abort()
      return id
    }
    const onglets = Array.from({ length: 120 }, (_, i) => ({ url: `https://s.example/${i}`, titre: `S${i}` }))
    const r = await appliquer(entree({ onglets: { fenetres: [{ onglets, groupes: [] }] } }), f.cibles, OPTIONS, undefined, ctrl.signal)
    expect(r.onglets).toMatchObject({ etat: 'annule', ajoutes: 50 })
    expect(f.sauvegardes).toBe(1)
  })
})

describe('couleurConstellation (distance OKLab)', () => {
  it.each([
    ['bleu', '#5B8DEF'],
    ['rouge', '#E0604F'],
    ['vert', '#3FB187'],
    ['rose', '#D86BA8'],
    ['violet', '#9B7BEF'],
    ['cyan', '#3FB6C6'],
    ['orange', '#F09A4E'],
    ['gris', '#8A8AB0']
  ] as const)('%s -> %s', (couleur, attendu) => expect(couleurConstellation(COULEURS_GROUPE[couleur])).toBe(attendu))

  it('jaune -> or', () => expect(couleurConstellation(COULEURS_GROUPE.jaune)).toBe('#F4C56A'))
  it('toujours une couleur de la palette', () => expect(PALETTE_CONSTELLATIONS).toContain(couleurConstellation('#123456')))
})

describe('moteurs', () => {
  it('perso → moteursPerso (liste complète), mots-clés arbitrés et dits, un seul set', async () => {
    const f = faux({ moteursPerso: [{ id: 'm0', nom: 'Existant', motCle: 'ex', url: 'https://ex.example/?q=%s' }] })
    const r = await appliquer(
      entree({ moteurs: [{ nom: 'Wikipédia (fr)', motCle: 'w', url: 'https://fr.wikipedia.org/w/?search=%s', perso: true }, { nom: 'Bing', motCle: 'bing.com', url: 'https://www.bing.com/search?q=%s', perso: false }] }, 'firefox'),
      f.cibles,
      OPTIONS
    )
    expect(f.setCalls).toHaveLength(1)
    expect(f.reglages.moteursPerso.map((m) => m.motCle)).toEqual(['ex', 'w-ff'])
    expect(r.moteurs).toMatchObject({ etat: 'partiel', ajoutes: 1, ignores: 1 })
    expect(r.moteurs.notes.join(' ')).toMatch(/`w`.*`w-ff`/)
  })

  it('réimport : présent, rien écrit', async () => {
    const f = faux()
    const d = entree({ moteurs: [{ nom: 'Doc', motCle: 'doc', url: 'https://doc.example/?q=%s', perso: true }] })
    await appliquer(d, f.cibles, OPTIONS)
    const r = await appliquer(d, f.cibles, OPTIONS)
    expect(r.moteurs).toMatchObject({ ajoutes: 0, presents: 1 })
    expect(f.setCalls).toHaveLength(1)
    expect(f.reglages.moteursPerso).toHaveLength(1)
  })
})

describe('réglages', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'lyra-appliquer-'))

  it('zoom : hôte → origines, palier le plus proche, un seul setSettings ; existant non écrasé', async () => {
    const f = faux({ sites: { 'https://exemple.fr': { zoom: 2 } } })
    const r = await appliquer(entree({ reglages: { zoomParSite: { 'exemple.fr': 1.3, 'sub.autre.org': 0.7, 'zero.fr': 1 } } }), f.cibles, OPTIONS)
    expect(f.setCalls).toHaveLength(1)
    expect(f.reglages.sites['https://exemple.fr'].zoom).toBe(2)
    expect(f.reglages.sites['https://www.exemple.fr']).toEqual({ zoom: 1.25 })
    expect(f.reglages.sites['https://sub.autre.org']).toEqual({ zoom: 0.67 })
    expect(f.reglages.sites['https://www.sub.autre.org']).toBeUndefined()
    expect(f.reglages.sites['https://zero.fr']).toBeUndefined()
    expect(r.reglages.presents).toBeGreaterThanOrEqual(1)
    expect(r.reglages.notes.join(' ')).toMatch(/exemple\.fr/)
  })

  it('dossier de téléchargement inexistant ignoré et dit ; existant appliqué', async () => {
    const f = faux()
    const r = await appliquer(entree({ reglages: { dossierTelechargement: join(dossier, 'nexiste-pas') } }), f.cibles, OPTIONS)
    expect(f.reglages.telechargements.dossier).toBe('/dl')
    expect(r.reglages.ignores).toBe(1)
    expect(r.reglages.notes.join(' ')).toMatch(/introuvable/)
    const g = faux()
    await appliquer(entree({ reglages: { dossierTelechargement: dossier } }), g.cibles, OPTIONS)
    expect(g.reglages.telechargements.dossier).toBe(dossier)
  })

  it('langue : fr-FR → fr, en-GB → en, de-DE ignorée et dite', async () => {
    const a = faux({ langue: 'en' })
    await appliquer(entree({ reglages: { langue: 'fr-FR' } }), a.cibles, OPTIONS)
    expect(a.reglages.langue).toBe('fr')
    const b = faux()
    await appliquer(entree({ reglages: { langue: 'en-GB' } }), b.cibles, OPTIONS)
    expect(b.reglages.langue).toBe('en')
    const c = faux()
    const r = await appliquer(entree({ reglages: { langue: 'de-DE' } }), c.cibles, OPTIONS)
    expect(c.reglages.langue).toBe('fr')
    expect(r.reglages.ignores).toBe(1)
    expect(r.reglages.notes.join(' ')).toMatch(/de-DE/)
  })

  it('page d’accueil : mise en attente pour le jalon D, pas ailleurs', async () => {
    const f = faux()
    const r = await appliquer(entree({ reglages: { pageAccueil: 'https://accueil.example/' } }), f.cibles, OPTIONS)
    expect(f.reglages.import.reglagesEnAttente.pageAccueil).toBe('https://accueil.example/')
    expect(r.reglages.notes.join(' ')).toMatch(/Démarrage et sessions/)
    const g = faux()
    const r2 = await appliquer(entree({ reglages: { pageAccueil: 'javascript:1' } }), g.cibles, OPTIONS)
    expect(g.reglages.import.reglagesEnAttente.pageAccueil).toBeUndefined()
    expect(r2.reglages.ignores).toBe(1)
  })

  it('moteur par défaut : seulement si « réglages » est coché', async () => {
    const m = [{ nom: 'Google', motCle: 'google.com', url: 'https://www.google.com/search?q=%s', parDefaut: true, perso: false }]
    const sans = faux()
    await appliquer(entree({ moteurs: m }), sans.cibles, OPTIONS)
    expect(sans.reglages.moteurParDefaut).toBe('duckduckgo')
    const avec = faux()
    const r = await appliquer(entree({ moteurs: m, reglages: {} }), avec.cibles, OPTIONS)
    expect(avec.reglages.moteurParDefaut).toBe('google')
    expect(r.reglages.notes.join(' ')).toMatch(/Google/)
  })

  it('Firefox intégré ddg → duckduckgo ; moteur déjà choisi : seulement si l’utilisateur confirme', async () => {
    const ff = { id: 'ddg', integre: true }
    const a = faux({ moteurParDefaut: 'google' })
    await appliquer(entree({ reglages: {} }, 'firefox', { moteurParDefautFirefox: ff }), a.cibles, OPTIONS)
    expect(a.reglages.moteurParDefaut).toBe('duckduckgo')
    const b = faux({ moteurParDefaut: 'google', moteurChoisi: true })
    const r = await appliquer(entree({ reglages: {} }, 'firefox', { moteurParDefautFirefox: ff }), b.cibles, OPTIONS)
    expect(b.reglages.moteurParDefaut).toBe('google')
    expect(r.reglages.notes.join(' ')).toMatch(/conservé/)
    const c = faux({ moteurParDefaut: 'google', moteurChoisi: true })
    await appliquer(entree({ reglages: {} }, 'firefox', { moteurParDefautFirefox: ff }), c.cibles, { ...OPTIONS, moteurParDefaut: true })
    expect(c.reglages.moteurParDefaut).toBe('duckduckgo')
  })

  it('moteur par défaut absent de Lyra (Bing) : inchangé et dit', async () => {
    const f = faux()
    const r = await appliquer(entree({ reglages: {} }, 'firefox', { moteurParDefautFirefox: { id: 'bing', integre: true } }), f.cibles, OPTIONS)
    expect(f.reglages.moteurParDefaut).toBe('duckduckgo')
    expect(r.reglages.notes.join(' ')).toMatch(/bing/i)
  })
})

describe('extensions', () => {
  const ext = (id: string, magasin: 'chrome' | 'edge' | 'firefox' | 'inconnu' = 'chrome', imposee?: boolean) => ({ id, nom: `Ext ${id}`, magasin, actif: true, ...(imposee ? { imposee } : {}) })
  const attente = (id: string, date: number, magasin: ExtensionEnAttente['magasin'] = 'chrome'): ExtensionEnAttente => ({ id, nom: id, magasin, actif: true, source: 'edge', date })

  it('file complète envoyée (existant + nouveau), source et date posées', async () => {
    vi.setSystemTime(5000)
    const f = faux()
    f.reglages.import.extensionsEnAttente = [attente('vieille', 1)]
    const r = await appliquer(entree({ extensions: [ext('a'), ext('b', 'edge')] }, 'brave'), f.cibles, OPTIONS)
    expect(f.setCalls).toHaveLength(1)
    expect(f.reglages.import.extensionsEnAttente.map((e) => e.id)).toEqual(['vieille', 'a', 'b'])
    expect(f.reglages.import.extensionsEnAttente[1]).toMatchObject({ source: 'brave', date: 5000, magasin: 'chrome' })
    expect(r.extensions).toMatchObject({ etat: 'ok', ajoutes: 2, presents: 0 })
    expect(r.extensions.notes.join(' ')).toMatch(/à la main/)
  })

  it('redemandée : déplacée à la fin avec sa nouvelle date ; dédoublonnage sur id + magasin', async () => {
    vi.setSystemTime(9000)
    const f = faux()
    f.reglages.import.extensionsEnAttente = [attente('a', 1), attente('b', 2), attente('a', 3, 'firefox')]
    const r = await appliquer(entree({ extensions: [ext('a'), ext('a')] }), f.cibles, OPTIONS)
    const q = f.reglages.import.extensionsEnAttente
    expect(q.map((e) => `${e.id}/${e.magasin}`)).toEqual(['b/chrome', 'a/firefox', 'a/chrome'])
    expect(q[2].date).toBe(9000)
    expect(r.extensions).toMatchObject({ ajoutes: 0, presents: 1 })
  })

  it('imposée : jamais enfilée sans choix explicite', async () => {
    const f = faux()
    const r = await appliquer(entree({ extensions: [ext('pol', 'chrome', true), ext('ok')] }), f.cibles, OPTIONS)
    expect(f.reglages.import.extensionsEnAttente.map((e) => e.id)).toEqual(['ok'])
    expect(r.extensions.ignores).toBe(1)
    const g = faux()
    await appliquer(entree({ extensions: [ext('pol', 'chrome', true)] }), g.cibles, { ...OPTIONS, extensionsChoisies: ['pol'] })
    expect(g.reglages.import.extensionsEnAttente).toMatchObject([{ id: 'pol', imposee: true }])
  })

  it('200 au plus, les plus récentes gardées', async () => {
    const f = faux()
    f.reglages.import.extensionsEnAttente = Array.from({ length: 195 }, (_, i) => attente(`old${i}`, i))
    await appliquer(entree({ extensions: Array.from({ length: 10 }, (_, i) => ext(`new${i}`)) }), f.cibles, OPTIONS)
    const q = f.reglages.import.extensionsEnAttente
    expect(q).toHaveLength(200)
    expect(q[0].id).toBe('old5')
    expect(q.at(-1)?.id).toBe('new9')
  })
})

describe('résultat par élément', () => {
  it('éléments non demandés : ignore ; Indisponible : code et raison, le reste appliqué, jamais d’exception', async () => {
    const f = faux()
    const r = await appliquer(
      entree({ favoris: indisponible('Base verrouillée', 'verrouille'), onglets: { fenetres: [{ onglets: [{ url: 'https://a.example/', titre: 'A' }], groupes: [] }] }, reglages: indisponible('Profil absent', 'absent') }),
      f.cibles,
      OPTIONS
    )
    expect(r.favoris).toMatchObject({ etat: 'indisponible', code: 'verrouille', raison: 'Base verrouillée', ajoutes: 0 })
    expect(r.reglages).toMatchObject({ etat: 'indisponible', code: 'absent' })
    expect(r.onglets.etat).toBe('ok')
    expect(r.historique.etat).toBe('ignore')
    expect(Object.keys(r)).toEqual(expect.arrayContaining([...ELEMENTS_IMPORT, 'duree', 'source', 'profil']))
    expect(r).toMatchObject({ source: 'chrome', profil: 'Khalil' })
  })

  it('une cible qui lève : l’élément devient indisponible, les autres continuent', async () => {
    const f = faux()
    f.cibles.favoris.ajouterLot = () => {
      throw new Error('disque plein')
    }
    const r = await appliquer(entree({ favoris: { barre: [lien('a', 'https://a.example/')], autres: [] }, onglets: { fenetres: [{ onglets: [{ url: 'https://a.example/', titre: 'A' }], groupes: [] }] } }), f.cibles, OPTIONS)
    expect(r.favoris).toMatchObject({ etat: 'indisponible', raison: expect.stringContaining('disque plein') })
    expect(r.onglets.etat).toBe('ok')
  })

  it('ordre : favoris → moteurs → réglages → extensions → onglets → historique', async () => {
    const f = faux()
    const ordre: string[] = []
    const p = (e: string) => (ordre.at(-1) !== e ? ordre.push(e) : 0)
    await appliquer(
      entree({
        historique: [visite('https://h.example/', 1)],
        onglets: { fenetres: [{ onglets: [{ url: 'https://o.example/', titre: 'O' }], groupes: [] }] },
        extensions: [{ id: 'e', nom: 'E', magasin: 'chrome', actif: true }],
        reglages: { langue: 'en-US' },
        moteurs: [{ nom: 'A', motCle: 'aa', url: 'https://a.example/?q=%s', perso: true }],
        favoris: { barre: [lien('a', 'https://a.example/')], autres: [] }
      }),
      f.cibles,
      OPTIONS,
      (x) => p(x.element)
    )
    expect(ordre).toEqual(['favoris', 'moteurs', 'reglages', 'extensions', 'onglets', 'historique'])
  })
})
