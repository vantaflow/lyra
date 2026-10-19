import { randomUUID } from 'node:crypto'
import type { SkyState, Star } from '../../shared/types'

const MAX_FERMEES = 25

export interface OptionsCreation {
  url: string
  parentId?: string
  constellationId?: string
  position: 'sous-parent' | 'fin'
}

/** Arbre d'étoiles (onglets) : liste plate ordonnée en profondeur d'abord. Pur, sans Electron. */
export class TabTree {
  private stars: Star[] = []
  private constellations: SkyState['constellations'] = []
  private activeId: string | null = null
  private fermees: Star[] = []

  private reindexer(): void {
    this.stars.forEach((s, i) => (s.index = i))
  }

  private indexDe(id: string): number {
    return this.stars.findIndex((s) => s.id === id)
  }

  private descendants(id: string): Star[] {
    const ids = new Set([id])
    const res: Star[] = []
    for (const s of this.stars) {
      if (s.parentId && ids.has(s.parentId)) {
        ids.add(s.id)
        res.push(s)
      }
    }
    return res
  }

  creer(o: OptionsCreation): Star {
    const parentOk = o.parentId !== undefined && this.indexDe(o.parentId) >= 0
    const star: Star = {
      id: randomUUID(),
      url: o.url,
      title: '',
      pinned: false,
      dormant: false,
      index: 0,
      ...(parentOk ? { parentId: o.parentId } : {}),
      ...(o.constellationId ? { constellationId: o.constellationId } : {})
    }
    if (parentOk && o.position === 'sous-parent') {
      const dernier = this.descendants(o.parentId!).at(-1)
      this.stars.splice(this.indexDe((dernier ?? this.stars[this.indexDe(o.parentId!)]).id) + 1, 0, star)
    } else {
      this.stars.push(star)
    }
    this.reindexer()
    return star
  }

  star(id: string): Star | undefined {
    return this.stars.find((s) => s.id === id)
  }

  fermer(id: string): { suivantActif: string | null; fermees: Star[] } {
    const i = this.indexDe(id)
    if (i < 0) return { suivantActif: this.activeId, fermees: [] }
    const star = this.stars[i]
    for (const s of this.stars) {
      if (s.parentId === id) {
        if (star.parentId) s.parentId = star.parentId
        else delete s.parentId
      }
    }
    this.stars.splice(i, 1)
    const suivantActif =
      star.parentId ?? this.stars[i]?.id ?? this.stars[i - 1]?.id ?? null
    this.reindexer()
    this.fermees.push({ ...star })
    if (this.fermees.length > MAX_FERMEES) this.fermees.shift()
    if (this.activeId === id) this.activeId = suivantActif
    return { suivantActif, fermees: [star] }
  }

  activer(id: string): void {
    if (this.indexDe(id) >= 0) this.activeId = id
  }

  deplacer(id: string, o: { parentId?: string; index: number }): void {
    const star = this.star(id)
    if (!star) return
    const bloc = [star, ...this.descendants(id)]
    // Un parent ne peut pas être dans le bloc déplacé (cycle) : on le rend racine.
    const parentValide = o.parentId !== undefined && this.indexDe(o.parentId) >= 0 && !bloc.some((s) => s.id === o.parentId)
    if (parentValide) star.parentId = o.parentId
    else delete star.parentId
    this.stars = this.stars.filter((s) => !bloc.includes(s))
    const idx = Math.max(0, Math.min(o.index, this.stars.length))
    this.stars.splice(idx, 0, ...bloc)
    this.reindexer()
  }

  epingler(id: string, pinned: boolean): void {
    const s = this.star(id)
    if (s) s.pinned = pinned
  }

  rouvrirDerniere(): Star | null {
    const star = this.fermees.pop()
    if (!star) return null
    if (star.parentId && this.indexDe(star.parentId) < 0) delete star.parentId
    if (this.indexDe(star.id) >= 0) star.id = randomUUID()
    this.stars.splice(Math.min(star.index, this.stars.length), 0, star)
    this.reindexer()
    return star
  }

  toJSON(): SkyState {
    return {
      stars: this.stars.map((s) => ({ ...s })),
      constellations: this.constellations.map((c) => ({ ...c })),
      activeId: this.activeId,
      pinned: this.stars.filter((s) => s.pinned).map((s) => s.id)
    }
  }

  static fromJSON(s: SkyState): TabTree {
    const t = new TabTree()
    t.stars = s.stars.map((x) => ({ ...x }))
    t.constellations = s.constellations.map((c) => ({ ...c }))
    t.activeId = s.activeId
    t.reindexer()
    return t
  }
}
