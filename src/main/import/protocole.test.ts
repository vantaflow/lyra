/**
 * Protocole de messages main ↔ lecteur (jalon E, 3.4) : testé avec un faux port, sans Electron ni processus.
 */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { creerLecteur } from './protocole'
import type { Lecteurs, MessageDuLecteur, MessageVersLecteur, Port } from './protocole'
import { ErreurImport, estIndisponible } from './types'
import type { ProfilDetecte, Visite } from './types'

const FIXTURES = fileURLToPath(new URL('./fixtures/chromium', import.meta.url))

class FauxPort implements Port {
  envoyes: MessageDuLecteur[] = []
  private ecouteur?: (e: { data: unknown }) => void
  postMessage(m: MessageDuLecteur): void {
    this.envoyes.push(m)
  }
  on(_: 'message', cb: (e: { data: unknown }) => void): void {
    this.ecouteur = cb
  }
  recevoir(m: MessageVersLecteur): void {
    this.ecouteur?.({ data: m })
  }
}

const profil = (navigateur: ProfilDetecte['navigateur'] = 'chrome'): ProfilDetecte => ({ navigateur, nom: 'P', chemin: '/x', racine: '/', parDefaut: true })
const visites = (n: number, depart = 0): Visite[] => Array.from({ length: n }, (_, i) => ({ url: `https://e.test/${depart + i}`, titre: 't', date: 1000 + i, visites: 2 }))
const types = (p: FauxPort): string[] => p.envoyes.map((m) => m.type)

function lecteursFaux(surcharge: Partial<Lecteurs> = {}): Lecteurs {
  const vide = async (): Promise<{ donnees: object; compteurs: object }> => ({ donnees: {}, compteurs: {} })
  return {
    detecter: async () => [],
    lireProfil: vide as Lecteurs['lireProfil'],
    parcourirHistorique: async () => ({ pages: 0, visites: 0 }),
    moteurParDefautFirefox: async () => undefined,
    ...surcharge
  }
}

