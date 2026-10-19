import type { Settings, Star as StarT } from '../../shared/types'
import { Branche } from './Branche'
import { Epingle } from './Epingle'
import type { Ref } from 'preact'
import { boucliers, sky, telechargementActif } from './state'

const mac = window.lyra.plateforme === 'darwin'
const ouvrirReglages = (): void => void window.lyra.invoke('tabs:open', { url: 'lyra://settings' })

/** Racines d'un groupe : étoiles dont le parent n'est pas dans le groupe. */
function racines(groupe: StarT[]): StarT[] {
  const ids = new Set(groupe.map((s) => s.id))
  return groupe.filter((s) => !s.parentId || !ids.has(s.parentId))
}

const masquerCiel = (masque: boolean): void => {
  const patch: Record<string, unknown> = { ciel: { masque } }
  void window.lyra.invoke('settings:set', patch as Partial<Settings>)
}

interface PropsSky {
  /** Ciel masqué révélé : glissé par-dessus la page, avec « Épingler le ciel » à la place de « Replier le ciel ». */
  revele?: boolean
  refCiel?: Ref<HTMLElement>
  surEntree?: () => void
  surSortie?: () => void
  /** Le focus quitte le ciel (clavier). */
  surSortieFocus?: (e: FocusEvent) => void
  /** Largeur imposée (ciel révélé : largeur du ciel + rail). */
  largeur?: number
}

export function Sky({ revele = false, refCiel, surEntree, surSortie, surSortieFocus, largeur }: PropsSky = {}) {
  const { stars, constellations } = sky.value
  const ouvertes = stars.filter((s) => !s.pinned)
  const epinglees = stars.filter((s) => s.pinned)
  const connues = new Set(constellations.map((c) => c.id))
  const sans = ouvertes.filter((s) => !s.constellationId || !connues.has(s.constellationId))
  const touche = mac ? '⌘' : 'Ctrl'
  const b = boucliers.value
  const libelleBoucliers = !b.origine
    ? 'Boucliers'
    : b.actif
      ? `Boucliers : ${b.bloques} ${b.bloques > 1 ? 'éléments bloqués' : 'élément bloqué'} sur ce site`
      : 'Boucliers désactivés sur ce site'

  return (
    <aside
      class={revele ? 'ciel ciel-revele' : 'ciel'}
      aria-label={revele ? 'Ciel des onglets (survol)' : 'Ciel des onglets'}
      ref={refCiel}
      style={largeur ? { width: `${largeur}px` } : undefined}
      onMouseEnter={surEntree}
      onMouseLeave={surSortie}
      onFocusOut={surSortieFocus}
    >
      <div class="ciel-entete">
        {mac && <div class="pastilles" aria-hidden="true"></div>}
        <span class="marque-lyra">Lyra</span>
        <span class="souple"></span>
        {revele ? (
          <button class="sb replier" type="button" aria-label="Épingler le ciel" title="Épingler le ciel" onClick={() => masquerCiel(false)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z" />
              <path d="M12 14v7" />
            </svg>
          </button>
        ) : (
          <button class="sb replier" type="button" aria-label="Replier le ciel" title={`Replier le ciel (${touche} \\)`} onClick={() => masquerCiel(true)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 4v16" />
            </svg>
          </button>
        )}
      </div>

      <button class="palette" type="button" aria-label="Aller à une adresse, rechercher ou lancer une commande" onClick={() => void window.lyra.invoke('palette:open')}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
        <span class="palette-texte">Aller à, rechercher, commander…</span>
        <kbd>{touche} L</kbd>
      </button>

      {epinglees.length > 0 && (
        <div class="epingles" aria-label="Onglets épinglés">
          {epinglees.map((s) => (
            <Epingle key={s.id} star={s} />
          ))}
        </div>
      )}

      <nav class="etoiles" aria-label="Onglets ouverts">
        {racines(sans).map((s) => (
          <Branche key={s.id} star={s} groupe={sans} />
        ))}
        {constellations.map((c) => {
          const groupe = ouvertes.filter((s) => s.constellationId === c.id)
          if (groupe.length === 0) return null
          return (
            <div key={c.id}>
              <div class="grp">
                <span>{c.name}</span>
                <span class="grp-n">{groupe.length}</span>
              </div>
              {racines(groupe).map((s) => (
                <Branche key={s.id} star={s} groupe={groupe} />
              ))}
            </div>
          )
        })}
        <button class="nouvelle" type="button" onClick={() => void window.lyra.invoke('tabs:open', { url: 'lyra://newtab' })}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          <span>Nouvelle étoile</span>
          <kbd style={{ marginLeft: 'auto' }}>{touche} T</kbd>
        </button>
      </nav>

      <div class="pied ciel-pied">
        <button
          class={`boucliers${b.origine && !b.actif ? ' off' : ''}`}
          type="button"
          aria-label={libelleBoucliers}
          title={libelleBoucliers}
          onClick={() => void window.lyra.invoke('shields:open')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span class="boucliers-n">{b.bloques}</span>
        </button>
        <span class="souple"></span>
        <button class="sb" type="button" aria-label="Extensions">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 4a2 2 0 0 1 4 0v1h3a1 1 0 0 1 1 1v3h1a2 2 0 0 1 0 4h-1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 0 0-4 0v1H7a1 1 0 0 1-1-1v-3H5a2 2 0 0 1 0-4h1V6a1 1 0 0 1 1-1h3z" />
          </svg>
        </button>
        <button
          class={`sb dl${telechargementActif.value ? ' actif' : ''}`}
          type="button"
          aria-label="Téléchargements"
          title={telechargementActif.value ? 'Téléchargements (en cours)' : 'Téléchargements'}
          onClick={() => void window.lyra.invoke('downloads:panel')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 4v11" />
            <path d="M7 11l5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        </button>
        <button class="sb" type="button" aria-label="Ne pas déranger">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
          </svg>
        </button>
        <button class="sb" type="button" aria-label="Réglages" onClick={ouvrirReglages}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
