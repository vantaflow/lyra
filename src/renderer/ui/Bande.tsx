import { Fragment, type Ref } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import type { Star as StarT } from '../../shared/types'
import { racines, regrouper, reglerCiel } from './cielCommun'
import { glisserEntete } from './gestes'
import { Epingle } from './Epingle'
import { PiedActions } from './Sky'
import { cielDeplacer, estTerne, etats, sky, titreEtoile } from './state'

const mac = window.lyra.plateforme === 'darwin'
const touche = mac ? '⌘' : 'Ctrl'

/** Descendants d'une étoile, à plat (ordre du ciel) : chacun devient un petit point relié. */
function descendants(racine: StarT, groupe: StarT[]): StarT[] {
  const ids = new Set([racine.id])
  const res: StarT[] = []
  for (const s of groupe) {
    if (s.parentId && ids.has(s.parentId)) {
      ids.add(s.id)
      res.push(s)
    }
  }
  return res
}

function Etoiles({ groupe }: { groupe: StarT[] }) {
  const activeId = sky.value.activeId
  const activer = (id: string): void => void window.lyra.invoke('tabs:activate', { id })
  // Clic du milieu : ferme l'onglet.
  const fermer = (e: MouseEvent, id: string): void => {
    if (e.button !== 1) return
    e.preventDefault()
    void window.lyra.invoke('tabs:close', { id })
  }
  return (
    <>
      {racines(groupe).map((s) => {
        const titre = titreEtoile(s, etats.value[s.id])
        return (
          <Fragment key={s.id}>
            <button
              class={['hs', s.id === activeId ? 'active' : '', s.dormant ? 'dim' : '', estTerne(s, etats.value[s.id]) ? 'terne' : ''].filter(Boolean).join(' ')}
              type="button"
              title={titre}
              onClick={() => activer(s.id)}
              onAuxClick={(e) => fermer(e, s.id)}
            >
              <span class="dot" aria-hidden="true"></span>
              <span class="t">{titre}</span>
            </button>
            {descendants(s, groupe).map((e) => {
              const t = titreEtoile(e, etats.value[e.id])
              return (
                <button
                  key={e.id}
                  class={`hc${e.id === activeId ? ' active' : ''}${e.dormant ? ' dim' : ''}`}
                  type="button"
                  aria-label={`${t} (onglet lié${e.dormant ? ', dormant' : ''})`}
                  title={t}
                  onClick={() => activer(e.id)}
                  onAuxClick={(ev) => fermer(ev, e.id)}
                >
                  <i aria-hidden="true"></i>
                  <b aria-hidden="true"></b>
                </button>
              )
            })}
          </Fragment>
        )
      })}
    </>
  )
}

interface Props {
  /** Bande révélée par-dessus la page (ciel masqué). */
  revele?: boolean
  position: 'haut' | 'bas'
  refCiel?: Ref<HTMLElement>
  surEntree?: () => void
  /** La souris quitte le ciel (le point de sortie dit si elle part vers la page). */
  surSortie?: (e: MouseEvent) => void
  surSortieFocus?: (e: FocusEvent) => void
}

/** Le ciel en bande de 56 px (CielHaut.dc.html, CielBas.dc.html) : étoiles en ligne, enfants en petits points reliés. */
export function Bande({ revele = false, position, refCiel, surEntree, surSortie, surSortieFocus }: Props) {
  const { epinglees, sans, constellations } = regrouper(sky.value)
  const defilement = useRef<HTMLElement | null>(null)
  const activeId = sky.value.activeId
  // L'étoile active reste dans la vue, même quand la bande défile.
  useEffect(() => {
    defilement.current?.querySelector<HTMLElement>('.hs.active, .hc.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeId, sans.length, constellations.length])
  // Molette verticale = défilement horizontal.
  const molette = (e: WheelEvent): void => {
    const el = defilement.current
    if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }
  return (
    <aside
      class={`bande bande-${position}${revele ? ' bande-revele' : ''}`}
      aria-label={revele ? 'Ciel des onglets (survol)' : 'Ciel des onglets'}
      ref={refCiel}
      onMouseEnter={surEntree}
      onMouseLeave={surSortie}
      onFocusOut={surSortieFocus}
    >
      <div class={`bande-entete${cielDeplacer.value ? ' deplacable' : ''}`} onPointerDown={glisserEntete}>
        {mac && position === 'haut' && <div class="pastilles" aria-hidden="true"></div>}
        <span class="marque-lyra">Lyra</span>
      </div>
      <button class="sb palette-icone" type="button" aria-label={`Aller à, rechercher, commander (${touche} L)`} onClick={() => void window.lyra.invoke('palette:open')}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
      </button>
      <span aria-hidden="true" style={{ width: '6px' }}></span>
      {epinglees.map((s) => (
        <Epingle key={s.id} star={s} />
      ))}
      {epinglees.length > 0 && <span class="bande-sep" aria-hidden="true"></span>}
      <nav class="bande-etoiles" aria-label="Onglets ouverts" ref={defilement} onWheel={molette}>
        <Etoiles groupe={sans} />
        {constellations.map(({ constellation: c, etoiles: groupe }) => (
          <Fragment key={c.id}>
            <span class="hg">{c.name}</span>
            <Etoiles groupe={groupe} />
          </Fragment>
        ))}
      </nav>
      {/* Hors du défilement : « Nouvelle étoile » reste toujours à portée. */}
      <button class="sb nouvelle-icone" type="button" aria-label={`Nouvelle étoile (${touche} T)`} onClick={() => void window.lyra.invoke('tabs:open', { url: 'lyra://newtab' })}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
      <span class="souple"></span>
      {revele && (
        <button class="sb" type="button" aria-label="Épingler le ciel" title="Épingler le ciel" onClick={() => void reglerCiel({ masque: false })}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z" />
            <path d="M12 14v7" />
          </svg>
        </button>
      )}
      <PiedActions souple={false} />
    </aside>
  )
}
