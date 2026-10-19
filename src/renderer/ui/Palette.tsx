import { useEffect, useRef, useState } from 'preact/hooks'
import type { Suggestion } from '../../shared/types'
import { choixPourEntree } from './paletteChoix'
import { MOTEURS } from '../../main/palette/engines'

/** Titres de groupe, dans l'ordre d'affichage (fidèle à Panneaux.dc.html). */
const GROUPES: Record<Suggestion['type'], string> = {
  etoile: 'Onglets ouverts',
  historique: 'Historique et favoris',
  favori: 'Historique et favoris',
  recherche: 'Rechercher',
  commande: 'Commandes'
}

/** Pastille d'icône : fond et couleur de glyphe. */
function pastille(s: Suggestion): { fond: string; couleur?: string } {
  if (s.type === 'recherche') return { fond: MOTEURS.find((m) => m.id === s.moteur)?.couleur ?? '#3A3A62' }
  if (s.type === 'commande') return { fond: '#262650' }
  if (s.type === 'favori') return { fond: '#F4C56A', couleur: '#15152E' }
  if (s.type === 'etoile') return { fond: '#2D5BD1' }
  return { fond: '#5452C8' }
}

const mac = window.lyra.plateforme === 'darwin'
const MOD = mac ? '⌘' : 'Ctrl'

export function Palette() {
  const [texte, setTexte] = useState('')
  const [liste, setListe] = useState<Suggestion[]>([])
  const [sel, setSel] = useState(0)
  const champ = useRef<HTMLInputElement>(null)
  const requete = useRef(0)
  // Texte courant et texte auquel correspond la liste affichée (↩ ne doit jamais ouvrir une liste périmée).
  const texteCourant = useRef('')
  const listePour = useRef<string | null>(null)

  const chercher = (t: string): void => {
    const n = ++requete.current
    void window.lyra.invoke('palette:suggest', { texte: t }).then((r) => {
      if (n !== requete.current) return
      listePour.current = t
      setListe(r)
      setSel(0)
    })
  }

  useEffect(() => {
    const off = window.lyra.on('palette:open', ({ texteInitial }) => {
      const t = texteInitial ?? ''
      texteCourant.current = t
      setTexte(t)
      chercher(t)
      champ.current?.focus()
      champ.current?.select()
    })
    chercher('')
    champ.current?.focus()
    return off
  }, [])

  useEffect(() => {
    document.querySelector('.pal.on')?.scrollIntoView({ block: 'nearest' })
  }, [sel, liste])

  const fermer = (): void => void window.lyra.invoke('palette:close')
  const aller = (s: Suggestion | undefined, nouvelleEtoile: boolean): void => {
    void window.lyra.invoke('palette:go', { suggestion: s, texte: texteCourant.current, nouvelleEtoile })
  }

  const saisir = (t: string): void => {
    texteCourant.current = t
    setTexte(t)
    chercher(t)
  }

  const touche = (e: KeyboardEvent): void => {
    if (e.isComposing) return
    const n = liste.length
    if (e.key === 'Escape') {
      e.preventDefault()
      fermer()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (n) setSel((sel + 1) % n)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (n) setSel((sel - 1 + n) % n)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      aller(choixPourEntree(texteCourant.current, listePour.current, liste, sel), e.metaKey || e.ctrlKey)
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      saisir('>')
    }
  }

  let groupe = ''
  return (
    <div class="pal-fond" onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <div class="pal-panneau" role="dialog" aria-label="Palette de commande">
        <div class="pal-champ">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#9E9EC8" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <label for="palette" class="sr">Aller à, rechercher, commander</label>
          <input
            id="palette"
            ref={champ}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-liste"
            autocomplete="off"
            spellcheck={false}
            value={texte}
            onInput={(e) => saisir((e.target as HTMLInputElement).value)}
            onKeyDown={touche}
          />
          <kbd>Échap</kbd>
        </div>
        <div class="pal-liste" id="palette-liste" role="listbox">
          {liste.map((s, i) => {
            const titre = GROUPES[s.type]
            const entete = titre !== groupe ? <div class="ph">{titre}</div> : null
            groupe = titre
            const p = pastille(s)
            return (
              <>
                {entete}
                <div
                  class={`pal${i === sel ? ' on' : ''}`}
                  role="option"
                  aria-selected={i === sel}
                  onMouseMove={() => i !== sel && setSel(i)}
                  onClick={(e) => aller(listePour.current === texteCourant.current ? s : undefined, e.metaKey || e.ctrlKey)}
                >
                  <span class="k" style={{ background: p.fond, ...(p.couleur ? { color: p.couleur } : {}) }}>
                    {s.icone ?? ''}
                  </span>
                  <span class="t">{s.titre}</span>
                  <span class="h">{s.sousTitre ?? ''}</span>
                  {i === sel && <kbd>↩</kbd>}
                </div>
              </>
            )
          })}
        </div>
        <div class="pal-pied">
          <span><kbd>↑↓</kbd> choisir</span>
          <span><kbd>↩</kbd> ouvrir</span>
          <span><kbd>{MOD} ↩</kbd> nouvelle étoile</span>
          <span><kbd>{MOD} K</kbd> commandes seulement</span>
          <span><kbd>/</kbd> préfixes : ? recherche · &gt; commande · # constellation</span>
        </div>
      </div>
    </div>
  )
}
