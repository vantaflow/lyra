import { bornerLargeur } from '../../main/window/layout'
import { reglerCiel } from './cielCommun'
import { SEUIL_GLISSER, bordVise } from './deplacement'
import { cielAppui, cielCible, cielDeplacer, cielLargeur, cielLargeurApercu, cielPosition, type PositionCiel } from './state'

/**
 * Écoute un glisser (bouton enfoncé) jusqu'au relâchement. Il est annulé par Échap, par la perte du focus de la
 * fenêtre et par la perte de la capture du pointeur ; la souris peut sortir de la fenêtre.
 */
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
    window.removeEventListener('blur', annule)
    window.removeEventListener('keydown', touche)
    cible.removeEventListener('lostpointercapture', annule)
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
  window.addEventListener('blur', annule)
  window.addEventListener('keydown', touche)
  cible.addEventListener('lostpointercapture', annule)
}

const glisse = (actif: boolean): Promise<void> => window.lyra.invoke('ciel:glisse', { actif })

/**
 * Appui sur l'en-tête du ciel : au-delà de quelques pixels c'est un glisser ; tant que le point reste sur le ciel
 * courant rien ne change. Sur un autre bord, le repère s'affiche (la page se retire) ; relâché là, le ciel s'y
 * déplace (démasqué). Le réglage est écrit AVANT que la page ne revienne : pas de flash à l'ancien emplacement.
 */
export function glisserEntete(e: PointerEvent): void {
  if (!cielDeplacer.value || e.button !== 0) return
  if ((e.target as HTMLElement).closest('button')) return
  const x0 = e.clientX
  const y0 = e.clientY
  let actif = false
  let enGlisse = false
  // Levé tout de suite : les zones de déplacement de la fenêtre (capsule) avaleraient le relâchement.
  cielAppui.value = true
  // Un ciel révélé a l'épaisseur du ciel (pas celle du rail) : on vise à partir du ciel affiché.
  const viser = (ev: PointerEvent): PositionCiel | null => {
    if (!actif && Math.hypot(ev.clientX - x0, ev.clientY - y0) < SEUIL_GLISSER) return null
    actif = true
    const p = bordVise(
      ev.clientX,
      ev.clientY,
      { width: window.innerWidth, height: window.innerHeight },
      { position: cielPosition.value, largeur: cielLargeur.value, masque: false }
    )
    return p === cielPosition.value ? null : p
  }
  const montrer = async (p: PositionCiel | null): Promise<void> => {
    cielCible.value = p
    if (p && !enGlisse) {
      enGlisse = true
      await glisse(true)
    } else if (!p && enGlisse) {
      enGlisse = false
      await glisse(false)
    }
  }
  suivre(
    e,
    (ev) => void montrer(viser(ev)),
    async (ev) => {
      cielAppui.value = false
      const p = ev && actif ? viser(ev) : null
      cielCible.value = null
      try {
        if (p) await reglerCiel({ position: p, masque: false })
      } finally {
        if (enGlisse) {
          enGlisse = false
          await glisse(false)
        }
      }
    }
  )
}

/**
 * Appui sur la poignée du bord du ciel : la largeur suit la souris (bornée 200-420) en direct, par un aperçu léger
 * (rien n'est écrit) ; elle n'est enregistrée qu'au relâchement. Échap ou perte du focus : retour à la largeur d'origine.
 */
export function redimensionnerCiel(e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  const depart = cielLargeur.value
  let attente: number | undefined
  let derniere = depart
  const apercu = (): void => {
    attente = undefined
    cielLargeurApercu.value = derniere
    void window.lyra.invoke('ciel:apercu', { largeur: derniere })
  }
  const largeurPour = (ev: PointerEvent): number =>
    bornerLargeur(cielPosition.value === 'droite' ? window.innerWidth - ev.clientX : ev.clientX)
  suivre(
    e,
    (ev) => {
      derniere = largeurPour(ev)
      if (attente === undefined) attente = window.requestAnimationFrame(apercu)
    },
    async (ev) => {
      if (attente !== undefined) window.cancelAnimationFrame(attente)
      attente = undefined
      try {
        if (ev) {
          derniere = largeurPour(ev)
          if (derniere !== depart) await reglerCiel({ largeur: derniere })
        }
      } finally {
        cielLargeurApercu.value = null
        await window.lyra.invoke('ciel:apercu', { largeur: null })
      }
    }
  )
}

/** Poignée de largeur au clavier : flèches ±16 px (Maj ±64). */
export function largeurAuClavier(e: KeyboardEvent): void {
  const sens = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  if (!sens) return
  e.preventDefault()
  const pas = (e.shiftKey ? 64 : 16) * (cielPosition.value === 'droite' ? -sens : sens)
  void reglerCiel({ largeur: bornerLargeur(cielLargeur.value + pas) })
}
