/**
 * Côté main : pilote le lecteur d'import dans un `utilityProcess` (jalon E, 3.4). Une instance par opération, tuée à
 * la fin ou à l'abandon. Le seul fichier du dossier à toucher Electron, et seulement pour lancer le processus ;
 * la logique du protocole se teste avec un faux `Enfant`.
 */
import { join } from 'node:path'
import type { ParametresLecture, Progression } from './chromium'
import type { MoteurParDefautFirefox } from './firefox'
import type { MessageDuLecteur, MessageVersLecteur } from './protocole'
import { indisponible } from './types'
import type { Compteurs, ElementImport, ExtensionImportee, Indisponible, ProfilDetecte, Visite } from './types'

/** Le strict nécessaire d'un processus enfant (`UtilityProcess` ou faux). */
export interface Enfant {
  postMessage(message: MessageVersLecteur): void
  kill(): boolean
  on(evenement: 'message', ecouteur: (message: MessageDuLecteur) => void): unknown
  on(evenement: 'exit', ecouteur: (code: number) => void): unknown
}

export type Fork = () => Enfant

export interface ResultatApercu {
  compteurs: Compteurs
  /** Éléments illisibles (verrou, accès refusé…), avec leur raison. */
  indisponibles: Partial<Record<ElementImport, Indisponible>>
  /** Extensions lues (aperçu détaillé), si demandées et lisibles. */
  extensions?: ExtensionImportee[]
}

export interface OptionsLectureProcessus {
  surProgression?: (p: Progression) => void
  /** Un lot de visites (2 000 au plus) ; attendu avant d'acquitter (`suite`) : le lecteur n'a jamais plus de `LOTS_EN_VOL` lots non acquittés. Un rejet arrête la lecture (éléments restants `Indisponible`). */
  surLot?: (visites: Visite[]) => void | Promise<void>
  /** Résultat d'un élément : sa valeur, ou `Indisponible` ; historique : `{ pages, visites }` (les visites sont dans les lots). */
  surElement?: (element: ElementImport, valeur: unknown) => void
  /** Firefox, avec `moteurs` : moteur par défaut déclaré par le profil. */
  surMoteurParDefautFirefox?: (valeur: MoteurParDefautFirefox | undefined | Indisponible) => void
  signal?: AbortSignal
  /** Attente (ms) d'un arrêt propre après `annuler` avant de tuer le processus (3 000 par défaut). */
  delaiAbandon?: number
}

export interface Processus {
  detecter(): Promise<ProfilDetecte[]>
  apercu(profil: ProfilDetecte, elements: readonly ElementImport[], depuisJours: number | null | undefined, opts?: { signal?: AbortSignal; delaiAbandon?: number }): Promise<ResultatApercu>
  /** Ne rejette jamais : tout ce qui n'a pas été lu est signalé `Indisponible` par `surElement`. */
  lire(profil: ProfilDetecte, params: ParametresLecture, elements: readonly ElementImport[], opts?: OptionsLectureProcessus): Promise<void>
}

export const RAISON_ARRET = "Le lecteur s'est arrêté"
const DELAI_ABANDON = 3000

type Issue = 'fin' | 'arret' | 'abandon'

interface Controle {
  /** Envoie un message au lecteur (accusé `suite`). */
  repondre(message: MessageVersLecteur): void
}

/**
 * Pilote un enfant. Les messages sont traités l'un après l'autre : `surMessage` peut être asynchrone, et son rejet
 * arrête proprement la lecture (`erreur` renvoyée, enfant tué).
 */
function piloter(
  fork: Fork,
  message: MessageVersLecteur,
  surMessage: (m: MessageDuLecteur, c: Controle) => void | Promise<void>,
  signal?: AbortSignal,
  delaiAbandon = DELAI_ABANDON
): Promise<{ issue: Issue; erreur?: unknown }> {
  if (signal?.aborted) return Promise.resolve({ issue: 'abandon' })
  return new Promise((resolve) => {
    let enfant: Enfant
    let minuteur: ReturnType<typeof setTimeout> | undefined
    let fini = false
    let file: Promise<void> = Promise.resolve()
    const terminer = (issue: Issue, erreur?: unknown): void => {
      if (fini) return
      fini = true
      if (minuteur) clearTimeout(minuteur)
      signal?.removeEventListener('abort', surAbandon)
      try {
        enfant.kill()
      } catch {
        // déjà arrêté
      }
      resolve({ issue, erreur })
    }
    const surAbandon = (): void => {
      if (fini) return
      try {
        enfant.postMessage({ type: 'annuler' })
      } catch {
        // le processus est peut-être déjà mort : le délai tranche
      }
      minuteur = setTimeout(() => terminer('abandon'), delaiAbandon)
    }
    const enfiler = (tache: () => void | Promise<void>): void => {
      file = file.then(async () => {
        if (fini) return
        try {
          await tache()
        } catch (erreur) {
          terminer('arret', erreur)
        }
      })
    }
    const controle: Controle = {
      repondre: (m) => {
        if (fini) return
        try {
          enfant.postMessage(m)
        } catch {
          // enfant mort : `exit` tranche
        }
      }
    }
    try {
      enfant = fork()
    } catch (erreur) {
      resolve({ issue: 'arret', erreur })
      return
    }
    enfant.on('message', (m) => {
      if (m.type === 'fin') enfiler(() => terminer(signal?.aborted ? 'abandon' : 'fin'))
      else enfiler(() => surMessage(m, controle))
    })
    enfant.on('exit', () => enfiler(() => terminer('arret')))
    signal?.addEventListener('abort', surAbandon, { once: true })
    enfant.postMessage(message)
  })
}

