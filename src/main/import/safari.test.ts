import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Copieur } from './copie'
import { MAINTENANT_FIXTURES_APPLE, appleSecondes } from './fixtures/generer-apple'
import { MESSAGE_ACCES_COMPLET_SAFARI, appleVersMs, detecterProfilsSafari, favorisDepuisPlist, lireProfilSafari, msVersApple } from './safari'
import { ErreurImport, estIndisponible } from './types'
import type { ElementImport, FavorisImportes, ProfilDetecte, Visite } from './types'

// statSync est un passe-plat : un test peut lui faire lever EPERM sur un chemin précis (macOS le fait avant toute copie)
vi.mock('node:fs', async (importOriginal) => {
  const reel = await importOriginal<typeof import('node:fs')>()
  return { ...reel, statSync: vi.fn(reel.statSync) }
})

const FIXTURES = fileURLToPath(new URL('./fixtures/safari', import.meta.url))
const MAINTENANT = MAINTENANT_FIXTURES_APPLE

const profilFixtures: ProfilDetecte = { navigateur: 'safari', nom: 'Safari', chemin: FIXTURES, racine: FIXTURES, parDefaut: true }

async function lire(p: ProfilDetecte, elements: ElementImport[], extra: Parameters<typeof lireProfilSafari>[1] = {}) {
  return lireProfilSafari(p, { elements, maintenant: MAINTENANT, ...extra })
}

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-safari-'))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(statSync).mockReset() // revient au passe-plat (restoreAllMocks ne touche pas aux vi.fn)
  rmSync(tmp, { recursive: true, force: true })
})

/** Profil jetable (dossier vide) pour fabriquer des cas particuliers. */
function profilJetable(): ProfilDetecte {
  const chemin = join(tmp, 'Safari')
  mkdirSync(chemin, { recursive: true })
  return { navigateur: 'safari', nom: 'Safari', chemin, racine: chemin, parDefaut: true }
}

const titres = (v: Visite[]): string[] => v.map((x) => x.titre)

describe('dates Safari', () => {
  it('secondes depuis 2001 → millisecondes depuis 1970, et retour', () => {
    expect(appleVersMs(appleSecondes('2026-10-19T12:00:00Z'))).toBe(MAINTENANT)
    expect(msVersApple(Date.UTC(2001, 0, 1))).toBe(0)
    expect(appleVersMs(0)).toBe(0)
    for (const v of [undefined, null, '', 'abc', -5]) expect(appleVersMs(v)).toBe(0)
  })
})

describe('détection', () => {
  it('un seul profil « Safari », par défaut', async () => {
    const profils = await detecterProfilsSafari(FIXTURES)
    expect(profils).toEqual([{ navigateur: 'safari', nom: 'Safari', chemin: FIXTURES, racine: FIXTURES, parDefaut: true }])
  })

  it("dossier absent, ou fichier à la place du dossier : aucun profil", async () => {
    expect(await detecterProfilsSafari(join(tmp, 'inexistant'))).toEqual([])
    writeFileSync(join(tmp, 'fichier'), 'x')
    expect(await detecterProfilsSafari(join(tmp, 'fichier'))).toEqual([])
  })
})

describe('favoris', () => {
  it('barre, menu → autres, liste de lecture ignorée', async () => {
    const { donnees, compteurs } = await lire(profilFixtures, ['favoris'])
    const f = donnees.favoris as FavorisImportes
    expect(estIndisponible(f)).toBe(false)
    expect(f.barre).toEqual([
      { type: 'lien', titre: 'Exemple', url: 'https://example.com/', date: 0 },
      {
        type: 'dossier',
        titre: 'Lecture',
        date: 0,
        enfants: [
          { type: 'lien', titre: 'Guide', url: 'https://docs.example.org/guide', date: 0 },
          { type: 'lien', titre: 'Éléphant — café', url: 'https://fr.wikipedia.org/wiki/%C3%89l%C3%A9phant', date: 0 }
        ]
      }
    ])
    expect(f.autres).toEqual([
      { type: 'lien', titre: 'Wikipédia', url: 'https://fr.wikipedia.org/', date: 0 },
      { type: 'dossier', titre: 'Vide', date: 0, enfants: [] }
    ])
    expect(JSON.stringify(f)).not.toContain('reading.example.com') // liste de lecture
    expect(JSON.stringify(f)).not.toContain('javascript:')
    expect(compteurs.favoris).toEqual({ favoris: 4, dossiers: 2 })
  })

  it('racine sans « Children » : format inattendu', () => {
    expect(() => favorisDepuisPlist({ a: 1 })).toThrow(ErreurImport)
    expect(() => favorisDepuisPlist('texte')).toThrow(ErreurImport)
  })

  it('sans « BookmarksBar » ni « BookmarksMenu » : tout dans « autres »', () => {
    const f = favorisDepuisPlist({ Children: [{ WebBookmarkType: 'WebBookmarkTypeLeaf', URLString: 'https://a.example/', Title: 'A' }] })
    expect(f.barre).toEqual([])
    expect(f.autres).toEqual([{ type: 'lien', titre: 'A', url: 'https://a.example/', date: 0 }])
  })
})

