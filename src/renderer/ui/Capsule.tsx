import { useEffect } from 'preact/hooks'
import { ouvrirRecherche } from './FindBar'
import { actif, estNouvelleEtoile, etatActif, favori, rafraichirFavori } from './state'

interface Affichage {
  /** Icône : cadenas vert (https), avertissement (http), engrenage (lyra://), aucune. */
  icone: 'cadenas' | 'alerte' | 'engrenage' | null
  avant?: string
  domaine: string
  chemin: string
  etiquette: string
  discret?: boolean
}

/** Ce que la pilule affiche pour une URL. file:// → « fichier local » + nom du fichier. */
export function affichagePilule(url: string): Affichage {
  if (!url || estNouvelleEtoile(url)) {
    return { icone: null, domaine: 'Nouvel onglet', chemin: '', etiquette: 'Nouvel onglet — modifier l’adresse', discret: true }
  }
  if (url.startsWith('lyra://')) {
    return { icone: 'engrenage', domaine: url, chemin: '', etiquette: `${url} — page Lyra` }
  }
  try {
    const u = new URL(url)
    if (u.protocol === 'file:') {
      const nom = decodeURIComponent(u.pathname.split('/').filter(Boolean).at(-1) ?? '')
      return { icone: null, domaine: 'fichier local', chemin: nom ? `/${nom}` : '', etiquette: 'fichier local — modifier l’adresse' }
    }
    const hote = u.hostname.replace(/^www\./, '')
    const chemin = (u.pathname === '/' ? '' : u.pathname) + u.search
    if (u.protocol === 'https:') {
      return { icone: 'cadenas', domaine: hote, chemin, etiquette: `${hote}, connexion sécurisée — modifier l’adresse` }
    }
    return { icone: 'alerte', avant: 'Non sécurisé', domaine: hote, chemin, etiquette: `${hote}, connexion non sécurisée — modifier l’adresse` }
  } catch {
    return { icone: null, domaine: url, chemin: '', etiquette: `${url} — modifier l’adresse` }
  }
}

const palette = (): void => void window.lyra.invoke('palette:open')

export function Capsule() {
  const star = actif.value
  const etat = etatActif.value
  const id = star?.id
  const url = etat?.url || star?.url || ''
  const p = affichagePilule(url)
  const charge = etat?.chargement ?? false
  useEffect(() => rafraichirFavori(url), [url])
  const peutFavori = !!url && !url.startsWith('lyra://')
  const basculerFavori = (): void => {
    if (!peutFavori) return
    void window.lyra.invoke('bookmarks:toggle', { url, title: etat?.titre || star?.title || url })
  }
  const ouvrirMenu = (e: MouseEvent): void => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    void window.lyra.invoke('menu:open', { droite: r.right, bas: r.bottom })
  }
  const agir = (canal: 'tabs:back' | 'tabs:forward' | 'tabs:reload' | 'tabs:stop') => () => {
    if (id) void window.lyra.invoke(canal, { id })
  }

  return (
    <div class="capsule">
      <button class="cb" type="button" aria-label="Page précédente" disabled={!id || !etat?.canGoBack} onClick={agir('tabs:back')}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <button class="cb" type="button" aria-label="Page suivante" disabled={!id || !etat?.canGoForward} onClick={agir('tabs:forward')}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {charge ? (
        <button class="cb" type="button" aria-label="Arrêter le chargement" disabled={!id} onClick={agir('tabs:stop')}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </svg>
        </button>
      ) : (
        <button class="cb" type="button" aria-label="Recharger" disabled={!id} onClick={agir('tabs:reload')}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.3-5.7" />
            <path d="M20 4v5h-5" />
          </svg>
        </button>
      )}
      <span class="souple"></span>
      <button class={`pilule${p.discret ? ' discrete' : ''}`} type="button" aria-label={p.etiquette} onClick={palette}>
        {p.icone === 'cadenas' && (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#1E7F6C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        )}
        {p.icone === 'alerte' && (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#8E2E22" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.9L2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        )}
        {p.icone === 'engrenage' && (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#5452C8" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
          </svg>
        )}
        {p.avant && <span class="alerte">{p.avant}</span>}
        <span>{p.domaine}</span>
        {p.chemin && <span class="chemin">{p.chemin}</span>}
        {etat?.zoom !== undefined && <span class="zoom-ind">{Math.round(etat.zoom * 100)} %</span>}
      </button>
      <span class="souple"></span>
      <button
        class={`cb${favori.value ? ' favori' : ''}`}
        type="button"
        aria-label={favori.value ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        aria-pressed={favori.value}
        disabled={!peutFavori}
        onClick={basculerFavori}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill={favori.value ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.8-5.3 2.8 1.1-5.9L5.5 9.7l5.9-.8z" />
        </svg>
      </button>
      <button class="cb" type="button" aria-label="Rechercher dans la page" disabled={!peutFavori} onClick={ouvrirRecherche}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
      </button>
      <button class="cb" type="button" aria-label="Menu de la page" aria-haspopup="menu" disabled={!id} onClick={ouvrirMenu}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
    </div>
  )
}
