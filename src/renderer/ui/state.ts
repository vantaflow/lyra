import { computed, signal } from '@preact/signals'
import type { EtatBoucliers, EtatEtoile } from '../../shared/ipc'
import type { SkyState, Star } from '../../shared/types'

const CIEL_VIDE: SkyState = { stars: [], constellations: [], activeId: null, pinned: [] }

/** lyra://newtab, avec ou sans « / » final (Chromium normalise l'URL). */
export const estNouvelleEtoile = (url: string): boolean => /^lyra:\/\/newtab\/?$/.test(url)

export const sky = signal<SkyState>(CIEL_VIDE)
export const etats = signal<Record<string, EtatEtoile>>({})
export const actif = computed<Star | undefined>(() => sky.value.stars.find((s) => s.id === sky.value.activeId))
export const etatActif = computed<EtatEtoile | undefined>(() => (sky.value.activeId ? etats.value[sky.value.activeId] : undefined))

/** Boucliers de l'étoile active (compteur du pied du ciel). */
export const boucliers = signal<EtatBoucliers>({ actif: false, bloques: 0, origine: '', dernieres: [] })

const rafraichirBoucliers = (): void => {
  void window.lyra.invoke('shields:get').then((b) => (boucliers.value = b))
}

/** Étoile en cours de glisser-déposer. */
export const glisse = signal<string | null>(null)

export async function initialiserEtat(): Promise<void> {
  window.lyra.on('sky:changed', (c) => {
    sky.value = c.sky
    etats.value = c.etats
    // Étoile activée ou page changée : le compteur suit l'étoile active.
    rafraichirBoucliers()
  })
  window.lyra.on('shields:changed', (b) => (boucliers.value = b))
  const c = await window.lyra.invoke('sky:get')
  sky.value = c.sky
  etats.value = c.etats
  rafraichirBoucliers()
}

export function titreEtoile(star: Star, etat?: EtatEtoile): string {
  const url = etat?.url || star.url
  if (estNouvelleEtoile(url)) return 'Nouvelle étoile'
  const titre = etat?.titre || star.title
  if (titre) return titre
  try {
    const u = new URL(url)
    return u.hostname || decodeURIComponent(u.pathname.split('/').filter(Boolean).at(-1) ?? '') || url
  } catch {
    return url
  }
}

/** Descendants d'une étoile dans la liste plate (ordre profondeur d'abord). */
function bloc(stars: Star[], id: string): Star[] {
  const ids = new Set([id])
  const res: Star[] = []
  for (const s of stars) {
    if (s.id === id || (s.parentId && ids.has(s.parentId))) {
      ids.add(s.id)
      res.push(s)
    }
  }
  return res
}

/** Dépose l'étoile glissée avant ou après la cible (même parent que la cible). */
export function deposer(cibleId: string, apres: boolean): void {
  const id = glisse.value
  glisse.value = null
  if (!id || id === cibleId) return
  const stars = sky.value.stars
  const deplace = new Set(bloc(stars, id).map((s) => s.id))
  if (deplace.has(cibleId)) return
  const restantes = stars.filter((s) => !deplace.has(s.id))
  const cible = stars.find((s) => s.id === cibleId)
  if (!cible) return
  let index: number
  if (apres) {
    const fin = bloc(restantes, cibleId).at(-1)!
    index = restantes.indexOf(fin) + 1
  } else {
    index = restantes.indexOf(cible)
  }
  void window.lyra.invoke('tabs:move', { id, parentId: cible.parentId, index })
}
