// Thèmes de Lyra : palettes prêtes, table nom CSS ↔ élément, variables dérivées, import/export (module pur).
import { CLES_COULEUR, COULEURS_INDIGO_NUIT, type CleCouleur, type CouleursTheme, type NomTheme } from './types-reglages'
import { corrigerPalette, corriger, luminance, melanger, SEUIL, type Mode } from './contraste'

export type { CleCouleur, CouleursTheme, NomTheme }

/** Les 13 éléments dans l'ordre du design : nom CSS de la variable et libellé de `Couleurs.dc.html`. */
export const CLES_COULEURS: ReadonlyArray<{ cle: CleCouleur; variable: string; libelle: string }> = [
  { cle: 'ciel-fond', variable: '--ciel', libelle: 'Ciel — fond' },
  { cle: 'ciel-texte', variable: '--ciel-texte', libelle: 'Ciel — texte' },
  { cle: 'etoile-active', variable: '--etoile-active', libelle: 'Étoile active' },
  { cle: 'etoile-active-fond', variable: '--etoile-active-fond', libelle: 'Étoile active — fond' },
  { cle: 'etoiles', variable: '--etoiles', libelle: 'Étoiles' },
  { cle: 'etoiles-endormies', variable: '--etoiles-endormies', libelle: 'Étoiles endormies' },
  { cle: 'lignes', variable: '--lignes', libelle: 'Lignes de constellation' },
  { cle: 'capsule-fond', variable: '--capsule-fond', libelle: 'Capsule — fond' },
  { cle: 'capsule-texte', variable: '--capsule-texte', libelle: 'Capsule — texte' },
  { cle: 'accent', variable: '--accent', libelle: 'Accent' },
  { cle: 'boucliers', variable: '--bouclier', libelle: 'Boucliers' },
  { cle: 'pages-fond', variable: '--page', libelle: 'Pages de Lyra — fond' },
  { cle: 'nouvel-onglet-ciel', variable: '--nouvel-onglet-ciel', libelle: 'Nouvel onglet — ciel' }
]

const NOIR = '#000000'
const BLANC = '#FFFFFF'
const HEX = /^#[0-9A-Fa-f]{6}$/

/** Un ciel est « clair » quand sa luminance dépasse ce seuil : texte, étoiles et lignes passent alors en teintes foncées. */
const SEUIL_CIEL_CLAIR = 0.4

interface Depart {
  ciel: string
  page: string
  texte: string
  /** Thème entièrement sombre (Nuit complète) : le mode clair reprend les valeurs du mode sombre. */
  toujoursSombre?: boolean
}

/** Valeurs d'un mode à partir du ciel, de la page et du texte du design ; le reste est dérivé (voir `docs/design/README.md`). */
function palette(ciel: string, page: string, texte: string, sombre: boolean, texteDuDesign: boolean): Record<CleCouleur, string> {
  const clair = luminance(ciel) > SEUIL_CIEL_CLAIR
  const texteCiel = melanger(ciel, clair ? NOIR : BLANC, 0.8)
  const capsuleFond = sombre ? melanger(ciel, BLANC, 0.04) : page
  return {
    'ciel-fond': ciel,
    'ciel-texte': texteCiel,
    'etoile-active': clair ? '#8A5A10' : '#F4C56A',
    'etoile-active-fond': melanger(ciel, texteCiel, 0.15),
    etoiles: melanger(ciel, clair ? NOIR : BLANC, 0.6),
    'etoiles-endormies': melanger(ciel, texteCiel, 0.3),
    lignes: melanger(ciel, texteCiel, 0.2),
    'capsule-fond': capsuleFond,
    'capsule-texte': sombre && !texteDuDesign ? melanger(capsuleFond, BLANC, 0.9) : texte,
    accent: sombre ? '#8B8AF0' : '#5452C8',
    boucliers: sombre ? '#5FD3B3' : '#1E7F6C',
    'pages-fond': page,
    'nouvel-onglet-ciel': melanger(ciel, NOIR, sombre ? 0.35 : 0.2)
  }
}

/** Construit un thème prêt : clair = valeurs du design, sombre = ciel assombri ; chaque texte des six paires est ensuite ramené à 4,5:1. */
function construire({ ciel, page, texte, toujoursSombre }: Depart): CouleursTheme {
  const cielSombre = toujoursSombre ? ciel : melanger(ciel, NOIR, luminance(ciel) > SEUIL_CIEL_CLAIR ? 0.8 : 0.35)
  const sombre = palette(cielSombre, '#121214', texte, true, !!toujoursSombre)
  const clair = toujoursSombre ? sombre : palette(ciel, page, texte, false, true)
  const brut = Object.fromEntries(CLES_COULEUR.map((k) => [k, { clair: clair[k], sombre: sombre[k] }])) as CouleursTheme
  return corrigerPalette(corrigerPalette(brut, 'clair').couleurs, 'sombre').couleurs
}

