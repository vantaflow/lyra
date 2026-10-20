import { Branche } from './Branche'
import { entreParentheses, raccourciDe } from './raccourcisEffectifs'
import { Epingle } from './Epingle'
import type { Ref } from 'preact'
import { racines, regrouper, reglerCiel } from './cielCommun'
import { glisserEntete, largeurAuClavier, redimensionnerCiel } from './gestes'
import { styleConstellation } from './teinteCiel'
import { variablesAppliquees, versionTheme } from './themeVivant'
import { boucliers, cielDeplacer, couleurParConstellation, cielLargeurAffichee, cielPosition, relierEnfants, sky, telechargementActif } from './state'

const mac = window.lyra.plateforme === 'darwin'
const ouvrirReglages = (): void => void window.lyra.invoke('tabs:open', { url: 'lyra://settings' })

/** Boucliers, extensions, téléchargements, Ne pas déranger, Réglages : le pied du ciel (colonne ou bande). */
export function PiedActions({ souple = true }: { souple?: boolean }) {
  const b = boucliers.value
  const libelleBoucliers = !b.origine
    ? 'Boucliers'
    : b.actif
      ? `Boucliers : ${b.bloques} ${b.bloques > 1 ? 'éléments bloqués' : 'élément bloqué'} sur ce site`
      : 'Boucliers désactivés sur ce site'
  return (
    <>
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
      {souple && <span class="souple"></span>}
      <button class="sb" type="button" aria-label="Extensions" title="Extensions" onClick={() => void window.lyra.invoke('extensions:panel')}>
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
      <button class="sb" type="button" aria-label="Ne pas déranger" title={`Ne pas déranger${entreParentheses('dnd')}`} onClick={() => void window.lyra.invoke('dnd:basculer')}>
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
    </>
  )
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
  const { epinglees, sans, constellations } = regrouper(sky.value)
  versionTheme.value // le ciel de référence des couleurs de constellation change avec le thème

  return (
    <aside
      class={`${revele ? 'ciel ciel-revele' : 'ciel'} pos-${cielPosition.value}${relierEnfants.value ? '' : ' sans-lignes'}`}
      aria-label={revele ? 'Ciel des onglets (survol)' : 'Ciel des onglets'}
      ref={refCiel}
      style={{ width: `${largeur ?? cielLargeurAffichee.value}px` }}
      onMouseEnter={surEntree}
      onMouseLeave={surSortie}
      onFocusOut={surSortieFocus}
    >
      {!revele && (
        <div
          class="poignee-largeur"
          role="separator"
          aria-orientation="vertical"
          aria-label="Largeur du ciel"
          aria-valuemin={200}
          aria-valuemax={420}
          aria-valuenow={cielLargeurAffichee.value}
          tabIndex={0}
          onPointerDown={redimensionnerCiel}
          onKeyDown={largeurAuClavier}
        ></div>
      )}
      <div class={`ciel-entete${cielDeplacer.value ? ' deplacable' : ''}`} onPointerDown={glisserEntete}>
        {mac && cielPosition.value === 'gauche' && <div class="pastilles" aria-hidden="true"></div>}
        <span class="marque-lyra">Lyra</span>
        <span class="souple"></span>
        {revele ? (
          <button class="sb replier" type="button" aria-label="Épingler le ciel" title="Épingler le ciel" onClick={() => void reglerCiel({ masque: false })}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z" />
              <path d="M12 14v7" />
            </svg>
          </button>
        ) : (
          <button class="sb replier" type="button" aria-label="Replier le ciel" title={`Replier le ciel${entreParentheses('basculerCiel')}`} onClick={() => void reglerCiel({ masque: true })}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d={cielPosition.value === 'droite' ? 'M15 4v16' : 'M9 4v16'} />
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
        <kbd>{raccourciDe('palette')}</kbd>
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
        {constellations.map(({ constellation: c, etoiles: groupe }) => (
          <div key={c.id} style={styleConstellation(c.color, couleurParConstellation.value, variablesAppliquees()['--ciel'])}>
            <div class="grp">
              <span>{c.name}</span>
              <span class="grp-n">{groupe.length}</span>
            </div>
            {racines(groupe).map((s) => (
              <Branche key={s.id} star={s} groupe={groupe} />
            ))}
          </div>
        ))}
        <button class="nouvelle" type="button" onClick={() => void window.lyra.invoke('tabs:open', { url: 'lyra://newtab' })}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          <span>Nouvelle étoile</span>
          <kbd style={{ marginLeft: 'auto' }}>{raccourciDe('nouvelleEtoile')}</kbd>
        </button>
      </nav>

      <div class="pied ciel-pied">
        <PiedActions />
      </div>
    </aside>
  )
}
