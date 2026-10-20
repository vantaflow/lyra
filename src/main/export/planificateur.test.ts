import { describe, expect, it } from 'vitest'
import { GARDER, Planificateur, aSupprimer, derniereEcheance, nomSauvegarde, prochaineEcheance, type Horloge } from './planificateur'

const local = (a: number, m: number, j: number, h = 0, min = 0, s = 0): number => new Date(a, m - 1, j, h, min, s).getTime()
const HEURE = 3_600_000

/** Horloge manuelle : `avancer` déclenche les minuteries échues, dans l'ordre. */
function horlogeFausse(debut: number): Horloge & { avancer(ms: number): Promise<void>; actives(): number; t: number } {
  let t = debut
  const timers: Array<{ at: number; fn: () => void; id: number }> = []
  let n = 0
  return {
    get t() {
      return t
    },
    maintenant: () => t,
    planifier(fn, ms) {
      const id = ++n
      timers.push({ at: t + ms, fn, id })
      return () => {
        const i = timers.findIndex((x) => x.id === id)
        if (i !== -1) timers.splice(i, 1)
      }
    },
    actives: () => timers.length,
    async avancer(ms) {
      const fin = t + ms
      for (;;) {
        timers.sort((a, b) => a.at - b.at)
        const prochain = timers[0]
        if (!prochain || prochain.at > fin) break
        timers.shift()
        t = Math.max(t, prochain.at)
        prochain.fn()
        for (let i = 0; i < 20; i++) await Promise.resolve()
      }
      t = fin
    }
  }
}

describe('échéances nocturnes', () => {
  it('dernière et prochaine échéance à 3 h, heure locale', () => {
    expect(derniereEcheance(local(2026, 1, 2, 14))).toBe(local(2026, 1, 2, 3))
    expect(derniereEcheance(local(2026, 1, 2, 1))).toBe(local(2026, 1, 1, 3))
    expect(prochaineEcheance(local(2026, 1, 2, 14))).toBe(local(2026, 1, 3, 3))
    expect(prochaineEcheance(local(2026, 1, 2, 1))).toBe(local(2026, 1, 2, 3))
    expect(prochaineEcheance(local(2026, 1, 2, 3))).toBe(local(2026, 1, 3, 3))
  })

  it('nom de fichier horodaté (heure locale) et conservation des 7 plus récents', () => {
    expect(nomSauvegarde(new Date(2026, 0, 2, 3, 4, 5))).toBe('lyra-sauvegarde-20260102-030405.lyra')
    const noms = Array.from({ length: 10 }, (_, i) => `lyra-sauvegarde-202601${String(i + 1).padStart(2, '0')}-030000.lyra`)
    expect(GARDER).toBe(7)
    expect(aSupprimer([...noms].reverse())).toEqual(noms.slice(0, 3))
    expect(aSupprimer(noms.slice(0, 7))).toEqual([])
  })

  it('ne touche jamais aux fichiers qui ne sont pas des sauvegardes de Lyra', () => {
    const noms = ['notes.txt', 'lyra-sauvegarde-20260101-030000.lyra.tmp', 'lyra-sauvegarde-abc.lyra', ...Array.from({ length: 9 }, (_, i) => `lyra-sauvegarde-2026010${i + 1}-030000.lyra`)]
    expect(aSupprimer(noms)).toEqual(['lyra-sauvegarde-20260101-030000.lyra', 'lyra-sauvegarde-20260102-030000.lyra'])
  })
})

describe('Planificateur', () => {
  function monter(debut: number, derniere?: number, echec = false) {
    const horloge = horlogeFausse(debut)
    const etat = { derniere, executions: [] as number[], enCours: 0, maxEnCours: 0 }
    const p = new Planificateur({
      horloge,
      derniere: () => etat.derniere,
      marquer: (t) => void (etat.derniere = t),
      executer: async () => {
        etat.enCours++
        etat.maxEnCours = Math.max(etat.maxEnCours, etat.enCours)
        etat.executions.push(horloge.maintenant())
        await Promise.resolve()
        etat.enCours--
        if (echec) throw new Error('disque absent')
      },
      delaiDemarrage: 60_000,
      delaiReessai: HEURE
    })
    return { horloge, etat, p }
  }

  it('au démarrage, une sauvegarde manquée est faite après le délai de démarrage (jamais tout de suite)', async () => {
    const { horloge, etat, p } = monter(local(2026, 1, 2, 14), local(2026, 1, 1, 3, 0, 5))
    p.demarrer()
    expect(etat.executions).toEqual([])
    await horloge.avancer(59_000)
    expect(etat.executions).toEqual([])
    await horloge.avancer(2_000)
    expect(etat.executions).toHaveLength(1)
    expect(etat.derniere).toBe(etat.executions[0])
  })

  it('si la nuit est déjà couverte, rien au démarrage : la suivante tourne à 3 h, puis chaque nuit une seule fois', async () => {
    const { horloge, etat, p } = monter(local(2026, 1, 2, 14), local(2026, 1, 2, 3, 0, 5))
    p.demarrer()
    await horloge.avancer(10 * HEURE) // 00 h
    expect(etat.executions).toEqual([])
    await horloge.avancer(3 * HEURE + 60_000) // 03 h 01
    expect(etat.executions).toHaveLength(1)
    expect(new Date(etat.executions[0]).getHours()).toBe(3)
    await horloge.avancer(10 * HEURE)
    expect(etat.executions).toHaveLength(1)
    await horloge.avancer(24 * HEURE)
    expect(etat.executions).toHaveLength(2)
  })

  it('jamais deux exécutions en même temps ; arrêter annule la minuterie', async () => {
    const { horloge, etat, p } = monter(local(2026, 1, 2, 14))
    p.demarrer()
    p.demarrer()
    await horloge.avancer(2 * 60_000)
    expect(etat.maxEnCours).toBe(1)
    expect(etat.executions).toHaveLength(1)
    p.arreter()
    expect(horloge.actives()).toBe(0)
    await horloge.avancer(72 * HEURE)
    expect(etat.executions).toHaveLength(1)
  })

  it('un échec est signalé et réessayé une heure plus tard, sans bloquer le reste', async () => {
    const erreurs: unknown[] = []
    const horloge = horlogeFausse(local(2026, 1, 2, 14))
    let appels = 0
    const p = new Planificateur({
      horloge,
      derniere: () => undefined,
      marquer: () => undefined,
      executer: async () => {
        appels++
        throw new Error('disque absent')
      },
      surErreur: (e) => erreurs.push(e),
      delaiDemarrage: 1000,
      delaiReessai: HEURE
    })
    p.demarrer()
    await horloge.avancer(2000)
    expect(appels).toBe(1)
    expect(erreurs).toHaveLength(1)
    await horloge.avancer(HEURE)
    expect(appels).toBe(2)
  })

  it('une machine rallumée longtemps après (veille) rattrape la nuit manquée', async () => {
    const { horloge, etat, p } = monter(local(2026, 1, 2, 14), local(2026, 1, 2, 3, 0, 5))
    p.demarrer()
    // Pas de minuterie intermédiaire échue pendant la veille : on saute 3 jours d'un coup, puis les minuteries repartent.
    await horloge.avancer(3 * 24 * HEURE)
    expect(etat.executions.length).toBeGreaterThanOrEqual(1)
    expect(etat.derniere).toBeGreaterThanOrEqual(local(2026, 1, 4, 3))
  })
})
