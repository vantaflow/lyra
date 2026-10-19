/** Demandes de permission affichées dans l'overlay : réponse, abandon, contrôle de l'expéditeur. */
import type { ReponsePermission } from './Permissions'

export const REFUS: ReponsePermission = { decision: 'refuser', memoriser: false }

interface Attente {
  fenetre: number
  /** webContents.id de l'overlay qui affiche la demande : seul lui peut répondre. */
  expediteur: number
  fin(r: ReponsePermission): void
}

export class Attentes {
  private attentes = new Map<number, Attente>()
  private prochain = 1

  ouvrir(fenetre: number, expediteur: number): { id: number; promesse: Promise<ReponsePermission> } {
    const id = this.prochain++
    const promesse = new Promise<ReponsePermission>((ok) => this.attentes.set(id, { fenetre, expediteur, fin: ok }))
    return { id, promesse }
  }

  /** Réponse de l'utilisateur ; ignorée si elle ne vient pas de l'overlay qui a posé la demande. */
  repondre(id: number, expediteur: number, r: ReponsePermission): boolean {
    const a = this.attentes.get(id)
    if (!a || a.expediteur !== expediteur) return false
    this.attentes.delete(id)
    a.fin(r)
    return true
  }

  /** Abandon (page partie ou détruite) : refus sans mémoire ; vrai si la demande existait encore. */
  abandonner(id: number): boolean {
    const a = this.attentes.get(id)
    if (!a) return false
    this.attentes.delete(id)
    a.fin(REFUS)
    return true
  }

  /** L'overlay a changé de route ou s'est fermé : ses demandes en cours sont refusées. */
  abandonnerFenetre(fenetre: number): void {
    for (const [id, a] of [...this.attentes]) if (a.fenetre === fenetre) this.abandonner(id)
  }
}
