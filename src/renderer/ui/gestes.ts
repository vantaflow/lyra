import type { Settings } from '../../shared/types'
import { bornerLargeur } from '../../main/window/layout'
import { SEUIL_GLISSER, positionDepuisPoint } from './deplacement'
import { cielAppui, cielCible, cielDeplacer, cielLargeur, cielPosition, type PositionCiel } from './state'

const regler = (ciel: Record<string, unknown>): void => void window.lyra.invoke('settings:set', { ciel } as Partial<Settings>)

/** Écoute le glisser d'un bouton enfoncé jusqu'au relâchement (ou Échap) ; la souris peut sortir de la fenêtre. */
function suivre(e: PointerEvent, bouge: (e: PointerEvent) => void, fin: (e: PointerEvent | null) => void): void {
  const cible = e.currentTarget as HTMLElement
  try {
    cible.setPointerCapture(e.pointerId)
  } catch {
    /* capture indisponible : les écouteurs de la fenêtre suffisent */
  }
  const arreter = (): void => {
    window.removeEventListener('pointermove', bouge)
    window.removeEventListener('pointerup', relache)
    window.removeEventListener('pointercancel', annule)
    window.removeEventListener('keydown', touche)
    try {
      cible.releasePointerCapture(e.pointerId)
    } catch {
      /* déjà relâchée */
    }
  }
  const relache = (ev: PointerEvent): void => {
    arreter()
    fin(ev)
  }
  const annule = (): void => {
    arreter()
    fin(null)
  }
  const touche = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') annule()
  }
  window.addEventListener('pointermove', bouge)
  window.addEventListener('pointerup', relache)
  window.addEventListener('pointercancel', annule)
  window.addEventListener('keydown', touche)
}

/**
 * Appui sur l'en-tête du ciel : au-delà de quelques pixels c'est un glisser, le bord visé s'affiche ; relâché dans la
 * moitié d'écran d'un autre bord, le ciel s'y déplace (démasqué).
 */
export function glisserEntete(e: PointerEvent): void {
  if (!cielDeplacer.value || e.button !== 0) return
  if ((e.target as HTMLElement).closest('button')) return
  const x0 = e.clientX
  const y0 = e.clientY
  let actif = false
  // Levé tout de suite : les zones de déplacement de la fenêtre (capsule) avaleraient le relâchement.
  cielAppui.value = true
  const viser = (ev: PointerEvent): PositionCiel | null => {
    if (!actif && Math.hypot(ev.clientX - x0, ev.clientY - y0) < SEUIL_GLISSER) return null
    actif = true
    return positionDepuisPoint(ev.clientX, ev.clientY, window.innerWidth, window.innerHeight)
  }
  suivre(
    e,
    (ev) => {
      const p = viser(ev)
      if (!p) return
      if (cielCible.value === null) void window.lyra.invoke('ciel:glisse', { actif: true })
      cielCible.value = p
    },
    (ev) => {
      cielAppui.value = false
      const p = ev && actif ? viser(ev) : null
      if (cielCible.value !== null) void window.lyra.invoke('ciel:glisse', { actif: false })
      cielCible.value = null
      if (p && p !== cielPosition.value) regler({ position: p, masque: false })
    }
  )
}

/** Appui sur la poignée du bord du ciel : la largeur suit la souris (bornée 200-420), à chaud. */
export function redimensionnerCiel(e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  let attente: number | undefined
  let derniere = cielLargeur.value
  const envoyer = (): void => {
    attente = undefined
    if (derniere !== cielLargeur.value) regler({ largeur: derniere })
  }
  const largeurPour = (ev: PointerEvent): number =>
    bornerLargeur(cielPosition.value === 'droite' ? window.innerWidth - ev.clientX : ev.clientX)
  suivre(
    e,
    (ev) => {
      derniere = largeurPour(ev)
      if (attente === undefined) attente = window.requestAnimationFrame(envoyer)
    },
    (ev) => {
      if (attente !== undefined) window.cancelAnimationFrame(attente)
      if (ev) derniere = largeurPour(ev)
      envoyer()
    }
  )
}

/** Poignée de largeur au clavier : flèches ±16 px (Maj ±64). */
export function largeurAuClavier(e: KeyboardEvent): void {
  const sens = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  if (!sens) return
  e.preventDefault()
  const pas = (e.shiftKey ? 64 : 16) * (cielPosition.value === 'droite' ? -sens : sens)
  regler({ largeur: bornerLargeur(cielLargeur.value + pas) })
}
