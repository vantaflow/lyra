// Modèle pur de l'écran « Couleurs et thèmes » : « Mes couleurs » modifié, copie d'un thème avant édition, segments « Passer en sombre ».
import { SEUIL, rapport, PAIRES } from '../../shared/contraste'
import { THEMES } from '../../shared/themes'
import { COULEURS_INDIGO_NUIT, type CleCouleur, type CouleursTheme, type NomTheme, type ReglagesCouleurs } from '../../shared/types-reglages'
import type { Settings } from '../../shared/types'

export type ModeCouleur = 'clair' | 'sombre'

/** Couleurs montrées dans le tableau : le thème choisi ; « Mes couleurs » = la personnalisation, à défaut Indigo nuit. */
export function couleursAffichees(c: Pick<ReglagesCouleurs, 'actif' | 'personnalisees'>): CouleursTheme {
  return c.actif === 'mes-couleurs' ? (c.personnalisees ?? COULEURS_INDIGO_NUIT) : THEMES[c.actif].couleurs
}

const memes = (a: CouleursTheme, b: CouleursTheme): boolean =>
  (Object.keys(COULEURS_INDIGO_NUIT) as CleCouleur[]).every((k) => a[k].clair.toUpperCase() === b[k].clair.toUpperCase() && a[k].sombre.toUpperCase() === b[k].sombre.toUpperCase())

/** « Mes couleurs » est « modifié » dès qu'une valeur diffère de la référence : le thème importé (`couleurs.reference`), à défaut le thème de départ (`couleurs.depart`). */
export function estModifie(personnalisees: CouleursTheme | null, depart: NomTheme, reference: CouleursTheme | null = null): boolean {
  return personnalisees !== null && !memes(personnalisees, reference ?? THEMES[depart].couleurs)
}

type EtatCouleurs = Pick<ReglagesCouleurs, 'actif' | 'personnalisees' | 'depart' | 'reference'>

/** Réglage à écrire quand on change une couleur : copie du thème affiché dans « Mes couleurs » (le thème prêt reste intact), qui en devient le départ. */
export function modifierCouleur(c: EtatCouleurs, cle: CleCouleur, mode: ModeCouleur, hex: string): { actif: 'mes-couleurs'; personnalisees: CouleursTheme; depart: NomTheme; reference: CouleursTheme | null } {
  const copie = structuredClone(couleursAffichees(c)) as CouleursTheme
  copie[cle][mode] = hex.toUpperCase()
  return { actif: 'mes-couleurs', personnalisees: copie, depart: c.actif === 'mes-couleurs' ? c.depart : c.actif, reference: c.actif === 'mes-couleurs' ? c.reference : null }
}

/** Vrai si la première édition depuis un thème prêt remplacerait une personnalisation de « Mes couleurs » différente de ce thème. */
export function ecraseraPersonnalisation(c: EtatCouleurs): boolean {
  return c.actif !== 'mes-couleurs' && c.personnalisees !== null && !memes(c.personnalisees, couleursAffichees(c))
}

/** `#RRGGBB` ou `RRGGBB` (espaces tolérés) → `#RRGGBB` en majuscules ; sinon null. */
export function hexValide(texte: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(texte.trim())
  return m ? `#${m[1].toUpperCase()}` : null
}

/** Aperçu d'une vignette de thème (en clair) : ciel, fond des pages, texte. Le design montre une page #FFFFFF pour Indigo nuit et Mes couleurs. */
export function apercuTheme(nom: NomTheme, c: CouleursTheme): { ciel: string; page: string; texte: string } {
  const blanc = nom === 'indigo-nuit' || nom === 'mes-couleurs'
  return { ciel: c['ciel-fond'].clair, page: blanc ? '#FFFFFF' : c['pages-fond'].clair, texte: c['capsule-texte'].clair }
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

/** Rapport affiché avec une décimale et une virgule, arrondi vers le bas : « 4,5 » n'est jamais montré pour un rapport sous le seuil. */
export function formaterRatio(r: number): string {
  return (Math.floor(r * 10 + 1e-9) / 10).toFixed(1).replace('.', ',')
}

export type EtiquettesContraste = Partial<Record<CleCouleur, Partial<Record<ModeCouleur, string>>>>

/**
 * Étiquettes informatives des lignes de texte dont la paire est sous 4,5:1, par mode :
 * « Ajustée : 3,1:1 → 4,5:1 » quand Lyra corrige, « Contraste 3,1:1 » quand la correction est désactivée.
 */
export function etiquettesContraste(couleurs: CouleursTheme, corriger: boolean): EtiquettesContraste {
  const sortie: EtiquettesContraste = {}
  for (const mode of ['clair', 'sombre'] as const) {
    for (const { texte, fond } of PAIRES) {
      // Texte dérivé du nouvel onglet : toujours ramené au seuil à la diffusion, pas de ligne ni d'étiquette.
      if (texte === 'nouvel-onglet-texte') continue
      const r = rapport(couleurs[texte][mode], couleurs[fond][mode])
      if (r >= SEUIL) continue
      const apres = formaterRatio(Math.max(r, SEUIL))
      ;(sortie[texte] ??= {})[mode] = corriger ? `Ajustée : ${formaterRatio(r)}:1 → ${apres}:1` : `Contraste ${formaterRatio(r)}:1`
    }
  }
  return sortie
}

/** Réglages écrits par un segment de « Thème » (Apparence) : mêmes champs que « Passer en sombre ». « Sombre » ne touche pas au passage. */
export function patchTheme(theme: Settings['theme'], passage: Passage): { theme: Settings['theme']; couleurs?: { passage: Passage } } {
  if (theme === 'systeme') return patchPassage('systeme')
  if (theme === 'clair') return patchPassage('jamais')
  if (theme === 'programme') return patchPassage(passage === 'coucher' || passage === 'heure' ? passage : 'coucher')
  return { theme }
}
