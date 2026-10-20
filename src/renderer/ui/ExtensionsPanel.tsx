import type { FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { Settings } from '../../shared/types'
import { placement } from './placements'

/** Icônes d'action des extensions : élément personnalisé d'electron-chrome-extensions (injecté par le preload `ui`). */
const ListeActions = 'browser-action-list' as unknown as FunctionComponent<{ partition: string; alignment: string }>

/**
 * Panneau des extensions depuis le pied du ciel (docs/design/project/Panneaux.dc.html, « Extensions — depuis le pied du ciel ») :
 * une rangée d'icônes d'action de 34 px et « Gérer ». Le popup de l'extension est la fenêtre native d'electron-chrome-extensions
 * (spec §9, réponse 4), ancrée au bouton cliqué.
 */
export function ExtensionsPanel() {
  const [reglages, setReglages] = useState<Settings | null>(null)
  const [aucune, setAucune] = useState(false)

  useEffect(() => {
    void window.lyra.invoke('settings:get').then(setReglages)
    void window.lyra.invoke('extensions:lister').then((l) => setAucune(!l.some((e) => e.active && e.chargee)))
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
  const gerer = (e: Event): void => {
    e.preventDefault()
    void window.lyra.invoke('overlay:close')
    void window.lyra.invoke('tabs:open', { url: 'lyra://extensions' })
  }

  return (
    <div class="pn-fond" onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <section class="pn-ext" role="dialog" aria-label="Panneau des extensions" style={{ ...placement(reglages?.ciel), visibility: reglages ? 'visible' : 'hidden' }}>
        <div class="pn-ext-rangee">
          <ListeActions partition="persist:lyra" alignment="bottom left" />
          {aucune && <span class="pn-ext-vide">Aucune extension active</span>}
          <span style={{ flex: 1 }}></span>
          <a href="lyra://extensions" onClick={gerer}>
            Gérer
          </a>
        </div>
      </section>
    </div>
  )
}
