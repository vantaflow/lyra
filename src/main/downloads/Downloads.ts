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
}

export class Downloads {
  private actifs = new Map<string, Actif>()
  private store: JsonStore<Contenu>
  private minuteur: NodeJS.Timeout | undefined

  constructor(private opts: OptionsDownloads) {
    this.store = new JsonStore<Contenu>(opts.fichier, VIDE, migrer)
  }

  attacher(ses: Session): void {
    ses.on('will-download', (_e, item) => this.demarrer(item))
  }

  private demarrer(item: DownloadItem): void {
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
      dernierTick: Date.now()
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
      this.persister(actif.info)
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

  liste(): DownloadInfo[] {
    const enMemoire = [...this.actifs.values()].map((a) => a.info)
    const ids = new Set(enMemoire.map((i) => i.id))
    return [...enMemoire, ...this.store.get().items.filter((i) => !ids.has(i.id))].sort((a, b) => b.date - a.date).slice(0, MAX)
  }

  enCours(): boolean {
    return [...this.actifs.values()].some((a) => a.info.etat === 'en-cours')
  }

  pause(id: string): void {
    const a = this.actifs.get(id)
    if (a && !a.item.isPaused() && a.item.canResume()) a.item.pause()
  }

  reprendre(id: string): void {
    const a = this.actifs.get(id)
    if (a && a.item.canResume()) a.item.resume()
  }

  annuler(id: string): void {
    this.actifs.get(id)?.item.cancel()
  }

  private termine(id: string): DownloadInfo | undefined {
    return this.liste().find((i) => i.id === id && i.etat === 'termine' && i.chemin)
  }

  ouvrir(id: string): void {
    const i = this.termine(id)
    if (i) void shell.openPath(i.chemin)
  }

  afficherDansDossier(id: string): void {
    const i = this.termine(id)
    if (i) shell.showItemInFolder(i.chemin)
  }

  /** Vide la liste ; les téléchargements en cours restent. */
  effacerListe(): void {
    this.store.set({ items: [] })
    this.signaler()
  }

  private signaler(): void {
    if (this.minuteur) return
    this.minuteur = setTimeout(() => {
      this.minuteur = undefined
      this.opts.surChangement()
    }, DEBOUNCE_MS)
  }
}
