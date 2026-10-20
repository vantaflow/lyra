/**
 * Côté main : pilotage du lecteur, testé avec un faux processus enfant (pas d'Electron).
 */
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { creerProcessus, DELAIS_PAR_DEFAUT, envLecteur } from './processus'
import type { Enfant } from './processus'
import type { MessageDuLecteur, MessageVersLecteur } from './protocole'
import type { ProfilDetecte, Visite } from './types'

class FauxEnfant extends EventEmitter implements Enfant {
  recus: MessageVersLecteur[] = []
  tue = false
  postMessage(m: MessageVersLecteur): void {
    this.recus.push(m)
  }
  kill(): boolean {
    this.tue = true
    return true
  }
  dire(m: MessageDuLecteur): void {
    this.emit('message', m)
  }
}

const profil: ProfilDetecte = { navigateur: 'chrome', nom: 'P', chemin: '/x', racine: '/', parDefaut: true }
const enfantEtProcessus = (): { enfant: FauxEnfant; p: ReturnType<typeof creerProcessus>; forks: number[] } => {
  const enfant = new FauxEnfant()
  const forks: number[] = []
  return { enfant, forks, p: creerProcessus(() => (forks.push(1), enfant)) }
}

describe('detecter', () => {
  it('envoie « detecter », renvoie les profils et tue l’enfant à la fin', async () => {
    const { enfant, p } = enfantEtProcessus()
    const promesse = p.detecter()
    expect(enfant.recus).toEqual([{ type: 'detecter' }])
    enfant.dire({ type: 'profils', profils: [profil] })
    enfant.dire({ type: 'fin' })
    expect(await promesse).toEqual([profil])
    expect(enfant.tue).toBe(true)
  })

  it('sortie inattendue : liste vide', async () => {
    const { enfant, p } = enfantEtProcessus()
    const promesse = p.detecter()
    enfant.emit('exit', 1)
    expect(await promesse).toEqual([])
  })
})

describe('apercu', () => {
  it('renvoie compteurs, indisponibles et extensions', async () => {
    const { enfant, p } = enfantEtProcessus()
    const promesse = p.apercu(profil, ['favoris'], 92)
    expect(enfant.recus).toEqual([{ type: 'apercu', profil, elements: ['favoris'], depuisJours: 92 }])
    enfant.dire({ type: 'apercu', compteurs: { favoris: { favoris: 2, dossiers: 1 } }, indisponibles: {} })
    enfant.dire({ type: 'fin' })
    expect(await promesse).toEqual({ compteurs: { favoris: { favoris: 2, dossiers: 1 } }, indisponibles: {} })
    expect(enfant.tue).toBe(true)
  })

  it('sortie inattendue : tous les éléments indisponibles (annule)', async () => {
    const { enfant, p } = enfantEtProcessus()
    const promesse = p.apercu(profil, ['favoris', 'onglets'], 92)
    enfant.emit('exit', 1)
    const r = await promesse
    expect(r.compteurs).toEqual({})
    expect(Object.keys(r.indisponibles)).toEqual(['favoris', 'onglets'])
    expect(r.indisponibles.favoris).toEqual({ indisponible: true, raison: "Le lecteur s'est arrêté", code: 'annule' })
  })
})

