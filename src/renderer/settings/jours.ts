import type { HistoryEntry } from '../../shared/types'

export interface Groupe {
  libelle: string
  entrees: HistoryEntry[]
}

const debutDuJour = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** « Aujourd'hui », « Hier », sinon la date en toutes lettres. */
export function libelleJour(date: number, maintenant: number = Date.now()): string {
  const ecart = Math.round((debutDuJour(new Date(maintenant)) - debutDuJour(new Date(date))) / 86_400_000)
  if (ecart === 0) return "Aujourd'hui"
  if (ecart === 1) return 'Hier'
  const texte = new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

/** Regroupe des entrées déjà triées (récentes d'abord) par jour de dernière visite. */
export function grouperParJour(entrees: HistoryEntry[], maintenant: number = Date.now()): Groupe[] {
  const groupes: Groupe[] = []
  for (const e of entrees) {
    const libelle = libelleJour(e.visitedAt ?? 0, maintenant)
    const dernier = groupes.at(-1)
    if (dernier?.libelle === libelle) dernier.entrees.push(e)
    else groupes.push({ libelle, entrees: [e] })
  }
  return groupes
}

export function heure(date: number): string {
  return new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** Lettre de l'icône : première lettre du titre, sinon de l'hôte. */
export function lettre(titre: string, url: string): string {
  let base = titre.trim()
  if (!base) {
    try {
      base = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      base = url
    }
  }
  return (base.charAt(0) || '·').toUpperCase()
}
