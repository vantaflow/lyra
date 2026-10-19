import type { Star } from '../../shared/types'
import { etats, titreEtoile } from './state'

// Couleurs de la maquette (Main.dc.html), choisies d'après le domaine.
const COULEURS = ['#1E7F6C', '#2D5BD1', '#D97A2B', '#3A3A62', '#B5452F']

function domaine(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function couleurDe(texte: string): string {
  let h = 0
  for (const c of texte) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COULEURS[h % COULEURS.length]
}

export function Epingle({ star }: { star: Star }) {
  const etat = etats.value[star.id]
  const url = etat?.url || star.url
  const d = domaine(url)
  const titre = titreEtoile(star, etat)
  const favicon = etat?.favicon
  return (
    <button
      class="pin"
      type="button"
      aria-label={titre}
      title={titre}
      style={{ background: favicon ? '#fff' : couleurDe(d || star.id) }}
      onClick={() => void window.lyra.invoke('tabs:activate', { id: star.id })}
    >
      {favicon ? <img src={favicon} alt="" width="16" height="16" /> : (d || titre).charAt(0).toUpperCase()}
    </button>
  )
}