describe('lire', () => {
  it('relaie progression, lots et éléments puis tue l’enfant', async () => {
    const { enfant, p } = enfantEtProcessus()
    const prog: unknown[] = []
    const lots: Visite[][] = []
    const els: Array<[string, unknown]> = []
    const promesse = p.lire(profil, { depuisJours: 92 }, ['favoris', 'historique'], {
      surProgression: (x) => prog.push(x),
      surLot: (v) => void lots.push(v),
      surElement: (e, v) => void els.push([e, v])
    })
    expect(enfant.recus).toEqual([{ type: 'lire', profil, params: { depuisJours: 92 }, elements: ['favoris', 'historique'] }])
    enfant.dire({ type: 'progression', element: 'favoris', fait: 0 })
    enfant.dire({ type: 'element', element: 'favoris', valeur: { barre: [], autres: [] } })
    enfant.dire({ type: 'lot', element: 'historique', visites: [{ url: 'u', titre: 't', date: 1, visites: 1 }] })
    enfant.dire({ type: 'element', element: 'historique', valeur: { pages: 1, visites: 1 } })
    enfant.dire({ type: 'fin' })
    await promesse
    expect(prog).toEqual([{ element: 'favoris', fait: 0 }])
    expect(lots).toHaveLength(1)
    expect(els.map(([e]) => e)).toEqual(['favoris', 'historique'])
    expect(enfant.tue).toBe(true)
  })

  it('le moteur par défaut de Firefox est transmis', async () => {
    const { enfant, p } = enfantEtProcessus()
    let recu: unknown
    const promesse = p.lire(profil, {}, ['moteurs'], { surMoteurParDefautFirefox: (v) => (recu = v) })
    enfant.dire({ type: 'moteurParDefautFirefox', valeur: { id: 'ddg', integre: true } })
    enfant.dire({ type: 'fin' })
    await promesse
    expect(recu).toEqual({ id: 'ddg', integre: true })
  })

  it('sortie inattendue : éléments restants Indisponible annule, jamais d’exception', async () => {
    const { enfant, p } = enfantEtProcessus()
    const els: Array<[string, unknown]> = []
    const promesse = p.lire(profil, {}, ['favoris', 'onglets', 'reglages'], { surElement: (e, v) => void els.push([e, v]) })
    enfant.dire({ type: 'element', element: 'favoris', valeur: { barre: [], autres: [] } })
    enfant.emit('exit', 139)
    await promesse
    const arret = { indisponible: true, raison: "Le lecteur s'est arrêté", code: 'annule' }
    expect(els).toEqual([
      ['favoris', { barre: [], autres: [] }],
      ['onglets', arret],
      ['reglages', arret]
    ])
  })

  it('abandon : « annuler » est envoyé, l’enfant est tué si le fin ne vient pas', async () => {
    const { enfant, p } = enfantEtProcessus()
    const ctl = new AbortController()
    const els: Array<[string, unknown]> = []
    const promesse = p.lire(profil, {}, ['favoris', 'historique'], { signal: ctl.signal, surElement: (e, v) => void els.push([e, v]), delaiAbandon: 5 })
    ctl.abort()
    expect(enfant.recus.at(-1)).toEqual({ type: 'annuler' })
    await promesse
    expect(enfant.tue).toBe(true)
    expect(els.map(([, v]) => (v as { code: string }).code)).toEqual(['annule', 'annule'])
  })

  it('abandon : le lecteur répond proprement avant le délai, pas de double résultat', async () => {
    const { enfant, p } = enfantEtProcessus()
    const ctl = new AbortController()
    const els: Array<[string, unknown]> = []
    const promesse = p.lire(profil, {}, ['favoris'], { signal: ctl.signal, surElement: (e, v) => void els.push([e, v]), delaiAbandon: 10_000 })
    ctl.abort()
    enfant.dire({ type: 'element', element: 'favoris', valeur: { indisponible: true, raison: 'Lecture annulée.', code: 'annule' } })
    enfant.dire({ type: 'fin' })
    await promesse
    expect(els).toHaveLength(1)
    expect(enfant.tue).toBe(true)
  })

  it('signal déjà abandonné : aucun processus lancé, éléments annulés', async () => {
    const { forks, p } = enfantEtProcessus()
    const ctl = new AbortController()
    ctl.abort()
    const els: string[] = []
    await p.lire(profil, {}, ['favoris'], { signal: ctl.signal, surElement: (e) => void els.push(e) })
    expect(forks).toEqual([])
    expect(els).toEqual(['favoris'])
  })
})

