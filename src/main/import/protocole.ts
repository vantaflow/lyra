/**
 * Protocole de messages entre le main et le lecteur d'import (jalon E, 3.4). Aucune dépendance à Electron ni à un
 * processus : le lecteur ne connaît qu'un `Port` (`postMessage` + `on('message')`), ce qui le rend testable avec un
 * faux port. `worker.ts` le branche sur `process.parentPort`, `processus.ts` sur un `utilityProcess`.
 */
import { lireProfilChromium, parcourirHistoriqueChromium } from './chromium'
import type { OptionsLecture, ParametresLecture, Progression, ResultatLecture } from './chromium'
import { detecterProfils } from './detection'
import { lireMoteurParDefautFirefox, lireProfilFirefox, parcourirHistoriqueFirefox } from './firefox'
import type { MoteurParDefautFirefox } from './firefox'
import { lireProfilOrion } from './orion'
import { lireProfilSafari } from './safari'
import { ErreurImport, estIndisponible, indisponible } from './types'
import type { Compteurs, ElementImport, ExtensionImportee, Indisponible, ProfilDetecte, Visite } from './types'
import { messageLisible } from '../../shared/messageTechnique'

/** Taille des lots d'historique envoyés au main. */
export const TAILLE_LOT = 2000

/** Lots d'historique en vol (envoyés, non encore acquittés par `suite`) : contre-pression vers le main. */
export const LOTS_EN_VOL = 2

export interface ResumeHistorique {
  pages: number
  visites: number
}

export type MessageVersLecteur =
  | { type: 'detecter' }
  | { type: 'apercu'; profil: ProfilDetecte; elements: readonly ElementImport[]; depuisJours?: number | null }
  | { type: 'lire'; profil: ProfilDetecte; params: ParametresLecture; elements: readonly ElementImport[] }
  | { type: 'annuler' }
  /** Accusé du main : un lot d'historique est appliqué, le suivant peut partir. */
  | { type: 'suite' }

/** Valeur d'un élément lu : l'historique n'est jamais renvoyé en entier (voir `lot`), seulement son résumé. */
export type MessageDuLecteur =
  | { type: 'progression'; element: ElementImport; fait: number }
  | { type: 'lot'; element: 'historique'; visites: Visite[] }
  | { type: 'element'; element: ElementImport; valeur: unknown }
  | { type: 'moteurParDefautFirefox'; valeur: MoteurParDefautFirefox | undefined | Indisponible }
  | { type: 'profils'; profils: ProfilDetecte[] }
  | { type: 'apercu'; compteurs: Compteurs; indisponibles: Partial<Record<ElementImport, Indisponible>>; extensions?: ExtensionImportee[] }
  | { type: 'fin' }

/** Ce que `process.parentPort` (worker) ou un faux port (tests) offre. */
export interface Port {
  postMessage(message: MessageDuLecteur): void
  on(evenement: 'message', ecouteur: (e: { data: unknown }) => void): void
}

export interface Lecteurs {
  detecter(): Promise<ProfilDetecte[]>
  lireProfil(profil: ProfilDetecte, opts: OptionsLecture): Promise<ResultatLecture>
  /** Chromium et Firefox seulement (flux) ; les autres navigateurs donnent l'historique d'un bloc dans `lireProfil`. */
  parcourirHistorique(profil: ProfilDetecte, opts: Omit<OptionsLecture, 'elements'>, surLot: (lot: Visite[]) => void | Promise<void>): Promise<ResumeHistorique | Indisponible>
  moteurParDefautFirefox(profil: ProfilDetecte, opts: Omit<OptionsLecture, 'elements'>): Promise<MoteurParDefautFirefox | undefined | Indisponible>
}

const enFlux = (p: ProfilDetecte): boolean => p.navigateur !== 'safari' && p.navigateur !== 'orion'

export const LECTEURS_REELS: Lecteurs = {
  detecter: () => detecterProfils(),
  lireProfil: (profil, opts) => {
    switch (profil.navigateur) {
      case 'firefox':
        return lireProfilFirefox(profil, opts)
      case 'safari':
        return lireProfilSafari(profil, opts)
      case 'orion':
        return lireProfilOrion(profil, opts)
      default:
        return lireProfilChromium(profil, opts)
    }
  },
  parcourirHistorique: (profil, opts, surLot) =>
    profil.navigateur === 'firefox' ? parcourirHistoriqueFirefox(profil, opts, surLot) : parcourirHistoriqueChromium(profil, opts, surLot),
  moteurParDefautFirefox: lireMoteurParDefautFirefox
}

/** `ErreurImport` ne traverse pas `postMessage` : toute erreur devient un `Indisponible` lisible. */
export function versIndisponible(e: unknown): Indisponible {
  if (e instanceof ErreurImport) return indisponible(e.raison, e.code)
  return indisponible(`Lecture impossible : ${messageLisible(e, 'fichier illisible ou d’un format inattendu')}.`)
}

const annule = (): Indisponible => indisponible('Lecture annulée.', 'annule')

export interface LecteurImport {
  /** Traite un message (appelé par le port ; exposé pour les tests). */
  traiter(message: MessageVersLecteur): Promise<void>
  /** Résolu quand le dernier message reçu par le port est entièrement traité. */
  fini(): Promise<void>
}

