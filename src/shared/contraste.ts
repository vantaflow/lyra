// Contraste WCAG 2.x des couleurs de thème : module pur (aucun import d'Electron ni de `src/main`).
import type { CleCouleur, CouleursTheme } from './types-reglages'

export type Mode = 'clair' | 'sombre'

/** Seuil unique des six paires vérifiées (décision C : texte normal, 4,5:1). */
export const SEUIL = 4.5

/** Textes dérivés (aucune couleur enregistrée) : calculés depuis leur fond, toujours ramenés au seuil. */
export type CleDerivee = 'nouvel-onglet-texte'
export const LIBELLES_DERIVEES: Record<CleDerivee, string> = { 'nouvel-onglet-texte': 'Nouvel onglet — texte' }

export interface Paire {
  texte: CleCouleur | CleDerivee
  fond: CleCouleur
}

/** Les six paires texte/fond vérifiées, en clair et en sombre. Étoiles endormies et lignes sont exclues (discrètes par design). */
export const PAIRES: readonly Paire[] = [
  { texte: 'ciel-texte', fond: 'ciel-fond' },
  { texte: 'etoiles', fond: 'ciel-fond' },
  { texte: 'etoile-active', fond: 'etoile-active-fond' },
  { texte: 'capsule-texte', fond: 'capsule-fond' },
  { texte: 'accent', fond: 'pages-fond' },
  { texte: 'boucliers', fond: 'pages-fond' },
  { texte: 'nouvel-onglet-texte', fond: 'nouvel-onglet-ciel' }
]

/** Jetons texte du nouvel onglet (sur le ciel du nouvel onglet) : valeurs d'origine du design sur un ciel sombre, foncées sur un ciel clair. */
export interface TextesNouvelOnglet {
  texte: string
  titre: string
  sous: string
}

const SEUIL_CIEL_CLAIR_NT = 0.4

/** Textes du nouvel onglet dérivés de son ciel et corrigés à 4,5:1 (un ciel clair — Sable, Clair total, couleur claire — donne des textes foncés). */
export function textesNouvelOnglet(ciel: string): TextesNouvelOnglet {
  if (luminance(ciel) > SEUIL_CIEL_CLAIR_NT) {
    return {
      texte: corriger(melanger(ciel, '#000000', 0.88), ciel),
      titre: corriger(melanger(ciel, '#000000', 0.96), ciel),
      sous: corriger(melanger(ciel, '#000000', 0.62), ciel)
    }
  }
  return { texte: corriger('#ECECFA', ciel), titre: corriger('#F6F6FF', ciel), sous: corriger('#9E9EC8', ciel) }
}

type Rgb = [number, number, number]

function versRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function versHex([r, g, b]: Rgb): string {
  const c = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

/** Luminance relative WCAG d'une couleur `#RRGGBB` (0 = noir, 1 = blanc). */
export function luminance(hex: string): number {
  const [r, g, b] = versRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Rapport de contraste WCAG entre deux couleurs `#RRGGBB` (1 à 21). */
export function rapport(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `a` fondu avec `b` : `part` = proportion de `b` (0 à 1). Résultat `#RRGGBB` en majuscules. */
export function melanger(a: string, b: string, part: number): string {
  const [ra, rb] = [versRgb(a), versRgb(b)]
  return versHex([0, 1, 2].map((i) => ra[i] + (rb[i] - ra[i]) * part) as Rgb)
}

/**
 * Éclaircit ou assombrit le TEXTE (jamais le fond) jusqu'au seuil : la teinte est conservée en mélangeant avec blanc
 * ou noir, par pas de 1 %, dans le sens qui demande le moins de changement. Une paire déjà valide est rendue telle quelle.
 */
export function corriger(texte: string, fond: string, seuil: number = SEUIL): string {
  if (rapport(texte, fond) >= seuil) return texte
  let meilleur: { part: number; hex: string } | null = null
  let repli = { ratio: 0, hex: texte }
  for (const cible of ['#FFFFFF', '#000000']) {
    for (let p = 1; p <= 100; p++) {
      const hex = melanger(texte, cible, p / 100)
      const r = rapport(hex, fond)
      if (r > repli.ratio) repli = { ratio: r, hex }
      if (r >= seuil) {
        if (!meilleur || p < meilleur.part) meilleur = { part: p, hex }
        break
      }
    }
  }
  return meilleur ? meilleur.hex : repli.hex
}

export interface ResultatPaire {
  paire: Paire
  rapport: number
  ok: boolean
}

/** Couleur d'un texte d'une paire : enregistrée, ou dérivée (nouvel onglet). */
function texteDe(couleurs: CouleursTheme, cle: Paire['texte'], mode: Mode): string {
  return cle === 'nouvel-onglet-texte' ? textesNouvelOnglet(couleurs['nouvel-onglet-ciel'][mode]).texte : couleurs[cle][mode]
}

export function verifier(couleurs: CouleursTheme, mode: Mode): ResultatPaire[] {
  return PAIRES.map((paire) => {
    const r = rapport(texteDe(couleurs, paire.texte, mode), couleurs[paire.fond][mode])
    return { paire, rapport: r, ok: r >= SEUIL }
  })
}

export interface Ajustement {
  cle: CleCouleur
  avant: string
  apres: string
  ratioAvant: number
  ratioApres: number
}

/**
 * Palette complète d'un mode avec chaque texte des six paires ramené à 4,5:1 (diffusée quand `couleurs.corrigerContraste` est actif),
 * plus la liste des ajustements. L'entrée n'est pas modifiée ; l'autre mode et les fonds restent identiques.
 */
export function corrigerPalette(couleurs: CouleursTheme, mode: Mode): { couleurs: CouleursTheme; ajustements: Ajustement[] } {
  const sortie = Object.fromEntries(
    (Object.keys(couleurs) as CleCouleur[]).map((k) => [k, { ...couleurs[k] }])
  ) as CouleursTheme
  const ajustements: Ajustement[] = []
  for (const { texte, fond } of PAIRES) {
    // Texte dérivé : déjà ramené au seuil à la diffusion, rien à ajuster dans la palette enregistrée.
    if (texte === 'nouvel-onglet-texte') continue
    const avant = couleurs[texte][mode]
    const apres = corriger(avant, couleurs[fond][mode], SEUIL)
    if (apres === avant) continue
    sortie[texte][mode] = apres
    ajustements.push({ cle: texte, avant, apres, ratioAvant: rapport(avant, couleurs[fond][mode]), ratioApres: rapport(apres, couleurs[fond][mode]) })
  }
  return { couleurs: sortie, ajustements }
}
