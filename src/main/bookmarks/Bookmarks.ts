/** Favoris : userData/favoris.json via JsonStore (écriture atomique). */
import { JsonStore } from '../settings/store'
import { normaliser } from '../palette/suggest'

export interface Favori {
  url: string
  title: string
  dossier?: string
  /** Date d'ajout (ms). */
  date: number
}

interface Contenu {
  version: 1
  items: Favori[]
}

const VIDE: Contenu = { version: 1, items: [] }

/** Tolérant : un fichier au format inattendu donne une liste vide, jamais d'exception. */
function migrer(brut: unknown): Contenu {
  const items = (brut as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) return VIDE
  const valides = items.filter(
    (i): i is Favori => typeof i === 'object' && i !== null && typeof (i as Favori).url === 'string' && typeof (i as Favori).title === 'string'
  )
  return { version: 1, items: valides.map((i) => ({ ...i, date: typeof i.date === 'number' ? i.date : 0 })) }
}

export class Bookmarks {
  private store: JsonStore<Contenu>

  constructor(chemin: string) {
    this.store = new JsonStore<Contenu>(chemin, VIDE, migrer)
  }

  lister(): Favori[] {
    return this.store.get().items
  }

  existe(url: string): boolean {
    return this.lister().some((f) => f.url === url)
  }

  ajouter(f: { url: string; title: string; dossier?: string }): void {
    if (this.existe(f.url)) return
    const item: Favori = { url: f.url, title: f.title, ...(f.dossier ? { dossier: f.dossier } : {}), date: Date.now() }
    this.store.set({ items: [...this.lister(), item] })
  }

  retirer(url: string): void {
    if (this.existe(url)) this.store.set({ items: this.lister().filter((f) => f.url !== url) })
  }

  /** Ajoute ou retire ; renvoie vrai si l'adresse est désormais en favori. */
  toggle(f: { url: string; title: string }): boolean {
    if (this.existe(f.url)) {
      this.retirer(f.url)
      return false
    }
    this.ajouter(f)
    return true
  }

  rechercher(texte: string): Favori[] {
    const mots = normaliser(texte).split(/\s+/).filter(Boolean)
    return this.lister().filter((f) => {
      const cible = normaliser(`${f.title} ${f.url} ${f.dossier ?? ''}`)
      return mots.every((m) => cible.includes(m))
    })
  }

  onChange(cb: () => void): () => void {
    return this.store.onChange(cb)
  }
}