export function creerLecteur(port: Port, lecteurs: Lecteurs = LECTEURS_REELS): LecteurImport {
  const abandon = new AbortController()
  const envoyer = (m: MessageDuLecteur): void => port.postMessage(m)
  let enVol = 0
  let reveil: (() => void) | undefined
  abandon.signal.addEventListener('abort', () => reveil?.())
  /** Envoie un lot puis attend, si besoin, qu'il reste moins de `LOTS_EN_VOL` lots non acquittés (ou l'abandon). */
  async function envoyerLot(visites: Visite[]): Promise<void> {
    if (abandon.signal.aborted) return // le main n'attend plus rien
    envoyer({ type: 'lot', element: 'historique', visites })
    enVol++
    while (enVol >= LOTS_EN_VOL && !abandon.signal.aborted) await new Promise<void>((r) => (reveil = r))
  }
  const surProgression = (p: Progression): void => envoyer({ type: 'progression', element: p.element, fait: p.fait })

  const optionsDe = (params: ParametresLecture, extra: Partial<OptionsLecture> = {}): OptionsLecture => ({
    ...params,
    tailleLot: params.tailleLot ?? TAILLE_LOT,
    signal: abandon.signal,
    ...extra
  })

  /** Lit tout sauf l'historique en flux ; renvoie les données (jamais d'exception). */
  async function lireHorsFlux(profil: ProfilDetecte, params: ParametresLecture, elements: readonly ElementImport[], progression?: (p: Progression) => void): Promise<ResultatLecture> {
    try {
      return await lecteurs.lireProfil(profil, optionsDe(params, { elements, surProgression: progression }))
    } catch (e) {
      const donnees = Object.fromEntries(elements.map((el) => [el, versIndisponible(e)]))
      return { donnees, compteurs: {} }
    }
  }

  async function lire(m: Extract<MessageVersLecteur, { type: 'lire' }>): Promise<void> {
    const { profil, params, elements } = m
    const flux = enFlux(profil)
    const lus = flux ? elements.filter((e) => e !== 'historique') : elements
    const { donnees } = lus.length > 0 ? await lireHorsFlux(profil, params, lus, surProgression) : { donnees: {} as ResultatLecture['donnees'] }

    for (const element of lus) {
      if (element === 'historique') continue
      envoyer({ type: 'element', element, valeur: donnees[element] ?? indisponible('Élément non lu.') })
    }
    if (profil.navigateur === 'firefox' && elements.includes('moteurs')) {
      const valeur = await lecteurs.moteurParDefautFirefox(profil, optionsDe(params)).catch((e: unknown) => versIndisponible(e))
      envoyer({ type: 'moteurParDefautFirefox', valeur })
    }

    if (elements.includes('historique')) {
      let valeur: ResumeHistorique | Indisponible
      if (abandon.signal.aborted) valeur = annule()
      else if (flux) {
        valeur = await lecteurs
          .parcourirHistorique(profil, optionsDe(params, { surProgression }), envoyerLot)
          .catch((e: unknown) => versIndisponible(e))
      } else {
        const h = donnees.historique
        if (!h || estIndisponible(h)) valeur = h ?? indisponible('Élément non lu.')
        else {
          const taille = params.tailleLot ?? TAILLE_LOT
          for (let i = 0; i < h.length && !abandon.signal.aborted; i += taille) await envoyerLot(h.slice(i, i + taille))
          valeur = { pages: h.length, visites: h.reduce((s, v) => s + v.visites, 0) }
        }
      }
      envoyer({ type: 'element', element: 'historique', valeur })
    }
  }

  async function apercu(m: Extract<MessageVersLecteur, { type: 'apercu' }>): Promise<void> {
    const { profil, elements } = m
    const params: ParametresLecture = { depuisJours: m.depuisJours }
    const flux = enFlux(profil)
    const lus = flux ? elements.filter((e) => e !== 'historique') : elements
    const { donnees, compteurs } = lus.length > 0 ? await lireHorsFlux(profil, params, lus) : { donnees: {} as ResultatLecture['donnees'], compteurs: {} as Compteurs }

    const indisponibles: Partial<Record<ElementImport, Indisponible>> = {}
    for (const e of lus) {
      const v = donnees[e]
      if (v !== undefined && estIndisponible(v)) indisponibles[e] = v
    }
    // Safari et Orion donnent l'historique d'un bloc : on le compte puis on le lâche.
    if (!flux && donnees.historique && !estIndisponible(donnees.historique)) compteurs.historique = { pages: donnees.historique.length, visites: donnees.historique.reduce((s, v) => s + v.visites, 0) }

    if (flux && elements.includes('historique')) {
      const resume = abandon.signal.aborted
        ? annule()
        : await lecteurs.parcourirHistorique(profil, optionsDe(params), () => undefined).catch((e: unknown) => versIndisponible(e))
      if (estIndisponible(resume)) indisponibles.historique = resume
      else compteurs.historique = { pages: resume.pages, visites: resume.visites }
    }

    const message: MessageDuLecteur = { type: 'apercu', compteurs, indisponibles }
    const ext = donnees.extensions
    if (ext && !estIndisponible(ext)) message.extensions = ext
    envoyer(message)
  }

  async function traiter(m: MessageVersLecteur): Promise<void> {
    try {
      switch (m?.type) {
        case 'annuler':
          abandon.abort()
          return
        case 'suite':
          enVol = Math.max(0, enVol - 1)
          reveil?.()
          return
        case 'detecter':
          envoyer({ type: 'profils', profils: await lecteurs.detecter().catch(() => []) })
          break
        case 'lire':
          await lire(m)
          break
        case 'apercu':
          await apercu(m)
          break
        default:
          return // message inconnu : ignoré, sans `fin`
      }
    } catch {
      // Les lectures ne lèvent pas ; un échec d'envoi ne doit pas empêcher la fin.
    }
    envoyer({ type: 'fin' })
  }

  let derniere: Promise<void> = Promise.resolve()
  port.on('message', (e) => {
    const m = e.data as MessageVersLecteur
    const t = traiter(m)
    if (m?.type === 'detecter' || m?.type === 'lire' || m?.type === 'apercu') derniere = t
  })

  return { traiter, fini: () => derniere }
}
