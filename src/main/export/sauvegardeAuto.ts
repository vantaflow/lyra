/**
 * Sauvegarde automatique nocturne (sans Electron : le coffre du système, l'horloge et les sources sont injectés).
 * La phrase de passe n'est JAMAIS conservée : à l'activation on en dérive la clé AES (PBKDF2, comme un export manuel),
 * et seule cette clé est gardée, protégée par le coffre du système (`safeStorage`). Chaque sauvegarde est un paquet
 * `.lyra` ordinaire (sel et itérations dans l'en-tête, IV neuf à chaque fichier) : la phrase seule suffit à le relire.
 * Sans coffre disponible, la sauvegarde automatique est refusée (jamais de clé en clair sur le disque).
 * Cookies et sessions ne sont jamais inclus. Les 7 dernières sauvegardes sont gardées.
 */
import { mkdirSync } from 'node:fs'
import { readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { JsonStore } from '../settings/store'
import { ErreurPaquet, deriverCle, exporterCle, importerCle, verifierPhrase } from './chiffrement'
import { creerPaquetAvecCle, type SourcesPaquet } from './paquet'
import { GARDER, Planificateur, aSupprimer, nomSauvegarde, type Horloge } from './planificateur'
import { messageLisible } from '../../shared/messageTechnique'

/** Coffre du système (Electron `safeStorage`). */
export interface Coffre {
  disponible(): boolean
  chiffrer(texte: string): Uint8Array
  dechiffrer(donnees: Uint8Array): string
}

interface Config {
  dossier?: string
  /** Sel PBKDF2 (base64). */
  sel?: string
  iterations?: number
  /** Clé AES brute protégée par le coffre (base64 du résultat de `Coffre.chiffrer`). */
  cle?: string
  derniere?: number
  erreur?: string
}

export interface EtatSauvegardeAuto {
  actif: boolean
  dossier?: string
  /** Dernière sauvegarde réussie (ms). */
  derniere?: number
  /** Dernier échec (message lisible), effacé à la sauvegarde suivante. */
  erreur?: string
}

export interface DepsSauvegardeAuto {
  fichierConfig: string
  coffre: Coffre
  horloge: Horloge
  sources(): SourcesPaquet
  delaiDemarrage?: number
}

const migrer = (brut: unknown): Config => {
  if (typeof brut !== 'object' || brut === null) return {}
  const b = brut as Record<string, unknown>
  const s = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
  if (!s(b.dossier) || !s(b.sel) || !s(b.cle) || typeof b.iterations !== 'number') return {}
  return {
    dossier: s(b.dossier),
    sel: s(b.sel),
    cle: s(b.cle),
    iterations: b.iterations,
    ...(typeof b.derniere === 'number' ? { derniere: b.derniere } : {}),
    ...(s(b.erreur) ? { erreur: s(b.erreur) } : {})
  }
}

const message = (e: unknown): string => messageLisible(e, 'La sauvegarde a échoué (détail dans le journal).')

export class SauvegardeAuto {
  private config: JsonStore<Config>
  private planificateur: Planificateur

  constructor(private deps: DepsSauvegardeAuto) {
    this.config = new JsonStore<Config>(deps.fichierConfig, {}, migrer)
    this.planificateur = new Planificateur({
      horloge: deps.horloge,
      derniere: () => this.config.get().derniere,
      marquer: (t) => void this.config.remplacer(({ erreur: _e, ...c }) => ({ ...c, derniere: t })),
      executer: () => this.executer(),
      surErreur: (e) => void this.config.remplacer((c) => ({ ...c, erreur: message(e) })),
      delaiDemarrage: deps.delaiDemarrage
    })
  }

  etat(): EtatSauvegardeAuto {
    const c = this.config.get()
    if (!c.dossier || !c.cle) return { actif: false }
    return { actif: true, dossier: c.dossier, ...(c.derniere ? { derniere: c.derniere } : {}), ...(c.erreur ? { erreur: c.erreur } : {}) }
  }

  /** Planifie (à appeler au démarrage de Lyra) ; sans effet si la sauvegarde automatique n'est pas activée. */
  demarrer(delai?: number): void {
    if (this.etat().actif) this.planificateur.demarrer(delai)
  }

  arreter(): void {
    this.planificateur.arreter()
  }

  async activer(dossier: string, phrase: string): Promise<EtatSauvegardeAuto> {
    verifierPhrase(phrase)
    if (!this.deps.coffre.disponible()) throw new ErreurPaquet('Sauvegarde automatique indisponible : le coffre du système ne peut pas protéger la clé de chiffrement sur cet ordinateur.', 'format')
    mkdirSync(dossier, { recursive: true })
    const k = await deriverCle(phrase, undefined, undefined, true)
    const cle = Buffer.from(this.deps.coffre.chiffrer(Buffer.from(await exporterCle(k)).toString('base64'))).toString('base64')
    this.config.remplacer(() => ({ dossier, sel: Buffer.from(k.sel).toString('base64'), iterations: k.iterations, cle }))
    this.planificateur.demarrer(this.deps.delaiDemarrage)
    return this.etat()
  }

  desactiver(): void {
    this.planificateur.arreter()
    this.config.remplacer(() => ({}))
  }

  private async executer(): Promise<void> {
    const c = this.config.get()
    if (!c.dossier || !c.cle || !c.sel || !c.iterations) return
    const brut = Buffer.from(this.deps.coffre.dechiffrer(Buffer.from(c.cle, 'base64')), 'base64')
    const cle = await importerCle(new Uint8Array(brut), new Uint8Array(Buffer.from(c.sel, 'base64')), c.iterations)
    const paquet = await creerPaquetAvecCle(this.deps.sources(), cle)
    mkdirSync(c.dossier, { recursive: true })
    const nom = nomSauvegarde(new Date(this.deps.horloge.maintenant()))
    const tmp = join(c.dossier, `${nom}.tmp`)
    try {
      await writeFile(tmp, paquet, { mode: 0o600 })
      await rename(tmp, join(c.dossier, nom))
    } catch (e) {
      await rm(tmp, { force: true })
      throw e
    }
    for (const vieux of aSupprimer(await readdir(c.dossier), GARDER)) await rm(join(c.dossier, vieux), { force: true })
  }
}