describe('lire', () => {
  it('envoie progression, éléments puis fin, dans cet ordre', async () => {
    const port = new FauxPort()
    const l = creerLecteur(
      port,
      lecteursFaux({
        lireProfil: async (_p, o) => {
          o?.surProgression?.({ element: 'favoris', fait: 0 })
          return { donnees: { favoris: { barre: [], autres: [] }, reglages: { langue: 'fr' } }, compteurs: {} }
        }
      })
    )
    await l.traiter({ type: 'lire', profil: profil(), params: {}, elements: ['favoris', 'reglages'] })
    expect(port.envoyes).toEqual([
      { type: 'progression', element: 'favoris', fait: 0 },
      { type: 'element', element: 'favoris', valeur: { barre: [], autres: [] } },
      { type: 'element', element: 'reglages', valeur: { langue: 'fr' } },
      { type: 'fin' }
    ])
  })

  it('historique Chromium : lots de 2 000 relayés, puis résumé de l’élément', async () => {
    const port = new FauxPort()
    const l = creerLecteur(
      port,
      lecteursFaux({
        parcourirHistorique: async (_p, o, surLot) => {
          expect(o.tailleLot).toBe(2000)
          await surLot(visites(2000))
          await surLot(visites(5, 2000))
          return { pages: 2005, visites: 4010 }
        }
      })
    )
    await l.traiter({ type: 'lire', profil: profil(), params: {}, elements: ['historique'] })
    expect(types(port)).toEqual(['lot', 'lot', 'element', 'fin'])
    expect((port.envoyes[0] as { visites: Visite[] }).visites).toHaveLength(2000)
    expect(port.envoyes[2]).toEqual({ type: 'element', element: 'historique', valeur: { pages: 2005, visites: 4010 } })
  })

  it('historique Safari : le tableau lu est redécoupé en lots', async () => {
    const port = new FauxPort()
    const l = creerLecteur(
      port,
      lecteursFaux({ lireProfil: async () => ({ donnees: { historique: visites(4500) }, compteurs: {} }) })
    )
    await l.traiter({ type: 'lire', profil: profil('safari'), params: {}, elements: ['historique'] })
    expect(port.envoyes.filter((m) => m.type === 'lot').map((m) => (m as { visites: Visite[] }).visites.length)).toEqual([2000, 2000, 500])
    expect(port.envoyes.find((m) => m.type === 'element')).toEqual({
      type: 'element',
      element: 'historique',
      valeur: { pages: 4500, visites: 9000 }
    })
  })

  it('ErreurImport lancée par un lecteur : convertie en Indisponible, rien ne plante', async () => {
    const port = new FauxPort()
    const l = creerLecteur(
      port,
      lecteursFaux({
        lireProfil: async () => {
          throw new ErreurImport('Fermez Chrome', { code: 'verrouille' })
        }
      })
    )
    await l.traiter({ type: 'lire', profil: profil(), params: {}, elements: ['favoris', 'onglets'] })
    expect(port.envoyes).toEqual([
      { type: 'element', element: 'favoris', valeur: { indisponible: true, raison: 'Fermez Chrome', code: 'verrouille' } },
      { type: 'element', element: 'onglets', valeur: { indisponible: true, raison: 'Fermez Chrome', code: 'verrouille' } },
      { type: 'fin' }
    ])
  })

  it('erreur du parcours d’historique : Indisponible, puis fin', async () => {
    const port = new FauxPort()
    const l = creerLecteur(
      port,
      lecteursFaux({
        parcourirHistorique: async () => {
          throw new Error('boum')
        }
      })
    )
    await l.traiter({ type: 'lire', profil: profil(), params: {}, elements: ['historique'] })
    const el = port.envoyes[0] as { valeur: unknown }
    expect(estIndisponible(el.valeur)).toBe(true)
    expect(types(port)).toEqual(['element', 'fin'])
  })

  it('Firefox : le moteur par défaut est envoyé quand les moteurs sont demandés', async () => {
    const port = new FauxPort()
    const l = creerLecteur(port, lecteursFaux({ moteurParDefautFirefox: async () => ({ id: 'ddg', integre: true }) }))
    await l.traiter({ type: 'lire', profil: profil('firefox'), params: {}, elements: ['moteurs'] })
    expect(port.envoyes).toContainEqual({ type: 'moteurParDefautFirefox', valeur: { id: 'ddg', integre: true } })
    expect(types(port).at(-1)).toBe('fin')
  })

  it('annuler : le signal est transmis aux lecteurs, les éléments restants sont annulés', async () => {
    const port = new FauxPort()
    const l = creerLecteur(
      port,
      lecteursFaux({
        parcourirHistorique: async (_p, o, surLot) => {
          await surLot(visites(3))
          port.recevoir({ type: 'annuler' })
          expect(o.signal?.aborted).toBe(true)
          return { indisponible: true, raison: 'Lecture annulée.', code: 'annule' }
        }
      })
    )
    await l.traiter({ type: 'lire', profil: profil(), params: {}, elements: ['historique', 'favoris'] })
    // favoris est lu avant l'historique ; l'historique abandonné devient Indisponible annule
    const hist = port.envoyes.find((m) => m.type === 'element' && m.element === 'historique') as { valeur: { code: string } }
    expect(hist.valeur.code).toBe('annule')
    expect(types(port).at(-1)).toBe('fin')
  })

  it('annulation avant l’historique : élément annulé sans lire', async () => {
    const port = new FauxPort()
    let parcouru = false
    const l = creerLecteur(
      port,
      lecteursFaux({
        lireProfil: async () => {
          port.recevoir({ type: 'annuler' })
          return { donnees: {}, compteurs: {} }
        },
        parcourirHistorique: async () => {
          parcouru = true
          return { pages: 0, visites: 0 }
        }
      })
    )
    await l.traiter({ type: 'lire', profil: profil(), params: {}, elements: ['favoris', 'historique'] })
    expect(parcouru).toBe(false)
    expect(port.envoyes.find((m) => m.type === 'element' && m.element === 'historique')).toEqual({
      type: 'element',
      element: 'historique',
      valeur: { indisponible: true, raison: 'Lecture annulée.', code: 'annule' }
    })
  })
})

