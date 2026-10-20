/**
 * Lecture + application d'un import (jalon E, 3.5), sans Electron : relie le lecteur (`Processus`) à `appliquer`.
 *
 * Interblocage évité : le lecteur lit les éléments dans l'ordre reçu et, pour l'historique, attend l'acquittement du
 * main après chaque lot (2 en vol au plus) ; `appliquer` applique l'historique en DERNIER. On demande donc l'historique
 * en dernier au lecteur, on démarre `appliquer` dès que tous les autres éléments sont arrivés, et on relie `surLot`
 * (push, résolu quand `appliquer` a fini d'appliquer le lot) au flux `AsyncIterable<Visite[]>` qu'il consomme (pull).
 */
import { appliquer, type EntreeImport, type CiblesImport, type Progression as ProgressionEcriture } from './appliquer'
import type { ParametresLecture, Progression as ProgressionLecture } from './chromium'
import type { MoteurParDefautFirefox } from './firefox'
import type { Processus } from './processus'
import { estIndisponible, type ElementImport, type Indisponible, type OptionsApplication, type ProfilDetecte, type ResultatImport, type Visite } from './types'

interface EnAttente {
  lot: Visite[]
  acquitter: () => void
}

/**
 * File de lots entre un producteur (`pousser`, résolu une fois le lot appliqué) et un consommateur (`for await`).
 * Le lot en cours est acquitté quand le consommateur redemande (il a fini) ou se retire (`return`, ex. abandon).
 */
export class FileLots implements AsyncIterable<Visite[]> {
  private tampon: EnAttente[] = []
  private enCours: (() => void) | undefined
  private reveil: (() => void) | undefined
  private ferme = false
  private erreur: unknown
  private parti = false

  pousser(lot: Visite[]): Promise<void> {
    if (this.parti || this.ferme) return Promise.resolve()
    return new Promise((acquitter) => {
      this.tampon.push({ lot, acquitter })
      this.reveil?.()
    })
  }

  /** Fin du flux (les lots déjà poussés restent lisibles). */
  fermer(): void {
    this.ferme = true
    this.reveil?.()
  }

  /** Fin du flux en échec : le consommateur reçoit l'erreur après les lots déjà poussés. */
  echouer(erreur: unknown): void {
    this.erreur = erreur ?? new Error('lecture interrompue')
    this.fermer()
  }

  private retirer(): void {
    this.parti = true
    this.enCours?.()
    this.enCours = undefined
    for (const e of this.tampon.splice(0)) e.acquitter()
  }

  [Symbol.asyncIterator](): AsyncIterator<Visite[]> {
    return {
      next: async () => {
        this.enCours?.()
        this.enCours = undefined
        for (;;) {
          const suivant = this.tampon.shift()
          if (suivant) {
            this.enCours = suivant.acquitter
            return { value: suivant.lot, done: false }
          }
          if (this.ferme) {
            if (this.erreur !== undefined) {
              const e = this.erreur
              this.erreur = undefined
              throw e
            }
            return { value: undefined, done: true }
          }
          await new Promise<void>((r) => (this.reveil = r))
        }
      },
      return: async () => {
        this.retirer()
        return { value: undefined, done: true }
      }
    }
  }
}

export interface ArgumentsImport {
  processus: Processus
  profil: ProfilDetecte
  params: ParametresLecture
  elements: readonly ElementImport[]
  cibles: CiblesImport
  options: OptionsApplication
  surProgression?: (p: (ProgressionLecture & { phase: 'lecture' }) | ProgressionEcriture) => void
  signal?: AbortSignal
}

const erreurDe = (i: Indisponible): Error => Object.assign(new Error(i.raison), { raison: i.raison, ...(i.code ? { code: i.code } : {}) })

export async function lireEtAppliquer(a: ArgumentsImport): Promise<ResultatImport> {
  const sansHistorique = a.elements.filter((e) => e !== 'historique')
  const avecHistorique = a.elements.includes('historique')
  const ordre: ElementImport[] = avecHistorique ? [...sansHistorique, 'historique'] : [...sansHistorique]

  const donnees: EntreeImport['donnees'] = {}
  const attendus = new Set<ElementImport>(sansHistorique)
  let defautFirefox: MoteurParDefautFirefox | undefined
  // Firefox envoie le moteur par défaut après l'élément `moteurs` : `appliquer` l'attend aussi.
  let attendDefaut = a.profil.navigateur === 'firefox' && sansHistorique.includes('moteurs')
  const file = avecHistorique ? new FileLots() : undefined
  if (file) donnees.historique = file

  let demarrer!: () => void
  const pret = new Promise<void>((r) => (demarrer = r))
  const verifier = (): void => {
    if (attendus.size === 0 && !attendDefaut) demarrer()
  }

  const tentative = (f: () => void): void => {
    try {
      f()
    } catch {
      // une page fermée ne doit jamais casser l'import
    }
  }

  const application = pret.then(() =>
    appliquer(
      { source: a.profil.navigateur, profil: a.profil.nom, donnees, ...(defautFirefox ? { moteurParDefautFirefox: defautFirefox } : {}) },
      a.cibles,
      a.options,
      (p) => tentative(() => a.surProgression?.(p)),
      a.signal
    ).finally(() => {
      // Historique sauté (abandon) ou application terminée : le lot en vol est acquitté, le lecteur s'arrête à l'instant.
      void file?.[Symbol.asyncIterator]().return?.()
    })
  )

  const lecture = a.processus.lire(a.profil, a.params, ordre, {
    signal: a.signal,
    surProgression: (p) => tentative(() => a.surProgression?.({ ...p, phase: 'lecture' })),
    surLot: (visites) => file?.pousser(visites),
    surMoteurParDefautFirefox: (v) => {
      if (v && !estIndisponible(v)) defautFirefox = v
      attendDefaut = false
      verifier()
    },
    surElement: (element, valeur) => {
      if (element === 'historique') {
        if (valeur && estIndisponible(valeur as Indisponible)) file?.echouer(erreurDe(valeur as Indisponible))
        else file?.fermer()
        return
      }
      ;(donnees as Record<string, unknown>)[element] = valeur
      attendus.delete(element)
      verifier()
    }
  })

  // Tout ce qui n'est pas arrivé (lecteur arrêté) est déjà signalé `Indisponible` par `lire` ; on débloque dans tous les cas.
  void lecture.then(() => {
    file?.fermer()
    attendDefaut = false
    demarrer()
  })
  verifier()

  const [resultat] = await Promise.all([application, lecture])
  return resultat
}
