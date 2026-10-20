import { useState } from 'preact/hooks'
import type { Star as StarT } from '../../shared/types'
import { deposer, estTerne, etats, glisse, sky, titreEtoile } from './state'

interface Props {
  star: StarT
}

export function Star({ star }: Props) {
  const [cible, setCible] = useState<'avant' | 'apres' | null>(null)
  const etat = etats.value[star.id]
  const estActive = sky.value.activeId === star.id
  const classes = ['star', estActive ? 'active' : '', star.dormant ? 'dim' : '', estTerne(star, etat) ? 'terne' : '', cible ? `drop-${cible}` : '']
    .filter(Boolean)
    .join(' ')

  const moitie = (e: DragEvent): 'avant' | 'apres' => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return e.clientY < r.top + r.height / 2 ? 'avant' : 'apres'
  }

  return (
    <button
      class={classes}
      type="button"
      aria-current={estActive ? 'page' : undefined}
      draggable={true}
      onClick={() => void window.lyra.invoke('tabs:activate', { id: star.id })}
      onDragStart={(e) => {
        glisse.value = star.id
        e.dataTransfer?.setData('text/plain', star.id)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => {
        glisse.value = null
        setCible(null)
      }}
      onDragOver={(e) => {
        if (!glisse.value || glisse.value === star.id) return
        e.preventDefault()
        setCible(moitie(e))
      }}
      onDragLeave={() => setCible(null)}
      onDrop={(e) => {
        e.preventDefault()
        deposer(star.id, moitie(e) === 'apres')
        setCible(null)
      }}
    >
      <span class="dot" aria-hidden="true"></span>
      <span class="t">{titreEtoile(star, etat)}</span>
      <span
        class="x"
        role="button"
        aria-label="Fermer l'onglet"
        onClick={(e) => {
          e.stopPropagation()
          void window.lyra.invoke('tabs:close', { id: star.id })
        }}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      </span>
    </button>
  )
}