describe('historique', () => {
  it('fenêtre de 92 jours par défaut, triée par date décroissante, visites comptées dans la fenêtre', async () => {
    const { donnees, compteurs } = await lire(profilFixtures, ['historique'])
    const h = donnees.historique as Visite[]
    expect(estIndisponible(h)).toBe(false)
    expect(h.map((v) => v.url)).toEqual(['https://example.com/', 'http://clair.example.com/', 'https://mixte.example.com/', 'https://docs.example.org/guide'])
    expect(h.map((v) => v.visites)).toEqual([3, 1, 1, 2]) // « Mixte » : 1 visite dans la fenêtre sur 2
    expect(titres(h)).toEqual(['Exemple', 'Sans HTTPS', 'Page mixte', 'Guide']) // titre de la dernière visite
    expect(h[0].date).toBe(Date.parse('2026-10-18T10:00:00Z'))
    expect(h.map((v) => v.date)).toEqual([...h.map((v) => v.date)].sort((a, b) => b - a))
    expect(compteurs.historique).toEqual({ pages: 4, visites: 7 })
  })

  it("tailleMaxBase s'applique à History.db (pas tailleMaxFichier) : volumineux avec l'une, lisible avec l'autre", async () => {
    const { donnees: serre } = await lire(profilFixtures, ['historique'], { tailleMaxBase: 1000 })
    expect(estIndisponible(serre.historique)).toBe(true)
    expect(estIndisponible(serre.historique) ? serre.historique.code : '').toBe('volumineux')
    const { donnees: large } = await lire(profilFixtures, ['historique'], { tailleMaxFichier: 1000 })
    expect(estIndisponible(large.historique)).toBe(false)
  })

  it('seulement http(s) : ni file:, ni about:, ni topsites:', async () => {
    const h = (await lire(profilFixtures, ['historique'], { depuisJours: null })).donnees.historique as Visite[]
    expect(h.every((v) => /^https?:\/\//.test(v.url))).toBe(true)
  })

  it('depuisJours: null → tout l’historique, toutes les visites', async () => {
    const h = (await lire(profilFixtures, ['historique'], { depuisJours: null })).donnees.historique as Visite[]
    expect(h).toHaveLength(5)
    expect(h.find((v) => v.url === 'https://mixte.example.com/')?.visites).toBe(2)
    expect(h.at(-1)?.url).toBe('https://ancien.example.net/')
  })

  it('fenêtre étroite et « maintenant » injectable', async () => {
    const semaine = (await lire(profilFixtures, ['historique'], { depuisJours: 7 })).donnees.historique as Visite[]
    expect(semaine.map((v) => [v.url, v.visites])).toEqual([
      ['https://example.com/', 2],
      ['http://clair.example.com/', 1]
    ])
    // « maintenant » injecté : 30 jours avant le 3 octobre, la visite du 2 septembre est déjà hors fenêtre
    const injecte = (await lire(profilFixtures, ['historique'], { depuisJours: 30, maintenant: Date.parse('2026-10-03T00:00:00Z') })).donnees.historique as Visite[]
    expect(injecte.map((v) => v.url)).toEqual(['https://example.com/', 'http://clair.example.com/', 'https://mixte.example.com/'])
    expect((await lire(profilFixtures, ['historique'], { maintenant: Date.parse('2027-02-01T00:00:00Z') })).donnees.historique).toEqual([])
  })

  it('progression et lots minuscules', async () => {
    const progres: number[] = []
    const h = (await lire(profilFixtures, ['historique'], { tailleLot: 1, surProgression: (p) => void progres.push(p.fait) })).donnees.historique as Visite[]
    expect(h).toHaveLength(4)
    expect(progres.at(-1)).toBe(4)
  })
})

describe('éléments non pris en charge', () => {
  it('onglets, moteurs, extensions, réglages : Indisponible avec une raison claire', async () => {
    const { donnees, compteurs } = await lireProfilSafari(profilFixtures, { elements: ['onglets', 'moteurs', 'extensions', 'reglages'] })
    for (const e of ['onglets', 'moteurs', 'extensions', 'reglages'] as const) {
      const v = donnees[e]
      expect(estIndisponible(v) && v.raison.startsWith('Safari :')).toBe(true)
    }
    expect(compteurs).toEqual({})
  })

  it('seuls les éléments demandés sont lus', async () => {
    const { donnees } = await lire(profilFixtures, ['favoris'])
    expect(Object.keys(donnees)).toEqual(['favoris'])
  })

  it('tous les éléments par défaut : favoris et historique lus, le reste indisponible', async () => {
    const { donnees } = await lireProfilSafari(profilFixtures, { maintenant: MAINTENANT })
    expect(Object.keys(donnees).sort()).toEqual(['extensions', 'favoris', 'historique', 'moteurs', 'onglets', 'reglages'])
    expect(estIndisponible(donnees.favoris)).toBe(false)
    expect(estIndisponible(donnees.historique)).toBe(false)
    expect(estIndisponible(donnees.onglets)).toBe(true)
  })
})

describe('fichiers absents ou corrompus', () => {
  it('fichiers absents → Indisponible (code « absent »)', async () => {
    const { donnees, compteurs } = await lire(profilJetable(), ['favoris', 'historique'])
    expect(donnees.favoris).toMatchObject({ indisponible: true, code: 'absent' })
    expect(donnees.historique).toMatchObject({ indisponible: true, code: 'absent' })
    expect(compteurs).toEqual({})
  })

  it('profil introuvable → tout est indisponible', async () => {
    const { donnees } = await lireProfilSafari({ ...profilJetable(), chemin: join(tmp, 'disparu') })
    for (const e of ['favoris', 'historique', 'onglets', 'moteurs', 'extensions', 'reglages'] as const) expect(estIndisponible(donnees[e])).toBe(true)
  })

  it('plist corrompu → Indisponible, sans crash', async () => {
    const p = profilJetable()
    const valide = readFileSync(join(FIXTURES, 'Bookmarks.plist'))
    const corrompus = [Buffer.from("ceci n'est pas un plist"), Buffer.alloc(200), Buffer.from('bplist00 '), Buffer.alloc(0), valide.subarray(0, valide.length - 40)]
    for (const contenu of corrompus) {
      writeFileSync(join(p.chemin, 'Bookmarks.plist'), contenu)
      const { donnees } = await lire(p, ['favoris'])
      expect(donnees.favoris).toMatchObject({ indisponible: true })
    }
  })

  it('History.db corrompu ou autre base → Indisponible, sans crash', async () => {
    const p = profilJetable()
    writeFileSync(join(p.chemin, 'History.db'), Buffer.from('pas du SQLite du tout, mais assez long pour faire illusion'.repeat(20)))
    expect((await lire(p, ['historique'])).donnees.historique).toMatchObject({ indisponible: true })
    // base SQLite valide mais sans les tables de Safari : on réutilise une fixture d'un autre navigateur
    const chromium = fileURLToPath(new URL('./fixtures/chromium/chrome/Default/History', import.meta.url))
    copyFileSync(chromium, join(p.chemin, 'History.db'))
    const { donnees } = await lire(p, ['historique'])
    expect(donnees.historique).toMatchObject({ indisponible: true })
    expect(estIndisponible(donnees.historique) && donnees.historique.raison).toMatch(/format inconnu/)
  })
})

describe('accès complet au disque et annulation', () => {
  it('EPERM à la copie → message Safari et code « acces »', async () => {
    const eperm = Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
    vi.spyOn(Copieur.prototype, 'copier').mockRejectedValue(new ErreurImport('Accès refusé à Bookmarks.plist.', { cause: eperm, code: 'verrouille' }))
    const { donnees } = await lire(profilFixtures, ['favoris', 'historique'])
    for (const v of [donnees.favoris, donnees.historique]) {
      expect(v).toEqual({ indisponible: true, raison: MESSAGE_ACCES_COMPLET_SAFARI, code: 'acces' })
    }
    expect(MESSAGE_ACCES_COMPLET_SAFARI).toBe('Safari : autorisez Lyra dans Réglages Système → Confidentialité et sécurité → Accès complet au disque, puis réessayez.')
  })

  /** Fait lever EPERM à statSync pour les chemins qui satisfont `refuse`, comme macOS sans « Accès complet au disque ». */
  function refuserStat(refuse: (chemin: string) => boolean): void {
    const reel = vi.mocked(statSync).getMockImplementation() as (...a: unknown[]) => unknown
    vi.mocked(statSync).mockImplementation(((chemin: unknown, ...reste: unknown[]) => {
      if (refuse(String(chemin))) throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
      return reel(chemin, ...reste)
    }) as unknown as typeof statSync)
  }

  it('EPERM sur le fichier (statSync de trouverFichier, sans simuler le copieur) → message Safari, code « acces »', async () => {
    refuserStat((c) => c.endsWith('Bookmarks.plist'))
    const { donnees } = await lire(profilFixtures, ['favoris', 'historique'])
    expect(donnees.favoris).toEqual({ indisponible: true, raison: MESSAGE_ACCES_COMPLET_SAFARI, code: 'acces' })
    expect(estIndisponible(donnees.historique)).toBe(false) // seul le fichier refusé est touché
  })

  it("EPERM sur le dossier du profil (statSync d'estDossier) : le profil existe, c'est la lecture des fichiers qui est refusée", async () => {
    refuserStat((c) => c === FIXTURES || c.endsWith('Bookmarks.plist') || c.endsWith('History.db'))
    const { donnees } = await lire(profilFixtures, ['favoris', 'historique'])
    for (const v of [donnees.favoris, donnees.historique]) expect(v).toEqual({ indisponible: true, raison: MESSAGE_ACCES_COMPLET_SAFARI, code: 'acces' })
  })

  it('EACCES aussi', async () => {
    const eacces = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    vi.spyOn(Copieur.prototype, 'copier').mockRejectedValue(new ErreurImport('x', { cause: eacces, code: 'verrouille' }))
    expect((await lire(profilFixtures, ['favoris'])).donnees.favoris).toMatchObject({ raison: MESSAGE_ACCES_COMPLET_SAFARI, code: 'acces' })
  })

  it('signal déjà annulé → tout est « Lecture annulée. »', async () => {
    const c = new AbortController()
    c.abort()
    const { donnees } = await lire(profilFixtures, ['favoris', 'historique', 'onglets'], { signal: c.signal })
    for (const e of ['favoris', 'historique', 'onglets'] as const) expect(donnees[e]).toEqual({ indisponible: true, raison: 'Lecture annulée.', code: 'annule' })
  })

  it("annulation entre deux éléments : le premier est lu, les suivants sont annulés", async () => {
    const c = new AbortController()
    const { donnees } = await lire(profilFixtures, ['favoris', 'historique', 'onglets'], {
      signal: c.signal,
      surProgression: (p) => {
        if (p.element === 'historique') c.abort() // dès le début de l'historique
      }
    })
    expect(estIndisponible(donnees.favoris)).toBe(false)
    expect(donnees.historique).toEqual({ indisponible: true, raison: 'Lecture annulée.', code: 'annule' })
    expect(donnees.onglets).toEqual({ indisponible: true, raison: 'Lecture annulée.', code: 'annule' })
  })

  it('les copies temporaires sont supprimées, même en cas d’erreur', async () => {
    const temp = join(tmp, 'temp')
    mkdirSync(temp)
    await lire(profilFixtures, ['favoris', 'historique'], { dossierTemp: temp })
    const p = profilJetable()
    writeFileSync(join(p.chemin, 'History.db'), 'corrompu'.repeat(100))
    await lire(p, ['historique'], { dossierTemp: temp })
    expect(readdirSync(temp)).toEqual([])
  })
})
