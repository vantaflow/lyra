import { useEffect } from 'preact/hooks'
import { texteFenetres, texteNotifications, texteReste } from '../../main/dnd/Dnd'
import { dnd, maintenant } from './state'

const CROISSANT = 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'
const sortir = (): void => void window.lyra.invoke('dnd:sortir')

/**
 * Mode Ne pas déranger : la vue chrome ne couvre plus que le coin haut droit. Rappel discret (NePasDeranger.dc.html :
 * croissant or, « Ne pas déranger », compteur et temps restant, Échap, croissant de sortie) qui s'efface au bout
 * de quelques secondes (le main pilote le délai) pour ne laisser que le croissant ; le survol du croissant le rappelle.
 */
export function RappelDnd() {
  const e = dnd.value
  useEffect(() => {
    const echap = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') sortir()
    }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [])
  if (!e.actif) return null
  if (!e.rappel) {
    return (
      <button
        class="dnd-croissant"
        type="button"
        aria-label="Quitter le mode Ne pas déranger"
        title="Quitter le mode Ne pas déranger (Échap)"
        onClick={sortir}
        onMouseEnter={() => void window.lyra.invoke('dnd:rappel')}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#F4C56A" aria-hidden="true">
          <path d={CROISSANT} />
        </svg>
      </button>
    )
  }
  const detail = [texteNotifications(e.notifications), texteFenetres(e.popups), texteReste(e.fin, Math.max(maintenant.value, Date.now()))].filter(Boolean).join(' · ')
  return (
    <div class="dnd-rappel" role="status">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="#F4C56A" aria-hidden="true">
        <path d={CROISSANT} />
      </svg>
      <span class="dnd-titre">Ne pas déranger</span>
      <span class="dnd-detail">{detail}</span>
      <kbd>Échap</kbd>
      <button class="dnd-quitter" type="button" aria-label="Quitter le mode Ne pas déranger" onClick={sortir}>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
