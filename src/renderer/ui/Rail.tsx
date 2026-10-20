import { useEffect, useRef } from 'preact/hooks'
import { Bande } from './Bande'
import { Sky } from './Sky'
import { BANDE, CAPSULE } from '../../main/window/layout'
import { cielLargeurAffichee, cielPosition, reveler, revelerAuSurvol, revelationClavier } from './state'

const touche = window.lyra.plateforme === 'darwin' ? '⌘' : 'Ctrl'

/** Délai entre la sortie de la souris et le retrait du ciel révélé. */
export const DELAI_RETRAIT_MS = 300
/** Durée de l'animation de glissement (theme.css : --glisse). */
const GLISSE_MS = 180

const mouvementReduit = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Rail du ciel masqué (14 px) : une poignée or ; le survol du rail ou un clic sur la poignée révèle le ciel. */
export function Rail() {
  return (
    <div class={`rail rail-${cielPosition.value}`} aria-label="Rail du ciel masqué" onMouseEnter={() => revelerAuSurvol.value && reveler(true)}>
      <button class="poignee" type="button" aria-label={`Afficher le ciel (${touche} \\)`} onClick={(e) => {
          // detail 0 : activation au clavier (Entrée, Espace).
          revelationClavier.value = e.detail === 0
          reveler(true)
        }}
      ></button>
    </div>
  )
}

/**
 * Le ciel glissé par-dessus la page (la vue chrome couvre la fenêtre et passe au-dessus de la page) : tant que la
 * souris est dessus, rien ne bouge ; 300 ms après sa sortie, il glisse hors de vue puis la vue chrome repasse sous la page.
 */
export function CielRevele() {
  const minuterie = useRef<number | undefined>(undefined)
  const ref = useRef<HTMLElement | null>(null)
  const arreter = (): void => {
    window.clearTimeout(minuterie.current)
    ref.current?.classList.remove('sortant')
  }
  const programmer = (): void => {
    arreter()
    minuterie.current = window.setTimeout(() => {
      if (mouvementReduit()) return reveler(false)
      ref.current?.classList.add('sortant')
      minuterie.current = window.setTimeout(() => reveler(false), GLISSE_MS)
    }, DELAI_RETRAIT_MS)
  }
  useEffect(() => {
    // Révélé au clavier : le focus entre dans le ciel ; il armera le retrait en en sortant.
    if (revelationClavier.value) ref.current?.querySelector<HTMLElement>('button.palette, button.palette-icone')?.focus()
    revelationClavier.value = false
    const echap = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') reveler(false)
    }
    window.addEventListener('keydown', echap)
    return () => {
      window.removeEventListener('keydown', echap)
      window.clearTimeout(minuterie.current)
    }
  }, [])
  const position = cielPosition.value
  const evts = {
    surEntree: arreter,
    surSortie: programmer,
    surSortieFocus: (e: FocusEvent): void => {
      const vers = e.relatedTarget as Node | null
      if (!(vers && ref.current?.contains(vers)) && !ref.current?.matches(':hover')) programmer()
    }
  }
  return (
    <>
      {/* Zone transparente qui recouvre la page : un clic referme la révélation. */}
      <div class="voile" style={{ top: `${position === 'haut' ? BANDE : CAPSULE}px` }} onMouseDown={() => reveler(false)}></div>
      {position === 'haut' || position === 'bas' ? (
        <Bande revele position={position} refCiel={ref} {...evts} />
      ) : (
        <Sky revele refCiel={ref} {...evts} largeur={cielLargeurAffichee.value + 14} />
      )}
    </>
  )
}
