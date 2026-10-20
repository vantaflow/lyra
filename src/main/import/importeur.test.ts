import { describe, expect, it } from 'vitest'
import type { ProgressionImport } from '../../shared/ipc'
import type { CiblesImport } from './appliquer'
import { Importeur, estPageReglages } from './importeur'
import type { Processus } from './processus'
import type { OptionsApplication, ProfilDetecte, ResultatImport } from './types'

const PROFIL: ProfilDetecte = { navigateur: 'chrome', nom: 'Khalil', chemin: '/x/Default', racine: '/x', parDefaut: true }
const OPTIONS: OptionsApplication = { fenetre: 'courante', ouvrirMaintenant: false, moteurParDefaut: false, extensionsChoisies: [] }
const cibles = (): CiblesImport => ({
  favoris: { ajouterLot: (i) => ({ ajoutes: i.length, presents: 0 }) },
  historique: { importer: (l) => ({ ajoutees: l.length, presentes: 0 }), attendre: async () => undefined, compacterSiNecessaire: () => false },
  ciel: { constellations: () => [], creerConstellation: (o) => ({ id: 'c', ...o }), ouvrirEndormie: () => 'e', sauver: () => undefined },
  reglages: { get: () => ({}) as never, set: () => undefined }
})

/** Lecteur qui ne rend la main qu'à l'ordre : permet de garder un import « en cours ». */
function processusBloque(): { p: Processus; liberer: () => void; signaux: AbortSignal[] } {
  let liberer!: () => void
  const signaux: AbortSignal[] = []
  const p: Processus = {
    detecter: async () => [PROFIL],
    apercu: async () => ({ compteurs: {}, indisponibles: {} }),
    lire: (_p, _q, elements, opts) =>
      new Promise<void>((ok) => {
        if (opts?.signal) signaux.push(opts.signal)
        const fin = (): void => {
          for (const e of elements) opts?.surElement?.(e, e === 'historique' ? { pages: 0, visites: 0 } : e === 'favoris' ? { barre: [], autres: [] } : undefined)
          ok()
        }
        liberer = fin
        opts?.signal?.addEventListener('abort', fin)
      })
  }
  return { p, liberer: () => liberer(), signaux }
}

function sortie() {
  const termines: Array<{ id: string; resultat: ResultatImport }> = []
  const progressions: ProgressionImport[] = []
  return { termines, progressions, s: { progression: (p: ProgressionImport) => void progressions.push(p), termine: (id: string, resultat: ResultatImport) => void termines.push({ id, resultat }) } }
}
const attendre = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5))
}

describe('estPageReglages', () => {
  it('seulement lyra://settings', () => {
    for (const u of ['lyra://settings', 'lyra://settings/', 'lyra://settings?x=1', 'lyra://settings#import']) expect(estPageReglages(u)).toBe(true)
    for (const u of ['lyra://settings.evil', 'lyra://newtab', 'lyra://history', 'https://settings', 'file:///ui.html', '']) expect(estPageReglages(u)).toBe(false)
  })
})

describe('Importeur', () => {
  it('un seul import à la fois : le second est refusé tant que le premier tourne, puis accepté', async () => {
    const { p, liberer } = processusBloque()
    const imp = new Importeur(p)
    const o = sortie()
    const demande = { profil: PROFIL, elements: ['favoris' as const], depuisJours: 92, options: OPTIONS }
    const a = await imp.lancer(demande, cibles, o.s)
    expect('id' in a).toBe(true)
    expect(await imp.lancer(demande, cibles, o.s)).toEqual({ erreur: 'en-cours' })
    liberer()
    await attendre(() => o.termines.length === 1)
    expect(o.termines[0].resultat.favoris.etat).toBe('ok')
    expect('id' in (await imp.lancer(demande, cibles, o.s))).toBe(true)
  })

  it('import:annuler abandonne lecture et application, et un id inconnu est sans effet', async () => {
    const { p, signaux } = processusBloque()
    const imp = new Importeur(p)
    const o = sortie()
    const r = await imp.lancer({ profil: PROFIL, elements: ['favoris', 'historique'], depuisJours: null, options: OPTIONS }, cibles, o.s)
    if (!('id' in r)) throw new Error('refusé')
    imp.annuler('inconnu')
    expect(signaux[0].aborted).toBe(false)
    imp.annuler(r.id)
    expect(signaux[0].aborted).toBe(true)
    await attendre(() => o.termines.length === 1)
    expect(o.termines[0].id).toBe(r.id)
  })

  it('demande invalide ou profil jamais détecté : refusée sans rien lancer', async () => {
    const { p } = processusBloque()
    const imp = new Importeur(p)
    const o = sortie()
    expect(await imp.lancer({ profil: PROFIL, elements: ['bidon' as never], depuisJours: 92, options: OPTIONS }, cibles, o.s)).toEqual({ erreur: 'invalide' })
    expect(await imp.lancer({ profil: PROFIL, elements: ['favoris'], depuisJours: -3, options: OPTIONS }, cibles, o.s)).toEqual({ erreur: 'invalide' })
    expect(await imp.lancer({ profil: { ...PROFIL, chemin: '/etc' }, elements: ['favoris'], depuisJours: 92, options: OPTIONS }, cibles, o.s)).toEqual({ erreur: 'invalide' })
    await expect(imp.apercu({ profil: { ...PROFIL, chemin: '/etc' }, elements: ['favoris'], depuisJours: 92 })).rejects.toThrow()
    // l'échec n'a pas laissé un import « en cours »
    expect('id' in (await imp.lancer({ profil: PROFIL, elements: ['favoris'], depuisJours: 92, options: OPTIONS }, cibles, o.s))).toBe(true)
  })

  it('une sortie qui échoue (page fermée) ne casse jamais l’import', async () => {
    const { p, liberer } = processusBloque()
    const imp = new Importeur(p)
    let termine = false
    await imp.lancer({ profil: PROFIL, elements: ['favoris'], depuisJours: 92, options: OPTIONS }, cibles, {
      progression: () => {
        throw new Error('détruit')
      },
      termine: () => {
        termine = true
        throw new Error('détruit')
      }
    })
    liberer()
    await attendre(() => termine)
    expect(termine).toBe(true)
    expect('id' in (await imp.lancer({ profil: PROFIL, elements: ['favoris'], depuisJours: 92, options: OPTIONS }, cibles, sortie().s))).toBe(true)
  })
})
