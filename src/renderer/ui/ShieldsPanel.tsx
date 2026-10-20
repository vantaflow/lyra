import { useEffect, useState } from 'preact/hooks'
import type { EtatBoucliers } from '../../shared/ipc'
import type { Settings } from '../../shared/types'
import { placement } from './placements'

function hote(origine: string): string {
  if (origine === 'file://') return 'fichiers locaux'
  try {
    return new URL(origine).host
  } catch {
    return origine
  }
}

type Niveau = EtatBoucliers['niveau']
const NIVEAUX: { id: Niveau; libelle: string }[] = [
  { id: 'desactives', libelle: 'Désactivés' },
  { id: 'standard', libelle: 'Standard' },
  { id: 'strict', libelle: 'Strict' }
]

const sansSchema = (url: string): string => url.replace(/^[a-z]+:\/\//i, '')

/** Panneau des Boucliers (fidèle à docs/design/project/Panneaux.dc.html, section Boucliers). */
export function ShieldsPanel() {
  const [etat, setEtat] = useState<EtatBoucliers | null>(null)
  const [reglages, setReglages] = useState<Settings | null>(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    void window.lyra.invoke('shields:get').then(setEtat)
    void window.lyra.invoke('settings:get').then(setReglages)
    const off = window.lyra.on('shields:changed', setEtat)
    const touche = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        fermer()
      }
    }
    document.addEventListener('keydown', touche)
    return () => {
      off()
      document.removeEventListener('keydown', touche)
    }
  }, [])

  const fermer = (): void => void window.lyra.invoke('overlay:close')
  const basculer = (actif: boolean): void => {
    if (!etat?.origine || etat.privee) return
    setEtat({ ...etat, actif, niveau: actif ? (etat.niveau === 'desactives' ? 'standard' : etat.niveau) : 'desactives' })
    setErreur('')
    window.lyra.invoke('shields:toggleSite', { origine: etat.origine, actif }).catch(() => setErreur("Le réglage n'a pas pu être enregistré."))
  }

  const interne = etat !== null && etat.origine === ''
  const siteWeb = /^https?:/.test(etat?.origine ?? '')
  const actif = etat?.actif ?? false
  const niveau = etat?.niveau ?? 'standard'
  const n = etat?.bloques ?? 0
  const lectureSeule = !siteWeb || etat === null || etat.privee === true
  // Même écriture que « Boucliers du site » des règles par site : le niveau Strict est mémorisé pour la réactivation.
  const regler = (v: Niveau): void => {
    if (!etat || lectureSeule || v === niveau) return
    setEtat({ ...etat, niveau: v, actif: v !== 'desactives' })
    const regle = v === 'desactives' ? { boucliers: v, ...(niveau === 'strict' ? { bouclierAvant: 'strict' as const } : {}) } : { boucliers: v, bouclierAvant: null }
    window.lyra.invoke('sites:ecrire', { cle: etat.origine, regle }).catch(() => setErreur("Le niveau n'a pas pu être enregistré."))
  }
  const sousTitre = interne ? 'Rien à bloquer ici' : actif ? `Boucliers actifs — règle ${niveau}` : 'Boucliers désactivés sur ce site'

  return (
    <div class="pn-fond" onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <section class="pn-bouclier" role="dialog" aria-label="Panneau des boucliers" style={{ ...placement(reglages?.ciel), visibility: reglages ? 'visible' : 'hidden' }}>
        <div class="pn-tete">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={actif ? 'var(--bouclier)' : 'var(--bouclier-inactif)'} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6z" />
            {actif && <path d="M9 12l2 2 4-4" />}
          </svg>
          <div class="pn-site">
            <div class="pn-nom">{interne ? 'Page de Lyra' : hote(etat?.origine ?? '')}</div>
            <div class="pn-sous">{sousTitre}</div>
          </div>
          <button
            class={`tg ${actif ? 'on' : 'off'}`}
            type="button"
            role="switch"
            aria-checked={actif}
            aria-label="Boucliers pour ce site"
            disabled={interne || etat === null || etat.privee === true}
            onClick={() => basculer(!actif)}
          >
            <i></i>
          </button>
        </div>

        <div class="pn-compteurs pn-un">
          <div>
            <div class="pn-n">{n}</div>
            <div class="pn-l">{n > 1 ? 'éléments bloqués' : 'élément bloqué'}</div>
          </div>
        </div>

        <div class="pn-options">
          <div class="pn-ligne">
            <span>Niveau</span>
            <span class="pn-seg" role="group" aria-label="Niveau des boucliers">
              {NIVEAUX.map((o) => (
                <button key={o.id} type="button" class={niveau === o.id && !interne ? 'on' : ''} aria-pressed={niveau === o.id && !interne} disabled={lectureSeule} onClick={() => regler(o.id)}>
                  {o.libelle}
                </button>
              ))}
            </span>
          </div>
          <div class="pn-ligne">
            <span>Scripts tiers inconnus</span>
            <span class="pn-sous">{niveau === 'strict' && actif ? 'bloqués' : 'autorisés'}</span>
          </div>
          {etat?.privee && !interne && <div class="pn-sous" role="note">Lecture seule : les règles par site ne peuvent pas être modifiées depuis une fenêtre privée.</div>}
          {erreur && (
            <div class="pn-sous" role="alert">
              {erreur}
            </div>
          )}
        </div>

        <details class="pn-details">
          <summary>Voir ce qui a été bloqué ({n})</summary>
          <div class="pn-liste">
            {(etat?.dernieres ?? []).map((u, i) => (
              <div key={i}>{sansSchema(u)}</div>
            ))}
            {n > (etat?.dernieres.length ?? 0) && <div>…</div>}
          </div>
        </details>

        <div class="pn-liens">
          <a
            href="#"
            aria-disabled={siteWeb ? undefined : true}
            onClick={(e) => {
              e.preventDefault()
              if (siteWeb) void window.lyra.invoke('menu:action', { action: 'regles-site' })
            }}
          >
            Règles de ce site
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.lyra.invoke('shields:ouvrir-stats').catch(() => setErreur("Les statistiques n'ont pas pu être ouvertes."))
            }}
          >
            Statistiques
          </a>
        </div>
      </section>
    </div>
  )
}