describe('surLot asynchrone', () => {
  const lot = (i: number): MessageDuLecteur => ({ type: 'lot', element: 'historique', visites: [{ url: `u${i}`, titre: 't', date: 1, visites: 1 }] })
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

  it('« suite » n’est envoyé qu’une fois surLot résolu, dans l’ordre', async () => {
    const { enfant, p } = enfantEtProcessus()
    let liberer!: () => void
    const promesse = p.lire(profil, {}, ['historique'], { surLot: () => new Promise<void>((r) => (liberer = r)) })
    enfant.dire(lot(1))
    await tick()
    expect(enfant.recus.filter((m) => m.type === 'suite')).toHaveLength(0)
    liberer()
    await tick()
    expect(enfant.recus.filter((m) => m.type === 'suite')).toHaveLength(1)
    enfant.dire({ type: 'fin' })
    await promesse
  })

  it('rejet de surLot : lecture arrêtée, éléments restants Indisponible avec la raison, rien de non géré', async () => {
    const { enfant, p } = enfantEtProcessus()
    const els: Array<[string, unknown]> = []
    const promesse = p.lire(profil, {}, ['historique', 'favoris'], {
      surLot: async () => {
        throw new Error('disque plein')
      },
      surElement: (e, v) => void els.push([e, v])
    })
    enfant.dire(lot(1))
    enfant.dire(lot(2))
    await promesse
    expect(enfant.tue).toBe(true)
    expect(enfant.recus.filter((m) => m.type === 'suite')).toHaveLength(0)
    expect(els.map(([e]) => e)).toEqual(['historique', 'favoris'])
    expect((els[0][1] as { raison: string }).raison).toContain('disque plein')
  })

  it('surLot synchrone qui lève : même arrêt propre', async () => {
    const { enfant, p } = enfantEtProcessus()
    const els: string[] = []
    const promesse = p.lire(profil, {}, ['historique'], {
      surLot: () => {
        throw new Error('x')
      },
      surElement: (e) => void els.push(e)
    })
    enfant.dire(lot(1))
    await promesse
    expect(els).toEqual(['historique'])
  })
})

describe('worker.ts', () => {
  it('n’importe pas Electron', () => {
    const source = readFileSync(fileURLToPath(new URL('./worker.ts', import.meta.url)), 'utf8')
    expect(source).not.toMatch(/from ['"]electron['"]|require\(['"]electron['"]\)|import\(['"]electron['"]\)/)
  })
})

describe('envLecteur', () => {
  const env = { LYRA_TEST: '1', LYRA_IMPORT_RACINE: '/tmp/x', PATH: '/usr/bin' }
  it('application empaquetée : ni LYRA_TEST ni LYRA_IMPORT_RACINE', () => {
    expect(envLecteur(env, true)).toEqual({ PATH: '/usr/bin' })
  })
  it('non empaquetée : environnement inchangé (e2e)', () => {
    expect(envLecteur(env, false)).toEqual(env)
  })
})

