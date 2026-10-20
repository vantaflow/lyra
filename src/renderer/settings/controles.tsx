import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'

/** Contrôles de Parametres.dc.html : .row/.lbl/.hint, .tg, .sel, .seg. */

/** `reglage` : identifiant de l'index de recherche (`<section>.<réglage>`), porté en `data-reglage` pour la mise en évidence. */
export function Ligne({ titre, aide, reglage, herite, children }: { titre: string; aide?: string; reglage?: string; herite?: boolean; children?: ComponentChildren }) {
  return (
    <div class="row" data-reglage={reglage} tabIndex={reglage ? -1 : undefined}>
      <div class="lbl">
        <span>{titre}</span>
        {aide && <span class="hint">{aide}</span>}
        {herite && <span class="hint herite">hérité</span>}
      </div>
      {children}
    </div>
  )
}

export function Titre({ children }: { children: string }) {
  return <h2 class="titre-section">{children}</h2>
}

export function Interrupteur(p: { actif: boolean; libelle: string; surChange?: (v: boolean) => void; inerte?: boolean }) {
  return (
    <button
      class={p.actif ? 'tg on' : 'tg off'}
      type="button"
      role="switch"
      aria-checked={p.actif}
      aria-label={p.libelle}
      disabled={p.inerte}
      onClick={() => p.surChange?.(!p.actif)}
    >
      <i />
    </button>
  )
}

export function Segments<T extends string>(p: {
  valeur: T
  options: { id: T; libelle: string; inactif?: boolean }[]
  surChange?: (v: T) => void
}) {
  return (
    <div class="seg">
      {p.options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === p.valeur} disabled={o.inactif} onClick={() => p.surChange?.(o.id)}>
          {o.libelle}
        </button>
      ))}
    </div>
  )
}

export function Selecteur<T extends string>(p: {
  valeur: T
  options: { id: T; libelle: string }[]
  libelle: string
  surChange: (v: T) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const zone = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const ferme = (e: MouseEvent): void => {
      if (!zone.current?.contains(e.target as Node)) setOuvert(false)
    }
    document.addEventListener('mousedown', ferme)
    return () => document.removeEventListener('mousedown', ferme)
  }, [ouvert])
  const courant = p.options.find((o) => o.id === p.valeur)
  return (
    <div class="sel-zone" ref={zone}>
      <button class="sel" type="button" aria-label={p.libelle} aria-haspopup="listbox" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {courant?.libelle ?? p.valeur}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {ouvert && (
        <div class="sel-menu" role="listbox">
          {p.options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === p.valeur}
              onClick={() => {
                setOuvert(false)
                p.surChange(o.id)
              }}
            >
              {o.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