const arret = (): Indisponible => indisponible(RAISON_ARRET, 'annule')
const echec = (e: unknown): Indisponible => indisponible(`Application interrompue : ${e instanceof Error ? e.message : String(e)}`)
const abandonne = (): Indisponible => indisponible('Lecture annulée.', 'annule')

export function creerProcessus(fork: Fork): Processus {
  return {
    async detecter() {
      let profils: ProfilDetecte[] = []
      await piloter(fork, { type: 'detecter' }, (m) => {
        if (m.type === 'profils') profils = m.profils
      })
      return profils
    },

    async apercu(profil, elements, depuisJours, opts = {}) {
      let resultat: ResultatApercu | undefined
      const { issue } = await piloter(
        fork,
        { type: 'apercu', profil, elements, depuisJours },
        (m) => {
          if (m.type === 'apercu') resultat = { compteurs: m.compteurs, indisponibles: m.indisponibles, ...(m.extensions ? { extensions: m.extensions } : {}) }
        },
        opts.signal,
        opts.delaiAbandon
      )
      if (resultat) return resultat
      const raison = issue === 'arret' ? arret() : abandonne()
      return { compteurs: {}, indisponibles: Object.fromEntries(elements.map((e) => [e, raison])) }
    },

    async lire(profil, params, elements, opts = {}) {
      const vus = new Set<ElementImport>()
      const { issue, erreur } = await piloter(
        fork,
        { type: 'lire', profil, params, elements },
        async (m, c) => {
          if (m.type === 'progression') opts.surProgression?.({ element: m.element, fait: m.fait })
          else if (m.type === 'lot') {
            // Accusé seulement une fois le lot appliqué : c'est lui qui borne les lots en vol côté lecteur.
            await opts.surLot?.(m.visites)
            c.repondre({ type: 'suite' })
          }
          else if (m.type === 'moteurParDefautFirefox') opts.surMoteurParDefautFirefox?.(m.valeur)
          else if (m.type === 'element') {
            vus.add(m.element)
            opts.surElement?.(m.element, m.valeur)
          }
        },
        opts.signal,
        opts.delaiAbandon
      )
      for (const element of elements) {
        if (vus.has(element)) continue
        opts.surElement?.(element, erreur !== undefined ? echec(erreur) : issue === 'arret' ? arret() : abandonne())
      }
    }
  }
}

/**
 * Environnement du lecteur : le lecteur n'a pas `app` pour savoir s'il est empaqueté, donc, dans l'application empaquetée,
 * il ne reçoit ni `LYRA_TEST` ni `LYRA_IMPORT_RACINE` (sinon une variable du poste pourrait rediriger la lecture).
 */
export function envLecteur(env: NodeJS.ProcessEnv, empaquetee: boolean): NodeJS.ProcessEnv {
  if (!empaquetee) return env
  const { LYRA_TEST: _t, LYRA_IMPORT_RACINE: _r, ...reste } = env
  void _t
  void _r
  return reste
}

/** Lance `import-worker.js` (construit à côté de `index.js`) dans un `utilityProcess`. */
export function forkerLecteur(): Enfant {
  // `require` paresseux : ce module reste chargeable sans Electron (tests).
  const { utilityProcess, app } = require('electron') as typeof import('electron')
  return utilityProcess.fork(join(__dirname, 'import-worker.js'), [], { serviceName: 'lyra-import', stdio: 'ignore', env: envLecteur(process.env, app.isPackaged) }) as unknown as Enfant
}

/** Instance utilisée par le main (sous-tâche 3.5). */
export const processusImport: Processus = creerProcessus(forkerLecteur)
