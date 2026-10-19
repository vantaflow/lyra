/** Présentation des téléchargements, partagée par le panneau et la page lyra://downloads. */
import type { DownloadInfo } from './types'

const UNITES = ['o', 'Ko', 'Mo', 'Go', 'To']

function decouper(octets: number): { valeur: string; unite: string } {
  let v = Math.max(0, octets)
  let i = 0
  while (v >= 1024 && i < UNITES.length - 1) {
    v /= 1024
    i++
  }
  const arrondi = i === 0 || v >= 100 ? Math.round(v) : Math.round(v * 10) / 10
  return { valeur: String(arrondi).replace('.', ','), unite: UNITES[i] }
}

export function formaterTaille(octets: number): string {
  const { valeur, unite } = decouper(octets)
  return `${valeur} ${unite}`
}

/** Lettres de la vignette : extension en majuscules (4 au plus), « FIC » sans extension. */
export function extension(nom: string): string {
  const i = nom.lastIndexOf('.')
  if (i <= 0 || i === nom.length - 1) return 'FIC'
  return nom.slice(i + 1).toUpperCase().slice(0, 4)
}

const ARCHIVES = new Set(['ZIP', 'GZ', 'TAR', '7Z', 'RAR', 'DMG', 'EXE', 'MSI', 'PKG'])

/** Couleurs de la vignette (design : PDF violet, ZIP vert). */
export function couleursVignette(ext: string): { fond: string; texte: string } {
  return ARCHIVES.has(ext) ? { fond: '#DDF5EC', texte: '#146A52' } : { fond: '#E6E6F7', texte: '#2F2D8A' }
}

function duree(s: number): string {
  if (s < 60) return `${Math.max(1, Math.ceil(s))} s`
  if (s < 3600) return `${Math.ceil(s / 60)} min`
  return `${Math.ceil(s / 3600)} h`
}

/** Fraction accomplie (0..1), ou null si le total est inconnu. */
export function fraction(d: DownloadInfo): number | null {
  return d.total > 0 ? Math.min(1, d.recu / d.total) : null
}

/** « 38 Mo sur 61 » : l'unité n'est répétée que si elle diffère. */
function surTotal(recu: number, total: number): string {
  const a = decouper(recu)
  const b = decouper(total)
  return a.unite === b.unite ? `${a.valeur} ${a.unite} sur ${b.valeur}` : `${a.valeur} ${a.unite} sur ${b.valeur} ${b.unite}`
}

/** Texte d'état d'une ligne (« 38 Mo sur 61 — 12 s restantes », « Terminé · 214 Mo · Téléchargements »). */
export function texteEtat(d: DownloadInfo): string {
  switch (d.etat) {
    case 'termine':
      return `Terminé · ${formaterTaille(d.total || d.recu)} · Téléchargements`
    case 'annule':
      return 'Annulé'
    case 'erreur':
      return 'Échec du téléchargement'
    case 'pause':
      return `En pause — ${d.total > 0 ? surTotal(d.recu, d.total) : formaterTaille(d.recu)}`
    default: {
      if (d.total <= 0) return formaterTaille(d.recu)
      const base = surTotal(d.recu, d.total)
      if (!d.vitesse) return base
      const restant = duree((d.total - d.recu) / d.vitesse)
      return `${base} — ${restant} ${restant.startsWith('1 ') ? 'restante' : 'restantes'}`
    }
  }
}
