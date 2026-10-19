/**
 * Mode « Ne pas déranger » : état par fenêtre (en mémoire seulement, jamais restauré au démarrage), minuterie,
 * file des notifications web retenues, popups retenues, exceptions par site. Pur (aucune dépendance à Electron) :
 * la livraison, l'ouverture des popups et la diffusion de l'état sont injectées.
 */
import type { EtatDnd, DureeDnd } from '../../shared/ipc'

export type { EtatDnd, DureeDnd }

/** Notifications retenues par fenêtre : au-delà, les plus anciennes sont jetées. */
export const PLAFOND_NOTIFICATIONS = 50
/** Popups retenues par fenêtre : au-delà, les plus anciennes sont jetées. */
export const PLAFOND_POPUPS = 10
/** Durée d'affichage du rappel complet avant qu'il ne laisse que le croissant. */
export const DELAI_RAPPEL_MS = 5000
/** Durée de ⌘ ⇧ D et du croissant (design : « Ne pas déranger pendant 1 h »). */
export const DUREE_PAR_DEFAUT: DureeDnd = 60

export interface NotificationRetenue {
  id: number
  origine: string
  titre: string
  corps?: string
  tag?: string
  silencieuse?: boolean
  /** Étoile d'origine : un clic la focalise si elle existe encore. */
  etoileId?: string
  date: number
}

export interface PopupRetenue {
  url: string
  origine: string
  etoileId?: string
}

export interface DepsDnd {
  /** Le site a une exception « Ne pas déranger » : ses notifications et popups passent. */
  exception(origine: string): boolean
  /** Livre à la sortie, dans l'ordre d'arrivée. */
  livrerNotifications(fenetre: number, notifications: NotificationRetenue[]): void
  ouvrirPopups(fenetre: number, popups: PopupRetenue[]): void
  /** L'état d'une fenêtre a changé (entrée, sortie, compteur, rappel). */
  surChangement(fenetre: number, etat: EtatDnd): void
}

interface Fenetre {
  fin: number | null
  duree: DureeDnd
  notifications: NotificationRetenue[]
  popups: PopupRetenue[]
  rappel: boolean
  minuterie?: NodeJS.Timeout
  minuterieRappel?: NodeJS.Timeout
  attentes: Array<() => void>
}

const INACTIF: EtatDnd = { actif: false, duree: null, fin: null, notifications: 0, popups: 0, rappel: false }

export class Dnd {
  private fenetres = new Map<number, Fenetre>()
  private prochain = 1

  constructor(private deps: DepsDnd) {}

  actif(fenetre: number): boolean {
    return this.fenetres.has(fenetre)
  }

  /** Au moins une fenêtre est en mode (permission des service workers, qui n'ont pas de fenêtre). */
  actifQuelquePart(): boolean {
    return this.fenetres.size > 0
  }

  /** Mode actif pour cette fenêtre et site sans exception : ce qu'il émet est retenu. */
  retient(fenetre: number, origine: string): boolean {
    return this.fenetres.has(fenetre) && !this.deps.exception(origine)
  }

  etat(fenetre: number): EtatDnd {
    const f = this.fenetres.get(fenetre)
    if (!f) return INACTIF
    return { actif: true, duree: f.duree, fin: f.fin, notifications: f.notifications.length, popups: f.popups.length, rappel: f.rappel }
  }

  /** Entre (ou relance avec une autre durée, sans perdre ce qui est retenu). */
  entrer(fenetre: number, duree: DureeDnd = DUREE_PAR_DEFAUT, maintenant = Date.now()): void {
    const f: Fenetre = this.fenetres.get(fenetre) ?? { fin: null, duree, notifications: [], popups: [], rappel: true, attentes: [] }
    clearTimeout(f.minuterie)
    f.duree = duree
    f.fin = duree === 'arret' ? null : maintenant + duree * 60_000
    f.minuterie = duree === 'arret' ? undefined : this.armer(() => this.sortir(fenetre), duree * 60_000)
    this.fenetres.set(fenetre, f)
    this.montrerRappel(fenetre)
  }

  /** Bascule : sort si actif, sinon entre avec la durée donnée. */
  basculer(fenetre: number, duree: DureeDnd = DUREE_PAR_DEFAUT): void {
    if (this.actif(fenetre)) this.sortir(fenetre)
    else this.entrer(fenetre, duree)
  }

  /** Réaffiche le rappel complet (entrée, survol du croissant) puis l'efface après le délai. */
  montrerRappel(fenetre: number): void {
    const f = this.fenetres.get(fenetre)
    if (!f) return
    clearTimeout(f.minuterieRappel)
    f.rappel = true
    f.minuterieRappel = this.armer(() => {
      f.rappel = false
      this.diffuser(fenetre)
    }, DELAI_RAPPEL_MS)
    this.diffuser(fenetre)
  }

