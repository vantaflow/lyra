import { describe, expect, it } from 'vitest'
import type { Settings } from '../../shared/types'
import type { CiblesImport } from './appliquer'
import { FileLots, lireEtAppliquer } from './executer'
import type { Processus } from './processus'
import { indisponible, type ElementImport, type OptionsApplication, type ProfilDetecte, type Visite } from './types'

const PROFIL: ProfilDetecte = { navigateur: 'chrome', nom: 'Khalil', chemin: '/x/Default', racine: '/x', parDefaut: true }
const OPTIONS: OptionsApplication = { fenetre: 'courante', ouvrirMaintenant: false, moteurParDefaut: false, extensionsChoisies: [] }
const lot = (n: number): Visite[] => Array.from({ length: 3 }, (_, i) => ({ url: `https://h${n}.example/${i}`, titre: `t${n}${i}`, date: 1_000_000 + n * 10 + i, visites: 1 }))

function cibles() {
  const historique = new Map<string, number[]>()
  const ordre: string[] = []
  const c: CiblesImport = {
    favoris: { ajouterLot: (items) => ({ ajoutes: items.length, presents: 0 }) },
    historique: {
      importer: (l) => {
        for (const v of l) historique.set(v.url, [...(historique.get(v.url) ?? []), v.date])
        ordre.push(`importer:${l.length}`)
        return { ajoutees: l.length, presentes: 0 }
      },
      attendre: async () => undefined,
      compacterSiNecessaire: () => false
    },
    ciel: { constellations: () => [], creerConstellation: (o) => ({ id: 'c', ...o }), ouvrirEndormie: () => 'e', sauver: () => undefined },
    reglages: {
      get: () => ({ langue: 'fr', moteurParDefaut: 'duckduckgo', moteurChoisi: false, sites: {}, moteursPerso: [], import: { extensionsEnAttente: [], reglagesEnAttente: {} }, telechargements: { dossier: '/dl', demander: false } }) as Pick<Settings, 'langue'> as never,
      set: () => undefined
    }
  }
  return { c, historique, ordre }
}

/** Faux lecteur qui respecte la contrainte du vrai : un lot n'est acquitté (surLot résolu) qu'une fois appliqué, 2 lots en vol au plus. */
function fauxProcessus(nbLots: number, trace: string[]): Processus {
  return {
    detecter: async () => [],
    apercu: async () => ({ compteurs: {}, indisponibles: {} }),
    lire: async (_p, _params, elements, opts) => {
      trace.push(`ordre:${elements.join(',')}`)
      for (const e of elements) {
        if (e === 'historique') continue
        opts?.surElement?.(e, e === 'favoris' ? { barre: [{ type: 'lien', titre: 'A', url: 'https://a.example/' }], autres: [] } : undefined)
      }
      const enVol: Promise<void>[] = []
      for (let i = 0; i < nbLots; i++) {
        trace.push(`lot${i}`)
        enVol.push(Promise.resolve(opts?.surLot?.(lot(i))))
        if (enVol.length >= 2) await enVol.shift()
      }
      await Promise.all(enVol)
      if (elements.includes('historique')) opts?.surElement?.('historique', { pages: nbLots * 3, visites: nbLots * 3 })
    }
  }
}

describe('FileLots', () => {
  it('rend un lot au producteur seulement une fois consommé, et libère tout à la fermeture du consommateur', async () => {
    const f = new FileLots()
    const acquittes: number[] = []
    void f.pousser(lot(0)).then(() => acquittes.push(0))
    void f.pousser(lot(1)).then(() => acquittes.push(1))
    const it = f[Symbol.asyncIterator]()
    await it.next()
    await Promise.resolve()
    expect(acquittes).toEqual([])
    await it.next() // le 1er lot est fini d'être appliqué
    await new Promise((r) => setImmediate(r))
    expect(acquittes).toEqual([0])
    await it.return?.()
    await new Promise((r) => setImmediate(r))
    expect(acquittes).toEqual([0, 1])
    await f.pousser(lot(2)) // consommateur parti : ne bloque plus
  })
})

