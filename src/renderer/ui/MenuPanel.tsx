import { useEffect, useState } from 'preact/hooks'
import type { ActionMenu, AncreMenu } from '../../shared/ipc'
import { messageErreur } from './messageErreur'
import { raccourci } from './raccourcis'

/** Menu ⋯ de la capsule (fidèle à docs/design/project/Panneaux.dc.html, section « Menu ⋯ de la capsule »). */
export function MenuPanel({ ancre }: { ancre: AncreMenu | null }) {
  const [zoom, setZoom] = useState(ancre?.zoom ?? 1)
  const [refus, setRefus] = useState('')
  useEffect(() => setZoom(ancre?.zoom ?? 1), [ancre])
  useEffect(() => {
    const touche = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        fermer()
      }
    }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [])

  const fermer = (): void => void window.lyra.invoke('overlay:close')
  const agir = (action: ActionMenu) => (): void => void window.lyra.invoke('menu:action', { action })
  const changerZoom = (o: { delta?: 1 | -1; reset?: boolean }) => (): void =>
    void window.lyra.invoke('tabs:zoom', o).then(setZoom)

  if (!ancre) return <div class="pn-fond" onMouseDown={fermer}></div>
  const style = { top: `${ancre.bas + 6}px`, right: `${Math.max(8, window.innerWidth - ancre.droite)}px` }
  const basculer = (): void =>
    void window.lyra.invoke('passerelles:basculerSite', { hote: ancre.hote }).then(fermer, (e) => setRefus(messageErreur(e)))
  const Ligne = ({ label, aide, action }: { label: string; aide?: string; action?: ActionMenu }) => (
    <button class="mi" type="button" role="menuitem" aria-disabled={action ? undefined : true} onClick={action ? agir(action) : undefined}>
      {label}
      {aide && <span class="h">{aide}</span>}
    </button>
  )

  return (
    <div class="pn-fond" onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <nav class="menu-capsule" role="menu" aria-label="Menu de la page" style={style}>
        <Ligne label="Nouvelle étoile" aide={raccourci('⌘ T')} action="nouvelle-etoile" />
        <Ligne label="Nouvelle fenêtre" aide={raccourci('⌘ N')} action="nouvelle-fenetre" />
        <Ligne label="Fenêtre privée" aide={raccourci('⌘ ⇧ N')} action="fenetre-privee" />
        <div class="sep"></div>
        <Ligne label="Ajouter aux favoris" aide={raccourci('⌘ D')} action={ancre.privee ? undefined : 'favori'} />
        <Ligne label="Rechercher dans la page" aide={raccourci('⌘ F')} action="recherche" />
        <div class="mi" role="group" aria-label="Zoom">
          Zoom
          <span class="h zoom-ligne">
            <button class="zb zb-pct" type="button" aria-label="Revenir à 100 %" onClick={changerZoom({ reset: true })}>
              {Math.round(zoom * 100)} %
            </button>
            <button class="zb" type="button" aria-label="Zoom arrière" onClick={changerZoom({ delta: -1 })}>
              −
            </button>
            <button class="zb" type="button" aria-label="Zoom avant" onClick={changerZoom({ delta: 1 })}>
              +
            </button>
          </span>
        </div>
        <Ligne label="Imprimer…" aide={raccourci('⌘ P')} action="imprimer" />
        <Ligne label="Mode lecture" aide="v2" />
        <div class="sep"></div>
        <Ligne label={`Règles pour ${ancre.hote || 'ce site'}`} />
        {ancre.basculable && (
          <button class="mi" type="button" role="menuitem" onClick={basculer}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 8h13l-3-3" />
              <path d="M20 16H7l3 3" />
            </svg>
            <span class="mi-texte">{ancre.contourne ? 'Ne plus passer par une passerelle' : `Passer par une passerelle pour ${ancre.hote}`}</span>
          </button>
        )}
        {refus && (
          <div class="mi mi-refus" role="alert">
            <span class="mi-texte" title={refus}>
              {refus}
            </span>
          </div>
        )}
        <Ligne label="Style perso pour ce site" />
        <Ligne label="Outils de développement" aide={raccourci('⌥ ⌘ I')} action="devtools" />
        <div class="sep"></div>
        <Ligne label="Historique" aide={raccourci('⌘ Y')} action="historique" />
        <Ligne label="Réglages" aide={raccourci('⌘ ,')} action="reglages" />
      </nav>
    </div>
  )
}
