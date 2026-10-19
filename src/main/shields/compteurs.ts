/** Compteurs des Boucliers : par onglet (webContentsId), 20 dernières URL, total par jour (en mémoire). */

const MAX_DERNIERES = 20
const JOURS_SEMAINE = 7

interface CompteurOnglet {
  n: number
  dernieres: string[]
}

const jour = (d: Date): string => d.toISOString().slice(0, 10)

export class Compteurs {
  private parOnglet = new Map<number, CompteurOnglet>()
  private parJour = new Map<string, number>()

  constructor(private maintenant: () => Date = () => new Date()) {}

  ajouter(wcId: number | undefined, url: string): void {
    const j = jour(this.maintenant())
    this.parJour.set(j, (this.parJour.get(j) ?? 0) + 1)
    if (wcId === undefined) return
    const c = this.parOnglet.get(wcId) ?? { n: 0, dernieres: [] }
    c.n++
    c.dernieres.unshift(url)
    if (c.dernieres.length > MAX_DERNIERES) c.dernieres.length = MAX_DERNIERES
    this.parOnglet.set(wcId, c)
  }

  /** Nouvelle page dans l'onglet : on repart de zéro. */
  reinitialiser(wcId: number): void {
    this.parOnglet.delete(wcId)
  }

  bloques(wcId: number): number {
    return this.parOnglet.get(wcId)?.n ?? 0
  }

  dernieres(wcId: number): string[] {
    return [...(this.parOnglet.get(wcId)?.dernieres ?? [])]
  }

  /** Total des sept derniers jours (aujourd'hui compris). */
  semaine(): number {
    const maintenant = this.maintenant().getTime()
    const jours = new Set(Array.from({ length: JOURS_SEMAINE }, (_, i) => jour(new Date(maintenant - i * 86_400_000))))
    let total = 0
    for (const [j, n] of this.parJour) {
      if (jours.has(j)) total += n
      else this.parJour.delete(j)
    }
    return total
  }
}
