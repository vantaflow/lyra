// Réglages d'apparence de l'interface : pastilles de couleur du design, police, taille, densité, coins → variables CSS.
import { COULEURS_INDIGO_NUIT, type ReglagesApparence } from './types-reglages'

export interface Pastille {
  libelle: string
  hex: string
}

/** « Couleur de l'étoile active » (Parametres.dc.html). */
export const PASTILLES_ETOILE: readonly Pastille[] = [
  { libelle: 'Or', hex: '#F4C56A' },
  { libelle: 'Menthe', hex: '#5FD3B3' },
  { libelle: 'Bleu Véga', hex: '#9FC8FF' },
  { libelle: 'Rose', hex: '#F08FB0' },
  { libelle: 'Blanc', hex: '#FFFFFF' }
]

/** « Couleur du ciel ». */
export const PASTILLES_CIEL: readonly Pastille[] = [
  { libelle: 'Indigo nuit', hex: '#15152E' },
  { libelle: 'Noir', hex: '#0B0B12' },
  { libelle: 'Ardoise', hex: '#22262E' },
  { libelle: 'Forêt', hex: '#12261F' }
]

/**
 * Pastilles du ciel pour un mode : en sombre, « Indigo nuit » vaut la couleur sombre du thème (`#0E0E1E`), sans quoi la valeur par défaut
 * du mode sombre n'allumerait aucune pastille.
 */
export function pastillesCiel(sombre: boolean): readonly Pastille[] {
  return sombre ? PASTILLES_CIEL.map((p) => (p.libelle === 'Indigo nuit' ? { ...p, hex: COULEURS_INDIGO_NUIT['ciel-fond'].sombre } : p)) : PASTILLES_CIEL
}

export const pastilleActive = (pastilles: readonly Pastille[], hex: string): Pastille | null =>
  pastilles.find((p) => p.hex.toUpperCase() === hex.toUpperCase()) ?? null

const MANROPE = "'Manrope', system-ui, sans-serif"
/** « Police de l'interface » : Manrope (Lyra) et une liste fixe de polices système sûres (choix du plan). */
export const POLICES: readonly { id: string; libelle: string; css: string }[] = [
  { id: 'Manrope', libelle: 'Manrope (Lyra)', css: MANROPE },
  { id: 'system-ui', libelle: 'Système', css: 'system-ui, sans-serif' },
  { id: 'Arial', libelle: 'Arial', css: 'Arial, sans-serif' },
  { id: 'Georgia', libelle: 'Georgia', css: 'Georgia, serif' },
  { id: 'Verdana', libelle: 'Verdana', css: 'Verdana, sans-serif' },
  { id: 'monospace', libelle: 'Monospace', css: 'monospace' }
]

export const TAILLE_MIN = 11
export const TAILLE_MAX = 17
export const TAILLE_DEFAUT = 13

/** Taille du texte → valeur de `--taille-texte` (entier borné 11-17 px). */
export function tailleTexteCss(n: number): string {
  const v = Number.isFinite(n) ? Math.min(TAILLE_MAX, Math.max(TAILLE_MIN, Math.round(n))) : TAILLE_DEFAUT
  return `${v}px`
}

/** Hauteur d'une ligne du ciel selon la densité. */
export const DENSITES_PX = { confortable: 32, compacte: 26 } as const
/** Rayon du cadre de page (design) ou carré. */
export const COINS = { arrondis: '12px 0 0 12px', carres: '0' } as const

export type VariablesApparence = Record<'--police' | '--taille-texte' | '--densite' | '--coins' | '--coins-droite' | '--coins-haut' | '--coins-bas', string>

export function variablesApparence(a: Pick<ReglagesApparence, 'police' | 'tailleTexte' | 'densite' | 'coinsArrondis'>): VariablesApparence {
  return {
    '--police': (POLICES.find((p) => p.id === a.police) ?? POLICES[0]).css,
    '--taille-texte': tailleTexteCss(a.tailleTexte),
    '--densite': `${DENSITES_PX[a.densite] ?? DENSITES_PX.confortable}px`,
    '--coins': a.coinsArrondis ? COINS.arrondis : COINS.carres,
    // Le cadre de page change de coins avec la position du ciel : mêmes rayons, ou carrés.
    '--coins-droite': a.coinsArrondis ? '0 12px 12px 0' : COINS.carres,
    '--coins-haut': a.coinsArrondis ? '12px 12px 0 0' : COINS.carres,
    '--coins-bas': a.coinsArrondis ? '0 0 12px 12px' : COINS.carres
  }
}
