import { useEffect, useState } from 'preact/hooks'
import type { DownloadInfo, Settings } from '../../shared/types'
import { couleursVignette, extension, fraction, texteEtat } from '../../shared/telechargements'
import { placement } from './placements'

const RECENTS = 5

/** Une ligne de téléchargement (panneau overlay et page lyra://downloads partagent la mise en forme). */
function Ligne({ d }: { d: DownloadInfo }) {
  const ext = extension(d.nom)
  const c = couleursVignette(ext)
  const f = fraction(d)
  const agir = (canal: 'downloads:pause' | 'downloads:resume' | 'downloads:reveal'): void => void window.lyra.invoke(canal, { id: d.id })
  return (
    <div class="dl-ligne" data-etat={d.etat}>
      <span class="dl-ext" style={{ background: c.fond, color: c.texte }}>
        {ext}
      </span>
      <div class="dl-corps">
        <div class="dl-nom">{d.nom}</div>
        {(d.etat === 'en-cours' || d.etat === 'pause') && (
          <div class="dl-barre">
            <div style={{ width: `${Math.round((f ?? 0) * 100)}%` }}></div>
          </div>
        )}
        <div class="dl-etat">{texteEtat(d)}</div>
      </div>
      {d.etat === 'en-cours' && (
        <button class="dl-btn" type="button" style={{ padding: '0 8px' }} aria-label="Mettre en pause" onClick={() => agir('downloads:pause')}>
          II
        </button>
      )}
      {d.etat === 'pause' && (
        <button class="dl-btn" type="button" aria-label="Reprendre" onClick={() => agir('downloads:resume')}>
          Reprendre
        </button>
      )}
      {d.etat === 'termine' && (
        <button class="dl-btn" type="button" aria-label={`Afficher ${d.nom} dans le dossier`} onClick={() => agir('downloads:reveal')}>
          Afficher
        </button>
      )}
    </div>
  )
}

/** Panneau des téléchargements (fidèle à docs/design/project/Panneaux.dc.html, section Téléchargements). */
export function DownloadsPanel() {
  const [liste, setListe] = useState<DownloadInfo[]>([])
  const [reglages, setReglages] = useState<Settings | null>(null)

  useEffect(() => {
    const charger = (): void => void window.lyra.invoke('downloads:list').then(setListe)
    charger()
    void window.lyra.invoke('settings:get').then(setReglages)
    const off = window.lyra.on('downloads:changed', charger)
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
  const toutVoir = (): void => {
    fermer()
    void window.lyra.invoke('tabs:open', { url: 'lyra://downloads' })
  }

  return (
    <div class="pn-fond" onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <section class="pn-dl" role="dialog" aria-label="Panneau des téléchargements" style={{ ...placement(reglages?.ciel), visibility: reglages ? 'visible' : 'hidden' }}>
        {liste.length === 0 && <p class="dl-vide">Aucun téléchargement.</p>}
        {liste.slice(0, RECENTS).map((d) => (
          <Ligne key={d.id} d={d} />
        ))}
        <div class="dl-pied">
          <a href="#" id="dl-tout-voir" onClick={(e) => (e.preventDefault(), toutVoir())}>
            Tout voir
          </a>
          <a
            href="#"
            class="discret"
            id="dl-effacer"
            onClick={(e) => {
              e.preventDefault()
              void window.lyra.invoke('downloads:clear').then(() => setListe([]))
            }}
          >
            Effacer la liste
          </a>
        </div>
      </section>
    </div>
  )
}
