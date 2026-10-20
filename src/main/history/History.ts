/** Historique de navigation : JSON lignes en append + index en mémoire (pur Node, sans Electron). */
import { appendFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { HistoryEntry } from '../../shared/types'
import { normaliser } from '../palette/suggest'

const JOUR = 86_400_000
const HTTP = /^https?:\/\//i

/**
 * Seules les pages http(s) sont retenues (jamais about:, data:, devtools:, chrome-error:, lyra://) ;
 * file:// uniquement quand `fichiers` est vrai (LYRA_TEST=1).
 */
export function urlRetenue(url: string, fichiers = false): boolean {
  return HTTP.test(url) || (fichiers && /^file:\/\//i.test(url))
}

export interface Visite {
  url: string
  title: string
  date: number
  prive?: boolean
}

/** Au-delà de ce nombre de lignes ajoutées par des imports, `compacterSiNecessaire` réécrit le fichier. */
const SEUIL_COMPACTION = 10_000

interface Fiche {
  title: string
  /** Dates de visite, croissantes à l'insertion courante (jamais vide). */
  dates: number[]
}

export interface OptionsHistory {
  /**
   * Enregistre aussi les pages file://. Faux par défaut ; activé uniquement quand LYRA_TEST=1 pour que
   * les tests e2e puissent naviguer sur une fixture locale. lyra:// n'est jamais enregistré.
   */
  enregistrerFichiers?: boolean
  /** Lignes importées avant que `compacterSiNecessaire` compacte (10 000 par défaut). */
  seuilCompaction?: number
}

/** Ligne du fichier : une visite, ou (maj) un titre arrivé après coup, qui n'est pas une visite. */
interface Ligne extends Visite {
  maj?: boolean
}

function lireLigne(brut: string): Ligne | null {
  try {
    const v: unknown = JSON.parse(brut)
    if (typeof v !== 'object' || v === null) return null
    const { url, title, date, maj } = v as Record<string, unknown>
    if (typeof url !== 'string' || !url || typeof date !== 'number' || !Number.isFinite(date)) return null
    return { url, title: typeof title === 'string' ? title : '', date, ...(maj === true ? { maj: true } : {}) }
  } catch {
    return null
  }
}

/** `Math.max(...dates)` lève une RangeError au-delà de ~125 000 arguments : boucle. */
const maxDates = (dates: number[]): number => {
  let m = -Infinity
  for (const d of dates) if (d > m) m = d
  return m
}

export class History {
  private index = new Map<string, Fiche>()
  /** File des écritures : append et compactions s'exécutent dans l'ordre d'appel. */
  private file: Promise<void> = Promise.resolve()
  /** Lignes ajoutées par `importer` depuis le chargement ou la dernière compaction. */
  private lignesImportees = 0

  constructor(
    private chemin: string,
    private opts: OptionsHistory = {}
  ) {
    this.charger()
  }

  private charger(): void {
    let texte = ''
    try {
      texte = readFileSync(this.chemin, 'utf8')
    } catch {
      return // absent ou illisible : historique vide
    }
    for (const brut of texte.split('\n')) {
      const l = brut.trim() ? lireLigne(brut) : null
      if (l) this.appliquer(l, !l.maj)
    }
  }

  private retenu(url: string): boolean {
    return urlRetenue(url, this.opts.enregistrerFichiers === true)
  }

  private appliquer(l: Visite, visite: boolean): void {
    let f = this.index.get(l.url)
    if (!f) {
      if (!visite) return
      f = { title: '', dates: [] }
      this.index.set(l.url, f)
    }
    if (l.title) f.title = l.title
    if (visite) f.dates.push(l.date)
  }

  /** Enregistre une visite. `prive` : navigation privée, jamais enregistrée. */
  ajouter(v: Visite): void {
    if (v.prive || !this.retenu(v.url)) return
    this.appliquer(v, true)
    this.ecrire(JSON.stringify({ url: v.url, title: v.title, date: v.date }) + '\n')
  }

  /**
   * Import : fusionne un lot sans doublon sur (url, date en ms), dans un ordre quelconque. Une page connue sans cette
   * date reçoit la date ; son titre n'est rempli que s'il est vide. Un seul `appendFile` pour tout le lot ; rien n'est
   * écrit s'il n'y a rien de nouveau. Résoudre avec `attendre()` avant de lire le fichier.
   */
  importer(lot: Visite[]): { ajoutees: number; presentes: number } {
    let ajoutees = 0
    let presentes = 0
    const lignes: string[] = []
    for (const v of lot) {
      if (!this.retenu(v.url) || !Number.isFinite(v.date)) continue
      const f = this.index.get(v.url)
      if (f?.dates.includes(v.date)) {
        presentes++
        if (!f.title && v.title) {
          f.title = v.title
          lignes.push(JSON.stringify({ url: v.url, title: v.title, date: v.date, maj: true }))
        }
        continue
      }
      const titre = f?.title ? f.title : v.title
      this.appliquer({ url: v.url, title: titre, date: v.date }, true)
      lignes.push(JSON.stringify({ url: v.url, title: titre, date: v.date }))
      ajoutees++
    }
    if (lignes.length > 0) this.ecrire(lignes.join('\n') + '\n')
    this.lignesImportees += ajoutees
    return { ajoutees, presentes }
  }

  /** À appeler en fin d'import : compacte le fichier si les imports ont ajouté plus de lignes que le seuil. */
  compacterSiNecessaire(): boolean {
    if (this.lignesImportees <= (this.opts.seuilCompaction ?? SEUIL_COMPACTION)) return false
    this.lignesImportees = 0
    this.compacter()
    return true
  }

  /**
   * Archivage d'une étoile éteinte : la page doit rester retrouvable. Absente de l'historique, elle y entre avec la date
   * donnée ; déjà connue, rien n'est ajouté (pas de visite en plus), seul un titre manquant est complété.
   */
  garantir(v: Visite): void {
    if (v.prive || !this.retenu(v.url)) return
    const f = this.index.get(v.url)
    if (!f) this.ajouter(v)
    else if (!f.title) this.majTitre(v.url, v.title, v.date)
  }

  /** Le titre d'une page arrive après la navigation : met à jour l'entrée sans compter de visite. */
  majTitre(url: string, title: string, date: number = Date.now()): void {
    if (!title || !this.index.has(url)) return
    this.appliquer({ url, title, date }, false)
    this.ecrire(JSON.stringify({ url, title, date, maj: true }) + '\n')
  }

  rechercher(texte: string, limite = 50): HistoryEntry[] {
    const mots = normaliser(texte).split(/\s+/).filter(Boolean)
    const res: HistoryEntry[] = []
    for (const [url, f] of this.index) {
      const cible = normaliser(`${f.title} ${url}`)
      if (mots.every((m) => cible.includes(m))) {
        res.push({ url, title: f.title, visitedAt: maxDates(f.dates), visites: f.dates.length })
      }
    }
    return res.sort((a, b) => (b.visitedAt ?? 0) - (a.visitedAt ?? 0)).slice(0, limite)
  }

  supprimer(url: string): void {
    if (this.index.delete(url)) this.compacter()
  }

  effacer(): void {
    this.index.clear()
    this.compacter()
  }

  /** Export CSV : une entrée par page (dernière visite, nombre de visites), la plus récente d'abord n'est pas garantie. Lecture seule, tolérante aux ajouts pendant le parcours. */
  *pages(): Generator<{ url: string; titre: string; date: number; visites: number }> {
    for (const [url, f] of this.index) if (f.dates.length) yield { url, titre: f.title, date: maxDates(f.dates), visites: f.dates.length }
  }

  /** Export du paquet : chaque visite, une par une (une réimportation retrouve exactement les mêmes dates). */
  *visites(): Generator<{ url: string; titre: string; date: number }> {
    for (const [url, f] of this.index) for (const date of [...f.dates]) yield { url, titre: f.title, date }
  }

  /** Top n par visites sur 30 jours (égalité : la plus récente d'abord), sans lyra:// ni file://. */
  frequents(n: number, maintenant: number = Date.now()): HistoryEntry[] {
    const depuis = maintenant - 30 * JOUR
    const res: HistoryEntry[] = []
    for (const [url, f] of this.index) {
      if (!HTTP.test(url)) continue
      const recentes = f.dates.filter((d) => d >= depuis && d <= maintenant)
      if (recentes.length) res.push({ url, title: f.title, visitedAt: maxDates(recentes), visites: recentes.length })
    }
    return res.sort((a, b) => b.visites! - a.visites! || b.visitedAt! - a.visitedAt!).slice(0, Math.max(0, n))
  }

  /** Résout quand toutes les écritures demandées jusque-là sont terminées. */
  attendre(): Promise<void> {
    return this.file
  }

  private enfiler(tache: () => Promise<void>): void {
    this.file = this.file.then(tache).catch(() => undefined)
  }

  private ecrire(ligne: string): void {
    this.enfiler(async () => {
      await mkdir(dirname(this.chemin), { recursive: true })
      await appendFile(this.chemin, ligne)
    })
  }

  /** Réécrit le fichier d'après l'index courant (instantané pris maintenant, écrit dans l'ordre de la file). */
  private compacter(): void {
    const lignes: string[] = []
    for (const [url, f] of this.index) for (const date of f.dates) lignes.push(JSON.stringify({ url, title: f.title, date }))
    const contenu = lignes.length ? lignes.join('\n') + '\n' : ''
    this.enfiler(async () => {
      const tmp = `${this.chemin}.tmp`
      try {
        await mkdir(dirname(this.chemin), { recursive: true })
        await writeFile(tmp, contenu)
        await rename(tmp, this.chemin)
      } catch (e) {
        await rm(tmp, { force: true })
        throw e
      }
    })
  }
}
