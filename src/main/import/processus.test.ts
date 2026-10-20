/**
 * Côté main : pilotage du lecteur, testé avec un faux processus enfant (pas d'Electron).
 */
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { creerProcessus } from './processus'
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

describe('worker.ts', () => {
  it('n’importe pas Electron', () => {
    const source = readFileSync(fileURLToPath(new URL('./worker.ts', import.meta.url)), 'utf8')
    expect(source).not.toMatch(/from ['"]electron['"]|require\(['"]electron['"]\)|import\(['"]electron['"]\)/)
  })
})