describe('lireEtAppliquer', () => {
  it('historique lu en dernier : 5 lots, fenêtre de 2 en vol, aucun interblocage', async () => {
    const trace: string[] = []
    const { c, historique } = cibles()
    const resultat = await Promise.race([
      lireEtAppliquer({ processus: fauxProcessus(5, trace), profil: PROFIL, params: {}, elements: ['historique', 'favoris', 'onglets'], cibles: c, options: OPTIONS }),
      new Promise<never>((_, ko) => setTimeout(() => ko(new Error('interblocage')), 3000))
    ])
    expect(trace[0]).toBe('ordre:favoris,onglets,historique')
    expect(resultat.favoris).toMatchObject({ etat: 'ok', ajoutes: 1 })
    expect(resultat.historique).toMatchObject({ etat: 'ok', ajoutes: 15 })
    expect(historique.size).toBe(15)
    expect(resultat.source).toBe('chrome')
  })

  it('historique indisponible côté lecteur : élément indisponible, le reste est appliqué', async () => {
    const { c } = cibles()
    const p: Processus = {
      ...fauxProcessus(0, []),
      lire: async (_p, _q, _e, opts) => {
        opts?.surElement?.('favoris', { barre: [{ type: 'lien', titre: 'A', url: 'https://a.example/' }], autres: [] })
        opts?.surElement?.('historique', indisponible('base verrouillée', 'verrouille'))
      }
    }
    const r = await lireEtAppliquer({ processus: p, profil: PROFIL, params: {}, elements: ['favoris', 'historique'], cibles: c, options: OPTIONS })
    expect(r.favoris.etat).toBe('ok')
    expect(r.historique).toMatchObject({ etat: 'indisponible', code: 'verrouille' })
  })

  it("abandon pendant l'historique : le lecteur n'attend plus, résultat annulé, pas de blocage", async () => {
    const { c } = cibles()
    const ctl = new AbortController()
    const resultat = await Promise.race([
      lireEtAppliquer({ processus: fauxProcessus(50, []), profil: PROFIL, params: {}, elements: ['favoris', 'historique'], cibles: { ...c, historique: { ...c.historique, importer: (l) => { ctl.abort(); return c.historique.importer(l) } } }, options: OPTIONS, signal: ctl.signal }),
      new Promise<never>((_, ko) => setTimeout(() => ko(new Error('interblocage')), 3000))
    ])
    expect(resultat.historique.etat).toBe('annule')
    expect(resultat.favoris.etat).toBe('ok')
  })

  it('abandon avant l\'historique avec un lot en vol : le lot est acquitté, le lecteur s\'arrête aussitôt', async () => {
    const { c } = cibles()
    const ctl = new AbortController()
    const t0 = Date.now()
    const resultat = await Promise.race([
      lireEtAppliquer({ processus: fauxProcessus(50, []), profil: PROFIL, params: {}, elements: ['favoris', 'historique'], cibles: { ...c, favoris: { ajouterLot: (items) => { ctl.abort(); return { ajoutes: items.length, presents: 0 } } } }, options: OPTIONS, signal: ctl.signal }),
      new Promise<never>((_, ko) => setTimeout(() => ko(new Error('interblocage')), 3000))
    ])
    expect(Date.now() - t0).toBeLessThan(1500)
    expect(resultat.historique.etat).toBe('annule')
  })

  it('un élément non historique reçu hors ordre ne gêne pas ; sans historique, appliqué à la fin de la lecture', async () => {
    const { c } = cibles()
    const els: ElementImport[] = ['favoris']
    const r = await lireEtAppliquer({ processus: fauxProcessus(0, []), profil: PROFIL, params: {}, elements: els, cibles: c, options: OPTIONS })
    expect(r.favoris.etat).toBe('ok')
    expect(r.historique.etat).toBe('ignore')
  })
})
