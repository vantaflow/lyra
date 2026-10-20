// Masquage automatique de la capsule : machine à états pure, horloge injectable.
// Masquée après 2 s sans mouvement ; visible dès un mouvement ou à moins de 40 px du haut ; jamais masquée si désactivé.

export const DELAI_MASQUAGE_MS = 2000
export const SEUIL_HAUT_PX = 40

export interface Horloge {
  setTimeout(f: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}

export interface CapsuleAuto {
  /** Active ou désactive le masquage ; désactiver réaffiche la capsule. */
  activer(actif: boolean): void
  /** Mouvement de la souris à la hauteur `y` (px depuis le haut de la fenêtre). */
  mouvement(y: number): void
  visible(): boolean
}

export function creerCapsuleAuto(o: {
  horloge?: Horloge
  surChange: (visible: boolean) => void
  delaiMs?: number
  seuilHautPx?: number
}): CapsuleAuto {
  const horloge: Horloge = o.horloge ?? { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) }
  const delai = o.delaiMs ?? DELAI_MASQUAGE_MS
  const seuil = o.seuilHautPx ?? SEUIL_HAUT_PX
  let actif = false
  let visible = true
  let minuterie: unknown
  let armee = false

  const poser = (v: boolean): void => {
    if (v === visible) return
    visible = v
    o.surChange(v)
  }
  const annuler = (): void => {
    if (armee) horloge.clearTimeout(minuterie)
    armee = false
  }
  const armer = (): void => {
    annuler()
    if (!actif) return
    armee = true
    minuterie = horloge.setTimeout(() => {
      armee = false
      poser(false)
    }, delai)
  }

  return {
    activer(a) {
      actif = a
      if (a) armer()
      else {
        annuler()
        poser(true)
      }
    },
    mouvement(y) {
      poser(true)
      if (y < seuil) annuler()
      else armer()
    },
    visible: () => visible
  }
}
