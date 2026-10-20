import { randomUUID } from 'node:crypto'
import type { Constellation, SkyState, Star } from '../../shared/types'

const MAX_FERMEES = 25

export interface OptionsCreation {
  url: string
  parentId?: string
  /** Position `apres` : rangée après cette étoile et ses descendantes, sans lien de parenté. */
  apresId?: string
  constellationId?: string
  position: 'sous-parent' | 'apres' | 'fin' | 'fin-constellation'
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

  /** Racine (sans parent connu) de l'arbre qui contient `id`. */
  private racineDe(id: string): string {
    let courant = this.stars[this.indexDe(id)]
    const vus = new Set<string>()
    while (courant?.parentId && !vus.has(courant.id)) {
      vus.add(courant.id)
      const parent = this.stars[this.indexDe(courant.parentId)]
      if (!parent) break
      courant = parent
    }
    return courant.id
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
    } else if (o.position === 'apres' && o.apresId !== undefined && this.indexDe(o.apresId) >= 0) {
      // Si l'étoile est elle-même reliée, la nouvelle va après le sous-arbre de sa racine : insérée entre deux sœurs, une étoile sans lien
      // couperait le sous-arbre de leur parent (l'ordre de la liste ne suivrait plus l'affichage).
      const racine = this.racineDe(o.apresId)
      const fin = this.descendants(racine).at(-1)
      this.stars.splice(this.indexDe((fin ?? this.stars[this.indexDe(racine)]).id) + 1, 0, star)
    } else if (o.position === 'fin-constellation' && o.constellationId && this.stars.some((s) => s.constellationId === o.constellationId)) {
      // Après la dernière étoile de la constellation (et ses descendants, qui la suivent dans la liste).
      const dernier = this.stars.findLastIndex((s) => s.constellationId === o.constellationId)
      const fin = this.descendants(this.stars[dernier].id).at(-1)
      this.stars.splice(this.indexDe((fin ?? this.stars[dernier]).id) + 1, 0, star)
    } else {
      this.stars.push(star)
    }
    this.reindexer()
    return star
  }

  creerConstellation(o: { name: string; color: string; auto?: boolean }): Constellation {
    const c: Constellation = { id: randomUUID(), name: o.name, color: o.color, ...(o.auto ? { auto: true } : {}) }
    this.constellations.push(c)
    return c
  }

  /** Range une étoile dans une constellation existante (sans la déplacer dans la liste). */
  assigner(id: string, constellationId: string): void {
    const s = this.star(id)
    if (s && this.constellation(constellationId)) s.constellationId = constellationId
  }

  /** Retire les constellations créées par le regroupement automatique qui n'ont plus d'étoile ; celles de l'utilisateur ne sont jamais touchées. */
  purgerAutoVides(): void {
    const utilisees = new Set(this.stars.map((s) => s.constellationId))
    this.constellations = this.constellations.filter((c) => !c.auto || utilisees.has(c.id))
  }

  constellation(id: string): Constellation | undefined {
    return this.constellations.find((c) => c.id === id)
  }

  star(id: string): Star | undefined {
    return this.stars.find((s) => s.id === id)
  }

  /** `memoriser: false` (archivage) : l'étoile n'entre pas dans les étoiles fermées que ⌘ ⇧ T peut rouvrir. */
  fermer(id: string, o: { memoriser?: boolean } = {}): { suivantActif: string | null; fermees: Star[] } {
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
    if (o.memoriser !== false) {
      this.fermees.push({ ...star })
      if (this.fermees.length > MAX_FERMEES) this.fermees.shift()
    }
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
    // Sa constellation a pu disparaître entre-temps (constellation automatique vidée par la fermeture).
    if (star.constellationId !== undefined && !this.constellation(star.constellationId)) delete star.constellationId
    star.dormant = false
    delete star.inactifDepuis
    this.stars.splice(Math.min(star.index, this.stars.length), 0, star)
    this.reindexer()
    return star
  }

  /** Lecture du ciel sans copie (placement : appelé à chaque étoile ouverte). Ne jamais modifier ce qui est rendu. */
  lecture(): Pick<SkyState, 'stars' | 'constellations' | 'activeId'> {
    return { stars: this.stars, constellations: this.constellations, activeId: this.activeId }
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
