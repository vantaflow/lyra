import { signal } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'
import { actif } from './state'

const ouverte = signal(false)
/** Incrémenté à chaque ouverture : redonne le focus au champ même si la barre est déjà ouverte. */
const focus = signal(0)

/** Affiche la barre de recherche (⌘ F, bouton loupe) et met le curseur dans le champ. */
export function ouvrirRecherche(): void {
  ouverte.value = true
  focus.value++
}

/** Barre de recherche dans la page : flottante en haut à droite de la zone page, sur la capsule. */
export function FindBar() {
  const champ = useRef<HTMLInputElement>(null)
  const [texte, setTexte] = useState('')
  const [resultat, setResultat] = useState({ actif: 0, total: 0 })
  const idCourant = actif.value?.id
  const idOuverture = useRef<string | undefined>(undefined)

  useEffect(() => window.lyra.on('find:open', ouvrirRecherche), [])
  useEffect(() => window.lyra.on('find:result', (r) => r.id === actif.value?.id && setResultat({ actif: r.actif, total: r.total })), [])

  const fermer = (): void => {
    const id = idOuverture.current ?? idCourant
    ouverte.value = false
    setTexte('')
    setResultat({ actif: 0, total: 0 })
    if (id) void window.lyra.invoke('find:stop', { id })
  }
  useEffect(() => {
    if (!ouverte.value) return
    idOuverture.current = idCourant
    champ.current?.focus()
    champ.current?.select()
  }, [focus.value])
  // Changer d'étoile referme la barre : la recherche appartient à la page qui l'a lancée.
  useEffect(() => {
    if (ouverte.value && idOuverture.current && idOuverture.current !== idCourant) fermer()
  }, [idCourant])

  if (!ouverte.value) return null
  const lancer = (t: string, o: { suivant?: boolean; precedent?: boolean } = {}): void => {
    if (idCourant) void window.lyra.invoke('find:start', { id: idCourant, texte: t, ...o })
  }
  return (
    <div class="findbar" role="search" aria-label="Rechercher dans la page">
      <input
        ref={champ}
        type="text"
        aria-label="Rechercher dans la page"
        placeholder="Rechercher dans la page"
        value={texte}
        onInput={(e) => {
          setTexte(e.currentTarget.value)
          lancer(e.currentTarget.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            fermer()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            lancer(texte, e.shiftKey ? { precedent: true } : { suivant: true })
          }
        }}
      />
      <span class="findbar-n" aria-live="polite">
        {texte ? `${resultat.actif}/${resultat.total}` : ''}
      </span>
      <button class="cb" type="button" aria-label="Occurrence précédente" disabled={!texte} onClick={() => lancer(texte, { precedent: true })}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
      <button class="cb" type="button" aria-label="Occurrence suivante" disabled={!texte} onClick={() => lancer(texte, { suivant: true })}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button class="cb" type="button" aria-label="Fermer la recherche" onClick={fermer}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