  /** Sortie : l'état repasse d'abord à « inactif » (la page reprend sa place), puis tout ce qui est retenu est livré. */
  sortir(fenetre: number): void {
    const f = this.fenetres.get(fenetre)
    if (!f) return
    this.nettoyer(f)
    this.fenetres.delete(fenetre)
    this.deps.surChangement(fenetre, INACTIF)
    for (const ok of f.attentes) ok()
    if (f.notifications.length > 0) this.deps.livrerNotifications(fenetre, f.notifications)
    if (f.popups.length > 0) this.deps.ouvrirPopups(fenetre, f.popups)
  }

  /** Fenêtre fermée : rien n'est livré (les pages n'existent plus), les attentes sont levées. */
  fermer(fenetre: number): void {
    const f = this.fenetres.get(fenetre)
    if (!f) return
    this.nettoyer(f)
    this.fenetres.delete(fenetre)
    for (const ok of f.attentes) ok()
  }

  /**
   * Retient une notification (jamais affichée) : renvoie son identifiant, ou null si elle doit passer
   * (mode inactif, site en exception). Même `tag` et même origine : la nouvelle remplace l'ancienne.
   */
  retenirNotification(fenetre: number, n: Omit<NotificationRetenue, 'id' | 'date'>, maintenant = Date.now()): number | null {
    const f = this.fenetres.get(fenetre)
    if (!f || this.deps.exception(n.origine)) return null
    const id = this.prochain++
    if (n.tag) f.notifications = f.notifications.filter((x) => !(x.tag === n.tag && x.origine === n.origine))
    f.notifications.push({ ...n, id, date: maintenant })
    if (f.notifications.length > PLAFOND_NOTIFICATIONS) f.notifications.splice(0, f.notifications.length - PLAFOND_NOTIFICATIONS)
    this.diffuser(fenetre)
    return id
  }

  /** La page a fermé sa notification avant la sortie (`close()`) : elle n'est plus livrée. */
  retirerNotification(fenetre: number, id: number): void {
    const f = this.fenetres.get(fenetre)
    if (!f) return
    const avant = f.notifications.length
    f.notifications = f.notifications.filter((x) => x.id !== id)
    if (f.notifications.length !== avant) this.diffuser(fenetre)
  }

  /** Retient une popup (`window.open` avec features) ; faux si elle doit s'ouvrir normalement. Une même adresse du même site n'est gardée qu'une fois. */
  retenirPopup(fenetre: number, p: PopupRetenue): boolean {
    const f = this.fenetres.get(fenetre)
    if (!f || this.deps.exception(p.origine)) return false
    if (!f.popups.some((x) => x.url === p.url && x.origine === p.origine)) {
      f.popups.push(p)
      if (f.popups.length > PLAFOND_POPUPS) f.popups.splice(0, f.popups.length - PLAFOND_POPUPS)
      this.diffuser(fenetre)
    }
    return true
  }

  /** Résout à la sortie (ou à la fermeture de la fenêtre) ; tout de suite si le mode n'est pas actif. */
  attendreSortie(fenetre: number): Promise<void> {
    const f = this.fenetres.get(fenetre)
    return f ? new Promise<void>((ok) => f.attentes.push(ok)) : Promise.resolve()
  }

  private armer(cb: () => void, ms: number): NodeJS.Timeout {
    const t = setTimeout(cb, ms)
    t.unref?.()
    return t
  }

  private nettoyer(f: Fenetre): void {
    clearTimeout(f.minuterie)
    clearTimeout(f.minuterieRappel)
  }

  private diffuser(fenetre: number): void {
    this.deps.surChangement(fenetre, this.etat(fenetre))
  }
}

/** « 3 notifications retenues », « aucune notification retenue » (rappel). */
export function texteNotifications(n: number): string {
  if (n === 0) return 'aucune notification retenue'
  return `${n} notification${n > 1 ? 's' : ''} retenue${n > 1 ? 's' : ''}`
}

/** « 1 fenêtre retenue », « 2 fenêtres retenues » ; '' si aucune. */
export function texteFenetres(n: number): string {
  return n === 0 ? '' : `${n} fenêtre${n > 1 ? 's' : ''} retenue${n > 1 ? 's' : ''}`
}

/** « encore 42 min », « encore 1 h 05 » ; « jusqu'à l'arrêt » sans minuterie. */
export function texteReste(fin: number | null, maintenant: number): string {
  if (fin === null) return "jusqu'à l'arrêt"
  const min = Math.max(1, Math.ceil((fin - maintenant) / 60_000))
  if (min < 60) return `encore ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `encore ${h} h` : `encore ${h} h ${String(m).padStart(2, '0')}`
}