export interface Theme {
  nom: string
  couleurs: CouleursTheme
  /** Ciel clair en mode clair : le texte, les étoiles et les lignes du ciel sont foncés. */
  cielClair?: boolean
}

export const THEMES: Record<NomTheme, Theme> = {
  'indigo-nuit': { nom: 'Indigo nuit', couleurs: COULEURS_INDIGO_NUIT },
  encre: { nom: 'Encre', couleurs: construire({ ciel: '#0B0B12', page: '#FFFFFF', texte: '#1C1C2E' }) },
  foret: { nom: 'Forêt', couleurs: construire({ ciel: '#12261F', page: '#FFFFFF', texte: '#1C1C2E' }) },
  sable: { nom: 'Sable', couleurs: construire({ ciel: '#E9DEC8', page: '#FBF7F0', texte: '#3A2E1E' }), cielClair: true },
  aurore: { nom: 'Aurore', couleurs: construire({ ciel: '#2A1540', page: '#FFFFFF', texte: '#1C1C2E' }) },
  'clair-total': { nom: 'Clair total', couleurs: construire({ ciel: '#ECECF3', page: '#FFFFFF', texte: '#1C1C2E' }), cielClair: true },
  'nuit-complete': { nom: 'Nuit complète', couleurs: construire({ ciel: '#0E0E1E', page: '#121214', texte: '#E6E6EA', toujoursSombre: true }) },
  'mes-couleurs': { nom: 'Mes couleurs', couleurs: structuredClone(COULEURS_INDIGO_NUIT) }
}

export function rgbaDe(hex: string, alpha: number): string {
  const n = (i: number): number => parseInt(hex.slice(i, i + 2), 16)
  return `rgba(${n(1)},${n(3)},${n(5)},${alpha})`
}

/** Valeurs de `theme.css` / `Composants.dc.html` en clair pour Indigo nuit : les formules de `deriver` y sont calées (écart par canal). */
const CIBLES_INDIGO_CLAIR: Record<string, string> = {
  '--texte-secondaire': '#6B6B80',
  '--trait': '#E6E6EE',
  '--pilule': '#F3F3F9',
  '--libelles-ciel': '#8E8EBE',
  '--libelles-groupe': '#7F7FB0',
  '--bordure-champ': '#D6D6E2',
  '--separateur': '#EEEEF4',
  '--teinte-accent': '#E6E6F7',
  '--teinte-accent-texte': '#2F2D8A',
  '--texte-doux': '#3A3A50',
  '--survol': '#EEEEF6',
  '--survol-menu': '#F1F1F8',
  '--champ-fond': '#F8F8FC',
  '--texte-discret': '#8A8AA6',
  '--texte-url': '#8A8AA0',
  '--texte-icone': '#4A4A66',
  '--texte-inactif': '#B8B8CC',
  '--piste': '#C9C9D6',
  '--danger-fond': '#FBE9E6',
  '--attention-fond': '#FBEFD8',
  '--attention-texte': '#6B4A10',
  '--succes-fond': '#DDF5EC',
  '--succes-texte': '#146A52',
  '--lien': '#4A48C4',
  '--fenetre-fond': '#E9E9F3',
  '--pilule-discrete': '#8E8EBE',
  '--bouclier-inactif': '#9A9AB0'
}

/** Rouge de « danger » (design, valeur claire) : éclairci par `corriger` quand le fond est sombre. */
const DANGER = '#8E2E22'
/** Jaune des favoris en clair (design) ; en sombre, l'étoile active. */
const FAVORI_CLAIR = '#D99A12'
const ATTENTION_CLAIR = '#8A5A10'
const ATTENTION_SOMBRE = '#F4C56A'

