/**
 * Logique du contrat IPC `import:*` (jalon E, 3.5), sans Electron : validation des demandes, un seul import à la fois,
 * abandon, évènements. `ipc.ts` ne fait que brancher les canaux et contrôler l'expéditeur.
 */
import { randomUUID } from 'node:crypto'
import type { DemandeApercuImport, DemandeImport, ProgressionImport, ReponseApercuImport, ReponseImport } from '../../shared/ipc'
import type { CiblesImport } from './appliquer'
import { lireEtAppliquer } from './executer'
import type { Processus } from './processus'
import { ELEMENTS_IMPORT, NOMS_NAVIGATEURS, type ElementImport, type NavigateurSource, type OptionsApplication, type ProfilDetecte, type ResultatImport } from './types'
import { messageLisible } from '../../shared/messageTechnique'

export interface SortieImport {
  progression(p: ProgressionImport): void
  termine(id: string, resultat: ResultatImport): void
}

/** `lyra://settings`, avec ou sans chemin, requête ou ancre ; rien d'autre (l'hôte est exact). */
export const estPageReglages = (url: string): boolean => /^lyra:\/\/settings(?:[/?#]|$)/.test(url)

const JOURS_MAX = 36_500

const estElement = (e: unknown): e is ElementImport => typeof e === 'string' && (ELEMENTS_IMPORT as readonly string[]).includes(e)

/** Éléments dédoublonnés et connus ; `undefined` si la demande est incohérente. */
function elementsValides(e: unknown): ElementImport[] | undefined {
  if (!Array.isArray(e) || e.length === 0 || e.length > ELEMENTS_IMPORT.length || !e.every(estElement)) return undefined
  return [...new Set(e)]
}

function joursValides(j: unknown): number | null | undefined {
  if (j === null) return null
  return typeof j === 'number' && Number.isFinite(j) && j > 0 && j <= JOURS_MAX ? Math.floor(j) : undefined
}

function optionsValides(o: unknown): OptionsApplication {
  const x = (o && typeof o === 'object' ? o : {}) as Partial<OptionsApplication>
  return {
    fenetre: x.fenetre === 'nouvelle-par-fenetre' ? 'nouvelle-par-fenetre' : 'courante',
    ouvrirMaintenant: x.ouvrirMaintenant === true,
    moteurParDefaut: x.moteurParDefaut === true,
    extensionsChoisies: Array.isArray(x.extensionsChoisies) ? x.extensionsChoisies.filter((i): i is string => typeof i === 'string').slice(0, 500) : []
  }
}

const echec = (raison: string): ResultatImport[ElementImport] => ({ etat: 'indisponible', ajoutes: 0, presents: 0, ignores: 0, notes: [], raison })

export class Importeur {
  private enCours: { id: string; controle: AbortController } | undefined
  /** Profils vus par la dernière détection : seuls ceux-là peuvent être lus (le renderer ne choisit jamais un chemin). */
  private connus: ProfilDetecte[] = []

  constructor(private readonly processus: Processus) {}

  async detecter(): Promise<ProfilDetecte[]> {
    this.connus = await this.processus.detecter()
    return this.connus
  }

  private async profil(p: unknown): Promise<ProfilDetecte | undefined> {
    const x = p as Partial<ProfilDetecte> | null
    if (!x || typeof x.chemin !== 'string' || typeof x.navigateur !== 'string' || !(x.navigateur in NOMS_NAVIGATEURS)) return undefined
    const cherche = (l: ProfilDetecte[]): ProfilDetecte | undefined => l.find((c) => c.navigateur === (x.navigateur as NavigateurSource) && c.chemin === x.chemin)
    return cherche(this.connus) ?? cherche(await this.detecter())
  }

  async apercu(d: DemandeApercuImport): Promise<ReponseApercuImport> {
    const elements = elementsValides(d?.elements)
    const depuisJours = joursValides(d?.depuisJours)
    const profil = await this.profil(d?.profil)
    if (!elements || depuisJours === undefined || !profil) throw new Error('Demande d’aperçu invalide')
    return this.processus.apercu(profil, elements, depuisJours)
  }

  async lancer(d: DemandeImport, cibles: () => CiblesImport, sortie: SortieImport): Promise<ReponseImport> {
    if (this.enCours) return { erreur: 'en-cours' }
    const elements = elementsValides(d?.elements)
    const depuisJours = joursValides(d?.depuisJours)
    if (!elements || depuisJours === undefined) return { erreur: 'invalide' }
    // Réservé avant tout `await` : deux demandes simultanées ne passent jamais toutes les deux.
    const id = randomUUID()
    const controle = new AbortController()
    this.enCours = { id, controle }
    const profil = await this.profil(d?.profil).catch(() => undefined)
    if (!profil) {
      this.enCours = undefined
      return { erreur: 'invalide' }
    }
    const debut = Date.now()
    const garde = (f: () => void): void => {
      try {
        f()
      } catch {
        // page fermée : l'import continue
      }
    }
    void (async () => {
      let resultat: ResultatImport
      try {
        resultat = await lireEtAppliquer({
          processus: this.processus,
          profil,
          params: { depuisJours },
          elements,
          cibles: cibles(),
          options: optionsValides(d.options),
          signal: controle.signal,
          surProgression: (p) => garde(() => sortie.progression({ id, ...p }))
        })
      } catch (e) {
        const raison = `Importation interrompue : ${messageLisible(e, 'erreur inattendue (détail dans le journal)')}`
        resultat = { duree: Date.now() - debut, source: profil.navigateur, profil: profil.nom } as ResultatImport
        for (const el of ELEMENTS_IMPORT) resultat[el] = elements.includes(el) ? echec(raison) : { etat: 'ignore', ajoutes: 0, presents: 0, ignores: 0, notes: [] }
      }
      this.enCours = undefined
      garde(() => sortie.termine(id, resultat))
    })()
    return { id }
  }

  annuler(id: string): void {
    if (this.enCours?.id === id) this.enCours.controle.abort()
  }
}