describe('detecter', () => {
  it('envoie les profils puis fin ; une erreur donne une liste vide', async () => {
    const port = new FauxPort()
    await creerLecteur(port, lecteursFaux({ detecter: async () => [profil()] })).traiter({ type: 'detecter' })
    expect(port.envoyes).toEqual([{ type: 'profils', profils: [profil()] }, { type: 'fin' }])
    const port2 = new FauxPort()
    await creerLecteur(
      port2,
      lecteursFaux({
        detecter: async () => {
          throw new Error('x')
        }
      })
    ).traiter({ type: 'detecter' })
    expect(port2.envoyes).toEqual([{ type: 'profils', profils: [] }, { type: 'fin' }])
  })
})

describe('apercu', () => {
  it('compte l’historique en flux sans le garder, liste les indisponibles et les extensions', async () => {
    const port = new FauxPort()
    const ext = [{ id: 'a', nom: 'A', magasin: 'chrome' as const, actif: true }]
    const l = creerLecteur(
      port,
      lecteursFaux({
        lireProfil: async (_p, o) => {
          expect(o?.elements).toEqual(['favoris', 'onglets', 'extensions'])
          return {
            donnees: { favoris: { barre: [], autres: [] }, onglets: { indisponible: true, raison: 'verrou', code: 'verrouille' }, extensions: ext },
            compteurs: { favoris: { favoris: 0, dossiers: 0 }, extensions: { total: 1, chrome: 1, edge: 0, firefox: 0, inconnues: 0 } }
          }
        },
        parcourirHistorique: async (_p, o, surLot) => {
          expect(o.depuisJours).toBe(30)
          await surLot(visites(3))
          await surLot(visites(2, 3))
          return { pages: 5, visites: 10 }
        }
      })
    )
    await l.traiter({ type: 'apercu', profil: profil(), elements: ['favoris', 'historique', 'onglets', 'extensions'], depuisJours: 30 })
    expect(port.envoyes).toEqual([
      {
        type: 'apercu',
        compteurs: { favoris: { favoris: 0, dossiers: 0 }, extensions: { total: 1, chrome: 1, edge: 0, firefox: 0, inconnues: 0 }, historique: { pages: 5, visites: 10 } },
        indisponibles: { onglets: { indisponible: true, raison: 'verrou', code: 'verrouille' } },
        extensions: ext
      },
      { type: 'fin' }
    ])
  })
})

describe('port réel', () => {
  it('écoute les messages du port et les traite', async () => {
    const port = new FauxPort()
    const l = creerLecteur(port, lecteursFaux({ detecter: async () => [] }))
    port.recevoir({ type: 'detecter' })
    await l.fini()
    expect(types(port)).toEqual(['profils', 'fin'])
  })

  it('lecteurs réels sur la fixture Chrome (aucun profil réel)', async () => {
    const port = new FauxPort()
    const l = creerLecteur(port)
    const racine = join(FIXTURES, 'chrome')
    const { detecterProfils } = await import('./detection')
    const [p] = await detecterProfils({ racines: { chrome: racine }, navigateurs: ['chrome'] })
    await l.traiter({ type: 'lire', profil: p, params: {}, elements: ['favoris', 'historique'] })
    expect(types(port)).toContain('lot')
    expect(types(port).at(-1)).toBe('fin')
    const hist = port.envoyes.find((m) => m.type === 'element' && m.element === 'historique') as { valeur: { pages: number } }
    expect(hist.valeur.pages).toBeGreaterThan(0)
  })
})