/** Formules brutes (sans calage ni correction) des variables dérivées par mélange. */
function formules(couleurs: CouleursTheme, mode: Mode): Record<string, string> {
  const c = (k: CleCouleur): string => couleurs[k][mode]
  const clair = mode === 'clair'
  const texte = c('capsule-texte')
  const fond = c('capsule-fond')
  const page = c('pages-fond')
  const attention = luminance(page) > SEUIL_CIEL_CLAIR ? ATTENTION_CLAIR : ATTENTION_SOMBRE
  return {
    '--texte-secondaire': melanger(texte, page, 0.38),
    '--trait': melanger(page, texte, 0.08),
    '--pilule': melanger(fond, texte, 0.05),
    '--libelles-ciel': melanger(c('etoiles'), c('ciel-fond'), 0.18),
    '--libelles-groupe': melanger(c('etoiles'), c('ciel-fond'), 0.3),
    '--bordure-champ': melanger(fond, texte, 0.16),
    '--separateur': melanger(page, texte, 0.05),
    '--teinte-accent': melanger(fond, c('accent'), 0.14),
    '--teinte-accent-texte': clair ? melanger(c('accent'), NOIR, 0.4) : c('accent'),
    '--texte-doux': melanger(texte, page, 0.15),
    '--survol': melanger(fond, texte, 0.07),
    '--survol-menu': melanger(fond, texte, 0.05),
    '--champ-fond': melanger(fond, texte, 0.03),
    '--texte-discret': melanger(texte, page, 0.5),
    '--texte-url': melanger(texte, page, 0.5),
    '--texte-icone': melanger(texte, page, 0.3),
    '--texte-inactif': melanger(texte, page, 0.7),
    '--piste': melanger(texte, page, 0.78),
    '--danger-fond': melanger(fond, DANGER, 0.1),
    '--attention-fond': melanger(fond, attention, 0.12),
    '--attention-texte': clair ? melanger(attention, NOIR, 0.3) : attention,
    '--succes-fond': melanger(fond, c('boucliers'), 0.14),
    '--succes-texte': clair ? melanger(c('boucliers'), NOIR, 0.15) : c('boucliers'),
    '--lien': c('accent'),
    '--fenetre-fond': clair ? melanger(page, texte, 0.08) : page,
    '--pilule-discrete': melanger(texte, melanger(fond, texte, 0.05), 0.5),
    '--bouclier-inactif': melanger(texte, page, 0.6)
  }
}

