// Modèle pur de l'écran « Couleurs et thèmes » : « Mes couleurs » modifié, copie d'un thème avant édition, segments « Passer en sombre ».
import { THEMES } from '../../shared/themes'
import { COULEURS_INDIGO_NUIT, type CleCouleur, type CouleursTheme, type ReglagesCouleurs } from '../../shared/types-reglages'
import type { Settings } from '../../shared/types'

export type ModeCouleur = 'clair' | 'sombre'

/** Couleurs montrées dans le tableau : le thème choisi ; « Mes couleurs » = la personnalisation, à défaut Indigo nuit. */
export function couleursAffichees(c: Pick<ReglagesCouleurs, 'actif' | 'personnalisees'>): CouleursTheme {
  return c.actif === 'mes-couleurs' ? (c.personnalisees ?? COULEURS_INDIGO_NUIT) : THEMES[c.actif].couleurs
}

/** « Mes couleurs » est « modifié » dès qu'une valeur diffère de sa valeur de départ (Indigo nuit). */
export function estModifie(personnalisees: CouleursTheme | null): boolean {
  if (!personnalisees) return false
  return (Object.keys(COULEURS_INDIGO_NUIT) as CleCouleur[]).some(
    (k) => personnalisees[k].clair.toUpperCase() !== COULEURS_INDIGO_NUIT[k].clair.toUpperCase() || personnalisees[k].sombre.toUpperCase() !== COULEURS_INDIGO_NUIT[k].sombre.toUpperCase()
  )
}

/** Réglage à écrire quand on change une couleur : copie du thème affiché dans « Mes couleurs » (le thème prêt reste intact). */
export function modifierCouleur(c: Pick<ReglagesCouleurs, 'actif' | 'personnalisees'>, cle: CleCouleur, mode: ModeCouleur, hex: string): { actif: 'mes-couleurs'; personnalisees: CouleursTheme } {
  const copie = structuredClone(couleursAffichees(c)) as CouleursTheme
  copie[cle][mode] = hex.toUpperCase()
  return { actif: 'mes-couleurs', personnalisees: copie }
}

/** `#RRGGBB` ou `RRGGBB` (espaces tolérés) → `#RRGGBB` en majuscules ; sinon null. */
export function hexValide(texte: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(texte.trim())
  return m ? `#${m[1].toUpperCase()}` : null
}

/** Aperçu d'une vignette de thème (en clair) : ciel, fond des pages, texte. */
export function apercuTheme(c: CouleursTheme): { ciel: string; page: string; texte: string } {
  return { ciel: c['ciel-fond'].clair, page: c['pages-fond'].clair, texte: c['capsule-texte'].clair }
}

export type Passage = ReglagesCouleurs['passage']
export const SEGMENTS_PASSAGE: { id: Passage; libelle: string }[] = [
  { id: 'systeme', libelle: 'Avec le système' },
  { id: 'coucher', libelle: 'Au coucher du soleil' },
  { id: 'heure', libelle: 'À une heure fixe' },
  { id: 'jamais', libelle: 'Jamais' }
]

/** Réglages écrits par un segment « Passer en sombre » (la même source que « Thème » d'Apparence). */
export function patchPassage(id: Passage): { theme: Settings['theme']; couleurs: { passage: Passage } } {
  const theme: Settings['theme'] = id === 'systeme' ? 'systeme' : id === 'jamais' ? 'clair' : 'programme'
  return { theme, couleurs: { passage: id } }
}

/** Segment allumé pour un `theme` et un `couleurs.passage` ; null quand « Thème » vaut Sombre (aucun segment). */
export function segmentPassage(theme: Settings['theme'], passage: Passage): Passage | null {
  if (theme === 'systeme') return 'systeme'
  if (theme === 'clair') return 'jamais'
  if (theme === 'programme') return passage
  return null
}

/** Écritures espacées d'au moins `delaiMs` : la première part tout de suite, une rafale se réduit à sa dernière valeur. */
export function creerLimiteur<T>(delaiMs: number, ecrire: (v: T) => void): { pousser(v: T): void; vider(): void } {
  let derniere = -Infinity
  let attente: ReturnType<typeof setTimeout> | undefined
  let enAttente: { v: T } | null = null
  const envoyer = (): void => {
    attente = undefined
    if (!enAttente) return
    const { v } = enAttente
    enAttente = null
    derniere = Date.now()
    ecrire(v)
  }
  return {
    pousser(v) {
      enAttente = { v }
      if (attente !== undefined) return
      const reste = delaiMs - (Date.now() - derniere)
      if (reste <= 0) envoyer()
      else attente = setTimeout(envoyer, reste)
    },
    vider() {
      if (attente !== undefined) clearTimeout(attente)
      envoyer()
    }
  }
}
