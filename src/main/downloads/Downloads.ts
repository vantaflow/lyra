/** Téléchargements : branché sur `will-download` des sessions, liste en mémoire + persistance des terminés. */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { shell, type DownloadItem, type Session } from 'electron'
import type { DownloadInfo } from '../../shared/types'
import { JsonStore } from '../settings/store'
import { ajouterFinal, estFinal, nomUnique, reduire } from './logique'

const MAX = 200
const DEBOUNCE_MS = 150

interface Contenu {
  version: 1
  items: DownloadInfo[]
}
const VIDE: Contenu = { version: 1, items: [] }

function migrer(brut: unknown): Contenu {
  const items = (brut as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) return VIDE
  const valides = items.filter(
    (i): i is DownloadInfo => typeof i === 'object' && i !== null && typeof (i as DownloadInfo).id === 'string' && typeof (i as DownloadInfo).nom === 'string' && typeof (i as DownloadInfo).chemin === 'string'
  )
  return { version: 1, items: valides.filter(estFinal) }
}

export interface OptionsDownloads {
  /** userData/telechargements.json */
  fichier: string
  reglages: () => { dossier: string; demander: boolean }
  /** Appelé (debounce 150 ms) quand la liste change. */
  surChangement: () => void
}

interface Actif {
  info: DownloadInfo
  item: DownloadItem
  dernierTick: number
  /** Venu de la session privée de cette fenêtre : jamais écrit sur disque, listé seulement pour elle. */
  fenetre?: number
}

export class Downloads {
  private actifs = new Map<string, Actif>()
  private store: JsonStore<Contenu>
  private minuteur: NodeJS.Timeout | undefined
  /** Téléchargements privés finis, par fenêtre privée : en mémoire seulement, oubliés à la fermeture de la fenêtre. */
  private prives = new Map<number, DownloadInfo[]>()
  private fermees = new Set<number>()

  constructor(private opts: OptionsDownloads) {
    this.store = new JsonStore<Contenu>(opts.fichier, VIDE, migrer)
  }

  /** `fenetre` : identifiant de la fenêtre privée propriétaire de la session (téléchargements privés). */
  attacher(ses: Session, o: { fenetre?: number } = {}): void {
    ses.on('will-download', (_e, item) => this.demarrer(item, o.fenetre))
  }

  private demarrer(item: DownloadItem, fenetre: number | undefined): void {
    const { dossier, demander } = this.opts.reglages()
    let nom = item.getFilename()
    let chemin = ''
    if (!demander) {
      mkdirSync(dossier, { recursive: true })
      const reserves = new Set([...this.actifs.values()].map((a) => a.info.chemin))
      nom = nomUnique(dossier, nom, (c) => existsSync(c) || reserves.has(c))
      chemin = join(dossier, nom)
      item.setSavePath(chemin)
    }
    const id = randomUUID()
    const actif: Actif = {
      info: { id, nom, chemin, url: item.getURL(), total: item.getTotalBytes(), recu: 0, etat: 'en-cours', date: Date.now() },
      item,
      dernierTick: Date.now(),
      fenetre
    }
    this.actifs.set(id, actif)

    item.on('updated', (_ev, etat) => {
      const maintenant = Date.now()
      this.completerChemin(actif)
      actif.info = reduire(actif.info, {
        type: 'updated',
        recu: item.getReceivedBytes(),
        total: item.getTotalBytes(),
        pause: item.isPaused(),
        interrompu: etat === 'interrupted',
        dtMs: maintenant - actif.dernierTick
      })
      actif.dernierTick = maintenant
      this.signaler()
    })
    item.once('done', (_ev, etat) => {
      this.completerChemin(actif)
      actif.info = reduire(actif.info, { type: 'done', resultat: etat, recu: item.getReceivedBytes(), total: item.getTotalBytes() })
      this.actifs.delete(id)
      if (fenetre === undefined) this.persister(actif.info)
      else if (!this.fermees.has(fenetre)) this.prives.set(fenetre, ajouterFinal(this.prives.get(fenetre) ?? [], actif.info, MAX))
      this.signaler()
    })
    this.signaler()
  }

  /** Quand l'utilisateur choisit l'emplacement lui-même, le chemin n'est connu qu'ensuite. */
  private completerChemin(a: Actif): void {
    const p = a.item.getSavePath()
    if (p && p !== a.info.chemin) a.info = { ...a.info, chemin: p, nom: basename(p) }
  }

  private persister(info: DownloadInfo): void {
    this.store.set({ items: ajouterFinal(this.store.get().items, info, MAX) })
  }

  /** Liste d'une fenêtre privée (`fenetre`) : ses seuls téléchargements, en mémoire. Sans argument : la liste normale. */
  liste(fenetre?: number): DownloadInfo[] {
    if (fenetre !== undefined) {
      const actifs = [...this.actifs.values()].filter((a) => a.fenetre === fenetre).map((a) => a.info)
      return [...actifs, ...(this.prives.get(fenetre) ?? [])].sort((a, b) => b.date - a.date).slice(0, MAX)
    }
    const enMemoire = [...this.actifs.values()].filter((a) => a.fenetre === undefined).map((a) => a.info)
    const ids = new Set(enMemoire.map((i) => i.id))
    return [...enMemoire, ...this.store.get().items.filter((i) => !ids.has(i.id))].sort((a, b) => b.date - a.date).slice(0, MAX)
  }

  enCours(): boolean {
    return [...this.actifs.values()].some((a) => a.info.etat === 'en-cours')
  }

  /** L'actif `id`, seulement s'il appartient à la portée demandée (fenêtre privée, ou la liste normale). */
  private actif(id: string, fenetre?: number): Actif | undefined {
    const a = this.actifs.get(id)
    return a && a.fenetre === fenetre ? a : undefined
  }

  pause(id: string, fenetre?: number): void {
    const a = this.actif(id, fenetre)
    if (a && !a.item.isPaused() && a.item.canResume()) a.item.pause()
  }

  reprendre(id: string, fenetre?: number): void {
    const a = this.actif(id, fenetre)
    if (a && a.item.canResume()) a.item.resume()
  }

  annuler(id: string, fenetre?: number): void {
    this.actif(id, fenetre)?.item.cancel()
  }

  private termine(id: string, fenetre?: number): DownloadInfo | undefined {
    return this.liste(fenetre).find((i) => i.id === id && i.etat === 'termine' && i.chemin)
  }

  ouvrir(id: string, fenetre?: number): void {
    const i = this.termine(id, fenetre)
    if (i) void shell.openPath(i.chemin)
  }

  afficherDansDossier(id: string, fenetre?: number): void {
    const i = this.termine(id, fenetre)
    if (i) shell.showItemInFolder(i.chemin)
  }

  /** Vide la liste (celle de la fenêtre privée `fenetre`, ou la normale) ; les téléchargements en cours restent. */
  effacerListe(fenetre?: number): void {
    if (fenetre === undefined) this.store.set({ items: [] })
    else this.prives.delete(fenetre)
    this.signaler()
  }

  /** Fermeture d'une fenêtre privée : sa liste est oubliée, ses téléchargements en cours sont annulés. */
  oublierFenetre(fenetre: number): void {
    this.fermees.add(fenetre)
    this.prives.delete(fenetre)
    for (const a of this.actifs.values()) if (a.fenetre === fenetre) a.item.cancel()
  }

  private signaler(): void {
    if (this.minuteur) return
    this.minuteur = setTimeout(() => {
      this.minuteur = undefined
      this.opts.surChangement()
    }, DEBOUNCE_MS)
  }
}