function canaux(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

/** `hex` décalé de l'écart par canal entre `cible` et `reference`. */
function caler(hex: string, reference: string, cible: string): string {
  const [h, r, t] = [canaux(hex), canaux(reference), canaux(cible)]
  return '#' + h.map((v, i) => Math.max(0, Math.min(255, v + t[i] - r[i])).toString(16).padStart(2, '0')).join('').toUpperCase()
}

const REFERENCE_CLAIR = formules(COULEURS_INDIGO_NUIT, 'clair')

/**
 * Variables CSS d'un mode : les 13 éléments (noms de `CLES_COULEURS`) et les variables dérivées utilisées par le reste de l'interface.
 * En clair, les formules sont calées pour retrouver exactement `theme.css` sur Indigo nuit ; texte secondaire (4,5:1 sur la page),
 * libellés du ciel et de groupe (3:1 sur le ciel), textes sur teinte (4,5:1 sur leur teinte) et, en sombre, bordures de champ (3:1 sur la
 * capsule) sont ensuite corrigés pour rester lisibles dans tous les thèmes. « Danger » (rouge) et « attention » (ambre) restent distincts.
 */
export function deriver(couleurs: CouleursTheme, mode: Mode): Record<string, string> {
  const c = (k: CleCouleur): string => couleurs[k][mode]
  const sombre = mode === 'sombre'
  const vars: Record<string, string> = {}
  for (const { cle, variable } of CLES_COULEURS) vars[variable] = c(cle)
  const brut = formules(couleurs, mode)
  const v = (nom: string): string => (mode === 'clair' ? caler(brut[nom], REFERENCE_CLAIR[nom], CIBLES_INDIGO_CLAIR[nom]) : brut[nom])
  const fond = c('capsule-fond')
  vars['--texte'] = c('capsule-texte')
  vars['--texte-secondaire'] = corriger(v('--texte-secondaire'), c('pages-fond'), SEUIL)
  vars['--trait'] = v('--trait')
  vars['--pilule'] = v('--pilule')
  vars['--attention'] = luminance(c('pages-fond')) > SEUIL_CIEL_CLAIR ? ATTENTION_CLAIR : ATTENTION_SOMBRE
  vars['--libelles-ciel'] = corriger(v('--libelles-ciel'), c('ciel-fond'), 3)
  vars['--libelles-groupe'] = corriger(v('--libelles-groupe'), c('ciel-fond'), 3)
  vars['--bouclier-ciel'] = corriger(couleurs.boucliers.sombre, c('ciel-fond'), SEUIL)
  vars['--halo-etoile'] = rgbaDe(c('etoile-active'), 0.7)
  vars['--halo-anneau'] = rgbaDe(c('etoile-active'), 0.22)
  // Teintes des pages Lyra : dérivées du thème dans les deux modes (Indigo nuit en clair = valeurs d'origine de theme.css).
  vars['--bordure-champ'] = sombre ? corriger(v('--bordure-champ'), fond, 3) : v('--bordure-champ')
  vars['--separateur'] = v('--separateur')
  vars['--teinte-accent'] = v('--teinte-accent')
  vars['--teinte-accent-texte'] = corriger(v('--teinte-accent-texte'), vars['--teinte-accent'], SEUIL)
  vars['--texte-doux'] = corriger(v('--texte-doux'), fond, SEUIL)
  vars['--survol'] = v('--survol')
  vars['--survol-menu'] = v('--survol-menu')
  vars['--champ-fond'] = v('--champ-fond')
  vars['--texte-discret'] = corriger(v('--texte-discret'), fond, 3)
  vars['--texte-url'] = corriger(v('--texte-url'), fond, 3)
  vars['--texte-icone'] = corriger(v('--texte-icone'), fond, 3)
  vars['--texte-inactif'] = v('--texte-inactif')
  vars['--piste'] = v('--piste')
  vars['--danger-fond'] = v('--danger-fond')
  vars['--danger'] = corriger(corriger(DANGER, fond, SEUIL), vars['--danger-fond'], SEUIL)
  vars['--attention-fond'] = v('--attention-fond')
  vars['--attention-texte'] = corriger(v('--attention-texte'), vars['--attention-fond'], SEUIL)
  vars['--succes-fond'] = v('--succes-fond')
  vars['--succes-texte'] = corriger(v('--succes-texte'), vars['--succes-fond'], SEUIL)
  vars['--favori'] = sombre ? c('etoile-active') : FAVORI_CLAIR
  vars['--lien'] = corriger(v('--lien'), fond, SEUIL)
  vars['--fenetre-fond'] = v('--fenetre-fond')
  vars['--pilule-discrete'] = sombre ? corriger(v('--pilule-discrete'), vars['--pilule'], 3) : v('--pilule-discrete')
  vars['--bouclier-inactif'] = v('--bouclier-inactif')
  return vars
}

/** Fond du ciel fondu avec la couleur du site (`partPct` % du site) ; sans site ou couleur invalide, le fond inchangé. */
export function etiquetteTeinteSite(base: string, site: string | null, partPct = 18): string {
  if (!site || !HEX.test(site) || !HEX.test(base)) return base
  return melanger(base, site, partPct / 100)
}

export const TAILLE_MAX_THEME = 20 * 1024

/** Sérialise « Mes couleurs » au format d'export `{ nom, couleurs }`. */
export function exporterTheme(nom: string, couleurs: CouleursTheme): string {
  return JSON.stringify({ nom, couleurs }, null, 2)
}

/** Valide un thème importé (objet ou texte JSON) : 13 clés × 2 modes, `#RRGGBB` strict, moins de 20 Ko, aucune clé inconnue. */
export function validerTheme(brut: unknown): { nom: string; couleurs: CouleursTheme } | { erreur: string } {
  let v = brut
  if (typeof brut === 'string') {
    if (new TextEncoder().encode(brut).length >= TAILLE_MAX_THEME) return { erreur: 'Fichier trop gros (20 Ko maximum).' }
    try { v = JSON.parse(brut) } catch { return { erreur: 'Fichier illisible : JSON invalide.' } }
  } else if (v && typeof v === 'object') {
    let taille: number
    try { taille = new TextEncoder().encode(JSON.stringify(v)).length } catch { return { erreur: 'Fichier illisible.' } }
    if (taille >= TAILLE_MAX_THEME) return { erreur: 'Fichier trop gros (20 Ko maximum).' }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { erreur: 'Format attendu : { nom, couleurs }.' }
  const { nom, couleurs } = v as { nom?: unknown; couleurs?: unknown }
  if (typeof nom !== 'string' || !nom.trim()) return { erreur: 'Nom du thème manquant.' }
  if (!couleurs || typeof couleurs !== 'object' || Array.isArray(couleurs)) return { erreur: 'Clé « couleurs » manquante.' }
  const brutes = couleurs as Record<string, unknown>
  for (const k of Object.keys(brutes)) {
    if (!(CLES_COULEUR as readonly string[]).includes(k)) return { erreur: `Clé inconnue : ${k}` }
  }
  const sortie = {} as CouleursTheme
  for (const k of CLES_COULEUR) {
    const e = brutes[k]
    if (e === undefined) return { erreur: `Clé manquante : ${k}` }
    if (!e || typeof e !== 'object' || Array.isArray(e)) return { erreur: `Valeur invalide pour ${k}` }
    const entree = e as Record<string, unknown>
    for (const sous of Object.keys(entree)) if (sous !== 'clair' && sous !== 'sombre') return { erreur: `Clé inconnue : ${k}.${sous}` }
    const modes = {} as { clair: string; sombre: string }
    for (const mode of ['clair', 'sombre'] as const) {
      const hex = entree[mode]
      if (hex === undefined) return { erreur: `Clé manquante : ${k}.${mode}` }
      if (typeof hex !== 'string' || !HEX.test(hex)) return { erreur: `Couleur invalide pour ${k}.${mode} (attendu #RRGGBB).` }
      modes[mode] = hex.toUpperCase()
    }
    sortie[k] = modes
  }
  return { nom: nom.trim(), couleurs: sortie }
}
