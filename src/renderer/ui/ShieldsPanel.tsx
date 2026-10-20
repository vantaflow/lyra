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

const sansSchema = (url: string): string => url.replace(/^[a-z]+:\/\//i, '')

/** Panneau des Boucliers (fidèle à docs/design/project/Panneaux.dc.html, section Boucliers). */
export function ShieldsPanel() {
  const [etat, setEtat] = useState<EtatBoucliers | null>(null)
  const [reglages, setReglages] = useState<Settings | null>(null)

  useEffect(() => {
    void window.lyra.invoke('shields:get').then(setEtat)
    void window.lyra.invoke('settings:get').then(setReglages)
    const off = window.lyra.on('shields:changed', setEtat)
    const offReglages = window.lyra.on('settings:changed', setReglages)
    const touche = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        fermer()
      }
    }
    document.addEventListener('keydown', touche)
    return () => {
      off()
      offReglages()
      document.removeEventListener('keydown', touche)
    }
  }, [])

  const fermer = (): void => void window.lyra.invoke('overlay:close')
  const basculer = (actif: boolean): void => {
    if (!etat?.origine || etat.privee) return
    setEtat({ ...etat, actif })
    void window.lyra.invoke('shields:toggleSite', { origine: etat.origine, actif })
  }

  const basculerGenes = (genes: boolean): void => {
    if (!reglages) return
    const avant = reglages
    setReglages({ ...reglages, boucliers: { ...reglages.boucliers, genes } })
    // Échec : l'interrupteur revient à l'état enregistré (jamais un état affiché qui n'est pas appliqué).
    void window.lyra.invoke('settings:set', { boucliers: { genes } } as Partial<Settings>).then(setReglages, (e: unknown) => {
      console.warn('[boucliers] réglage des gênes :', e)
      setReglages(avant)
    })
  }

  const interne = etat !== null && etat.origine === ''
  const actif = etat?.actif ?? false
  const n = etat?.bloques ?? 0

  return (
    <div class="pn-fond" onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <section class="pn-bouclier" role="dialog" aria-label="Panneau des boucliers" style={{ ...placement(reglages?.ciel), visibility: reglages ? 'visible' : 'hidden' }}>
        <div class="pn-tete">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={actif ? '#1E7F6C' : '#9A9AB0'} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6z" />
            {actif && <path d="M9 12l2 2 4-4" />}
          </svg>
          <div class="pn-site">
            <div class="pn-nom">{interne ? 'Page de Lyra' : hote(etat?.origine ?? '')}</div>
            <div class="pn-sous">{interne ? 'Rien à bloquer ici' : actif ? 'Boucliers actifs — règle standard' : 'Boucliers désactivés sur ce site'}
            {etat?.privee && !interne && <div class="pn-sous">Indisponible en fenêtre privée</div>}</div>
          </div>
          <button
            class={`tg ${actif ? 'on' : 'off'}`}
            type="button"
            role="switch"
            aria-checked={actif}
            aria-label="Boucliers pour ce site"
            disabled={interne || etat === null || etat.privee === true}
            title={etat?.privee ? 'Indisponible en fenêtre privée' : undefined}
            onClick={() => basculer(!actif)}
          >
            <i></i>
          </button>
        </div>

        <div class="pn-compteurs">
          <div>
            <div class="pn-n">{n}</div>
            <div class="pn-l">{n > 1 ? 'éléments bloqués' : 'élément bloqué'}</div>
          </div>
          <div>
            <div class="pn-n">0</div>
            <div class="pn-l">traqueurs</div>
          </div>
          <div>
            <div class="pn-n">0</div>
            <div class="pn-l">scripts retirés</div>
          </div>
        </div>

        <div class="pn-options">
          <div class="pn-ligne">
            <span>Niveau</span>
            <span class="pn-seg" role="group" aria-label="Niveau des boucliers">
              <button type="button" class={!actif ? 'on' : ''} aria-pressed={!actif} disabled={interne} onClick={() => basculer(false)}>
                Désactivés
              </button>
              <button type="button" class={actif ? 'on' : ''} aria-pressed={actif} disabled={interne} onClick={() => basculer(true)}>
                Standard
              </button>
              <button type="button" disabled title="Bientôt" aria-label="Strict (bientôt)">
                Strict
              </button>
            </span>
          </div>
          <div class="pn-ligne">
            <span>Bannières de cookies et gênes</span>
            <button
              class={`tg ${reglages?.boucliers.genes ? 'on' : 'off'}`}
              type="button"
              role="switch"
              aria-checked={reglages?.boucliers.genes ?? false}
              aria-label="Gênes"
              disabled={reglages === null}
              title="S'applique aux pages ouvertes ensuite"
              onClick={() => basculerGenes(!(reglages?.boucliers.genes ?? false))}
            >
              <i></i>
            </button>
          </div>
          <div class="pn-ligne">
            <span>Scripts tiers inconnus</span>
            <span class="pn-sous">autorisés</span>
          </div>
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
          {/* Pages pas encore livrées (jalon D) : visibles comme dans le design, mais inertes et signalées. */}
          <a aria-disabled="true" title="Bientôt">Règles de ce site</a>
          <span aria-hidden="true">·</span>
          <a aria-disabled="true" title="Bientôt">Statistiques</a>
          <span aria-hidden="true">·</span>
          <a aria-disabled="true" title="Bientôt">Signaler un site cassé</a>
          <em class="pn-bientot">bientôt</em>
        </div>
      </section>
    </div>
  )
}
