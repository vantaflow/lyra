import { useEffect, useRef } from 'preact/hooks'
import { Sky } from './Sky'
import { reveler, revelerAuSurvol } from './state'

const touche = window.lyra.plateforme === 'darwin' ? '⌘' : 'Ctrl'

/** Délai entre la sortie de la souris et le retrait du ciel révélé. */
export const DELAI_RETRAIT_MS = 300
/** Durée de l'animation de glissement (theme.css : --glisse). */
const GLISSE_MS = 180

const mouvementReduit = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Rail du ciel masqué (14 px) : une poignée or ; le survol du rail ou un clic sur la poignée révèle le ciel. */
export function Rail() {
  return (
    <div class="rail" aria-label="Rail du ciel masqué" onMouseEnter={() => revelerAuSurvol.value && reveler(true)}>
      <button class="poignee" type="button" aria-label={`Afficher le ciel (${touche} \\)`} onClick={() => reveler(true)}></button>
    </div>
  )
}

/**
 * Le ciel glissé par-dessus la page. Le main a élargi la vue chrome à sa largeur : tant que la souris est dessus,
 * rien ne bouge ; 300 ms après sa sortie, il glisse hors de vue puis la vue chrome reprend sa taille.
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
    const echap = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') reveler(false)
    }
    window.addEventListener('keydown', echap)
    return () => {
      window.removeEventListener('keydown', echap)
      window.clearTimeout(minuterie.current)
    }
  }, [])
  return <Sky revele refCiel={ref} surEntree={arreter} surSortie={programmer} />
}