describe('chien de garde du lecteur', () => {
  afterEach(() => vi.useRealTimers())
  const delais = { inactiviteMs: 1000, detecterMs: 500, apercuMs: 800 }
  const avecDelais = (): { enfant: FauxEnfant; p: ReturnType<typeof creerProcessus> } => {
    const enfant = new FauxEnfant()
    return { enfant, p: creerProcessus(() => enfant, delais) }
  }

  it('valeurs par défaut : 2 min d’inactivité, 60 s pour détecter et pour l’aperçu', () => {
    expect(DELAIS_PAR_DEFAUT).toEqual({ inactiviteMs: 120_000, detecterMs: 60_000, apercuMs: 60_000 })
  })

  it('lire : aucun message pendant le délai, l’enfant est tué et les éléments restants sont Indisponible', async () => {
    vi.useFakeTimers()
    const { enfant, p } = avecDelais()
    const els: Array<[string, unknown]> = []
    const promesse = p.lire(profil, {}, ['favoris', 'historique', 'onglets'], { surElement: (e, v) => void els.push([e, v]) })
    enfant.dire({ type: 'element', element: 'favoris', valeur: { barre: [], autres: [] } })
    await vi.advanceTimersByTimeAsync(999)
    expect(enfant.tue).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    await promesse
    expect(enfant.tue).toBe(true)
    expect(els.map(([e]) => e)).toEqual(['favoris', 'historique', 'onglets'])
    const raison = (els[1]![1] as { indisponible: boolean; raison: string; code?: string })
    expect(raison.indisponible).toBe(true)
    expect(raison.raison).toMatch(/ne répond plus/)
    expect(raison.code).toBe('annule')
  })

  it('lire : chaque message relance le délai', async () => {
    vi.useFakeTimers()
    const { enfant, p } = avecDelais()
    const promesse = p.lire(profil, {}, ['favoris'], {})
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(900)
      enfant.dire({ type: 'progression', element: 'favoris', fait: i })
    }
    expect(enfant.tue).toBe(false)
    enfant.dire({ type: 'element', element: 'favoris', valeur: { barre: [], autres: [] } })
    enfant.dire({ type: 'fin' })
    await promesse
  })

  it('lire : pas de décompte pendant que le main applique un lot (contre-pression)', async () => {
    vi.useFakeTimers()
    const { enfant, p } = avecDelais()
    let finLot: () => void = () => undefined
    const promesse = p.lire(profil, {}, ['historique'], { surLot: () => new Promise<void>((ok) => (finLot = ok)) })
    enfant.dire({ type: 'lot', element: 'historique', visites: [] })
    await vi.advanceTimersByTimeAsync(5000)
    expect(enfant.tue).toBe(false)
    finLot()
    await vi.advanceTimersByTimeAsync(500)
    enfant.dire({ type: 'element', element: 'historique', valeur: { pages: 0, visites: 0 } })
    enfant.dire({ type: 'fin' })
    await promesse
    expect(enfant.tue).toBe(true)
  })

  it('detecter : délai global dépassé, erreur lisible et enfant tué', async () => {
    vi.useFakeTimers()
    const { enfant, p } = avecDelais()
    const promesse = p.detecter()
    const attendu = expect(promesse).rejects.toThrow(/détection.*trop longtemps/i)
    await vi.advanceTimersByTimeAsync(501)
    await attendu
    expect(enfant.tue).toBe(true)
  })

  it('apercu : délai global dépassé (même avec des messages), erreur lisible', async () => {
    vi.useFakeTimers()
    const { enfant, p } = avecDelais()
    const promesse = p.apercu(profil, ['favoris'], 92)
    const attendu = expect(promesse).rejects.toThrow(/aperçu.*trop longtemps/i)
    await vi.advanceTimersByTimeAsync(700)
    enfant.dire({ type: 'progression', element: 'favoris', fait: 1 } as MessageDuLecteur)
    await vi.advanceTimersByTimeAsync(101)
    await attendu
    expect(enfant.tue).toBe(true)
  })

  it('lire : après « annuler », le délai d’abandon tranche (« Lecture annulée. »), jamais l’inactivité', async () => {
    vi.useFakeTimers()
    const { enfant, p } = avecDelais()
    const ctl = new AbortController()
    const els: Array<[string, unknown]> = []
    const promesse = p.lire(profil, {}, ['favoris', 'historique'], { signal: ctl.signal, delaiAbandon: 3000, surElement: (e, v) => void els.push([e, v]) })
    await vi.advanceTimersByTimeAsync(900)
    ctl.abort()
    // Un message tardif ne relance pas le décompte d'inactivité.
    enfant.dire({ type: 'progression', element: 'favoris', fait: 1 })
    await vi.advanceTimersByTimeAsync(2000)
    expect(enfant.tue).toBe(false)
    await vi.advanceTimersByTimeAsync(1001)
    await promesse
    expect(enfant.tue).toBe(true)
    expect(els.map(([, v]) => (v as { raison: string }).raison)).toEqual(['Lecture annulée.', 'Lecture annulée.'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('detecter : profils reçus juste avant l’expiration (fin pas encore arrivée), ils sont rendus', async () => {
    vi.useFakeTimers()
    const { enfant, p } = avecDelais()
    const promesse = p.detecter()
    enfant.dire({ type: 'profils', profils: [profil] })
    await vi.advanceTimersByTimeAsync(501)
    expect(await promesse).toEqual([profil])
    expect(enfant.tue).toBe(true)
  })

  it('detecter et apercu : réponse dans le délai, minuterie annulée', async () => {
    vi.useFakeTimers()
    const { enfant, p } = avecDelais()
    const promesse = p.detecter()
    enfant.dire({ type: 'profils', profils: [profil] })
    enfant.dire({ type: 'fin' })
    expect(await promesse).toEqual([profil])
    expect(vi.getTimerCount()).toBe(0)
  })
})
