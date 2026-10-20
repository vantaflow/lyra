/**
 * Planification de la sauvegarde automatique nocturne (pur, sans Electron ni minuterie réelle : l'horloge est injectée).
 * Une sauvegarde par nuit (échéance : 3 h, heure locale) ; si Lyra était fermé à ce moment, elle est faite peu après
 * le démarrage suivant. Rien ne bloque l'interface : l'exécution est asynchrone et jamais concurrente.
 */
export const HEURE_SAUVEGARDE = 3
export const GARDER = 7
const PREFIXE = 'lyra-sauvegarde-'
const MOTIF = /^lyra-sauvegarde-\d{8}-\d{6}\.lyra$/
/** Une minuterie plus longue serait faussée par une veille du système : on se réveille au plus tard toutes les 6 h. */
const PAS_MAX = 6 * 3_600_000

export interface Horloge {
  maintenant(): number
  /** Planifie `fn` dans `ms` ; renvoie la fonction d'annulation. */
  planifier(fn: () => void, ms: number): () => void
}

const deuxChiffres = (n: number): string => String(n).padStart(2, '0')

export function nomSauvegarde(d: Date): string {
  return `${PREFIXE}${d.getFullYear()}${deuxChiffres(d.getMonth() + 1)}${deuxChiffres(d.getDate())}-${deuxChiffres(d.getHours())}${deuxChiffres(d.getMinutes())}${deuxChiffres(d.getSeconds())}.lyra`
}

/** Fichiers à supprimer pour n'en garder que `garder` (les plus récents, par le nom horodaté) ; les autres fichiers ne sont jamais touchés. */
export function aSupprimer(noms: string[], garder = GARDER): string[] {
  const sauvegardes = noms.filter((n) => MOTIF.test(n)).sort()
  return sauvegardes.slice(0, Math.max(0, sauvegardes.length - garder))
}

/** 3 h locale la plus récente qui n'est pas dans le futur. */
export function derniereEcheance(maintenant: number): number {
  const d = new Date(maintenant)
  d.setHours(HEURE_SAUVEGARDE, 0, 0, 0)
  if (d.getTime() > maintenant) d.setDate(d.getDate() - 1)
  return d.getTime()
}

/** Première 3 h locale strictement postérieure à `maintenant`. */
export function prochaineEcheance(maintenant: number): number {
  const d = new Date(derniereEcheance(maintenant))
  d.setDate(d.getDate() + 1)
  d.setHours(HEURE_SAUVEGARDE, 0, 0, 0)
  return d.getTime()
}

export interface DepsPlanificateur {
  horloge: Horloge
  /** Date (ms) de la dernière sauvegarde réussie. */
  derniere(): number | undefined
  marquer(t: number): void
  executer(): Promise<void>
  surErreur?(e: unknown): void
  /** Délai avant une sauvegarde manquée, après le démarrage (défaut : 1 min). */
  delaiDemarrage?: number
  /** Délai avant de réessayer après un échec (défaut : 1 h). */
  delaiReessai?: number
}

export class Planificateur {
  private annuler: (() => void) | undefined
  private enCours = false
  private actif = false

  constructor(private deps: DepsPlanificateur) {}

  /** À appeler une fois au démarrage (ou à l'activation) ; sans effet de bord bloquant. */
  demarrer(delai?: number): void {
    this.arreter()
    this.actif = true
    this.armer(this.du() ? (delai ?? this.deps.delaiDemarrage ?? 60_000) : undefined)
  }

  arreter(): void {
    this.actif = false
    this.annuler?.()
    this.annuler = undefined
  }

  private du(): boolean {
    return (this.deps.derniere() ?? 0) < derniereEcheance(this.deps.horloge.maintenant())
  }

  private armer(delai?: number): void {
    if (!this.actif) return
    this.annuler?.()
    const maintenant = this.deps.horloge.maintenant()
    const ms = delai ?? Math.min(prochaineEcheance(maintenant) - maintenant, PAS_MAX)
    this.annuler = this.deps.horloge.planifier(() => void this.tic(), Math.max(0, ms))
  }

  private async tic(): Promise<void> {
    this.annuler = undefined
    if (!this.actif) return
    if (this.enCours || !this.du()) return this.armer()
    this.enCours = true
    let suite: number | undefined
    try {
      await this.deps.executer()
      this.deps.marquer(this.deps.horloge.maintenant())
    } catch (e) {
      suite = this.deps.delaiReessai ?? 3_600_000
      try {
        this.deps.surErreur?.(e)
      } catch {
        /* le signalement ne doit jamais arrêter la planification */
      }
    } finally {
      this.enCours = false
    }
    this.armer(suite)
  }
}
