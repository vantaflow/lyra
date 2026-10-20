/**
 * Permissions des sites (caméra, micro, notifications, position, presse-papiers). La décision se prend
 * par origine : règle mémorisée dans la règle du site (`resoudre`, section permissions), sinon prompt dans l'overlay
 * (un à la fois). Tout ce qui n'est pas listé ici est refusé. Pur côté Electron (types seulement) : testable.
 */
import type { WebContents } from 'electron'
import type { DecisionPermission, TypePermission } from '../../shared/types'
import { origineDe } from '../shields/Shields'

export interface ReponsePermission {
  decision: DecisionPermission
  memoriser: boolean
}

export interface DepsPermissions {
  /** Décision mémorisée pour ce site, ou undefined. */
  lire(origine: string, type: TypePermission): DecisionPermission | undefined
  memoriser(origine: string, type: TypePermission, decision: DecisionPermission): void
  /** Affiche la demande à l'utilisateur ; résout en refus si elle est abandonnée. */
  demander(wc: WebContents, origine: string, types: TypePermission[]): Promise<ReponsePermission>
  /**
   * Ne pas déranger : la demande de notifications d'une page est retenue (promesse résolue à la sortie du mode,
   * l'invite s'affiche alors) ; undefined si le mode ne s'applique pas à cette page.
   */
  retenir?(wc: WebContents, origine: string): Promise<void> | undefined
  /** Ne pas déranger : les notifications de ce site (wc null : service worker) sont suspendues, la vérification répond « refusé ». */
  suspendues?(wc: WebContents | null, origine: string): boolean
}

/** Détails utiles (demande et vérification) ; un sous-ensemble de ceux d'Electron. */
export interface DetailsPermission {
  requestingUrl?: string
  mediaTypes?: string[]
  mediaType?: string
}

/** Ce que Permissions attend d'une session Electron (Session y est assignable). */
export interface SessionPermissions {
  setPermissionRequestHandler(h: (wc: WebContents | null, permission: string, callback: (autorise: boolean) => void, details: DetailsPermission) => void): void
  setPermissionCheckHandler(h: (wc: WebContents | null, permission: string, requestingOrigin: string, details: DetailsPermission) => boolean): void
}

/** Permissions accordées d'office : sans elles, plein écran HTML, pointeur et copier ne marchent pas. */
const TOUJOURS = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write'])

type Demande = { types: TypePermission[] } | 'toujours' | 'refus'

function classer(permission: string, medias: readonly string[] | undefined): Demande {
  if (TOUJOURS.has(permission)) return 'toujours'
  switch (permission) {
    case 'media': {
      const types: TypePermission[] = []
      if (!medias || medias.length === 0 || medias.includes('video')) types.push('camera')
      if (!medias || medias.length === 0 || medias.includes('audio')) types.push('micro')
      return { types }
    }
    case 'notifications':
      return { types: ['notifications'] }
    case 'geolocation':
      return { types: ['geolocalisation'] }
    case 'clipboard-read':
      return { types: ['presse-papiers'] }
    default:
      return 'refus'
  }
}

export class Permissions {
  /** Prompts en file : un seul est visible à la fois. */
  private file: Promise<unknown> = Promise.resolve()

  constructor(private deps: DepsPermissions) {}

  attacher(ses: SessionPermissions): void {
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      void this.decider(wc, permission, origineDe(details.requestingUrl ?? ''), details.mediaTypes).then(callback, () => callback(false))
    })
    ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
      const medias = permission === 'media' && details.mediaType && details.mediaType !== 'unknown' ? [details.mediaType] : undefined
      const demande = classer(permission, medias)
      if (demande === 'toujours') return true
      if (demande === 'refus') return false
      // Ne pas déranger : les notifications qui échappent à la surcharge de la page (service workers) sont refusées.
      if (demande.types.includes('notifications') && this.deps.suspendues?.(wc, origineDe(requestingOrigin))) return false
      return this.regles(origineDe(requestingOrigin), demande.types) === 'autoriser'
    })
  }

  /** autoriser si tout est autorisé, refuser si un refus est mémorisé, undefined s'il reste à demander. */
  private regles(origine: string, types: TypePermission[]): DecisionPermission | undefined {
    if (!origine) return 'refuser'
    const decisions = types.map((t) => this.deps.lire(origine, t))
    if (decisions.includes('refuser')) return 'refuser'
    return decisions.every((d) => d === 'autoriser') ? 'autoriser' : undefined
  }

  private async decider(wc: WebContents | null, permission: string, origine: string, medias?: readonly string[]): Promise<boolean> {
    const demande = classer(permission, medias)
    if (demande === 'toujours') return true
    if (demande === 'refus' || !origine) return false
    const connue = this.regles(origine, demande.types)
    if (connue) return connue === 'autoriser'
    // Sans page à qui montrer le prompt : on s'en tient aux règles.
    if (!wc) return false
    // Ne pas déranger : la demande de notifications attend la sortie du mode (elle n'est pas refusée).
    const retenue = demande.types.includes('notifications') ? this.deps.retenir?.(wc, origine) : undefined
    if (retenue) await retenue
    const inconnus = demande.types.filter((t) => !this.deps.lire(origine, t))
    const reponse = await this.enFile(() => this.deps.demander(wc, origine, inconnus))
    if (reponse.memoriser) for (const t of inconnus) this.deps.memoriser(origine, t, reponse.decision)
    return reponse.decision === 'autoriser'
  }

  private enFile<T>(tache: () => Promise<T>): Promise<T> {
    const suite = this.file.then(tache, tache)
    this.file = suite.catch(() => undefined)
    return suite
  }
}
